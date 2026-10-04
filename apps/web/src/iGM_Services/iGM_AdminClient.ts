/**
 * 文件路径：apps/web/src/iGM_Services/iGM_AdminClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Admin/*
 * 模块：iGM_AdminClient
 * 作用：管理后台相关后端接口的唯一前端调用出口
 * 内容：数据概览、用户列表、封禁/解封、修改角色、删除用户、内容列表、审核与删除、
 *       举报列表与处理、测试邮件、操作日志、系统信息
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Admin.ts 保持一致；
 *       权限由后端严格校验，前端仅做展示层控制
 */

// 导入依赖 //
import { iGM_Get, iGM_Post, type iGM_ApiResponse } from "./iGM_Request";
import type { iGM_UserRole } from "./iGM_AuthClient";
import type { iGM_OrgBadge } from "./iGM_OrgVerifyClient";

// 类型定义 //
/** 用户状态（与后端 iGM_Types/iGM_Auth.ts 定义一致） */
export type iGM_UserStatus = "active" | "suspended";

/** 数据概览 */
export interface iGM_AdminOverview {
  users: number;
  usersToday: number;
  usersSuspended: number;
  posts: number;
  postsToday: number;
  comments: number;
  resources: number;
  activities: number;
  reportsPending: number;
  checkinsToday: number;
}

/** 后台用户条目 */
export interface iGM_AdminUser {
  id: string;
  /** 模块七增强：11 位全局唯一 iGMUid */
  uid: string;
  username: string;
  email: string;
  role: iGM_UserRole;
  status: iGM_UserStatus;
  emailVerified: boolean;
  displayName: string | null;
  avatar: string | null;
  // 模块七：认证组织徽标（未认证为 null；负责人带 isOwner 金标）
  verifiedOrg: iGM_OrgBadge | null;
  // 模块二十五：注册 / 最后登录 IP 与归属地、异常 IP 标记
  registerIp: string | null;
  lastLoginIp: string | null;
  ipLocation: iGM_IpLocation;
  /** 同 IP 关联账户数超过阈值（管理员 / 测试账号不参与） */
  ipAbnormal: boolean;
  ipRelatedCount: number;
  createdAt: string;
  totalPoints: number;
  postCount: number;
  commentCount: number;
}

/** IP 归属地（本地解析：回环 / 内网无国家地区城市；公网 IP 三段可能为空） */
export interface iGM_IpLocation {
  country: string | null;
  region: string | null;
  city: string | null;
  kind: "loopback" | "private" | "public";
}

/** 模块二十五：已通过开发者账号条目 */
export interface iGM_DeveloperAccount {
  applicationId: string;
  userId: string;
  username: string;
  displayName: string | null;
  uid: string;
  contact: string;
  projectName: string;
  appliedAt: string;
}

/** 模块二十五：开发者调用量监测数据 */
export interface iGM_DeveloperCallStats {
  days: number;
  total: number;
  /** 通道汇总：api / sdk / app 及后续扩展通道 */
  channels: Record<string, number>;
  /** 按日序列（UTC，无数据补 0） */
  daily: Array<{ date: string } & Record<string, number | string>>;
  /** 按应用调用量 Top 20 */
  topClients: Array<{ clientId: string; count: number }>;
}

/** AI 赋能系统模块三：AI 调用统计时间范围（日 / 周 / 月） */
export type iGM_AICallStatsRange = "day" | "week" | "month";

/** AI 赋能系统模块三：单通道额度统计（UPR 聚合自 iGM_UPRTransactions，SPR 聚合自 iGM_SPRTransactions） */
export interface iGM_AICallStatsChannel {
  /** 时间范围内总调用次数 */
  totalCalls: number;
  /** 时间范围内总消耗额度 */
  totalConsumed: number;
  /** 当日消耗额度（不随时间范围变化） */
  todayConsumed: number;
}

