/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_CommunityAuth.ts
 * 所属层：桌面外壳 / 社区授权服务层
 * 路由：全局
 * 模块：iGM_LauncherV2_CommunityAuth
 * 作用：iGCraftLit 社区账号授权（OAuth 2.0 + OpenID Connect，公开客户端 PKCE）
 * 内容：Bun.serve 监听 http://localhost:8080/callback 接收授权码；
 *       生成 code_verifier（48 字节随机数）与 code_challenge（SHA256 + Base64URL，S256）；
 *       拼装授权地址并调起默认浏览器；
 *       回调到达后以 client_id + code + code_verifier + redirect_uri 换取令牌，
 *       【严禁传输 client_secret】，随后拉取 userinfo 并落盘 auth.json；
 *       同时提供登录态恢复与刷新令牌能力。
 * 安全：state 随机生成并在回调时严格比对（防 CSRF）；令牌只落盘本地 0600 文件，
 *       回推给界面的载荷只含 uid / 昵称 / 头像，永不包含任何令牌
 */

// 导入依赖 //
import { createHash, randomBytes } from "node:crypto";
import {
  IGM_LAUNCHERV2_AUTH_WAIT_MS,
  IGM_LAUNCHERV2_CALLBACK_PATH,
  IGM_LAUNCHERV2_CALLBACK_PORT,
  IGM_LAUNCHERV2_COMMUNITY_AUTHORIZE_URL,
  IGM_LAUNCHERV2_COMMUNITY_SCOPE,
  IGM_LAUNCHERV2_COMMUNITY_TOKEN_URL,
  IGM_LAUNCHERV2_COMMUNITY_USERINFO_URL,
  IGM_LAUNCHERV2_ENV_CLIENT_ID,
  IGM_LAUNCHERV2_REDIRECT_URI,
} from "./iGM_LauncherV2_Constants";
import { iGM_LauncherV2_EnvGet } from "./iGM_LauncherV2_Env";
import type { iGM_LauncherV2_AuthUser, iGM_LauncherV2_InboundMessage } from "./iGM_LauncherV2_Ipc";
import {
  iGM_LauncherV2_StoreClear,
  iGM_LauncherV2_StoreLoad,
  iGM_LauncherV2_StoreSave,
  type iGM_LauncherV2_Session,
} from "./iGM_LauncherV2_Store";

// 类型定义 //

/** 状态回推函数（由主进程注入，绑定到主窗口） */
export type iGM_LauncherV2_Notifier = (message: iGM_LauncherV2_InboundMessage) => void;

/** 进行中的授权流 */
interface iGM_LauncherV2_AuthFlow {
  /** CSRF 校验值 */
  state: string;
  /** PKCE code_verifier */
  codeVerifier: string;
  /** 回调 resolve/reject */
  resolveCode: ((code: string) => void) | null;
  rejectCode: ((error: Error) => void) | null;
  /** 本地回调服务器句柄 */
  server: { stop: (closeActiveConnections?: boolean) => void } | null;
}

/** 令牌端点成功响应 */
interface iGM_LauncherV2_TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/** userinfo 响应（按 scope 返回） */
interface iGM_LauncherV2_UserInfoResponse {
  sub?: string;
  name?: string;
  picture?: string;
  preferred_username?: string;
}

// 核心逻辑 //

/** 当前授权流（同一时刻仅允许一个） */
let iGM_LauncherV2_ActiveFlow: iGM_LauncherV2_AuthFlow | null = null;

/** 当前登录用户的内存视图（启动时由会话恢复） */
let iGM_LauncherV2_CurrentUser: iGM_LauncherV2_AuthUser | null = null;

/** 最近一次失败原因，供界面展示 */
let iGM_LauncherV2_LastMessage = "";

/** 读取社区应用 client_id（仅公开客户端标识，不含密钥） */
function iGM_LauncherV2_ClientId(): string {
  return iGM_LauncherV2_EnvGet(IGM_LAUNCHERV2_ENV_CLIENT_ID) ?? "";
}

