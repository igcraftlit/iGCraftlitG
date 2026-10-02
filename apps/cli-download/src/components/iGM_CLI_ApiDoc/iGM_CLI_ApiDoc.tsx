/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_ApiDoc/iGM_CLI_ApiDoc.tsx
 * 所属层：前端 / 页面内容组件层
 * 路由：/{locale}/api
 * 模块：iGM_CLI_Downloader
 * 作用：API 参考正文——概述与接入流程、端点列表、请求与响应格式、错误码表、
 *       鉴权方式、限流与配额、示例请求（curl / fetch / Bun / Python）与常见问题
 * 内容：长文内容来自 iGM_CLI_ApiDocContent（仅 zh-CN / en，其余语言回退 en）；
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
import { iGM_CLI_ApiDocContent } from "../../i18n/iGM_CLI_ApiDocContent";
import { iGM_CLI_ApiSdkNavItems } from "../../i18n/iGM_CLI_ApiSdkNav";
import {
  iGM_CLI_AdapterApiPrefix,
  iGM_CLI_AdapterCreateReqJson,
  iGM_CLI_AdapterCreateRespJson,
  iGM_CLI_AdapterEventJson,
  iGM_CLI_AdapterProgressRespJson,
  iGM_CLI_ApiAuthHeader,
  iGM_CLI_ApiBaseUrl,
  iGM_CLI_ApiBunExample,
  iGM_CLI_ApiCurlExample,
  iGM_CLI_ApiEnvelopeJson,
  iGM_CLI_ApiFetchExample,
  iGM_CLI_ApiPythonExample,
} from "../iGM_CLI_AdapterGuide/iGM_CLI_AdapterSnippets";
import shared from "../iGM_CLI_CliGuide/iGM_CLI_DocContent.module.css";
import adapter from "../iGM_CLI_AdapterGuide/iGM_CLI_AdapterDoc.module.css";

// 类型定义 //
// （正文结构由 iGM_CLI_ApiDocContent 定义，本组件仅负责渲染）

