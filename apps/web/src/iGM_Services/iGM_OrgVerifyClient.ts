/**
 * 文件路径：apps/web/src/iGM_Services/iGM_OrgVerifyClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_OrgVerify/* 与 /G_Admin/org-verifications/*
 * 模块：iGM_OrgVerifyClient
 * 作用：模块七组织认证相关后端接口的唯一前端调用出口
 * 内容：受信任组织列表、公开组织详情、我的组织详情、提交申请、我的申请记录、
 *       取消申请、退出组织、负责人编辑关于组织；
 *       管理端/负责人申请列表（状态+组织筛选）、申请详情、审核（通过/拒绝）
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_OrgVerify.ts 保持一致；
 *       权限由后端严格校验，前端仅做展示层控制
 */

// 导入依赖 //
import { iGM_Get, iGM_Post, type iGM_ApiResponse } from "./iGM_Request";

// 类型定义 //
/** 申请状态（与后端 iGM_OrgVerifyStatus 一致） */
export type iGM_OrgVerifyStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "left";

/** 认证组织徽标（内嵌于作者/用户资料 DTO） */
export interface iGM_OrgBadge {
  id: string;
  name: string;
  slug: string;
  /** 模块七第三轮：该用户是否为组织负责人（所有者金标） */
  isOwner?: boolean;
}

/** 受信任组织（申请页卡片 / 组织详情） */
export interface iGM_Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** 模块七增强：关于组织内容（负责人可编辑） */
  aboutContent: string;
  logo: string | null;
  /**
   * 社交生态优化：登记负责人账号是否已入驻。
   * 仅受信任组织列表下发；false 时申请将长期挂起，申请页展示官方联系提示。
   */
  hasOwner?: boolean;
}

/** 我的组织详情：组织信息 + 当前用户是否为负责人 */
export interface iGM_MyOrgDetail {
  organization: iGM_Organization;
  isOwner: boolean;
}

