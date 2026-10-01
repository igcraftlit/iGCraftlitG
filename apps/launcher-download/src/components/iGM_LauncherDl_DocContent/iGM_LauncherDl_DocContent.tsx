/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_DocContent/iGM_LauncherDl_DocContent.tsx
 * 所属层：前端 / 组件层
 * 路由：/docs/install、/docs/faq 文档正文
 * 模块：iGM_LauncherDl_Downloader
 * 作用：文档正文渲染器——按 variant 渲染「安装指南」或「常见问题」结构化正文
 * 内容：章节锚点 id 与页面 TOC 一一对应（见 iGM_LauncherDl_DocSections 常量），
 *       结构化数组文案取自语言包（iGM_LauncherDl_GetMessages），代码块复用 CodeBlock
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import { iGM_LauncherDl_GetMessages } from "../../i18n/iGM_LauncherDl_Messages";
import { iGM_LauncherDl_UseLocale } from "../iGM_LauncherDl_Providers/iGM_LauncherDl_LocaleProvider";
import { iGM_LauncherDl_CodeBlock as IGM_LauncherDl_CodeBlock } from "../iGM_LauncherDl_CodeBlock/iGM_LauncherDl_CodeBlock";
import { iGM_LauncherDl_VerifySnippet } from "./iGM_LauncherDl_DocSnippets";
import {
  iGM_LauncherDl_FaqAnchorPrefix,
  iGM_LauncherDl_InstallSectionIds,
} from "./iGM_LauncherDl_DocAnchors";
import styles from "./iGM_LauncherDl_DocContent.module.css";

// 类型定义 //
type iGM_LauncherDl_DocVariant = "install" | "faq";

interface iGM_LauncherDl_DocContentProps {
  variant: iGM_LauncherDl_DocVariant;
}

// 核心逻辑 //
/** 文档正文：安装指南 / 常见问题 */
export function iGM_LauncherDl_DocContent({
  variant,
}: iGM_LauncherDl_DocContentProps) {
  const t = useTranslations();
  const { locale } = iGM_LauncherDl_UseLocale();
  const messages = iGM_LauncherDl_GetMessages(locale);

  if (variant === "faq") {
    const faq = messages.docs.faq;
    const answers = [
      faq.a1,
      faq.a2,
      faq.a3,
      faq.a4,
      faq.a5,
    ];
    const questions = [faq.q1, faq.q2, faq.q3, faq.q4, faq.q5];

    return (
      <div className={styles.doc}>
        <header className={styles.header}>
          <h1 className={styles.title}>{faq.title}</h1>
          <p className={styles.lead}>{faq.lead}</p>
        </header>

        <ul className={styles.faqList}>
          {questions.map((question, index) => (
            <li
              key={question}
              id={`${iGM_LauncherDl_FaqAnchorPrefix}${index + 1}`}
              className={styles.faqItem}
            >
              <h2 className={styles.faqQuestion}>{question}</h2>
              <p className={styles.faqAnswer}>{answers[index]}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const install = messages.docs.install;

  return (
    <div className={styles.doc}>
      <header className={styles.header}>
        <h1 className={styles.title}>{install.title}</h1>
        <p className={styles.lead}>{install.lead}</p>
      </header>

      <section
        id={iGM_LauncherDl_InstallSectionIds.system}
        className={styles.section}
      >
        <h2 className={styles.sectionTitle}>{install.system.title}</h2>
        <ul className={styles.bullets}>
          {install.system.items.map((item) => (
            <li key={item} className={styles.bulletItem}>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section
        id={iGM_LauncherDl_InstallSectionIds.steps}
        className={styles.section}
      >
        <h2 className={styles.sectionTitle}>{install.steps.title}</h2>
        <ol className={styles.steps}>
          {install.steps.items.map((item, index) => (
            <li key={item} className={styles.stepItem}>
              <span className={styles.stepIndex} aria-hidden>
                {index + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </section>

      <section
        id={iGM_LauncherDl_InstallSectionIds.verify}
        className={styles.section}
      >
        <h2 className={styles.sectionTitle}>{install.verify.title}</h2>
        <p className={styles.paragraph}>{install.verify.lead}</p>
        <IGM_LauncherDl_CodeBlock
          code={iGM_LauncherDl_VerifySnippet.code}
          label={iGM_LauncherDl_VerifySnippet.label}
        />
        <p className={styles.paragraph}>{install.verify.after}</p>
      </section>

      <section
        id={iGM_LauncherDl_InstallSectionIds.notes}
        className={styles.section}
      >
        <h2 className={styles.sectionTitle}>{install.notes.title}</h2>
        <ul className={styles.bullets}>
          {install.notes.items.map((item) => (
            <li key={item} className={styles.bulletItem}>
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// 导出 //
export default iGM_LauncherDl_DocContent;