/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Horizon.ts
 * 所属层：桌面外壳 / 视界管理层
 * 路由：全局
 * 模块：iGM_LauncherV2_Horizon
 * 作用：视界（Horizon）的创建、列举、选择与删除
 * 内容：视界取代原有的「实例」概念，一个视界即 horizons/ 下的一个独立目录，
 *       内含 mods / resourcepacks / shaderpacks / saves / config 子目录；
 *       启动游戏时 --gameDir 指向当前视界的物理路径，实现多版本隔离；
 *       共享的 assets / libraries / versions 位于游戏根目录，各视界复用；
 *       另提供视界内文件树（限深遍历、不越界）与 saves/ 下世界（存档）列表能力；
 *       并向外提供按 id 取路径（供资源市场「安装到视界」定位落盘目录）与轻量下拉选项
 * 说明：目录名即视界标识，创建前做安全化处理，禁止路径穿越与非法字符
 */

// 导入依赖 //
import type { Dirent } from "node:fs";
import { statSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  IGM_LAUNCHERV2_HORIZON_SUBDIRS,
  iGM_LauncherV2_HorizonsPath,
  iGM_LauncherV2_SettingsGet,
  iGM_LauncherV2_SettingsSave,
} from "./iGM_LauncherV2_Paths";

// 类型定义 //

/** 视界元数据文件名（记录该视界绑定的游戏版本与加载器） */
export const IGM_LAUNCHERV2_HORIZON_META_FILE = "iGM_Horizon.json";

/** 视界元数据（创建视界时写入视界目录，供启动时定位版本） */
export interface iGM_LauncherV2_HorizonMeta {
  /** 绑定的游戏版本 id；为空表示由视界名称推导 */
  versionId: string;
  /** 加载器展示名（仅用于展示与命名） */
  loaderLabel: string;
  /** 写入时间（ISO 字符串） */
  createdAt: string;
}

/** 视界条目 */
export interface iGM_LauncherV2_Horizon {
  /** 视界标识（即 horizons/ 下的目录名） */
  id: string;
  /** 展示名称（默认与标识一致） */
  name: string;
  /** 视界物理路径 */
  path: string;
  /** 是否为当前选中的视界 */
  current: boolean;
  /** 视界内 mods 目录的模组数量（统计失败为 0） */
  modCount: number;
  /** 目录创建时间（ISO 字符串，取不到为空串） */
  createdAt: string;
  /** 绑定的游戏版本 id（读取元数据，缺失为空串） */
  versionId: string;
  /** 绑定的加载器展示名（读取元数据，缺失为空串） */
  loaderLabel: string;
}

/** 视界列表结果 */
export interface iGM_LauncherV2_HorizonListResult {
  items: iGM_LauncherV2_Horizon[];
  currentId: string;
  /** 视界存放根目录，供界面提示 */
  horizonsRoot: string;
  /** 结果提示文案 */
  message: string;
}

/** 视界内单个文件/目录节点（path 为相对视界根目录的相对路径） */
export interface iGM_LauncherV2_HorizonNode {
  /** 条目名称 */
  name: string;
  /** 相对视界根目录的相对路径（以 / 分隔） */
  path: string;
  /** 是否为目录 */
  dir: boolean;
  /** 文件字节数；目录恒为 0（不递归统计目录总字节） */
  size: number;
  /** 子节点；目录且未超过最大深度时存在，超出深度或非目录为 undefined */
  children?: iGM_LauncherV2_HorizonNode[];
}

/** 世界（存档）条目 */
export interface iGM_LauncherV2_WorldEntry {
  /** 存档目录名 */
  name: string;
  /** 存档目录绝对路径 */
  path: string;
  /** level.dat 的字节数；缺失为 0 */
  size: number;
  /** 存档目录最后修改时间（毫秒时间戳） */
  modifiedAt: number;
}

// 核心逻辑 //

/** 把用户输入转成安全的目录名（去除路径分隔符与保留字符） */
function iGM_LauncherV2_SafeName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.+$/, "")
    .slice(0, 64);
}

/** 统计某目录下的条目数量 */
async function iGM_LauncherV2_CountEntries(path: string): Promise<number> {
  try {
    return (await readdir(path)).length;
  } catch {
    return 0;
  }
}

/** 读取指定视界的元数据；缺失或损坏返回 null */
export async function iGM_LauncherV2_Horizon_ReadMeta(
  id: string,
): Promise<iGM_LauncherV2_HorizonMeta | null> {
  const target = iGM_LauncherV2_SafeName(id);
  if (!target) return null;
  try {
    const text = (
      await readFile(join(iGM_LauncherV2_HorizonsPath(), target, IGM_LAUNCHERV2_HORIZON_META_FILE), "utf8")
    ).trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<iGM_LauncherV2_HorizonMeta>;
    return {
      versionId: typeof parsed.versionId === "string" ? parsed.versionId : "",
      loaderLabel: typeof parsed.loaderLabel === "string" ? parsed.loaderLabel : "",
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    };
  } catch {
    return null;
  }
}

