/**
 * 文件路径：apps/launcher-download/src/app/[locale]/docs/install/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/docs/install
 * 模块：iGM_LauncherDl_Downloader
 * 作用：安装指南页——统一文档布局 + 安装正文（系统要求、安装步骤、校验、注意事项）
 * 内容：纯静态 SSG 服务端页面，右侧目录条目由语言包章节标题与正文锚点常量拼装
 */

// 导入依赖 //
import { notFound } from "next/navigation";
import { iGM_LauncherDl_GetMessages } from "../../../../i18n/iGM_LauncherDl_Messages";
import { iGM_LauncherDl_IsLocale } from "../../../../i18n/iGM_LauncherDl_Locales";
import { iGM_LauncherDl_DocLayout as IGM_LauncherDl_DocLayout } from "../../../../components/iGM_LauncherDl_DocLayout/iGM_LauncherDl_DocLayout";
import { iGM_LauncherDl_DocContent as IGM_LauncherDl_DocContent } from "../../../../components/iGM_LauncherDl_DocContent/iGM_LauncherDl_DocContent";
import { iGM_LauncherDl_InstallSectionIds } from "../../../../components/iGM_LauncherDl_DocContent/iGM_LauncherDl_DocAnchors";

// 类型定义 //
interface iGM_LauncherDl_DocInstallPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 安装指南页 */
export default async function iGM_LauncherDl_DocInstallPage({
  params,
}: iGM_LauncherDl_DocInstallPageProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  const messages = iGM_LauncherDl_GetMessages(locale);
  const install = messages.docs.install;

  const tocItems = [
    { id: iGM_LauncherDl_InstallSectionIds.system, label: install.system.title, level: 1 as const },
    { id: iGM_LauncherDl_InstallSectionIds.steps, label: install.steps.title, level: 1 as const },
    { id: iGM_LauncherDl_InstallSectionIds.verify, label: install.verify.title, level: 1 as const },
    { id: iGM_LauncherDl_InstallSectionIds.notes, label: install.notes.title, level: 1 as const },
  ];

  return (
    <IGM_LauncherDl_DocLayout tocItems={tocItems}>
      <IGM_LauncherDl_DocContent variant="install" />
    </IGM_LauncherDl_DocLayout>
  );
}