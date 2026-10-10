/**
 * 文件路径：apps/web/src/iGM_Services/iGM_DeveloperClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Developer/*
 * 模块：iGM_DeveloperClient
 * 作用：开发者资格（SDK / 适配器协议）与开发者平台准入状态相关后端接口的唯一前端调用出口
 * 内容：开发者能力说明、提交 / 重新申请、我的申请状态与历史、撤回申请、
 *       待审核列表与审核（组织所有者与管理员），
 *       模块二十二：开发者平台准入状态查询（凭站点登录会话，无需密钥）
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Developer.ts 保持一致；
 *       审核只变更状态与意见，通过即授予接入资格（不发放 API Key）
 */

// 导入依赖 //
import {
  iGM_Get,
  iGM_Post,
  type iGM_ApiResponse,
} from "./iGM_Request";

// 类型定义 //
/** 申请状态：pending 待审核 / approved 已通过 / rejected 已拒绝 / withdrawn 已撤回 */
export type iGM_DeveloperStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn";

/** 项目类型：launcher 启动器 / tool 工具 / website 网站 / plugin 插件 / other 其他 */
export type iGM_DeveloperProjectType =
  | "launcher"
  | "tool"
  | "website"
  | "plugin"
  | "other";

/** 预期调用量：low 低 / medium 中 / high 高 */
export type iGM_DeveloperQuota = "low" | "medium" | "high";

/** 模块十六：开发者接入界面（CLI / API）外部地址 */
export const iGM_DeveloperConsoleUrl = "https://cli.igcraftlit.com";

/** 开发者入口目标：intro 申请初始界面 / status 状态页 / console 接入界面（外链） */
export type iGM_DeveloperEntryTarget = "intro" | "status" | "console";

/**
 * 解析「成为开发者」入口的目标页：
 * 组织所有者免申请、直接接入；审核通过进入接入界面；
 * 待审核进入状态页；无申请、已拒绝或已撤回进入初始界面（申请 / 文档 / 公示）。
 */
export function iGM_ResolveDeveloperEntry(
  isOrgOwner: boolean,
  status: string | null,
): iGM_DeveloperEntryTarget {
  if (isOrgOwner || status === "approved") return "console";
  if (status === "pending") return "status";
  return "intro";
}

