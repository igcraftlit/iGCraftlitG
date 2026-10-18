/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Market.ts
 * 所属层：桌面外壳 / 资源市场代理层
 * 路由：全局
 * 模块：iGM_LauncherV2_Market
 * 作用：资源市场检索与详情代理：聚合 Modrinth（免密钥）与 CurseForge（携带密钥）两个数据源
 * 内容：按资源分类（模组 mods / 光影 shaders / 材质包 resourcepacks / 整合包 modpacks / 地图 worlds）
 *       与加载器（全部 / Fabric / Forge / NeoForge）拼装检索请求；
 *       Modrinth 以 facets 过滤（project_type + categories:加载器），
 *       CurseForge 以 classId 分类 + modLoaderType 过滤；
 *       结果统一归一化为界面可直接渲染的条目视图（图标 / 名称 / 作者 / 下载量 / 加载器标签 / MC 版本）；
 *       详情接口返回纯文本简介与首选下载文件（地址 + 文件名 + 大小）
 * 说明：CurseForge 密钥由 .env 的 IGM_CURSEFORGE_API_KEY 提供，仅主进程持有，绝不下发界面；
 *       网络异常一律降级为可读文案，不抛出异常
 */

// 导入依赖 //
import {
  IGM_LAUNCHERV2_CURSEFORGE_ENV_KEY,
  IGM_LAUNCHERV2_CURSEFORGE_MOD_URL,
  IGM_LAUNCHERV2_CURSEFORGE_SEARCH_URL,
  IGM_LAUNCHERV2_MARKET_USER_AGENT,
  IGM_LAUNCHERV2_MODRINTH_PROJECT_URL,
  IGM_LAUNCHERV2_MODRINTH_SEARCH_URL,
} from "./iGM_LauncherV2_Constants";
import { iGM_LauncherV2_EnvGet } from "./iGM_LauncherV2_Env";

// 类型定义 //

/** 资源市场数据源 */
export type iGM_LauncherV2_MarketSource = "modrinth" | "curseforge";

/** 资源分类（与界面筛选栏一一对应） */
export type iGM_LauncherV2_MarketCategory =
  | "mods"
  | "shaders"
  | "resourcepacks"
  | "modpacks"
  | "worlds";

/** 加载器筛选：all 表示不过滤 */
export type iGM_LauncherV2_MarketLoader = "all" | "fabric" | "forge" | "neoforge";

/** 市场检索单条结果（界面列表卡片视图） */
export interface iGM_LauncherV2_MarketItem {
  /** 数据源内唯一标识（Modrinth 为 project_id / slug，CurseForge 为 modId） */
  id: string;
  source: iGM_LauncherV2_MarketSource;
  /** 名称 */
  name: string;
  /** 作者（多人时以逗号连接） */
  author: string;
  /** 一句话简介 */
  description: string;
  /** 图标地址；缺失为空串 */
  iconUrl: string;
  /** 下载量 */
  downloads: number;
  /** 支持的加载器展示标签，如 ["Fabric", "Forge"] */
  loaders: string[];
  /** 适用的 MC 版本（去重后倒序取前若干项） */
  gameVersions: string[];
  /** 网站详情页地址 */
  pageUrl: string;
  /** 分类标题（用于详情页标题展示） */
  categoryTitle: string;
}

/** 市场条目的首选下载文件 */
export interface iGM_LauncherV2_MarketFile {
  /** 直连下载地址 */
  url: string;
  /** 文件名（含扩展名） */
  fileName: string;
  /** 文件字节数；未知为 0 */
  size: number;
  /** 文件对应的游戏版本（首个适配版本）；未知为空串 */
  version: string;
}

/** 市场条目详情 */
export interface iGM_LauncherV2_MarketDetail {
  item: iGM_LauncherV2_MarketItem;
  /** 纯文本简介（已去除 HTML 实体与换行归一） */
  body: string;
  /** 首选下载文件；无可下载文件时为 null */
  file: iGM_LauncherV2_MarketFile | null;
}

