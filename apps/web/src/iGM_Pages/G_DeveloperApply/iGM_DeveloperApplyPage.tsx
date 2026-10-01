/**
 * 文件路径：apps/web/src/iGM_Pages/G_DeveloperApply/iGM_DeveloperApplyPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_DeveloperApply
 * 模块：G_DeveloperApply
 * 作用：开发者资格申请表单——项目信息、联系方式、调用量与申请理由
 * 内容：登录守卫、表单字段校验、开发者规范勾选、提交申请与取消返回、
 *       组织所有者免申请、已有待审 / 已通过申请时禁止重复提交
 * 说明：纯静态 SSG；开发者入口位于导航栏最下边与账户设置页；
 *       组织所有者与已通过者直接进入开发者接入界面（外链 CLI），
 *       待审核者进入状态页，其余展示本申请表单；
 *       模块十六审核由组织所有者处理，API Key 发放留待后续模块
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, Send, ShieldCheck } from "lucide-react";
import {
  iGM_ApiGetMyDeveloper,
  iGM_ApiSubmitDeveloperApply,
  iGM_DeveloperConsoleUrl,
  iGM_ResolveDeveloperEntry,
  type iGM_DeveloperApplication,
  type iGM_DeveloperProjectType,
  type iGM_DeveloperQuota,
} from "../../iGM_Services/iGM_DeveloperClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Module15.module.css";

// 类型定义 //
/** 项目类型下拉取值（与后端 iGM_ProjectTypes 一致） */
const iGM_ProjectTypeOptions: iGM_DeveloperProjectType[] = [
  "launcher",
  "tool",
  "website",
  "plugin",
  "other",
];

/** 预期调用量下拉取值（与后端 iGM_Quotas 一致） */
const iGM_QuotaOptions: iGM_DeveloperQuota[] = ["low", "medium", "high"];

