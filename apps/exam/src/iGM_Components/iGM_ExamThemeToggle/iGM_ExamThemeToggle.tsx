/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamThemeToggle/iGM_ExamThemeToggle.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局
 * 模块：iGM_ExamThemeToggle
 * 作用：学术仪器风格的明暗模式摇杆开关（区别于主站的按钮式切换）
 * 内容：LIGHT / DARK 两档分段开关、刻度装饰、读写 localStorage 与 data-theme
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import styles from "./iGM_ExamThemeToggle.module.css";

// 类型定义 //
type iGM_Exam_Theme = "light" | "dark";

// 核心逻辑 //
const iGM_Exam_StorageKey = "iGM_Exam_Theme";

/** 读取当前主题：优先 localStorage，其次系统偏好 */
function iGM_Exam_ReadTheme(): iGM_Exam_Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** 明暗模式摇杆开关 */
export function iGM_ExamThemeToggle() {
  const [theme, setTheme] = useState<iGM_Exam_Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(iGM_Exam_ReadTheme());
    setMounted(true);
  }, []);

  function iGM_Exam_Apply(next: iGM_Exam_Theme): void {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(iGM_Exam_StorageKey, next);
    } catch {
      // 隐私模式下写入失败可忽略
    }
  }

  return (
    <div
      className={styles.rocker}
      role="group"
      aria-label="Colour scheme"
      data-mounted={mounted}
    >
      <span className={styles.ticks} aria-hidden />
      <button
        type="button"
        className={`${styles.stop} ${theme === "light" ? styles.active : ""}`}
        aria-pressed={theme === "light"}
        title="Light"
        onClick={() => iGM_Exam_Apply("light")}
      >
        <Sun size={13} strokeWidth={1.9} />
        <span className={styles.stopLabel}>L</span>
      </button>
      <button
        type="button"
        className={`${styles.stop} ${theme === "dark" ? styles.active : ""}`}
        aria-pressed={theme === "dark"}
        title="Dark"
        onClick={() => iGM_Exam_Apply("dark")}
      >
        <Moon size={13} strokeWidth={1.9} />
        <span className={styles.stopLabel}>D</span>
      </button>
    </div>
  );
}

// 导出 //
export default iGM_ExamThemeToggle;