/** Buffer 转 Base64URL */
function iGM_LauncherV2_Base64Url(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

/** PKCE：由 code_verifier 推导 S256 code_challenge */
function iGM_LauncherV2_CodeChallenge(verifier: string): string {
  return iGM_LauncherV2_Base64Url(createHash("sha256").update(verifier).digest());
}

/**
 * 调起默认浏览器。
 * 优先使用 Electrobun 的 Utils.openExternal（原生调用，无终端弹窗）；
 * 不可用时按平台回退到系统命令（Windows 用 cmd start，macOS 用 open，Linux 用 xdg-open）。
 */
async function iGM_LauncherV2_OpenExternal(url: string): Promise<boolean> {
  try {
    const electrobun = (await import("electrobun/main")) as {
      Utils?: { openExternal?: (target: string) => boolean };
    };
    if (electrobun.Utils?.openExternal?.(url)) return true;
  } catch {
    // 非 Electrobun 运行环境（纯 Bun 自检）时静默回退到系统命令
  }

  try {
    const command =
      process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : process.platform === "darwin"
          ? ["open", url]
          : ["xdg-open", url];
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
    return true;
  } catch (error) {
    console.warn("[iGM CraftCeon Launcher] 无法调起默认浏览器：", error);
    return false;
  }
}

/** 回调页面（授权完成 / 失败提示），与启动器暗色风格保持一致 */
function iGM_LauncherV2_CallbackPage(params: {
  title: string;
  detail: string;
  tone: "ok" | "error";
}): Response {
  const accent = params.tone === "ok" ? "#37d39b" : "#e8848c";
  const html = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>${params.title}</title>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#05070f;color:#eef1f8;font-family:'Segoe UI',system-ui,'Microsoft YaHei',sans-serif">
  <div style="max-width:520px;padding:34px 38px;border-radius:20px;background:rgba(19,25,45,.7);border:1px solid rgba(255,255,255,.12);text-align:center">
    <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:${accent}">${params.title}</p>
    <p style="margin:0;font-size:14px;line-height:1.8;color:#a7b0c8">${params.detail}</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: params.tone === "ok" ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** 启动本地回调服务器并等待授权码；端口被占用时抛出可读错误 */
function iGM_LauncherV2_ListenCallback(flow: iGM_LauncherV2_AuthFlow): void {
  const server = Bun.serve({
    port: IGM_LAUNCHERV2_CALLBACK_PORT,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname !== IGM_LAUNCHERV2_CALLBACK_PATH) {
        return new Response("Not Found", { status: 404 });
      }

      const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
      if (error) {
        flow.rejectCode?.(new Error(error));
        return iGM_LauncherV2_CallbackPage({
          title: "授权未完成",
          detail: `${error}。请返回启动器重试。`,
          tone: "error",
        });
      }

      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      if (!code) {
        return iGM_LauncherV2_CallbackPage({
          title: "授权未完成",
          detail: "回调未携带授权码。请返回启动器重试。",
          tone: "error",
        });
      }
      // CSRF 校验：state 必须与本次授权流一致
      if (state !== flow.state) {
        flow.rejectCode?.(new Error("state 校验失败，授权可能被劫持"));
        return iGM_LauncherV2_CallbackPage({
          title: "授权失败",
          detail: "state 校验失败，请返回启动器重新授权。",
          tone: "error",
        });
      }

      flow.resolveCode?.(code);
      return iGM_LauncherV2_CallbackPage({
        title: "授权已完成",
        detail: "请返回 iGM CraftCeon Launcher 继续操作。",
        tone: "ok",
      });
    },
  });

  flow.server = server;
}

/** 关闭本地回调服务器 */
function iGM_LauncherV2_CloseCallback(flow: iGM_LauncherV2_AuthFlow): void {
  try {
    flow.server?.stop(true);
  } catch (error) {
    console.warn("[iGM CraftCeon Launcher] 关闭本地回调服务器失败：", error);
  }
  flow.server = null;
}

/**
 * 以授权码换取令牌。
 * 公开客户端务必只传 client_id + code + code_verifier + redirect_uri，
 * 绝不携带 client_secret；后端若因缺少密钥拒绝，需在后端放开公开客户端 PKCE。
 */
async function iGM_LauncherV2_ExchangeCode(params: {
  code: string;
  codeVerifier: string;
  clientId: string;
}): Promise<iGM_LauncherV2_TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    redirect_uri: IGM_LAUNCHERV2_REDIRECT_URI,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(IGM_LAUNCHERV2_COMMUNITY_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as iGM_LauncherV2_TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || payload.error || `令牌端点返回 HTTP ${response.status}`,
    );
  }
  return payload;
}

/** 以 refresh_token 续期（同样不携带 client_secret） */
async function iGM_LauncherV2_RefreshToken(params: {
  refreshToken: string;
  clientId: string;
}): Promise<iGM_LauncherV2_TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.clientId,
    refresh_token: params.refreshToken,
  });

  const response = await fetch(IGM_LAUNCHERV2_COMMUNITY_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as iGM_LauncherV2_TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || payload.error || `令牌续期返回 HTTP ${response.status}`,
    );
  }
  return payload;
}

/** 拉取账号公开信息：sub 为社区 UID，profile scope 下附带昵称与头像 */
async function iGM_LauncherV2_FetchUser(accessToken: string): Promise<iGM_LauncherV2_AuthUser> {
  const response = await fetch(IGM_LAUNCHERV2_COMMUNITY_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`用户信息端点返回 HTTP ${response.status}`);
  }

  const info = (await response.json().catch(() => ({}))) as iGM_LauncherV2_UserInfoResponse;
  const uid = String(info.sub ?? "").trim();
  if (!uid) throw new Error("用户信息未返回社区 UID");

  return {
    uid,
    nickname: String(info.name ?? info.preferred_username ?? uid),
    avatar: String(info.picture ?? ""),
  };
}

