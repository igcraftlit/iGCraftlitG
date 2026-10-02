/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_SdkDoc/iGM_CLI_SdkDoc.tsx
 * 所属层：前端 / 页面内容组件层
 * 路由：/{locale}/sdk
 * 模块：iGM_CLI_Downloader
 * 作用：SDK 文档正文——概述与支持平台、下载、bun:ffi 集成、核心函数、
 *       进度回调与事件、错误处理、完整示例项目，以及七章手把手新手教程
 * 内容：长文内容来自 iGM_CLI_SdkDocContent（仅 zh-CN / en，其余语言回退 en）；
 *       代码常量来自 iGM_CLI_AdapterSnippets；布局复用 iGM_CLI_DocLayout，
 *       排版复用 iGM_CLI_DocContent 与 iGM_CLI_AdapterDoc 两个样式模块
 */

// 导入依赖 //
"use client";

import { iGM_CLI_DocLayout as IGM_CLI_DocLayout } from "../iGM_CLI_DocLayout/iGM_CLI_DocLayout";
import { iGM_CLI_CodeBlock as IGM_CLI_CodeBlock } from "../iGM_CLI_CodeBlock/iGM_CLI_CodeBlock";
import type { iGM_CLI_TocItem } from "../iGM_CLI_DocToc/iGM_CLI_DocToc";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import { iGM_CLI_ResolveDocLocale } from "../../i18n/iGM_CLI_DocLocale";
import { iGM_CLI_SdkDocContent } from "../../i18n/iGM_CLI_SdkDocContent";
import { iGM_CLI_ApiSdkNavItems } from "../../i18n/iGM_CLI_ApiSdkNav";
import {
  iGM_CLI_AdapterEventJson,
  iGM_CLI_AdapterExportsC,
  iGM_CLI_AdapterLibs,
  iGM_CLI_AdapterStructC,
  iGM_CLI_SdkBunFfiExample,
  iGM_CLI_SdkMinimalProject,
} from "../iGM_CLI_AdapterGuide/iGM_CLI_AdapterSnippets";
import shared from "../iGM_CLI_CliGuide/iGM_CLI_DocContent.module.css";
import adapter from "../iGM_CLI_AdapterGuide/iGM_CLI_AdapterDoc.module.css";

// 类型定义 //
// （正文结构由 iGM_CLI_SdkDocContent 定义，本组件仅负责渲染）

// 核心逻辑 //
/** 最小示例的运行命令（语言无关） */
const iGM_CLI_SdkRunCommand = "bun iGM_SDK.ts";

/** 最小示例的预期输出（中性文案，跨语言通用） */
const iGM_CLI_SdkExpectedOutput = `iGM download engine loaded
[ 12.5%] 950272/7602176 bytes  speed 812 KB/s  eta 8s
[ 45.0%] 3420979/7602176 bytes  speed 845 KB/s  eta 5s
[ 88.1%] 6698119/7602176 bytes  speed 902 KB/s  eta 1s
[100.0%] 7602176/7602176 bytes  speed   0 KB/s  eta 0s
task complete`;

