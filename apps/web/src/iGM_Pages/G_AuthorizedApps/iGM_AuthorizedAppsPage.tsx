/**
 * 文件路径：apps/web/src/iGM_Pages/G_AuthorizedApps/iGM_AuthorizedAppsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AuthorizedApps
 * 模块：G_AuthorizedApps
 * 作用：用户侧授权管理——查看并撤销已授权的第三方 OAuth 应用
 * 内容：已授权应用列表（名称、类型、描述、已授予 scope、授权时间）、
 *       单应用撤销授权（同时撤销其全部令牌）、空状态与加载失败提示
 * 说明：纯静态 SSG，须登录后访问；撤销后第三方需重新引导用户走授权流程
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, LoaderCircle, ShieldOff } from "lucide-react";
import {
  iGM_ApiListAuthorizedApps,
  iGM_ApiRevokeAuthorizedApp,
  type iGM_AuthorizedApp,
} from "../../iGM_Services/iGM_OAuthClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Module15.module.css";

// 类型定义 //
// （本页仅消费服务层类型）

// 核心逻辑 //
/** 授权管理页主体（登录守卫内） */
export function iGM_AuthorizedAppsInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();

  const [items, setItems] = useState<iGM_AuthorizedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  /** 正在撤销的应用 clientId（防重复点击） */
  const [revokingId, setRevokingId] = useState<string | null>(null);

  /** 读取已授权应用列表 */
  const iGM_Load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    iGM_ApiListAuthorizedApps()
      .then((response) => {
        if (!cancelled && response.data) setItems(response.data.items);
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

  useEffect(() => iGM_Load(), [iGM_Load]);

  /** 撤销对某应用的授权 */
  function iGM_HandleRevoke(app: iGM_AuthorizedApp): void {
    if (revokingId) return;
    if (!window.confirm(t("oauth.authorized.revokeConfirm"))) return;
    setErrorText(null);
    setSuccessText(null);
    setRevokingId(app.clientId);
    iGM_ApiRevokeAuthorizedApp(app.clientId)
      .then(() => {
        setSuccessText(t("oauth.authorized.revoked"));
        iGM_Load();
      })
      .catch((error) => setErrorText(iGM_ResolveErrorText(t, error)))
      .finally(() => setRevokingId(null));
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <ShieldOff size={22} strokeWidth={1.8} />
          </span>
          {t("pages.authorizedApps.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("oauth.authorized.intro")}
        </p>
      </header>

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {errorText}
        </div>
      )}
      {successText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertSuccess}`}>
          <CircleCheck
            size={15}
            strokeWidth={1.8}
            className={uiStyles.alertIcon}
          />
          {successText}
        </div>
      )}

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("oauth.authorized.loadFailed")}
        </div>
      ) : items.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("oauth.authorized.empty")}</div>
      ) : (
        <div className={uiStyles.list}>
          {items.map((app) => (
            <section key={app.clientId} className={styles.statusCard}>
              <div className={styles.progressHead}>
                <h2 className={styles.progressTitle}>{app.name}</h2>
                <span className={styles.levelTag}>
                  {t(`oauth.clientTypes.${app.type}`)}
                </span>
              </div>

              {app.description && (
                <p className={styles.introText}>{app.description}</p>
              )}

              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>
                  {t("oauth.apps.scopes")}
                </span>
                <span className={styles.statusValue}>
                  {app.scopes
                    .map((scope) => t(`oauth.scopes.${scope}`))
                    .join(" · ")}
                </span>
              </div>
              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>
                  {t("oauth.authorized.grantedAt")}
                </span>
                <span className={styles.statusValue}>
                  {iGM_FormatDateTime(locale, app.grantedAt)}
                </span>
              </div>

              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={uiStyles.dangerButton}
                  disabled={revokingId === app.clientId}
                  onClick={() => iGM_HandleRevoke(app)}
                >
                  {revokingId === app.clientId ? (
                    <LoaderCircle size={15} className="igm-spin" />
                  ) : (
                    <ShieldOff size={15} strokeWidth={1.8} />
                  )}
                  {t("oauth.authorized.revoke")}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** 授权管理页（须登录） */
export function iGM_AuthorizedAppsPage() {
  const IGM_AuthorizedAppsInner = iGM_AuthorizedAppsInner;
  return (
    <IGM_RequireAuth>
      <IGM_AuthorizedAppsInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AuthorizedAppsPage;