/** 检索结果 */
export interface iGM_LauncherV2_MarketSearchResult {
  items: iGM_LauncherV2_MarketItem[];
  /** 当前页起始偏移 */
  offset: number;
  /** 命中总数（用于判断是否还有下一页） */
  total: number;
  /** 结果或失败提示 */
  message: string;
}

/** 详情结果 */
export interface iGM_LauncherV2_MarketDetailResult {
  detail: iGM_LauncherV2_MarketDetail | null;
  message: string;
}

/** 检索入参 */
export interface iGM_LauncherV2_MarketSearchInput {
  source: iGM_LauncherV2_MarketSource;
  category: iGM_LauncherV2_MarketCategory;
  loader: iGM_LauncherV2_MarketLoader;
  query: string;
  offset: number;
}

// 核心逻辑 //

/** 每页条数 */
const IGM_MARKET_PAGE_SIZE = 20;

/** 网络请求超时（毫秒） */
const IGM_MARKET_TIMEOUT_MS = 15000;

/** 分类 → 界面可读标题 */
const IGM_MARKET_CATEGORY_TITLES: Record<iGM_LauncherV2_MarketCategory, string> = {
  mods: "模组",
  shaders: "光影",
  resourcepacks: "材质包",
  modpacks: "整合包",
  worlds: "地图",
};

/** 分类 → Modrinth project_type；无对应类型时返回空串（该源不参与检索） */
const IGM_MARKET_MODRINTH_TYPES: Record<iGM_LauncherV2_MarketCategory, string> = {
  mods: "mod",
  shaders: "shader",
  resourcepacks: "resourcepack",
  modpacks: "modpack",
  worlds: "",
};

/** 分类 → CurseForge classId（游戏固定为 Minecraft：432） */
const IGM_MARKET_CURSEFORGE_CLASSES: Record<iGM_LauncherV2_MarketCategory, number> = {
  mods: 6,
  resourcepacks: 12,
  modpacks: 4471,
  shaders: 6552,
  worlds: 17,
};

/** 加载器 → CurseForge modLoaderType 编码 */
const IGM_MARKET_CURSEFORGE_LOADERS: Record<iGM_LauncherV2_MarketLoader, number> = {
  all: 0,
  forge: 1,
  fabric: 4,
  neoforge: 6,
};

/** CurseForge modLoader 编码 → 展示标签（用于解析结果中已支持的加载器） */
const IGM_MARKET_CURSEFORGE_LOADER_LABELS: Record<number, string> = {
  1: "Forge",
  4: "Fabric",
  5: "Quilt",
  6: "NeoForge",
};

/** Modrinth 结果中视为「加载器」的分类项 */
const IGM_MARKET_MODRINTH_LOADERS: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

/** 带超时地取 JSON；失败或非 2xx 返回 null */
async function iGM_MarketFetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IGM_MARKET_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 去除 HTML 标签与实体，归一为纯文本简介 */
function iGM_MarketPlainText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** MC 版本排序：按主次版本号倒序（新版在前），非标准版本排在末尾 */
function iGM_MarketSortVersions(versions: string[]): string[] {
  const unique = [...new Set(versions.filter((item) => item.length > 0))];
  return unique.sort((a, b) => {
    const left = a.split(".").map((part) => Number(part) || 0);
    const right = b.split(".").map((part) => Number(part) || 0);
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const delta = (right[index] ?? 0) - (left[index] ?? 0);
      if (delta !== 0) return delta;
    }
    return 0;
  });
}

/**
 * Modrinth 检索。
 * 内容：facets 采用嵌套与关系：外层数组项之间为 AND，项内为 OR；
 *       本项目固定使用 project_type:<类型> AND categories:<加载器>，与官方推荐用法一致。
 */
