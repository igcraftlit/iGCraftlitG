/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_StatsService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Stats
 * 模块：iGM_StatsService
 * 作用：运营统计业务逻辑——核心指标概览、趋势序列、排行榜、活动参与统计
 * 内容：Asia/Shanghai 日界换算、7d/30d/90d 范围解析、惰性每日聚合
 *       （每日首次请求把昨日数据落入 iGM_StatsDaily）、概览快照缓存
 *       （iGM_StatsSnapshots，5 分钟新鲜度）
 * 说明：初期以实时查询 SQLite 为主，日聚合表供后续重负载时切换
 */

// 导入依赖 //
import {
  iGM_CountActiveUsersBetween,
  iGM_CountCommentsBetween,
  iGM_CountLikesBetween,
  iGM_CountPostsBetween,
  iGM_CountUsersBetween,
  iGM_FindFreshSnapshot,
  iGM_FindStatsDaily,
  iGM_GetTotalCounts,
  iGM_ListActiveUsers,
  iGM_ListActivityStats,
  iGM_ListHotPosts,
  iGM_ListHotResources,
  iGM_UpsertStatsDaily,
  iGM_WriteSnapshot,
  type iGM_ActivityStatRow,
} from "../iGM_Repositories/iGM_StatsRepository";
import { iGM_ResolveUserOrgBadge } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import type { iGM_OrgBadgeDto } from "../iGM_Types/iGM_OrgVerify";

// 类型定义 //
/** 统计时间范围 */
export type iGM_StatsRange = "7d" | "30d" | "90d";

/** 趋势指标 */
export type iGM_StatsTrendMetric = "users" | "posts" | "comments" | "activity";

/** 趋势序列数据点 */
export interface iGM_StatsTrendPoint {
  /** 上海时区日期 YYYY-MM-DD */
  date: string;
  value: number;
}

/** 核心指标概览 */
export interface iGM_StatsOverview {
  totalUsers: number;
  newUsersToday: number;
  activeUsersDaily: number;
  activeUsersWeekly: number;
  activeUsersMonthly: number;
  totalPosts: number;
  postsToday: number;
  totalComments: number;
  commentsToday: number;
  totalLikes: number;
  totalResources: number;
  totalActivities: number;
  totalActivityRegistrations: number;
  totalResourceDownloads: number;
  onlineUsers: number;
}

/** 活跃用户排行条目 */
export interface iGM_ActiveUserDto {
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  verifiedOrg: iGM_OrgBadgeDto | null;
  actionCount: number;
}

/** 排行榜数据 */
export interface iGM_StatsLeaderboards {
  hotPosts: {
    id: string;
    title: string;
    authorName: string;
    likeCount: number;
    commentCount: number;
    score: number;
  }[];
  hotResources: {
    id: string;
    title: string;
    uploaderName: string;
    downloadCount: number;
  }[];
  activeUsers: iGM_ActiveUserDto[];
}

/** 活动参与统计 */
export interface iGM_StatsActivities {
  totalActivities: number;
  totalRegistrations: number;
  items: {
    id: string;
    title: string;
    status: string;
    startTime: string | null;
    createdAt: string;
    registrationCount: number;
  }[];
}

// 核心逻辑 //
/* ---------- 时区与范围工具 ---------- */

/** 上海时区日期字符串（YYYY-MM-DD） */
function iGM_ShanghaiDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}

/** 上海时区某日的起始与结束 UTC ISO 串（start 含，end 不含） */
function iGM_ShanghaiDayBounds(date: string): { startIso: string; endIso: string } {
  const startIso = new Date(`${date}T00:00:00+08:00`).toISOString();
  const endIso = new Date(`${date}T00:00:00+08:00`);
  endIso.setUTCDate(endIso.getUTCDate() + 1);
  return { startIso, endIso: endIso.toISOString() };
}

