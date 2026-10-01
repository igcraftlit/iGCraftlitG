/**
 * 文件路径：apps/web/src/iGM_Services/iGM_OAuthTokenStore.ts
 * 所属层：前端 / 基础服务层
 * 路由：全局
 * 模块：iGM_OAuthTokenStore
 * 作用：本地 OAuth 令牌缓存与「令牌失效」事件广播的唯一出口
 * 内容：access_token / refresh_token 的读写与清空、401 失效事件订阅与广播
 * 说明：本站会话由后端 HttpOnly Cookie 承载，本地仅缓存接入第三方服务时
 *       持有的 OAuth 令牌；无 localStorage 环境（SSR/静态导出阶段）自动降级为不缓存；
 *       失效事件通过 window 自定义事件广播，由 iGM_SessionExpiredToast 统一提示
 */

// 导入依赖 //
// （本文件仅操作浏览器存储与事件，无第三方依赖）

// 类型定义 //
/** 本地缓存的 OAuth 令牌对 */
export interface iGM_OAuthTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

/** 失效场景：session 站点登录已过期 / token 第三方授权已失效 */
export type iGM_OAuthUnauthorizedScope = "session" | "token";

/** 失效事件载荷 */
export interface iGM_OAuthUnauthorizedDetail {
  scope: iGM_OAuthUnauthorizedScope;
}

/** 失效事件名（window 自定义事件，供提示组件订阅） */
export const iGM_OAuthUnauthorizedEvent = "igm:oauth-unauthorized";

/** localStorage 键名（不含任何密钥，仅令牌字符串） */
const iGM_AccessTokenKey = "iGM_OAuthAccessToken";
const iGM_RefreshTokenKey = "iGM_OAuthRefreshToken";

// 核心逻辑 //
/** 存储是否可用（静态导出与隐私模式下 localStorage 可能不可写） */
function iGM_StorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** 读取本地缓存的令牌 */
export function iGM_ReadOAuthTokens(): iGM_OAuthTokens {
  if (!iGM_StorageAvailable()) {
    return { accessToken: null, refreshToken: null };
  }
  return {
    accessToken: localStorage.getItem(iGM_AccessTokenKey),
    refreshToken: localStorage.getItem(iGM_RefreshTokenKey),
  };
}

/** 写入本地令牌缓存（传 null 表示清除该项） */
export function iGM_WriteOAuthTokens(tokens: iGM_OAuthTokens): void {
  if (!iGM_StorageAvailable()) return;
  if (tokens.accessToken) {
    localStorage.setItem(iGM_AccessTokenKey, tokens.accessToken);
  } else {
    localStorage.removeItem(iGM_AccessTokenKey);
  }
  if (tokens.refreshToken) {
    localStorage.setItem(iGM_RefreshTokenKey, tokens.refreshToken);
  } else {
    localStorage.removeItem(iGM_RefreshTokenKey);
  }
}

/** 清除失效令牌（401 拦截时调用） */
export function iGM_ClearOAuthTokens(): void {
  if (!iGM_StorageAvailable()) return;
  localStorage.removeItem(iGM_AccessTokenKey);
  localStorage.removeItem(iGM_RefreshTokenKey);
}

/** 订阅失效事件，返回取消订阅函数 */
export function iGM_SubscribeUnauthorized(
  handler: (detail: iGM_OAuthUnauthorizedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    handler(
      (event as CustomEvent<iGM_OAuthUnauthorizedDetail>).detail ?? {
        scope: "session",
      },
    );
  };
  window.addEventListener(iGM_OAuthUnauthorizedEvent, listener);
  return () => window.removeEventListener(iGM_OAuthUnauthorizedEvent, listener);
}

/**
 * 统一处理 401：清除本地失效令牌并广播失效事件。
 * 由 iGM_Request 的响应拦截统一调用，界面侧只负责提示与引导重新登录。
 */
export function iGM_HandleUnauthorized(
  scope: iGM_OAuthUnauthorizedScope = "session",
): void {
  iGM_ClearOAuthTokens();
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<iGM_OAuthUnauthorizedDetail>(iGM_OAuthUnauthorizedEvent, {
      detail: { scope },
    }),
  );
}

// 导出 //
export default {
  iGM_ReadOAuthTokens,
  iGM_WriteOAuthTokens,
  iGM_ClearOAuthTokens,
  iGM_SubscribeUnauthorized,
  iGM_HandleUnauthorized,
};
