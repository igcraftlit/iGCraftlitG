/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_OfflineAccount.ts
 * 所属层：桌面外壳 / 账号管理层
 * 路由：全局
 * 模块：iGM_LauncherV2_OfflineAccount
 * 作用：离线账号的创建、列表与当前账号切换
 * 内容：UUID 由 `OfflinePlayer:<昵称>` 的 MD5 摘要按 RFC 4122 版本 3 改写位后
 *       格式化为标准 8-4-4-4-12 形态（与 Minecraft 离线模式推导结果一致）；
 *       支持添加多个离线账号并在列表中一键切换当前账号；
 *       列表与当前项落盘 offline.json，条目可记录已应用的皮肤文件名；
 *       新增 / 切换 / 删除离线账号时同步更新设置中的全局当前账号（currentAccount），
 *       使离线账号与正版账号共用同一套「当前激活账号」语义；
 *       皮肤写入本地皮肤库目录由 iGM_LauncherV2_Skin 负责，此处只做配置更新
 * 说明：离线 UUID 仅用于单机 / 离线登录，不具备正版身份，界面须如实标注
 */

// 导入依赖 //
import { createHash } from "node:crypto";
import type { iGM_LauncherV2_OfflineAccount } from "./iGM_LauncherV2_Ipc";
import {
  iGM_LauncherV2_CurrentAccountGet,
  iGM_LauncherV2_CurrentAccountSet,
} from "./iGM_LauncherV2_Paths";
import {
  iGM_LauncherV2_JsonRead,
  iGM_LauncherV2_JsonWrite,
  iGM_LauncherV2_OfflineStorePath,
} from "./iGM_LauncherV2_Store";

// 类型定义 //

/** offline.json 文件结构 */
interface iGM_LauncherV2_OfflineFilePayload {
  version: number;
  currentId: string;
  items: iGM_LauncherV2_OfflineAccount[];
}

/** 离线账号列表快照 */
export interface iGM_LauncherV2_OfflineListResult {
  items: iGM_LauncherV2_OfflineAccount[];
  currentId: string;
}

// 核心逻辑 //

/** 当前结构版本 */
const IGM_LAUNCHERV2_OFFLINE_VERSION = 1;

/** 昵称长度上限（与 Minecraft 用户名上限一致） */
const IGM_LAUNCHERV2_OFFLINE_NAME_MAX = 16;

/** 每位用户可创建的离线账号数量上限 */
export const IGM_LAUNCHERV2_OFFLINE_LIMIT = 5;

/**
 * 由昵称推导离线 UUID。
 * 与 Minecraft 离线模式一致：摘要输入为 `OfflinePlayer:<昵称>`，UTF-8 编码后取 MD5，
 * 并按 RFC 4122 名称型 UUID（版本 3）改写字节位——第 7 字节高半字节固定为 3，
 * 第 9 字节高两位固定为 10；最后按 8-4-4-4-12 插入连字符输出标准 UUID 文本。
 */
