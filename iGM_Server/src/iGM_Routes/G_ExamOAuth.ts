/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_ExamOAuth.ts
 * 所属层：后端 / 路由层
 * 路由：/api/exam/oauth/*
 * 模块：G_ExamOAuth
 * 作用：考试站作为 OAuth Client 对接主站 IdP 的登录/回调/用户态/登出路由
 * 内容：
 *   GET  /api/exam/oauth/login     — 生成 PKCE + state，302 到主站 /oauth/authorize
 *   GET  /api/exam/oauth/callback  — 主站回跳，code→token→userinfo→本地会话，302 回 exam 首页
 *   GET  /api/exam/oauth/me        — 读 cookie 返回当前用户（含 creator 信息）
 *   POST /api/exam/oauth/logout    — 清本地会话 + 清 cookie
 * 约束：client_secret 仅存在 iGM_Config.examOAuth，严禁落日志或响应；
 *       callback cookie 显式 Domain=.igcraftlit.com 让 exam.igcraftlit.com 能读到
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import {
  iGM_BuildSessionCookie,
  iGM_ClearSessionCookie,
  iGM_ReadCookie,
} from "../iGM_Services/iGM_SecurityService";
import {
  iGM_HandleOAuthCallback,
  iGM_BuildAuthorizeRedirect,
  iGM_RevokeLocalSession,
} from "../iGM_Services/iGM_ExamOAuthClientService";
import {
  iGM_IsActiveExaminer,
} from "../iGM_Services/iGM_ExaminerService";
import { iGM_FindExaminerByUser } from "../iGM_Repositories/iGM_ExaminerRepository";
import { iGM_ResolveSession } from "../iGM_Services/iGM_AuthService";
import {
  iGM_GetClientIp,
  type iGM_NetworkServer,
} from "../iGM_Middleware/iGM_AuthGuard";

// 类型定义 //
/** 仅声明本路由用到的 Elysia 上下文字段 */
interface iGM_RouteContext {
  query: Record<string, string | undefined>;
  body: unknown;
  request: Request;
  set: {
    status: number;
    headers: Record<string, string>;
  };
  server: iGM_NetworkServer | null;
}

// 核心逻辑 //

/** 解析当前请求的 host（不含端口）；空值回退 localhost */
function iGM_HostOf(request: Request): string {
  const host = request.headers.get("host") ?? "";
  return host.split(":")[0] || "localhost";
}

/** 返回 302 重定向 */
function iGM_Redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
}

/** 返回 JSON 响应 */
function iGM_Json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 从上下文取字符串 query 参数；缺省回退 "" */
function iGM_Q(query: Record<string, string | undefined>, key: string): string {
  return typeof query[key] === "string" ? (query[key] as string) : "";
}

/* ---------- 工具：根据请求 host 构造 cookie options ---------- */

/**
 * 为 exam OAuth 登录的 Set-Cookie 构造 domain + secure 选项：
 * - localhost 无 domain、无 Secure（http 能写）
 * - 其他生产域名显式 Domain=.igcraftlit.com + Secure
 */
function iGM_ExamCookieOptions(host: string): {
  domain?: string;
  secureOverride?: boolean;
} {
  const lower = host.toLowerCase();
  const isLocal =
    lower === "localhost" || lower === "127.0.0.1" || lower === "::1";
  if (isLocal) return {};
  return {
    domain: iGM_Config.examOAuth.cookieDomain,
    secureOverride: true,
  };
}

/* ---------- GET /api/exam/oauth/login ---------- */

/** 发起 OAuth 授权：生成 PKCE + state，302 到主站 /oauth/authorize */
async function iGM_HandleLogin(ctx: iGM_RouteContext): Promise<Response> {
  try {
    const host = iGM_HostOf(ctx.request);
    const { authorizeUrl } = await iGM_BuildAuthorizeRedirect(host);
    console.log(
      `[iGM_ExamOAuth] 发起登录 host=${host} → ${iGM_Config.examOAuth.appName}`,
    );
    return iGM_Redirect(authorizeUrl);
  } catch (err) {
    console.error("[iGM_ExamOAuth] login 失败", err);
    return iGM_Json(
      {
        success: false,
        code: "LOGIN_INIT_FAILED",
        message: err instanceof Error ? err.message : "登录初始化失败",
      },
      500,
    );
  }
}

/* ---------- GET /api/exam/oauth/callback ---------- */

/**
 * 主站回跳处理：
 * - 校验 state → code 换令牌 → 拉 userinfo → 查本地用户 → 签发会话
 * - Set-Cookie Domain=.igcraftlit.com + Secure（生产）
 * - 302 回考试站根路径（localhost:3002 或 exam.igcraftlit.com）
 */
