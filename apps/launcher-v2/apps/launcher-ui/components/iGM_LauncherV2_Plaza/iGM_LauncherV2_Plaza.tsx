/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Plaza/iGM_LauncherV2_Plaza.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main·方块广场
 * 模块：iGM_LauncherV2_Plaza
 * 作用：方块广场页：把「P2P 联机房间」与「客户端同步大厅 / 开服中心」聚合成页签
 * 内容：顶部为标题与说明（plaza.title / plaza.desc），下方为一排带 lucide 图标的页签；
 *       页签切换使用本地 state，P2P 联机房间页签渲染重构后的 PeerLobby 状态机组件；
 *       服务器大厅页签当前仅渲染「暂在开发中」占位（原 ServerLobby 组件文件保留但暂不挂载）；
 *       内容区采用卡片化布局与浅描边，与静态渐变背景形成柔和对比，保持工具软件的专注感；
 *       界面文案全部走多语言（next-intl，plaza / server / shell 命名空间）
 * 说明：v26.5.5 已将「视界管理」迁移为顶层导航页签（iGM_LauncherV2_MainShell 的 nav.horizon），
 *       故此处移除原「视界管理」页签（该能力未丢失，仅在导航层级上移）；
 *       组件为纯展示层，联机 / 服务器 / 清单的网络请求与本地落盘均由 Bun 主进程执行，
 *       本组件只负责页签聚合，不直接触碰本地文件与系统命令
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Construction, Server, Users } from "lucide-react";
import {
  iGM_LauncherV2_PeerLobby as IGM_LauncherV2_PeerLobby,
} from "@/components/iGM_LauncherV2_PeerLobby/iGM_LauncherV2_PeerLobby";
import styles from "./iGM_LauncherV2_Plaza.module.css";

// 类型定义 //

/** 方块广场页签标识（视界管理已迁移为顶层导航，不再作为页签） */
type iGM_LauncherV2_PlazaTab = "p2p" | "servers";

/** 页签展示信息（label 为 i18n 键，渲染处以 t 解析） */
interface iGM_LauncherV2_PlazaTabMeta {
  id: iGM_LauncherV2_PlazaTab;
  label: string;
  icon: typeof Users;
}

// 常量与文案 //

/** 页签清单：P2P 联机房间 / 客户端同步大厅与开服中心 */
const IGM_PLAZA_TABS: iGM_LauncherV2_PlazaTabMeta[] = [
  { id: "p2p", label: "plaza.tabs.p2p", icon: Users },
  { id: "servers", label: "server.hall.title", icon: Server },
];

// 核心逻辑 //

/**
 * 方块广场页。
 * 默认落在「P2P 联机房间」，页签切换仅改本地 state，不对外暴露控制能力。
 */
export function iGM_LauncherV2_Plaza({ className = "" }: { className?: string }) {
  const t = useTranslations();
  const [tab, setTab] = useState<iGM_LauncherV2_PlazaTab>("p2p");

  return (
    <section className={`${styles.plaza} ${className}`}>
      {/* 标题区 */}
      <header className={styles.head}>
        <h1 className={styles.title}>{t("plaza.title")}</h1>
        <p className={styles.desc}>{t("plaza.desc")}</p>
      </header>

      {/* 页签栏：图标 + 文字，选中态以主题色描边标记 */}
      <div className={styles.tabBar} role="tablist" aria-label={t("plaza.title")}>
        {IGM_PLAZA_TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.tab} ${active ? styles.tabOn : ""}`}
              onClick={() => setTab(item.id)}
            >
              <Icon size={15} strokeWidth={2.2} />
              <span>{t(item.label)}</span>
            </button>
          );
        })}
      </div>

      {/* 内容区：按页签渲染；未激活的页签不挂载，避免重复订阅 */}
      <div className={styles.panel}>
        {tab === "p2p" ? <IGM_LauncherV2_PeerLobby /> : null}
        {tab === "servers" ? (
          <div className={styles.devCard}>
            <Construction className={styles.devIcon} aria-hidden />
            <p className={styles.devText}>{t("shell.dev.inProgress")}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// 导出 //
export default iGM_LauncherV2_Plaza;