export function iGM_LauncherV2_OfflineUuid(name: string): string {
  const digest = createHash("md5").update(`OfflinePlayer:${name}`, "utf8").digest("hex");
  const chars = digest.split("");

  // 版本位（第 7 字节的高半字节，对应十六进制第 13 位）
  chars[12] = "3";

  // 变体位（第 9 字节的高两位，对应十六进制第 17 位）
  chars[16] = ((Number.parseInt(chars[16], 16) & 0b0011) | 0b1000).toString(16);

  const hex = chars.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** 条目标识：昵称（小写），避免同名重复 */
function iGM_LauncherV2_OfflineId(name: string): string {
  return name.toLowerCase();
}

/** 读取落盘状态 */
async function iGM_LauncherV2_OfflineState(): Promise<iGM_LauncherV2_OfflineFilePayload> {
  const payload = await iGM_LauncherV2_JsonRead<iGM_LauncherV2_OfflineFilePayload>(
    iGM_LauncherV2_OfflineStorePath(),
  );
  if (!payload || !Array.isArray(payload.items)) {
    return { version: IGM_LAUNCHERV2_OFFLINE_VERSION, currentId: "", items: [] };
  }
  return payload;
}

/** 落盘状态 */
async function iGM_LauncherV2_OfflineSave(
  state: iGM_LauncherV2_OfflineFilePayload,
): Promise<void> {
  await iGM_LauncherV2_JsonWrite(iGM_LauncherV2_OfflineStorePath(), state);
}

/** 列表查询 */
export async function iGM_LauncherV2_Offline_List(): Promise<iGM_LauncherV2_OfflineListResult> {
  const state = await iGM_LauncherV2_OfflineState();
  return { items: state.items, currentId: state.currentId };
}

/** 新增离线账号：昵称必填且不重复，成功后自动设为当前账号 */
export async function iGM_LauncherV2_Offline_Add(
  rawName: string,
): Promise<iGM_LauncherV2_OfflineListResult & { added: boolean; message: string }> {
  const name = rawName.trim();
  const state = await iGM_LauncherV2_OfflineState();

  if (!name) {
    return { items: state.items, currentId: state.currentId, added: false, message: "请输入账号昵称" };
  }
  if (name.length > IGM_LAUNCHERV2_OFFLINE_NAME_MAX) {
    return {
      items: state.items,
      currentId: state.currentId,
      added: false,
      message: `昵称不能超过 ${IGM_LAUNCHERV2_OFFLINE_NAME_MAX} 个字符`,
    };
  }
  if (state.items.some((item) => item.id === iGM_LauncherV2_OfflineId(name))) {
    return { items: state.items, currentId: state.currentId, added: false, message: "该昵称已存在" };
  }
  if (state.items.length >= IGM_LAUNCHERV2_OFFLINE_LIMIT) {
    return {
      items: state.items,
      currentId: state.currentId,
      added: false,
      message: `最多只能创建 ${IGM_LAUNCHERV2_OFFLINE_LIMIT} 个离线账号`,
    };
  }

  const entry: iGM_LauncherV2_OfflineAccount = {
    id: iGM_LauncherV2_OfflineId(name),
    name,
    uuid: iGM_LauncherV2_OfflineUuid(name),
  };
  const items = [...state.items, entry];
  await iGM_LauncherV2_OfflineSave({
    version: IGM_LAUNCHERV2_OFFLINE_VERSION,
    currentId: entry.id,
    items,
  });
  // 新增即设为全局当前账号，用户无需再手动点选
  await iGM_LauncherV2_CurrentAccountSet("offline", entry.id);
  return { items, currentId: entry.id, added: true, message: "" };
}

/** 删除离线账号：删除当前账号时回落为列表首项，并同步全局当前账号 */
export async function iGM_LauncherV2_Offline_Remove(
  id: string,
): Promise<iGM_LauncherV2_OfflineListResult> {
  const state = await iGM_LauncherV2_OfflineState();
  const items = state.items.filter((item) => item.id !== id);
  const currentId =
    state.currentId === id || !items.some((item) => item.id === state.currentId)
      ? (items[0]?.id ?? "")
      : state.currentId;
  await iGM_LauncherV2_OfflineSave({ version: IGM_LAUNCHERV2_OFFLINE_VERSION, currentId, items });

  // 被删除的账号若正是全局当前账号，则回落为新的 currentId；没有账号时清空选择
  const active = iGM_LauncherV2_CurrentAccountGet();
  if (active.kind === "offline" && active.id === id) {
    await iGM_LauncherV2_CurrentAccountSet(currentId ? "offline" : "", currentId);
  }
  return { items, currentId };
}

/** 切换当前使用的离线账号，并同步全局当前账号 */
export async function iGM_LauncherV2_Offline_Select(
  id: string,
): Promise<iGM_LauncherV2_OfflineListResult> {
  const state = await iGM_LauncherV2_OfflineState();
  if (!state.items.some((item) => item.id === id)) return iGM_LauncherV2_Offline_List();

  await iGM_LauncherV2_OfflineSave({
    version: IGM_LAUNCHERV2_OFFLINE_VERSION,
    currentId: id,
    items: state.items,
  });
  await iGM_LauncherV2_CurrentAccountSet("offline", id);
  return { items: state.items, currentId: id };
}

/**
 * 按标识查找离线账号。
 * 启动游戏时以设置里的 currentAccount.id 为准定位账号，不复用 offline.json 的 currentId，
 * 避免「界面选中的账号」与「离线文件里的当前账号」出现分歧。
 */
export async function iGM_LauncherV2_Offline_ById(
  id: string,
): Promise<iGM_LauncherV2_OfflineAccount | null> {
  const state = await iGM_LauncherV2_OfflineState();
  return state.items.find((item) => item.id === id) ?? null;
}

/** 当前使用的离线账号；没有任何账号时返回 null（皮肤应用的目标对象） */
export async function iGM_LauncherV2_Offline_Current(): Promise<iGM_LauncherV2_OfflineAccount | null> {
  const state = await iGM_LauncherV2_OfflineState();
  const index = state.items.findIndex((item) => item.id === state.currentId);
  const found = index >= 0 ? state.items[index] : undefined;
  return found ?? null;
}

/** 记录某离线账号已应用的皮肤文件名；账号不存在时原样返回当前列表 */
export async function iGM_LauncherV2_Offline_SetSkin(
  id: string,
  skin: string,
): Promise<iGM_LauncherV2_OfflineListResult> {
  const state = await iGM_LauncherV2_OfflineState();
  if (!state.items.some((item) => item.id === id)) return iGM_LauncherV2_Offline_List();

  const items = state.items.map((item) => (item.id === id ? { ...item, skin } : item));
  await iGM_LauncherV2_OfflineSave({
    version: IGM_LAUNCHERV2_OFFLINE_VERSION,
    currentId: state.currentId,
    items,
  });
  return { items, currentId: state.currentId };
}
