/**
 * 文件路径：apps/exam/src/iGM_Pages/E_CreatorApply.tsx
 * 所属层：前端 / 页面层
 * 路由：E_CreatorApply（/apply-creator）
 * 模块：iGM_CreatorApply
 * 作用：命题创作者独立申请页面
 * 内容：未登录重定向登录 / 已是创作者显示徽章 / 已有申请显示状态 /
 *       新申请展示表单（真实姓名、联系方式、简介≥50字、方向多选、
 *       作品链接可选、申请理由≥100字、同意规范）
 * 说明：所有 fetch 携带 Cookie，后端强制字段校验 + 状态去重；
 *       纯静态导出，客户端挂载后拉登录态 + 申请状态
 */

// 导入依赖 //
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  FileText,
  LogIn,
  Mail,
  MessageSquare,
  Save,
  User,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import { iGM_ExamUseAuth } from "../iGM_AuthContext";
import {
  iGM_Examiner_FetchMyApplyStatus,
  iGM_Examiner_SubmitApply,
  iGM_ExaminerDirections,
  type iGM_ExaminerDirection,
  type iGM_ExaminerApplyForm,
  type iGM_MyApplicationStatus,
} from "../iGM_Services/iGM_ExaminerClient";
import { iGM_ExamRequestError } from "../iGM_Services/iGM_ExamClient";
import type { iGM_I18nKey } from "../iGM_i18n/iGM_I18nTypes";
import styles from "./E_CreatorApply.module.css";

// 核心逻辑 //

/** 命题方向枚举 → 语言包 key 映射（后端持久化为英文 key，前端展示走 t()） */
const iGM_DirectionLabelKey: Record<iGM_ExaminerDirection, iGM_I18nKey> = {
  minecraft_java: "applyDirMcJava",
  redstone: "applyDirRedstone",
  build: "applyDirBuild",
  server_dev: "applyDirServerDev",
  mod_dev: "applyDirModDev",
  general: "applyDirGeneral",
};

