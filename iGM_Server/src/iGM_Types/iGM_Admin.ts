/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Admin.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Admin
 * 模块：iGM_Admin
 * 作用：定义管理后台领域共享类型
 * 内容：操作日志与举报表数据行、后台用户/内容/日志/概览 DTO 类型
 */

// 导入依赖 //
import type { iGM_UserRole, iGM_UserStatus } from "./iGM_Auth";

// 类型定义 //
/** iGM_AdminLogs 表数据行 */
export interface iGM_AdminLogRow {
  iGM_Id: string;
  iGM_AdminId: string;
  iGM_Action: string;
  iGM_TargetType: string | null;
  iGM_TargetId: string | null;
  iGM_Detail: string | null;
  iGM_CreatedAt: string;
}

/** iGM_Reports 表数据行 */
export interface iGM_ReportRow {
  iGM_Id: string;
  iGM_ReporterId: string;
  iGM_TargetType: string;
  iGM_TargetId: string;
  iGM_Reason: string;
  iGM_Status: "pending" | "resolved" | "dismissed";
  iGM_HandlerId: string | null;
  iGM_CreatedAt: string;
  iGM_HandledAt: string | null;
}

/* ---------- 对外 DTO ---------- */

/** 后台用户条目 DTO */
export interface iGM_AdminUserDto {
  id: string;
  username: string;
  email: string;
  role: iGM_UserRole;
  status: iGM_UserStatus;
  emailVerified: boolean;
  displayName: string | null;
  avatar: string | null;
  createdAt: string;
  totalPoints: number;
  postCount: number;
  commentCount: number;
}

/** 后台内容条目 DTO（帖子或评论统一形态） */
export interface iGM_AdminContentDto {
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

/** 后台举报条目 DTO */
export interface iGM_AdminReportDto {
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

/** 后台日志条目 DTO */
export interface iGM_AdminLogDto {
  id: string;
  adminId: string;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

/** 数据概览 DTO */
export interface iGM_AdminOverviewDto {
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
