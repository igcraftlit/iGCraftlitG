/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_OAuthShell/iGM_CLI_OAuthGate.tsx
 * 所属层：前端 / 组件层
 * 路由：/oauth/apply、/oauth/apps
 * 模块：iGM_CLI_OAuthShell
 * 作用：OAuth 分区登录态守卫——未登录时引导前往主站登录，避免匿名提交
 * 内容：页面挂载时静默探测 /G_Auth/me（skipAuthNotice，401 不触发过期提示），
 *       探测中显示加载态，未登录显示登录引导，已登录渲染子内容
 */

// 导入依赖 //
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, LogIn, ShieldCheck } from "lucide-react";
import {
  iGM_CLI_ApiGetMe,
  iGM_CLI_BuildLoginUrl,
} from "../../services/iGM_CLI_OAuthClient";
import styles from "./iGM_CLI_OAuth.module.css";

// 类型定义 //
/** 登录态探测结果 */
type iGM_CLI_AuthState = "checking" | "authenticated" | "anonymous";

interface iGM_CLI_OAuthGateProps {
  children: ReactNode;
}

// 核心逻辑 //
/** 登录态守卫：未登录引导登录，已登录放行 */
export function iGM_CLI_OAuthGate({ children }: iGM_CLI_OAuthGateProps) {
  const t = useTranslations();
  const [state, setState] = useState<iGM_CLI_AuthState>("checking");

  useEffect(() => {
    let cancelled = false;
    // 会话探测：未登录返回 401 属正常状态，跳过过期提示
    iGM_CLI_ApiGetMe()
      .then(() => {
        if (!cancelled) setState("authenticated");
      })
      .catch(() => {
        if (!cancelled) setState("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return (
      <div className={styles.stateBox}>
        <LoaderCircle size={16} className={styles.spinner} aria-hidden />
      </div>
    );
  }

  if (state === "anonymous") {
    return (
      <div className={styles.gate}>
        <span className={styles.gateIcon}>
          <ShieldCheck size={18} strokeWidth={1.8} aria-hidden />
        </span>
        <p className={styles.gateText}>{t("oauth.consent.loginRequired")}</p>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            window.location.href = iGM_CLI_BuildLoginUrl();
          }}
        >
          <LogIn size={15} strokeWidth={1.8} aria-hidden />
          {t("oauth.consent.goLogin")}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

// 导出 //
export default iGM_CLI_OAuthGate;
