/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminDashboard/iGM_AdminDashboardPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminDashboard（G_Admin_Dashboard 综合面板）
 * 模块：G_AdminDashboard
 * 作用：管理后台综合面板——实时状态、运营看板、数据详情三模块 UI 整合
 * 内容：统一页头 + Tab 切换，三个模块数据接口完全独立，仅在 UI 层组合
 * 说明：纯静态 SSG，数据在客户端调用本地后端；
 *       模块二十五起协管员 / 管理员 / 受信任组织负责人可访问，
 *       权限由后端 iGM_RequireStaffOrRole 强制，前端仅显示控制
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import { Activity, ChartLine, LayoutDashboard, Radio } from "lucide-react";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_AdminTabs as IGM_AdminTabs } from "../../iGM_Components/iGM_AdminPanel/iGM_AdminTabs";
import { iGM_RealtimePanel as IGM_RealtimePanel } from "../G_Realtime/iGM_RealtimePage";
import { iGM_OperationsBoardPanel as IGM_OperationsBoardPanel } from "../G_Dashboard/iGM_DashboardPage";
import { iGM_StatsPanel as IGM_StatsPanel } from "../G_StatsDetail/iGM_StatsDetailPage";
import pageStyles from "../iGM_Page.module.css";

// 类型定义 //
// （Tab 内容组件均自带数据加载，本页无额外状态）

// 核心逻辑 //
/** 综合面板主体：实时状态 / 运营看板 / 数据详情 */
function iGM_AdminDashboardInner() {
  const t = useTranslations();

  return (
    <div className={pageStyles.page}>
      {/* 统一页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <LayoutDashboard size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminPanel.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminPanel.description")}
        </p>
      </header>

      {/* 三模块 Tab：数据接口相互独立 */}
      <IGM_AdminTabs
        tabs={[
          {
            key: "realtime",
            label: t("admin.panel.tabs.realtime"),
            icon: Radio,
            content: <IGM_RealtimePanel />,
          },
          {
            key: "operations",
            label: t("admin.panel.tabs.operations"),
            icon: Activity,
            content: <IGM_OperationsBoardPanel />,
          },
          {
            key: "stats",
            label: t("admin.panel.tabs.stats"),
            icon: ChartLine,
            content: <IGM_StatsPanel />,
          },
        ]}
      />
    </div>
  );
}

/** 综合面板（协管员 / 管理员 / 受信任组织负责人，后端强制） */
export function iGM_AdminDashboardPage() {
  const IGM_AdminDashboardInner = iGM_AdminDashboardInner;
  return (
    <IGM_RequireAuth role="moderator" staff>
      <IGM_AdminDashboardInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminDashboardPage;
