/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminModeration/iGM_AdminModerationPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminModeration（G_Admin_Moderation 审核面板）
 * 模块：G_AdminModeration
 * 作用：管理后台审核面板——内容审核、举报处理、认证审核三模块 UI 整合
 * 内容：统一页头 + Tab 切换；保留各自审核逻辑、举报处理与操作日志
 * 权限：协管员 / 管理员可执行审核操作；受信任组织负责人只读内容与举报、
 *       在认证审核 Tab 仅处理所属组织申请；后端逐接口强制，前端仅显示控制
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import { BadgeCheck, FileText, Flag, ShieldCheck } from "lucide-react";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_AdminTabs as IGM_AdminTabs } from "../../iGM_Components/iGM_AdminPanel/iGM_AdminTabs";
import { iGM_ContentsPanel as IGM_ContentsPanel } from "../G_AdminContents/iGM_AdminContentsPage";
import { iGM_ReportsPanel as IGM_ReportsPanel } from "../G_AdminReports/iGM_AdminReportsPage";
import { iGM_OrgVerifyPanel as IGM_OrgVerifyPanel } from "../G_AdminOrgVerify/iGM_AdminOrgVerifyPage";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import uiStyles from "../iGM_Module4.module.css";
import pageStyles from "../iGM_Page.module.css";

// 类型定义 //
// （各 Tab 内容组件自带数据加载与审核表单）

// 核心逻辑 //
/** 审核面板主体：内容审核 / 举报处理 / 认证审核 */
function iGM_AdminModerationInner() {
  const t = useTranslations();
  const { user, hasRole } = iGM_UseAuth();
  // 组织负责人角色为普通用户：内容与举报仅只读；认证审核由其 Inner 按组织限定
  const readOnly = !hasRole("moderator");

  return (
    <div className={pageStyles.page}>
      {/* 统一页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <ShieldCheck size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminModeration.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminModeration.description")}
        </p>
      </header>

      {/* 只读提示：组织负责人可见但不可处置内容与举报 */}
      {readOnly && user && (
        <div className={`${uiStyles.alert}`}>{t("admin.panel.readonlyNotice")}</div>
      )}

      {/* 三模块 Tab：审核逻辑、举报处理、操作日志保持各自原有实现 */}
      <IGM_AdminTabs
        tabs={[
          {
            key: "contents",
            label: t("admin.panel.tabs.contents"),
            icon: FileText,
            content: <IGM_ContentsPanel readOnly={readOnly} />,
          },
          {
            key: "reports",
            label: t("admin.panel.tabs.reports"),
            icon: Flag,
            content: <IGM_ReportsPanel readOnly={readOnly} />,
          },
          {
            key: "orgVerify",
            label: t("admin.panel.tabs.orgVerify"),
            icon: BadgeCheck,
            content: <IGM_OrgVerifyPanel />,
          },
        ]}
      />
    </div>
  );
}

/** 审核面板（协管员 / 管理员 / 受信任组织负责人，后端强制） */
export function iGM_AdminModerationPage() {
  const IGM_AdminModerationInner = iGM_AdminModerationInner;
  return (
    <IGM_RequireAuth role="moderator" staff>
      <IGM_AdminModerationInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminModerationPage;