/** 独立申请页面 */
export function E_CreatorApply() {
  const { t } = useI18n();
  const router = useRouter();
  const { user, loading } = iGM_ExamUseAuth();
  const [status, setStatus] = useState<iGM_MyApplicationStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // 表单状态
  const [form, setForm] = useState<iGM_ExaminerApplyForm>({
    realName: "",
    contact: "",
    bio: "",
    directions: [],
    portfolioUrl: "",
    reason: "",
    agreedToRules: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // 挂载后：如已登录，拉申请状态
  useEffect(() => {
    if (!user) return;
    let active = true;
    setStatusLoading(true);
    void iGM_Examiner_FetchMyApplyStatus()
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((err) => {
        if (active)
          setStatusError(
            err instanceof iGM_ExamRequestError ? err.message : "加载失败",
          );
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  // 已是创作者（isExaminer=true 或 status=approved）→ 不展示表单
  const isAlreadyExaminer = Boolean(user?.isExaminer);

  const handleDirectionToggle = useCallback(
    (dir: iGM_ExaminerDirection) => {
      setForm((prev) => {
        const has = prev.directions.includes(dir);
        return {
          ...prev,
          directions: has
            ? prev.directions.filter((d) => d !== dir)
            : [...prev.directions, dir],
        };
      });
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    setSubmitSuccess(false);
    if (!form.agreedToRules) {
      setSubmitError(t("applyNeedAgree"));
      return;
    }
    if (form.directions.length === 0) {
      setSubmitError(t("applyNeedDir"));
      return;
    }
    setSubmitting(true);
    try {
      await iGM_Examiner_SubmitApply(form);
      setSubmitSuccess(true);
      // 刷新申请状态
      const s = await iGM_Examiner_FetchMyApplyStatus();
      setStatus(s);
    } catch (err) {
      const msg =
        err instanceof iGM_ExamRequestError
          ? err.message
          : "提交失败，请重试";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [form, t]);

  // ===== 渲染分支 =====

  // 未登录 → 登录引导
  if (!user && !loading) {
    return (
      <main className={styles.page}>
        <div className={styles.guideCard}>
          <LogIn size={28} strokeWidth={1.4} className={styles.guideIcon} />
          <h1 className={`igm-serif ${styles.guideTitle}`}>{t("applyNeedLogin")}</h1>
          <p className={styles.guideLead}>{t("applyNeedLoginLead")}</p>
          <button
            type="button"
            className={styles.guideBtn}
            onClick={() => router.push("/login")}
          >
            {t("authLoginWithIGM")} →
          </button>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <p className={`igm-mono ${styles.loading}`}>{t("listRetrieving")}</p>
      </main>
    );
  }

  // 已是命题创作者 → 徽章 + 提示
  if (isAlreadyExaminer) {
    return (
      <main className={styles.page}>
        <div className={styles.alreadyCard}>
          <CheckCircle size={28} strokeWidth={1.4} className={styles.alreadyIcon} />
          <h1 className={`igm-serif ${styles.alreadyTitle}`}>
            {t("applyAlreadyExaminer")}
          </h1>
          <p className={styles.alreadyLead}>
            {t("applyAlreadyExaminerLead")}
          </p>
          <Link href="/" className={styles.backLink}>
            {t("applyBackToList")} →
          </Link>
        </div>
      </main>
    );
  }

  // 已有 pending / rejected → 状态卡片
  if (status) {
    if (status.status === "pending") {
      return (
        <main className={styles.page}>
          <div className={styles.statusCard}>
            <AlertTriangle size={24} strokeWidth={1.4} className={styles.statusIcon} />
            <h1 className={`igm-serif ${styles.statusTitle}`}>{t("applySubmitted")}</h1>
            <p className={styles.statusLead}>{t("applySubmittedLead")}</p>
            <dl className={styles.statusList}>
              <div>
                <dt>{t("applySubmittedAt")}</dt>
                <dd>{new Date(status.submittedAt!).toLocaleString()}</dd>
              </div>
            </dl>
            <Link href="/" className={styles.backLink}>
              {t("applyBackToList")} →
            </Link>
          </div>
        </main>
      );
    }
    if (status.status === "rejected") {
      return (
        <main className={styles.page}>
          <div className={styles.statusCard}>
            <AlertTriangle size={24} strokeWidth={1.4} className={styles.statusIcon} />
            <h1 className={`igm-serif ${styles.statusTitle}`}>{t("applyRejected")}</h1>
            {status.reviewComment && (
              <p className={styles.rejectComment}>{status.reviewComment}</p>
            )}
            <p className={styles.rejectLead}>{t("applyRejectedLead")}</p>
          </div>
          <FormSection
            form={form}
            setForm={setForm}
            directions={iGM_ExaminerDirections}
            directionLabelKey={iGM_DirectionLabelKey}
            onToggleDir={handleDirectionToggle}
            submitting={submitting}
            submitError={submitError}
            submitSuccess={submitSuccess}
            onSubmit={handleSubmit}
          />
        </main>
      );
    }
  }

  // 新申请 → 完整表单
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={`igm-serif ${styles.title}`}>{t("applyPageTitle")}</h1>
        <p className={styles.lead}>{t("applyPageLead")}</p>
      </header>
      {statusError && (
        <p className={styles.inlineError}>{statusError}</p>
      )}
      <FormSection
        form={form}
        setForm={setForm}
        directions={iGM_ExaminerDirections}
        directionLabelKey={iGM_DirectionLabelKey}
        onToggleDir={handleDirectionToggle}
        submitting={submitting}
        submitError={submitError}
        submitSuccess={submitSuccess}
        onSubmit={handleSubmit}
      />
    </main>
  );
}

// ===== 表单组件（子组件隔离） =====

interface FormSectionProps {
  form: iGM_ExaminerApplyForm;
  setForm: React.Dispatch<React.SetStateAction<iGM_ExaminerApplyForm>>;
  directions: readonly iGM_ExaminerDirection[];
  directionLabelKey: Record<iGM_ExaminerDirection, iGM_I18nKey>;
  onToggleDir: (dir: iGM_ExaminerDirection) => void;
  submitting: boolean;
  submitError: string | null;
  submitSuccess: boolean;
  onSubmit: () => void;
}

function FormSection(props: FormSectionProps) {
  const { form, setForm, directions, directionLabelKey } = props;
  const { t } = useI18n();

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      {/* 基本信息 */}
      <div className={styles.formRow}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>
            <User size={13} strokeWidth={1.8} />
            <span>{t("applyRealName")} *</span>
          </label>
          <input
            className={`igm-mono ${styles.formInput}`}
            type="text"
            value={form.realName}
            onChange={(e) =>
              setForm((p) => ({ ...p, realName: e.target.value }))
            }
            required
            maxLength={60}
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>
            <Mail size={13} strokeWidth={1.8} />
            <span>{t("applyContact")} *</span>
          </label>
          <input
            className={`igm-mono ${styles.formInput}`}
            type="text"
            value={form.contact}
            onChange={(e) =>
              setForm((p) => ({ ...p, contact: e.target.value }))
            }
            required
            maxLength={120}
            placeholder={t("applyContactPh")}
          />
        </div>
      </div>

      {/* 命题方向多选 */}
      <fieldset className={styles.formField}>
        <legend className={styles.formLabel}>
          <MessageSquare size={13} strokeWidth={1.8} />
          <span>{t("applyDirections")} *</span>
        </legend>
        <div className={styles.dirGrid}>
          {directions.map((dir) => {
            const checked = form.directions.includes(dir);
            return (
              <label key={dir} className={styles.dirChip} data-checked={checked}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => props.onToggleDir(dir)}
                />
                <span>{t(directionLabelKey[dir])}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* 简介 */}
      <div className={styles.formField}>
        <label className={styles.formLabel}>
          <FileText size={13} strokeWidth={1.8} />
          <span>
            {t("applyBio")} * ({form.bio.length}/50)
          </span>
        </label>
        <textarea
          className={`igm-mono ${styles.formTextarea}`}
          value={form.bio}
          onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
          required
          minLength={50}
          rows={4}
          placeholder={t("applyBioPh")}
        />
      </div>

      {/* 作品链接（可选） */}
      <div className={styles.formField}>
        <label className={styles.formLabel}>
          <ExternalLink size={13} strokeWidth={1.8} />
          <span>{t("applyPortfolio")}</span>
        </label>
        <input
          className={`igm-mono ${styles.formInput}`}
          type="url"
          value={form.portfolioUrl ?? ""}
          onChange={(e) =>
            setForm((p) => ({ ...p, portfolioUrl: e.target.value }))
          }
          placeholder={t("applyPortfolioPh")}
        />
      </div>

      {/* 申请理由 */}
      <div className={styles.formField}>
        <label className={styles.formLabel}>
          <FileText size={13} strokeWidth={1.8} />
          <span>
            {t("applyReason")} * ({form.reason.length}/100)
          </span>
        </label>
        <textarea
          className={`igm-mono ${styles.formTextarea}`}
          value={form.reason}
          onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
          required
          minLength={100}
          rows={5}
          placeholder={t("applyReasonPh")}
        />
      </div>

      {/* 同意规范 */}
      <label className={styles.agree}>
        <input
          type="checkbox"
          checked={form.agreedToRules}
          onChange={(e) =>
            setForm((p) => ({ ...p, agreedToRules: e.target.checked }))
          }
        />
        <span>{t("applyAgree")}</span>
      </label>

      {/* 提交按钮 + 状态反馈 */}
      {props.submitError && (
        <p className={styles.inlineError}>{props.submitError}</p>
      )}
      {props.submitSuccess && (
        <p className={styles.inlineSuccess}>{t("applySubmittedSuccess")}</p>
      )}
      <button
        type="submit"
        className={styles.submitBtn}
        disabled={props.submitting}
      >
        <Save size={15} strokeWidth={1.8} />
        <span>{props.submitting ? t("applySubmitting") : t("applySubmit")}</span>
      </button>
    </form>
  );
}

// 导出 //
export default E_CreatorApply;
