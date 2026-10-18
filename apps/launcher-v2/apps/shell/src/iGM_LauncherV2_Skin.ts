/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Skin.ts
 * 所属层：桌面外壳 / 皮肤服务层
 * 路由：全局
 * 模块：iGM_LauncherV2_Skin
 * 作用：皮肤库（本地导入 + Mineskin 上传）与正版档案（皮肤 / 披风 / 模型）能力
 * 内容：皮肤库索引落盘 skins/index.json，纹理 PNG 落盘 skins/<标识>.png；
 *       本地导入仅接受 64x64 与 64x32 的 PNG，先本地落盘再经 Mineskin 换取永久地址；
 *       应用皮肤时按目标离线账号昵称写出 skins/<昵称>.png 并更新 offline.json；
 *       正版档案经 Mojang 会话服务读取 textures 属性，解析皮肤 / 披风地址与模型类型；
 *       远程图片统一由主进程取回并转成 data URL 下发界面，规避 WebView 跨域限制
 * 说明：Mineskin 密钥按交付要求随包内置（见 scripts/iGM_LauncherV2_SyncUi.ts 白名单），
 *       亦可经进程环境变量临时覆盖；
 *       密钥缺失或上传失败时降级为纯本地皮肤，界面如实提示，功能不中断
 */

// 导入依赖 //
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { iGM_LauncherV2_OpenExternal } from "./iGM_LauncherV2_CommunityAuth";
import {
  IGM_LAUNCHERV2_MINESKIN_ENV_KEY,
  IGM_LAUNCHERV2_MINESKIN_UPLOAD_URL,
  IGM_LAUNCHERV2_MOJANG_PROFILE_URL,
  IGM_LAUNCHERV2_MOJANG_SKIN_EDIT_URL,
  IGM_LAUNCHERV2_SKIN_HEIGHT_FULL,
  IGM_LAUNCHERV2_SKIN_HEIGHT_LEGACY,
  IGM_LAUNCHERV2_SKIN_SIZE_WIDTH,
} from "./iGM_LauncherV2_Constants";
import { iGM_LauncherV2_EnvGet } from "./iGM_LauncherV2_Env";
import type { iGM_LauncherV2_SkinEntry, iGM_LauncherV2_SkinProfile } from "./iGM_LauncherV2_Ipc";
import { iGM_LauncherV2_MsaCurrentAccount } from "./iGM_LauncherV2_MicrosoftAuth";
import {
  iGM_LauncherV2_Offline_Current,
  iGM_LauncherV2_Offline_SetSkin,
} from "./iGM_LauncherV2_OfflineAccount";
import {
  iGM_LauncherV2_JsonRead,
  iGM_LauncherV2_JsonWrite,
  iGM_LauncherV2_SkinsDir,
  iGM_LauncherV2_SkinsIndexPath,
} from "./iGM_LauncherV2_Store";

// 类型定义 //

/** 皮肤库索引文件结构 */
interface iGM_LauncherV2_SkinIndexPayload {
  version: number;
  items: iGM_LauncherV2_SkinEntry[];
}

/** 皮肤库列表结果 */
export interface iGM_LauncherV2_SkinLibraryResult {
  items: iGM_LauncherV2_SkinEntry[];
  message: string;
}

/** 皮肤应用结果 */
export interface iGM_LauncherV2_SkinApplyResult {
  applied: boolean;
  /** 应用目标：离线账号昵称 */
  target: string;
  message: string;
}

/** 皮肤纹理取回结果 */
export interface iGM_LauncherV2_SkinTextureResult {
  url: string;
  dataUrl: string;
  message: string;
}

/** 正版档案取回结果 */
export interface iGM_LauncherV2_SkinProfileResult {
  profile: iGM_LauncherV2_SkinProfile | null;
  message: string;
}

/** Mineskin 上传响应：只取所需字段，接口层级可能随版本变化，逐级回退读取 */
interface iGM_LauncherV2_MineskinUploadResponse {
  id?: number;
  uuid?: string;
  variant?: string;
  data?: { texture?: { url?: string } };
  texture?: { url?: string };
  error?: string;
  message?: string;
}

/** Mojang 会话服务档案响应 */
export interface iGM_LauncherV2_MojangProfileResponse {
  id?: string;
  name?: string;
  properties?: Array<{ name?: string; value?: string }>;
}

/** Mojang textures 属性 base64 解码后的结构 */
interface iGM_LauncherV2_MojangTextures {
  textures?: {
    SKIN?: { url?: string; metadata?: { model?: string } };
    CAPE?: { url?: string };
  };
}

// 核心逻辑 //

