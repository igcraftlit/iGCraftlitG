/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_ThemeToggle/iGM_CLI_ThemeToggle.tsx
 * 所属层：前端 / 组件层
 * 路由：全局（站点头部）
 * 模块：iGM_CLI_Downloader
 * 作用：明暗主题切换按钮——读取 html[data-theme]，点击在 light/dark 间切换并持久化
 * 内容：localStorage 键 iGM_CLI_THEME，与根布局防 FOUC 初始化脚本保持一致；
 *       图标使用 lucide-react（Sun / Moon），无 emoji
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./iGM_CLI_ThemeToggle.module.css";

// 类型定义 //
type iGM_CLI_Theme = "light" | "dark";

/** 主题持久化键：与 app/layout.tsx 的防 FOUC 脚本一致 */
const iGM_CLI_ThemeStorageKey = "iGM_CLI_THEME";

// 核心逻辑 //
/** 读取当前已生效主题（首屏由 beforeInteractive 脚本写入 data-theme） */
function iGM_CLI_ReadResolvedTheme(): iGM_CLI_Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** 明暗主题切换按钮 */
export function iGM_CLI_ThemeToggle() {
  const t = useTranslations();
  const [theme, setTheme] = useState<iGM_CLI_Theme>("light");

  /* 挂载后同步一次真实主题，避免服务端/客户端首帧不一致 */
  useEffect(() => {
    setTheme(iGM_CLI_ReadResolvedTheme());
  }, []);

  /* 跟随系统主题变化（仅当用户未显式选择时） */
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      const stored = localStorage.getItem(iGM_CLI_ThemeStorageKey);
      if (stored !== "light" && stored !== "dark") {
        setTheme(event.matches ? "dark" : "light");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  /** 点击切换：写入 data-theme、colorScheme 与 localStorage */
  function iGM_CLI_ToggleTheme() {
    const next: iGM_CLI_Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.style.colorScheme = next;
    localStorage.setItem(iGM_CLI_ThemeStorageKey, next);
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={t("common.themeToggle")}
      title={t("common.themeToggle")}
      onClick={iGM_CLI_ToggleTheme}
    >
      {theme === "dark" ? (
        <Sun size={17} aria-hidden />
      ) : (
        <Moon size={17} aria-hidden />
      )}
    </button>
  );
}

// 导出 //
export default iGM_CLI_ThemeToggle;
