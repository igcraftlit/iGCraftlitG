/**
 * 文件路径：apps/web/src/iGM_Pages/G_DeveloperStatus/iGM_DeveloperStatusPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_DeveloperStatus
 * 模块：G_DeveloperStatus
 * 作用：开发者申请状态页——查看申请状态与审核信息、进入开发者接入界面
 * 内容：状态徽标、申请信息（项目名称/类型/描述/链接/联系方式/调用量/理由）、
 *       审核人、审核意见、提交时间、撤回待审核申请、拒绝后重新申请、
 *       申请历史列表、进入开发者接入界面
 * 说明：纯静态 SSG，须登录后查看；审核通过即获得开发者接入资格（不发放 API Key）；
 *       组织所有者免申请，直接可进入开发者接入界面
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, LoaderCircle, RotateCcw, Undo2 } from "lucide-react";
import {
  iGM_ApiGetMyDeveloper,
  iGM_ApiWithdrawDeveloper,
  iGM_DeveloperConsoleUrl,
  type iGM_DeveloperApplication,
} from "../../iGM_Services/iGM_DeveloperClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Module15.module.css";

// 类型定义 //
/** 状态 → 徽标样式映射 */
const iGM_StateBadgeClass: Record<string, string> = {
  pending: styles.stateBadgePending,
  approved: styles.stateBadgeApproved,
  rejected: styles.stateBadgeRejected,
  withdrawn: styles.stateBadge,
};

// 核心逻辑 //
/** 开发者申请状态页主体（登录守卫内） */
export function iGM_DeveloperStatusInner() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const { locale } = iGM_UseLocale();
  const { user } = iGM_UseAuth();

  // 组织所有者免申请，直接具备开发者接入资格
  const isOrgOwner = user?.verifiedOrg?.isOwner === true;

  const [latest, setLatest] = useState<iGM_DeveloperApplication | null>(null);
  const [history, setHistory] = useState<iGM_DeveloperApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const iGM_Load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    iGM_ApiGetMyDeveloper()
      .then((response) => {
        if (cancelled || !response.data) return;
        setLatest(response.data.latest);
        setHistory(response.data.history);
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

  /** 撤回待审核申请 */
  function iGM_HandleWithdraw() {
    if (!latest) return;
    if (!window.confirm(t("developer.status.withdrawConfirm"))) return;
    setActionError(null);
    setActing(true);
    iGM_ApiWithdrawDeveloper(latest.id)
      .then(() => iGM_Load())
      .catch(() => setActionError(t("developer.status.withdrawFailed")))
      .finally(() => setActing(false));
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <KeyRound size={22} strokeWidth={1.8} />
          </span>
          {t("pages.developerStatus.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.developerStatus.description")}
        </p>
      </header>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("developer.status.loadFailed")}
        </div>
      ) : !latest ? (
        <div className={styles.statusCard}>
          <p className={styles.introText}>
            {isOrgOwner
              ? t("developer.status.orgOwnerNotice")
              : t("developer.status.notApplied")}
          </p>
          <div className={styles.actionRow}>
            {isOrgOwner ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  window.open(
                    iGM_DeveloperConsoleUrl,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                {t("developer.account.enterConsole")}
              </button>
            ) : (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => router.push("/G_DeveloperIntro")}
              >
                {t("developer.applyEntry")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 顶部状态 */}
          <section className={styles.statusCard}>
            <div className={styles.progressHead}>
              <h2 className={styles.progressTitle}>
                {t("developer.status.stateLabel")}
              </h2>
              <span
                className={`${styles.stateBadge} ${
                  iGM_StateBadgeClass[latest.status] ?? ""
                }`}
              >
                {t(`developer.status.state.${latest.status}`)}
              </span>
            </div>
            {actionError && (
              <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
                {actionError}
              </div>
            )}

            {/* 申请信息 */}
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>
                {t("developer.status.projectName")}
              </span>
              <span className={styles.statusValue}>{latest.projectName}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>
                {t("developer.status.projectType")}
              </span>
              <span className={styles.statusValue}>
                {t(`developer.apply.projectTypeOptions.${latest.projectType}`)}
              </span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>
                {t("developer.status.projectDesc")}
              </span>
              <span className={styles.statusValue}>{latest.projectDesc}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>
                {t("developer.status.projectUrl")}
              </span>
              <span className={styles.statusValue}>
                {latest.projectUrl || t("developer.status.notProvided")}
              </span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>
                {t("developer.status.contact")}
              </span>
              <span className={styles.statusValue}>{latest.contact}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>
                {t("developer.status.expectedQuota")}
              </span>
              <span className={styles.statusValue}>
                {latest.expectedQuota
                  ? t(
                      `developer.apply.expectedQuotaOptions.${latest.expectedQuota}`,
                    )
                  : t("developer.status.notProvided")}
              </span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>
                {t("developer.status.reason")}
              </span>
              <span className={styles.statusValue}>{latest.reason}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>
                {t("developer.status.submittedAt")}
              </span>
              <span className={styles.statusValue}>
                {iGM_FormatDate(locale, latest.createdAt)}
              </span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>
                {t("developer.status.reviewer")}
              </span>
              <span className={styles.statusValue}>
                {latest.reviewerName || t("developer.status.notReviewed")}
              </span>
            </div>
            {latest.reviewComment && (
              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>
                  {t("developer.status.reviewComment")}
                </span>
                <span className={styles.statusValue}>{latest.reviewComment}</span>
              </div>
            )}

            {/* 待审核：撤回申请 */}
            {latest.status === "pending" && (
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={acting}
                  onClick={iGM_HandleWithdraw}
                >
                  <Undo2 size={15} strokeWidth={1.8} />
                  {acting
                    ? t("developer.status.withdrawing")
                    : t("developer.status.withdraw")}
                </button>
              </div>
            )}

            {/* 已通过：进入开发者接入界面 */}
            {latest.status === "approved" && (
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() =>
                    window.open(
                      iGM_DeveloperConsoleUrl,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  {t("developer.account.enterConsole")}
                </button>
              </div>
            )}

            {/* 已拒绝 / 已撤回：重新申请 */}
            {(latest.status === "rejected" || latest.status === "withdrawn") && (
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => router.push("/G_DeveloperIntro")}
                >
                  <RotateCcw size={15} strokeWidth={1.8} />
                  {t("developer.status.reapply")}
                </button>
              </div>
            )}
          </section>

          {/* 申请历史 */}
          {history.length > 1 && (
            <section className={styles.statusCard}>
              <h2 className={styles.progressTitle}>
                {t("developer.status.history")}
              </h2>
              <div className={styles.examList}>
                {history.map((item) => (
                  <div key={item.id} className={styles.examItem}>
                    <span>{item.projectName}</span>
                    <span className={styles.examStatus}>
                      {t(`developer.status.state.${item.status}`)}
                      {" · "}
                      {iGM_FormatDate(locale, item.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 开发者申请状态页（须登录） */
export function iGM_DeveloperStatusPage() {
  const IGM_DeveloperStatusInner = iGM_DeveloperStatusInner;
  return (
    <IGM_RequireAuth>
      <IGM_DeveloperStatusInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_DeveloperStatusPage;