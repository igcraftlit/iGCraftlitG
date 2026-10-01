/**
 * 文件路径：apps/web/src/iGM_Services/iGM_OAuthClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_OAuth/*
 * 模块：iGM_OAuthClient
 * 作用：OAuth 2.0 + OpenID Connect 身份提供方相关接口的唯一前端调用出口
 * 内容：管理端审核与启停删除、用户侧已授权应用查询与撤销、授权同意页数据与决策
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_OAuth.ts 保持一致；
 *       client_secret 仅在发放当下返回一次，前端不落任何持久化存储
 */

// 导入依赖 //
import { iGM_Get, iGM_Post, type iGM_ApiResponse } from "./iGM_Request";

// 类型定义 //
/** 应用状态：pending 待审核 / approved 已通过 / rejected 已拒绝 / disabled 已禁用 / withdrawn 已撤回 */
export type iGM_OAuthClientStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "disabled"
  | "withdrawn";

/** OAuth 应用（开发者侧 / 用户侧视图，永不含 client_secret） */
export interface iGM_OAuthApplication {
  id: string;
  clientId: string;
  name: string;
  type: string;
  description: string;
  redirectUris: string[];
  scopes: string[];
  purpose: string;
  contact: string;
  ownerUid: string;
  status: iGM_OAuthClientStatus | string;
  reviewerId: string | null;
  reviewComment: string | null;
  secretRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 管理端列表项：附带申请人信息 */
export interface iGM_OAuthApplicationAdmin extends iGM_OAuthApplication {
  username: string;
  displayName: string | null;
}

/** 管理端分页列表 */
export interface iGM_OAuthAdminList {
  items: iGM_OAuthApplicationAdmin[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 用户侧已授权应用 */
export interface iGM_AuthorizedApp {
  clientId: string;
  name: string;
  type: string;
  description: string;
  status: string;
  scopes: string[];
  grantedAt: string;
}

/** 授权同意页所需数据 */
export interface iGM_AuthorizeConsentInfo {
  client: {
    clientId: string;
    name: string;
    type: string;
    description: string;
  };
  scopes: string[];
  /** 当前浏览器是否已登录（未登录时页面先引导登录） */
  loggedIn: boolean;
}

// 核心逻辑 //
/* ---------- 管理端：审核与启停删除 ---------- */

/** 管理端应用列表（仅 admin，分页，可按状态筛选） */
export function iGM_ApiListOAuthAppsAdmin(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<iGM_ApiResponse<iGM_OAuthAdminList>> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return iGM_Get(`/G_OAuth/admin/apps${query ? `?${query}` : ""}`);
}

/** 审核应用：通过时返回 client_secret（仅本次返回，界面须即时展示） */
export function iGM_ApiReviewOAuthApp(input: {
  clientId: string;
  action: "approve" | "reject";
  comment?: string;
}): Promise<
  iGM_ApiResponse<{ clientId: string; clientSecret: string | null }>
> {
  return iGM_Post("/G_OAuth/admin/review", input);
}

/** 启用 / 禁用应用（禁用会撤销该应用已签发的全部令牌） */
export function iGM_ApiSetOAuthAppStatus(input: {
  clientId: string;
  disabled: boolean;
}): Promise<iGM_ApiResponse<{ disabled: boolean }>> {
  return iGM_Post("/G_OAuth/admin/status", input);
}

/** 删除应用（级联清理授权码、令牌与同意记录） */
export function iGM_ApiDeleteOAuthApp(
  clientId: string,
): Promise<iGM_ApiResponse<{ clientId: string }>> {
  return iGM_Post("/G_OAuth/admin/delete", { clientId });
}

/* ---------- 用户侧：已授权应用 ---------- */

/** 我授权过的应用列表（登录） */
export function iGM_ApiListAuthorizedApps(): Promise<
  iGM_ApiResponse<{ items: iGM_AuthorizedApp[] }>
> {
  return iGM_Get("/G_OAuth/consents/mine");
}

/** 撤销对某应用的授权（登录，同时撤销其全部令牌） */
export function iGM_ApiRevokeAuthorizedApp(
  clientId: string,
): Promise<iGM_ApiResponse<{ clientId: string }>> {
  return iGM_Post("/G_OAuth/consents/revoke", { clientId });
}

/* ---------- 授权同意页 ---------- */

/** 读取授权同意页所需的应用公开信息（依赖后端下发的签名授权流 Cookie） */
export function iGM_ApiGetAuthorizeInfo(): Promise<
  iGM_ApiResponse<iGM_AuthorizeConsentInfo>
> {
  return iGM_Get("/G_OAuth/authorize/info");
}

/** 提交授权决策，返回第三方回跳地址 */
export function iGM_ApiDecideAuthorize(
  decision: "approve" | "deny",
): Promise<iGM_ApiResponse<{ redirectUrl: string }>> {
  return iGM_Post("/G_OAuth/authorize/decision", { decision });
}

// 导出 //
export default {
  iGM_ApiListOAuthAppsAdmin,
  iGM_ApiReviewOAuthApp,
  iGM_ApiSetOAuthAppStatus,
  iGM_ApiDeleteOAuthApp,
  iGM_ApiListAuthorizedApps,
  iGM_ApiRevokeAuthorizedApp,
  iGM_ApiGetAuthorizeInfo,
  iGM_ApiDecideAuthorize,
};
