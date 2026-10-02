/**
 * 文件路径：apps/web/src/iGM_Pages/G_OAuthAuthorize/iGM_OAuthAuthorizePage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_OAuthAuthorize（由后端 /oauth/authorize 302 跳入并携带授权请求参数）
 * 模块：G_OAuthAuthorize
 * 作用：OAuth 2.0 / OIDC 授权同意页——展示申请方信息与申请 scope，用户同意或拒绝
 * 内容：授权流读取（依赖后端下发的签名 iGM_OAuthFlow Cookie）、未登录引导登录、
 *       同意 / 拒绝决策并跳回第三方 redirect_uri、URL error 参数的错误展示
 * 说明：纯静态 SSG；授权请求参数以后端 Cookie 为真源，页面查询串仅作展示回跳；
 *       同意与否均由后端生成最终回跳地址（含 code 或 error 与 state），
 *       前端拿到后必须立即用 window.location.href 跳出本站，严禁跳站内页面；
 *       授权流一次有效，决策后后端立即清除 Cookie
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LogIn, LoaderCircle, ShieldCheck, X } from "lucide-react";
import {
  iGM_ApiDecideAuthorize,
  iGM_ApiGetAuthorizeInfo,
  type iGM_AuthorizeConsentInfo,
} from "../../iGM_Services/iGM_OAuthClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Module15.module.css";

// 类型定义 //
// （本页仅消费服务层类型）

// 核心逻辑 //
/** 授权同意页（匿名可进入；同意 / 拒绝须已登录） */
export function iGM_OAuthAuthorizePage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();

  const [info, setInfo] = useState<iGM_AuthorizeConsentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  /** 决策提交中：显示跳转中状态 */
  const [deciding, setDeciding] = useState(false);
  /** 后端在授权请求校验失败时通过 URL error 参数带回的文案键（如回调地址不匹配） */
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlErrorChecked, setUrlErrorChecked] = useState(false);

  /** 读取 URL error 参数：校验失败时优先展示明确错误，而非静默回首页 */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUrlError(params.get("error_description") ?? params.get("error"));
    setUrlErrorChecked(true);
  }, []);

  /** 读取授权流信息（Cookie 为真源） */
  const iGM_Load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    iGM_ApiGetAuthorizeInfo()
      .then((response) => {
        if (!cancelled && response.data) setInfo(response.data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 仅在无 URL 错误时读取授权流（有错误时直接展示错误，不再请求）
  useEffect(() => {
    if (!urlErrorChecked || urlError) return;
    return iGM_Load();
  }, [urlErrorChecked, urlError, iGM_Load]);

  /** 引导登录：携带当前授权页完整地址以便登录后回跳 */
  function iGM_GoLogin() {
    const here = `${window.location.pathname}${window.location.search}`;
    router.push(`/G_Auth/login?redirect=${encodeURIComponent(here)}`);
  }

  /** 提交同意 / 拒绝决策并跳回第三方 */
  function iGM_HandleDecision(decision: "approve" | "deny") {
    if (deciding) return;
    setErrorText(null);
    setDeciding(true);
    iGM_ApiDecideAuthorize(decision)
      .then((response) => {
        const target = response.data?.redirectUrl;
        if (target) {
          // 关键：拿到 code 后立即跳出本站，跳转到开发者登记的回调地址
          const params = new URL(target).searchParams;
          console.log(`[OAuth Debug] 准备重定向至：${target}`);
          console.log(
            `[OAuth Debug] 参数：code=${params.get("code") ?? ""}, state=${params.get("state") ?? ""}`,
          );
          window.location.href = target;
          return;
        }
        throw new Error("oauth.errors.badRequest");
      })
      .catch((error) => {
        setErrorText(iGM_ResolveErrorText(t, error));
        setDeciding(false);
      });
  }

  // 授权请求校验失败：展示明确错误（如「回调地址与登记值不匹配」），不静默跳回首页
  if (urlError) {
    return (
      <div className={pageStyles.page}>
        <header className={pageStyles.pageHeader}>
          <h1 className={pageStyles.pageTitle}>
            <span className={pageStyles.pageTitleIcon}>
              <ShieldCheck size={22} strokeWidth={1.8} />
            </span>
            {t("pages.oauthAuthorize.title")}
          </h1>
        </header>
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {iGM_ResolveErrorText(t, new Error(urlError))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={pageStyles.page}>
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      </div>
    );
  }

  if (loadFailed || !info) {
    return (
      <div className={pageStyles.page}>
        <header className={pageStyles.pageHeader}>
          <h1 className={pageStyles.pageTitle}>
            <span className={pageStyles.pageTitleIcon}>
              <ShieldCheck size={22} strokeWidth={1.8} />
            </span>
            {t("pages.oauthAuthorize.title")}
          </h1>
        </header>
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("oauth.consent.flowExpired")}
        </div>
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <ShieldCheck size={22} strokeWidth={1.8} />
          </span>
          {t("pages.oauthAuthorize.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("oauth.consent.intro")}
        </p>
      </header>

      <section className={styles.statusCard}>
        <div className={styles.progressHead}>
          <h2 className={styles.progressTitle}>{info.client.name}</h2>
          <span className={styles.levelTag}>
            {t(`oauth.clientTypes.${info.client.type}`)}
          </span>
        </div>
        {info.client.description && (
          <p className={styles.introText}>{info.client.description}</p>
        )}

        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>
            {t("oauth.consent.clientId")}
          </span>
          <span className={styles.statusValue}>{info.client.clientId}</span>
        </div>

        {/* 申请获取的信息范围 */}
        <div className={styles.field}>
          <span className={styles.label}>{t("oauth.consent.scopesTitle")}</span>
          <div className={styles.examList}>
            {info.scopes.map((scope) => (
              <div key={scope} className={styles.examItem}>
                <span>{t(`oauth.scopes.${scope}`)}</span>
                <span className={styles.examStatus}>
                  {t(`oauth.scopeHints.${scope}`)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className={styles.introText}>{t("oauth.consent.warning")}</p>

        {errorText && (
          <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
            {errorText}
          </div>
        )}

        {!info.loggedIn ? (
          <>
            <div className={styles.reviewHint}>
              <LogIn size={15} strokeWidth={1.8} />
              <span>{t("oauth.consent.loginRequired")}</span>
            </div>
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={iGM_GoLogin}
              >
                <LogIn size={15} strokeWidth={1.8} />
                {t("oauth.consent.goLogin")}
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                disabled={deciding}
                onClick={() => iGM_HandleDecision("deny")}
              >
                <X size={15} strokeWidth={1.8} />
                {t("oauth.consent.deny")}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={deciding}
              onClick={() => iGM_HandleDecision("approve")}
            >
              {deciding ? (
                <LoaderCircle size={15} className="igm-spin" />
              ) : (
                <ShieldCheck size={15} strokeWidth={1.8} />
              )}
              {t("oauth.consent.approve")}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={deciding}
              onClick={() => iGM_HandleDecision("deny")}
            >
              <X size={15} strokeWidth={1.8} />
              {t("oauth.consent.deny")}
            </button>
          </div>
        )}

        {deciding && (
          <p className={styles.examStatus}>{t("oauth.consent.redirecting")}</p>
        )}
      </section>
    </div>
  );
}

// 导出 //
export default iGM_OAuthAuthorizePage;
