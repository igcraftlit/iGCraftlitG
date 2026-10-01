/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Instance/iGM_Launcher_InstanceCard.tsx
 * 所属层：前端 / 实例模块组件层
 * 路由：G_Instances、G_Home（最近实例复用）
 * 模块：iGM_Launcher_InstanceCard
 * 作用：单个实例的卡片 / 列表行，展示选择框、图标、名称、版本、加载器、上次游玩时间
 * 内容：模块七改为勾选式选择（复选框单选，选中后由实例页底部「启动游戏」启动），
 *       并移除卡片内的直接启动按钮；保留更多操作菜单（编辑、复制、重命名、删除）；
 *       删除与重命名由父级弹出确认层，本组件只负责触发回调
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { iGM_Launcher_InstanceRecord } from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_InstanceIcon } from "./iGM_Launcher_InstanceIcons";
import styles from "./iGM_Launcher_InstanceCard.module.css";

// 类型定义 //
/** 上次游玩的相对时间文案键（供 instances 命名空间翻译） */
export interface iGM_Launcher_LastPlayedMeta {
  key: "playedToday" | "playedYesterday" | "playedDaysAgo" | "playedNever";
  days: number;
}

export interface iGM_Launcher_InstanceCardProps {
  instance: iGM_Launcher_InstanceRecord;
  /** 卡片视图或紧凑列表视图 */
  view: "grid" | "list";
  /** 是否为当前勾选的实例（复选框单选，状态栏联动） */
  selected: boolean;
  /** 勾选 / 取消勾选该实例；由父级保证一次只勾选一个 */
  onToggleChecked: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onRename: () => void;
  onDelete: () => void;
}

// 核心逻辑 //

/** 计算上次游玩的相对时间（跨天按自然日折算，简单近似即可） */
export function iGM_Launcher_LastPlayedMeta(
  lastPlayedAt: string | null,
): iGM_Launcher_LastPlayedMeta {
  if (!lastPlayedAt) return { key: "playedNever", days: 0 };
  const played = new Date(lastPlayedAt).getTime();
  if (Number.isNaN(played)) return { key: "playedNever", days: 0 };
  const elapsedDays = Math.floor((Date.now() - played) / 86400000);
  if (elapsedDays <= 0) return { key: "playedToday", days: 0 };
  if (elapsedDays === 1) return { key: "playedYesterday", days: 1 };
  return { key: "playedDaysAgo", days: elapsedDays };
}

export function iGM_Launcher_InstanceCard({
  instance,
  view,
  selected,
  onToggleChecked,
  onEdit,
  onCopy,
  onRename,
  onDelete,
}: iGM_Launcher_InstanceCardProps) {
  const t = useTranslations("instances");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击卡片外部或按 Esc 关闭更多操作菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const Icon = iGM_Launcher_InstanceIcon(instance.icon);
  const lastPlayed = iGM_Launcher_LastPlayedMeta(instance.lastPlayedAt);
  const loaderLabel =
    instance.loader === "vanilla"
      ? "Vanilla"
      : instance.loaderVersion
        ? `${instance.loader} ${instance.loaderVersion}`
        : instance.loader;

  const classNames = [
    styles.card,
    view === "list" ? styles.cardList : "",
    selected ? styles.cardSelected : "",
  ]
    .filter(Boolean)
    .join(" ");

  const menuItems: { key: string; label: string; icon: typeof Pencil; run: () => void }[] = [
    { key: "edit", label: t("edit"), icon: Pencil, run: onEdit },
    { key: "copy", label: t("copy"), icon: Copy, run: onCopy },
    { key: "rename", label: t("rename"), icon: Pencil, run: onRename },
    { key: "delete", label: t("delete"), icon: Trash2, run: onDelete },
  ];

  return (
    <article className={classNames}>
      {/* 模块七：勾选式选择，用于页面底部「启动游戏」按钮 */}
      <label className={styles.check} title={t("selectAria")}>
        <input
          type="checkbox"
          className={styles.checkInput}
          checked={selected}
          onChange={onToggleChecked}
          aria-label={t("selectAria")}
        />
      </label>

      <div className={styles.icon}>
        <Icon size={view === "list" ? 18 : 20} strokeWidth={1.6} />
      </div>

      <div className={styles.body}>
        <div className={styles.nameRow}>
          <h3 className={styles.name} title={instance.name}>
            {instance.name}
          </h3>
          {selected ? (
            <IGM_Launcher_Badge tone="accent">{t("selectedBadge")}</IGM_Launcher_Badge>
          ) : null}
        </div>
        <div className={styles.metaRow}>
          <IGM_Launcher_Badge tone="accent">{instance.minecraftVersion}</IGM_Launcher_Badge>
          <IGM_Launcher_Badge>{loaderLabel}</IGM_Launcher_Badge>
        </div>
        {instance.note ? <p className={styles.note}>{instance.note}</p> : null}
        {/* 模块六：展示实例独立的 gameDir，便于确认与共享根目录的位置关系 */}
        <p className={styles.gameDir} title={instance.directory}>
          {instance.directory}
        </p>
        <p className={styles.lastPlayed}>
          {t("lastPlayed")}：
          {lastPlayed.key === "playedDaysAgo"
            ? t("playedDaysAgo", { days: lastPlayed.days })
            : t(lastPlayed.key)}
        </p>
      </div>

      <div className={styles.actions}>
        <div className={styles.menuWrap} ref={menuRef}>
          <IGM_Launcher_Button
            variant="ghost"
            className={styles.menuButton}
            aria-label={t("more")}
            aria-expanded={menuOpen}
            title={t("more")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical size={16} strokeWidth={1.8} />
          </IGM_Launcher_Button>

          {menuOpen ? (
            <div className={styles.menu} role="menu">
              {menuItems.map((item, index) => {
                const ItemIcon = item.icon;
                const danger = item.key === "delete";
                return (
                  <button
                    type="button"
                    key={item.key}
                    role="menuitem"
                    className={[
                      styles.menuItem,
                      danger ? styles.menuItemDanger : "",
                      index === menuItems.length - 1 ? styles.menuItemLast : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      setMenuOpen(false);
                      item.run();
                    }}
                  >
                    <ItemIcon size={14} strokeWidth={1.8} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// 导出 //
export default iGM_Launcher_InstanceCard;