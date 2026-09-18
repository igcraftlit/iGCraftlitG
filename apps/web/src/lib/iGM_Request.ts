/**
 * 文件：apps/web/src/lib/iGM_Request.ts
 * 所属层：前端（基础服务层）
 * 路由：G_Api（全部后端接口调用）
 * 模块：iGM_Request
 * 作用：统一的 HTTP 请求封装，组件内禁止散落 fetch
 * 内容：统一响应信封类型、错误类型、GET/POST/PUT/PATCH/DELETE 方法
 */
// ==================== 区块：导入依赖 ====================
import iGM_Env from './iGM_Env';

// ==================== 区块：类型定义 ====================
/** 后端统一响应格式（与项目规则一致） */
export interface iGM_ApiEnvelope<T = unknown> {
  success: boolean;
  code: string;
  message: string;
  data?: T;
}

/** 请求初始化选项（标准化后的 fetch 参数） */
export interface iGM_RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** 请求体，将自动 JSON 序列化 */
  body?: unknown;
  /** 额外请求头 */
  headers?: Record<string, string>;
  /** 自定义缓存策略，透传 fetch */
  cache?: RequestCache;
  /** AbortSignal，用于取消请求 */
  signal?: AbortSignal;
}

/** 统一业务错误 */
export class iGM_RequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'iGM_RequestError';
    this.status = status;
    this.code = code;
  }
}

// ==================== 区块：核心逻辑 ====================
/**
 * 发起统一 API 请求
 * @param path 接口路径（拼接在 iGM_Env.apiBaseUrl 之后）
 * @param options 请求选项
 * @returns 响应信封中的 data 负载
 */
async function request<T>(path: string, options: iGM_RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, cache, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${iGM_Env.apiBaseUrl}${path}`, {
      method,
      // 鉴权依赖 HttpOnly Cookie，默认携带同源凭证
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache,
      signal,
    });
  } catch (cause) {
    throw new iGM_RequestError('Network request failed', 0, 'NETWORK_ERROR');
  }

  let envelope: iGM_ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as iGM_ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok) {
    throw new iGM_RequestError(
      envelope?.message || `HTTP ${response.status}`,
      response.status,
      envelope?.code || 'HTTP_ERROR',
    );
  }

  if (!envelope || !envelope.success) {
    throw new iGM_RequestError(
      envelope?.message || 'Unknown response error',
      response.status,
      envelope?.code || 'BIZ_ERROR',
    );
  }

  return envelope.data as T;
}

// ==================== 区块：导出 ====================
export const iGM_Request = {
  request,
  get: <T>(path: string, options?: Omit<iGM_RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<iGM_RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<iGM_RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<iGM_RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<iGM_RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export default iGM_Request;