async function iGM_MarketSearchModrinth(
  input: iGM_LauncherV2_MarketSearchInput,
): Promise<iGM_LauncherV2_MarketSearchResult> {
  const projectType = IGM_MARKET_MODRINTH_TYPES[input.category];
  if (!projectType) {
    return {
      items: [],
      offset: input.offset,
      total: 0,
      message: "Modrinth 暂不提供「地图」分类检索，请切换数据源为 CurseForge",
    };
  }

  const facets: string[][] = [[`project_type:${projectType}`]];
  if (input.loader !== "all") facets.push([`categories:${input.loader}`]);

  const params = new URLSearchParams({
    query: input.query,
    limit: String(IGM_MARKET_PAGE_SIZE),
    offset: String(Math.max(0, input.offset)),
    index: "relevance",
    facets: JSON.stringify(facets),
  });
  const payload = await iGM_MarketFetchJson(
    `${IGM_LAUNCHERV2_MODRINTH_SEARCH_URL}?${params.toString()}`,
    { "user-agent": IGM_LAUNCHERV2_MARKET_USER_AGENT },
  );
  if (!payload) {
    return { items: [], offset: input.offset, total: 0, message: "Modrinth 请求失败，请检查网络后重试" };
  }

  const record = payload as { hits?: unknown; total_hits?: unknown };
  const hits = Array.isArray(record.hits) ? record.hits : [];
  const items: iGM_LauncherV2_MarketItem[] = [];
  for (const entry of hits) {
    const hit = entry as {
      project_id?: unknown;
      slug?: unknown;
      title?: unknown;
      description?: unknown;
      author?: unknown;
      icon_url?: unknown;
      downloads?: unknown;
      categories?: unknown;
      versions?: unknown;
      project_type?: unknown;
    };
    const id = typeof hit.project_id === "string" ? hit.project_id : "";
    if (!id) continue;
    const slug = typeof hit.slug === "string" ? hit.slug : id;
    const type = typeof hit.project_type === "string" ? hit.project_type : projectType;
    const categories = Array.isArray(hit.categories)
      ? hit.categories.filter((value): value is string => typeof value === "string")
      : [];
    items.push({
      id,
      source: "modrinth",
      name: typeof hit.title === "string" ? hit.title : slug,
      author: typeof hit.author === "string" ? hit.author : "未知作者",
      description: typeof hit.description === "string" ? hit.description : "",
      iconUrl: typeof hit.icon_url === "string" ? hit.icon_url : "",
      downloads: typeof hit.downloads === "number" ? hit.downloads : 0,
      loaders: categories.filter((value) => value in IGM_MARKET_MODRINTH_LOADERS)
        .map((value) => IGM_MARKET_MODRINTH_LOADERS[value]),
      gameVersions: iGM_MarketSortVersions(
        Array.isArray(hit.versions)
          ? hit.versions.filter((value): value is string => typeof value === "string")
          : [],
      ).slice(0, 12),
      pageUrl: `https://modrinth.com/${type}/${slug}`,
      categoryTitle: IGM_MARKET_CATEGORY_TITLES[input.category],
    });
  }

  return {
    items,
    offset: Math.max(0, input.offset),
    total: typeof record.total_hits === "number" ? record.total_hits : items.length,
    message: items.length > 0 ? `Modrinth 命中 ${items.length} 项` : "没有匹配结果，试试更换关键词或加载器",
  };
}

/** CurseForge 检索：classId 定分类，modLoaderType 定加载器；密钥缺失直接给出可读提示 */
async function iGM_MarketSearchCurseforge(
  input: iGM_LauncherV2_MarketSearchInput,
): Promise<iGM_LauncherV2_MarketSearchResult> {
  const apiKey = iGM_LauncherV2_EnvGet(IGM_LAUNCHERV2_CURSEFORGE_ENV_KEY);
  if (!apiKey) {
    return { items: [], offset: input.offset, total: 0, message: "未配置 CurseForge 密钥，已跳过该数据源" };
  }

  const params = new URLSearchParams({
    gameId: "432",
    classId: String(IGM_MARKET_CURSEFORGE_CLASSES[input.category]),
    searchFilter: input.query,
    index: String(Math.max(0, input.offset)),
    pageSize: String(IGM_MARKET_PAGE_SIZE),
    sortField: "2",
    sortOrder: "desc",
  });
  if (input.loader !== "all") {
    params.set("modLoaderType", String(IGM_MARKET_CURSEFORGE_LOADERS[input.loader]));
  }

  const payload = await iGM_MarketFetchJson(
    `${IGM_LAUNCHERV2_CURSEFORGE_SEARCH_URL}?${params.toString()}`,
    { "x-api-key": apiKey, Accept: "application/json", "user-agent": IGM_LAUNCHERV2_MARKET_USER_AGENT },
  );
  if (!payload) {
    return { items: [], offset: input.offset, total: 0, message: "CurseForge 请求失败，请检查网络或密钥后重试" };
  }

  const record = payload as {
    data?: unknown;
    pagination?: { totalCount?: unknown };
  };
  const list = Array.isArray(record.data) ? record.data : [];
  const items = list.map((entry) => iGM_MarketMapCurseforgeItem(entry, input.category)).filter(
    (item): item is iGM_LauncherV2_MarketItem => item !== null,
  );

  return {
    items,
    offset: Math.max(0, input.offset),
    total:
      typeof record.pagination?.totalCount === "number" ? record.pagination.totalCount : items.length,
    message: items.length > 0 ? `CurseForge 命中 ${items.length} 项` : "没有匹配结果，试试更换关键词或加载器",
  };
}