/** 构造令牌过期时刻 */
function iGM_LauncherV2_ExpiresAt(expiresIn: number | undefined): number {
  const seconds = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 1800;
  return Date.now() + seconds * 1000;
}

/** 回推登录态；message 为空时省略该字段 */
function iGM_LauncherV2_PushAuth(
  notify: iGM_LauncherV2_Notifier,
  state: "logged-out" | "pending" | "logged-in",
  user: iGM_LauncherV2_AuthUser | null,
  message = "",
): void {
  notify({ type: "auth:state", state, user, message });
}

/** 构造当前登录态快照（供界面主动查询） */
export async function iGM_LauncherV2_Auth_Snapshot(): Promise<iGM_LauncherV2_InboundMessage> {
  if (iGM_LauncherV2_CurrentUser) {
    return {
      type: "auth:state",
      state: "logged-in",
      user: iGM_LauncherV2_CurrentUser,
      message: "",
    };
  }
  return {
    type: "auth:state",
    state: "logged-out",
    user: null,
    message: iGM_LauncherV2_LastMessage,
  };
}

/**
 * 启动时恢复登录态：
 * 有会话且访问令牌未过期 → 直接登录；
 * 已过期但有刷新令牌 → 静默续期；
 * 续期失败 → 清除会话并按未登录处理。
 */
export async function iGM_LauncherV2_Auth_Restore(): Promise<iGM_LauncherV2_AuthUser | null> {
  const session = await iGM_LauncherV2_StoreLoad();
  if (!session) return null;

  // 访问令牌仍然有效：直接沿用
  if (session.expiresAt > Date.now() + 30_000) {
    iGM_LauncherV2_CurrentUser = session.user;
    return session.user;
  }

  // 已过期：尝试续期
  if (!session.refreshToken) {
    await iGM_LauncherV2_StoreClear();
    iGM_LauncherV2_LastMessage = "登录已过期，请重新授权";
    return null;
  }

  const clientId = iGM_LauncherV2_ClientId();
  if (!clientId) {
    await iGM_LauncherV2_StoreClear();
    iGM_LauncherV2_LastMessage = "未配置社区应用 client_id，请重新授权";
    return null;
  }

  try {
    const refreshed = await iGM_LauncherV2_RefreshToken({
      refreshToken: session.refreshToken,
      clientId,
    });
    const user = await iGM_LauncherV2_FetchUser(refreshed.access_token ?? "");
    const next: iGM_LauncherV2_Session = {
      accessToken: refreshed.access_token ?? "",
      refreshToken: refreshed.refresh_token ?? session.refreshToken,
      tokenType: refreshed.token_type ?? session.tokenType,
      scope: refreshed.scope ?? session.scope,
      expiresAt: iGM_LauncherV2_ExpiresAt(refreshed.expires_in),
      user,
      savedAt: new Date().toISOString(),
    };
    await iGM_LauncherV2_StoreSave(next);
    iGM_LauncherV2_CurrentUser = user;
    iGM_LauncherV2_LastMessage = "";
    return user;
  } catch (error) {
    await iGM_LauncherV2_StoreClear();
    iGM_LauncherV2_CurrentUser = null;
    iGM_LauncherV2_LastMessage =
      error instanceof Error ? `登录已过期：${error.message}` : "登录已过期，请重新授权";
    return null;
  }
}

/**
 * 发起社区授权登录。
 * 全流程：校验配置 → 启动本地回调 → PKCE 拼装授权地址 → 调起浏览器 →
 * 等待回调 → 换令牌 → 拉取用户信息 → 落盘 → 回推登录成功。
 */
