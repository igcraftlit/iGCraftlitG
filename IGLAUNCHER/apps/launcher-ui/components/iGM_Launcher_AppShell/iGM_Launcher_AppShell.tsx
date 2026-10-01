/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell.tsx
 * 所属层：前端 / 应用骨架层
 * 路由：全局
 * 模块：iGM_Launcher_AppShell
 * 作用：启动器整体布局骨架（TopBar + Sidebar + 内容区 + StatusBar）
 * 内容：CSS Grid 固定四区；侧边栏折叠状态持久化，并随窗口宽度自动收敛；
 *       内容区顶部渲染操作反馈提示条；
 *       持有 SPA 当前页面状态并提供给侧边栏与内容区（打包态 views:// 不解析目录路由）
 */

// 导入依赖 //
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IGM_LAUNCHER_MIN_SIZE } from "@igm-launcher/shared";
import {
  IGM_LAUNCHER_PAGE_ANCHORS,
  type iGM_Launcher_PageId,
  type iGM_Launcher_PageParams,
} from "@/components/iGM_Launcher_Pages/iGM_Launcher_PageRegistry";
import { iGM_Launcher_TopBar as IGM_Launcher_TopBar } from "@/components/iGM_Launcher_TopBar/iGM_Launcher_TopBar";
import { iGM_Launcher_Sidebar as IGM_Launcher_Sidebar } from "@/components/iGM_Launcher_Sidebar/iGM_Launcher_Sidebar";
import { iGM_Launcher_StatusBar as IGM_Launcher_StatusBar } from "@/components/iGM_Launcher_StatusBar/iGM_Launcher_StatusBar";
import { iGM_Launcher_NoticeBar as IGM_Launcher_NoticeBar } from "@/components/iGM_Launcher_Notice/iGM_Launcher_NoticeBar";
import styles from "./iGM_Launcher_AppShell.module.css";

// 类型定义 //
interface iGM_Launcher_ShellLayoutValue {
  /** 侧边栏是否折叠为图标轨 */
  collapsed: boolean;
  /** 切换侧边栏折叠状态 */
  toggleCollapsed: () => void;
  /** 当前激活的 SPA 页面 */
  pageId: iGM_Launcher_PageId;
  /** 当前页面的附加参数（如实例编辑页的实例 id） */
  params: iGM_Launcher_PageParams;
  /** 切换 SPA 页面（纯客户端重渲染，无导航请求），params 缺省时清空 */
  setPageId: (pageId: iGM_Launcher_PageId) => void;
  /** 带参数切页，供实例编辑页等使用 */
  navigate: (pageId: iGM_Launcher_PageId, params?: iGM_Launcher_PageParams) => void;
}

const IGM_COLLAPSE_STORAGE_KEY = "iGM_Launcher_SidebarCollapsed";

const iGM_Launcher_ShellLayoutContext =
  createContext<iGM_Launcher_ShellLayoutValue>({
    collapsed: false,
    toggleCollapsed: () => undefined,
    pageId: "home",
    params: {},
    setPageId: () => undefined,
    navigate: () => undefined,
  });

// 核心逻辑 //
export function iGM_Launcher_AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [pageId, setPageIdState] = useState<iGM_Launcher_PageId>("home");
  const [params, setParams] = useState<iGM_Launcher_PageParams>({});
  const contentRef = useRef<HTMLElement>(null);

  // 挂载后恢复折叠偏好；无偏好时按窗口初始宽度决定
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(IGM_COLLAPSE_STORAGE_KEY);
    } catch {
      // 忽略读取失败
    }
    if (stored === "1") {
      setCollapsed(true);
    } else if (stored === "0") {
      setCollapsed(false);
    } else {
      setCollapsed(window.innerWidth < IGM_LAUNCHER_MIN_SIZE.width);
    }
  }, []);

  // 窗口缩放越过阈值时自动折叠 / 展开
  useEffect(() => {
    const onResize = () => {
      const shouldCollapse = window.innerWidth < IGM_LAUNCHER_MIN_SIZE.width;
      setCollapsed((current) => (current !== shouldCollapse ? shouldCollapse : current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(IGM_COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // 忽略写入失败
      }
      return next;
    });
  }, []);

  const setPageId = useCallback((next: iGM_Launcher_PageId) => {
    setPageIdState(next);
    setParams({});
  }, []);

  const navigate = useCallback(
    (next: iGM_Launcher_PageId, nextParams?: iGM_Launcher_PageParams) => {
      setPageIdState(next);
      setParams(nextParams ?? {});
    },
    [],
  );

  // 切页后内容区回到顶部；带锚点的页面（关于）改为滚动定位到对应分组
  useEffect(() => {
    const anchor = IGM_LAUNCHER_PAGE_ANCHORS[pageId];
    if (anchor) {
      const timer = window.setTimeout(() => {
        document.getElementById(anchor)?.scrollIntoView({ block: "start" });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    contentRef.current?.scrollTo({ top: 0 });
  }, [pageId]);

  const layoutValue = useMemo<iGM_Launcher_ShellLayoutValue>(
    () => ({ collapsed, toggleCollapsed, pageId, params, setPageId, navigate }),
    [collapsed, toggleCollapsed, pageId, params, setPageId, navigate],
  );

  return (
    <iGM_Launcher_ShellLayoutContext.Provider value={layoutValue}>
      <div className={`${styles.shell} ${collapsed ? styles.shellRail : ""}`}>
        <IGM_Launcher_TopBar />
        <IGM_Launcher_Sidebar />
        <main ref={contentRef} className={`${styles.content} igm-scroll`}>
          <IGM_Launcher_NoticeBar />
          {children}
        </main>
        <IGM_Launcher_StatusBar />
      </div>
    </iGM_Launcher_ShellLayoutContext.Provider>
  );
}

/** 读取侧边栏折叠上下文 */
export function iGM_Launcher_UseShellLayout(): iGM_Launcher_ShellLayoutValue {
  return useContext(iGM_Launcher_ShellLayoutContext);
}

// 导出 //
export default iGM_Launcher_AppShell;