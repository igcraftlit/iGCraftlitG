/**
 * 文件路径：apps/web/src/iGM_Components/iGM_AdminPanel/iGM_AdminTabs.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_AdminDashboard / G_AdminModeration / G_AdminSystem / G_AdminDeveloper
 * 模块：iGM_AdminTabs
 * 作用：管理后台整合面板的通用分区切换组件
 * 内容：Tab 定义（键 / 文案 / lucide 图标 / 面板内容）、受控外的内部激活态、
 *       仅渲染当前面板，各面板数据接口相互独立
 * 说明：纯客户端组件；禁止 emoji，图标统一 lucide-react
 */

// 导入依赖 //
"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./iGM_AdminTabs.module.css";

// 类型定义 //
export interface iGM_AdminTab {
  /** 面板唯一键 */
  key: string;
  /** 已翻译的面板名称 */
  label: string;
  /** lucide-react 图标 */
  icon: LucideIcon;
  /** 面板内容（各模块独立数据接口，仅在 UI 层整合） */
  content: ReactNode;
}

interface iGM_AdminTabsProps {
  tabs: iGM_AdminTab[];
  /** 默认激活的面板键；不传时取第一个 */
  defaultKey?: string;
}

/**
 * 被整合页面 Inner 的嵌入参数：
 * embedded 为 true 时隐藏独立页头（由整合面板提供标题与 Tab）；
 * readOnly 为 true 时隐藏写操作控件（供组织负责人只读查看，后端仍强制 403）。
 */
export interface iGM_EmbedProps {
  embedded?: boolean;
  readOnly?: boolean;
}

// 核心逻辑 //
/** 管理后台整合面板分区切换 */
export function iGM_AdminTabs({ tabs, defaultKey }: iGM_AdminTabsProps) {
  const [activeKey, setActiveKey] = useState(defaultKey ?? tabs[0]?.key ?? "");
  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

  return (
    <div>
      <div className={styles.tabBar} role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active?.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveKey(tab.key)}
            >
              <Icon size={15} strokeWidth={1.8} />
              {tab.label}
            </button>
          );
        })}
      </div>
      {active && <div className={styles.tabPanel}>{active.content}</div>}
    </div>
  );
}

// 导出 //
export default iGM_AdminTabs;