/** SPR 通道统计：较 UPR 多收入口径（1 SPR = 1 元） */
export interface iGM_AICallStatsSprChannel extends iGM_AICallStatsChannel {
  /** 时间范围内总收入（元） */
  totalRevenue: number;
}

/** 消耗排行 Top 10 条目 */
export interface iGM_AICallStatsUser {
  userId: string;
  username: string;
  displayName: string | null;
  consumed: number;
  calls: number;
}

/** AI 赋能系统模块三：AI 双通道调用统计（UPR / SPR） */
export interface iGM_AICallStats {
  range: iGM_AICallStatsRange;
  upr: iGM_AICallStatsChannel;
  spr: iGM_AICallStatsSprChannel;
  /** UPR 消耗排行 Top 10 用户 */
  topUprUsers: iGM_AICallStatsUser[];
  /** SPR 消耗排行 Top 10 用户 */
  topSprUsers: iGM_AICallStatsUser[];
}

/** 后台内容条目（帖子或评论统一形态） */
export interface iGM_AdminContent {
  type: "post" | "comment";
  id: string;
  /** 帖子标题；评论为所属帖子标题 */
  title: string;
  excerpt: string;
  status: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
}

/** 后台举报条目 */
export interface iGM_AdminReport {
  id: string;
  reporterId: string;
  reporterName: string | null;
  targetType: string;
  targetId: string;
  /** 目标摘要（帖子标题或评论内容前若干字） */
  targetSummary: string | null;
  /** 目标当前状态（可能已被删除） */
  targetStatus: string | null;
  reason: string;
  status: "pending" | "resolved" | "dismissed";
  handlerId: string | null;
  handlerName: string | null;
  createdAt: string;
  handledAt: string | null;
}

/** 操作日志条目 */
export interface iGM_AdminLog {
  id: string;
  adminId: string;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

/** 通用分页数据 */
export interface iGM_AdminPaged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 核心逻辑 //
/** 数据概览（moderator 及以上） */
export function iGM_ApiAdminOverview(): Promise<
  iGM_ApiResponse<iGM_AdminOverview>
> {
  return iGM_Get("/G_Admin/overview");
}

/** 用户列表（moderator 及以上；query 为用户名/邮箱检索） */
export function iGM_ApiAdminUsers(
  query: string,
  page = 1,
  pageSize = 10,
): Promise<iGM_ApiResponse<iGM_AdminPaged<iGM_AdminUser>>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (query.trim()) params.set("query", query.trim());
  return iGM_Get(`/G_Admin/users?${params.toString()}`);
}

/** 封禁/解封用户（仅 admin） */
export function iGM_ApiAdminSetUserStatus(
  userId: string,
  status: "active" | "suspended",
): Promise<iGM_ApiResponse<{ userId: string; status: string }>> {
  return iGM_Post("/G_Admin/users/status", { userId, status });
}

/** 修改用户角色（仅 admin） */
export function iGM_ApiAdminSetUserRole(
  userId: string,
  role: iGM_UserRole,
): Promise<iGM_ApiResponse<{ userId: string; role: string }>> {
  return iGM_Post("/G_Admin/users/role", { userId, role });
}

/** 模块七第三轮：管理员直接删除用户账号（仅 admin，无需邮箱验证码） */
export function iGM_ApiAdminDeleteUser(
  userId: string,
): Promise<iGM_ApiResponse<{ userId: string }>> {
  return iGM_Post("/G_Admin/users/delete", { userId });
}

/** 内容列表（moderator 及以上；type=post|comment） */
export function iGM_ApiAdminContents(input: {
  type: "post" | "comment";
  search: string;
  status: string | null;
  page?: number;
  pageSize?: number;
}): Promise<iGM_ApiResponse<iGM_AdminPaged<iGM_AdminContent>>> {
  const params = new URLSearchParams({
    type: input.type,
    page: String(input.page ?? 1),
    pageSize: String(input.pageSize ?? 10),
  });
  if (input.search.trim()) params.set("search", input.search.trim());
  if (input.status) params.set("status", input.status);
  return iGM_Get(`/G_Admin/contents?${params.toString()}`);
}

