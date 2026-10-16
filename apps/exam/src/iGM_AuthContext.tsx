/**
 * 文件路径：apps/exam/src/iGM_AuthContext.tsx
 * 所属层：前端 / 全局认证层
 * 路由：全局
 * 模块：iGM_ExamAuth
 * 作用：考试站 OAuth Client 登录态管理
 * 内容：应用挂载后 fetch /api/exam/oauth/me 获取当前用户、
 *       login() 跳转后端 /api/exam/oauth/login（浏览器直接 302 到主站 IdP）、
 *       logout() POST /api/exam/oauth/logout 清本地会话 + 清 cookie、
 *       isExaminer / creatorId / creatorNumber 字段直接从 me 接口拿
 * 说明：所有 fetch 走原生 fetch + credentials:"include"，
 *       不依赖 iGM_ExamClient 里的 iGM_Exam_Unwrap（未登录时 me 返回 data:null 是合法的）；
 *       客户端组件必须包裹在 ExamAuthProvider 内，
 *       服务端组件不使用（Next.js 静态导出不支持 SSR）
 */

// 导入依赖 //
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { iGM_ExamConfig } from "./iGM_Services/iGM_ExamConfig";

// 类型定义 //
/** 当前登录用户的考试站视角信息（对应后端 /api/exam/oauth/me 响应 data） */
export interface iGM_ExamAuthUser {
  uid: string;
  displayName: string;
  picture: string | null;
  username: string;
  isExaminer: boolean;
  creatorId: string | null;
  creatorNumber: string | null;
}

/** Auth Context 状态 */
interface iGM_ExamAuthContextValue {
  /** 是否还在首屏拉取 me 接口（loading 态） */
  loading: boolean;
  /** 当前登录用户；未登录时 null */
  user: iGM_ExamAuthUser | null;
  /** 首屏拉取 me 接口时的错误（网络/后端 500 等）；未登录（401/200+data:null）不算错误 */
  error: string | null;
  /** 跳转登录（浏览器直接 302 到后端 /api/exam/oauth/login） */
  login: () => void;
  /** 登出：清本地会话 + 清 cookie + 刷新 me */
  logout: () => Promise<void>;
  /** 手动刷新登录态（跨标签页登录后可调用） */
  refresh: () => Promise<void>;
}

/** Context 常量（独立于 iGM_I18nContext） */
const iGM_ExamAuthContext = createContext<iGM_ExamAuthContextValue | null>(null);

/** 登录 / 登出 / me 的统一响应结构 */
interface iGM_ExamAuthEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
}

// 核心逻辑 //

/** fetch /api/exam/oauth/me —— 未登录（data:null）视为正常返回 */
async function iGM_FetchMe(): Promise<iGM_ExamAuthUser | null> {
  const res = await fetch(`${iGM_ExamConfig.apiBase}/api/exam/oauth/me`, {
    headers: { Accept: "application/json" },
    credentials: "include",
    cache: "no-store",
  });
  let payload: iGM_ExamAuthEnvelope<iGM_ExamAuthUser> | null = null;
  try {
    payload = (await res.json()) as iGM_ExamAuthEnvelope<iGM_ExamAuthUser>;
  } catch {
    throw new Error(`Unexpected response (HTTP ${res.status})`);
  }
  // 未登录是正常的：后端返回 success:true + data:null
  if (payload.success && payload.data === null) return null;
  // 真正的错误：网络 4xx/5xx 或业务层 success:false
  if (!res.ok || !payload.success) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  return payload.data as iGM_ExamAuthUser;
}

/** POST /api/exam/oauth/logout —— 清本地会话 + 清 cookie */
async function iGM_PostLogout(): Promise<void> {
  const res = await fetch(`${iGM_ExamConfig.apiBase}/api/exam/oauth/logout`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "include",
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(`Logout failed (HTTP ${res.status})`);
  }
  // 不管业务响应壳，Set-Cookie header 已经清了 session
}

// Provider + Hook //

/** 全局 Provider：应用挂载后拉一次 me 接口 */
export function iGM_ExamAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<iGM_ExamAuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const u = await iGM_FetchMe();
      setUser(u);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load session",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(() => {
    // 浏览器直接跳，后端返回 302 到主站 /oauth/authorize
    window.location.href = `${iGM_ExamConfig.apiBase}/api/exam/oauth/login`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await iGM_PostLogout();
    } catch {
      // 网络问题：尝试继续清理本地状态，不要阻塞用户
    }
    setUser(null);
  }, []);

  const value: iGM_ExamAuthContextValue = {
    loading,
    user,
    error,
    login,
    logout,
    refresh,
  };

  return (
    <iGM_ExamAuthContext.Provider value={value}>
      {children}
    </iGM_ExamAuthContext.Provider>
  );
}

/** 子组件内读取当前认证状态 */
export function iGM_ExamUseAuth(): iGM_ExamAuthContextValue {
  const ctx = useContext(iGM_ExamAuthContext);
  if (!ctx) {
    throw new Error(
      "iGM_ExamUseAuth must be used inside iGM_ExamAuthProvider",
    );
  }
  return ctx;
}

// 导出 //
export default iGM_ExamAuthProvider;