/** 皮肤库索引结构版本 */
const IGM_LAUNCHERV2_SKIN_INDEX_VERSION = 1;

/** 本地皮肤引用前缀：界面以 local:<标识> 请求读取本地皮肤文件 */
export const IGM_LAUNCHERV2_SKIN_LOCAL_PREFIX = "local:";

/** 确保皮肤库目录存在 */
async function iGM_LauncherV2_SkinEnsureDir(): Promise<void> {
  await mkdir(iGM_LauncherV2_SkinsDir(), { recursive: true });
}

/** 读取皮肤库索引；文件缺失或结构非法时返回空列表 */
async function iGM_LauncherV2_SkinIndex(): Promise<iGM_LauncherV2_SkinEntry[]> {
  const payload = await iGM_LauncherV2_JsonRead<iGM_LauncherV2_SkinIndexPayload>(
    iGM_LauncherV2_SkinsIndexPath(),
  );
  if (!payload || !Array.isArray(payload.items)) return [];
  return payload.items;
}

/** 落盘皮肤库索引 */
async function iGM_LauncherV2_SkinIndexSave(items: iGM_LauncherV2_SkinEntry[]): Promise<void> {
  await iGM_LauncherV2_SkinEnsureDir();
  await iGM_LauncherV2_JsonWrite(iGM_LauncherV2_SkinsIndexPath(), {
    version: IGM_LAUNCHERV2_SKIN_INDEX_VERSION,
    items,
  });
}

/** 本地皮肤文件绝对路径；标识先做白名单过滤，杜绝路径穿越 */
function iGM_LauncherV2_SkinFilePath(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "");
  return join(iGM_LauncherV2_SkinsDir(), `${safe}.png`);
}

/**
 * 解析 PNG 尺寸：校验 PNG 签名后读取 IHDR 的宽高。
 * 仅接受 64x64（含 Alex 变体）与 64x32（旧版经典皮肤），其余一律拒绝。
 */
