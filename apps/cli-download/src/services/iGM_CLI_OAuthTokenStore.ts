/**
 * 文件路径：apps/cli-download/src/services/iGM_CLI_OAuthTokenStore.ts
 * 所属层：前端 / 基础服务层
 * 路由：全局（OAuth 分区）
 * 模块：iGM_CLI_OAuthTokenStore
 * 作用：本地 OAuth 令牌缓存与「令牌失效」事件广播的唯一出口
 * 内容：access_token / refresh_token 的读写与清空、401 失效事件订阅与广播；
 *       无 localStorage 环境（静态导出阶段）自动降级为不缓存
 */

// 导入依赖 //
// （本文件仅操作浏览器存储与事件，无第三方依赖）

// 类型定义 //
/** 本地缓存的 OAuth 令牌对 */
export interface iGM_CLI_OAuthTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

/** 失效场景：session 站点登录已过期 / token 第三方授权已失效 */
export type iGM_CLI_OAuthUnauthorizedScope = "session" | "token";

/** 失效事件载荷 */
export interface iGM_CLI_OAuthUnauthorizedDetail {
  scope: iGM_CLI_OAuthUnauthorizedScope;
}

/** 失效事件名（window 自定义事件，供提示组件订阅） */
export const iGM_CLI_OAuthUnauthorizedEvent = "igm-cli:oauth-unauthorized";

/** localStorage 键名（不含任何密钥，仅令牌字符串） */
const iGM_CLI_AccessTokenKey = "iGM_CLI_OAuthAccessToken";
const iGM_CLI_RefreshTokenKey = "iGM_CLI_OAuthRefreshToken";

// 核心逻辑 //
/** 存储是否可用（静态导出与隐私模式下 localStorage 可能不可写） */
function iGM_CLI_StorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** 读取本地缓存的令牌 */
export function iGM_CLI_ReadOAuthTokens(): iGM_CLI_OAuthTokens {
  if (!iGM_CLI_StorageAvailable()) {
    return { accessToken: null, refreshToken: null };
  }
  return {
    accessToken: localStorage.getItem(iGM_CLI_AccessTokenKey),
    refreshToken: localStorage.getItem(iGM_CLI_RefreshTokenKey),
  };
}

/** 写入本地令牌缓存（传 null 表示清除该项） */
export function iGM_CLI_WriteOAuthTokens(tokens: iGM_CLI_OAuthTokens): void {
  if (!iGM_CLI_StorageAvailable()) return;
  if (tokens.accessToken) {
    localStorage.setItem(iGM_CLI_AccessTokenKey, tokens.accessToken);
  } else {
    localStorage.removeItem(iGM_CLI_AccessTokenKey);
  }
  if (tokens.refreshToken) {
    localStorage.setItem(iGM_CLI_RefreshTokenKey, tokens.refreshToken);
  } else {
    localStorage.removeItem(iGM_CLI_RefreshTokenKey);
  }
}

/** 清除失效令牌（401 拦截时调用） */
export function iGM_CLI_ClearOAuthTokens(): void {
  if (!iGM_CLI_StorageAvailable()) return;
  localStorage.removeItem(iGM_CLI_AccessTokenKey);
  localStorage.removeItem(iGM_CLI_RefreshTokenKey);
}

/** 订阅失效事件，返回取消订阅函数 */
export function iGM_CLI_SubscribeUnauthorized(
  handler: (detail: iGM_CLI_OAuthUnauthorizedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    handler(
      (event as CustomEvent<iGM_CLI_OAuthUnauthorizedDetail>).detail ?? {
        scope: "session",
      },
    );
  };
  window.addEventListener(iGM_CLI_OAuthUnauthorizedEvent, listener);
  return () => window.removeEventListener(iGM_CLI_OAuthUnauthorizedEvent, listener);
}

/**
 * 统一处理 401：清除本地失效令牌并广播失效事件。
 * 由 iGM_CLI_Request 的响应拦截统一调用，界面侧只负责提示与引导重新登录。
 */
export function iGM_CLI_HandleUnauthorized(
  scope: iGM_CLI_OAuthUnauthorizedScope = "session",
): void {
  iGM_CLI_ClearOAuthTokens();
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<iGM_CLI_OAuthUnauthorizedDetail>(
      iGM_CLI_OAuthUnauthorizedEvent,
      { detail: { scope } },
    ),
  );
}

// 导出 //
export default {
  iGM_CLI_ReadOAuthTokens,
  iGM_CLI_WriteOAuthTokens,
  iGM_CLI_ClearOAuthTokens,
  iGM_CLI_SubscribeUnauthorized,
  iGM_CLI_HandleUnauthorized,
};