async function iGM_HandleCallback(ctx: iGM_RouteContext): Promise<Response> {
  const query = ctx.query;
  const code = iGM_Q(query, "code");
  const state = iGM_Q(query, "state");
  const error = iGM_Q(query, "error");

  // 主站带 error 回跳（用户拒绝 / client 被禁用等）
  if (error || !code) {
    const reason =
      error || (iGM_Q(query, "error_description") as string) || "missing_code";
    console.warn(`[iGM_ExamOAuth] 主站回跳带 error: ${reason}`);
    return iGM_Json(
      {
        success: false,
        code: "OAUTH_PROVIDER_ERROR",
        message: reason,
      },
      400,
    );
  }
  if (!state) {
    return iGM_Json(
      { success: false, code: "MISSING_STATE", message: "state 缺失" },
      400,
    );
  }

  try {
    const host = iGM_HostOf(ctx.request);
    const ip = iGM_GetClientIp(ctx.request, ctx.server);
    const ua = ctx.request.headers.get("user-agent");

    const result = await iGM_HandleOAuthCallback({
      host,
      code,
      state,
      userAgent: ua,
      ip,
    });

    // 设置跨子域 cookie
    const cookieOpts = iGM_ExamCookieOptions(host);
    const cookie = iGM_BuildSessionCookie(
      iGM_Config,
      result.sessionId,
      cookieOpts,
    );

    // 重定向回考试站前端根路径（localhost 3002 / 生产 exam.igcraftlit.com）
    const redirectTarget = iGM_BuildExamHomeUrl(host);

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectTarget,
        "Set-Cookie": cookie,
      },
    });
  } catch (err) {
    console.error("[iGM_ExamOAuth] callback 处理失败", err);
    return iGM_Json(
      {
        success: false,
        code: "OAUTH_CALLBACK_FAILED",
        message: err instanceof Error ? err.message : "登录失败，请重试",
      },
      400,
    );
  }
}

/** 构造考试站前端首页地址（本地 / 生产） */
function iGM_BuildExamHomeUrl(host: string): string {
  const lower = host.toLowerCase();
  const isLocal =
    lower === "localhost" || lower === "127.0.0.1" || lower === "::1";
  if (isLocal) return "http://localhost:3002/";
  return "https://exam.igcraftlit.com/";
}

/* ---------- GET /api/exam/oauth/me ---------- */

/**
 * 返回当前登录用户的考试站视角信息：
 * - uid / displayName / picture
 * - isExaminer + creatorId（是否为已审核命题创作者）
 * 未登录时返回 { success:true, data: null }（200，让前端能区分"未登录"和"接口错误"）
 */
async function iGM_HandleMe(ctx: iGM_RouteContext) {
  const sid = iGM_ReadCookie(ctx.request, iGM_Config.auth.cookieName);
  const user = sid ? await iGM_ResolveSession(sid) : null;
  if (!user) {
    return iGM_Ok(null);
  }

  // 附加命题创作者信息
  const isExaminer = await iGM_IsActiveExaminer(user.iGM_Id);
  const creatorRow = isExaminer
    ? await iGM_FindExaminerByUser(user.iGM_Id)
    : null;

  return iGM_Ok({
    uid: user.iGM_Uid,
    displayName: user.iGM_DisplayName ?? user.iGM_Username,
    picture: user.iGM_Avatar,
    username: user.iGM_Username,
    isExaminer,
    creatorId: creatorRow?.iGM_Id ?? null,
    creatorNumber: creatorRow?.iGM_CreatorNumber ?? null,
  });
}

/* ---------- POST /api/exam/oauth/logout ---------- */

/**
 * 清除本地会话 + 清 cookie。
 * 主站 IdP 令牌此处不 revoke（access_token 1h 自动过期，简化实现）；
 * 如需 revoke 需额外 upstreamAccessToken 持久化，后续再补。
 */
async function iGM_HandleLogout(ctx: iGM_RouteContext) {
  const sid = iGM_ReadCookie(ctx.request, iGM_Config.auth.cookieName);
  if (sid) {
    await iGM_RevokeLocalSession(sid);
  }

  const host = iGM_HostOf(ctx.request);
  const cookieOpts = iGM_ExamCookieOptions(host);
  const clear = iGM_ClearSessionCookie(iGM_Config, cookieOpts);
  ctx.set.headers["Set-Cookie"] = clear;
  ctx.set.status = 200;
  return iGM_Ok(null);
}

/* ---------- 404 / 错误处理 ---------- */

function iGM_HandleFallback(): Response {
  return iGM_Json(
    { success: false, code: "NOT_FOUND", message: "exam oauth route not found" },
    404,
  );
}

// 路由集合 //
export const G_ExamOAuth = new Elysia({ name: "G_ExamOAuth" })
  .get("/api/exam/oauth/login", iGM_HandleLogin as never)
  .get("/api/exam/oauth/callback", iGM_HandleCallback as never)
  .get("/api/exam/oauth/me", iGM_HandleMe as never)
  .post("/api/exam/oauth/logout", iGM_HandleLogout as never)
  .all("/api/exam/oauth/*", iGM_HandleFallback as never);

// 导出 //
export default G_ExamOAuth;
