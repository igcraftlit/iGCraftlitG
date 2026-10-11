/**
 * 文件路径：apps/exam/src/iGM_Pages/E_QuestionBank.tsx
 * 所属层：前端 / 页面层
 * 路由：E_QuestionBank（/bank）
 * 模块：iGM_QuestionBank
 * 作用：题库页，离线浏览已发布题目，支持按教材筛选与关键词检索
 * 内容：页头引言、筛选工具条（所属教材下拉 + 搜索框）、题目卡片网格、加载 / 失败 / 空 / 无结果状态
 * 说明：纯静态导出，数据来自静态题库索引（public/questions/index.json），无需后端；
 *       点击卡片进入 /bank/detail?questionId=<id>；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, FileSearch, RefreshCw, Search } from "lucide-react";
import {
  iGM_Question_FetchStaticBank,
  type iGM_QuestionStaticItem,
} from "../iGM_Services/iGM_QuestionStaticClient";
import {
  iGM_QuestionTextbooks,
  iGM_QuestionTextbookName,
} from "../iGM_Services/iGM_QuestionTextbooks";
import { iGM_ExamRequestError } from "../iGM_Services/iGM_ExamClient";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../iGM_i18n/iGM_I18nTypes";
import styles from "./E_QuestionBank.module.css";

// 类型定义 //
type iGM_Question_BankState = "loading" | "ready" | "error";

/** 题型 → 文案键 */
const iGM_Question_TypeKeys: Record<string, iGM_I18nKey> = {
  single_choice: "questionTypeSingleChoice",
  multiple_choice: "questionTypeMultipleChoice",
  true_false: "questionTypeTrueFalse",
  fill_blank: "questionTypeFillBlank",
  short_answer: "questionTypeShortAnswer",
};

// 核心逻辑 //
/** 题干摘要：折叠空白并截断 */
function iGM_Question_Excerpt(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** 难度等级文本（简单 / 中等 / 困难，无法归类时原样返回） */
function iGM_Question_Level(lang: string, t: (key: iGM_I18nKey) => string): string {
  const value = lang.trim().toLowerCase();
  if (value.includes("easy") || value.includes("简单")) return t("difficultyEasy");
  if (value.includes("hard") || value.includes("困难") || value.includes("难"))
    return t("difficultyHard");
  if (value.includes("medium") || value.includes("中等")) return t("difficultyMedium");
  return lang || "--";
}

/** 题库页 */
export function E_QuestionBank() {
  const { t } = useI18n();
  const [questions, setQuestions] = useState<iGM_QuestionStaticItem[]>([]);
  const [state, setState] = useState<iGM_Question_BankState>("loading");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  /** 教材筛选代码；空串表示全部 */
  const [textbookFilter, setTextbookFilter] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setMessage("");
    try {
      const bank = await iGM_Question_FetchStaticBank();
      setQuestions(bank.questions);
      setState("ready");
    } catch (err) {
      setMessage(err instanceof iGM_ExamRequestError ? err.message : "");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 先按教材过滤，再按关键词过滤（匹配题干 / 标签 / 教材名，大小写不敏感）
  const visible = useMemo(() => {
    const byTextbook = textbookFilter
      ? questions.filter((item) => item.textbookCode === textbookFilter)
      : questions;
    const keyword = query.trim().toLowerCase();
    if (!keyword) return byTextbook;
    return byTextbook.filter((item) => {
      const tags = Array.isArray(item.tags) ? item.tags.join(" ") : "";
      return (
        (item.stem ?? "").toLowerCase().includes(keyword) ||
        tags.toLowerCase().includes(keyword) ||
        (item.textbookName ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [questions, textbookFilter, query]);

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>{t("bankEyebrow")}</p>
        <h1 className={`igm-serif ${styles.headTitle}`}>{t("bankTitle")}</h1>
        <p className={styles.headLead}>{t("bankLead")}</p>
      </header>

      {/* 筛选工具条 */}
      <section aria-label={t("bankFilterTextbook")}>
        <div className={styles.toolRow}>
          <label className={styles.filterField}>
            <BookOpen size={14} strokeWidth={1.8} className={styles.filterIcon} />
            <span className={`igm-mono ${styles.filterLabel}`}>
              {t("bankFilterTextbook")}
            </span>
            <select
              className={`igm-mono ${styles.filterSelect}`}
              value={textbookFilter}
              onChange={(event) => setTextbookFilter(event.target.value)}
              aria-label={t("bankFilterTextbook")}
            >
              <option value="">{t("bankFilterAll")}</option>
              {iGM_QuestionTextbooks.map((book) => (
                <option key={book.code} value={book.code}>
                  {book.name}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.searchRow}>
            <Search size={15} strokeWidth={1.8} className={styles.searchIcon} />
            <input
              type="search"
              className={`igm-mono ${styles.searchInput}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("bankSearchPlaceholder")}
              aria-label={t("bankSearchPlaceholder")}
            />
            <button
              type="button"
              className={styles.refresh}
              onClick={() => void load()}
              aria-label={t("bankRetry")}
              title={t("bankRetry")}
            >
              <RefreshCw size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </section>

      {state === "loading" && (
        <p className={`igm-mono ${styles.state}`}>{t("bankLoading")}</p>
      )}

      {state === "error" && (
        <div className={styles.errorBox}>
          <p className={`igm-mono ${styles.errorText}`}>{message || t("bankError")}</p>
          <button type="button" className={styles.retry} onClick={() => void load()}>
            <RefreshCw size={13} strokeWidth={1.8} />
            {t("bankRetry")}
          </button>
        </div>
      )}

      {state === "ready" && questions.length === 0 && (
        <div className={styles.empty}>
          <FileSearch size={30} strokeWidth={1.4} className={styles.emptyIcon} />
          <p className={`igm-serif ${styles.emptyText}`}>{t("bankEmpty")}</p>
        </div>
      )}

      {state === "ready" && questions.length > 0 && visible.length === 0 && (
        <div className={styles.noResult}>
          <Search size={26} strokeWidth={1.4} className={styles.noResultIcon} />
          <p className={`igm-serif ${styles.noResultText}`}>{t("bankNoResult")}</p>
        </div>
      )}

      {state === "ready" && visible.length > 0 && (
        <div className={styles.grid}>
          {visible.map((item, index) => (
            <Link
              key={item.id}
              href={`/bank/detail?questionId=${encodeURIComponent(item.id)}`}
              className={styles.card}
              style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
            >
              <div className={styles.cardTop}>
                <span className={`igm-mono ${styles.cardTextbook}`}>
                  {item.textbookName || iGM_QuestionTextbookName(item.textbookCode)}
                </span>
                <ArrowUpRight size={15} strokeWidth={1.7} className={styles.cardArrow} />
              </div>
              <h3 className={`igm-serif ${styles.cardStem}`}>
                {iGM_Question_Excerpt(item.stem)}
              </h3>
              <div className={styles.cardMeta}>
                <span className={`igm-mono ${styles.metaTag}`}>
                  {iGM_Question_TypeKeys[item.type]
                    ? t(iGM_Question_TypeKeys[item.type])
                    : item.type}
                </span>
                <span className={`igm-mono ${styles.metaTag}`}>
                  {iGM_Question_Level(item.difficultyLevel, t)}
                </span>
              </div>
              {Array.isArray(item.tags) && item.tags.length > 0 && (
                <div className={styles.tagRow}>
                  {item.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className={`igm-mono ${styles.tag}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

// 导出 //
export default E_QuestionBank;
