/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_AdapterGuide/iGM_CLI_AdapterGuide.tsx
 * 所属层：前端 / 页面内容组件层
 * 路由：/docs/adapter、/docs/adapter/overview、/sdk、/protocol、/progress、/faq
 * 模块：iGM_CLI_Downloader
 * 作用：适配器文档正文——按 variant 渲染八章内容子集，并生成右侧 ON THIS PAGE 目录
 * 内容：章节一 适配器总览 / 二 接入方式对比 / 三 SDK 嵌入（C ABI）/
 *       四 适配器协议（HTTP + WebSocket）/ 五 进度事件流定义 /
 *       六 无终端弹窗要点 / 七 常见问题 Q1-Q4 / 八 联系与团队；
 *       full 渲染全部章节，overview/sdk/protocol/progress/faq 渲染各自子页；
 *       文案全部来自 next-intl 语言包 docs.adapter.*，代码片段为语言无关静态常量
 */

// 导入依赖 //
"use client";

import { Fragment } from "react";
import Link from "next/link";
import { iGM_CLI_AdapterLayout as IGM_CLI_AdapterLayout } from "../iGM_CLI_AdapterLayout/iGM_CLI_AdapterLayout";
import { iGM_CLI_CodeBlock as IGM_CLI_CodeBlock } from "../iGM_CLI_CodeBlock/iGM_CLI_CodeBlock";
import type { iGM_CLI_TocItem } from "../iGM_CLI_DocToc/iGM_CLI_DocToc";
import { iGM_CLI_GetMessages } from "../../i18n/iGM_CLI_Messages";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import {
  iGM_CLI_AdapterApiPrefix,
  iGM_CLI_AdapterCppExample,
  iGM_CLI_AdapterCreateReqJson,
  iGM_CLI_AdapterCreateRespJson,
  iGM_CLI_AdapterEndpoints,
  iGM_CLI_AdapterEventJson,
  iGM_CLI_AdapterEventTypes,
  iGM_CLI_AdapterExportsC,
  iGM_CLI_AdapterLibs,
  iGM_CLI_AdapterProgressRespJson,
  iGM_CLI_AdapterStructC,
  iGM_CLI_AdapterZigExample,
} from "./iGM_CLI_AdapterSnippets";
import shared from "../iGM_CLI_CliGuide/iGM_CLI_DocContent.module.css";
import styles from "./iGM_CLI_AdapterDoc.module.css";

// 类型定义 //
/** 适配器文档形态：full 完整八章；其余为子页章节子集 */
export type iGM_CLI_AdapterVariant =
  | "full"
  | "overview"
  | "sdk"
  | "protocol"
  | "progress"
  | "faq";

interface iGM_CLI_AdapterGuideProps {
  /** 页面形态，默认 full */
  variant?: iGM_CLI_AdapterVariant;
}

/** 章节 id（与语言包 docs.adapter.* 同构；contact 复用 docs.cli.contact） */
type iGM_CLI_AdapterSectionId =
  | "overview"
  | "compare"
  | "sdk"
  | "protocol"
  | "events"
  | "terminal"
  | "faq"
  | "contact";

// 核心逻辑 //
/** 各形态渲染的章节顺序（顺序即正文与目录顺序） */
const iGM_CLI_AdapterVariantSections: Record<
  iGM_CLI_AdapterVariant,
  iGM_CLI_AdapterSectionId[]
> = {
  full: ["overview", "compare", "sdk", "protocol", "events", "terminal", "faq", "contact"],
  overview: ["overview", "compare"],
  sdk: ["sdk"],
  protocol: ["protocol"],
  progress: ["events", "terminal"],
  faq: ["faq", "contact"],
};

/** 形态对应语言包中的页面标题键（pages.*） */
const iGM_CLI_AdapterPageTitleKey: Record<iGM_CLI_AdapterVariant, string> = {
  full: "docsAdapter",
  overview: "docsAdapterOverview",
  sdk: "docsAdapterSdk",
  protocol: "docsAdapterProtocol",
  progress: "docsAdapterProgress",
  faq: "docsAdapterFaq",
};

/** 形态对应语言包中的页头导言键（docs.leads.*） */
const iGM_CLI_AdapterLeadKey: Record<iGM_CLI_AdapterVariant, string> = {
  full: "adapterFull",
  overview: "adapterOverview",
  sdk: "adapterSdk",
  protocol: "adapterProtocol",
  progress: "adapterProgress",
  faq: "adapterFaq",
};

