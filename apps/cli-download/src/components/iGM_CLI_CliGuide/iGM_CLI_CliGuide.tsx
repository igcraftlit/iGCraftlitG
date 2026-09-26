/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_CliGuide/iGM_CLI_CliGuide.tsx
 * 所属层：前端 / 页面内容组件层
 * 路由：/docs/cli、/docs/cli/install、/docs/cli/commands、/docs/cli/config、/docs/cli/faq
 * 模块：iGM_CLI_Downloader
 * 作用：iGM CLI 指南正文——按 variant 渲染十三章内容子集，并生成右侧目录条目
 * 内容：章节一 服务简介 / 二 特色 / 三 使用资格 / 四 安装 / 五 基础命令 /
 *       六 资源检索 / 七 安装与下载 / 八 项目管理 / 九 igm.json /
 *       十 缓存与镜像源 / 十一 多语言输出 / 十二 常见问题 Q1-Q4 / 十三 联系与团队；
 *       full 渲染全部章节，install/commands/config/faq 渲染各自子页；
 *       文案全部来自 next-intl 语言包，命令片段为语言无关静态常量
 */

// 导入依赖 //
"use client";

import { Fragment } from "react";
import Link from "next/link";
import { iGM_CLI_DocLayout as IGM_CLI_DocLayout } from "../iGM_CLI_DocLayout/iGM_CLI_DocLayout";
import { iGM_CLI_CodeBlock as IGM_CLI_CodeBlock } from "../iGM_CLI_CodeBlock/iGM_CLI_CodeBlock";
import type { iGM_CLI_TocItem } from "../iGM_CLI_DocToc/iGM_CLI_DocToc";
import { iGM_CLI_GetMessages } from "../../i18n/iGM_CLI_Messages";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import {
  iGM_CLI_InstallMethods,
  iGM_CLI_InstallSnippets,
} from "./iGM_CLI_InstallSnippets";
import styles from "./iGM_CLI_DocContent.module.css";

// 类型定义 //
/** 指南页面形态：full 完整十三章；其余为子页章节子集 */
export type iGM_CLI_GuideVariant =
  | "full"
  | "install"
  | "commands"
  | "config"
  | "faq";

interface iGM_CLI_CliGuideProps {
  /** 页面形态，默认 full */
  variant?: iGM_CLI_GuideVariant;
}

interface iGM_CLI_CmdItem {
  /** 命令文本 */
  c: string;
  /** 命令说明 */
  d: string;
}

// 核心逻辑 //
/** 章节 id（与语言包 docs.cli.* 同构） */
type iGM_CLI_SectionId =
  | "intro"
  | "features"
  | "eligibility"
  | "install"
  | "basic"
  | "search"
  | "download"
  | "project"
  | "config"
  | "cache"
  | "lang"
  | "faq"
  | "contact";

/** 各形态渲染的章节顺序（顺序即正文与目录顺序） */
const iGM_CLI_VariantSections: Record<iGM_CLI_GuideVariant, iGM_CLI_SectionId[]> = {
  full: [
    "intro",
    "features",
    "eligibility",
    "install",
    "basic",
    "search",
    "download",
    "project",
    "config",
    "cache",
    "lang",
    "faq",
    "contact",
  ],
  install: ["eligibility", "install"],
  commands: ["basic", "search", "download", "project"],
  config: ["config", "cache", "lang"],
  faq: ["faq"],
};

/** 形态对应语言包中的页面标题键（pages.*） */
const iGM_CLI_PageTitleKey: Record<iGM_CLI_GuideVariant, string> = {
  full: "docsCli",
  install: "docsInstall",
  commands: "docsCommands",
  config: "docsConfig",
  faq: "docsFaq",
};

/** 语言无关的命令片段（命令本身不翻译） */
const iGM_CLI_Snippets = iGM_CLI_InstallSnippets;

