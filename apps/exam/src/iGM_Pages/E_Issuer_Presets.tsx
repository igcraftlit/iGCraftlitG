/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Issuer_Presets.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Issuer_Presets（/presets）
 * 模块：iGM_IssuerPresetsPage
 * 作用：管理命题方预设，支持新建 / 编辑 / 删除本人预设并浏览全站共享预设
 * 内容：预设列表（名称、关键词、我的 / 共享标记）、新建 / 编辑表单（名称、关键词、全站可见）、
 *       本人预设的编辑与删除操作、加载 / 空 / 失败状态
 * 说明：仅 mine=true 的预设显示编辑 / 删除按钮；关键词以逗号分隔字符串与 string[] 互转；
 *       预设默认为全站可见供他人选用；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  iGM_Examiner_CreatePreset,
  iGM_Examiner_DeletePreset,
  iGM_Examiner_FetchPresets,
  iGM_Examiner_UpdatePreset,
  type iGM_IssuerPresetDto,
} from "../iGM_Services/iGM_ExaminerClient";
import { iGM_ExamRequestError } from "../iGM_Services/iGM_ExamClient";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import styles from "./E_Issuer_Presets.module.css";

// 类型定义 //
type iGM_IssuerPresetsState = "loading" | "ready" | "error";

/** 预设表单草稿（关键词以逗号分隔字符串保存） */
interface iGM_IssuerPresetForm {
  name: string;
  keywords: string;
  isPublic: boolean;
}

/** 空白表单（默认全站可见） */
const iGM_IssuerPresetEmpty: iGM_IssuerPresetForm = {
  name: "",
  keywords: "",
  isPublic: true,
};

