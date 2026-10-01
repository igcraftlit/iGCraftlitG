/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_OAuthDocs/iGM_CLI_OAuthDocs.tsx
 * 所属层：前端 / 组件层
 * 路由：/oauth/docs
 * 模块：iGM_CLI_OAuthDocs
 * 作用：OAuth 2.0 / OIDC 第三方接入文档——接入流程、端点、scope、PKCE、
 *       示例代码、令牌有效时长、错误码、安全建议、前端 401 处理建议
 * 内容：正文按语言包 oauth.docs.sections 渲染（支持段落 / 列表 / 代码块），
 *       桌面右侧 ON THIS PAGE 目录（复用 iGM_CLI_DocToc），窄屏折叠为顶部横向条
 */

// 导入依赖 //
"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { iGM_CLI_DocToc as IGM_CLI_DocToc } from "../iGM_CLI_DocToc/iGM_CLI_DocToc";
import { iGM_CLI_OAuthShell as IGM_CLI_OAuthShell } from "../iGM_CLI_OAuthShell/iGM_CLI_OAuthShell";
import styles from "../iGM_CLI_OAuthShell/iGM_CLI_OAuth.module.css";

// 类型定义 //
/** 文档章节（语言包结构，顺序即展示顺序与目录顺序） */
interface iGM_CLI_OAuthDocSection {
  /** 章节锚点 id（用于目录跳转） */
  id: string;
  /** 章节标题 */
  title: string;
  /** 段落文本 */
  paragraphs?: string[];
  /** 列表条目 */
  bullets?: string[];
  /** 代码块（可选） */
  code?: string;
}

// 核心逻辑 //
/** OAuth / OIDC 接入文档页（公开） */
export function iGM_CLI_OAuthDocs() {
  const t = useTranslations();

  // 章节内容来自语言包，未配置时回退空列表
  const sections = useMemo(
    () => (t.raw("oauth.docs.sections") as iGM_CLI_OAuthDocSection[]) ?? [],
    [t],
  );

  /** 目录条目：章节分级展示 */
  const tocItems = useMemo(
    () =>
      sections.map((section) => ({
        id: section.id,
        label: section.title,
        level: 1 as const,
      })),
    [sections],
  );

  return (
    <IGM_CLI_OAuthShell active="docs">
      <p className={styles.pageDesc}>{t("oauth.docs.intro")}</p>

      <div className={styles.body}>
        <div className={styles.docLayout}>
          {/* 窄屏：目录折叠到页面顶部 */}
          <div className={styles.tocTop}>
            <IGM_CLI_DocToc
              variant="top"
              items={tocItems}
              title={t("oauth.docs.tocTitle")}
            />
          </div>

          <article className={styles.docBody}>
            {sections.map((section) => (
              <section key={section.id} className={styles.docSection}>
                <h2 id={section.id} className={styles.docH2}>
                  {section.title}
                </h2>
                {section.paragraphs?.map((paragraph, index) => (
                  <p key={index} className={styles.docP}>
                    {paragraph}
                  </p>
                ))}
                {section.bullets && section.bullets.length > 0 && (
                  <ul className={styles.docList}>
                    {section.bullets.map((bullet, index) => (
                      <li key={index}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {section.code && (
                  <div className={styles.codeBlock}>
                    <pre className={styles.codePre}>{section.code}</pre>
                  </div>
                )}
              </section>
            ))}
          </article>

          {/* 桌面：右侧常驻目录 */}
          <aside className={styles.tocRail}>
            <IGM_CLI_DocToc items={tocItems} title={t("oauth.docs.tocTitle")} />
          </aside>
        </div>
      </div>
    </IGM_CLI_OAuthShell>
  );
}

// 导出 //
export default iGM_CLI_OAuthDocs;
