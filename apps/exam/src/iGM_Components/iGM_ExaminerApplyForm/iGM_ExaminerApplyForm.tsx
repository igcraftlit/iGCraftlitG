/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExaminerApplyForm/iGM_ExaminerApplyForm.tsx
 * 所属层：前端 / 通用组件层
 * 路由：E_Examiner_Apply（/apply）、E_Admin_Exam（/admin）、E_Admin_Upload（/admin/upload）
 * 模块：iGM_ExaminerApplyForm
 * 作用：命题创作者申请表单，采集真实姓名、联系方式、简介、命题方向、作品链接与申请理由并提交
 * 内容：受控表单、字体与字数校验（简介 ≥100 字、理由 ≥200 字）、提交状态与结果提示
 * 说明：提交成功后回调 onSubmitted；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import {
  iGM_Examiner_SubmitApply,
  type iGM_ExaminerDirection,
} from "../../iGM_Services/iGM_ExaminerClient";
import { iGM_ExamRequestError } from "../../iGM_Services/iGM_ExamClient";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../../iGM_i18n/iGM_I18nTypes";
import styles from "./iGM_ExaminerApplyForm.module.css";

// 类型定义 //
interface iGM_ExaminerApplyFormProps {
  /** 提交成功后的回调（如刷新准入状态 / 关闭表单） */
  onSubmitted?: () => void;
}

/** 命题方向选项（键 / 文案键） */
const iGM_Examiner_DirectionOptions: {
  value: iGM_ExaminerDirection;
  labelKey: iGM_I18nKey;
}[] = [
  { value: "minecraft", labelKey: "examinerDirectionMinecraft" },
  { value: "java", labelKey: "examinerDirectionJava" },
  { value: "informatics", labelKey: "examinerDirectionInformatics" },
  { value: "general", labelKey: "examinerDirectionGeneral" },
];

/** 简介与理由最小字数 */
const iGM_Examiner_MinBio = 100;
const iGM_Examiner_MinReason = 200;

// 核心逻辑 //
/** 命题创作者申请表单 */
export function iGM_ExaminerApplyForm({
  onSubmitted,
}: iGM_ExaminerApplyFormProps) {
  const { t } = useI18n();

  const [realName, setRealName] = useState("");
  const [contact, setContact] = useState("");
  const [bio, setBio] = useState("");
  const [directions, setDirections] = useState<iGM_ExaminerDirection[]>([]);
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const hasInput = useMemo(
    () =>
      [realName, contact, bio, portfolioUrl, reason].some(
        (value) => value.trim().length > 0,
      ) || directions.length > 0,
    [realName, contact, bio, portfolioUrl, reason, directions],
  );

  const requiredOk =
    realName.trim().length > 0 && contact.trim().length > 0;
  const bioOk = bio.trim().length >= iGM_Examiner_MinBio;
  const reasonOk = reason.trim().length >= iGM_Examiner_MinReason;
  const complete = requiredOk && bioOk && reasonOk;

  const hint = !requiredOk
    ? t("examinerApplyRequired")
    : !bioOk
      ? t("examinerApplyBioTooShort")
      : !reasonOk
        ? t("examinerApplyReasonTooShort")
        : "";

  /** 切换某个命题方向的选中状态 */
  function toggleDirection(value: iGM_ExaminerDirection): void {
    setDirections((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  /** 提交申请 */
  async function submit(): Promise<void> {
    if (!complete || submitting) return;
    setSubmitting(true);
    setError("");
    setDone(false);
    try {
      await iGM_Examiner_SubmitApply({
        realName: realName.trim(),
        contact: contact.trim(),
        bio: bio.trim(),
        directions,
        portfolioUrl: portfolioUrl.trim() || undefined,
        reason: reason.trim(),
      });
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      setError(
        err instanceof iGM_ExamRequestError
          ? err.message
          : t("examinerApplyFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className={`igm-double-rule ${styles.form}`}
      aria-label={t("examinerApplyFormTitle")}
    >
      <h2 className={`igm-serif ${styles.formTitle}`}>
        {t("examinerApplyFormTitle")}
      </h2>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className={styles.field}>
          <span className={`igm-mono ${styles.label}`}>
            {t("examinerFieldRealName")}
          </span>
          <input
            className={styles.input}
            value={realName}
            onChange={(event) => setRealName(event.target.value)}
            placeholder={t("examinerPlaceholderRealName")}
          />
        </label>

        <label className={styles.field}>
          <span className={`igm-mono ${styles.label}`}>
            {t("examinerFieldContact")}
          </span>
          <input
            className={styles.input}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder={t("examinerPlaceholderContact")}
          />
        </label>

        <label className={styles.field}>
          <span className={`igm-mono ${styles.label}`}>
            {t("examinerFieldBio")}
          </span>
          <textarea
            className={styles.textarea}
            rows={4}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder={t("examinerPlaceholderBio")}
          />
        </label>

        <fieldset className={styles.fieldset}>
          <legend className={`igm-mono ${styles.label}`}>
            {t("examinerFieldDirections")}
          </legend>
          <div className={styles.checks}>
            {iGM_Examiner_DirectionOptions.map((option) => (
              <label key={option.value} className={styles.check}>
                <input
                  type="checkbox"
                  checked={directions.includes(option.value)}
                  onChange={() => toggleDirection(option.value)}
                />
                <span className={`igm-mono ${styles.checkLabel}`}>
                  {t(option.labelKey)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className={styles.field}>
          <span className={`igm-mono ${styles.label}`}>
            {t("examinerFieldPortfolio")}
          </span>
          <input
            className={styles.input}
            value={portfolioUrl}
            onChange={(event) => setPortfolioUrl(event.target.value)}
            placeholder={t("examinerPlaceholderPortfolio")}
          />
        </label>

        <label className={styles.field}>
          <span className={`igm-mono ${styles.label}`}>
            {t("examinerFieldReason")}
          </span>
          <textarea
            className={styles.textarea}
            rows={6}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("examinerPlaceholderReason")}
          />
        </label>

        {error && (
          <p className={`igm-mono ${styles.alertError}`}>
            <AlertCircle size={14} strokeWidth={1.8} />
            {error}
          </p>
        )}
        {done && !error && (
          <p className={`igm-mono ${styles.alertOk}`}>
            <CheckCircle2 size={14} strokeWidth={1.8} />
            {t("examinerApplyDone")}
          </p>
        )}

        <div className={styles.submitRow}>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={() => void submit()}
            disabled={!complete || submitting}
          >
            {submitting ? (
              <Loader2 size={15} strokeWidth={1.8} className={styles.spin} />
            ) : (
              <Send size={15} strokeWidth={1.8} />
            )}
            <span className={`igm-mono ${styles.submitLabel}`}>
              {submitting ? t("examinerApplySubmitting") : t("examinerApplySubmit")}
            </span>
          </button>
          {!complete && hasInput && hint && (
            <p className={`igm-mono ${styles.hint}`}>{hint}</p>
          )}
        </div>
      </form>
    </section>
  );
}

// 导出 //
export default iGM_ExaminerApplyForm;
