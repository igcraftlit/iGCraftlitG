/**
 * 文件路径：apps/exam/src/iGM_Pages/E_ExamList.tsx
 * 所属层：前端 / 页面层
 * 路由：E_ExamList（/）
 * 模块：iGM_ExamList
 * 作用：已发布试卷索引页，学术期刊刊头 + 档案卡索引
 * 内容：刊头引言、统计带、试卷档案卡片网格、加载 / 失败 / 空状态
 * 说明：纯静态导出，数据由客户端在挂载后从后端获取
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSearch, RefreshCw } from "lucide-react";
import {
  iGM_Exam_FetchList,
  iGM_ExamRequestError,
  type iGM_ExamListItem,
} from "../iGM_Services/iGM_ExamClient";
import { iGM_ExamCard as IGM_ExamCard } from "../iGM_Components/iGM_ExamCard/iGM_ExamCard";
import styles from "./E_ExamList.module.css";

// 类型定义 //
type iGM_Exam_LoadState = "loading" | "ready" | "error";

// 核心逻辑 //
/** 试卷索引页 */
export function E_ExamList() {
  const [exams, setExams] = useState<iGM_ExamListItem[]>([]);
  const [state, setState] = useState<iGM_Exam_LoadState>("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setMessage("");
    try {
      const list = await iGM_Exam_FetchList();
      setExams(list);
      setState("ready");
    } catch (err) {
      setMessage(
        err instanceof iGM_ExamRequestError
          ? err.message
          : "Unable to load examinations.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalItems = exams.reduce((sum, e) => sum + (e.questionCount ?? 0), 0);

  return (
    <main className={styles.page}>
      {/* 引言：期刊论文摘要风 */}
      <section className={styles.intro}>
        <p className={`igm-eyebrow ${styles.introEyebrow}`}>
          ACADEMIC ASSESSMENT ARCHIVE
        </p>
        <h1 className={`igm-serif ${styles.introTitle}`}>
          Examination Catalogue
        </h1>
        <p className={styles.introLead}>
          A curated index of published assessment papers. Each entry is
          catalogued with its subject, issuing authority, allotted duration and
          total marks for review.
        </p>
      </section>

      {/* 统计带 */}
      <section className={`igm-double-rule ${styles.statBand}`} aria-label="Catalogue summary">
        <div className={styles.stat}>
          <span className={`igm-mono ${styles.statValue}`}>
            {String(exams.length).padStart(3, "0")}
          </span>
          <span className={`igm-mono ${styles.statLabel}`}>PAPERS INDEXED</span>
        </div>
        <div className={styles.stat}>
          <span className={`igm-mono ${styles.statValue}`}>
            {String(totalItems).padStart(3, "0")}
          </span>
          <span className={`igm-mono ${styles.statLabel}`}>ITEMS TOTAL</span>
        </div>
        <div className={styles.stat}>
          <span className={`igm-mono ${styles.statValue}`}>VOL. I</span>
          <span className={`igm-mono ${styles.statLabel}`}>CURRENT VOLUME</span>
        </div>
      </section>

      {/* 卡片索引 */}
      <section className={styles.index} aria-label="Examination index">
        <header className={styles.indexHead}>
          <span className={`igm-mono ${styles.indexNum}`}>§ 1</span>
          <h2 className={`igm-serif ${styles.indexTitle}`}>Index of Papers</h2>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void load()}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={14} strokeWidth={1.8} />
          </button>
        </header>

        {state === "loading" && (
          <p className={`igm-mono ${styles.state}`}>RETRIEVING ARCHIVE…</p>
        )}

        {state === "error" && (
          <div className={styles.errorBox}>
            <p className={`igm-mono ${styles.errorText}`}>{message}</p>
            <button type="button" className={styles.retry} onClick={() => void load()}>
              <RefreshCw size={13} strokeWidth={1.8} />
              Retry
            </button>
          </div>
        )}

        {state === "ready" && exams.length === 0 && (
          <div className={styles.empty}>
            <FileSearch size={30} strokeWidth={1.4} className={styles.emptyIcon} />
            <p className={`igm-serif ${styles.emptyText}`}>
              No published examinations available.
            </p>
          </div>
        )}

        {state === "ready" && exams.length > 0 && (
          <div className={styles.grid}>
            {exams.map((exam, index) => (
              <IGM_ExamCard key={exam.id} exam={exam} index={index} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

// 导出 //
export default E_ExamList;