/** 解析范围参数为天数（非法值回退 7d） */
export function iGM_ParseRange(raw: string): { range: iGM_StatsRange; days: number } {
  if (raw === "30d") return { range: "30d", days: 30 };
  if (raw === "90d") return { range: "90d", days: 90 };
  return { range: "7d", days: 7 };
}

/** 生成最近 N 天（含今天）的上海日期列表（升序） */
function iGM_RecentDates(days: number): string[] {
  const dates: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    dates.push(iGM_ShanghaiDate(new Date(now - i * 24 * 60 * 60 * 1000)));
  }
  return dates;
}

/* ---------- 惰性每日聚合 ---------- */

/** 确保昨日聚合已写入 iGM_StatsDaily（每日首次统计请求时执行一次） */
async function iGM_EnsureYesterdayAggregated(): Promise<void> {
  const yesterday = iGM_ShanghaiDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (await iGM_FindStatsDaily(yesterday)) return;
  const { startIso, endIso } = iGM_ShanghaiDayBounds(yesterday);
  await iGM_UpsertStatsDaily({
    iGM_Date: yesterday,
    iGM_NewUsers: await iGM_CountUsersBetween(startIso, endIso),
    iGM_ActiveUsers: await iGM_CountActiveUsersBetween(startIso, endIso, yesterday),
    iGM_PostsCount: await iGM_CountPostsBetween(startIso, endIso),
    iGM_CommentsCount: await iGM_CountCommentsBetween(startIso, endIso),
    iGM_LikesCount: await iGM_CountLikesBetween(startIso, endIso),
    iGM_ResourcesCount: 0, // 资源发布数非核心趋势指标，保持 0 占位
    iGM_ActivitiesCount: await iGM_CountActivitiesBetween(startIso, endIso),
  });
}

/** 时间窗内活动创建数 */
async function iGM_CountActivitiesBetween(startIso: string, endIso: string): Promise<number> {
  return (await iGM_ListActivityStats(startIso, endIso)).length;
}

/* ---------- 概览 ---------- */

const iGM_OverviewSnapshotMaxAgeMs = 5 * 60 * 1000;

/** 核心指标概览（5 分钟快照缓存；在线人数始终实时） */
export async function iGM_GetStatsOverview(onlineUsers: number): Promise<iGM_StatsOverview> {
  await iGM_EnsureYesterdayAggregated();

  const cached = await iGM_FindFreshSnapshot(
    "overview",
    "latest",
    iGM_OverviewSnapshotMaxAgeMs,
  );
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as Omit<iGM_StatsOverview, "onlineUsers">;
      return { ...parsed, onlineUsers };
    } catch {
      // 快照损坏则落到实时计算
    }
  }

  const today = iGM_ShanghaiDate(new Date());
  const { startIso: todayStart } = iGM_ShanghaiDayBounds(today);
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const totals = await iGM_GetTotalCounts();

  const overview: Omit<iGM_StatsOverview, "onlineUsers"> = {
    totalUsers: await iGM_CountUsersBetween("1970-01-01T00:00:00.000Z"),
    newUsersToday: await iGM_CountUsersBetween(todayStart),
    activeUsersDaily: await iGM_CountActiveUsersBetween(todayStart, nowIso, today),
    activeUsersWeekly: await iGM_CountActiveUsersBetween(weekStart, nowIso, null),
    activeUsersMonthly: await iGM_CountActiveUsersBetween(monthStart, nowIso, null),
    totalPosts: await iGM_CountPostsBetween("1970-01-01T00:00:00.000Z"),
    postsToday: await iGM_CountPostsBetween(todayStart),
    totalComments: await iGM_CountCommentsBetween("1970-01-01T00:00:00.000Z"),
    commentsToday: await iGM_CountCommentsBetween(todayStart),
    totalLikes: totals.likes,
    totalResources: totals.resources,
    totalActivities: await iGM_CountActivitiesBetween(
      "1970-01-01T00:00:00.000Z",
      nowIso,
    ),
    totalActivityRegistrations: totals.activityRegistrations,
    totalResourceDownloads: totals.resourceDownloads,
  };

  await iGM_WriteSnapshot(
    "overview",
    "latest",
    JSON.stringify(overview),
    new Date().toISOString(),
  );
  return { ...overview, onlineUsers };
}