/** 组装单个视界条目 */
async function iGM_LauncherV2_DescribeHorizon(
  id: string,
  currentId: string,
): Promise<iGM_LauncherV2_Horizon> {
  const path = join(iGM_LauncherV2_HorizonsPath(), id);
  let createdAt = "";
  try {
    const info = await stat(path);
    createdAt = info.birthtime.toISOString();
  } catch {
    createdAt = "";
  }
  const meta = await iGM_LauncherV2_Horizon_ReadMeta(id);
  return {
    id,
    name: id,
    path,
    current: id === currentId,
    modCount: await iGM_LauncherV2_CountEntries(join(path, "mods")),
    createdAt,
    versionId: meta?.versionId ?? "",
    loaderLabel: meta?.loaderLabel ?? "",
  };
}

/** 按视界 id 取绝对路径；视界不存在时返回空串（供下载落盘定位） */
export function iGM_LauncherV2_Horizon_PathById(id: string): string {
  const target = iGM_LauncherV2_SafeName(id);
  if (!target) return "";
  const path = join(iGM_LauncherV2_HorizonsPath(), target);
  try {
    return statSync(path).isDirectory() ? path : "";
  } catch {
    return "";
  }
}

/** 列举全部视界 */
export async function iGM_LauncherV2_Horizon_List(
  message = "",
): Promise<iGM_LauncherV2_HorizonListResult> {
  const root = iGM_LauncherV2_HorizonsPath();
  const currentId = iGM_LauncherV2_SettingsGet().horizonId;

  await mkdir(root, { recursive: true });

  let ids: string[] = [];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    ids = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    ids = [];
  }
  ids.sort((a, b) => a.localeCompare(b, "zh-CN"));

  const items: iGM_LauncherV2_Horizon[] = [];
  for (const id of ids) items.push(await iGM_LauncherV2_DescribeHorizon(id, currentId));

  return { items, currentId, horizonsRoot: root, message };
}

/** 新建视界：创建目录与标准子目录，写入元数据（绑定版本与加载器），并设为当前视界 */
export async function iGM_LauncherV2_Horizon_Create(
  name: string,
  options?: { versionId?: string; loaderLabel?: string },
): Promise<iGM_LauncherV2_HorizonListResult> {
  const id = iGM_LauncherV2_SafeName(name);
  if (!id) throw new Error("视界名称不可为空，且不能只包含非法字符");

  const path = join(iGM_LauncherV2_HorizonsPath(), id);

  // 同名视界已存在时直接报错，保证界面能给出明确反馈（不静默覆盖）
  let exists = false;
  try {
    exists = (await stat(path)).isDirectory();
  } catch {
    exists = false;
  }
  if (exists) throw new Error(`视界已存在：${id}，请更换名称`);

  await mkdir(path, { recursive: true });
  for (const dir of IGM_LAUNCHERV2_HORIZON_SUBDIRS) {
    await mkdir(join(path, dir), { recursive: true });
  }

  // 落盘元数据：记录该视界绑定的游戏版本与加载器，供启动时优先定位版本
  const meta: iGM_LauncherV2_HorizonMeta = {
    versionId: (options?.versionId ?? "").trim(),
    loaderLabel: (options?.loaderLabel ?? "").trim(),
    createdAt: new Date().toISOString(),
  };
  await writeFile(join(path, IGM_LAUNCHERV2_HORIZON_META_FILE), JSON.stringify(meta, null, 2), "utf8");

  await iGM_LauncherV2_SettingsSave({ horizonId: id });

  return iGM_LauncherV2_Horizon_List(`已新建视界：${id}`);
}

/** 选择视界（仅切换设置中的当前标识，不移动任何文件） */
export async function iGM_LauncherV2_Horizon_Select(
  id: string,
): Promise<iGM_LauncherV2_HorizonListResult> {
  const target = iGM_LauncherV2_SafeName(id);
  if (!target) throw new Error("视界标识无效");
  const path = join(iGM_LauncherV2_HorizonsPath(), target);
  try {
    const info = await stat(path);
    if (!info.isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`视界不存在：${target}`);
  }
  await iGM_LauncherV2_SettingsSave({ horizonId: target });
  return iGM_LauncherV2_Horizon_List(`已切换到视界：${target}`);
}

