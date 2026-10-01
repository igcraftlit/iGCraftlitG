/**
 * 文件路径：apps/cli-download/src/services/iGM_CLI_OAuthClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_OAuth/* 与 /G_Auth/me
 * 模块：iGM_CLI_OAuthClient
 * 作用：CLI 站 OAuth 应用接入相关接口的唯一前端调用出口
 * 内容：应用申请 / 撤回 / 重置密钥 / 接入日志、当前登录用户探测、后端错误键归一化
 * 约束：只经 iGM_CLI_Request 发请求；client_secret 仅在发放当下返回一次，前端不落任何持久化存储
 */

// 导入依赖 //
import {
  iGM_CLI_Get,
  iGM_CLI_Post,
  iGM_CLI_Request,
  iGM_CLI_RequestError,
  type iGM_CLI_ApiResponse,
} from "./iGM_CLI_Request";

// 类型定义 //
/** 应用状态：pending 待审核 / approved 已通过 / rejected 已拒绝 / disabled 已禁用 / withdrawn 已撤回 */
export type iGM_CLI_OAuthClientStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "disabled"
  | "withdrawn";

/** 应用类型：web 网页 / desktop 桌面 / mobile 移动 / service 服务端 / other 其他 */
export type iGM_CLI_OAuthClientType =
  | "web"
  | "desktop"
  | "mobile"
  | "service"
  | "other";

/** OIDC scope */
export type iGM_CLI_OAuthScope = "openid" | "profile" | "email" | "org";

/** 应用类型下拉取值（顺序即展示顺序，与后端一致） */
export const iGM_CLI_OAuthClientTypeOptions: iGM_CLI_OAuthClientType[] = [
  "web",
  "desktop",
  "mobile",
  "service",
  "other",
];

/** scope 取值（openid 为必选基础项，其余可选） */
export const iGM_CLI_OAuthScopeOptions: iGM_CLI_OAuthScope[] = [
  "openid",
  "profile",
  "email",
  "org",
];

