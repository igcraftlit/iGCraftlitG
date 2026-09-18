/**
 * 文件路径：apps/web/src/iGM_Providers/iGM_AuthProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_AuthProvider（iGM_AuthStore）
 * 作用：维护当前登录用户状态，挂载时通过 /G_Auth/me 自动恢复会话
 * 内容：登录态状态机（loading/authenticated/anonymous）、用户信息、
 *       角色判断、登出、登录/注册后写入用户、手动刷新
 * 说明：会话本身由后端 HttpOnly Cookie 承载，前端不接触会话令牌
 */

// 导入依赖 //
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  iGM_ApiLogout,
  iGM_ApiMe,
  type iGM_User,
  type iGM_UserRole,
} from "../iGM_Services/iGM_AuthClient";

// 类型定义 //
/** 登录态状态机：初始加载 / 已登录 / 未登录 */
export type iGM_AuthStatus = "loading" | "authenticated" | "anonymous";

interface iGM_AuthContextValue {
  status: iGM_AuthStatus;
  user: iGM_User | null;
  /** 登录/注册/验证成功后写入用户 */
  setUser: (user: iGM_User) => void;
  /** 登出并通知后端销毁会话 */
  logout: () => Promise<void>;
  /** 重新拉取当前用户 */
  refresh: () => Promise<void>;
  /** 角色判断：当前用户是否达到指定角色权重 */
  hasRole: (role: iGM_UserRole) => boolean;
}

interface iGM_AuthProviderProps {
  children: ReactNode;
}

// 核心逻辑 //
const iGM_AuthContext = createContext<iGM_AuthContextValue | null>(null);

/** 角色权重，与后端 iGM_AuthGuard 保持一致 */
const iGM_RoleWeight: Record<iGM_UserRole, number> = {
  user: 1,
  moderator: 2,
  admin: 3,
};

/** 认证状态 Provider */
export function iGM_AuthProvider({ children }: iGM_AuthProviderProps) {
  const [status, setStatus] = useState<iGM_AuthStatus>("loading");
  const [user, setUserState] = useState<iGM_User | null>(null);

  /** 挂载时用 Cookie 会话恢复用户；失败即未登录 */
  const refresh = useCallback(async () => {
    try {
      const response = await iGM_ApiMe();
      if (!response.data) {
        setUserState(null);
        setStatus("anonymous");
        return;
      }
      setUserState(response.data.user);
      setStatus("authenticated");
    } catch {
      setUserState(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setUser = useCallback((nextUser: iGM_User) => {
    setUserState(nextUser);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await iGM_ApiLogout();
    } catch {
      // 即使后端调用失败（如会话已过期）也清空前端状态
    }
    setUserState(null);
    setStatus("anonymous");
  }, []);

  const hasRole = useCallback(
    (role: iGM_UserRole) =>
      user !== null && iGM_RoleWeight[user.role] >= iGM_RoleWeight[role],
    [user],
  );

  const contextValue = useMemo(
    () => ({ status, user, setUser, logout, refresh, hasRole }),
    [status, user, setUser, logout, refresh, hasRole],
  );

  return (
    <iGM_AuthContext.Provider value={contextValue}>
      {children}
    </iGM_AuthContext.Provider>
  );
}

/** 读取认证上下文的 Hook */
export function iGM_UseAuth(): iGM_AuthContextValue {
  const context = useContext(iGM_AuthContext);
  if (!context) {
    throw new Error("iGM_UseAuth 必须在 iGM_AuthProvider 内使用");
  }
  return context;
}

// 导出 //
export default iGM_AuthProvider;