/** 归一化 CurseForge 单条检索结果 */
function iGM_MarketMapCurseforgeItem(
  entry: unknown,
  category: iGM_LauncherV2_MarketCategory,
): iGM_LauncherV2_MarketItem | null {
  const mod = entry as {
    id?: unknown;
    name?: unknown;
    slug?: unknown;
    summary?: unknown;
    downloadCount?: unknown;
    authors?: unknown;
    logo?: { thumbnailUrl?: unknown; url?: unknown };
    links?: { websiteUrl?: unknown };
    latestFilesIndexes?: unknown;
  };
  const id = typeof mod.id === "number" ? String(mod.id) : "";
  if (!id) return null;

  const indexes = Array.isArray(mod.latestFilesIndexes) ? mod.latestFilesIndexes : [];
  const loaderLabels: string[] = [];
  const versions: string[] = [];
  for (const raw of indexes) {
    const index = raw as { gameVersion?: unknown; modLoader?: unknown };
    if (typeof index.gameVersion === "string") versions.push(index.gameVersion);
    if (typeof index.modLoader === "number") {
      const label = IGM_MARKET_CURSEFORGE_LOADER_LABELS[index.modLoader];
      if (label && !loaderLabels.includes(label)) loaderLabels.push(label);
    }
  }

  const authors = Array.isArray(mod.authors)
    ? mod.authors
        .map((raw) => (raw as { name?: unknown }).name)
        .filter((value): value is string => typeof value === "string")
    : [];

  return {
    id,
    source: "curseforge",
    name: typeof mod.name === "string" ? mod.name : id,
    author: authors.length > 0 ? authors.join(", ") : "未知作者",
    description: typeof mod.summary === "string" ? mod.summary : "",
    iconUrl:
      typeof mod.logo?.thumbnailUrl === "string"
        ? mod.logo.thumbnailUrl
        : typeof mod.logo?.url === "string"
          ? mod.logo.url
          : "",
    downloads: typeof mod.downloadCount === "number" ? mod.downloadCount : 0,
    loaders: loaderLabels,
    gameVersions: iGM_MarketSortVersions(versions).slice(0, 12),
    pageUrl:
      typeof mod.links?.websiteUrl === "string"
        ? mod.links.websiteUrl
        : `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(
            typeof mod.slug === "string" ? mod.slug : id,
          )}`,
    categoryTitle: IGM_MARKET_CATEGORY_TITLES[category],
  };
}

