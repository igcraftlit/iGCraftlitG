/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_VersionFilesService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Minecraft
 * 模块：iGM_VersionFilesService
 * 作用：按官方目录规则派生 Minecraft 版本的安装清单（文本文件内容 + 二进制下载文件），
 *       供启动器「清单来自本站、文件字节直连官方 CDN」模式使用
 * 内容：官方版本清单与版本 json 拉取、客户端 jar、依赖库（含 natives 分类器）、
 *       资源索引与资源对象、Fabric 加载器 profile 与其依赖库；
 *       带 User-Agent / 20s 超时 / 指数退避重试的上游 JSON 请求
 * 说明：仅派生清单，不落盘、不写数据库；path 一律为相对共享 .minecraft 根目录的
 *       POSIX 风格相对路径；上游失败统一抛 iGM_GameError，不向客户端暴露原始错误
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_GameError } from "./iGM_GameDownloadService";

// 类型定义 //
/** 需要原样写入磁盘的文本文件 */
export interface iGM_VersionFileText {
  path: string;
  content: string;
}

/** 需要从官方 CDN 下载的二进制文件 */
export interface iGM_VersionFileEntry {
  url: string;
  path: string;
  size: number;
  sha1: string;
}

/** 版本文件清单数据 */
export interface iGM_VersionFilesData {
  version: string;
  /** vanilla 原版 / fabric Fabric */
  loader: string;
  /** 实际解析到的加载器版本；原版为空串 */
  loaderVersion: string;
  /** 版本目录名：原版为 <version>，Fabric 为 <version>-fabric */
  versionId: string;
  texts: iGM_VersionFileText[];
  files: iGM_VersionFileEntry[];
  counts: { files: number; bytes: number };
}

/** 官方版本清单单条记录 */
interface iGM_VersionFilesManifestVersion {
  id: string;
  url: string;
}

/** 官方版本清单 */
interface iGM_VersionFilesManifest {
  versions?: iGM_VersionFilesManifestVersion[];
}

/** 依赖库规则 */
interface iGM_VersionFilesLibraryRule {
  action: string;
  os?: { name?: string };
}

/** 依赖库下载项 */
interface iGM_VersionFilesLibraryDownload {
  path?: string;
  url?: string;
  sha1?: string;
  size?: number;
}

/** 依赖库条目（官方版本 json 与 Fabric profile 共用形状） */
interface iGM_VersionFilesLibrary {
  name: string;
  url?: string;
  rules?: iGM_VersionFilesLibraryRule[];
  natives?: Record<string, string>;
  downloads?: {
    artifact?: iGM_VersionFilesLibraryDownload;
    classifiers?: Record<string, iGM_VersionFilesLibraryDownload>;
  };
}

/** 版本 json 中本模块关心的字段 */
interface iGM_VersionFilesVersionJson {
  downloads?: { client?: iGM_VersionFilesLibraryDownload };
  libraries?: iGM_VersionFilesLibrary[];
  assetIndex?: { id?: string; url?: string };
}

/** 资源索引中的单个对象 */
interface iGM_VersionFilesAssetObject {
  hash: string;
  size?: number;
}

/** 资源索引 */
interface iGM_VersionFilesAssetIndex {
  objects?: Record<string, iGM_VersionFilesAssetObject>;
}

/** Fabric Loader 版本列表单条记录 */
interface iGM_VersionFilesFabricLoaderItem {
  loader?: { version?: string };
}

/** Fabric profile */
interface iGM_VersionFilesFabricProfile {
  libraries?: iGM_VersionFilesLibrary[];
  [key: string]: unknown;
}

/** 清单派生入参 */
export interface iGM_VersionFilesInput {
  version: string;
  /** vanilla / fabric，缺省按 vanilla 处理 */
  loader?: string;
  /** Fabric Loader 版本；缺省取官方列表首个 */
  loaderVersion?: string;
}

// 核心逻辑 //
/** 上游请求标识（Mojang / Fabric 均要求可识别调用方） */
const iGM_VersionFilesUserAgent =
  "iGM-CraftCeon/1.0 (contact: igcraftlit@outlook.com)";
/** 上游请求超时（毫秒） */
const iGM_VersionFilesTimeoutMs = 20000;
/** 上游请求最大尝试次数（含首次） */
const iGM_VersionFilesRetries = 3;
/** 版本清单兜底地址（主地址不可用时使用） */
const iGM_VersionFilesManifestFallback =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