// 核心逻辑 //
/** 关键词字符串 → 数组（支持中英文逗号，忽略空项） */
function iGM_Issuer_ToKeywords(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** 关键词数组 → 字符串（逗号分隔） */
function iGM_Issuer_ToKeywordText(keywords: string[]): string {
  return keywords.join(", ");
}

/** 预设 DTO → 表单草稿 */
function iGM_Issuer_ToForm(preset: iGM_IssuerPresetDto): iGM_IssuerPresetForm {
  return {
    name: preset.name,
    keywords: iGM_Issuer_ToKeywordText(preset.keywords),
    isPublic: preset.isPublic,
  };
}

/** 命题方预设页 */
export function E_IssuerPresets() {
  const { t } = useI18n();
  const [presets, setPresets] = useState<iGM_IssuerPresetDto[]>([]);
  const [state, setState] = useState<iGM_IssuerPresetsState>("loading");
  const [form, setForm] = useState<iGM_IssuerPresetForm>(iGM_IssuerPresetEmpty);
  /** 正在编辑的预设 id；null 表示新建 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const list = await iGM_Examiner_FetchPresets();
      setPresets(list);
      setState("ready");
    } catch (err) {
      setMessage(err instanceof iGM_ExamRequestError ? err.message : "");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 统一错误信息提取 */
  function readError(err: unknown): string {
    return err instanceof iGM_ExamRequestError
      ? err.message
      : t("presetsFailed");
  }

  /** 进入新建态并清空表单 */
  function startCreate(): void {
    setEditingId(null);
    setForm({ ...iGM_IssuerPresetEmpty });
    setMessage("");
    setNotice("");
  }

  /** 进入编辑态 */
  function startEdit(preset: iGM_IssuerPresetDto): void {
    setEditingId(preset.id);
    setForm(iGM_Issuer_ToForm(preset));
    setMessage("");
    setNotice("");
  }

  /** 取消编辑，回到新建态 */
  function cancelEdit(): void {
    setEditingId(null);
    setForm({ ...iGM_IssuerPresetEmpty });
    setMessage("");
  }

  /** 提交新建或保存修改 */
  async function submit(): Promise<void> {
    if (busy) return;
    const name = form.name.trim();
    if (!name) {
      setMessage(t("presetsRequired"));
      setNotice("");
      return;
    }
    setBusy(true);
    setMessage("");
    setNotice("");
    const payload = {
      name,
      keywords: iGM_Issuer_ToKeywords(form.keywords),
      isPublic: form.isPublic,
    };
    try {
      if (editingId) {
        await iGM_Examiner_UpdatePreset(editingId, payload);
        setNotice(t("presetsSaved"));
      } else {
        await iGM_Examiner_CreatePreset(payload);
        setNotice(t("presetsCreated"));
      }
      setEditingId(null);
      setForm({ ...iGM_IssuerPresetEmpty });
      await load();
    } catch (err) {
      setMessage(readError(err));
    } finally {
      setBusy(false);
    }
  }

  /** 二次确认后删除预设 */
  async function remove(preset: iGM_IssuerPresetDto): Promise<void> {
    if (busy) return;
    if (typeof window !== "undefined" && !window.confirm(t("presetsDeleteConfirm"))) {
      return;
    }
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      await iGM_Examiner_DeletePreset(preset.id);
      if (editingId === preset.id) {
        setEditingId(null);
        setForm({ ...iGM_IssuerPresetEmpty });
      }
      setNotice(t("presetsDeleted"));
      await load();
    } catch (err) {
      setMessage(readError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>{t("presetsEyebrow")}</p>
        <h1 className={`igm-serif ${styles.headTitle}`}>{t("presetsTitle")}</h1>
        <p className={styles.headLead}>{t("presetsLead")}</p>
      </header>

      {/* 表单 */}
      <section className={styles.section} aria-label={t("presetsFormTitle")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 1</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>
            {editingId
              ? `${t("presetsEditing")} · ${t("presetsFormTitle")}`
              : t("presetsFormTitle")}
          </h2>
        </div>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={styles.field}>
            <span className={`igm-mono ${styles.fieldLabel}`}>
              {t("presetsFieldName")}
            </span>
            <input
              className={styles.input}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t("presetsPlaceholderName")}
            />
          </label>

          <label className={styles.field}>
            <span className={`igm-mono ${styles.fieldLabel}`}>
              {t("presetsFieldKeywords")}
            </span>
            <input
              className={styles.input}
              value={form.keywords}
              onChange={(event) =>
                setForm({ ...form, keywords: event.target.value })
              }
              placeholder={t("presetsPlaceholderKeywords")}
            />
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(event) =>
                setForm({ ...form, isPublic: event.target.checked })
              }
            />
            <span className={`igm-mono ${styles.checkLabel}`}>
              {t("presetsFieldPublic")}
            </span>
          </label>

          {message && (
            <p className={`igm-mono ${styles.alertError}`}>
              <AlertCircle size={14} strokeWidth={1.8} />
              {message}
            </p>
          )}
          {notice && !message && (
            <p className={`igm-mono ${styles.alertOk}`}>
              <CheckCircle2 size={14} strokeWidth={1.8} />
              {notice}
            </p>
          )}

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void submit()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 size={14} strokeWidth={1.8} className={styles.spin} />
              ) : editingId ? (
                <Pencil size={14} strokeWidth={1.8} />
              ) : (
                <Plus size={14} strokeWidth={1.8} />
              )}
              <span className="igm-mono">
                {editingId ? t("presetsSave") : t("presetsCreate")}
              </span>
            </button>
            {editingId && (
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={cancelEdit}
                disabled={busy}
              >
                <span className="igm-mono">{t("presetsCancel")}</span>
              </button>
            )}
          </div>
        </form>
      </section>

      {/* 列表 */}
      <section className={styles.section} aria-label={t("presetsTitle")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 2</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>{t("presetsTitle")}</h2>
          <span className={`igm-mono ${styles.count}`}>
            {String(presets.length).padStart(3, "0")}
          </span>
        </div>

        {state === "loading" && (
          <p className={`igm-mono ${styles.state}`}>{t("presetsLoading")}</p>
        )}
        {state === "error" && (
          <p className={`igm-mono ${styles.stateError}`}>
            <AlertCircle size={14} strokeWidth={1.8} />
            {message || t("presetsFailed")}
          </p>
        )}
        {state === "ready" && presets.length === 0 && (
          <p className={`igm-mono ${styles.state}`}>{t("presetsEmpty")}</p>
        )}

        {state === "ready" && presets.length > 0 && (
          <ul className={styles.list}>
            {presets.map((preset) => (
              <li key={preset.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.itemName}>{preset.name}</span>
                  <span
                    className={`igm-mono ${styles.badge} ${
                      preset.mine ? styles.badgeMine : styles.badgeShared
                    }`}
                  >
                    {preset.mine ? t("presetsMine") : t("presetsShared")}
                  </span>
                </div>
                <div className={styles.keywords}>
                  {preset.keywords.length > 0 ? (
                    preset.keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className={`igm-mono ${styles.keyword}`}
                      >
                        {keyword}
                      </span>
                    ))
                  ) : (
                    <span className={`igm-mono ${styles.keywordEmpty}`}>—</span>
                  )}
                </div>
                {preset.mine && (
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => startEdit(preset)}
                      disabled={busy}
                    >
                      <Pencil size={13} strokeWidth={1.8} />
                      <span className={styles.btnLabel}>{t("presetsEdit")}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => void remove(preset)}
                      disabled={busy}
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                      <span className={styles.btnLabel}>{t("presetsDelete")}</span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// 导出 //
export default E_IssuerPresets;
