/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_DocToc/iGM_LauncherDl_DocToc.tsx
 * 所属层：前端 / 组件层
 * 路由：/docs、/docs/install、/docs/faq 全部文档页
 * 模块：iGM_LauncherDl_Downloader
 * 作用：文档右侧目录（Table of Contents），ON THIS PAGE 样式
 * 内容：大写小标题、层级缩进、当前章节左侧竖线高亮（无背景色）、
 *       Scroll Spy 滚动跟随（rAF 节流）、点击平滑滚动、滚到底强制末项高亮；
 *       rail 为桌面右侧竖排常驻，top 为平板/移动端顶部横向胶囊条
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./iGM_LauncherDl_DocToc.module.css";

// 类型定义 //
export interface iGM_LauncherDl_TocItem {
  /** 目标章节元素 id */
  id: string;
  /** 目录文案 */
  label: string;
  /** 1 主章节顶格；2 子章节缩进 */
  level: 1 | 2;
}

interface iGM_LauncherDl_DocTocProps {
  /** 目录条目（顺序即章节顺序） */
  items: iGM_LauncherDl_TocItem[];
  /** 顶部小标题，默认 ON THIS PAGE */
  title?: string;
  /** rail：桌面右侧竖排常驻；top：窄屏顶部横向折叠 */
  variant?: "rail" | "top";
  /** 高亮判定线距视口顶部的偏移（避让 60px 吸顶头部），默认 84 */
  offset?: number;
}

// 核心逻辑 //
/** 右侧目录导航：Scroll Spy + 平滑滚动 + 竖线高亮 */
export function iGM_LauncherDl_DocToc({
  items,
  title = "ON THIS PAGE",
  variant = "rail",
  offset = 84,
}: iGM_LauncherDl_DocTocProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const frameRef = useRef<number | null>(null);

  /** 按滚动位置计算当前章节（最后一个越过判定线的章节） */
  const iGM_LauncherDl_UpdateActive = useCallback(() => {
    if (items.length === 0) return;
    let current = items[0].id;
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (!el) continue;
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (top - offset <= window.scrollY) current = item.id;
    }

    // 滚动到底部时强制高亮末项（短章节也能到达末尾锚点）
    const reachedEnd =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 6;
    if (reachedEnd) current = items[items.length - 1].id;

    setActiveId(current);
  }, [items, offset]);

  /** rAF 节流，避免滚动高频回调 */
  const iGM_LauncherDl_ScheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      iGM_LauncherDl_UpdateActive();
    });
  }, [iGM_LauncherDl_UpdateActive]);

  useEffect(() => {
    window.addEventListener("scroll", iGM_LauncherDl_ScheduleUpdate, {
      passive: true,
    });
    window.addEventListener("resize", iGM_LauncherDl_ScheduleUpdate);
    iGM_LauncherDl_UpdateActive();
    return () => {
      window.removeEventListener("scroll", iGM_LauncherDl_ScheduleUpdate);
      window.removeEventListener("resize", iGM_LauncherDl_ScheduleUpdate);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [iGM_LauncherDl_ScheduleUpdate, iGM_LauncherDl_UpdateActive]);

  /** 点击目录：平滑滚动到对应章节（scroll-margin-top 负责避让吸顶头部） */
  function iGM_LauncherDl_ScrollToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  }

  if (items.length === 0) return null;

  return (
    <nav
      className={variant === "top" ? styles.top : styles.rail}
      aria-label={title}
    >
      <p className={styles.title}>{title}</p>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={[
                styles.link,
                item.level === 2 ? styles.level2 : "",
                activeId === item.id ? styles.active : "",
              ].join(" ")}
              aria-current={activeId === item.id ? "true" : undefined}
              onClick={() => iGM_LauncherDl_ScrollToSection(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// 导出 //
export default iGM_LauncherDl_DocToc;