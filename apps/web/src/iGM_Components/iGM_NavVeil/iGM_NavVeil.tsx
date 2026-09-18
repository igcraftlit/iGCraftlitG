/**
 * 文件路径：apps/web/src/iGM_Components/iGM_NavVeil/iGM_NavVeil.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（根布局挂载，覆盖控制台与落地页）
 * 模块：iGM_NavVeil
 * 作用：路由切换瞬间的幕布擦除转场：新页面在幕布之后完成交换，
 *       幕布再自上而下扫出，配合 template 入场动画实现完整转场
 * 内容：pathname 变化驱动（链接跳转 / router 跳转 / 前进后退均生效），
 *       useLayoutEffect 在浏览器绘制前覆盖，零闪帧；
 *       仅 hash / 查询参数变化不触发；prefers-reduced-motion 时不渲染
 */

// 导入依赖 //
"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import styles from "./iGM_NavVeil.module.css";

// 类型定义 //
/** idle：幕布位于视口上方待命；cover：完全覆盖（无过渡，绘制前到位）；retreat：向下扫出 */
type iGM_VeilPhase = "idle" | "cover" | "retreat";

// 核心逻辑 //
/** 路由转场幕布 */
export function iGM_NavVeil() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<iGM_VeilPhase>("idle");
  const [reduced, setReduced] = useState(false);

  // 首次挂载标记：站点初次进入不播放擦除（落地页自身有 Hero 拉出动画）
  const firstRun = useRef(true);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 降低动态偏好：直接禁用幕布
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    if (reduced) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }

    // 第一步：绘制前同步覆盖，遮蔽新旧页面交换，避免闪帧
    setPhase("cover");

    // 第二步：两帧后启动向下扫出（首帧确立覆盖态，次帧才能触发过渡）
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setPhase("retreat"));
    });

    // 兜底：transitionend 未触发时按时复位
    timerRef.current = setTimeout(() => setPhase("idle"), 620);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [pathname, reduced]);

  if (reduced) return null;

  return (
    <div
      className={`${styles.veil} ${
        phase === "cover"
          ? styles.cover
          : phase === "retreat"
            ? styles.retreat
            : ""
      }`}
      aria-hidden
      onTransitionEnd={(event) => {
        if (event.propertyName === "transform" && phase === "retreat") {
          setPhase("idle");
        }
      }}
    >
      {/* 幕布前沿：强调色细线 + 柔和投影，随扫出方向移动 */}
      <span className={styles.edge} />
    </div>
  );
}

// 导出 //
export default iGM_NavVeil;