function iGM_LauncherV2_PngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** 生成条目标识：时间戳 + 随机位，保证文件名唯一且安全 */
function iGM_LauncherV2_SkinId(): string {
  return `iGM_Skin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 清理为可安全落盘的账号名：保留可读性，剔除文件系统保留字符与空白 */
function iGM_LauncherV2_SkinSafeName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
  return cleaned || "iGM_Player";
}

/** 把 http 纹理地址升级为 https（Mojang 档案返回的地址为 http 明文） */
function iGM_LauncherV2_SkinHttps(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^http:\/\//i, "https://");
}

/** 取回图片字节；失败返回 null */
async function iGM_LauncherV2_SkinFetchBytes(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { headers: { accept: "image/*" } });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 0 ? bytes : null;
  } catch (error) {
    console.warn("[iGM CraftCeon Launcher] 皮肤图片下载失败：", url, error);
    return null;
  }
}

/** 取回图片并转 data URL；失败返回 null（界面以 data URL 渲染，规避跨域限制） */
async function iGM_LauncherV2_SkinDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { accept: "image/*" } });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) return null;
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch (error) {
    console.warn("[iGM CraftCeon Launcher] 皮肤纹理取回失败：", url, error);
    return null;
  }
}

/**
 * 上传本地皮肤到 Mineskin 以换取永久地址。
 * 未配置密钥或上传失败时返回 null，由调用方降级为纯本地皮肤。
 */
async function iGM_LauncherV2_MineskinUpload(
  name: string,
  bytes: Buffer,
): Promise<{ remoteUrl: string; mineskinId: string; variant: string } | null> {
  const key = iGM_LauncherV2_EnvGet(IGM_LAUNCHERV2_MINESKIN_ENV_KEY);
  if (!key) {
    console.warn(`[iGM CraftCeon Launcher] 未配置 ${IGM_LAUNCHERV2_MINESKIN_ENV_KEY}，跳过 Mineskin 上传`);
    return null;
  }

  try {
    const form = new FormData();
    // visibility=1 为不公开列出，避免用户导入的皮肤被意外公示
    form.set("visibility", "1");
    form.set("name", name);
    form.set("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), `${name}.png`);

    const response = await fetch(IGM_LAUNCHERV2_MINESKIN_UPLOAD_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      body: form,
    });
    const payload = (await response.json().catch(() => ({}))) as iGM_LauncherV2_MineskinUploadResponse;
    if (!response.ok) {
      console.warn(
        "[iGM CraftCeon Launcher] Mineskin 上传失败：",
        payload.error ?? payload.message ?? `HTTP ${response.status}`,
      );
      return null;
    }

    const remoteUrl = iGM_LauncherV2_SkinHttps(payload.data?.texture?.url ?? payload.texture?.url ?? "");
    const mineskinId = payload.uuid ?? (payload.id ? String(payload.id) : "");
    if (!remoteUrl && !mineskinId) return null;
    return { remoteUrl, mineskinId, variant: payload.variant ?? "" };
  } catch (error) {
    console.warn("[iGM CraftCeon Launcher] Mineskin 上传异常：", error);
    return null;
  }
}

/** 查询皮肤库列表 */
export async function iGM_LauncherV2_Skin_Library(): Promise<iGM_LauncherV2_SkinLibraryResult> {
  return { items: await iGM_LauncherV2_SkinIndex(), message: "" };
}

/**
 * 导入本地皮肤：校验 PNG 尺寸 → 本地落盘 → 上传 Mineskin 换取永久地址 → 入索引。
 * dataBase64 为界面读取文件后的 base64 内容（不含 data URL 前缀）。
 */
export async function iGM_LauncherV2_Skin_Import(
  rawName: string,
  dataBase64: string,
): Promise<iGM_LauncherV2_SkinLibraryResult> {
  const items = await iGM_LauncherV2_SkinIndex();
  const name = rawName.trim() || "未命名皮肤";

  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataBase64, "base64");
  } catch {
    return { items, message: "图片数据解析失败，请重新选择" };
  }

  const size = iGM_LauncherV2_PngSize(bytes);
  if (!size) return { items, message: "仅支持 PNG 图片，请重新选择" };
  if (
    size.width !== IGM_LAUNCHERV2_SKIN_SIZE_WIDTH ||
    (size.height !== IGM_LAUNCHERV2_SKIN_HEIGHT_FULL &&
      size.height !== IGM_LAUNCHERV2_SKIN_HEIGHT_LEGACY)
  ) {
    return { items, message: `皮肤尺寸须为 64x64 或 64x32，当前为 ${size.width}x${size.height}` };
  }

  const id = iGM_LauncherV2_SkinId();
  await iGM_LauncherV2_SkinEnsureDir();
  await writeFile(iGM_LauncherV2_SkinFilePath(id), bytes);

  const uploaded = await iGM_LauncherV2_MineskinUpload(name, bytes);
  const entry: iGM_LauncherV2_SkinEntry = {
    id,
    name,
    remoteUrl: uploaded?.remoteUrl ?? "",
    mineskinId: uploaded?.mineskinId ?? "",
    model: uploaded?.variant === "slim" ? "slim" : "classic",
    source: uploaded ? "mineskin" : "local",
    createdAt: new Date().toISOString(),
  };

  const next = [entry, ...items];
  await iGM_LauncherV2_SkinIndexSave(next);
  return {
    items: next,
    message: uploaded
      ? "已导入并上传 Mineskin，取得永久皮肤地址"
      : "已导入本地皮肤；未配置 Mineskin 密钥或上传失败，仅本地可用",
  };
}

/** 从皮肤库移除条目并删除本地皮肤文件 */
export async function iGM_LauncherV2_Skin_Remove(
  id: string,
): Promise<iGM_LauncherV2_SkinLibraryResult> {
  const items = await iGM_LauncherV2_SkinIndex();
  if (!items.some((item) => item.id === id)) return { items, message: "该皮肤不存在" };

  const next = items.filter((item) => item.id !== id);
  await iGM_LauncherV2_SkinIndexSave(next);
  await rm(iGM_LauncherV2_SkinFilePath(id), { force: true }).catch(() => undefined);
  return { items: next, message: "已从皮肤库移除" };
}

/**
 * 应用皮肤到当前离线账号。
 * id 为皮肤库条目（复制本地文件），skinUrl 为外部皮肤地址（下载后写入）；
 * 落地文件为 skins/<离线账号昵称>.png，并同步更新 offline.json 的 skin 字段。
 * 正版账号不支持一键应用，由界面引导前往官网更换。
 */
export async function iGM_LauncherV2_Skin_Apply(params: {
  id?: string;
  skinUrl?: string;
}): Promise<iGM_LauncherV2_SkinApplyResult> {
  const account = await iGM_LauncherV2_Offline_Current();
  if (!account) {
    return { applied: false, target: "", message: "请先在离线账号中添加一个账号，再应用皮肤" };
  }

  let bytes: Buffer | null = null;
  if (params.id) {
    const items = await iGM_LauncherV2_SkinIndex();
    if (!items.some((item) => item.id === params.id)) {
      return { applied: false, target: account.name, message: "该皮肤已不在皮肤库中" };
    }
    bytes = await readFile(iGM_LauncherV2_SkinFilePath(params.id)).catch(() => null);
  } else if (params.skinUrl) {
    bytes = await iGM_LauncherV2_SkinFetchBytes(params.skinUrl);
  }

  if (!bytes || bytes.length === 0) {
    return { applied: false, target: account.name, message: "皮肤文件读取失败，请重新选择" };
  }

  const fileName = `${iGM_LauncherV2_SkinSafeName(account.name)}.png`;
  await iGM_LauncherV2_SkinEnsureDir();
  await writeFile(join(iGM_LauncherV2_SkinsDir(), fileName), bytes);
  await iGM_LauncherV2_Offline_SetSkin(account.id, fileName);
  return {
    applied: true,
    target: account.name,
    message: `已应用到离线账号「${account.name}」；需配合 CustomSkinLoader 等皮肤模组在游戏中生效`,
  };
}

/**
 * 取回皮肤纹理为 data URL。
 * url 为 local:<标识> 时读取本地皮肤文件（离线可用），否则按远程地址取回。
 */
export async function iGM_LauncherV2_Skin_Texture(
  url: string,
): Promise<iGM_LauncherV2_SkinTextureResult> {
  if (!url) return { url, dataUrl: "", message: "缺少皮肤地址" };

  if (url.startsWith(IGM_LAUNCHERV2_SKIN_LOCAL_PREFIX)) {
    const id = url.slice(IGM_LAUNCHERV2_SKIN_LOCAL_PREFIX.length);
    const bytes = await readFile(iGM_LauncherV2_SkinFilePath(id)).catch(() => null);
    if (!bytes) return { url, dataUrl: "", message: "本地皮肤文件已丢失，请重新导入" };
    return { url, dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, message: "" };
  }

  const dataUrl = await iGM_LauncherV2_SkinDataUrl(url);
  if (!dataUrl) return { url, dataUrl: "", message: "皮肤纹理取回失败，请检查网络后重试" };
  return { url, dataUrl, message: "" };
}

/**
 * 解析 Mojang 档案响应为纹理视图。
 * textures 属性为 base64 编码的 JSON，其中 SKIN 携带地址与 model 元数据，
 * CAPE 携带披风地址；地址一律升级为 https 以规避明文请求被拦截。
 * 独立成纯函数便于直接以真实响应自检，不依赖本地已绑定的账号。
 */
export function iGM_LauncherV2_SkinParseProfile(
  payload: iGM_LauncherV2_MojangProfileResponse,
  fallbackName: string,
  fallbackUuid: string,
): iGM_LauncherV2_SkinProfile | null {
  const encoded = payload.properties?.find((item) => item.name === "textures")?.value ?? "";
  if (!encoded) return null;

  const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as
    | iGM_LauncherV2_MojangTextures
    | null;
  const skin = decoded?.textures?.SKIN;
  const cape = decoded?.textures?.CAPE;

  return {
    name: payload.name ?? fallbackName,
    uuid: fallbackUuid,
    model: skin?.metadata?.model === "slim" ? "slim" : "classic",
    skinUrl: iGM_LauncherV2_SkinHttps(skin?.url ?? ""),
    capeUrl: iGM_LauncherV2_SkinHttps(cape?.url ?? ""),
  };
}

/** 读取已绑定正版账号的档案纹理（皮肤 / 披风 / 模型） */
export async function iGM_LauncherV2_Skin_Profile(): Promise<iGM_LauncherV2_SkinProfileResult> {
  const account = iGM_LauncherV2_MsaCurrentAccount();
  if (!account) return { profile: null, message: "尚未绑定微软正版账号" };

  try {
    const endpoint = `${IGM_LAUNCHERV2_MOJANG_PROFILE_URL}/${account.uuid.replace(/-/g, "")}`;
    const response = await fetch(endpoint, { headers: { accept: "application/json" } });
    if (!response.ok) {
      return { profile: null, message: `正版档案获取失败（HTTP ${response.status}）` };
    }

    const payload = (await response.json().catch(() => ({}))) as iGM_LauncherV2_MojangProfileResponse;
    const profile = iGM_LauncherV2_SkinParseProfile(payload, account.name, account.uuid);
    if (!profile) return { profile: null, message: "该账号暂无可用皮肤纹理信息" };
    return { profile, message: "" };
  } catch (error) {
    return { profile: null, message: error instanceof Error ? error.message : "正版档案获取失败" };
  }
}

/** 用系统默认浏览器打开正版更换皮肤官网 */
export async function iGM_LauncherV2_Skin_OpenOfficial(): Promise<boolean> {
  return iGM_LauncherV2_OpenExternal(IGM_LAUNCHERV2_MOJANG_SKIN_EDIT_URL);
}

// 导出 //
export default iGM_LauncherV2_Skin_Library;
