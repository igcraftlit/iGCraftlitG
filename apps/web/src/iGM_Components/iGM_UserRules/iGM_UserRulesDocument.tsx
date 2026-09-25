/**
 * 文件路径：apps/web/src/iGM_Components/iGM_UserRules/iGM_UserRulesDocument.tsx
 * 所属层：前端 / 通用组件层
 * 路由：/G_UserRules（注册向导第四框跳转的独立阅读页）
 * 模块：iGM_UserRules
 * 作用：渲染《iGCraftLit 用户管理规定》全文（七章 + 常见问题 Q1-Q4），
 *       每个章节与处罚条目、问答均带锚点 id，供 iGM_PageToc 定位
 * 内容：文案类型定义、useMessages 读取、目录条目构建器、规定正文
 */

// 导入依赖 //
"use client";

import { useMessages } from "next-intl";
import type { iGM_TocItem } from "../iGM_PageToc/iGM_PageToc";
import styles from "./iGM_UserRules.module.css";

// 类型定义 //
export interface iGM_RulesPenalty {
  id: string;
  title: string;
  detail: string;
}

export interface iGM_RulesChapter {
  id: string;
  title: string;
  /** 纯叙述段落（第一章） */
  paragraphs?: string[];
  /** 编号条目（第二/三/四/五/七章） */
  items?: string[];
  /** 引导段落（第六章） */
  intro?: string;
  /** 第六章量化处罚条目（带子锚点） */
  penalties?: iGM_RulesPenalty[];
}

export interface iGM_RulesFaqItem {
  id: string;
  q: string;
  a: string;
}

export interface iGM_RulesMessages {
  title: string;
  tocTitle: string;
  chapters: iGM_RulesChapter[];
  faq: {
    title: string;
    items: iGM_RulesFaqItem[];
  };
  /** 模块八第三轮：独立页 IP 检测告知与注册同意操作条文案 */
  ipDetecting: string;
  ipNotice: string;
  ipDetectFailed: string;
  registerHint: string;
  scrollToAccept: string;
  acceptAndReturn: string;
}

// 核心逻辑 //
/** 读取当前语言的用户管理规定文案 */
export function iGM_UseRulesMessages(): iGM_RulesMessages {
  const messages = useMessages() as unknown as {
    userRules: iGM_RulesMessages;
  };
  return messages.userRules;
}

/** 依据规定文案构建目录条目：七章 + 6.1-6.6 子项 + 常见问题 + Q1-Q4 */
export function iGM_BuildRulesToc(rules: iGM_RulesMessages): iGM_TocItem[] {
  const items: iGM_TocItem[] = [];
  rules.chapters.forEach((chapter, chapterIndex) => {
    items.push({ id: chapter.id, label: chapter.title, level: 1 });
    chapter.penalties?.forEach((penalty, penaltyIndex) => {
      items.push({
        id: penalty.id,
        label: `${chapterIndex + 1}.${penaltyIndex + 1} ${penalty.title}`,
        level: 2,
      });
    });
  });
  items.push({ id: "faq", label: rules.faq.title, level: 1 });
  rules.faq.items.forEach((item) => {
    items.push({ id: item.id, label: item.q, level: 2 });
  });
  return items;
}

/** 规定正文文档（独立页 framed 卡片；弹窗内 framed=false 透明嵌入） */
export function iGM_UserRulesDocument({
  framed = true,
}: {
  framed?: boolean;
}) {
  const rules = iGM_UseRulesMessages();

  return (
    <article className={framed ? styles.article : styles.articlePlain}>
      {framed && <h1 className={styles.docTitle}>{rules.title}</h1>}

      {rules.chapters.map((chapter, chapterIndex) => (
        <section
          key={chapter.id}
          id={chapter.id}
          className={styles.chapter}
        >
          <h2 className={styles.chapterTitle}>{chapter.title}</h2>

          {chapter.paragraphs?.map((paragraph, index) => (
            <p key={index} className={styles.paragraph}>
              {paragraph}
            </p>
          ))}

          {chapter.items && (
            <ol className={styles.itemList}>
              {chapter.items.map((text, index) => (
                <li key={index} className={styles.item}>
                  <span className={styles.itemIndex} aria-hidden>
                    {index + 1}.
                  </span>
                  <span className={styles.itemText}>{text}</span>
                </li>
              ))}
            </ol>
          )}

          {chapter.intro && (
            <p className={styles.paragraph}>{chapter.intro}</p>
          )}

          {chapter.penalties && (
            <div className={styles.penaltyList}>
              {chapter.penalties.map((penalty, penaltyIndex) => (
                <section
                  key={penalty.id}
                  id={penalty.id}
                  className={styles.penaltyCard}
                >
                  <h3 className={styles.subTitle}>
                    <span className={styles.subIndex}>
                      {chapterIndex + 1}.{penaltyIndex + 1}
                    </span>
                    {penalty.title}
                  </h3>
                  <p className={styles.paragraph}>{penalty.detail}</p>
                </section>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* 常见问题 Q1-Q4 */}
      <section id="faq" className={styles.chapter}>
        <h2 className={styles.chapterTitle}>{rules.faq.title}</h2>
        <div className={styles.faqList}>
          {rules.faq.items.map((item) => (
            <section key={item.id} id={item.id} className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>{item.q}</h3>
              <p className={styles.paragraph}>{item.a}</p>
            </section>
          ))}
        </div>
      </section>
    </article>
  );
}

// 导出 //
export default iGM_UserRulesDocument;
