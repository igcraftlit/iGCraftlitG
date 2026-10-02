/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminSystem/iGM_AdminSystemPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminSystem（G_Admin_System 系统面板）
 * 模块：G_AdminSystem
 * 作用：管理后台系统面板——系统信息与邮件测试 UI 整合
 * 内容：统一页头 + Tab 切换；系统信息明确展示数据库类型（PostgreSQL）、
 *       版本与连接状态；邮件测试保留原 SMTP 测试能力
 * 权限：管理员可见全部 Tab；受信任组织负责人仅系统信息只读，
 *       邮件测试 Tab 不显示（后端 /G_Admin/mails/test 仍仅 admin）
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import { Mail, Settings } from "lucide-react";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_AdminTabs as IGM_AdminTabs } from "../../iGM_Components/iGM_AdminPanel/iGM_AdminTabs";
import { iGM_SystemInfoPanel as IGM_SystemInfoPanel } from "../G_AdminSettings/iGM_AdminSettingsPage";
import { iGM_MailTestPanel as IGM_MailTestPanel } from "../G_AdminMails/iGM_AdminMailsPage";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import pageStyles from "../iGM_Page.module.css";

// 类型定义 //
// （Tab 内容组件各自加载系统信息 / 发送测试邮件）

// 核心逻辑 //
/** 系统面板主体：系统信息（全员可见）+ 邮件测试（仅 admin） */
function iGM_AdminSystemInner() {
  const t = useTranslations();
  const { hasRole } = iGM_UseAuth();
  const isAdmin = hasRole("admin");

  return (
    <div className={pageStyles.page}>
      {/* 统一页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Settings size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminSystem.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminSystem.description")}
        </p>
      </header>

      {/* 邮件测试仅对管理员开放；组织负责人只看到系统信息 */}
      <IGM_AdminTabs
        tabs={[
          {
            key: "systemInfo",
            label: t("admin.panel.tabs.systemInfo"),
            icon: Settings,
            content: <IGM_SystemInfoPanel />,
          },
          ...(isAdmin
            ? [
                {
                  key: "mailTest",
                  label: t("admin.panel.tabs.mailTest"),
                  icon: Mail,
                  content: <IGM_MailTestPanel />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

/** 系统面板（管理员 + 受信任组织负责人，后端强制） */
export function iGM_AdminSystemPage() {
  const IGM_AdminSystemInner = iGM_AdminSystemInner;
  return (
    <IGM_RequireAuth staff>
      <IGM_AdminSystemInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminSystemPage;
