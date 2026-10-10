/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_StampButton/iGM_StampButton.tsx
 * 所属层：前端 / 通用组件层
 * 路由：E_ExamDetail（/detail）
 * 模块：iGM_StampButton
 * 作用：交卷按钮，点击后模拟"盖印章"效果，朱砂红印记落下并记录交卷
 * 内容：按钮、盖章动效、已完成印记、提交中与错误态
 * 说明：盖章动效为纯 CSS 关键帧；提交成功后显示固定印记不可重复交卷；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { iGM_Exam_Submit, iGM_ExamRequestError } from "../../iGM_Services/iGM_ExamClient";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import styles from "./iGM_StampButton.module.css";

// 类型定义 //
interface iGM_StampButtonProps {
  /** 试卷 ID */
  examId: string;
  /** 交卷成功回调 */
  onSubmitted?: () => void;
}

type iGM_Exam_StampPhase = "idle" | "stamping" | "done";

// 核心逻辑 //
/** 盖章交卷按钮 */
export function iGM_StampButton({ examId, onSubmitted }: iGM_StampButtonProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<iGM_Exam_StampPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    if (phase !== "idle") return;
    setError(null);
    setPhase("stamping");
    try {
      await iGM_Exam_Submit(examId);
      // 盖印动效播放完成后落到"已完成"
      window.setTimeout(() => {
        setPhase("done");
        onSubmitted?.();
      }, 620);
    } catch (err) {
      setPhase("idle");
      setError(
        err instanceof iGM_ExamRequestError ? err.message : t("stampError"),
      );
    }
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.button} ${phase === "done" ? styles.done : ""}`}
        onClick={handleSubmit}
        disabled={phase !== "idle"}
      >
        <span className={`igm-mono ${styles.label}`}>
          {phase === "done" ? t("stampSubmitted") : t("stampSubmit")}
        </span>

        {/* 盖章印记层 */}
        {(phase === "stamping" || phase === "done") && (
          <span className={`igm-mono ${styles.mark}`} aria-hidden>
            <span className={styles.markText}>iG&amp;M</span>
            <span className={styles.markDate}>EXAM</span>
          </span>
        )}
      </button>

      {error && <p className={`igm-mono ${styles.error}`}>{error}</p>}
      {phase === "done" && !error && (
        <p className={`igm-mono ${styles.note}`}>{t("stampNote")}</p>
      )}
    </div>
  );
}

// 导出 //
export default iGM_StampButton;
