/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamMasthead/iGM_ExamMasthead.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局
 * 模块：iGM_ExamMasthead
 * 作用：顶部横向学术期刊刊头导航（刊名 + 卷期 + 日期 + 索引/管理入口）
 * 内容：卷期与日期元信息、居中机构名、EST. 2026 副标题、横向导航、主题摇杆
 * 说明：刊头日期在客户端挂载后按本地时间刷新，首屏使用构建期日期，避免水合不一致
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { iGM_ExamThemeToggle as IGM_ExamThemeToggle } from "../iGM_ExamThemeToggle/iGM_ExamThemeToggle";
import styles from "./iGM_ExamMasthead.module.css";

// 类型定义 //
interface iGM_ExamMastheadProps {
  /** 卷期与日期元信息（缺省时按构建期日期渲染） */
  initialMeta?: iGM_Exam_MastheadMeta;
}

interface iGM_Exam_MastheadMeta {
  volume: string;
  issue: string;
  date: string;
}

// 核心逻辑 //
/** 阿拉伯数字 → 罗马数字（卷号） */
function iGM_Exam_ToRoman(value: number): string {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let rest = value;
  let out = "";
  for (const [num, sym] of table) {
    while (rest >= num) {
      out += sym;
      rest -= num;
    }
  }
  return out;
}

const iGM_Exam_Months = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** 由日期推导卷期与日期文本 */
function iGM_Exam_BuildMeta(base: Date): iGM_Exam_MastheadMeta {
  return {
    volume: iGM_Exam_ToRoman(base.getFullYear() - 2025),
    issue: String(base.getMonth() + 1).padStart(2, "0"),
    date: `${String(base.getDate()).padStart(2, "0")} ${
      iGM_Exam_Months[base.getMonth()]
    } ${base.getFullYear()}`,
  };
}

/** 构建期日期（环境变量注入），水合前后一致 */
const iGM_Exam_BuildDate = new Date(
  process.env.NEXT_PUBLIC_IGM_EXAM_BUILD_TIME || Date.now(),
);

const iGM_Exam_NavItems = [
  { href: "/", label: "Examinations" },
  { href: "/admin", label: "Administration" },
] as const;

/** 学术期刊刊头 */
export function iGM_ExamMasthead({ initialMeta }: iGM_ExamMastheadProps) {
  const pathname = usePathname();
  const [meta, setMeta] = useState<iGM_Exam_MastheadMeta>(
    initialMeta ?? iGM_Exam_BuildMeta(iGM_Exam_BuildDate),
  );

  useEffect(() => {
    setMeta(iGM_Exam_BuildMeta(new Date()));
  }, []);

  return (
    <header className={styles.masthead}>
      <div className={styles.inner}>
        {/* 元信息行：卷期 + 主题摇杆 */}
        <div className={styles.metaRow}>
          <span className={`igm-mono ${styles.volIssue}`}>
            VOL. {meta.volume} · NO. {meta.issue}
          </span>
          <IGM_ExamThemeToggle />
        </div>

        {/* 刊名（机构名） */}
        <div className={styles.titleRow}>
          <Link href="/" className={styles.titleLink}>
            <GraduationCap size={26} strokeWidth={1.5} className={styles.mark} />
            <span className={`igm-serif ${styles.title}`}>
              iG&amp;M Educational Examination Institute
            </span>
          </Link>
          <p className={`igm-mono ${styles.subtitle}`}>
            EST. 2026 · ACADEMIC ASSESSMENT
          </p>
        </div>

        {/* 横向导航 + 日期 */}
        <nav className={styles.navRow} aria-label="Primary">
          <ul className={styles.navList}>
            {iGM_Exam_NavItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.navActive : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <span className={`igm-mono ${styles.date}`}>{meta.date}</span>
        </nav>
      </div>
    </header>
  );
}

// 导出 //
export default iGM_ExamMasthead;
