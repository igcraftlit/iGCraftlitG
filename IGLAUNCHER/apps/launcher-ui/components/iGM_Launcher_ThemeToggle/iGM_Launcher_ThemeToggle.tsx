/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_ThemeToggle/iGM_Launcher_ThemeToggle.tsx
 * 所属层：前端 / 主题切换层
 * 路由：全局（TopBar）
 * 模块：iGM_Launcher_ThemeToggle
 * 作用：在浅色 / 深色之间快速切换（默认主题由 next-themes 跟随系统）
 * 内容：挂载前不渲染图标，避免静态首帧与客户端主题不一致
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./iGM_Launcher_ThemeToggle.module.css";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
export function iGM_Launcher_ThemeToggle() {
  const t = useTranslations("common");
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      className={styles.iconButton}
      title={isDark ? t("light") : t("dark")}
      aria-label="toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <Sun size={16} strokeWidth={1.8} />
      ) : (
        <Moon size={16} strokeWidth={1.8} />
      )}
      <span className={styles.modeHint}>{isDark ? t("light") : t("dark")}</span>
    </button>
  );
}

// 导出 //
export default iGM_Launcher_ThemeToggle;
