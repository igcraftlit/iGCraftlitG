/**
 * 文件路径：apps/web/src/iGM_Pages/G_MessageSettings/iGM_MessageSettingsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_MessageSettings（RequireAuth 登录可见）
 * 模块：G_MessageSettings
 * 作用：私信隐私设置——选择允许谁向我发起私信
 * 内容：三个单选项（所有人 / 仅好友 / 不允许任何人），保存后即时生效，
 *       返回会话列表入口
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  LoaderCircle,
  Lock,
  Save,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiGetMessageSettings,
  iGM_ApiUpdateMessageSettings,
  type iGM_MessageAllowFrom,
} from "../../iGM_Services/iGM_MessageClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module10.module.css";

// 类型定义 //
/** 可选范围顺序与展示配置（标题/描述键在渲染时拼装） */
const iGM_Options: iGM_MessageAllowFrom[] = ["everyone", "friends", "none"];

// 核心逻辑 //
/** 私信隐私设置页主体（已包在 RequireAuth 内） */
function iGM_MessageSettingsContent() {
  const t = useTranslations();
  const [allowFrom, setAllowFrom] = useState<iGM_MessageAllowFrom>("everyone");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  /** 读取当前设置 */
  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiGetMessageSettings();
      if (response.data) setAllowFrom(response.data.allowFrom);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 保存设置 */
  async function iGM_HandleSave(): Promise<void> {
    setSaving(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      const response = await iGM_ApiUpdateMessageSettings(allowFrom);
      if (response.data) setAllowFrom(response.data.allowFrom);
      setSuccessText(t("message.settingsSaved"));
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 返回入口 */}
      <Link href="/G_Messages" className={styles.backLink}>
        <ArrowLeft size={14} strokeWidth={2} />
        {t("message.backToList")}
      </Link>

      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Lock size={22} strokeWidth={1.8} />
          </span>
          {t("message.settingsTitle")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("message.settingsDescription")}
        </p>
      </header>

      {loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("message.stateLoading")}
        </div>
      ) : (
        <div className={styles.sectionCard}>
          <div className={styles.radioList}>
            {iGM_Options.map((option) => (
              <label
                key={option}
                className={`${styles.radioCard} ${
                  allowFrom === option ? styles.radioCardActive : ""
                }`}
              >
                <input
                  className={styles.radioInput}
                  type="radio"
                  name="igm-message-allow-from"
                  checked={allowFrom === option}
                  onChange={() => setAllowFrom(option)}
                />
                <span className={styles.radioText}>
                  <span className={styles.radioTitle}>
                    {t(`message.allowFrom.${option}.title`)}
                  </span>
                  <span className={styles.radioDescription}>
                    {t(`message.allowFrom.${option}.description`)}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {errorText && (
            <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
          )}
          {successText && (
            <div className={`${styles.alert} ${styles.alertSuccess}`}>{successText}</div>
          )}

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={saving}
              onClick={() => void iGM_HandleSave()}
            >
              {saving ? (
                <LoaderCircle size={15} className="igm-spin" />
              ) : (
                <Save size={15} strokeWidth={1.8} />
              )}
              {t("message.saveSettings")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 私信隐私设置页（登录守卫） */
const IGM_MessageSettingsContent = iGM_MessageSettingsContent;
export function iGM_MessageSettingsPage() {
  return (
    <IGM_RequireAuth>
      <IGM_MessageSettingsContent />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_MessageSettingsPage;