export async function iGM_LauncherV2_Auth_Login(notify: iGM_LauncherV2_Notifier): Promise<void> {
  if (iGM_LauncherV2_ActiveFlow) {
    iGM_LauncherV2_PushAuth(notify, "pending", null, "浏览器授权进行中，请在浏览器中完成授权");
    return;
  }

  const clientId = iGM_LauncherV2_ClientId();
  if (!clientId) {
    iGM_LauncherV2_LastMessage = `缺少 ${IGM_LAUNCHERV2_ENV_CLIENT_ID} 配置`;
    iGM_LauncherV2_PushAuth(notify, "logged-out", null, iGM_LauncherV2_LastMessage);
    return;
  }

  const codeVerifier = iGM_LauncherV2_Base64Url(randomBytes(48));
  const flow: iGM_LauncherV2_AuthFlow = {
    state: iGM_LauncherV2_Base64Url(randomBytes(24)),
    codeVerifier,
    resolveCode: null,
    rejectCode: null,
    server: null,
  };

  const authorizeUrl = new URL(IGM_LAUNCHERV2_COMMUNITY_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", IGM_LAUNCHERV2_REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", IGM_LAUNCHERV2_COMMUNITY_SCOPE);
  authorizeUrl.searchParams.set("state", flow.state);
  authorizeUrl.searchParams.set("code_challenge", iGM_LauncherV2_CodeChallenge(codeVerifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const codePromise = new Promise<string>((resolve, reject) => {
    flow.resolveCode = resolve;
    flow.rejectCode = reject;
  });

  // 端口占用属于可预期的本地冲突，直接给出可读提示
  try {
    iGM_LauncherV2_ListenCallback(flow);
  } catch (error) {
    iGM_LauncherV2_LastMessage = `无法监听本地回调端口 ${IGM_LAUNCHERV2_CALLBACK_PORT}：${
      error instanceof Error ? error.message : "端口被占用"
    }`;
    iGM_LauncherV2_PushAuth(notify, "logged-out", null, iGM_LauncherV2_LastMessage);
    return;
  }

  iGM_LauncherV2_ActiveFlow = flow;
  iGM_LauncherV2_LastMessage = "";
  iGM_LauncherV2_PushAuth(notify, "pending", null);

  const opened = await iGM_LauncherV2_OpenExternal(authorizeUrl.toString());
  if (!opened) {
    iGM_LauncherV2_PushAuth(
      notify,
      "pending",
      null,
      `未能自动打开浏览器，请手动访问授权地址：${authorizeUrl.toString()}`,
    );
  }

  let code = "";
  try {
    code = await Promise.race([
      codePromise,
      new Promise<string>((_, reject) =>
        setTimeout(
          () => reject(new Error("等待浏览器授权超时，请重新发起登录")),
          IGM_LAUNCHERV2_AUTH_WAIT_MS,
        ),
      ),
    ]);
  } catch (error) {
    iGM_LauncherV2_CloseCallback(flow);
    iGM_LauncherV2_ActiveFlow = null;
    iGM_LauncherV2_LastMessage = error instanceof Error ? error.message : "授权失败";
    iGM_LauncherV2_PushAuth(notify, "logged-out", null, iGM_LauncherV2_LastMessage);
    return;
  } finally {
    // 无论成功与否，回调端口只服务一次
    iGM_LauncherV2_CloseCallback(flow);
  }

  try {
    const tokens = await iGM_LauncherV2_ExchangeCode({
      code,
      codeVerifier: flow.codeVerifier,
      clientId,
    });
    const user = await iGM_LauncherV2_FetchUser(tokens.access_token ?? "");

    const session: iGM_LauncherV2_Session = {
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token ?? "",
      tokenType: tokens.token_type ?? "Bearer",
      scope: tokens.scope ?? IGM_LAUNCHERV2_COMMUNITY_SCOPE,
      expiresAt: iGM_LauncherV2_ExpiresAt(tokens.expires_in),
      user,
      savedAt: new Date().toISOString(),
    };
    await iGM_LauncherV2_StoreSave(session);

    iGM_LauncherV2_CurrentUser = user;
    iGM_LauncherV2_LastMessage = "";
    console.log(`[iGM CraftCeon Launcher] 社区授权成功：${user.nickname}（${user.uid}）`);
    iGM_LauncherV2_PushAuth(notify, "logged-in", user);
  } catch (error) {
    iGM_LauncherV2_CurrentUser = null;
    iGM_LauncherV2_LastMessage = error instanceof Error ? error.message : "换取令牌失败";
    console.warn("[iGM CraftCeon Launcher] 社区授权失败：", iGM_LauncherV2_LastMessage);
    iGM_LauncherV2_PushAuth(notify, "logged-out", null, iGM_LauncherV2_LastMessage);
  } finally {
    iGM_LauncherV2_ActiveFlow = null;
  }
}

/** 退出登录：清除本地会话与内存视图，并回推未登录状态 */
export async function iGM_LauncherV2_Auth_Logout(
  notify: iGM_LauncherV2_Notifier,
): Promise<void> {
  // 授权过程中点退出：关闭回调端口并中断在途流程
  if (iGM_LauncherV2_ActiveFlow) {
    const flow = iGM_LauncherV2_ActiveFlow;
    iGM_LauncherV2_ActiveFlow = null;
    iGM_LauncherV2_CloseCallback(flow);
    flow.rejectCode?.(new Error("已取消授权"));
  }

  iGM_LauncherV2_CurrentUser = null;
  iGM_LauncherV2_LastMessage = "";
  await iGM_LauncherV2_StoreClear().catch(() => undefined);
  iGM_LauncherV2_PushAuth(notify, "logged-out", null);
}

// 导出 //
export default iGM_LauncherV2_Auth_Login;