/** Modrinth 详情：项目简介 + 最新版本的首选文件 */
async function iGM_MarketDetailModrinth(
  id: string,
  item: iGM_LauncherV2_MarketItem,
): Promise<iGM_LauncherV2_MarketDetail | null> {
  const [project, versions] = await Promise.all([
    iGM_MarketFetchJson(`${IGM_LAUNCHERV2_MODRINTH_PROJECT_URL}/${encodeURIComponent(id)}`, {
      "user-agent": IGM_LAUNCHERV2_MARKET_USER_AGENT,
    }),
    iGM_MarketFetchJson(
      `${IGM_LAUNCHERV2_MODRINTH_PROJECT_URL}/${encodeURIComponent(id)}/version`,
      { "user-agent": IGM_LAUNCHERV2_MARKET_USER_AGENT },
    ),
  ]);
  if (!project) return null;

  const record = project as {
    title?: unknown;
    description?: unknown;
    body?: unknown;
    icon_url?: unknown;
    downloads?: unknown;
    loaders?: unknown;
    game_versions?: unknown;
    team?: unknown;
  };

  // 加载器与 MC 版本以详情返回为准（列表字段缺失时补齐）
  const loadersRaw = Array.isArray(record.loaders)
    ? record.loaders.filter((value): value is string => typeof value === "string")
    : [];
  const versionsRaw = Array.isArray(record.game_versions)
    ? record.game_versions.filter((value): value is string => typeof value === "string")
    : [];

  const merged: iGM_LauncherV2_MarketItem = {
    ...item,
    name: typeof record.title === "string" ? record.title : item.name,
    description:
      typeof record.description === "string" && record.description.length > 0
        ? record.description
        : item.description,
    iconUrl: typeof record.icon_url === "string" ? record.icon_url : item.iconUrl,
    downloads: typeof record.downloads === "number" ? record.downloads : item.downloads,
    loaders:
      loadersRaw.length > 0
        ? loadersRaw
            .filter((value) => value in IGM_MARKET_MODRINTH_LOADERS)
            .map((value) => IGM_MARKET_MODRINTH_LOADERS[value])
        : item.loaders,
    gameVersions: versionsRaw.length > 0 ? iGM_MarketSortVersions(versionsRaw).slice(0, 12) : item.gameVersions,
  };

  // 取最新版本中标记为 primary 的文件
  const list = Array.isArray(versions) ? versions : [];
  let file: iGM_LauncherV2_MarketFile | null = null;
  for (const raw of list) {
    const version = raw as {
      files?: unknown;
      game_versions?: unknown;
      version_number?: unknown;
    };
    const files = Array.isArray(version.files) ? version.files : [];
    const picked =
      files.find((entry) => (entry as { primary?: unknown }).primary === true) ?? files[0];
    const candidate = picked as { url?: unknown; filename?: unknown; size?: unknown } | undefined;
    if (!candidate || typeof candidate.url !== "string") continue;
    const gameVersion = Array.isArray(version.game_versions)
      ? version.game_versions.find((value): value is string => typeof value === "string") ?? ""
      : "";
    file = {
      url: candidate.url,
      fileName:
        typeof candidate.filename === "string" && candidate.filename.length > 0
          ? candidate.filename
          : `${merged.name}.jar`,
      size: typeof candidate.size === "number" ? candidate.size : 0,
      version: gameVersion,
    };
    break;
  }

  return { item: merged, body: iGM_MarketPlainText(record.body) || merged.description, file };
}

