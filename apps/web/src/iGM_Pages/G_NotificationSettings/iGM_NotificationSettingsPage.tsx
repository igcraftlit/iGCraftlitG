/**
 * 文件路径：apps/web/src/iGM_Pages/G_NotificationSettings/iGM_NotificationSettingsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_NotificationSettings
 * 模块：G_NotificationSettings
 * 作用：通知偏好设置——站内通知与邮件通知的开关与保存
 * 内容：页头、加载状态、开关列表（站内/邮件）、保存按钮与成功/失败提示
 * 说明：纯静态 SSG，数据全部在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { BellRing, Check, LoaderCircle } from "lucide-react";
import {
  iGM_ApiGetNotificationPreference,
  iGM_ApiUpdateNotificationPreference,
} from "../../iGM_Services/iGM_NotificationClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module4.module.css";

// 类型定义 //
// （页面状态均为基础类型，偏好数据类型来自 iGM_NotificationClient）

// 核心逻辑 //
/** 通知偏好设置页主体（在登录守卫内） */
function iGM_NotificationSettingsInner() {
  const t = useTranslations();

  const [siteEnabled, setSiteEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** 进入页面时加载当前偏好 */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    iGM_ApiGetNotificationPreference()
      .then((response) => {
        if (cancelled) return;
        const preference = response.data?.preference;
        if (preference) {
          setSiteEnabled(preference.siteEnabled);
          setEmailEnabled(preference.emailEnabled);
        }
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

  /** 保存偏好 */
  async function iGM_HandleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrorText(null);
    setSaved(false);
    try {
      await iGM_ApiUpdateNotificationPreference({ siteEnabled, emailEnabled });
      setSaved(true);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <BellRing size={22} strokeWidth={1.8} />
          </span>
          {t("notification.settings.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("notification.settings.description")}
        </p>
      </header>

      {/* 主体 */}
      {loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : (
        <form
          className={`${styles.sectionCard} ${styles.form}`}
          onSubmit={iGM_HandleSave}
          noValidate
        >
          {loadFailed && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              {t("notification.settings.loadFailed")}
            </div>
          )}
          {errorText && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              {errorText}
            </div>
          )}
          {saved && (
            <div className={`${styles.alert} ${styles.alertSuccess}`}>
              <span className={styles.alertIcon}>
                <Check size={14} strokeWidth={2} />
              </span>
              {t("notification.settings.saved")}
            </div>
          )}

          {/* 开关列表 */}
          <div className={styles.switchList}>
            <label className={styles.switchItem}>
              <span className={styles.switchText}>
                <span className={styles.switchTitle}>
                  {t("notification.settings.siteTitle")}
                </span>
                <span className={styles.switchDesc}>
                  {t("notification.settings.siteDescription")}
                </span>
              </span>
              <span className={styles.switchControl}>
                <input
                  type="checkbox"
                  checked={siteEnabled}
                  onChange={(event) => {
                    setSiteEnabled(event.target.checked);
                    setSaved(false);
                  }}
                />
                <span className={styles.switchTrack} />
              </span>
            </label>

            <label className={styles.switchItem}>
              <span className={styles.switchText}>
                <span className={styles.switchTitle}>
                  {t("notification.settings.emailTitle")}
                </span>
                <span className={styles.switchDesc}>
                  {t("notification.settings.emailDescription")}
                </span>
              </span>
              <span className={styles.switchControl}>
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(event) => {
                    setEmailEnabled(event.target.checked);
                    setSaved(false);
                  }}
                />
                <span className={styles.switchTrack} />
              </span>
            </label>
          </div>

          {/* 保存 */}
          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={saving}
            >
              {saving && <LoaderCircle size={14} className="igm-spin" />}
              {saving
                ? t("notification.settings.saving")
                : t("notification.settings.save")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** 通知偏好设置页（登录守卫包裹） */
export function iGM_NotificationSettingsPage() {
  // JSX 要求组件标识符首字母大写，本地 iGM_ 组件以大写别名渲染
  const IGM_NotificationSettingsInner = iGM_NotificationSettingsInner;
  return (
    <IGM_RequireAuth>
      <IGM_NotificationSettingsInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_NotificationSettingsPage;