/** OAuth 应用（开发者侧视图，永不含 client_secret） */
export interface iGM_CLI_OAuthApplication {
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
  status: iGM_CLI_OAuthClientStatus | string;
  reviewerId: string | null;
  reviewComment: string | null;
  secretRotatedAt: string | null;
  /** 是否为本地测试用途应用（回调地址允许 http://localhost 等本地地址） */
  isLocalTest: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 应用接入日志条目 */
export interface iGM_CLI_OAuthLogItem {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

/** 应用接入日志分页列表 */
export interface iGM_CLI_OAuthLogList {
  items: iGM_CLI_OAuthLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 当前登录用户（取 /G_Auth/me，未登录返回 401） */
export interface iGM_CLI_AuthUser {
  uid: string;
  username: string;
  displayName: string | null;
}

/** 应用申请入参 */
export interface iGM_CLI_OAuthApplyPayload {
  name: string;
  type: iGM_CLI_OAuthClientType;
  description: string;
  redirectUris: string[];
  scopes: string[];
  purpose: string;
  contact: string;
  agreeRules: boolean;
  /** 本地测试用途：为 true 时允许 http://localhost / 127.0.0.1 / [::1] 回调地址 */
  localTest: boolean;
}

/** next-intl 翻译函数的最简契约 */
export interface iGM_CLI_Translator {
  (key: string): string;
}

/** 主站登录页地址（引导重新登录，回跳当前页完整地址） */
const iGM_CLI_LoginBaseUrl = "https://igcraftlit.com/G_Auth/login";

// 核心逻辑 //
/** 拼接带 redirect 回跳的主站登录地址（浏览器环境下回跳当前页） */
export function iGM_CLI_BuildLoginUrl(): string {
  if (typeof window === "undefined") return iGM_CLI_LoginBaseUrl;
  return `${iGM_CLI_LoginBaseUrl}?redirect=${encodeURIComponent(
    window.location.href,
  )}`;
}

// 核心逻辑 //
/** 提交 OAuth 应用接入申请（登录，限流） */
export function iGM_CLI_ApiSubmitOAuthApply(
  input: iGM_CLI_OAuthApplyPayload,
): Promise<iGM_CLI_ApiResponse<iGM_CLI_OAuthApplication>> {
  return iGM_CLI_Post("/G_OAuth/apps", input);
}

/** 我提交的 OAuth 应用列表（登录） */
export function iGM_CLI_ApiListMyOAuthApps(): Promise<
  iGM_CLI_ApiResponse<{ items: iGM_CLI_OAuthApplication[] }>
> {
  return iGM_CLI_Get("/G_OAuth/apps/mine");
}

/** 撤回本人待审核的申请（登录） */
export function iGM_CLI_ApiWithdrawOAuthApp(
  clientId: string,
): Promise<iGM_CLI_ApiResponse<{ clientId: string }>> {
  return iGM_CLI_Post("/G_OAuth/apps/withdraw", { clientId });
}

/**
 * 重置 client_secret（登录）。
 * 返回值中的 clientSecret 仅本次返回，界面须即时展示且不得持久化保存。
 */
export function iGM_CLI_ApiResetOAuthSecret(
  clientId: string,
): Promise<iGM_CLI_ApiResponse<{ clientId: string; clientSecret: string }>> {
  return iGM_CLI_Post("/G_OAuth/apps/reset-secret", { clientId });
}

/**
 * 删除本人 OAuth 应用（登录，应用所有者或管理员）。
 * 删除会同时撤销该应用的全部授权与令牌，且 client_id 不可再次使用。
 */
export function iGM_CLI_ApiDeleteOAuthApp(
  clientId: string,
): Promise<iGM_CLI_ApiResponse<{ clientId: string }>> {
  return iGM_CLI_Request(`/api/oauth/clients/${clientId}`, {
    method: "DELETE",
  });
}

/** 查看本人应用的接入日志（登录，分页） */
export function iGM_CLI_ApiListMyOAuthLogs(params: {
  clientId: string;
  page?: number;
  pageSize?: number;
}): Promise<iGM_CLI_ApiResponse<iGM_CLI_OAuthLogList>> {
  const search = new URLSearchParams({ clientId: params.clientId });
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  return iGM_CLI_Get(`/G_OAuth/apps/logs?${search.toString()}`);
}

/**
 * 读取当前登录用户。
 * 未登录时后端返回 401（属正常状态），使用 skipAuthNotice 跳过过期提示。
 */
export function iGM_CLI_ApiGetMe(): Promise<
  iGM_CLI_ApiResponse<iGM_CLI_AuthUser>
> {
  return iGM_CLI_Get("/G_Auth/me", { skipAuthNotice: true });
}

/**
 * 将后端业务错误 message（i18n 文案键，如 oauth.errors.nameInvalid）
 * 归一化为当前语言的人类可读文案；网络 / 超时与未知错误回退到给定兜底键。
 * 绝不在界面上直接展示 i18n 键值本身。
 */
export function iGM_CLI_ResolveErrorText(
  t: iGM_CLI_Translator,
  error: unknown,
  fallbackKey: string,
): string {
  if (error instanceof iGM_CLI_RequestError) {
    if (error.kind === "timeout" || error.kind === "network") {
      return t(fallbackKey);
    }
  }

  const key = error instanceof Error ? error.message : "";
  // 后端业务错误 message 即 i18n 文案键（oauth.*）
  if (key.includes(".")) {
    try {
      return t(key);
    } catch {
      return t(fallbackKey);
    }
  }
  return t(fallbackKey);
}

// 导出 //
export default {
  iGM_CLI_ApiSubmitOAuthApply,
  iGM_CLI_ApiListMyOAuthApps,
  iGM_CLI_ApiWithdrawOAuthApp,
  iGM_CLI_ApiResetOAuthSecret,
  iGM_CLI_ApiDeleteOAuthApp,
  iGM_CLI_ApiListMyOAuthLogs,
  iGM_CLI_ApiGetMe,
  iGM_CLI_ResolveErrorText,
};