/** 休眠指定毫秒 */
function iGM_VersionFilesSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 当前平台对应的官方 os 名（用于依赖库 rules 判定） */
function iGM_VersionFilesOsName(): string {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

/**
 * 依赖库 rules 判定：无 rules 视为允许；
 * 逐条匹配当前平台，最后一条命中规则决定允许与否（与官方启动器一致）。
 */
function iGM_VersionFilesAllowRules(
  rules?: iGM_VersionFilesLibraryRule[],
): boolean {
  if (!rules || rules.length === 0) return true;
  const osName = iGM_VersionFilesOsName();
  let allowed = false;
  for (const rule of rules) {
    const matched = !rule.os?.name || rule.os.name === osName;
    if (matched) allowed = rule.action === "allow";
  }
  return allowed;
}

/** 由 maven 坐标推导仓库相对路径：group:artifact:version[:classifier] */
function iGM_VersionFilesMavenPath(name: string): string {
  const [group, artifact, version, classifier] = name.split(":");
  const groupPath = (group ?? "").replace(/\./g, "/");
  const suffix = classifier ? `-${classifier}` : "";
  return `${groupPath}/${artifact}/${version}/${artifact}-${version}${suffix}.jar`;
}

/** 校验相对路径合法（禁止绝对路径与越界段，确保前端越界校验恒可通过） */
function iGM_VersionFilesSafePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  return path
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** 序列化文本文件内容（可读缩进） */
function iGM_VersionFilesStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** 带超时与指数退避重试的上游 JSON 请求；失败统一抛业务错误 */
async function iGM_VersionFilesFetchJson<T>(
  url: string,
  errorKey: string,
): Promise<T> {
  for (let attempt = 1; attempt <= iGM_VersionFilesRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": iGM_VersionFilesUserAgent },
        signal: AbortSignal.timeout(iGM_VersionFilesTimeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch {
      if (attempt < iGM_VersionFilesRetries) {
        // 指数退避：400ms / 800ms
        await iGM_VersionFilesSleep(400 * 2 ** (attempt - 1));
      }
    }
  }
  throw new iGM_GameError(errorKey, 502);
}

/** 拉取官方版本清单（主地址失败时回退 piston-meta） */
async function iGM_VersionFilesFetchManifest(): Promise<iGM_VersionFilesManifest> {
  const primary = iGM_Config.game.manifestUrl;
  try {
    return await iGM_VersionFilesFetchJson<iGM_VersionFilesManifest>(
      primary,
      "game.errors.manifestFailed",
    );
  } catch (error) {
    if (primary === iGM_VersionFilesManifestFallback) throw error;
    return await iGM_VersionFilesFetchJson<iGM_VersionFilesManifest>(
      iGM_VersionFilesManifestFallback,
      "game.errors.manifestFailed",
    );
  }
}

/** 依赖库条目转下载文件（含 natives 分类器） */
function iGM_VersionFilesLibraryItems(
  libraries: iGM_VersionFilesLibrary[] | undefined,
): iGM_VersionFileEntry[] {
  const items: iGM_VersionFileEntry[] = [];
  const osName = iGM_VersionFilesOsName();
  for (const library of libraries ?? []) {
    if (!iGM_VersionFilesAllowRules(library.rules)) continue;

    const artifact = library.downloads?.artifact;
    if (artifact?.url) {
      items.push({
        url: artifact.url,
        path: `libraries/${
          artifact.path ?? iGM_VersionFilesMavenPath(library.name)
        }`,
        size: artifact.size ?? 0,
        sha1: artifact.sha1 ?? "",
      });
    } else if (library.url && library.name) {
      // 早期版本与 Fabric 依赖库只有 maven 仓库基址，按坐标拼路径
      const relativePath = iGM_VersionFilesMavenPath(library.name);
      items.push({
        url: `${library.url.replace(/\/+$/, "")}/${relativePath}`,
        path: `libraries/${relativePath}`,
        size: 0,
        sha1: "",
      });
    }

    // natives 分类器：按当前平台取对应 classifier
    const classifierKey = library.natives?.[osName];
    const classifier = classifierKey
      ? library.downloads?.classifiers?.[classifierKey]
      : undefined;
    if (classifier?.url) {
      items.push({
        url: classifier.url,
        path: `libraries/${
          classifier.path ?? iGM_VersionFilesMavenPath(library.name)
        }`,
        size: classifier.size ?? 0,
        sha1: classifier.sha1 ?? "",
      });
    }
  }
  return items;
}

/** 资源对象转下载文件：官方 CDN <前缀>/<sha1 前两位>/<sha1> */
function iGM_VersionFilesAssetItems(
  index: iGM_VersionFilesAssetIndex,
): iGM_VersionFileEntry[] {
  const items: iGM_VersionFileEntry[] = [];
  for (const object of Object.values(index.objects ?? {})) {
    const hash = object.hash;
    if (!hash || hash.length < 2) continue;
    const prefix = hash.slice(0, 2);
    items.push({
      url: `${iGM_Config.game.assetBaseUrl}/${prefix}/${hash}`,
      path: `assets/objects/${prefix}/${hash}`,
      size: object.size ?? 0,
      sha1: hash,
    });
  }
  return items;
}

/** 解析 Fabric Loader 版本：优先请求值（须在官方列表中），否则取列表首个 */
async function iGM_VersionFilesResolveFabricLoader(
  version: string,
  requested?: string,
): Promise<string> {
  const list = await iGM_VersionFilesFetchJson<
    iGM_VersionFilesFabricLoaderItem[]
  >(
    `${iGM_Config.game.fabricMetaUrl}/versions/loader/${encodeURIComponent(
      version,
    )}`,
    "game.errors.fabricUnreachable",
  );
  const versions = (Array.isArray(list) ? list : [])
    .map((item) => item?.loader?.version ?? "")
    .filter((value) => value.length > 0);
  const wanted = (requested ?? "").trim();
  if (wanted && versions.includes(wanted)) return wanted;
  const first = versions[0];
  if (!first) throw new iGM_GameError("game.errors.fabricLoaderEmpty", 502);
  return first;
}

/** 过滤非法路径并按 path 去重（同路径以先出现者为准） */
function iGM_VersionFilesDedupe(
  files: iGM_VersionFileEntry[],
): iGM_VersionFileEntry[] {
  const seen = new Map<string, iGM_VersionFileEntry>();
  for (const file of files) {
    if (!iGM_VersionFilesSafePath(file.path)) continue;
    if (!seen.has(file.path)) seen.set(file.path, file);
  }
  return [...seen.values()];
}

/**
 * 派生版本文件清单
 * 1) 拉取官方版本清单定位目标版本，取得版本 json；
 * 2) texts 写入原版版本 json；
 * 3) files 加入客户端 jar 与依赖库（含 natives）；
 * 4) 拉取资源索引，texts 写入索引 json，files 加入全部资源对象；
 * 5) Fabric 时解析 Loader 版本，写入 profile json 并加入其依赖库。
 */
export async function iGM_BuildVersionFiles(
  input: iGM_VersionFilesInput,
): Promise<iGM_VersionFilesData> {
  const version = (input.version ?? "").trim();
  if (!version) throw new iGM_GameError("game.errors.versionRequired", 400);
  if (
    version.includes("/") ||
    version.includes("\\") ||
    version.includes("..")
  ) {
    throw new iGM_GameError("game.errors.versionNotFound", 404);
  }
  const loader = input.loader === "fabric" ? "fabric" : "vanilla";

  const manifest = await iGM_VersionFilesFetchManifest();
  const entry = (manifest.versions ?? []).find((item) => item.id === version);
  if (!entry?.url) {
    throw new iGM_GameError("game.errors.versionNotInManifest", 404);
  }
  const versionJson =
    await iGM_VersionFilesFetchJson<iGM_VersionFilesVersionJson>(
      entry.url,
      "game.errors.versionJsonFailed",
    );

  const texts: iGM_VersionFileText[] = [];
  const files: iGM_VersionFileEntry[] = [];

  // 原版版本 json 落盘（加载器 profile 依赖它）
  texts.push({
    path: `versions/${version}/${version}.json`,
    content: iGM_VersionFilesStringify(versionJson),
  });

  // 客户端 jar
  const client = versionJson.downloads?.client;
  if (client?.url) {
    files.push({
      url: client.url,
      path: `versions/${version}/${version}.jar`,
      size: client.size ?? 0,
      sha1: client.sha1 ?? "",
    });
  }

  // 依赖库（含 natives 分类器）
  files.push(...iGM_VersionFilesLibraryItems(versionJson.libraries));

  // 资源索引与资源对象
  const assetIndexRef = versionJson.assetIndex;
  if (assetIndexRef?.url && assetIndexRef.id) {
    const assetIndex =
      await iGM_VersionFilesFetchJson<iGM_VersionFilesAssetIndex>(
        assetIndexRef.url,
        "game.errors.versionJsonFailed",
      );
    texts.push({
      path: `assets/indexes/${assetIndexRef.id}.json`,
      content: iGM_VersionFilesStringify(assetIndex),
    });
    files.push(...iGM_VersionFilesAssetItems(assetIndex));
  }

  const versionId = loader === "fabric" ? `${version}-fabric` : version;
  let loaderVersion = "";
  if (loader === "fabric") {
    const resolved = await iGM_VersionFilesResolveFabricLoader(
      version,
      input.loaderVersion,
    );
    loaderVersion = resolved;
    const profile =
      await iGM_VersionFilesFetchJson<iGM_VersionFilesFabricProfile>(
        `${iGM_Config.game.fabricMetaUrl}/versions/loader/${encodeURIComponent(
          version,
        )}/${encodeURIComponent(resolved)}/profile/json`,
        "game.errors.fabricProfileInvalid",
      );
    // 版本目录名统一为 <version>-fabric，json 内回填 id 与 inheritsFrom 便于扫描识别
    const profileJson: iGM_VersionFilesFabricProfile = {
      ...profile,
      id: versionId,
      inheritsFrom: version,
    };
    texts.push({
      path: `versions/${versionId}/${versionId}.json`,
      content: iGM_VersionFilesStringify(profileJson),
    });
    files.push(...iGM_VersionFilesLibraryItems(profile.libraries));
  }

  const safeTexts = texts.filter((item) => iGM_VersionFilesSafePath(item.path));
  const safeFiles = iGM_VersionFilesDedupe(files);
  const bytes = safeFiles.reduce((sum, item) => sum + (item.size || 0), 0);

  return {
    version,
    loader,
    loaderVersion,
    versionId,
    texts: safeTexts,
    files: safeFiles,
    counts: { files: safeFiles.length, bytes },
  };
}

// 导出 //
export default {
  iGM_BuildVersionFiles,
};