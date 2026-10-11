/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Admin_Upload.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Admin_Upload（/admin/upload）
 * 模块：iGM_ExamUpload
 * 作用：试卷发布页，管理员手工填写规格并选择 PDF（最大 50 MB）后直接发布；
 *       规格任一缺失或数值非法时提交按钮置灰，无法提交
 * 内容：发布信息表单（名称 / 科目 / 命题方 / 审题方 / 时长 / 总分 / 题数 / 须知）、
 *       试卷文件拖拽选择区、必填与正整数校验、发布后部署状态提示弹窗
 * 说明：发布即写入数据库并转为已发布状态，转换在后台异步执行；
 *       提交后弹出部署提示并轮询线上索引，构建完成后提示已上线；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Send,
  UploadCloud,
} from "lucide-react";
import {
  iGM_Exam_Upload,
  iGM_ExamRequestError,
} from "../iGM_Services/iGM_ExamClient";
import { iGM_Exam_FetchOnlineIndexIds } from "../iGM_Services/iGM_ExamStaticClient";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import styles from "./E_Admin_Upload.module.css";

// 类型定义 //
/** 发布表单草稿（全部为字符串，提交时转换为正整数） */
interface iGM_Exam_PublishForm {
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: string;
  totalScore: string;
  questionCount: string;
  notice: string;
}

/** 单文件上限（字节） */
const iGM_Exam_MaxUploadBytes = 50 * 1024 * 1024;

/** 正整数校验：首位非零的纯数字 */
const iGM_Exam_PositiveIntPattern = /^[1-9]\d*$/;

/** 线上部署状态轮询间隔（毫秒） */
const iGM_ExamDeployPollMs = 30000;

/** 空白表单 */
const iGM_Exam_EmptyForm: iGM_Exam_PublishForm = {
  title: "",
  subject: "",
  issuer: "",
  reviewer: "",
  duration: "",
  totalScore: "",
  questionCount: "",
  notice: "",
};

// 核心逻辑 //
/** 判定文件是否为 PDF（扩展名或 MIME） */
function iGM_Exam_IsPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** 正整数文本 → 数字（调用方已确保通过校验） */
function iGM_Exam_ToInt(value: string): number {
  return Number.parseInt(value.trim(), 10);
}