// 核心逻辑 //
/** API 参考正文 */
export function iGM_CLI_ApiDoc() {
  const { locale } = iGM_CLI_UseLocale();
  const s = iGM_CLI_ApiDocContent[iGM_CLI_ResolveDocLocale(locale)];

  /** 右侧目录：八个一级章节 */
  const tocItems: iGM_CLI_TocItem[] = [
    { id: "api-overview", label: s.overview.title, level: 1 },
    { id: "api-endpoints", label: s.endpoints.title, level: 1 },
    { id: "api-format", label: s.format.title, level: 1 },
    { id: "api-errors", label: s.errors.title, level: 1 },
    { id: "api-auth", label: s.auth.title, level: 1 },
    { id: "api-ratelimit", label: s.rateLimit.title, level: 1 },
    { id: "api-examples", label: s.examples.title, level: 1 },
    { id: "api-faq", label: s.faq.title, level: 1 },
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

      {/* 章节一 概述与接入流程 */}
      <section id="api-overview" className={shared.section}>
        <h2 className={shared.h2}>{s.overview.title}</h2>
        <p className={shared.p}>{s.overview.body}</p>
        <div className={adapter.prefixLine}>
          <span className={shared.subLabel}>{s.overview.baseUrlLabel}</span>
          <code className={shared.inlineCode}>{iGM_CLI_ApiBaseUrl}</code>
          <code className={shared.inlineCode}>{iGM_CLI_AdapterApiPrefix}</code>
        </div>
        <h3 className={shared.h3}>{s.overview.flowTitle}</h3>
        <ol className={shared.orderList}>
          {s.overview.flow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h3 className={shared.h3}>{s.overview.modelTitle}</h3>
        <ul className={shared.bulletList}>
          {s.overview.models.map((model) => (
            <li key={model.name}>
              <strong>{model.name}</strong>：{model.desc}
            </li>
          ))}
        </ul>
      </section>

      {/* 章节二 端点列表 */}
      <section id="api-endpoints" className={shared.section}>
        <h2 className={shared.h2}>{s.endpoints.title}</h2>
        <p className={shared.p}>{s.endpoints.lead}</p>
        <div className={adapter.tableWrap}>
          <table className={adapter.table}>
            <thead>
              <tr>
                <th className={adapter.th}>{s.endpoints.columns.method}</th>
                <th className={adapter.th}>{s.endpoints.columns.path}</th>
                <th className={adapter.th}>{s.endpoints.columns.purpose}</th>
              </tr>
            </thead>
            <tbody>
              {s.endpoints.items.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td className={adapter.td}>
                    <span className={adapter.methodBadge}>{endpoint.method}</span>
                  </td>
                  <td className={adapter.td}>
                    <code className={adapter.apiPath}>{endpoint.path}</code>
                  </td>
                  <td className={adapter.td}>{endpoint.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 章节三 请求参数与响应格式 */}
      <section id="api-format" className={shared.section}>
        <h2 className={shared.h2}>{s.format.title}</h2>
        <p className={shared.p}>{s.format.lead}</p>

        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.format.envelopeTitle}</h3>
          <p className={shared.p}>{s.format.envelopeNote}</p>
          <IGM_CLI_CodeBlock label="json" code={iGM_CLI_ApiEnvelopeJson} />
          <div className={adapter.tableWrap}>
            <table className={adapter.table}>
              <thead>
                <tr>
                  <th className={adapter.th}>{s.format.columns.field}</th>
                  <th className={adapter.th}>{s.format.columns.desc}</th>
                </tr>
              </thead>
              <tbody>
                {s.format.fields.map((field) => (
                  <tr key={field.name}>
                    <td className={`${adapter.td} ${adapter.tdDim}`}>
                      <code className={adapter.apiPath}>{field.name}</code>
                    </td>
                    <td className={adapter.td}>{field.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.format.createReqTitle}</h3>
          <IGM_CLI_CodeBlock label="json" code={iGM_CLI_AdapterCreateReqJson} />
        </div>
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.format.createRespTitle}</h3>
          <IGM_CLI_CodeBlock label="json" code={iGM_CLI_AdapterCreateRespJson} />
        </div>
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.format.progressTitle}</h3>
          <IGM_CLI_CodeBlock label="json" code={iGM_CLI_AdapterProgressRespJson} />
        </div>
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.format.eventTitle}</h3>
          <IGM_CLI_CodeBlock label="json" code={iGM_CLI_AdapterEventJson} />
        </div>
      </section>

      {/* 章节四 错误码表 */}
      <section id="api-errors" className={shared.section}>
        <h2 className={shared.h2}>{s.errors.title}</h2>
        <p className={shared.p}>{s.errors.lead}</p>
        <div className={adapter.tableWrap}>
          <table className={adapter.table}>
            <thead>
              <tr>
                <th className={adapter.th}>{s.errors.columns.code}</th>
                <th className={adapter.th}>{s.errors.columns.http}</th>
                <th className={adapter.th}>{s.errors.columns.meaning}</th>
              </tr>
            </thead>
            <tbody>
              {s.errors.items.map((item) => (
                <tr key={item.code}>
                  <td className={adapter.td}>
                    <code className={adapter.apiPath}>{item.code}</code>
                  </td>
                  <td className={`${adapter.td} ${adapter.tdDim}`}>{item.http}</td>
                  <td className={adapter.td}>{item.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 章节五 鉴权方式 */}
      <section id="api-auth" className={shared.section}>
        <h2 className={shared.h2}>{s.auth.title}</h2>
        <p className={shared.p}>{s.auth.lead}</p>
        <ul className={shared.bulletList}>
          {s.auth.items.map((item) => (
            <li key={item.name}>
              <strong>{item.name}</strong>：{item.desc}
            </li>
          ))}
        </ul>
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.auth.headerTitle}</h3>
          <IGM_CLI_CodeBlock label="http" code={iGM_CLI_ApiAuthHeader} />
        </div>
      </section>

      {/* 章节六 限流规则与配额 */}
      <section id="api-ratelimit" className={shared.section}>
        <h2 className={shared.h2}>{s.rateLimit.title}</h2>
        <p className={shared.p}>{s.rateLimit.lead}</p>
        <div className={adapter.tableWrap}>
          <table className={adapter.table}>
            <thead>
              <tr>
                <th className={adapter.th}>{s.rateLimit.columns.name}</th>
                <th className={adapter.th}>{s.rateLimit.columns.value}</th>
                <th className={adapter.th}>{s.rateLimit.columns.desc}</th>
              </tr>
            </thead>
            <tbody>
              {s.rateLimit.items.map((item) => (
                <tr key={item.name}>
                  <td className={`${adapter.td} ${adapter.tdDim}`}>{item.name}</td>
                  <td className={adapter.td}>{item.value}</td>
                  <td className={adapter.td}>{item.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 章节七 示例请求 */}
      <section id="api-examples" className={shared.section}>
        <h2 className={shared.h2}>{s.examples.title}</h2>
        <p className={shared.p}>{s.examples.lead}</p>
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.examples.labels.curl}</h3>
          <IGM_CLI_CodeBlock label="shell" code={iGM_CLI_ApiCurlExample} />
        </div>
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.examples.labels.fetch}</h3>
          <IGM_CLI_CodeBlock label="javascript" code={iGM_CLI_ApiFetchExample} />
        </div>
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.examples.labels.bun}</h3>
          <IGM_CLI_CodeBlock label="typescript" code={iGM_CLI_ApiBunExample} />
        </div>
        <div className={shared.subBlock}>
          <h3 className={shared.h3}>{s.examples.labels.python}</h3>
          <IGM_CLI_CodeBlock label="python" code={iGM_CLI_ApiPythonExample} />
        </div>
      </section>

      {/* 章节八 常见问题 */}
      <section id="api-faq" className={shared.section}>
        <h2 className={shared.h2}>{s.faq.title}</h2>
        <div className={shared.faqAnswerList}>
          {s.faq.items.map((item, index) => (
            <div key={item.q} id={`api-q${index + 1}`} className={shared.faqItem}>
              <h3 className={shared.faqQuestionTitle}>
                <span className={shared.qBadge}>Q{index + 1}</span>
                {item.q}
              </h3>
              <p className={shared.p}>{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </IGM_CLI_DocLayout>
  );
}

// 导出 //
export default iGM_CLI_ApiDoc;