/** 内容审核：隐藏/恢复/删除（moderator 及以上） */
export function iGM_ApiAdminReviewContent(
  type: "post" | "comment",
  contentId: string,
  action: "hide" | "restore" | "delete",
): Promise<iGM_ApiResponse<{ type: string; contentId: string; action: string }>> {
  return iGM_Post("/G_Admin/contents/review", { type, contentId, action });
}

/** 举报列表（moderator 及以上；status 可选过滤） */
export function iGM_ApiAdminReports(
  status: "pending" | "resolved" | "dismissed" | null,
  page = 1,
  pageSize = 10,
): Promise<iGM_ApiResponse<iGM_AdminPaged<iGM_AdminReport>>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status) params.set("status", status);
  return iGM_Get(`/G_Admin/reports?${params.toString()}`);
}

/** 处理举报（moderator 及以上；contentAction 可联动隐藏/删除目标内容） */
export function iGM_ApiAdminHandleReport(
  reportId: string,
  decision: "resolved" | "dismissed",
  contentAction: "none" | "hide" | "delete" = "none",
): Promise<iGM_ApiResponse<{ reportId: string; decision: string }>> {
  return iGM_Post("/G_Admin/reports/handle", {
    reportId,
    decision,
    contentAction,
  });
}

/** 发送测试邮件（仅 admin） */
export function iGM_ApiAdminSendTestMail(
  to: string,
): Promise<iGM_ApiResponse<{ sent: boolean }>> {
  return iGM_Post("/G_Admin/mails/test", { to });
}

/** 操作日志（moderator 及以上，分页） */
export function iGM_ApiAdminLogs(
  page = 1,
  pageSize = 20,
): Promise<iGM_ApiResponse<iGM_AdminPaged<iGM_AdminLog>>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return iGM_Get(`/G_Admin/logs?${params.toString()}`);
}

/** 系统信息（只读，管理员 + 受信任组织负责人） */
export function iGM_ApiAdminSettings(): Promise<
  iGM_ApiResponse<Record<string, unknown>>
> {
  return iGM_Get("/G_Admin/settings");
}

/** 模块二十五：已通过开发者账号列表（管理员 + 组织负责人） */
export function iGM_ApiAdminDeveloperAccounts(): Promise<
  iGM_ApiResponse<{ items: iGM_DeveloperAccount[]; total: number }>
> {
  return iGM_Get("/G_Admin/developers/accounts");
}

/** 模块二十五：开发者调用量监测（days 仅允许 7 / 30 / 90） */
export function iGM_ApiAdminDeveloperCallStats(
  days: 7 | 30 | 90,
): Promise<iGM_ApiResponse<iGM_DeveloperCallStats>> {
  return iGM_Get(`/G_Admin/developers/call-stats?days=${days}`);
}

/** AI 赋能系统模块二：AI 调用额度统计（开发者分区 - 调用量） */
export function iGM_ApiAdminAICallStats(
  range: iGM_AICallStatsRange,
): Promise<iGM_ApiResponse<iGM_AICallStats>> {
  return iGM_Get(`/G_Admin/ai-usage-stats?range=${range}`);
}

// 导出 //
export default {
  iGM_ApiAdminOverview,
  iGM_ApiAdminUsers,
  iGM_ApiAdminSetUserStatus,
  iGM_ApiAdminSetUserRole,
  iGM_ApiAdminDeleteUser,
  iGM_ApiAdminContents,
  iGM_ApiAdminReviewContent,
  iGM_ApiAdminReports,
  iGM_ApiAdminHandleReport,
  iGM_ApiAdminSendTestMail,
  iGM_ApiAdminLogs,
  iGM_ApiAdminSettings,
  iGM_ApiAdminDeveloperAccounts,
  iGM_ApiAdminDeveloperCallStats,
  iGM_ApiAdminAICallStats,
};