// 核心逻辑 //
/** 开发者申请页主体（登录守卫内） */
export function iGM_DeveloperApplyInner() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const { user } = iGM_UseAuth();

  const [latest, setLatest] = useState<iGM_DeveloperApplication | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] =
    useState<iGM_DeveloperProjectType>("launcher");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [contact, setContact] = useState("");
  const [expectedQuota, setExpectedQuota] = useState<iGM_DeveloperQuota>("low");
  const [reason, setReason] = useState("");
  const [agreeRules, setAgreeRules] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 读取我的最新申请，判断是否可再次提交 */
  const iGM_Load = useCallback(() => {
    let cancelled = false;
    setChecking(true);
    iGM_ApiGetMyDeveloper()
      .then((response) => {
        if (!cancelled && response.data) setLatest(response.data.latest);
      })
      .catch(() => {
        /* 未申请或读取失败时按可提交处理 */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => iGM_Load(), [iGM_Load]);

  // 组织所有者免申请，直接具备接入资格
  const isOrgOwner = user?.verifiedOrg?.isOwner === true;

  // 待审核 / 已通过 / 组织所有者时不再展示表单，按入口规则引导
  const blocked =
    isOrgOwner ||
    (latest !== null &&
      (latest.status === "pending" || latest.status === "approved"));

  // 入口分流：组织所有者与已通过者进接入界面（外链），待审核进状态页
  const entryTarget = iGM_ResolveDeveloperEntry(isOrgOwner, latest?.status ?? null);

  /** 提交申请 */
  function iGM_HandleSubmit() {
    setError(null);
    if (
      projectName.trim().length === 0 ||
      projectDesc.trim().length === 0 ||
      contact.trim().length === 0 ||
      reason.trim().length === 0
    ) {
      setError(t("developer.apply.required"));
      return;
    }
    if (!agreeRules) {
      setError(t("developer.apply.rulesRequired"));
      return;
    }
    const trimmedUrl = projectUrl.trim();
    if (trimmedUrl.length > 0 && !/^https?:\/\//i.test(trimmedUrl)) {
      setError(t("developer.apply.urlInvalid"));
      return;
    }

    setSubmitting(true);
    iGM_ApiSubmitDeveloperApply({
      projectName: projectName.trim(),
      projectType,
      projectDesc: projectDesc.trim(),
      projectUrl: trimmedUrl || undefined,
      contact: contact.trim(),
      expectedQuota,
      reason: reason.trim(),
      agreeRules,
    })
      .then(() => setSubmitted(true))
      .catch((submitError: unknown) => {
        setError(
          submitError instanceof Error && submitError.message.includes(".")
            ? t(submitError.message)
            : t("developer.apply.failed"),
        );
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Send size={22} strokeWidth={1.8} />
          </span>
          {t("pages.developerApply.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("developer.apply.intro")}
        </p>
      </header>

      {checking ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : submitted ? (
        <div className={styles.statusCard}>
          <p className={styles.introText}>{t("developer.apply.submittedNotice")}</p>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => router.push("/G_DeveloperStatus")}
            >
              {t("developer.statusEntry")}
            </button>
          </div>
        </div>
      ) : blocked ? (
        <div className={styles.statusCard}>
          <p className={styles.introText}>
            {isOrgOwner
              ? t("developer.apply.orgOwnerNotice")
              : latest?.status === "approved"
                ? t("developer.apply.alreadyApproved")
                : t("developer.apply.alreadyPending")}
          </p>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                if (entryTarget === "console") {
                  window.open(
                    iGM_DeveloperConsoleUrl,
                    "_blank",
                    "noopener,noreferrer",
                  );
                  return;
                }
                router.push("/G_DeveloperStatus");
              }}
            >
              {entryTarget === "console"
                ? t("developer.account.enterConsole")
                : t("developer.statusEntry")}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.form}>
          {/* 审核分发规则说明（仅界面占位） */}
          <div className={styles.reviewHint}>
            <ShieldCheck size={15} strokeWidth={1.8} />
            <span>{t("developer.apply.reviewHint")}</span>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>{t("developer.apply.projectName")}</span>
            <input
              className={styles.input}
              value={projectName}
              maxLength={60}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder={t("developer.apply.projectNamePlaceholder")}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t("developer.apply.projectType")}</span>
            <select
              className={styles.select}
              value={projectType}
              onChange={(event) =>
                setProjectType(event.target.value as iGM_DeveloperProjectType)
              }
            >
              {iGM_ProjectTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {t(`developer.apply.projectTypeOptions.${option}`)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t("developer.apply.projectDesc")}</span>
            <textarea
              className={styles.textarea}
              value={projectDesc}
              maxLength={1000}
              onChange={(event) => setProjectDesc(event.target.value)}
              placeholder={t("developer.apply.projectDescPlaceholder")}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              {t("developer.apply.projectUrl")}
              <span className={styles.optional}>
                {t("developer.apply.optional")}
              </span>
            </span>
            <input
              className={styles.input}
              value={projectUrl}
              maxLength={200}
              onChange={(event) => setProjectUrl(event.target.value)}
              placeholder={t("developer.apply.projectUrlPlaceholder")}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t("developer.apply.contact")}</span>
            <input
              className={styles.input}
              value={contact}
              maxLength={120}
              onChange={(event) => setContact(event.target.value)}
              placeholder={t("developer.apply.contactPlaceholder")}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t("developer.apply.expectedQuota")}</span>
            <select
              className={styles.select}
              value={expectedQuota}
              onChange={(event) =>
                setExpectedQuota(event.target.value as iGM_DeveloperQuota)
              }
            >
              {iGM_QuotaOptions.map((option) => (
                <option key={option} value={option}>
                  {t(`developer.apply.expectedQuotaOptions.${option}`)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t("developer.apply.reason")}</span>
            <textarea
              className={styles.textarea}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("developer.apply.reasonPlaceholder")}
            />
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={agreeRules}
              onChange={(event) => setAgreeRules(event.target.checked)}
            />
            <span>{t("developer.apply.agreeRules")}</span>
          </label>

          {error && (
            <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
              {error}
            </div>
          )}

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={submitting}
              onClick={iGM_HandleSubmit}
            >
              {submitting
                ? t("developer.apply.submitting")
                : t("developer.apply.submit")}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={submitting}
              onClick={() => router.push("/G_Settings")}
            >
              {t("developer.apply.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 开发者申请页（须登录） */
export function iGM_DeveloperApplyPage() {
  const IGM_DeveloperApplyInner = iGM_DeveloperApplyInner;
  return (
    <IGM_RequireAuth>
      <IGM_DeveloperApplyInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_DeveloperApplyPage;