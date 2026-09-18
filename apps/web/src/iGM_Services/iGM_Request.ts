/**
 * 文件路径：apps/web/src/iGM_Services/iGM_Request.ts
 * 所属层：前端 / 基础服务层
 * 路由：全局（调用本地后端 G_Xxxxx 路由）
 * 模块：iGM_Request
 * 作用：全站唯一的 HTTP 请求封装，所有后端调用必须经过此模块
 * 内容：统一前缀拼接、JSON 头、8 秒超时、统一响应结构解包、错误归一化、
 *       跨端口携带 HttpOnly 会话 Cookie（credentials）、自动附带界面语言头
 */

// 导入依赖 //
import { iGM_Config } from "./iGM_Config";
import { iGM_LocaleCookieName } from "../iGM_i18n/iGM_Locales";

// 类型定义 //
/** 与后端 iGM_Types/iGM_Response.ts 保持一致的统一响应结构 */
export interface iGM_ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
}

export interface iGM_RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** 请求体，自动序列化为 JSON */
  body?: unknown;
  /** 额外请求头 */
  headers?: Record<string, string>;
  /** 超时毫秒数，默认 8000 */
  timeoutMs?: number;
}

/** 请求失败时抛出的归一化错误 */
export class iGM_RequestError extends Error {
  constructor(
    message: string,
    /** 错误来源：network 网络异常 / timeout 超时 / business 业务失败 */
    public readonly kind: "network" | "timeout" | "business",
    public readonly code?: number,
  ) {
    super(message);
    this.name = "iGM_RequestError";
  }
}

// 核心逻辑 //
/** 读取持久化在 Cookie 中的界面语言，供后端选择邮件语言 */
function iGM_ReadLocaleCookie(): string {
  if (typeof document === "undefined") return "zh-CN";
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${iGM_LocaleCookieName}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : "zh-CN";
}

/**
 * iGM_Request 统一请求方法
 * @param path 以 / 开头的后端路由，例如 /G_Api_Health
 */
export async function iGM_Request<T>(
  path: string,
  options: iGM_RequestOptions = {},
): Promise<iGM_ApiResponse<T>> {
  const { method = "GET", body, headers = {}, timeoutMs = 8000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${iGM_Config.apiBase}${path}`, {
      method,
      // 跨端口同站携带后端下发的 HttpOnly 会话 Cookie
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        "x-igm-locale": iGM_ReadLocaleCookie(),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = (await response.json()) as iGM_ApiResponse<T>;

    if (!response.ok || !payload.success) {
      throw new iGM_RequestError(
        payload.message || `HTTP ${response.status}`,
        "business",
        payload.code ?? response.status,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof iGM_RequestError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new iGM_RequestError("请求超时", "timeout");
    }
    throw new iGM_RequestError(
      "无法连接本地后端服务",
      "network",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** GET 快捷方法 */
export function iGM_Get<T>(path: string): Promise<iGM_ApiResponse<T>> {
  return iGM_Request<T>(path, { method: "GET" });
}

/** POST 快捷方法（可自定义超时，邮件类接口建议 15000ms） */
export function iGM_Post<T>(
  path: string,
  body?: unknown,
  timeoutMs = 8000,
): Promise<iGM_ApiResponse<T>> {
  return iGM_Request<T>(path, { method: "POST", body, timeoutMs });
}

/** PUT 快捷方法 */
export function iGM_Put<T>(
  path: string,
  body?: unknown,
): Promise<iGM_ApiResponse<T>> {
  return iGM_Request<T>(path, { method: "PUT", body });
}

/** DELETE 快捷方法 */
export function iGM_Delete<T>(path: string): Promise<iGM_ApiResponse<T>> {
  return iGM_Request<T>(path, { method: "DELETE" });
}

/** 后端健康检查数据结构 */
export interface iGM_HealthResult {
  status: "ok";
  service: string;
  version: string;
  time: string;
}

/** 调用 G_Api_Health 健康检查端点 */
export function iGM_CheckHealth(): Promise<iGM_ApiResponse<iGM_HealthResult>> {
  return iGM_Get<iGM_HealthResult>("/G_Api_Health");
}

// 导出 //
export default iGM_Request;