/** 试卷发布页 */
export function iGM_ExamUploadPage() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<iGM_Exam_PublishForm>(iGM_Exam_EmptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  /** 发布后触发的部署提示所对应的试卷 id；null 表示不显示提示框 */
  const [deployBannerId, setDeployBannerId] = useState<string | null>(null);
  /** 线上已部署试卷 id 集合；null 表示尚未取得 */
  const [onlineIds, setOnlineIds] = useState<Set<string> | null>(null);

  // 部署提示显示期间每 30 秒轮询线上索引，检测到试卷已上线即停止
  useEffect(() => {
    if (!deployBannerId) return;
    if (onlineIds && onlineIds.has(deployBannerId)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (): Promise<void> => {
      try {
        const ids = await iGM_Exam_FetchOnlineIndexIds();
        if (cancelled) return;
        setOnlineIds(ids);
      } catch {
        // 单次轮询失败不中断，继续下一轮
      }
      if (!cancelled) {
        timer = setTimeout(() => void tick(), iGM_ExamDeployPollMs);
      }
    };

    timer = setTimeout(() => void tick(), iGM_ExamDeployPollMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [deployBannerId, onlineIds]);

  const deployDone =
    deployBannerId !== null && Boolean(onlineIds?.has(deployBannerId));

  // 校验：文本字段非空 + 数值为正整数 + 已选择 PDF
  const textOk = [form.title, form.subject, form.issuer, form.reviewer].every(
    (value) => value.trim().length > 0,
  );
  const numberValues = [form.duration, form.totalScore, form.questionCount];
  const numberOk = numberValues.every((value) =>
    iGM_Exam_PositiveIntPattern.test(value.trim()),
  );
  const numberInvalid = numberValues.some(
    (value) =>
      value.trim().length > 0 && !iGM_Exam_PositiveIntPattern.test(value.trim()),
  );
  const complete = textOk && numberOk && file !== null;
  const hint = numberInvalid
    ? t("uploadInvalidNumber")
    : complete
      ? ""
      : t("uploadRequiredHint");

  /** 选择文件：本地校验格式与体积 */
  function pick(next: File | undefined): void {
    if (!next) return;
    if (!iGM_Exam_IsPdf(next)) {
      setFile(null);
      setMessage(t("uploadOnlyPdf"));
      return;
    }
    if (next.size > iGM_Exam_MaxUploadBytes) {
      setFile(null);
      setMessage(t("uploadTooLarge"));
      return;
    }
    setMessage("");
    setFile(next);
  }

  /** 提交发布：校验通过后携带元数据上传，成功后弹出部署提示 */
  async function submit(): Promise<void> {
    if (!complete || !file || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const result = await iGM_Exam_Upload(file, {
        title: form.title.trim(),
        subject: form.subject.trim(),
        issuer: form.issuer.trim(),
        reviewer: form.reviewer.trim(),
        duration: iGM_Exam_ToInt(form.duration),
        totalScore: iGM_Exam_ToInt(form.totalScore),
        questionCount: iGM_Exam_ToInt(form.questionCount),
        notice: form.notice.trim(),
      });
      setForm({ ...iGM_Exam_EmptyForm });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setDeployBannerId(result.exam.id);
    } catch (err) {
      setMessage(
        err instanceof iGM_ExamRequestError ? err.message : t("uploadFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** 关闭部署提示并返回台账 */
  function closeDeployBanner(): void {
    setDeployBannerId(null);
    router.push("/admin");
  }

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>{t("uploadEyebrow")}</p>
        <h1 className={`igm-serif ${styles.headTitle}`}>{t("uploadTitle")}</h1>
        <p className={styles.headLead}>{t("uploadLead")}</p>
      </header>

      {/* 发布信息表单 */}
      <section className={styles.section} aria-label={t("uploadFormTitle")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 1</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>
            {t("uploadFormTitle")}
          </h2>
        </div>

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className={styles.field}>
            <span className={`igm-mono ${styles.fieldLabel}`}>
              {t("adminFieldTitle")}
            </span>
            <input
              className={styles.input}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("adminPlaceholderTitle")}
            />
          </label>

          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={`igm-mono ${styles.fieldLabel}`}>
                {t("fieldSubject")}
              </span>
              <input
                className={styles.input}
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder={t("adminPlaceholderSubject")}
              />
            </label>
            <label className={styles.field}>
              <span className={`igm-mono ${styles.fieldLabel}`}>
                {t("fieldIssuer")}
              </span>
              <input
                className={styles.input}
                value={form.issuer}
                onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                placeholder={t("adminPlaceholderIssuer")}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span className={`igm-mono ${styles.fieldLabel}`}>
              {t("fieldReviewer")}
            </span>
            <input
              className={styles.input}
              value={form.reviewer}
              onChange={(e) => setForm({ ...form, reviewer: e.target.value })}
              placeholder={t("adminPlaceholderReviewer")}
            />
          </label>

          <div className={styles.fieldRowThree}>
            <label className={styles.field}>
              <span className={`igm-mono ${styles.fieldLabel}`}>
                {t("adminFieldDuration")}
              </span>
              <input
                className={styles.input}
                inputMode="numeric"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="120"
              />
            </label>
            <label className={styles.field}>
              <span className={`igm-mono ${styles.fieldLabel}`}>
                {t("adminFieldTotal")}
              </span>
              <input
                className={styles.input}
                inputMode="numeric"
                value={form.totalScore}
                onChange={(e) => setForm({ ...form, totalScore: e.target.value })}
                placeholder="150"
              />
            </label>
            <label className={styles.field}>
              <span className={`igm-mono ${styles.fieldLabel}`}>
                {t("adminFieldItems")}
              </span>
              <input
                className={styles.input}
                inputMode="numeric"
                value={form.questionCount}
                onChange={(e) =>
                  setForm({ ...form, questionCount: e.target.value })
                }
                placeholder="30"
              />
            </label>
          </div>

          <label className={styles.field}>
            <span className={`igm-mono ${styles.fieldLabel}`}>
              {t("adminFieldNotice")}
            </span>
            <textarea
              className={styles.textarea}
              rows={2}
              value={form.notice}
              onChange={(e) => setForm({ ...form, notice: e.target.value })}
              placeholder={t("adminPlaceholderNotice")}
            />
          </label>
        </form>
      </section>

      {/* 试卷文件 */}
      <section className={styles.section} aria-label={t("uploadFileTitle")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 2</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>
            {t("uploadFileTitle")}
          </h2>
        </div>

        <div
          className={`igm-double-rule ${styles.dropzone} ${
            dragging ? styles.dropzoneActive : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!submitting) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (submitting) return;
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          <UploadCloud size={34} strokeWidth={1.5} className={styles.dropIcon} />
          <p className={`igm-mono ${styles.dropHint}`}>{t("uploadDropHint")}</p>
          <button
            type="button"
            className={styles.pickBtn}
            onClick={() => inputRef.current?.click()}
            disabled={submitting}
          >
            <FileText size={15} strokeWidth={1.8} />
            <span className={`igm-mono ${styles.pickLabel}`}>
              {t("uploadPick")}
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className={styles.hiddenInput}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {file && (
            <p className={`igm-mono ${styles.fileName}`} title={file.name}>
              {file.name}
            </p>
          )}
        </div>
      </section>

      {/* 提示与提交 */}
      {message && (
        <p className={`igm-mono ${styles.alertError}`}>
          <AlertCircle size={14} strokeWidth={1.8} />
          {message}
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
            {t("uploadSubmit")}
          </span>
        </button>
        {hint && <p className={`igm-mono ${styles.hint}`}>{hint}</p>}
      </div>

      {/* 部署状态提示：发布后弹出，构建完成后自动切换为已上线 */}
      {deployBannerId && (
        <div className={styles.modalOverlay} role="presentation">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={deployDone ? t("deployDone") : t("deployTitle")}
          >
            <h3 className={`igm-serif ${styles.modalTitle}`}>
              {deployDone ? t("deployDone") : t("deployTitle")}
            </h3>
            {!deployDone && <p className={styles.modalBody}>{t("deployBody")}</p>}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={closeDeployBanner}
              >
                {deployDone ? (
                  <CheckCircle2 size={14} strokeWidth={1.8} />
                ) : (
                  <Clock size={14} strokeWidth={1.8} />
                )}
                <span className="igm-mono">{t("deployBack")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// 导出 //
export default iGM_ExamUploadPage;
