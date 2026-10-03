/**
 * 文件路径：apps/web/src/iGM_AppShell/iGM_Sidebar/iGM_Sidebar.tsx
 * 所属层：前端 / 应用骨架层
 * 路由：全局
 * 模块：iGM_Sidebar
 * 作用：左侧树状导航栏，滑动气泡指示当前路由，父节点可展开折叠
 * 响应式：桌面端常驻展开，平板端折叠为图标栏（仅父级入口），移动端抽屉化
 * 内容：按服务类型分区，区内父子层级递归渲染；当前路由所在分支自动展开；
 *       单一半透明气泡（Moving Pill）以 FLIP 思路在活动节点间平滑滑移，
 *       位置于每次绘制后测量节点几何得到，路由切换/展开折叠/断点变化均重算
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { usePathname } from "next/navigation";
import { iGM_StripLocalePrefix } from "../../iGM_i18n/iGM_LocalePath";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import {
  iGM_NavGroups,
  type iGM_NavItem,
} from "../../iGM_Navigation/iGM_NavConfig";
import type { iGM_User } from "../../iGM_Services/iGM_AuthClient";
import { iGM_IsStaffUser } from "../../iGM_Services/iGM_AuthClient";
import { iGM_ApiGetMyDeveloper, iGM_DeveloperConsoleUrl, iGM_ResolveDeveloperEntry } from "../../iGM_Services/iGM_DeveloperClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import styles from "./iGM_Sidebar.module.css";

// 类型定义 //
interface iGM_SidebarProps {
  /** 移动端抽屉是否打开（桌面端不受影响） */
  open: boolean;
  /** 导航跳转后关闭移动端抽屉 */
  onNavigate: () => void;
}

