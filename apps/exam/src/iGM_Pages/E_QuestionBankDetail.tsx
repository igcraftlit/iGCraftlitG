/**
 * 文件路径：apps/exam/src/iGM_Pages/E_QuestionBankDetail.tsx
 * 所属层：前端 / 页面层
 * 路由：E_QuestionBankDetail（/bank/detail?questionId=xxx）
 * 模块：iGM_QuestionBankDetail
 * 作用：题目详情面板，展示单题的教材、题干、选项、答案、解析、难度、标签与题型
 * 内容：返回栏、所属教材名称信标、字段区块、加载 / 失败 / 缺失状态
 * 说明：静态导出下通过 useSearchParams 读取 questionId；由路由壳提供 Suspense 边界；
 *       数据来自静态题库索引，缺失（NOT_FOUND）时提示未找到；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, RefreshCw } from "lucide-react";
import {
  iGM_Question_FetchStaticQuestion,
  type iGM_QuestionStaticItem,
} from "../iGM_Services/iGM_QuestionStaticClient";
import { iGM_ExamRequestError } from "../iGM_Services/iGM_ExamClient";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../iGM_i18n/iGM_I18nTypes";
import styles from "./E_QuestionBankDetail.module.css";

// 类型定义 //
type iGM_Question_DetailState = "loading" | "ready" | "error" | "missing";

/** 题型 → 文案键 */
const iGM_Question_TypeKeys: Record<string, iGM_I18nKey> = {
  single_choice: "questionTypeSingleChoice",
  multiple_choice: "questionTypeMultipleChoice",
  true_false: "questionTypeTrueFalse",
  fill_blank: "questionTypeFillBlank",
  short_answer: "questionTypeShortAnswer",
};

// 核心逻辑 //
/** 难度等级文本（简单 / 中等 / 困难，无法归类时原样返回） */
function iGM_Question_Level(lang: string, t: (key: iGM_I18nKey) => string): string {
  const value = lang.trim().toLowerCase();
  if (value.includes("easy") || value.includes("简单")) return t("difficultyEasy");
  if (value.includes("hard") || value.includes("困难") || value.includes("难"))
    return t("difficultyHard");
  if (value.includes("medium") || value.includes("中等")) return t("difficultyMedium");
  return lang || "--";
}