/** 开发者申请 */
export interface iGM_DeveloperApplication {
  id: string;
  userId: string;
  projectName: string;
  projectType: string;
  projectDesc: string;
  projectUrl: string | null;
  contact: string;
  expectedQuota: string | null;
  reason: string;
  status: string;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewComment: string | null;
  /* ---------- 模块二十六：规范化新增字段 ---------- */
  developerName: string | null;
  age: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  domain: string | null;
  additional: string | null;
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 提交 / 重新申请入参（模块二十六规范化表单） */
export interface iGM_DeveloperApplyPayload {
  developerName: string;
  age: number;
  birthMonth: number;
  birthDay: number;
  contactEmail?: string;
  contactPhone?: string;
  country: string;
  province: string;
  city: string;
  address: string;
  postalCode: string;
  projectName: string;
  /** 项目介绍（> 100 字） */
  projectIntro: string;
  /** 申请人域名（可选） */
  domain?: string;
  /** 申请理由（> 200 字） */
  reason: string;
  /** 附加说明（可选） */
  additional?: string;
  agreeRules: boolean;
}

/** 我的开发者申请状态与历史 */
export interface iGM_MyDeveloperData {
  latest: iGM_DeveloperApplication | null;
  history: iGM_DeveloperApplication[];
  /** 当前用户是否具备审核资格（组织所有者或管理员） */
  canReview: boolean;
}

/** 开发者能力说明 */
export interface iGM_DeveloperIntro {
  /** 能力标识：sdk / adapter-protocol */
  capabilities: string[];
  /** 审核分发规则：organization-owners（任一组织所有者同意即可通过） */
  reviewBy: string;
  /** 当前是否仍完全放开调用 */
  openAccess: boolean;
}

/* ---------- 模块二十二：开发者平台准入状态 ---------- */

/** 开发者平台准入状态：登录后查询，isDeveloper=false 表示尚未通过开发者申请 */
export interface iGM_DeveloperPortalStatus {
  isDeveloper: boolean;
  uid: string;
  username: string;
  displayName: string | null;
}

/** 待审核申请列表（组织所有者与管理员） */
export interface iGM_DeveloperApplicationList {
  items: Array<
    iGM_DeveloperApplication & { username: string; displayName: string | null }
  >;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/* ---------- 模块二十六：开发者公示 ---------- */

/** 公示条目：一名通过审核的开发者 */
export interface iGM_DeveloperPublicityItem {
  id: string;
  developerName: string;
  /** 社区 iGMUid */
  uid: string | null;
  projectName: string;
  approvedAt: string;
}

/** 公示批次（含本批次公示条目） */
export interface iGM_DeveloperPublicityBatch {
  id: string;
  batchName: string;
  /** 本批次名额（默认 30） */
  quota: number;
  publishedAt: string | null;
  status: string;
  items: iGM_DeveloperPublicityItem[];
}

/** 开发者公示数据：按批次分组，最新批次置顶 */
export interface iGM_DeveloperPublicityData {
  batches: iGM_DeveloperPublicityBatch[];
}

// 核心逻辑 //
/** 开发者能力说明（公开） */
export function iGM_ApiGetDeveloperIntro(): Promise<
  iGM_ApiResponse<iGM_DeveloperIntro>
> {
  return iGM_Get("/G_Developer/intro");
}

/** 提交开发者申请（登录，限流） */
export function iGM_ApiSubmitDeveloperApply(
  input: iGM_DeveloperApplyPayload,
): Promise<iGM_ApiResponse<iGM_DeveloperApplication>> {
  return iGM_Post("/G_Developer/apply", input);
}

/** 重新申请（最近一条为已拒绝或已撤回时可用） */
export function iGM_ApiReapplyDeveloper(
  input: iGM_DeveloperApplyPayload,
): Promise<iGM_ApiResponse<iGM_DeveloperApplication>> {
  return iGM_Post("/G_Developer/reapply", input);
}

/** 我的开发者申请状态与历史（登录） */
export function iGM_ApiGetMyDeveloper(): Promise<
  iGM_ApiResponse<iGM_MyDeveloperData>
> {
  return iGM_Get("/G_Developer/me");
}

/** 撤回本人待审核申请（登录） */
export function iGM_ApiWithdrawDeveloper(
  applicationId: string,
): Promise<iGM_ApiResponse<{ applicationId: string }>> {
  return iGM_Post("/G_Developer/withdraw", { applicationId });
}

/** 待审核申请列表（组织所有者与管理员） */
export function iGM_ApiListDeveloperApplications(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<iGM_ApiResponse<iGM_DeveloperApplicationList>> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return iGM_Get(`/G_Developer/applications${query ? `?${query}` : ""}`);
}

/** 审核申请（组织所有者与管理员；模块十六只变更状态与意见） */
export function iGM_ApiReviewDeveloper(input: {
  applicationId: string;
  action: "approve" | "reject";
  comment?: string;
}): Promise<iGM_ApiResponse<{ applicationId: string; action: string }>> {
  return iGM_Post("/G_Developer/review", input);
}

/* ---------- 模块二十二：开发者平台准入状态 ---------- */

/**
 * 查询开发者平台准入状态（登录）。
 * 已通过开发者申请返回 isDeveloper=true，可直接进入开发者平台，无需密钥。
 */
export function iGM_ApiGetDeveloperStatus(): Promise<
  iGM_ApiResponse<iGM_DeveloperPortalStatus>
> {
  return iGM_Get("/api/developer/status");
}

/* ---------- 模块二十六：开发者公示（公开） ---------- */

/** 开发者公示列表（公开，未登录可浏览）：按批次分组，最新批次置顶 */
export function iGM_ApiGetDeveloperPublicity(): Promise<
  iGM_ApiResponse<iGM_DeveloperPublicityData>
> {
  return iGM_Get("/G_Developer/publicity");
}

// 导出 //
export default {
  iGM_ApiGetDeveloperIntro,
  iGM_ApiSubmitDeveloperApply,
  iGM_ApiReapplyDeveloper,
  iGM_ApiGetMyDeveloper,
  iGM_ApiWithdrawDeveloper,
  iGM_ApiListDeveloperApplications,
  iGM_ApiReviewDeveloper,
  iGM_ApiGetDeveloperStatus,
  iGM_ApiGetDeveloperPublicity,
};