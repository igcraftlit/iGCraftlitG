/**
 * 文件路径：apps/web/src/iGM_Services/iGM_PointsClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Points/*
 * 模块：iGM_PointsClient
 * 作用：积分、等级、勋章、签到、任务与排行榜相关后端接口的唯一前端调用出口
 * 内容：我的积分概览、积分记录、签到与签到状态、等级规则、勋章列表、
 *       任务列表与进度、排行榜（总量/周增量）
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Points.ts 保持一致
 */

// 导入依赖 //
import { iGM_Get, iGM_Post, type iGM_ApiResponse } from "./iGM_Request";

// 类型定义 //
/** 等级 */
export interface iGM_Level {
  id: string;
  name: string;
  minPoints: number;
  maxPoints: number | null;
  icon: string | null;
  sortOrder: number;
}

/** 积分流水条目 */
export interface iGM_PointsRecord {
  id: string;
  points: number;
  action: string;
  description: string | null;
  createdAt: string;
}

/** 我的积分概览 */
export interface iGM_MyPoints {
  totalPoints: number;
  level: iGM_Level | null;
  nextLevel: iGM_Level | null;
  pointsToNext: number;
}

/** 积分记录分页数据 */
export interface iGM_PointsRecordsData {
  items: iGM_PointsRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 排行榜条目 */
export interface iGM_LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  totalPoints: number;
  weeklyPoints: number;
  levelId: string | null;
  levelName: string | null;
}

/** 勋章（含我的获得状态） */
export interface iGM_Badge {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  conditionType: string;
  conditionValue: number;
  granted: boolean;
  grantedAt: string | null;
}

/** 任务（含我的进度） */
export interface iGM_Task {
  id: string;
  name: string;
  description: string;
  action: string;
  targetCount: number;
  rewardPoints: number;
  taskType: string;
  sortOrder: number;
  progress: number;
  isCompleted: boolean;
}

/** 签到状态 */
export interface iGM_CheckinStatus {
  checkedToday: boolean;
  continuousDays: number;
  todayPoints: number;
  monthDates: string[];
}

/** 签到结果 */
export interface iGM_CheckinResult {
  checkinDate: string;
  pointsEarned: number;
  continuousDays: number;
  totalPoints: number;
  level: iGM_Level | null;
  levelUp: boolean;
  newBadges: iGM_Badge[];
}

// 核心逻辑 //
/** 我的积分概览（登录） */
export function iGM_ApiGetMyPoints(): Promise<iGM_ApiResponse<iGM_MyPoints>> {
  return iGM_Get("/G_Points/me");
}

/** 我的积分记录（登录，分页） */
export function iGM_ApiListPointsRecords(
  page = 1,
  pageSize = 10,
): Promise<iGM_ApiResponse<iGM_PointsRecordsData>> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return iGM_Get(`/G_Points/records?${query.toString()}`);
}

/** 每日签到（登录，限流） */
export function iGM_ApiCheckin(): Promise<iGM_ApiResponse<iGM_CheckinResult>> {
  return iGM_Post("/G_Points/checkin", {});
}

/** 签到状态：今日是否已签、连续天数、预估积分与本月日历（登录） */
export function iGM_ApiGetCheckinStatus(): Promise<
  iGM_ApiResponse<iGM_CheckinStatus>
> {
  return iGM_Get("/G_Points/checkin-status");
}

/** 等级规则列表（公开） */
export function iGM_ApiListLevels(): Promise<
  iGM_ApiResponse<{ levels: iGM_Level[] }>
> {
  return iGM_Get("/G_Points/levels");
}

/** 勋章列表（公开；登录时附带获得状态） */
export function iGM_ApiListBadges(): Promise<
  iGM_ApiResponse<{ badges: iGM_Badge[] }>
> {
  return iGM_Get("/G_Points/badges");
}

/** 任务列表与进度（公开；登录时附带进度） */
export function iGM_ApiListTasks(): Promise<
  iGM_ApiResponse<{ tasks: iGM_Task[] }>
> {
  return iGM_Get("/G_Points/tasks");
}

/** 排行榜（公开；sort=total 按总量 / weekly 按周增量） */
export function iGM_ApiGetLeaderboard(
  sort: "total" | "weekly" = "total",
  limit = 20,
): Promise<
  iGM_ApiResponse<{ sort: "total" | "weekly"; items: iGM_LeaderboardEntry[] }>
> {
  const query = new URLSearchParams({ sort, limit: String(limit) });
  return iGM_Get(`/G_Points/leaderboard?${query.toString()}`);
}

// 导出 //
export default {
  iGM_ApiGetMyPoints,
  iGM_ApiListPointsRecords,
  iGM_ApiCheckin,
  iGM_ApiGetCheckinStatus,
  iGM_ApiListLevels,
  iGM_ApiListBadges,
  iGM_ApiListTasks,
  iGM_ApiGetLeaderboard,
};
