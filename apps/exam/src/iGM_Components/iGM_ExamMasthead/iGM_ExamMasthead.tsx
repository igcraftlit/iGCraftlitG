/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamMasthead/iGM_ExamMasthead.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局
 * 模块：iGM_ExamMasthead
 * 作用：顶部横向学术期刊刊头导航（刊名 + 卷期 + 日期 + 索引/管理入口）
 * 内容：卷期与日期元信息、居中机构名、副标题、横向导航、主题摇杆与语言切换
 * 说明：刊头日期在客户端挂载后按本地时间刷新，并按当前语言格式化，
 *       首屏使用构建期日期，避免水合不一致
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { iGM_ExamThemeToggle as IGM_ExamThemeToggle } from "../iGM_ExamThemeToggle/iGM_ExamThemeToggle";
import { iGM_ExamLangToggle as IGM_ExamLangToggle } from "../iGM_ExamLangToggle/iGM_ExamLangToggle";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import styles from "./iGM_ExamMasthead.module.css";

// 类型定义 //
interface iGM_ExamMastheadProps {
  /** 刊头基准日期（缺省时按构建期日期渲染） */
  initialDate?: Date;
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

/** 构建期日期（环境变量注入），水合前后一致 */
const iGM_Exam_BuildDate = new Date(
  process.env.NEXT_PUBLIC_IGM_EXAM_BUILD_TIME || Date.now(),
);

/** 导航项路由（文案由当前语言包提供） */
const iGM_Exam_NavRoutes = [
  { href: "/", labelKey: "navExaminations" },
  { href: "/admin", labelKey: "navAdmin" },
] as const;

/** 学术期刊刊头 */
export function iGM_ExamMasthead({ initialDate }: iGM_ExamMastheadProps) {
  const pathname = usePathname();
  const { t, formatDate } = useI18n();
  const [baseDate, setBaseDate] = useState<Date>(initialDate ?? iGM_Exam_BuildDate);

  useEffect(() => {
    setBaseDate(new Date());
  }, []);

  const volume = iGM_Exam_ToRoman(baseDate.getFullYear() - 2025);
  const issue = String(baseDate.getMonth() + 1).padStart(2, "0");

  return (
    <header className={styles.masthead}>
      <div className={styles.inner}>
        {/* 元信息行：卷期 + 主题摇杆 + 语言切换 */}
        <div className={styles.metaRow}>
          <span className={`igm-mono ${styles.volIssue}`}>
            {t("mastheadMeta", { volume, issue })}
          </span>
          <div className={styles.controls}>
            <IGM_ExamThemeToggle />
            <IGM_ExamLangToggle />
          </div>
        </div>

        {/* 刊名（机构名） */}
        <div className={styles.titleRow}>
          <Link href="/" className={styles.titleLink}>
            <GraduationCap size={26} strokeWidth={1.5} className={styles.mark} />
            <span className={`igm-serif ${styles.title}`}>{t("instituteName")}</span>
          </Link>
          <p className={`igm-mono ${styles.subtitle}`}>{t("mastheadSubtitle")}</p>
        </div>

        {/* 横向导航 + 日期 */}
        <nav className={styles.navRow} aria-label="Primary">
          <ul className={styles.navList}>
            {iGM_Exam_NavRoutes.map((item) => {
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
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
          <span className={`igm-mono ${styles.date}`}>{formatDate(baseDate)}</span>
        </nav>
      </div>
    </header>
  );
}

// 导出 //
export default iGM_ExamMasthead;
