/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_News.ts
 * 所属层：桌面外壳 / 首页数据层
 * 路由：全局
 * 模块：iGM_LauncherV2_News
 * 作用：首页新闻流的读取与内置默认内容兜底
 * 内容：读取 launcher_data/news.json（本地维护），文件缺失或损坏时回退内置默认条目；
 *       首次运行（文件不存在）时把内置默认写盘，便于用户自行维护，绝不覆盖已存在文件；
 *       条目结构见契约层 iGM_LauncherV2_NewsItem（id / title / body / date / tag / url）
 * 说明：本模块只负责取数，不做任何渲染；界面按时间倒序展示
 */

// 导入依赖 //
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { iGM_LauncherV2_NewsItem } from "./iGM_LauncherV2_Ipc";
import { iGM_LauncherV2_LauncherDataPath } from "./iGM_LauncherV2_Paths";

// 类型定义 //

/** 新闻流加载结果：来源为本地文件或内置默认 */
export interface iGM_LauncherV2_NewsLoadResult {
  items: iGM_LauncherV2_NewsItem[];
  source: "local" | "default";
  /** 结果提示（本模块不产生用户可见文案，恒为空串，来源信息由 source 字段表达） */
  message: string;
}

// 核心逻辑 //

/** 新闻文件名（位于 launcher_data 内） */
export const IGM_LAUNCHERV2_NEWS_FILE = "news.json";

/**
 * 内置默认新闻条目（本地文件缺失或损坏时使用）。
 * 覆盖版本更新 / 服务器公告 / 活动三类，便于首页在首次运行时也能呈现完整信息流。
 */
const IGM_LAUNCHERV2_NEWS_DEFAULT: iGM_LauncherV2_NewsItem[] = [
  {
    id: "default-update-2654",
    title: "版本更新 v26.5.4",
    body: "本版本修复了全部表单控件的系统白底问题，统一为深色半透明风格；开服中心新增客户端清单工作室，可勾选文件并一键生成 manifest.json 与客户端 ZIP 包；新增本地开服与地图站，联机房间按房主与好友彻底拆分。",
    date: "2026-10-18",
    tag: "update",
    url: "",
  },
  {
    id: "default-notice-community",
    title: "服务器公告",
    body: "官方服务器与联机大厅已恢复稳定运行。如遇连接异常，请稍后重试或通过社区反馈通道告知我们。",
    date: "2026-04-20",
    tag: "notice",
    url: "",
  },
  {
    id: "default-event-spring",
    title: "春季活动",
    body: "春季建造与探险活动进行中，欢迎进入官方服务器参与，活动详情与奖励以服务器内公告为准。",
    date: "2026-04-28",
    tag: "event",
    url: "",
  },
];

/** 新闻文件绝对路径 */
export function iGM_LauncherV2_NewsPath(): string {
  return join(iGM_LauncherV2_LauncherDataPath(), IGM_LAUNCHERV2_NEWS_FILE);
}

/** 文本字段归一化：非字符串或空值时回退 */
function iGM_NewsText(raw: unknown, fallback = ""): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

/** 把任意解析结果归一化为标准条目数组（仅保留含标题的条目） */
function iGM_NewsNormalize(raw: unknown): iGM_LauncherV2_NewsItem[] {
  if (!Array.isArray(raw)) return [];
  const items: iGM_LauncherV2_NewsItem[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const item = entry as Partial<iGM_LauncherV2_NewsItem>;
    const title = iGM_NewsText(item.title);
    if (!title) return;
    items.push({
      id: iGM_NewsText(item.id, `news-${index}`),
      title,
      body: iGM_NewsText(item.body),
      date: iGM_NewsText(item.date),
      tag: iGM_NewsText(item.tag),
      url: iGM_NewsText(item.url),
    });
  });
  return items;
}

/** 复制内置默认条目（避免调用方修改共享常量） */
function iGM_NewsDefault(): iGM_LauncherV2_NewsItem[] {
  return IGM_LAUNCHERV2_NEWS_DEFAULT.map((item) => ({ ...item }));
}

/** 把内置默认写盘（首次运行时便于用户自行维护；失败静默忽略） */
async function iGM_NewsWriteDefault(): Promise<void> {
  try {
    await mkdir(iGM_LauncherV2_LauncherDataPath(), { recursive: true });
    await writeFile(
      iGM_LauncherV2_NewsPath(),
      JSON.stringify(IGM_LAUNCHERV2_NEWS_DEFAULT, null, 2),
      { encoding: "utf8", mode: 0o600 },
    );
  } catch {
    // 写盘失败不影响本次返回的内置默认内容
  }
}

/**
 * 加载首页新闻流。
 * 读取 launcher_data/news.json：
 * - 文件存在且含有效条目：返回本地条目（source 为 local）；
 * - 文件缺失：返回内置默认，并顺带把默认写盘便于用户维护（不覆盖已存在文件）；
 * - 文件存在但损坏 / 无有效条目：返回内置默认，且不回写（避免覆盖用户内容）。
 */
export async function iGM_LauncherV2_News_Load(): Promise<iGM_LauncherV2_NewsLoadResult> {
  let missing = false;
  try {
    const text = (await readFile(iGM_LauncherV2_NewsPath(), "utf8")).trim();
    if (text) {
      const items = iGM_NewsNormalize(JSON.parse(text));
      if (items.length > 0) return { items, source: "local", message: "" };
    }
  } catch (error) {
    // 仅文件不存在时视为「首次运行」并回写默认；其余异常保留用户文件不动
    if ((error as NodeJS.ErrnoException).code === "ENOENT") missing = true;
  }

  if (missing) await iGM_NewsWriteDefault();
  return { items: iGM_NewsDefault(), source: "default", message: "" };
}

// 导出 //
export default iGM_LauncherV2_News_Load;
