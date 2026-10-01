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
  /** 模块十五：该等级是否需通过考核方可升级 */
  isExamRequired: boolean;
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
  /** 模块十五：稀有度 common 普通 / rare 稀有 / legendary 传说 */
  rarity: string;
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
  /** 模块十五：赛季标识（每季任务使用，每周任务为 null） */
  seasonId: string | null;
  sortOrder: number;
  progress: number;
  isCompleted: boolean;
  /** 模块十五：奖励是否已领取 */
  isClaimed: boolean;
}

/** 等级考核记录 */
export interface iGM_LevelExam {
  id: string;
  levelId: string;
  levelName: string | null;
  /** pending 待审核 / approved 已通过 / rejected 未通过 */
  status: string;
  content: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 升级进度 */
export interface iGM_LevelProgress {
  totalPoints: number;
  level: iGM_Level | null;
  nextLevel: iGM_Level | null;
  pointsToNext: number;
  pointsReached: boolean;
  nextLevelExamRequired: boolean;
  /** 下一等级考核状态：none / pending / approved / rejected */
  examStatus: string;
  canLevelUp: boolean;
}

/** 我的考核记录与进度 */
export interface iGM_MyExamsData {
  progress: iGM_LevelProgress;
  exams: iGM_LevelExam[];
}

/** 任务奖励领取结果 */
export interface iGM_TaskClaimResult {
  taskId: string;
  pointsEarned: number;
  totalPoints: number;
  level: iGM_Level | null;
  levelUp: boolean;
  newBadges: iGM_Badge[];
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

/** 模块十五：我的升级进度（登录） */
export function iGM_ApiGetLevelProgress(): Promise<
  iGM_ApiResponse<iGM_LevelProgress>
> {
  return iGM_Get("/G_Points/levels/progress");
}

/** 模块十五：我的考核记录与进度（登录） */
export function iGM_ApiListMyExams(): Promise<
  iGM_ApiResponse<iGM_MyExamsData>
> {
  return iGM_Get("/G_Points/levels/exams");
}

/** 模块十五：提交等级考核申请（登录，限流） */
export function iGM_ApiSubmitLevelExam(input: {
  levelId: string;
  content?: string;
}): Promise<iGM_ApiResponse<iGM_LevelExam>> {
  return iGM_Post("/G_Points/levels/exam", input);
}

/** 勋章列表（公开；登录时附带获得状态；rarity 可选筛选） */
export function iGM_ApiListBadges(
  rarity?: "common" | "rare" | "legendary",
): Promise<iGM_ApiResponse<{ badges: iGM_Badge[] }>> {
  const path = rarity
    ? `/G_Points/badges?rarity=${encodeURIComponent(rarity)}`
    : "/G_Points/badges";
  return iGM_Get(path);
}

/** 任务列表与进度（公开；登录时附带进度；type 可选筛选） */
export function iGM_ApiListTasks(
  type?: "weekly" | "seasonal",
): Promise<iGM_ApiResponse<{ tasks: iGM_Task[] }>> {
  const path = type
    ? `/G_Points/tasks?type=${encodeURIComponent(type)}`
    : "/G_Points/tasks";
  return iGM_Get(path);
}

/** 模块十五：领取任务奖励（登录，限流） */
export function iGM_ApiClaimTask(
  taskId: string,
): Promise<iGM_ApiResponse<iGM_TaskClaimResult>> {
  return iGM_Post("/G_Points/tasks/claim", { taskId });
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
  iGM_ApiGetLevelProgress,
  iGM_ApiListMyExams,
  iGM_ApiSubmitLevelExam,
  iGM_ApiListBadges,
  iGM_ApiListTasks,
  iGM_ApiClaimTask,
  iGM_ApiGetLeaderboard,
};