/** CurseForge 详情：项目简介 + 最新文件 */
async function iGM_MarketDetailCurseforge(
  id: string,
  item: iGM_LauncherV2_MarketItem,
): Promise<iGM_LauncherV2_MarketDetail | null> {
  const apiKey = iGM_LauncherV2_EnvGet(IGM_LAUNCHERV2_CURSEFORGE_ENV_KEY);
  if (!apiKey) return null;

  const payload = await iGM_MarketFetchJson(`${IGM_LAUNCHERV2_CURSEFORGE_MOD_URL}/${id}`, {
    "x-api-key": apiKey,
    Accept: "application/json",
    "user-agent": IGM_LAUNCHERV2_MARKET_USER_AGENT,
  });
  if (!payload) return null;

  const mod = (payload as { data?: unknown }).data as
    | {
        name?: unknown;
        summary?: unknown;
        description?: unknown;
        downloadCount?: unknown;
        logo?: { thumbnailUrl?: unknown; url?: unknown };
        authors?: unknown;
        links?: { websiteUrl?: unknown };
        latestFiles?: unknown;
      }
    | undefined;
  if (!mod) return null;

  const merged = iGM_MarketMapCurseforgeItem(mod, "mods");
  const authors = Array.isArray(mod.authors)
    ? mod.authors
        .map((raw) => (raw as { name?: unknown }).name)
        .filter((value): value is string => typeof value === "string")
    : [];

  const files = Array.isArray(mod.latestFiles) ? mod.latestFiles : [];
  // 优先正式版（releaseType=1），否则取首个可下载文件
  const ordered = [...files].sort((left, right) => {
    const leftType = (left as { releaseType?: unknown }).releaseType === 1 ? 0 : 1;
    const rightType = (right as { releaseType?: unknown }).releaseType === 1 ? 0 : 1;
    return leftType - rightType;
  });
  let file: iGM_LauncherV2_MarketFile | null = null;
  for (const raw of ordered) {
    const candidate = raw as {
      downloadUrl?: unknown;
      fileName?: unknown;
      fileLength?: unknown;
      gameVersions?: unknown;
    };
    if (typeof candidate.downloadUrl !== "string" || candidate.downloadUrl.length === 0) continue;
    const gameVersions = Array.isArray(candidate.gameVersions)
      ? candidate.gameVersions.filter((value): value is string => typeof value === "string")
      : [];
    file = {
      url: candidate.downloadUrl,
      fileName:
        typeof candidate.fileName === "string" && candidate.fileName.length > 0
          ? candidate.fileName
          : `${merged?.name ?? id}.jar`,
      size: typeof candidate.fileLength === "number" ? candidate.fileLength : 0,
      version: gameVersionFirst(gameVersions),
    };
    break;
  }

  return {
    item: {
      ...item,
      name: typeof mod.name === "string" ? mod.name : item.name,
      description:
        typeof mod.summary === "string" && mod.summary.length > 0 ? mod.summary : item.description,
      iconUrl:
        typeof mod.logo?.thumbnailUrl === "string"
          ? mod.logo.thumbnailUrl
          : typeof mod.logo?.url === "string"
            ? mod.logo.url
            : item.iconUrl,
      downloads: typeof mod.downloadCount === "number" ? mod.downloadCount : item.downloads,
      author: authors.length > 0 ? authors.join(", ") : item.author,
      pageUrl: typeof mod.links?.websiteUrl === "string" ? mod.links.websiteUrl : item.pageUrl,
    },
    body: iGM_MarketPlainText(mod.description) || (typeof mod.summary === "string" ? mod.summary : ""),
    file,
  };
}

/** 取游戏版本列表中的首个非空项 */
function gameVersionFirst(versions: string[]): string {
  for (const value of versions) {
    if (value.length > 0) return value;
  }
  return "";
}

// 导出 //

/** 资源市场检索：按分类与加载器过滤，返回归一化条目列表 */
export async function iGM_LauncherV2_Market_Search(
  input: iGM_LauncherV2_MarketSearchInput,
): Promise<iGM_LauncherV2_MarketSearchResult> {
  const query = (input.query ?? "").trim();
  if (input.source === "modrinth") {
    return iGM_MarketSearchModrinth({ ...input, query });
  }
  return iGM_MarketSearchCurseforge({ ...input, query });
}

/** 资源市场详情：返回简介与首选下载文件 */
export async function iGM_LauncherV2_Market_Detail(
  source: iGM_LauncherV2_MarketSource,
  id: string,
  category: iGM_LauncherV2_MarketCategory,
): Promise<iGM_LauncherV2_MarketDetailResult> {
  const target = (id ?? "").trim();
  if (!target) return { detail: null, message: "缺少资源标识" };

  // 详情页需要的基础条目：由列表页传入的字段已足够；此处用最小占位补齐
  const seed: iGM_LauncherV2_MarketItem = {
    id: target,
    source,
    name: target,
    author: "未知作者",
    description: "",
    iconUrl: "",
    downloads: 0,
    loaders: [],
    gameVersions: [],
    pageUrl: "",
    categoryTitle: IGM_MARKET_CATEGORY_TITLES[category],
  };

  const detail =
    source === "modrinth"
      ? await iGM_MarketDetailModrinth(target, seed)
      : await iGM_MarketDetailCurseforge(target, seed);

  if (!detail) return { detail: null, message: "拉取详情失败，请检查网络后重试" };
  return { detail, message: detail.file ? "已获取详情与下载文件" : "已获取详情，但该资源未提供可下载文件" };
}

export default iGM_LauncherV2_Market_Search;
