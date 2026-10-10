/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamCard/iGM_ExamCard.tsx
 * 所属层：前端 / 通用组件层
 * 路由：E_ExamList（/）
 * 模块：iGM_ExamCard
 * 作用：试卷档案卡片，模拟纸质档案卡（编号、标题、科目、命题方、时长、总分、题数、印章位）
 * 内容：档案编号条、标题、元数据刻度表、右下角印章位、抽出式淡入动效
 * 说明：卡片为链接容器，点击进入试卷详情；字段名与单位取自当前语言包
 */

// 导入依赖 //
"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { iGM_ExamListItem } from "../../iGM_Services/iGM_ExamClient";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import styles from "./iGM_ExamCard.module.css";

// 类型定义 //
interface iGM_ExamCardProps {
  /** 试卷列表项 */
  exam: iGM_ExamListItem;
  /** 卡片入场动画延迟序号（用于依次抽出） */
  index?: number;
}

/** 元数据刻度条目 */
interface iGM_Exam_CardMeta {
  label: string;
  value: string;
}

// 核心逻辑 //
/** 数值缺省占位 */
function iGM_Exam_Dash(value: number | null, suffix = ""): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value}${suffix}`;
}

/** 档案卡片 */
export function iGM_ExamCard({ exam, index = 0 }: iGM_ExamCardProps) {
  const { t } = useI18n();
  const meta: iGM_Exam_CardMeta[] = [
    { label: t("cardDuration"), value: iGM_Exam_Dash(exam.duration, t("unitMinutes")) },
    { label: t("cardTotal"), value: iGM_Exam_Dash(exam.totalScore, t("unitPoints")) },
    { label: t("cardItems"), value: iGM_Exam_Dash(exam.questionCount) },
  ];

  return (
    <Link
      href={`/detail?id=${encodeURIComponent(exam.id)}`}
      className={styles.card}
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
    >
      {/* 档案编号条 */}
      <div className={styles.codeRow}>
        <span className={`igm-mono ${styles.code}`}>{exam.code}</span>
        <ArrowUpRight size={15} strokeWidth={1.7} className={styles.arrow} />
      </div>

      {/* 标题与科目 */}
      <h3 className={`igm-serif ${styles.title}`}>{exam.title}</h3>
      <p className={`igm-mono ${styles.subject}`}>{exam.subject || "—"}</p>

      {/* 元数据刻度表 */}
      <dl className={styles.metaGrid}>
        {meta.map((item) => (
          <div key={item.label} className={styles.metaCell}>
            <dt className={`igm-mono ${styles.metaLabel}`}>{item.label}</dt>
            <dd className={`igm-mono ${styles.metaValue}`}>{item.value}</dd>
          </div>
        ))}
      </dl>

      {/* 命题方 + 印章位 */}
      <div className={styles.footRow}>
        <span className={styles.issuer} title={exam.issuer}>
          {exam.issuer || "—"}
        </span>
        <span className={`igm-stamp ${styles.stamp}`}>iG&amp;M</span>
      </div>
    </Link>
  );
}

// 导出 //
export default iGM_ExamCard;