// 核心逻辑 //
/** 判断当前路由是否高亮：首页精确匹配，其余路由按前缀匹配 */
function iGM_IsActive(pathname: string, href: string): boolean {
  if (href === "/G_Home") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 递归判断某节点（含子孙）是否命中当前路由 */
function iGM_BranchActive(pathname: string, item: iGM_NavItem): boolean {
  if (iGM_IsActive(pathname, item.href)) return true;
  return (
    item.children?.some((child) => iGM_BranchActive(pathname, child)) ?? false
  );
}

/**
 * 单个导航项对当前用户是否可见：
 * 角色命中或管理人员身份命中其一即可；组织负责人专属与已入组织隐藏单独判定。
 */
function iGM_CanSeeItem(item: iGM_NavItem, user: iGM_User | null): boolean {
  if (item.roles || item.staffOnly) {
    const roleAllowed = item.roles
      ? user !== null && item.roles.includes(user.role)
      : false;
    const staffAllowed = item.staffOnly ? iGM_IsStaffUser(user) : false;
    if (!roleAllowed && !staffAllowed) return false;
  }
  if (item.orgOwnerOnly && user?.verifiedOrg?.isOwner !== true) {
    return false;
  }
  // 模块二十五：已加入组织（含负责人 / 成员）隐藏申请记录类入口
  if (item.hideForOrgMember && user?.verifiedOrg) {
    return false;
  }
  return true;
}

/** 按角色/负责人身份递归过滤导航项；子项被全部过滤时父节点退化为普通叶子 */
function iGM_FilterItems(
  items: iGM_NavItem[],
  user: iGM_User | null,
): iGM_NavItem[] {
  return items
    .map((item) => {
      if (!item.children) return item;
      const children = iGM_FilterItems(item.children, user);
      return { ...item, children: children.length > 0 ? children : undefined };
    })
    .filter((item) => iGM_CanSeeItem(item, user));
}

/** 侧边导航栏 */
export function iGM_Sidebar({ open, onNavigate }: iGM_SidebarProps) {
  const t = useTranslations();
  // 剥离语言前缀后再与导航配置（无前缀）比对（模块五多语言路由）
  const pathname =
    iGM_StripLocalePrefix(usePathname()).replace(/\/$/, "") || "/";
  const { user } = iGM_UseAuth();

  // 模块十六：开发者入口目标——组织所有者免申请、直接进入接入界面；
  // 其余用户按最新申请状态解析：已通过进接入界面，待审进状态页，其余进申请页
  const [developerTarget, setDeveloperTarget] = useState<{
    href: string;
    external: boolean;
  }>({ href: "/G_DeveloperApply", external: false });
  const iGM_IsOrgOwner = user?.verifiedOrg?.isOwner === true;
  useEffect(() => {
    /** 按身份与申请状态写入入口目标 */
    function iGM_ApplyTarget(status: string | null): void {
      const target = iGM_ResolveDeveloperEntry(iGM_IsOrgOwner, status);
      setDeveloperTarget(
        target === "console"
          ? { href: iGM_DeveloperConsoleUrl, external: true }
          : target === "status"
            ? { href: "/G_DeveloperStatus", external: false }
            : { href: "/G_DeveloperApply", external: false },
      );
    }
    if (!user) {
      setDeveloperTarget({ href: "/G_DeveloperApply", external: false });
      return;
    }
    // 组织所有者不依赖申请记录，先按身份给出目标，再按最新申请状态校正
    iGM_ApplyTarget(null);
    let active = true;
    iGM_ApiGetMyDeveloper()
      .then((response) => {
        if (active) iGM_ApplyTarget(response.data?.latest?.status ?? null);
      })
      .catch(() => {
        /* 读取失败时保持当前目标 */
      });
    return () => {
      active = false;
    };
  }, [user, iGM_IsOrgOwner]);

  // 用户手动展开/折叠覆盖：仅在当前路由内有效，切换路由后自动清空，
  // 使展开态回归“按当前路由自动展开”，离开的分支随之折叠
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const iGM_PreviousPath = useRef(pathname);
  useEffect(() => {
    if (iGM_PreviousPath.current !== pathname) {
      iGM_PreviousPath.current = pathname;
      setOverrides({});
    }
  }, [pathname]);

  /** 角色可见性过滤（含子树），隐藏无可见项的分区 */
  const visibleGroups = iGM_NavGroups.map((group) => ({
    ...group,
    items: iGM_FilterItems(group.items, user),
  })).filter((group) => group.items.length > 0);

  /* ---------- 滑动气泡（Moving Pill） ---------- */
  /** 导航容器（气泡的定位参照，须为最近 positioned 祖先） */
  const navRef = useRef<HTMLElement | null>(null);
  /** 已渲染链接节点表：键为 `层级:解析后href`，同名父子靠层级区分 */
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [pill, setPill] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  /** 解析节点实际跳转目标（开发者入口动态，其余取静态配置） */
  function iGM_ResolveTarget(item: iGM_NavItem): {
    href: string;
    external: boolean;
  } {
    return item.developerEntry
      ? developerTarget
      : { href: item.href, external: item.external === true };
  }

  /** 在可见导航树中查找命中当前路由的最深节点，并记录其顶级根 href（供平板栏回退） */
  function iGM_FindActiveNode(): {
    key: string;
    depth: number;
    rootHref: string;
  } | null {
    let found: { key: string; depth: number; rootHref: string } | null = null;
    const visit = (item: iGM_NavItem, depth: number, rootHref: string): void => {
      const target = iGM_ResolveTarget(item);
      if (!target.external && iGM_IsActive(pathname, target.href)) {
        if (!found || depth > found.depth) {
          found = { key: `${depth}:${target.href}`, depth, rootHref };
        }
      }
      item.children?.forEach((child) => visit(child, depth + 1, rootHref));
    };
    visibleGroups.forEach((group) =>
      group.items.forEach((root) =>
        visit(root, 0, iGM_ResolveTarget(root).href),
      ),
    );
    return found;
  }

  /** 上一次提交的气泡几何（无活动项时为 null），用于跳过等值更新避免渲染循环 */
  const lastPillRef = useRef<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  /**
   * 测量活动链接相对导航容器的几何并同步气泡。
   * 在绘制后的 effect 中执行：上一位置保留一帧，CSS transition 自然从旧位滑移；
   * 平板图标栏下命中的子节点 display:none（offsetParent 为空）时回退到可见的顶级父节点。
   * 几何未变化时不触发 setState（ResizeObserver 初始回调与连续提交下防止更新风暴）。
   */
  function iGM_SyncPill(): void {
    const node = iGM_FindActiveNode();
    let next: typeof lastPillRef.current = null;
    if (node) {
      let element = linkRefs.current.get(node.key) ?? null;
      if (!element || element.offsetParent === null) {
        element = linkRefs.current.get(`0:${node.rootHref}`) ?? null;
      }
      if (element && element.offsetParent !== null) {
        next = {
          top: element.offsetTop,
          left: element.offsetLeft,
          width: element.offsetWidth,
          height: element.offsetHeight,
        };
      }
    }
    const prev = lastPillRef.current;
    if (
      prev !== null &&
      next !== null &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.width === next.width &&
      prev.height === next.height
    ) {
      return;
    }
    if (prev === null && next === null) return;
    lastPillRef.current = next;
    setPill(next);
  }

  /** 最新同步函数引用（供仅挂载一次的观察器调用，避免闭包陈旧） */
  const syncPillRef = useRef(iGM_SyncPill);
  syncPillRef.current = iGM_SyncPill;

  // 每次提交后测量（路由、展开态、过滤结果、开发者目标变化均覆盖），
  // rAF 兜底首帧字体/布局 settling；等值几何在 iGM_SyncPill 内被短路
  useEffect(() => {
    iGM_SyncPill();
    const raf = requestAnimationFrame(iGM_SyncPill);
    return () => cancelAnimationFrame(raf);
  });

  // 仅挂载一次：断点切换与侧栏尺寸变化时重测，观察器不随提交反复拆装
  useEffect(() => {
    const nav = navRef.current;
    const observer = new ResizeObserver(() => syncPillRef.current());
    if (nav) observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  /** 节点是否展开：手动覆盖优先，否则按当前路由自动展开 */
  function iGM_IsOpen(item: iGM_NavItem): boolean {
    return overrides[item.href] ?? iGM_BranchActive(pathname, item);
  }

  /** 切换父节点展开态 */
  function iGM_Toggle(item: iGM_NavItem): void {
    setOverrides((current) => ({
      ...current,
      [item.href]: !iGM_IsOpen(item),
    }));
  }

  /** 递归渲染单个导航节点（叶子或树状父节点） */
  function iGM_RenderNavItem(item: iGM_NavItem, depth: number) {
    const Icon = item.icon;
    // 模块十六：开发者入口按身份与申请状态解析目标（可能为外链），其余项使用配置内的静态路由
    const target = item.developerEntry
      ? developerTarget
      : { href: item.href, external: item.external === true };
    // 外链入口不参与站内高亮
    const active = !target.external && iGM_IsActive(pathname, target.href);
    const hasChildren = !!item.children && item.children.length > 0;
    const expanded = hasChildren && iGM_IsOpen(item);

    return (
      <li key={`${depth}:${target.href}`}>
        <div className={styles.itemRow}>
          <Link
            href={target.href}
            ref={(el) => {
              const key = `${depth}:${target.href}`;
              if (el) linkRefs.current.set(key, el);
              else linkRefs.current.delete(key);
            }}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ""} ${
              depth > 0 ? styles.navLinkChild : ""
            }`}
            aria-current={active ? "page" : undefined}
            title={t(item.labelKey)}
            onClick={onNavigate}
            {...(target.external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            <span className={styles.navIcon}>
              <Icon
                size={depth > 0 ? 15 : 19}
                strokeWidth={1.8}
              />
            </span>
            <span className={styles.navLabel}>{t(item.labelKey)}</span>
          </Link>
          {hasChildren && (
            <button
              type="button"
              className={styles.navToggle}
              aria-label={t(item.labelKey)}
              aria-expanded={expanded}
              onClick={() => iGM_Toggle(item)}
            >
              <ChevronRight
                size={15}
                strokeWidth={2}
                className={expanded ? styles.chevronOpen : styles.chevron}
              />
            </button>
          )}
        </div>

        {/* 子树：竖线树形缩进 */}
        {hasChildren && expanded && (
          <ul className={styles.subList}>
            {item.children!.map((child) => iGM_RenderNavItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <aside
      id="igm-sidebar"
      className={`${styles.sidebar} ${open ? styles.open : ""}`}
      aria-label={t("nav.groupMain")}
    >
      <nav className={styles.nav} ref={navRef}>
        {/* 滑动指示气泡：单一节点在活动链接间平滑滑移，装饰性元素不参与读屏 */}
        <span
          aria-hidden
          className={styles.activePill}
          data-hidden={pill ? undefined : "true"}
          style={
            pill
              ? {
                  transform: `translate(${pill.left}px, ${pill.top}px)`,
                  width: `${pill.width}px`,
                  height: `${pill.height}px`,
                }
              : undefined
          }
        />
        {visibleGroups.map((group) => (
          <section key={group.titleKey} className={styles.group}>
            <h3 className={styles.groupTitle}>{t(group.titleKey)}</h3>
            <ul className={styles.groupList}>
              {group.items.map((item) => iGM_RenderNavItem(item, 0))}
            </ul>
          </section>
        ))}
      </nav>
    </aside>
  );
}

// 导出 //
export default iGM_Sidebar;
