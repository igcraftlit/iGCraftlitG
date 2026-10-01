/**
 * 文件路径：apps/launcher-download/src/app/[locale]/docs/faq/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/docs/faq
 * 模块：iGM_LauncherDl_Downloader
 * 作用：常见问题页——统一文档布局 + FAQ 正文
 * 内容：纯静态 SSG 服务端页面，右侧目录条目按 q1..q5 生成（锚点常量与正文一致）
 */

// 导入依赖 //
import { notFound } from "next/navigation";
import { iGM_LauncherDl_GetMessages } from "../../../../i18n/iGM_LauncherDl_Messages";
import { iGM_LauncherDl_IsLocale } from "../../../../i18n/iGM_LauncherDl_Locales";
import { iGM_LauncherDl_DocLayout as IGM_LauncherDl_DocLayout } from "../../../../components/iGM_LauncherDl_DocLayout/iGM_LauncherDl_DocLayout";
import { iGM_LauncherDl_DocContent as IGM_LauncherDl_DocContent } from "../../../../components/iGM_LauncherDl_DocContent/iGM_LauncherDl_DocContent";
import {
  iGM_LauncherDl_FaqAnchorPrefix,
  iGM_LauncherDl_FaqCount,
} from "../../../../components/iGM_LauncherDl_DocContent/iGM_LauncherDl_DocAnchors";

// 类型定义 //
interface iGM_LauncherDl_DocFaqPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 常见问题页 */
export default async function iGM_LauncherDl_DocFaqPage({
  params,
}: iGM_LauncherDl_DocFaqPageProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  const messages = iGM_LauncherDl_GetMessages(locale);
  const faq = messages.docs.faq;
  const questions = [faq.q1, faq.q2, faq.q3, faq.q4, faq.q5];

  const tocItems = questions.slice(0, iGM_LauncherDl_FaqCount).map((question, index) => ({
    id: `${iGM_LauncherDl_FaqAnchorPrefix}${index + 1}`,
    label: question,
    level: 2 as const,
  }));

  return (
    <IGM_LauncherDl_DocLayout tocItems={tocItems}>
      <IGM_LauncherDl_DocContent variant="faq" />
    </IGM_LauncherDl_DocLayout>
  );
}