/** 适配器文档正文（八章内容按形态渲染） */
export function iGM_CLI_AdapterGuide({ variant = "full" }: iGM_CLI_AdapterGuideProps) {
  const { locale } = iGM_CLI_UseLocale();
  const messages = iGM_CLI_GetMessages(locale);
  const a = messages.docs.adapter;
  /** 联系与团队章节复用 CLI 指南文案（站点与团队信息一致） */
  const contact = messages.docs.cli.contact;
  const sectionIds = iGM_CLI_AdapterVariantSections[variant];

  /** 构建右侧目录：主章节一级；对比项/接口/示例/Q1-Q4 作为二级条目 */
  function iGM_BuildToc(): iGM_CLI_TocItem[] {
    const items: iGM_CLI_TocItem[] = [];
    for (const id of sectionIds) {
      if (id === "contact") {
        items.push({ id, label: contact.title, level: 1 });
        continue;
      }
      items.push({ id, label: a[id].title, level: 1 });

      /* 接入方式对比：两种接入方式为二级条目 */
      if (id === "compare" && variant === "overview") {
        a.compare.options.forEach((option, index) => {
          items.push({
            id: index === 0 ? "cmp-sdk" : "cmp-protocol",
            label: option.name,
            level: 2,
          });
        });
      }

      /* SDK：平台产物 / 导出函数 / 进度结构 / C++ / Zig 为二级条目 */
      if (id === "sdk" && variant === "sdk") {
        items.push({ id: "sdk-libs", label: a.sdk.libsTitle, level: 2 });
        items.push({ id: "sdk-functions", label: a.sdk.exportsTitle, level: 2 });
        items.push({ id: "sdk-struct", label: a.sdk.structTitle, level: 2 });
        items.push({ id: "sdk-cpp", label: a.sdk.cppTitle, level: 2 });
        items.push({ id: "sdk-zig", label: a.sdk.zigTitle, level: 2 });
      }

      /* 适配器协议：四个接口为二级条目 */
      if (id === "protocol" && variant === "protocol") {
        for (const endpoint of iGM_CLI_AdapterEndpoints) {
          items.push({
            id: endpoint.id,
            label: a.protocol[endpoint.messageKey].title,
            level: 2,
          });
        }
      }

      /* 进度事件流：事件类型为二级条目 */
      if (id === "events" && variant === "progress") {
        items.push({ id: "event-types", label: a.events.typesTitle, level: 2 });
      }

      /* 常见问题：Q1-Q4 为二级条目 */
      if (id === "faq") {
        for (let n = 1; n <= 4; n += 1) {
          items.push({ id: `q${n}`, label: `Q${n}`, level: 2 });
        }
      }
    }
    return items;
  }

  /** 章节渲染：按 id 分发到对应章节结构 */
  function iGM_RenderSection(id: iGM_CLI_AdapterSectionId) {
    switch (id) {
      /* 章节一 适配器总览 */
      case "overview":
        return (
          <section id="overview" className={shared.section}>
            <h2 className={shared.h2}>{a.overview.title}</h2>
            <p className={shared.p}>{a.overview.body}</p>
            <p className={shared.subLabel}>{a.overview.goalsTitle}</p>
            <div className={styles.goalList}>
              {a.overview.goals.map((goal) => (
                <span key={goal} className={styles.goalChip}>
                  {goal}
                </span>
              ))}
            </div>
          </section>
        );

      /* 章节二 接入方式对比 */
      case "compare":
        return (
          <section id="compare" className={shared.section}>
            <h2 className={shared.h2}>{a.compare.title}</h2>
            <p className={shared.p}>{a.compare.lead}</p>

            <div className={styles.optionGrid}>
              {a.compare.options.map((option, index) => (
                <div
                  key={option.name}
                  id={index === 0 ? "cmp-sdk" : "cmp-protocol"}
                  className={styles.optionCard}
                >
                  <h3 className={styles.optionTitle}>{option.name}</h3>
                  <div className={styles.optionField}>
                    <span className={styles.optionFieldLabel}>
                      {a.compare.fieldForm}
                    </span>
                    <span className={styles.optionFieldValue}>{option.form}</span>
                  </div>
                  <div className={styles.optionField}>
                    <span className={styles.optionFieldLabel}>
                      {a.compare.fieldLangs}
                    </span>
                    <span className={styles.optionFieldValue}>{option.langs}</span>
                  </div>
                  <div className={styles.optionField}>
                    <span className={styles.optionFieldLabel}>
                      {a.compare.fieldPros}
                    </span>
                    <ul className={shared.bulletList}>
                      {option.pros.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.optionField}>
                    <span className={styles.optionFieldLabel}>
                      {a.compare.fieldCons}
                    </span>
                    <ul className={shared.bulletList}>
                      {option.cons.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>{a.compare.table.dimCol}</th>
                    <th className={styles.th}>{a.compare.table.sdkCol}</th>
                    <th className={styles.th}>{a.compare.table.protoCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.compare.table.rows.map((row) => (
                    <tr key={row.dim}>
                      <td className={`${styles.td} ${styles.tdDim}`}>{row.dim}</td>
                      <td className={styles.td}>{row.sdk}</td>
                      <td className={styles.td}>{row.proto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );

      /* 章节三 SDK 嵌入（C ABI） */
      case "sdk":
        return (
          <section id="sdk" className={shared.section}>
            <h2 className={shared.h2}>{a.sdk.title}</h2>
            <p className={shared.p}>{a.sdk.lead}</p>

            <div id="sdk-libs" className={shared.subBlock}>
              <h3 className={shared.h3}>{a.sdk.libsTitle}</h3>
              <ul className={styles.libList}>
                {iGM_CLI_AdapterLibs.map((lib) => (
                  <li key={lib.id} className={styles.libRow}>
                    <span className={styles.libPlatform}>{lib.platform}</span>
                    <code className={styles.libFile}>{lib.file}</code>
                  </li>
                ))}
              </ul>
            </div>

            <div id="sdk-functions" className={shared.subBlock}>
              <h3 className={shared.h3}>{a.sdk.exportsTitle}</h3>
              <IGM_CLI_CodeBlock label="c" code={iGM_CLI_AdapterExportsC} />
            </div>

            <div id="sdk-struct" className={shared.subBlock}>
              <h3 className={shared.h3}>{a.sdk.structTitle}</h3>
              <IGM_CLI_CodeBlock label="c" code={iGM_CLI_AdapterStructC} />
            </div>

            <div id="sdk-cpp" className={shared.subBlock}>
              <h3 className={shared.h3}>{a.sdk.cppTitle}</h3>
              <IGM_CLI_CodeBlock label="cpp" code={iGM_CLI_AdapterCppExample} />
            </div>

            <div id="sdk-zig" className={shared.subBlock}>
              <h3 className={shared.h3}>{a.sdk.zigTitle}</h3>
              <IGM_CLI_CodeBlock label="zig" code={iGM_CLI_AdapterZigExample} />
            </div>
          </section>
        );

      /* 章节四 适配器协议（HTTP + WebSocket） */
      case "protocol":
        return (
          <section id="protocol" className={shared.section}>
            <h2 className={shared.h2}>{a.protocol.title}</h2>
            <p className={shared.p}>{a.protocol.lead}</p>
            <div className={styles.prefixLine}>
              <span className={shared.subLabel}>{a.protocol.prefixLabel}</span>
              <code className={shared.inlineCode}>{iGM_CLI_AdapterApiPrefix}</code>
            </div>

            {iGM_CLI_AdapterEndpoints.map((endpoint) => {
              const endpointMessages = a.protocol[endpoint.messageKey];
              return (
                <div key={endpoint.id} id={endpoint.id} className={shared.subBlock}>
                  <h3 className={shared.h3}>{endpointMessages.title}</h3>
                  <div className={styles.endpointLine}>
                    <span className={styles.methodBadge}>{endpoint.method}</span>
                    <code className={styles.apiPath}>{endpoint.path}</code>
                  </div>
                  <p className={shared.p}>{endpointMessages.desc}</p>

                  {endpoint.messageKey === "create" ? (
                    <>
                      <p className={shared.subLabel}>{a.protocol.create.reqTitle}</p>
                      <IGM_CLI_CodeBlock
                        label="json"
                        code={iGM_CLI_AdapterCreateReqJson}
                      />
                      <div className={styles.codeGap}>
                        <p className={shared.subLabel}>{a.protocol.create.respTitle}</p>
                        <IGM_CLI_CodeBlock
                          label="json"
                          code={iGM_CLI_AdapterCreateRespJson}
                        />
                      </div>
                    </>
                  ) : null}

                  {endpoint.messageKey === "query" ? (
                    <>
                      <p className={shared.subLabel}>{a.protocol.query.respTitle}</p>
                      <IGM_CLI_CodeBlock
                        label="json"
                        code={iGM_CLI_AdapterProgressRespJson}
                      />
                    </>
                  ) : null}
                </div>
              );
            })}
          </section>
        );

      /* 章节五 进度事件流定义 */
      case "events":
        return (
          <section id="events" className={shared.section}>
            <h2 className={shared.h2}>{a.events.title}</h2>
            <p className={shared.p}>{a.events.lead}</p>
            <IGM_CLI_CodeBlock label="json" code={iGM_CLI_AdapterEventJson} />

            <div id="event-types" className={shared.subBlock}>
              <h3 className={shared.h3}>{a.events.typesTitle}</h3>
              <ul className={styles.eventList}>
                {iGM_CLI_AdapterEventTypes.map((event) => (
                  <li key={event.name} className={styles.eventRow}>
                    <span className={styles.eventName}>{event.name}</span>
                    <span className={styles.eventDesc}>
                      {a.events.types[event.name]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );

      /* 章节六 无终端弹窗要点 */
      case "terminal":
        return (
          <section id="terminal" className={shared.section}>
            <h2 className={shared.h2}>{a.terminal.title}</h2>
            <ol className={shared.orderList}>
              <li>{a.terminal.items[0]}</li>
              <li>
                {a.terminal.items[1]}
                <ul className={styles.platformHintList}>
                  <li>{a.terminal.win}</li>
                  <li>{a.terminal.unix}</li>
                </ul>
              </li>
            </ol>
            <p className={styles.warningBox}>{a.terminal.forbid}</p>
          </section>
        );

      /* 章节七 常见问题 */
      case "faq": {
        const questions = [a.faq.q1, a.faq.q2, a.faq.q3, a.faq.q4];
        const answers = [a.faq.a1, a.faq.a2, a.faq.a3, a.faq.a4];
        return (
          <section id="faq" className={shared.section}>
            <h2 className={shared.h2}>{a.faq.title}</h2>
            {variant === "full" ? (
              <>
                <p className={shared.p}>{a.faq.hint}</p>
                <ul className={shared.faqQuestionList}>
                  {questions.map((question, index) => (
                    <li
                      key={`q${index + 1}`}
                      id={`q${index + 1}`}
                      className={shared.faqQuestion}
                    >
                      <span className={shared.qBadge}>Q{index + 1}</span>
                      <span>{question}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={iGM_CLI_LocalePath("/docs/adapter/faq", locale)}
                  className={shared.textLink}
                >
                  {a.faq.viewAll}
                </Link>
              </>
            ) : (
              <div className={shared.faqAnswerList}>
                {questions.map((question, index) => (
                  <div
                    key={`q${index + 1}`}
                    id={`q${index + 1}`}
                    className={shared.faqItem}
                  >
                    <h3 className={shared.faqQuestionTitle}>
                      <span className={shared.qBadge}>Q{index + 1}</span>
                      {question}
                    </h3>
                    <p className={shared.p}>{answers[index]}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      }

      /* 章节八 联系与团队（复用 CLI 指南联系文案与联系方式） */
      case "contact":
        return (
          <section id="contact" className={shared.section}>
            <h2 className={shared.h2}>{contact.title}</h2>
            <ul className={shared.contactList}>
              <li className={shared.contactRow}>
                <span className={shared.contactLabel}>{contact.website}</span>
                <a
                  className={shared.textLink}
                  href="https://igcraftlit.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://igcraftlit.com
                </a>
              </li>
              <li className={shared.contactRow}>
                <span className={shared.contactLabel}>{contact.email}</span>
                <span className={shared.contactValue}>
                  <a className={shared.textLink} href="mailto:igcraftlit@outlook.com">
                    igcraftlit@outlook.com
                  </a>
                  {" (.Net) / "}
                  <a className={shared.textLink} href="mailto:igcraftlit@163.com">
                    igcraftlit@163.com
                  </a>
                  {" (.CN)"}
                </span>
              </li>
              <li className={shared.contactBuilt}>{contact.built}</li>
            </ul>
          </section>
        );

      default:
        return null;
    }
  }

  const pageTitleKey = iGM_CLI_AdapterPageTitleKey[variant] as keyof typeof messages.pages;
  const leadKey = iGM_CLI_AdapterLeadKey[variant] as keyof typeof messages.docs.leads;

  return (
    <IGM_CLI_AdapterLayout tocItems={iGM_BuildToc()}>
      {/* 正文页头：页面标题 + 本章导言 */}
      <header className={shared.articleHead}>
        <h1 className={shared.h1}>{messages.pages[pageTitleKey].title}</h1>
        <p className={shared.lead}>{messages.docs.leads[leadKey]}</p>
      </header>

      {sectionIds.map((id) => (
        <Fragment key={id}>{iGM_RenderSection(id)}</Fragment>
      ))}
    </IGM_CLI_AdapterLayout>
  );
}

// 导出 //
export default iGM_CLI_AdapterGuide;
