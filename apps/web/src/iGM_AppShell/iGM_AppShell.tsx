/**
 * 文件路径：apps/web/src/iGM_AppShell/iGM_AppShell.tsx
 * 所属层：前端 / 应用骨架层
 * 路由：全局
 * 模块：iGM_AppShell
 * 作用：控制台页面布局骨架，组合侧边导航栏、顶部栏、内容区与页脚
 * 响应式：桌面端侧边栏常驻，平板端图标栏，移动端抽屉加遮罩关闭
 * 内容：根路径 / 为独立门户落地页（自带导航页脚），豁免控制台外壳；
 *       其余路由渲染抽屉开关状态、遮罩层、主内容列布局
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { iGM_IsLandingPath } from "../iGM_i18n/iGM_LocalePath";
import { iGM_Sidebar as IGM_Sidebar } from "./iGM_Sidebar/iGM_Sidebar";
import { iGM_TopBar as IGM_TopBar } from "./iGM_TopBar/iGM_TopBar";
import { iGM_Footer as IGM_Footer } from "../iGM_Components/iGM_Footer/iGM_Footer";
import styles from "./iGM_AppShell.module.css";

// 类型定义 //
interface iGM_AppShellProps {
  children: ReactNode;
}

// 核心逻辑 //
/** 控制台骨架（大写别名供 JSX 使用）：侧边栏 + 顶栏 + 内容区 + 页脚 */
const IGM_ConsoleShell = function iGM_ConsoleShell({
  children,
}: iGM_AppShellProps) {
  // 移动端抽屉开关状态（桌面端布局不受此状态影响）
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 抽屉打开时锁定背景滚动
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className={styles.shell}>
      <IGM_Sidebar open={drawerOpen} onNavigate={() => setDrawerOpen(false)} />

      {/* 移动端遮罩：点击关闭抽屉，平板与桌面不显示 */}
      {drawerOpen && (
        <div
          className={styles.mask}
          aria-hidden
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className={styles.column}>
        <IGM_TopBar onOpenMenu={() => setDrawerOpen(true)} />
        <main className={styles.main}>{children}</main>
        <IGM_Footer />
      </div>
    </div>
  );
};

/** 应用骨架：门户落地页（/ 与 /{locale}）豁免控制台外壳，其余路由挂载控制台骨架 */
export function iGM_AppShell({ children }: iGM_AppShellProps) {
  const pathname = usePathname();

  // 落地页是控制台之前的门户页，自带导航与页脚，不挂载控制台骨架
  if (iGM_IsLandingPath(pathname)) {
    return <>{children}</>;
  }

  return <IGM_ConsoleShell>{children}</IGM_ConsoleShell>;
}

// 导出 //
export default iGM_AppShell;
