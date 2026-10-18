/**
 * 文件路径：apps/launcher-ui/lib/iGM_LauncherV2_VersionRelations.ts
 * 所属层：前端 / 版本关联计算层
 * 模块：iGM_LauncherV2_VersionRelations
 * 作用：把扁平版本清单整理为「当前版本 + 关联版本列表」，供资源中心第二步以普通列表呈现
 * 内容：版本按四类归档（正式版 / 快照版 / 远古版本 / 特别版）；
 *       关联版本分三组：同系列版本（按系列键归并）、前置版本（主线上更早的正式版）、
 *       后续更新版（主线上更新的正式版）；每组按与焦点的距离由近及远排序并限制条数
 * 说明：纯计算模块，不依赖 React，也不产生任何坐标或连线；
 *       本模块取代了此前的图形关系图计算层，界面侧只消费分组结果
 */

// 导入依赖 //
import type { iGM_LauncherV2_VersionEntry } from "./iGM_LauncherV2_Constants";

// 类型定义 //

/** 版本归档口径：与版本列表页的四个 Tab 一一对应 */
export type iGM_LauncherV2_VersionCategory = "release" | "snapshot" | "old" | "special";

/** 关联版本分组的标识 */
export type iGM_LauncherV2_RelationKey = "series" | "older" | "newer";

/** 一组关联版本 */
export interface iGM_LauncherV2_RelationGroup {
  key: iGM_LauncherV2_RelationKey;
  title: string;
  items: iGM_LauncherV2_VersionEntry[];
}

// 常量与文案 //

/** 每组最多列出的关联版本条数，避免界面被超长清单淹没 */
const IGM_RELATION_GROUP_LIMIT = 8;

/**
 * 特别版识别表：Minecraft 历年愚人节版本与个别独立发布的特别版本。
 * 采用整串匹配，避免把相近版本号误判为特别版。
 */
const IGM_RELATION_SPECIAL_RULES: { pattern: RegExp; tag: string }[] = [
  {
    pattern:
      /^(15w14a|1\.rv-pre1|3d shareware v1\.34|20w14infinite|22w13oneblockatatime|23w13a_or_b|24w14potato|25w14craftmine)$/i,
    tag: "愚人节",
  },
  { pattern: /^2\.0$/i, tag: "特别版" },
];

/** 四类归档的展示文案 */
export const IGM_RELATION_CATEGORY_LABEL: Record<iGM_LauncherV2_VersionCategory, string> = {
  release: "正式版",
  snapshot: "快照",
  old: "远古",
  special: "特别版",
};

// 核心逻辑 //

/** 特别版备注；非特别版返回空串 */
export function iGM_LauncherV2_SpecialTag(versionId: string): string {
  const id = versionId.trim();
  for (const rule of IGM_RELATION_SPECIAL_RULES) {
    if (rule.pattern.test(id)) return rule.tag;
  }
  return "";
}

/** 版本归档：特别版优先判定（快照版中亦含愚人节版本），其余按清单类型归档 */
export function iGM_LauncherV2_VersionCategoryOf(
  version: iGM_LauncherV2_VersionEntry,
): iGM_LauncherV2_VersionCategory {
  if (iGM_LauncherV2_SpecialTag(version.id)) return "special";
  if (version.type === "release") return "release";
  if (version.type === "snapshot") return "snapshot";
  return "old";
}

/** 时间戳解析：无法解析按 0 处理，靠清单原始顺序兜底 */
function iGM_LauncherV2_TimeValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 版本系列键：用于把同属一个系列的版本归到一组。
 * 正式版取主版本段（1.20.1 -> 1.20，1.20-pre1 -> 1.20）；
 * 快照版取年份周（23w45a -> 23w45）；其余取版本号原文。
 */
export function iGM_LauncherV2_SeriesKey(versionId: string): string {
  const id = versionId.trim();
  const snapshot = /^(\d{2}w\d{2})/i.exec(id);
  if (snapshot) return snapshot[1].toLowerCase();
  const release = /^(\d+\.\d+)/.exec(id);
  if (release) return release[1];
  return id.toLowerCase();
}

/**
 * 构建关联版本分组。
 * 输入为清单原始顺序（新版本在前）；输出「同系列 / 前置 / 后续」三组关联版本，
 * 已剔除与焦点重复的条目，并按与焦点的距离由近及远排列。
 */
export function iGM_LauncherV2_BuildVersionRelations(
  versions: iGM_LauncherV2_VersionEntry[],
  focusId: string,
): iGM_LauncherV2_RelationGroup[] {
  const focused = focusId.trim();
  if (!focused) return [];

  const focusEntry = versions.find((item) => item.id === focused) ?? null;
  const focusTime = iGM_LauncherV2_TimeValue(focusEntry?.releaseTime ?? "");
  const focusSeries = iGM_LauncherV2_SeriesKey(focused);

  /** 同系列版本：系列键相同即可，按发布时间由新到旧 */
  const series = versions
    .filter((item) => item.id !== focused && iGM_LauncherV2_SeriesKey(item.id) === focusSeries)
    .slice()
    .sort((a, b) => iGM_LauncherV2_TimeValue(b.releaseTime) - iGM_LauncherV2_TimeValue(a.releaseTime))
    .slice(0, IGM_RELATION_GROUP_LIMIT);

  /** 主线 = 正式版与远古版本，按发布时间由旧到新 */
  const mainLine = versions
    .filter((item) => {
      const category = iGM_LauncherV2_VersionCategoryOf(item);
      return category === "release" || category === "old";
    })
    .slice()
    .sort((a, b) => iGM_LauncherV2_TimeValue(a.releaseTime) - iGM_LauncherV2_TimeValue(b.releaseTime));

  const focusIndex = mainLine.findIndex((item) => item.id === focused);
  const older: iGM_LauncherV2_VersionEntry[] = [];
  const newer: iGM_LauncherV2_VersionEntry[] = [];

  if (focusIndex >= 0) {
    // 焦点在主线内：向两侧按距离由近及远取
    for (let i = focusIndex - 1; i >= 0 && older.length < IGM_RELATION_GROUP_LIMIT; i -= 1) {
      older.push(mainLine[i]);
    }
    for (
      let i = focusIndex + 1;
      i < mainLine.length && newer.length < IGM_RELATION_GROUP_LIMIT;
      i += 1
    ) {
      newer.push(mainLine[i]);
    }
  } else if (focusTime > 0) {
    // 焦点为快照或特别版：按发布时间比较，近的优先
    for (let i = mainLine.length - 1; i >= 0 && older.length < IGM_RELATION_GROUP_LIMIT; i -= 1) {
      if (iGM_LauncherV2_TimeValue(mainLine[i].releaseTime) < focusTime) older.push(mainLine[i]);
    }
    for (let i = 0; i < mainLine.length && newer.length < IGM_RELATION_GROUP_LIMIT; i += 1) {
      if (iGM_LauncherV2_TimeValue(mainLine[i].releaseTime) > focusTime) newer.push(mainLine[i]);
    }
  }

  const groups: iGM_LauncherV2_RelationGroup[] = [
    { key: "series", title: "同系列版本", items: series },
    { key: "older", title: "前置版本", items: older },
    { key: "newer", title: "后续更新版", items: newer },
  ];

  return groups.filter((group) => group.items.length > 0);
}

// 导出 //
export default iGM_LauncherV2_BuildVersionRelations;
