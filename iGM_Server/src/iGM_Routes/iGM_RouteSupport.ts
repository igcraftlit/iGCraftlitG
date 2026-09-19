/**
 * 文件路径：iGM_Server/src/iGM_Routes/iGM_RouteSupport.ts
 * 所属层：后端 / 路由层
 * 路由：G_Community、G_Post
 * 模块：iGM_RouteSupport
 * 作用：模块三、模块四路由处理器共享的请求解析工具
 * 内容：路由上下文最小类型、请求体字符串字段读取、查询参数读取、
 *       基于配置的基础限流守卫、当前登录用户解析、界面语言读取
 * 说明：与 G_Auth 中同类工具保持一致的处理口径，业务错误由全局错误处理器统一格式化
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_CheckRateLimit } from "../iGM_Services/iGM_RateLimitService";
import { iGM_AuthError } from "../iGM_Services/iGM_AuthService";
import {
  iGM_GetClientIp,
  iGM_ResolveRequestUser,
  type iGM_NetworkServer,
} from "../iGM_Middleware/iGM_AuthGuard";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 路由处理器上下文：只声明实际使用到的 Elysia 上下文字段 */
export interface iGM_RouteContext {
  body: unknown;
  query: Record<string, string | undefined>;
  request: Request;
  set: {
    status: number;
    headers: Record<string, string>;
  };
  server: iGM_NetworkServer | null;
}

// 核心逻辑 //
/** 从请求体读取字符串字段（非字符串一律视为空串） */
export function iGM_Field(body: unknown, key: string): string {
  const source = (body ?? {}) as Record<string, unknown>;
  return typeof source[key] === "string" ? (source[key] as string) : "";
}

/** 从请求体读取布尔字段（兼容 JSON 布尔与字符串 "true"，其余一律为 false） */
export function iGM_BoolField(body: unknown, key: string): boolean {
  const source = (body ?? {}) as Record<string, unknown>;
  const value = source[key];
  if (typeof value === "boolean") return value;
  return value === "true";
}

/** 读取查询参数中的字符串（缺省返回默认值） */
export function iGM_Query(
  query: Record<string, string | undefined>,
  key: string,
  fallback = "",
): string {
  const value = query[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/** 解析当前请求的登录用户（未登录返回 null） */
export function iGM_CurrentUser(ctx: iGM_RouteContext): iGM_UserRow | null {
  return iGM_ResolveRequestUser(ctx.request);
}

/** 解析客户端 IP（限流维度使用） */
export function iGM_ClientIp(ctx: iGM_RouteContext): string {
  return iGM_GetClientIp(ctx.request, ctx.server);
}

/**
 * 读取界面语言（前端 iGM_Request 统一附带 x-igm-locale 头）
 * 用于模块四通知与邮件的文案本地化，缺省回退简体中文
 */
export function iGM_RequestLocale(ctx: iGM_RouteContext): string {
  const header = ctx.request.headers.get("x-igm-locale");
  return header && header.length > 0 ? header : "zh-CN";
}

/** 解析分页查询参数 */
export function iGM_PageQuery(
  ctx: iGM_RouteContext,
): { page: number; pageSize: number } {
  return {
    page: Number(iGM_Query(ctx.query, "page", "1")),
    pageSize: Number(iGM_Query(ctx.query, "pageSize", "10")),
  };
}

/**
 * 基础限流守卫：超限直接抛 429 业务错误（复用认证模块的错误类型与文案键）
 * @param identifier 限流标识，通常为 `user:<id>` 或客户端 IP
 */
export function iGM_EnforceRateLimit(
  ctx: iGM_RouteContext,
  action: keyof typeof iGM_Config.rateLimits,
  identifier: string,
): void {
  const rule = iGM_Config.rateLimits[action];
  const result = iGM_CheckRateLimit(action, identifier, rule.windowMs, rule.max);
  if (!result.allowed) {
    ctx.set.headers["Retry-After"] = String(result.retryAfterSeconds);
    throw new iGM_AuthError("auth.errors.tooManyRequests", 429);
  }
}

// 导出 //
export default {
  iGM_Field,
  iGM_BoolField,
  iGM_Query,
  iGM_CurrentUser,
  iGM_ClientIp,
  iGM_RequestLocale,
  iGM_PageQuery,
  iGM_EnforceRateLimit,
};