/** 我的申请记录条目 */
export interface iGM_OrgVerification {
  id: string;
  org: iGM_OrgBadge;
  reason: string;
  /** 证明材料：文本说明或站内文件 ID */
  proof: string | null;
  status: iGM_OrgVerifyStatus;
  reviewComment: string | null;
  reviewerName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 管理端申请条目（附申请人信息） */
export interface iGM_AdminOrgVerification extends iGM_OrgVerification {
  userId: string;
  username: string;
  userDisplayName: string | null;
  userAvatar: string | null;
  userEmail: string;
  /**
   * 当前查看者是否可审核该条申请。
   * 社交生态优化后仅对应组织负责人（且非本人申请）为 true；
   * admin/moderator 只读恒为 false，以前端不渲染操作控件。
   */
  canReview: boolean;
}

/** 管理端申请分页数据 */
export interface iGM_AdminOrgVerificationPage {
  items: iGM_AdminOrgVerification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 当前查看者视角：true=负责人可操作视图；false=管理只读视图（后端权威） */
  canReview: boolean;
}

/** 组织成员条目（组织详情页公开成员列表） */
export interface iGM_OrgMember {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  /** 11 位全局唯一 UID */
  uid: string;
  /** 加入组织时间；历史数据缺失时为 null */
  joinedAt: string | null;
  /** 是否为该组织负责人 */
  isOwner: boolean;
}

/** 组织成员列表数据（公开只读） */
export interface iGM_OrgMemberListData {
  organization: iGM_OrgBadge;
  items: iGM_OrgMember[];
}

// 核心逻辑 //
/* ---------- 用户侧 ---------- */

/** 受信任组织列表（公开） */
export function iGM_ApiOrgVerifyOrganizations(): Promise<
  iGM_ApiResponse<{ items: iGM_Organization[] }>
> {
  return iGM_Get("/G_OrgVerify/organizations");
}

/** 公开组织详情（G_OrgDetails，支持 id 或 slug） */
export function iGM_ApiOrgDetail(input: {
  orgId?: string | null;
  slug?: string | null;
}): Promise<iGM_ApiResponse<{ organization: iGM_Organization }>> {
  const params = new URLSearchParams();
  if (input.orgId) params.set("orgId", input.orgId);
  if (input.slug) params.set("slug", input.slug);
  return iGM_Get(`/G_OrgVerify/org-detail?${params.toString()}`);
}

/** 组织公开成员列表（G_OrgDetails 成员区，支持 id 或 slug） */
export function iGM_ApiOrgMembers(input: {
  orgId?: string | null;
  slug?: string | null;
}): Promise<iGM_ApiResponse<iGM_OrgMemberListData>> {
  const params = new URLSearchParams();
  if (input.orgId) params.set("orgId", input.orgId);
  if (input.slug) params.set("slug", input.slug);
  return iGM_Get(`/G_OrgVerify/org-members?${params.toString()}`);
}

/** 我的组织详情（需登录，附当前用户负责人标记） */
export function iGM_ApiOrgVerifyMyOrg(): Promise<
  iGM_ApiResponse<iGM_MyOrgDetail>
> {
  return iGM_Get("/G_OrgVerify/my-org");
}

/** 提交组织认证申请（需登录） */
export function iGM_ApiOrgVerifySubmit(input: {
  orgId: string;
  reason: string;
  proof?: string | null;
}): Promise<iGM_ApiResponse<{ verification: iGM_OrgVerification }>> {
  return iGM_Post("/G_OrgVerify/submit", input, 15000);
}

/** 我的申请记录（需登录） */
export function iGM_ApiOrgVerifyMine(): Promise<
  iGM_ApiResponse<{ items: iGM_OrgVerification[] }>
> {
  return iGM_Get("/G_OrgVerify/my");
}

/** 取消待审核申请（需登录，仅本人 pending） */
export function iGM_ApiOrgVerifyCancel(
  verificationId: string,
): Promise<iGM_ApiResponse<{ verificationId: string }>> {
  return iGM_Post("/G_OrgVerify/cancel", { verificationId });
}

/** 退出已认证组织（需登录；可选退出理由） */
export function iGM_ApiOrgLeave(
  reason?: string | null,
): Promise<iGM_ApiResponse<null>> {
  return iGM_Post("/G_OrgVerify/leave", { reason: reason ?? null }, 15000);
}

/** 负责人编辑“关于组织”（需登录且为该组织负责人） */
export function iGM_ApiUpdateOrgAbout(input: {
  orgId: string;
  aboutContent: string;
}): Promise<iGM_ApiResponse<{ organization: iGM_Organization }>> {
  return iGM_Post("/G_OrgVerify/update-about", input, 15000);
}

/* ---------- 管理端 / 负责人 ---------- */

/** 申请列表（状态筛选 + 组织筛选 + 分页；权限范围由后端按审核人过滤） */
export function iGM_ApiAdminOrgVerifications(
  status: iGM_OrgVerifyStatus | null,
  page = 1,
  pageSize = 10,
  orgId?: string | null,
): Promise<iGM_ApiResponse<iGM_AdminOrgVerificationPage>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status) params.set("status", status);
  if (orgId) params.set("orgId", orgId);
  return iGM_Get(`/G_Admin/org-verifications?${params.toString()}`);
}

/** 申请详情（admin / 对应组织负责人） */
export function iGM_ApiAdminOrgVerificationDetail(
  id: string,
): Promise<iGM_ApiResponse<{ verification: iGM_AdminOrgVerification }>> {
  return iGM_Get(`/G_Admin/org-verifications/detail?id=${encodeURIComponent(id)}`);
}

/** 审核申请（通过/拒绝 + 审核意见） */
export function iGM_ApiAdminOrgVerificationReview(input: {
  verificationId: string;
  action: "approve" | "reject";
  comment?: string | null;
}): Promise<iGM_ApiResponse<{ verificationId: string; action: string }>> {
  return iGM_Post("/G_Admin/org-verifications/review", input, 15000);
}

// 导出 //
export default {
  iGM_ApiOrgVerifyOrganizations,
  iGM_ApiOrgDetail,
  iGM_ApiOrgMembers,
  iGM_ApiOrgVerifyMyOrg,
  iGM_ApiOrgVerifySubmit,
  iGM_ApiOrgVerifyMine,
  iGM_ApiOrgVerifyCancel,
  iGM_ApiOrgLeave,
  iGM_ApiUpdateOrgAbout,
  iGM_ApiAdminOrgVerifications,
  iGM_ApiAdminOrgVerificationDetail,
  iGM_ApiAdminOrgVerificationReview,
};
