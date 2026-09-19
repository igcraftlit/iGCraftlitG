/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminSettings/iGM_AdminSettingsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminSettings
 * 模块：G_AdminSettings
 * 作用：系统信息——只读展示后端运行配置（版本/数据库/上传/邮件/限流等）
 * 内容：分组键值列表，敏感值（SMTP 密码等）由后端掩码后下发
 * 说明：纯静态 SSG，数据在客户端经 iGM_AdminClient 调用本地后端；
 *       仅 admin 可见，由后端严格校验
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, Settings } from "lucide-react";
import { iGM_ApiAdminSettings } from "../../iGM_Services/iGM_AdminClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Admin.module.css";

// 类型定义 //
// （数据为 Record<string, unknown>，按分组渲染）

// 核心逻辑 //
/** 值的展示形式：标量直接展示，数组/对象压缩为 JSON 文本 */
function iGM_FormatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 系统信息页主体（仅 admin） */
function iGM_SettingsInner() {
  const t = useTranslations();

  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    iGM_ApiAdminSettings()
      .then((response) => {
        if (cancelled) return;
        if (response.data) setSettings(response.data);
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

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Settings size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminSettings.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminSettings.description")}
        </p>
      </header>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed || !settings ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("admin.errors.loadFailed")}
        </div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={styles.settingList}>
            {Object.entries(settings).map(([key, value]) => (
              <div key={key}>
                {/* 嵌套对象按分组渲染：组标题 + 子键值行 */}
                {value !== null && typeof value === "object" && !Array.isArray(value) ? (
                  <>
                    <h2 className={`${uiStyles.sectionTitle} ${styles.settingGroupTitle}`}>
                      {key}
                    </h2>
                    <div className={styles.settingList}>
                      {Object.entries(value as Record<string, unknown>).map(
                        ([childKey, childValue]) => (
                          <div key={childKey} className={styles.settingRow}>
                            <span className={styles.settingKey}>{childKey}</span>
                            <span className={styles.settingValue}>
                              {iGM_FormatValue(childValue)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </>
                ) : (
                  <div className={styles.settingRow}>
                    <span className={styles.settingKey}>{key}</span>
                    <span className={styles.settingValue}>
                      {iGM_FormatValue(value)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** 系统信息页（仅 admin，后端同样校验） */
export function iGM_AdminSettingsPage() {
  const IGM_SettingsInner = iGM_SettingsInner;
  return (
    <IGM_RequireAuth role="admin">
      <IGM_SettingsInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminSettingsPage;
