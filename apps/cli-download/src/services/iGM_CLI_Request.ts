/**
 * 文件路径：apps/cli-download/src/services/iGM_CLI_Request.ts
 * 所属层：前端 / 基础服务层
 * 路由：全局（调用后端 G_Xxxxx 路由）
 * 模块：iGM_CLI_Request
 * 作用：CLI 站 OAuth 分区唯一的 HTTP 请求封装，所有后端调用必须经过此模块
 * 内容：运行时 API 基地址解析、JSON 头、8 秒超时、统一响应结构解包、错误归一化、
 *       跨域携带 HttpOnly 会话 Cookie（credentials: include）、401 统一拦截
 *       （清除失效令牌 + 广播失效事件，由界面层给出多语言提示）
 */

// 导入依赖 //
import {
  iGM_CLI_HandleUnauthorized,
  type iGM_CLI_OAuthUnauthorizedScope,
} from "./iGM_CLI_OAuthTokenStore";

// 类型定义 //
/** 与后端 iGM_Types/iGM_Response.ts 保持一致的统一响应结构 */
export interface iGM_CLI_ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
}

export interface iGM_CLI_RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** 请求体，自动序列化为 JSON */
  body?: unknown;
  /** 额外请求头 */
  headers?: Record<string, string>;
  /** 超时毫秒数，默认 8000 */
  timeoutMs?: number;
  /**
   * 跳过 401 统一拦截（不广播登录过期提示）。
   * 仅用于「会话探测」类接口（如 /G_Auth/me 未登录时本就返回 401），
   * 避免匿名访客首次进入页面即弹出「登录已过期」提示。
   */
  skipAuthNotice?: boolean;
  /** 401 失效场景：session 站点登录 / token 第三方授权，默认 session */
  unauthorizedScope?: iGM_CLI_OAuthUnauthorizedScope;
}

/** 请求失败时抛出的归一化错误 */
export class iGM_CLI_RequestError extends Error {
  constructor(
    message: string,
    /** 错误来源：network 网络异常 / timeout 超时 / business 业务失败 */
    public readonly kind: "network" | "timeout" | "business",
    public readonly code?: number,
  ) {
    super(message);
    this.name = "iGM_CLI_RequestError";
  }
}

// 核心逻辑 //
/**
 * 解析后端 API 基地址（运行时判定，静态导出安全）：
 * 1. 构建期注入的 NEXT_PUBLIC_IGM_CLI_API_BASE 优先；
 * 2. 本地开发（localhost / 127.0.0.1）指向 http://localhost:3001；
 * 3. 其余（api.igcraftlit.com 隧道）指向生产 https://api.igcraftlit.com。
 */
export function iGM_CLI_GetApiBase(): string {
  const override = process.env.NEXT_PUBLIC_IGM_CLI_API_BASE;
  if (override) return override.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:3001";
    }
  }
  return "https://api.igcraftlit.com";
}

/** 读取界面语言（用于后端选择邮件与错误文案语言） */
function iGM_CLI_ReadLocale(): string {
  if (typeof document === "undefined") return "zh-CN";
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith("iGM_CLI_LOCALE="));
  return match ? decodeURIComponent(match.split("=")[1]) : "zh-CN";
}

/**
 * iGM_CLI_Request 统一请求方法
 * @param path 以 / 开头的后端路由，例如 /G_OAuth/apps/mine
 */
export async function iGM_CLI_Request<T>(
  path: string,
  options: iGM_CLI_RequestOptions = {},
): Promise<iGM_CLI_ApiResponse<T>> {
  const {
    method = "GET",
    body,
    headers = {},
    timeoutMs = 8000,
    skipAuthNotice = false,
    unauthorizedScope = "session",
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${iGM_CLI_GetApiBase()}${path}`, {
      method,
      // 跨域携带后端下发的 HttpOnly 会话 Cookie（iGM_SID）
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        "x-igm-locale": iGM_CLI_ReadLocale(),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    // 401 统一拦截：清除失效令牌并广播失效事件（界面层据此给出多语言提示）
    if (response.status === 401 && !skipAuthNotice) {
      iGM_CLI_HandleUnauthorized(unauthorizedScope);
    }

    const payload = (await response.json()) as iGM_CLI_ApiResponse<T>;

    if (!response.ok || !payload.success) {
      throw new iGM_CLI_RequestError(
        payload.message || `HTTP ${response.status}`,
        "business",
        payload.code ?? response.status,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof iGM_CLI_RequestError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new iGM_CLI_RequestError("timeout", "timeout");
    }
    throw new iGM_CLI_RequestError("network", "network");
  } finally {
    clearTimeout(timer);
  }
}

/** GET 快捷方法 */
export function iGM_CLI_Get<T>(
  path: string,
  options: { skipAuthNotice?: boolean } = {},
): Promise<iGM_CLI_ApiResponse<T>> {
  return iGM_CLI_Request<T>(path, { method: "GET", ...options });
}

/** POST 快捷方法 */
export function iGM_CLI_Post<T>(
  path: string,
  body?: unknown,
  options: { skipAuthNotice?: boolean; timeoutMs?: number } = {},
): Promise<iGM_CLI_ApiResponse<T>> {
  return iGM_CLI_Request<T>(path, { method: "POST", body, ...options });
}

// 导出 //
export default iGM_CLI_Request;