/** 题目详情面板 */
export function E_QuestionBankDetail() {
  const params = useSearchParams();
  const { t } = useI18n();
  const questionId = params.get("questionId") ?? "";

  const [question, setQuestion] = useState<iGM_QuestionStaticItem | null>(null);
  const [state, setState] = useState<iGM_Question_DetailState>("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!questionId) {
      setState("missing");
      return;
    }
    setState("loading");
    setMessage("");
    try {
      const detail = await iGM_Question_FetchStaticQuestion(questionId);
      setQuestion(detail);
      setState("ready");
    } catch (err) {
      if (err instanceof iGM_ExamRequestError && err.code === 404) {
        setState("missing");
        return;
      }
      setMessage(err instanceof iGM_ExamRequestError ? err.message : "");
      setState("error");
    }
  }, [questionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <main className={styles.page}>
        <p className={`igm-mono ${styles.state}`}>{t("bankLoading")}</p>
      </main>
    );
  }

  if (state !== "ready" || !question) {
    return (
      <main className={styles.page}>
        <div className={styles.errorBox}>
          <p className={`igm-mono ${styles.errorText}`}>
            {state === "missing" ? t("bankDetailMissing") : message || t("bankError")}
          </p>
          <div className={styles.errorActions}>
            {state === "error" && (
              <button
                type="button"
                className={styles.back}
                onClick={() => void load()}
              >
                <RefreshCw size={13} strokeWidth={1.8} />
                {t("bankRetry")}
              </button>
            )}
            <Link href="/bank" className={styles.back}>
              <ArrowLeft size={13} strokeWidth={1.8} />
              {t("bankBack")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const typeLabel = iGM_Question_TypeKeys[question.type]
    ? t(iGM_Question_TypeKeys[question.type])
    : question.type;
  const options = Array.isArray(question.options) ? question.options : [];
  const tags = Array.isArray(question.tags) ? question.tags : [];

  return (
    <main className={styles.page}>
      {/* 返回栏 */}
      <div className={styles.backRow}>
        <Link href="/bank" className={styles.back}>
          <ArrowLeft size={14} strokeWidth={1.8} />
          <span className={`igm-mono ${styles.backLabel}`}>{t("bankBack")}</span>
        </Link>
        <span className={`igm-mono ${styles.recordCode}`}>{question.id}</span>
      </div>

      {/* 所属教材（醒目） */}
      <section className={`igm-double-rule ${styles.bookBanner}`} aria-label={t("bankFieldTextbook")}>
        <BookOpen size={20} strokeWidth={1.6} className={styles.bookIcon} />
        <div className={styles.bookText}>
          <span className={`igm-mono ${styles.bookEyebrow}`}>
            {t("bankFieldTextbook")}
          </span>
          <h1 className={`igm-serif ${styles.bookName}`}>
            {question.textbookName || question.textbookCode}
          </h1>
        </div>
        <span className={`igm-mono ${styles.bookCode}`}>{question.textbookCode}</span>
      </section>

      {/* 题干 */}
      <section className={styles.section} aria-label={t("bankFieldStem")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 1</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>{t("bankFieldStem")}</h2>
        </div>
        <p className={`igm-serif ${styles.stem}`}>{question.stem}</p>

        <div className={styles.metaRow}>
          <span className={`igm-mono ${styles.metaTag}`}>
            {t("bankFieldType")}：{typeLabel}
          </span>
          <span className={`igm-mono ${styles.metaTag}`}>
            {t("bankFieldDifficulty")}：
            {iGM_Question_Level(question.difficultyLevel, t)}
            {question.difficultyCoefficient !== null &&
              ` (${question.difficultyCoefficient})`}
          </span>
        </div>
      </section>

      {/* 选项 */}
      {options.length > 0 && (
        <section className={styles.section} aria-label={t("bankFieldOptions")}>
          <div className={styles.sectionHead}>
            <span className={`igm-mono ${styles.sectionNum}`}>§ 2</span>
            <h2 className={`igm-serif ${styles.sectionTitle}`}>{t("bankFieldOptions")}</h2>
          </div>
          <ul className={styles.optionList}>
            {options.map((option) => (
              <li key={option.key} className={styles.option}>
                <span className={`igm-mono ${styles.optionKey}`}>{option.key}</span>
                <span className={styles.optionText}>{option.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 答案 */}
      <section className={styles.section} aria-label={t("bankFieldAnswer")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ {options.length > 0 ? 3 : 2}</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>{t("bankFieldAnswer")}</h2>
        </div>
        <p className={styles.answer}>{question.answer || "--"}</p>
      </section>

      {/* 解析 */}
      <section className={styles.section} aria-label={t("bankFieldAnalysis")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ {options.length > 0 ? 4 : 3}</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>{t("bankFieldAnalysis")}</h2>
        </div>
        <p className={styles.analysis}>{question.analysis || "--"}</p>
      </section>

      {/* 标签 */}
      {tags.length > 0 && (
        <section className={styles.section} aria-label={t("bankFieldTags")}>
          <div className={styles.sectionHead}>
            <span className={`igm-mono ${styles.sectionNum}`}>§ {options.length > 0 ? 5 : 4}</span>
            <h2 className={`igm-serif ${styles.sectionTitle}`}>{t("bankFieldTags")}</h2>
          </div>
          <div className={styles.tagRow}>
            {tags.map((tag) => (
              <span key={tag} className={`igm-mono ${styles.tag}`}>
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

// 导出 //
export default E_QuestionBankDetail;