/** 删除视界目录（界面已二次确认）；删除当前视界时清空当前选择 */
export async function iGM_LauncherV2_Horizon_Delete(
  id: string,
): Promise<iGM_LauncherV2_HorizonListResult> {
  const target = iGM_LauncherV2_SafeName(id);
  if (!target) throw new Error("视界标识无效");
  await rm(join(iGM_LauncherV2_HorizonsPath(), target), { recursive: true, force: true });

  const settings = iGM_LauncherV2_SettingsGet();
  if (settings.horizonId === target) {
    await iGM_LauncherV2_SettingsSave({ horizonId: "" });
  }
  return iGM_LauncherV2_Horizon_List(`已删除视界：${target}`);
}

/** 当前视界的物理路径（供启动游戏时作为 --gameDir）；未选择时返回空串 */
export function iGM_LauncherV2_Horizon_CurrentPath(): string {
  const id = iGM_LauncherV2_SettingsGet().horizonId;
  return id ? join(iGM_LauncherV2_HorizonsPath(), id) : "";
}

/** 文件树默认最大遍历深度（避免大目录爆炸式展开） */
const IGM_LAUNCHERV2_HORIZON_TREE_MAX_DEPTH = 3;

/**
 * 递归读取目录内容为节点数组。
 * 越界防护：跳过符号链接（避免逃逸出视界目录），并再次校验子路径位于视界根目录前缀内。
 * 目录节点只填 size: 0 与其 children，不递归统计目录总字节（代价过高）。
 */
async function iGM_LauncherV2_ReadNodes(
  dir: string,
  root: string,
  relative: string,
  depth: number,
  maxDepth: number,
): Promise<iGM_LauncherV2_HorizonNode[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: iGM_LauncherV2_HorizonNode[] = [];
  for (const entry of entries) {
    // 越界防护：不跟随符号链接，避免逃逸出视界目录
    if (entry.isSymbolicLink()) continue;

    const childPath = join(dir, entry.name);
    if (!childPath.startsWith(root)) continue;

    const relativePath = relative ? `${relative}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // 未达最大深度时继续下探；到达深度上限的目录节点不再填 children
      const children =
        depth < maxDepth
          ? await iGM_LauncherV2_ReadNodes(childPath, root, relativePath, depth + 1, maxDepth)
          : undefined;
      nodes.push({ name: entry.name, path: relativePath, dir: true, size: 0, children });
    } else if (entry.isFile()) {
      let size = 0;
      try {
        size = (await stat(childPath)).size;
      } catch {
        size = 0;
      }
      nodes.push({ name: entry.name, path: relativePath, dir: false, size });
    }
  }
  return nodes;
}

/**
 * 取指定视界的目录树，根为 horizons/<视界>/，仅限该视界文件夹内部。
 * maxDepth 控制最大遍历深度（默认 3）；视界不存在或读取失败时返回空数组。
 */
export async function iGM_LauncherV2_HorizonTree(
  id: string,
  maxDepth?: number,
): Promise<iGM_LauncherV2_HorizonNode[]> {
  const target = iGM_LauncherV2_SafeName(id);
  if (!target) return [];

  const root = join(iGM_LauncherV2_HorizonsPath(), target);
  try {
    const info = await stat(root);
    if (!info.isDirectory()) return [];
  } catch {
    return [];
  }

  const depth =
    typeof maxDepth === "number" && maxDepth > 0
      ? Math.floor(maxDepth)
      : IGM_LAUNCHERV2_HORIZON_TREE_MAX_DEPTH;

  return iGM_LauncherV2_ReadNodes(root, root, "", 1, depth);
}

/**
 * 取指定视界 saves 目录下的世界（存档）列表。
 * 只读取 saves/ 的直接子目录，跳过以 . 开头的目录；
 * modifiedAt 取存档目录的 mtimeMs，size 取存档目录内 level.dat 的大小（缺失为 0）；
 * saves 目录不存在时返回空数组，不抛错。
 */
export async function iGM_LauncherV2_HorizonWorlds(
  id: string,
): Promise<iGM_LauncherV2_WorldEntry[]> {
  const target = iGM_LauncherV2_SafeName(id);
  if (!target) return [];

  const saves = join(iGM_LauncherV2_HorizonsPath(), target, "saves");
  let entries: Dirent[];
  try {
    entries = await readdir(saves, { withFileTypes: true });
  } catch {
    return [];
  }

  const worlds: iGM_LauncherV2_WorldEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const worldPath = join(saves, entry.name);
    let modifiedAt = 0;
    try {
      modifiedAt = (await stat(worldPath)).mtimeMs;
    } catch {
      continue;
    }

    let size = 0;
    try {
      size = (await stat(join(worldPath, "level.dat"))).size;
    } catch {
      size = 0;
    }

    worlds.push({ name: entry.name, path: worldPath, size, modifiedAt });
  }
  return worlds;
}

// 导出 //
export default iGM_LauncherV2_Horizon_List;