/** iGM CLI 指南正文（十三章内容按形态渲染） */
export function iGM_CLI_CliGuide({ variant = "full" }: iGM_CLI_CliGuideProps) {
  const { locale } = iGM_CLI_UseLocale();
  const messages = iGM_CLI_GetMessages(locale);
  const c = messages.docs.cli;
  const sectionIds = iGM_CLI_VariantSections[variant];

  /** 构建右侧目录：主章节一级；安装方式与 Q1-Q4 作为二级条目 */
  function iGM_CLI_BuildToc(): iGM_CLI_TocItem[] {
    const items: iGM_CLI_TocItem[] = [];
    for (const id of sectionIds) {
      items.push({ id, label: c[id].title, level: 1 });
      if (id === "install" && variant === "install") {
        for (const method of iGM_CLI_InstallMethods) {
          if (method.comingSoon) continue;
          items.push({
            id: method.id,
            label: c.install[method.labelKey],
            level: 2,
          });
        }
      }
      if (id === "faq") {
        for (let n = 1; n <= 4; n += 1) {
          items.push({ id: `q${n}`, label: `Q${n}`, level: 2 });
        }
      }
    }
    return items;
  }

  /** 命令列表（章节五至八复用） */
  function iGM_CLI_RenderCmdList(items: iGM_CLI_CmdItem[]) {
    return (
      <ul className={styles.cmdList}>
        {items.map((item) => (
          <li key={item.c} className={styles.cmdRow}>
            <code className={styles.cmdName}>{item.c}</code>
            <span className={styles.cmdDesc}>{item.d}</span>
          </li>
        ))}
      </ul>
    );
  }

  /** 章节渲染：按 id 分发到对应章节结构 */
  function iGM_CLI_RenderSection(id: iGM_CLI_SectionId) {
    switch (id) {
      /* 章节一 服务简介 */
      case "intro":
        return (
          <section id="intro" className={styles.section}>
            <h2 className={styles.h2}>{c.intro.title}</h2>
            <p className={styles.p}>{c.intro.body}</p>
          </section>
        );

      /* 章节二 特色 */
      case "features":
        return (
          <section id="features" className={styles.section}>
            <h2 className={styles.h2}>{c.features.title}</h2>
            <ul className={styles.bulletList}>
              {c.features.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        );

      /* 章节三 使用资格 */
      case "eligibility":
        return (
          <section id="eligibility" className={styles.section}>
            <h2 className={styles.h2}>{c.eligibility.title}</h2>
            <ol className={styles.orderList}>
              {c.eligibility.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        );

      /* 章节四 安装 */
      case "install":
        return (
          <section id="install" className={styles.section}>
            <h2 className={styles.h2}>{c.install.title}</h2>
            <p className={styles.p}>{c.install.lead}</p>
            {iGM_CLI_InstallMethods.map((method) => (
              <div key={method.id} id={method.id} className={styles.subBlock}>
                <h3 className={styles.h3}>{c.install[method.labelKey]}</h3>
                {method.comingSoon ? (
                  <p className={styles.comingSoon}>{c.install.comingSoon}</p>
                ) : (
                  <IGM_CLI_CodeBlock label={method.lang} code={method.code} />
                )}
              </div>
            ))}
            <p className={styles.p}>{c.install.done}</p>
          </section>
        );

      /* 章节五 基础命令 */
      case "basic":
        return (
          <section id="basic" className={styles.section}>
            <h2 className={styles.h2}>{c.basic.title}</h2>
            {iGM_CLI_RenderCmdList(c.basic.items)}
          </section>
        );

      /* 章节六 资源检索 */
      case "search":
        return (
          <section id="search" className={styles.section}>
            <h2 className={styles.h2}>{c.search.title}</h2>
            {iGM_CLI_RenderCmdList(c.search.items)}
          </section>
        );

      /* 章节七 安装与下载 */
      case "download":
        return (
          <section id="download" className={styles.section}>
            <h2 className={styles.h2}>{c.download.title}</h2>
            {iGM_CLI_RenderCmdList(c.download.items)}
          </section>
        );

      /* 章节八 项目管理 */
      case "project":
        return (
          <section id="project" className={styles.section}>
            <h2 className={styles.h2}>{c.project.title}</h2>
            {iGM_CLI_RenderCmdList(c.project.items)}
          </section>
        );

      /* 章节九 配置文件 igm.json */
      case "config":
        return (
          <section id="config" className={styles.section}>
            <h2 className={styles.h2}>{c.config.title}</h2>
            <p className={styles.p}>{c.config.lead}</p>
            <IGM_CLI_CodeBlock label="json" code={iGM_CLI_Snippets.configJson} />
            <p className={styles.p}>{c.config.lock}</p>
          </section>
        );

      /* 章节十 缓存与镜像源 */
      case "cache":
        return (
          <section id="cache" className={styles.section}>
            <h2 className={styles.h2}>{c.cache.title}</h2>
            <p className={styles.subLabel}>{c.cache.cacheTitle}</p>
            <ul className={styles.pathList}>
              <li>
                <code className={styles.inlineCode}>{c.cache.windows}</code>
              </li>
              <li>
                <code className={styles.inlineCode}>{c.cache.unix}</code>
              </li>
            </ul>
            <p className={styles.p}>{c.cache.mirror}</p>
          </section>
        );

      /* 章节十一 多语言输出 */
      case "lang":
        return (
          <section id="lang" className={styles.section}>
            <h2 className={styles.h2}>{c.lang.title}</h2>
            <p className={styles.p}>{c.lang.lead}</p>
            <IGM_CLI_CodeBlock label="bash" code={iGM_CLI_Snippets.lang} />
            <p className={styles.p}>{c.lang.supported}</p>
          </section>
        );

      /* 章节十二 常见问题 */
      case "faq": {
        const questions = [c.faq.q1, c.faq.q2, c.faq.q3, c.faq.q4];
        const answers = [c.faq.a1, c.faq.a2, c.faq.a3, c.faq.a4];
        return (
          <section id="faq" className={styles.section}>
            <h2 className={styles.h2}>{c.faq.title}</h2>
            {variant === "full" ? (
              <>
                <p className={styles.p}>{c.faq.hint}</p>
                <ul className={styles.faqQuestionList}>
                  {questions.map((question, index) => (
                    <li
                      key={`q${index + 1}`}
                      id={`q${index + 1}`}
                      className={styles.faqQuestion}
                    >
                      <span className={styles.qBadge}>Q{index + 1}</span>
                      <span>{question}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={iGM_CLI_LocalePath("/docs/cli/faq", locale)}
                  className={styles.textLink}
                >
                  {c.faq.viewAll}
                </Link>
              </>
            ) : (
              <div className={styles.faqAnswerList}>
                {questions.map((question, index) => (
                  <div
                    key={`q${index + 1}`}
                    id={`q${index + 1}`}
                    className={styles.faqItem}
                  >
                    <h3 className={styles.faqQuestionTitle}>
                      <span className={styles.qBadge}>Q{index + 1}</span>
                      {question}
                    </h3>
                    <p className={styles.p}>{answers[index]}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      }

      /* 章节十三 联系与团队 */
      case "contact":
        return (
          <section id="contact" className={styles.section}>
            <h2 className={styles.h2}>{c.contact.title}</h2>
            <ul className={styles.contactList}>
              <li className={styles.contactRow}>
                <span className={styles.contactLabel}>
                  {c.contact.website}
                </span>
                <a
                  className={styles.textLink}
                  href="https://igcraftlit.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://igcraftlit.com
                </a>
              </li>
              <li className={styles.contactRow}>
                <span className={styles.contactLabel}>{c.contact.email}</span>
                <span className={styles.contactValue}>
                  <a className={styles.textLink} href="mailto:igcraftlit@outlook.com">
                    igcraftlit@outlook.com
                  </a>
                  {" (.Net) / "}
                  <a className={styles.textLink} href="mailto:igcraftlit@163.com">
                    igcraftlit@163.com
                  </a>
                  {" (.CN)"}
                </span>
              </li>
              <li className={styles.contactBuilt}>{c.contact.built}</li>
            </ul>
          </section>
        );

      default:
        return null;
    }
  }

  return (
    <IGM_CLI_DocLayout tocItems={iGM_CLI_BuildToc()}>
      {/* 正文页头：页面标题 + 本章导言 */}
      <header className={styles.articleHead}>
        <h1 className={styles.h1}>
          {messages.pages[iGM_CLI_PageTitleKey[variant] as keyof typeof messages.pages].title}
        </h1>
        <p className={styles.lead}>{messages.docs.leads[variant]}</p>
      </header>

      {sectionIds.map((id) => (
        <Fragment key={id}>{iGM_CLI_RenderSection(id)}</Fragment>
      ))}
    </IGM_CLI_DocLayout>
  );
}

// 导出 //
export default iGM_CLI_CliGuide;
