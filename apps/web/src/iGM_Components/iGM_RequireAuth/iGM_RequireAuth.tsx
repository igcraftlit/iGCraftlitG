/**
 * 文件路径：apps/web/src/iGM_Components/iGM_RequireAuth/iGM_RequireAuth.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Settings、G_Admin 等需要登录或特定角色的页面
 * 模块：iGM_RequireAuth
 * 作用：客户端登录态与角色访问控制
 * 内容：会话恢复中占位、未登录跳转登录页（带回跳地址）、角色不足显示无权限面板
 * 说明：仅为体验优化，真正的安全边界是后端 iGM_AuthGuard
 */

// 导入依赖 //
"use client";

import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { useEffect, type ReactNode } from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldOff, LoaderCircle } from "lucide-react";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import {
  iGM_IsStaffUser,
  type iGM_UserRole,
} from "../../iGM_Services/iGM_AuthClient";
import styles from "../../iGM_Pages/iGM_Page.module.css";

// 类型定义 //
interface iGM_RequireAuthProps {
  /** 需要的最低角色；不传仅要求登录 */
  role?: iGM_UserRole;
  /**
   * 模块二十五：要求管理人员身份（管理员或受信任组织负责人）。
   * 与 role 同时传入时满足其一即可；真正边界由后端强制。
   */
  staff?: boolean;
  children: ReactNode;
}

// 核心逻辑 //
/** 登录/角色守卫组件 */
export function iGM_RequireAuth({ role, staff, children }: iGM_RequireAuthProps) {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const pathname = usePathname();
  const { status, user, hasRole } = iGM_UseAuth();

  // 会话恢复期间展示极简加载占位
  useEffect(() => {
    if (status === "anonymous") {
      const redirect = encodeURIComponent(pathname);
      router.replace(`/G_Auth/login?redirect=${redirect}`);
    }
  }, [status, pathname, router]);

  if (status === "loading") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: "40vh",
          color: "var(--igm-text-muted)",
          fontSize: 13,
        }}
      >
        <LoaderCircle size={16} className="igm-spin" />
        {t("auth.state.checking")}
      </div>
    );
  }

  if (status === "anonymous") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "40vh",
          color: "var(--igm-text-muted)",
          fontSize: 13,
        }}
      >
        {t("auth.state.redirecting")}
      </div>
    );
  }

  // 已登录但角色 / 管理人员身份均不满足：不渲染受保护内容
  const roleAllowed = role ? hasRole(role) : false;
  const staffAllowed = staff ? iGM_IsStaffUser(user) : false;
  if ((role || staff) && !roleAllowed && !staffAllowed) {
    return (
      <div className={styles.notFound}>
        <ShieldOff size={36} strokeWidth={1.5} color="var(--igm-text-subtle)" />
        <h2 className={styles.notFoundTitle}>{t("auth.state.forbiddenTitle")}</h2>
        <p className={styles.notFoundDescription}>
          {t("auth.state.forbiddenDescription")}
        </p>
        <Link href="/G_Home" className={styles.primaryLink}>
          {t("auth.state.backHome")}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

// 导出 //
export default iGM_RequireAuth;
