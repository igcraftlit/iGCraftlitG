/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_SessionExpired/iGM_CLI_SessionExpired.tsx
 * 所属层：前端 / 组件层
 * 路由：/oauth/* 全部页面（登录态相关）
 * 模块：iGM_CLI_OAuthSession
 * 作用：401 登录过期 / 授权失效的多语言优雅提示（模态框）与重新登录引导
 * 内容：订阅令牌存储广播的失效事件，按场景展示人类可读文案（禁止展示 i18n 键值），
 *       提供「重新登录」跳转主站登录页（带 redirect 回跳）与关闭按钮
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LogIn, ShieldAlert, X } from "lucide-react";
import {
  iGM_CLI_SubscribeUnauthorized,
  type iGM_CLI_OAuthUnauthorizedScope,
} from "../../services/iGM_CLI_OAuthTokenStore";
import { iGM_CLI_BuildLoginUrl } from "../../services/iGM_CLI_OAuthClient";
import styles from "./iGM_CLI_SessionExpired.module.css";

// 类型定义 //
// （本组件仅使用上层传入的事件载荷与语言包键）

// 核心逻辑 //
/** 会话过期提示模态框：由 401 拦截广播驱动 */
export function iGM_CLI_SessionExpired() {
  const t = useTranslations();
  const [scope, setScope] = useState<iGM_CLI_OAuthUnauthorizedScope | null>(null);

  // 订阅失效事件：捕获 401 后展示提示
  useEffect(() => iGM_CLI_SubscribeUnauthorized((detail) => setScope(detail.scope)), []);

  if (scope === null) return null;

  // 场景化人类可读文案：session 登录过期 / token 授权失效
  const message =
    scope === "token"
      ? t("oauth.session.tokenExpired")
      : t("oauth.session.loginExpired");

  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true">
      <div className={styles.dialog}>
        <div className={styles.head}>
          <span className={styles.icon}>
            <ShieldAlert size={18} strokeWidth={1.8} aria-hidden />
          </span>
          <p className={styles.title}>{message}</p>
          <button
            type="button"
            className={styles.close}
            aria-label={t("oauth.session.dismiss")}
            onClick={() => setScope(null)}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <p className={styles.hint}>{t("oauth.session.reloginHint")}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.reloginButton}
            onClick={() => {
              window.location.href = iGM_CLI_BuildLoginUrl();
            }}
          >
            <LogIn size={15} strokeWidth={1.8} aria-hidden />
            {t("oauth.session.relogin")}
          </button>
          <button
            type="button"
            className={styles.dismissButton}
            onClick={() => setScope(null)}
          >
            {t("oauth.session.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}

// 导出 //
export default iGM_CLI_SessionExpired;
