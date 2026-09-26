/**
 * 文件路径：apps/web/src/iGM_Services/iGM_StatsClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：G_Dashboard、G_StatsDetail
 * 模块：iGM_StatsClient
 * 作用：运营统计接口封装——核心指标、趋势、排行榜、活动统计
 * 内容：与后端 /G_Stats/* 对应的类型化请求函数
 */

// 导入依赖 //
import { iGM_Get } from "./iGM_Request";

// 类型定义 //
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

/** 趋势序列数据点 */
export interface iGM_StatsTrendPoint {
  date: string;
  value: number;
}

/** 排行榜 */
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
  activeUsers: {
    userId: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    verifiedOrg: { id: string; name: string; slug: string; isOwner?: boolean } | null;
    actionCount: number;
  }[];
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

/** 趋势指标枚举 */
export type iGM_StatsMetric = "users" | "posts" | "comments" | "activity";

// 核心逻辑 //
/** 获取核心指标概览 */
export function iGM_ApiStatsOverview() {
  return iGM_Get<{ overview: iGM_StatsOverview }>("/G_Stats/overview");
}

/** 获取指定指标的趋势序列 */
export function iGM_ApiStatsTrend(metric: iGM_StatsMetric, range: "7d" | "30d" | "90d") {
  return iGM_Get<{
    metric: string;
    range: string;
    series: iGM_StatsTrendPoint[];
  }>(`/G_Stats/trends?metric=${metric}&range=${range}`);
}

/** 获取排行榜 */
export function iGM_ApiStatsLeaderboards(range: "7d" | "30d" | "90d") {
  return iGM_Get<{ range: string } & iGM_StatsLeaderboards>(
    `/G_Stats/leaderboards?range=${range}`,
  );
}

/** 获取活动参与统计 */
export function iGM_ApiStatsActivities(range: "7d" | "30d" | "90d") {
  return iGM_Get<{ range: string } & iGM_StatsActivities>(
    `/G_Stats/activities?range=${range}`,
  );
}

// 导出 //
export default {
  iGM_ApiStatsOverview,
  iGM_ApiStatsTrend,
  iGM_ApiStatsLeaderboards,
  iGM_ApiStatsActivities,
};