/* ---------- 趋势 ---------- */

/** 趋势序列：按日聚合指定指标（最近 N 天，含今天） */
export async function iGM_GetStatsTrend(
  metric: iGM_StatsTrendMetric,
  range: iGM_StatsRange,
): Promise<iGM_StatsTrendPoint[]> {
  await iGM_EnsureYesterdayAggregated();
  const { days } = iGM_ParseRange(range);
  const dates = iGM_RecentDates(days);

  return Promise.all(
    dates.map(async (date) => {
      const { startIso, endIso } = iGM_ShanghaiDayBounds(date);
      let value = 0;
      switch (metric) {
        case "users":
          value = await iGM_CountUsersBetween(startIso, endIso);
          break;
        case "posts":
          value = await iGM_CountPostsBetween(startIso, endIso);
          break;
        case "comments":
          value = await iGM_CountCommentsBetween(startIso, endIso);
          break;
        case "activity":
          value = await iGM_CountActiveUsersBetween(startIso, endIso, date);
          break;
      }
      return { date, value };
    }),
  );
}

/* ---------- 排行榜 ---------- */

/** 排行榜：热门帖子 / 热门资源 / 活跃用户（各 Top 10） */
export async function iGM_GetStatsLeaderboards(range: iGM_StatsRange): Promise<iGM_StatsLeaderboards> {
  await iGM_EnsureYesterdayAggregated();
  const { days } = iGM_ParseRange(range);
  const startIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const endIso = new Date().toISOString();

  return {
    hotPosts: (await iGM_ListHotPosts(startIso, endIso, 10)).map((row) => ({
      id: row.iGM_Id,
      title: row.iGM_Title,
      authorName: row.iGM_AuthorName,
      likeCount: row.iGM_LikeCount,
      commentCount: row.iGM_CommentCount,
      score: row.iGM_Score,
    })),
    hotResources: (await iGM_ListHotResources(10)).map((row) => ({
      id: row.iGM_Id,
      title: row.iGM_Title,
      uploaderName: row.iGM_UploaderName,
      downloadCount: row.iGM_DownloadCount,
    })),
    activeUsers: await Promise.all(
      (await iGM_ListActiveUsers(startIso, endIso, 10)).map(async (row) => ({
        userId: row.iGM_Id,
        username: row.iGM_Username,
        displayName: row.iGM_DisplayName,
        avatar: row.iGM_Avatar,
        verifiedOrg: await iGM_ResolveUserOrgBadge(row.iGM_VerifiedOrgId, row.iGM_Email),
        actionCount: row.iGM_ActionCount,
      })),
    ),
  };
}

/* ---------- 活动参与统计 ---------- */

/** 活动参与统计：范围内创建的活动及其有效报名数 */
export async function iGM_GetStatsActivities(range: iGM_StatsRange): Promise<iGM_StatsActivities> {
  const { days } = iGM_ParseRange(range);
  const startIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const endIso = new Date().toISOString();
  const rows: iGM_ActivityStatRow[] = await iGM_ListActivityStats(startIso, endIso);

  return {
    totalActivities: rows.length,
    totalRegistrations: rows.reduce((sum, row) => sum + row.iGM_RegistrationCount, 0),
    items: rows.map((row) => ({
      id: row.iGM_Id,
      title: row.iGM_Title,
      status: row.iGM_Status,
      startTime: row.iGM_StartTime,
      createdAt: row.iGM_CreatedAt,
      registrationCount: row.iGM_RegistrationCount,
    })),
  };
}

// 导出 //
export default {
  iGM_ParseRange,
  iGM_GetStatsOverview,
  iGM_GetStatsTrend,
  iGM_GetStatsLeaderboards,
  iGM_GetStatsActivities,
};
