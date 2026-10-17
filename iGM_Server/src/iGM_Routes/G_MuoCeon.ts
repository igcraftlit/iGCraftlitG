/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_MuoCeon.ts
 * 所属层：后端 / 路由层
 * 路由：/api/auth/muoceon/*
 * 模块：G_MuoCeon
 * 作用：主站作为 OAuth 客户端接入 MuoCeon 账号体系的浏览器跳转接口
 * 内容：
 *   1) GET /api/auth/muoceon            发起授权（生成 PKCE + state 后 302 到 MuoCeon）；
 *   2) GET /api/auth/muoceon/callback   授权回跳（校验 state → 换令牌 → 绑定/建号 → 签发主站会话）；
 *   3) ALL /api/auth/muoceon/*          兜底：未知子路径返回统一 JSON 失败结构
 * 约束：两个接口均为浏览器顶层跳转（非跨域 fetch），响应为 302 重定向；
 *       成功时以 Set-Cookie 写入主站会话 Cookie（与账号密码登录同一 iGM_SID）；
 *       client_secret 仅在服务层使用，绝不出现在响应体中
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_BuildAuthorizeRedirect,
  iGM_BuildMuoCeonFailureRedirect,
  iGM_BuildMuoCeonSuccessRedirect,
  iGM_HandleMuoCeonCallback,
  iGM_MuoCeonError,
} from "../iGM_Services/iGM_MuoCeonService";
import { iGM_BuildSessionCookie } from "../iGM_Services/iGM_SecurityService";
import { iGM_GetClientIp, type iGM_NetworkServer } from "../iGM_Middleware/iGM_AuthGuard";

// 类型定义 //
/** 仅声明本路由用到的 Elysia 上下文字段 */
interface iGM_RouteContext {
  query: Record<string, string | undefined>;
  request: Request;
  server: iGM_NetworkServer | null;
}

// 核心逻辑 //

/** 返回 302 重定向 */
function iGM_Redirect(location: string, cookie?: string): Response {
  const headers: Record<string, string> = { Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(null, { status: 302, headers });
}

/** 从 query 取字符串参数；缺省回退 "" */
function iGM_Q(query: Record<string, string | undefined>, key: string): string {
  return typeof query[key] === "string" ? (query[key] as string) : "";
}

/* ---------- GET /api/auth/muoceon：发起授权 ---------- */

/**
 * 发起 MuoCeon 授权：
 * 生成 code_verifier / code_challenge(S256) / state 并缓存 5 分钟，
 * 随后 302 到 MuoCeon 授权端点；locale 仅用于失败时定位回跳页面。
 */
async function iGM_HandleAuthorize(ctx: iGM_RouteContext): Promise<Response> {
  try {
    const authorizeUrl = await iGM_BuildAuthorizeRedirect({
      locale: iGM_Q(ctx.query, "locale"),
    });
    return iGM_Redirect(authorizeUrl);
  } catch (err) {
    console.error("[iGM_MuoCeon] 发起授权失败", err);
    return new Response(
      JSON.stringify({
        success: false,
        code: "MUOCEON_AUTHORIZE_INIT_FAILED",
        message: err instanceof Error ? err.message : "授权初始化失败",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/* ---------- GET /api/auth/muoceon/callback：授权回跳 ---------- */

/**
 * 处理 MuoCeon 回跳：
 * 1) 校验 state 与授权流缓存；
 * 2) code 换 MuoCeon 令牌并拉取 userinfo；
 * 3) 按 sub 命中绑定或自动建号并绑定；
 * 4) 签发主站会话 Cookie 后 302 回主站首页；
 * 失败时 302 回独立授权页并带 error 标记，便于用户重试。
 */
async function iGM_HandleCallback(ctx: iGM_RouteContext): Promise<Response> {
  const code = iGM_Q(ctx.query, "code");
  const state = iGM_Q(ctx.query, "state");
  let locale = iGM_Q(ctx.query, "locale") || undefined;

  try {
    if (!code || !state) {
      throw new iGM_MuoCeonError("回调缺少 code 或 state", 400);
    }
    const ip = iGM_GetClientIp(ctx.request, ctx.server);
    const result = await iGM_HandleMuoCeonCallback({
      code,
      state,
      userAgent: ctx.request.headers.get("user-agent"),
      ip,
    });
    locale = result.locale;
    const cookie = iGM_BuildSessionCookie(iGM_Config, result.sessionId);
    return iGM_Redirect(iGM_BuildMuoCeonSuccessRedirect(), cookie);
  } catch (err) {
    console.error("[iGM_MuoCeon] 回调处理失败", err);
    return iGM_Redirect(iGM_BuildMuoCeonFailureRedirect(locale));
  }
}

/* ---------- 兜底：未知子路径 ---------- */

function iGM_HandleFallback(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      code: "NOT_FOUND",
      message: "接口不存在",
    }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}

// 导出 //
export const G_MuoCeon = new Elysia({ name: "G_MuoCeon" })
  .get("/api/auth/muoceon", iGM_HandleAuthorize as never)
  .get("/api/auth/muoceon/callback", iGM_HandleCallback as never)
  .all("/api/auth/muoceon/*", iGM_HandleFallback as never);
