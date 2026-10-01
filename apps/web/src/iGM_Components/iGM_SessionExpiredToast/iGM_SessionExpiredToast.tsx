/**
 * 文件路径：apps/web/src/iGM_Components/iGM_SessionExpiredToast/iGM_SessionExpiredToast.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（挂载于 iGM_Providers）
 * 模块：iGM_SessionExpiredToast
 * 作用：令牌失效（401）时的多语言优雅提示与重新登录引导
 * 内容：订阅 iGM_OAuthTokenStore 的失效事件、展示人类可读文案（禁止暴露 i18n 键）、
 *       同步刷新本地登录态、引导跳转登录页（带回跳地址）、可手动关闭
 * 说明：文案全部来自语言包 oauth.session.*；令牌清理由请求拦截层统一完成
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, KeyRound, X } from "lucide-react";
import {
  iGM_SubscribeUnauthorized,
  type iGM_OAuthUnauthorizedScope,
} from "../../iGM_Services/iGM_OAuthTokenStore";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import styles from "./iGM_SessionExpiredToast.module.css";

// 类型定义 //
// （组件无对外 Props，挂载即生效）

// 核心逻辑 //
/** 令牌失效提示条：右下角浮层，展示多语言提示并引导重新登录 */
export function iGM_SessionExpiredToast() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const pathname = usePathname();
  const { refresh } = iGM_UseAuth();
  const [scope, setScope] = useState<iGM_OAuthUnauthorizedScope | null>(null);

  useEffect(
    () =>
      iGM_SubscribeUnauthorized((detail) => {
        setScope(detail.scope);
        // 会话已失效：同步刷新本地登录态，避免界面仍显示为已登录
        void refresh();
      }),
    [refresh],
  );

  const iGM_Close = useCallback(() => setScope(null), []);

  /** 引导重新登录：跳转登录页并携带当前路径以便登录后回跳 */
  const iGM_GoLogin = useCallback(() => {
    setScope(null);
    router.push(`/G_Auth/login?redirect=${encodeURIComponent(pathname)}`);
  }, [router, pathname]);

  if (!scope) return null;

  return (
    <div className={styles.toast} role="alert">
      <span className={styles.icon}>
        <AlertCircle size={16} strokeWidth={2} />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>
          {scope === "token"
            ? t("oauth.session.tokenExpired")
            : t("oauth.session.loginExpired")}
        </p>
        <p className={styles.desc}>{t("oauth.session.reloginHint")}</p>
      </div>
      <button type="button" className={styles.action} onClick={iGM_GoLogin}>
        <KeyRound size={14} strokeWidth={2} />
        {t("oauth.session.relogin")}
      </button>
      <button
        type="button"
        className={styles.close}
        onClick={iGM_Close}
        aria-label={t("oauth.session.dismiss")}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

// 导出 //
export default iGM_SessionExpiredToast;