/** SDK 文档正文 */
export function iGM_CLI_SdkDoc() {
  const { locale } = iGM_CLI_UseLocale();
  const s = iGM_CLI_SdkDocContent[iGM_CLI_ResolveDocLocale(locale)];

  /** 右侧目录：主章节一级；教程七章作为二级条目 */
  const tocItems: iGM_CLI_TocItem[] = [
    { id: "sdk-overview", label: s.overview.title, level: 1 },
    { id: "sdk-download", label: s.download.title, level: 1 },
    { id: "sdk-integrate", label: s.integrate.title, level: 1 },
    { id: "sdk-functions", label: s.functions.title, level: 1 },
    { id: "sdk-progress", label: s.progress.title, level: 1 },
    { id: "sdk-errors", label: s.errors.title, level: 1 },
    { id: "sdk-sample", label: s.sample.title, level: 1 },
    { id: "sdk-tutorial", label: s.tutorial.title, level: 1 },
    ...s.tutorial.steps.map((step) => ({
      id: step.id,
      label: step.title,
      level: 2 as const,
    })),
  ];

  return (
    <IGM_CLI_DocLayout
      tocItems={tocItems}
      navItems={iGM_CLI_ApiSdkNavItems}
      groupLabelKey="docs.sidebar.title"
    >
      {/* 页头 */}
      <header className={shared.articleHead}>
        <h1 className={shared.h1}>{s.title}</h1>
        <p className={shared.lead}>{s.lead}</p>
      </header>

      {/* 章节一 概述与支持平台 */}
      <section id="sdk-overview" className={shared.section}>
        <h2 className={shared.h2}>{s.overview.title}</h2>
        <p className={shared.p}>{s.overview.lead}</p>
        <h3 className={shared.h3}>{s.overview.platformsTitle}</h3>
        <ul className={shared.bulletList}>
          {s.overview.platforms.map((platform) => (
            <li key={platform.name}>
              <strong>{platform.name}</strong>：{platform.desc}
            </li>
          ))}
        </ul>
      </section>

      {/* 章节二 下载 SDK */}
      <section id="sdk-download" className={shared.section}>
        <h2 className={shared.h2}>{s.download.title}</h2>
        <p className={shared.p}>{s.download.lead}</p>
        <p className={shared.subLabel}>{s.download.fileLabel}</p>
        <ul className={adapter.libList}>
          {iGM_CLI_AdapterLibs.map((lib) => (
            <li key={lib.id} className={adapter.libRow}>
              <span className={adapter.libPlatform}>{lib.platform}</span>
              <code className={adapter.libFile}>{lib.file}</code>
            </li>
          ))}
        </ul>
        <p className={shared.p}>{s.download.hint}</p>
      </section>

      {/* 章节三 集成方式（bun:ffi 加载 C ABI） */}
      <section id="sdk-integrate" className={shared.section}>
        <h2 className={shared.h2}>{s.integrate.title}</h2>
        <p className={shared.p}>{s.integrate.lead}</p>
        <h3 className={shared.h3}>{s.integrate.prosTitle}</h3>
        <ul className={shared.bulletList}>
          {s.integrate.pros.map((pro) => (
            <li key={pro}>{pro}</li>
          ))}
        </ul>
        <IGM_CLI_CodeBlock label="typescript" code={iGM_CLI_SdkBunFfiExample} />
      </section>

      {/* 章节四 核心函数说明 */}
      <section id="sdk-functions" className={shared.section}>
        <h2 className={shared.h2}>{s.functions.title}</h2>
        <p className={shared.p}>{s.functions.lead}</p>
        <div className={adapter.tableWrap}>
          <table className={adapter.table}>
            <thead>
              <tr>
                <th className={adapter.th}>{s.functions.columns.name}</th>
                <th className={adapter.th}>{s.functions.columns.desc}</th>
              </tr>
            </thead>
            <tbody>
              {s.functions.items.map((item) => (
                <tr key={item.name}>
                  <td className={`${adapter.td} ${adapter.tdDim}`}>
                    <code className={adapter.apiPath}>{item.name}</code>
                  </td>
                  <td className={adapter.td}>{item.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <IGM_CLI_CodeBlock label="c" code={iGM_CLI_AdapterExportsC} />
      </section>

      {/* 章节五 进度回调与事件结构 */}
      <section id="sdk-progress" className={shared.section}>
        <h2 className={shared.h2}>{s.progress.title}</h2>
        <p className={shared.p}>{s.progress.lead}</p>
        <IGM_CLI_CodeBlock label="c" code={iGM_CLI_AdapterStructC} />
        <h3 className={shared.h3}>{s.progress.fieldsTitle}</h3>
        <ul className={shared.bulletList}>
          {s.progress.fields.map((field) => (
            <li key={field.name}>
              <code className={shared.inlineCode}>{field.name}</code>：{field.desc}
            </li>
          ))}
        </ul>
        <h3 className={shared.h3}>{s.progress.eventTitle}</h3>
        <IGM_CLI_CodeBlock label="json" code={iGM_CLI_AdapterEventJson} />
      </section>

      {/* 章节六 错误处理 */}
      <section id="sdk-errors" className={shared.section}>
        <h2 className={shared.h2}>{s.errors.title}</h2>
        <p className={shared.p}>{s.errors.lead}</p>
        <ul className={shared.bulletList}>
          {s.errors.items.map((item) => (
            <li key={item.name}>
              <strong>{item.name}</strong>：{item.desc}
            </li>
          ))}
        </ul>
      </section>

      {/* 章节七 完整示例项目 */}
      <section id="sdk-sample" className={shared.section}>
        <h2 className={shared.h2}>{s.sample.title}</h2>
        <p className={shared.p}>{s.sample.lead}</p>
        <IGM_CLI_CodeBlock label="typescript" code={iGM_CLI_SdkMinimalProject} />
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.sample.runLabel}</h3>
          <IGM_CLI_CodeBlock label="shell" code={iGM_CLI_SdkRunCommand} />
        </div>
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.sample.outputTitle}</h3>
          <IGM_CLI_CodeBlock label="text" code={iGM_CLI_SdkExpectedOutput} />
        </div>
      </section>

      {/* 章节八 手把手新手教程 */}
      <section id="sdk-tutorial" className={shared.section}>
        <h2 className={shared.h2}>{s.tutorial.title}</h2>
        <p className={shared.p}>{s.tutorial.lead}</p>

        {s.tutorial.steps.map((step) => (
          <div key={step.id} id={step.id} className={shared.subBlock}>
            <h3 className={shared.h3}>{step.title}</h3>
            <p className={shared.p}>{step.intro}</p>

            {/* 章节二 / 章节六：穿插可运行代码示例 */}
            {step.id === "tutor-2" ? (
              <IGM_CLI_CodeBlock label="typescript" code={iGM_CLI_SdkBunFfiExample} />
            ) : null}
            {step.id === "tutor-6" ? (
              <IGM_CLI_CodeBlock
                label="typescript"
                code={iGM_CLI_SdkMinimalProject}
              />
            ) : null}

            {step.bullets.length > 0 ? (
              <ul className={shared.bulletList}>
                {step.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}

            {/* 章节七：常见问题问答 */}
            {step.faq ? (
              <div className={shared.faqAnswerList}>
                {step.faq.map((item) => (
                  <div key={item.q} className={shared.faqItem}>
                    <h4 className={shared.faqQuestionTitle}>
                      <span className={shared.qBadge}>Q</span>
                      {item.q}
                    </h4>
                    <p className={shared.p}>{item.a}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </section>
    </IGM_CLI_DocLayout>
  );
}

// 导出 //
export default iGM_CLI_SdkDoc;
