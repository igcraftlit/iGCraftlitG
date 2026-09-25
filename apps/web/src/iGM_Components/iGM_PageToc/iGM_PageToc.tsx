/**
 * 文件路径：apps/web/src/iGM_Components/iGM_PageToc/iGM_PageToc.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（模块八规定页与注册阅读弹窗）
 * 模块：iGM_PageToc
 * 作用：页面右侧目录（Table of Contents），极简无图标排版
 * 内容：ON THIS PAGE 标题、层级缩进、当前章节左侧竖线高亮、
 *       Scroll Spy 滚动跟随、点击平滑滚动；
 *       rail 为桌面右侧竖排，top 为平板顶部横向折叠
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import styles from "./iGM_PageToc.module.css";

// 类型定义 //
export interface iGM_TocItem {
  /** 目标章节元素 id */
  id: string;
  /** 目录文案 */
  label: string;
  /** 1 主章节顶格；2 子章节缩进 */
  level: 1 | 2;
}

interface iGM_PageTocProps {
  /** 目录条目（顺序即章节顺序） */
  items: iGM_TocItem[];
  /** 滚动根元素；不传表示 window 视口（独立页使用） */
  scrollRef?: RefObject<HTMLElement | null>;
  /** 顶部小标题，默认 ON THIS PAGE */
  title?: string;
  /** rail：桌面右侧竖排常驻；top：窄屏顶部横向折叠 */
  variant?: "rail" | "top";
  /** 高亮判定线距滚动根顶部的偏移，默认视口 84 / 容器 24 */
  offset?: number;
}

// 核心逻辑 //
/** 右侧目录导航：Scroll Spy + 平滑滚动 + 竖线高亮 */
export function iGM_PageToc({
  items,
  scrollRef,
  title = "ON THIS PAGE",
  variant = "rail",
  offset,
}: iGM_PageTocProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const frameRef = useRef<number | null>(null);

  /** 按滚动位置计算当前章节（最后一个越过判定线的章节） */
  const iGM_UpdateActive = useCallback(() => {
    if (items.length === 0) return;
    const root = scrollRef?.current ?? null;
    const triggerOffset = offset ?? (root ? 24 : 84);
    const scrollTop = root ? root.scrollTop : window.scrollY;

    let current = items[0].id;
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (!el) continue;
      const top = root
        ? el.getBoundingClientRect().top -
          root.getBoundingClientRect().top +
          root.scrollTop
        : el.getBoundingClientRect().top + window.scrollY;
      if (top - triggerOffset <= scrollTop) current = item.id;
    }

    // 滚动到底部时强制高亮末项（短章节也能到达 Q4 等末尾锚点）
    const reachedEnd = root
      ? root.scrollTop + root.clientHeight >= root.scrollHeight - 6
      : window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 6;
    if (reachedEnd) current = items[items.length - 1].id;

    setActiveId(current);
  }, [items, scrollRef, offset]);

  /** rAF 节流，避免滚动高频回调 */
  const iGM_ScheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      iGM_UpdateActive();
    });
  }, [iGM_UpdateActive]);

  useEffect(() => {
    const target: HTMLElement | Window = scrollRef?.current ?? window;
    target.addEventListener("scroll", iGM_ScheduleUpdate, { passive: true });
    window.addEventListener("resize", iGM_ScheduleUpdate);
    iGM_UpdateActive();
    return () => {
      target.removeEventListener("scroll", iGM_ScheduleUpdate);
      window.removeEventListener("resize", iGM_ScheduleUpdate);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [scrollRef, iGM_ScheduleUpdate, iGM_UpdateActive]);

  /** 点击目录：容器内手动平滑滚动，视口下 scrollIntoView */
  function iGM_ScrollToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const root = scrollRef?.current ?? null;
    if (root) {
      const top =
        el.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop -
        12;
      root.scrollTo({ top, behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setActiveId(id);
  }

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
              onClick={() => iGM_ScrollToSection(item.id)}
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
export default iGM_PageToc;
