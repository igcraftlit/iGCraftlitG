/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamBlockView/iGM_ExamBlockView.tsx
 * 所属层：前端 / 通用组件层
 * 路由：E_ExamDetail（/detail）、E_Admin_Exam（/admin）
 * 模块：iGM_ExamBlockView
 * 作用：把后端解析出的结构化内容块按类型渲染为学术排版正文，并可在管理端就地编辑
 * 内容：按类型渲染 heading / paragraph / list / table / image / formula / question；
 *       基于 heading 块生成目录导航；编辑态支持修改、上移 / 下移、删除
 * 说明：纯客户端组件；不使用 PDF.js、不加载原始 PDF；图片经 imageBase 接口读取
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  iGM_Exam_ImageUrl,
  type iGM_ExamBlock,
  type iGM_ExamBlockType,
} from "../../iGM_Services/iGM_ExamClient";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../../iGM_i18n/iGM_I18nTypes";
import styles from "./iGM_ExamBlockView.module.css";

// 类型定义 //
interface iGM_ExamBlockViewProps {
  /** 结构化内容块 */
  blocks: iGM_ExamBlock[];
  /** 图片接口前缀（拼接 block.src） */
  imageBase?: string;
  /** 是否展示右侧目录导航，缺省展示 */
  showToc?: boolean;
  /** 是否可编辑（管理端校对使用） */
  editable?: boolean;
  /** 编辑回调：返回调整后的完整内容块数组 */
  onChange?: (blocks: iGM_ExamBlock[]) => void;
}

// 核心逻辑 //
/** 块类型 → 语言包键 */
const iGM_Exam_BlockTypeKeys: Record<iGM_ExamBlockType, iGM_I18nKey> = {
  heading: "blockTypeHeading",
  paragraph: "blockTypeParagraph",
  list: "blockTypeList",
  table: "blockTypeTable",
  image: "blockTypeImage",
  formula: "blockTypeFormula",
  question: "blockTypeQuestion",
};

/** 表格单元格文本 → 二维数组（行内以 | 分隔） */
function iGM_Exam_ParseTable(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

/** 二维数组 → 表格单元格文本（便于编辑） */
function iGM_Exam_FormatTable(rows: string[][]): string {
  return rows.map((row) => row.join(" | ")).join("\n");
}

/** 目录锚点标识 */
function iGM_Exam_BlockAnchor(id: string): string {
  return `igm-exam-block-${id}`;
}

/** 只读：按类型渲染单个内容块 */
function iGM_Exam_ReadOnlyBlock({
  block,
  imageBase,
}: {
  block: iGM_ExamBlock;
  imageBase: string;
}) {
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.level ?? 2, 1), 6);
      const text = block.text ?? "";
      if (level === 1) {
        return <h1 className={styles.h1}>{text}</h1>;
      }
      if (level === 2) {
        return <h2 className={styles.h2}>{text}</h2>;
      }
      if (level === 3) {
        return <h3 className={styles.h3}>{text}</h3>;
      }
      if (level === 4) {
        return <h4 className={styles.h4}>{text}</h4>;
      }
      return <h5 className={styles.h5}>{text}</h5>;
    }
    case "paragraph":
      return <p className={styles.paragraph}>{block.text ?? ""}</p>;
    case "list": {
      const items = block.items ?? [];
      if (items.length === 0) return null;
      return block.ordered ? (
        <ol className={styles.list}>
          {items.map((item, index) => (
            <li key={`${block.id}-${index}`}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul className={styles.list}>
          {items.map((item, index) => (
            <li key={`${block.id}-${index}`}>{item}</li>
          ))}
        </ul>
      );
    }
    case "table": {
      const rows = block.rows ?? [];
      if (rows.length === 0) return null;
      const [head, ...body] = rows;
      return (
        <table className={styles.table}>
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th key={`${block.id}-h-${index}`}>{cell}</th>
              ))}
            </tr>
          </thead>
          {body.length > 0 && (
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={`${block.id}-r-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${block.id}-r-${rowIndex}-c-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      );
    }
    case "image": {
      const url = iGM_Exam_ImageUrl(imageBase, block.src ?? "");
      if (!url) return null;
      return (
        <figure className={styles.figure}>
          {/* 解析图片来自后端接口，尺寸未知，使用原生 img 以保留原始宽高比 */}
          <img className={styles.image} src={url} alt={block.text ?? ""} loading="lazy" />
          {block.text && <figcaption className={styles.caption}>{block.text}</figcaption>}
        </figure>
      );
    }
    case "formula":
      return <div className={`igm-mono ${styles.formula}`}>{block.text ?? ""}</div>;
    case "question":
      return (
        <div className={styles.question}>
          <div className={styles.questionHead}>
            {block.number && (
              <span className={`igm-mono ${styles.questionNum}`}>{block.number}</span>
            )}
            <p className={styles.questionStem}>{block.text ?? ""}</p>
          </div>
          {block.options && block.options.length > 0 && (
            <ul className={styles.options}>
              {block.options.map((option, index) => (
                <li key={`${block.id}-o-${index}`} className={styles.option}>
                  {option}
                </li>
              ))}
            </ul>
          )}
          {(block.answer || block.score !== undefined) && (
            <p className={`igm-mono ${styles.questionMeta}`}>
              {block.answer ? `${block.answer}` : ""}
              {block.score !== undefined ? ` · ${block.score}` : ""}
            </p>
          )}
        </div>
      );
    default:
      return null;
  }
}

/** 编辑态：单个内容块编辑器 */
function iGM_Exam_EditableBlock({
  block,
  index,
  total,
  imageBase,
  onChange,
  onMove,
  onDelete,
}: {
  block: iGM_ExamBlock;
  index: number;
  total: number;
  imageBase: string;
  onChange: (patch: Partial<iGM_ExamBlock>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className={styles.blockWrap}>
      <div className={`igm-mono ${styles.blockBar}`}>
        <span className={styles.blockType}>{t(iGM_Exam_BlockTypeKeys[block.type])}</span>
        {block.page !== undefined && (
          <span className={styles.blockPage}>
            {t("blockPage")} {block.page}
          </span>
        )}
        <span className={styles.blockTools}>
          <button
            type="button"
            className={styles.iconBtn}
            title={t("blockMoveUp")}
            aria-label={t("blockMoveUp")}
            onClick={() => onMove(-1)}
            disabled={index === 0}
          >
            <ArrowUp size={13} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            title={t("blockMoveDown")}
            aria-label={t("blockMoveDown")}
            onClick={() => onMove(1)}
            disabled={index === total - 1}
          >
            <ArrowDown size={13} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.iconDanger}`}
            title={t("blockDelete")}
            aria-label={t("blockDelete")}
            onClick={onDelete}
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </button>
        </span>
      </div>

      <div className={styles.blockBody}>
        {block.type === "heading" && (
          <div className={styles.editRow}>
            <label className={styles.miniField}>
              <span className={`igm-mono ${styles.miniLabel}`}>{t("blockLevel")}</span>
              <select
                className={styles.select}
                value={String(block.level ?? 2)}
                onChange={(e) => onChange({ level: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <input
              className={styles.input}
              value={block.text ?? ""}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder={t("blockTextPlaceholder")}
            />
          </div>
        )}

        {block.type === "paragraph" && (
          <textarea
            className={styles.textarea}
            rows={3}
            value={block.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder={t("blockTextPlaceholder")}
          />
        )}

        {block.type === "formula" && (
          <textarea
            className={`${styles.textarea} igm-mono`}
            rows={2}
            value={block.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder={t("blockTextPlaceholder")}
            spellCheck={false}
          />
        )}

        {block.type === "list" && (
          <>
            <textarea
              className={styles.textarea}
              rows={Math.min(8, (block.items?.length ?? 1) + 1)}
              value={(block.items ?? []).join("\n")}
              onChange={(e) =>
                onChange({
                  items: e.target.value
                    .split(/\r?\n/)
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0),
                })
              }
              placeholder={t("blockListPlaceholder")}
            />
            <p className={`igm-mono ${styles.hint}`}>{t("blockListHint")}</p>
          </>
        )}

        {block.type === "table" && (
          <>
            <textarea
              className={`${styles.textarea} igm-mono`}
              rows={Math.min(10, (block.rows?.length ?? 1) + 1)}
              value={iGM_Exam_FormatTable(block.rows ?? [])}
              onChange={(e) => onChange({ rows: iGM_Exam_ParseTable(e.target.value) })}
              placeholder={t("blockTablePlaceholder")}
              spellCheck={false}
            />
            <p className={`igm-mono ${styles.hint}`}>{t("blockTableHint")}</p>
          </>
        )}

        {block.type === "image" && (
          <figure className={styles.figure}>
            <img
              className={styles.image}
              src={iGM_Exam_ImageUrl(imageBase, block.src ?? "")}
              alt={block.text ?? ""}
            />
            <input
              className={`${styles.input} ${styles.captionInput}`}
              value={block.text ?? ""}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder={t("blockCaptionPlaceholder")}
            />
          </figure>
        )}

        {block.type === "question" && (
          <>
            <div className={styles.editRow}>
              <label className={styles.miniField}>
                <span className={`igm-mono ${styles.miniLabel}`}>{t("blockNumber")}</span>
                <input
                  className={styles.input}
                  value={block.number ?? ""}
                  onChange={(e) => onChange({ number: e.target.value })}
                />
              </label>
              <label className={styles.miniField}>
                <span className={`igm-mono ${styles.miniLabel}`}>{t("blockScore")}</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  value={block.score === undefined ? "" : String(block.score)}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const value = raw === "" ? undefined : Number(raw);
                    onChange({
                      score:
                        value === undefined || Number.isNaN(value) ? undefined : value,
                    });
                  }}
                />
              </label>
            </div>
            <textarea
              className={styles.textarea}
              rows={2}
              value={block.text ?? ""}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder={t("blockQuestionStemPlaceholder")}
            />
            <textarea
              className={styles.textarea}
              rows={Math.min(8, (block.options?.length ?? 1) + 1)}
              value={(block.options ?? []).join("\n")}
              onChange={(e) =>
                onChange({
                  options: e.target.value
                    .split(/\r?\n/)
                    .map((option) => option.trim())
                    .filter((option) => option.length > 0),
                })
              }
              placeholder={t("blockOptionsPlaceholder")}
            />
            <p className={`igm-mono ${styles.hint}`}>{t("blockOptionsHint")}</p>
            <input
              className={styles.input}
              value={block.answer ?? ""}
              onChange={(e) => onChange({ answer: e.target.value })}
              placeholder={t("blockAnswerPlaceholder")}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** 结构化内容块渲染视图 */
export function iGM_ExamBlockView({
  blocks,
  imageBase = "",
  showToc = false,
  editable = false,
  onChange,
}: iGM_ExamBlockViewProps) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [activeAnchor, setActiveAnchor] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  // JSX 组件标识要求首字母大写，此处按既有约定提供别名
  const IGM_Exam_ReadOnlyBlock = iGM_Exam_ReadOnlyBlock;
  const IGM_Exam_EditableBlock = iGM_Exam_EditableBlock;

  /** 标题块及其在 blocks 中的下标 */
  const headings = blocks.reduce<{ index: number; block: iGM_ExamBlock }[]>(
    (acc, block, index) => {
      if (block.type === "heading" && (block.text ?? "").trim().length > 0) {
        acc.push({ index, block });
      }
      return acc;
    },
    [],
  );

  const commit = useCallback(
    (next: iGM_ExamBlock[]) => {
      onChange?.(next);
    },
    [onChange],
  );

  const patchBlock = useCallback(
    (index: number, patch: Partial<iGM_ExamBlock>) => {
      const next = blocks.map((block, i) =>
        i === index ? { ...block, ...patch } : block,
      );
      commit(next);
    },
    [blocks, commit],
  );

  const moveBlock = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return;
      const next = [...blocks];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      commit(next);
    },
    [blocks, commit],
  );

  const deleteBlock = useCallback(
    (index: number) => {
      commit(blocks.filter((_, i) => i !== index));
    },
    [blocks, commit],
  );

  // 只读态：滚动时高亮当前章节
  useEffect(() => {
    if (editable) return;
    const container = contentRef.current;
    if (!container || headings.length === 0) return;
    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-igm-heading='true']"),
    );
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) continue;
          const anchor = record.target.getAttribute("id") ?? "";
          const index = nodes.indexOf(record.target as HTMLElement);
          if (index >= 0) {
            setActiveAnchor(anchor);
            setActiveIndex(index);
          }
        }
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [editable, blocks, headings.length]);

  const scrollToAnchor = useCallback((anchor: string) => {
    const node = document.getElementById(anchor);
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (blocks.length === 0) {
    return <p className={`igm-mono ${styles.empty}`}>{t("detailNoContent")}</p>;
  }

  const showContents = showToc && !editable && headings.length > 0;

  return (
    <div className={`${styles.shell} ${showContents ? "" : styles.solo}`}>
      <article ref={contentRef} className={styles.paper}>
        {blocks.map((block, index) =>
          editable ? (
            <IGM_Exam_EditableBlock
              key={block.id}
              block={block}
              index={index}
              total={blocks.length}
              imageBase={imageBase}
              onChange={(patch) => patchBlock(index, patch)}
              onMove={(direction) => moveBlock(index, direction)}
              onDelete={() => deleteBlock(index)}
            />
          ) : block.type === "heading" ? (
            <div
              key={block.id}
              id={iGM_Exam_BlockAnchor(block.id)}
              data-igm-heading="true"
              className={styles.headingHost}
            >
              <IGM_Exam_ReadOnlyBlock block={block} imageBase={imageBase} />
            </div>
          ) : (
            <IGM_Exam_ReadOnlyBlock key={block.id} block={block} imageBase={imageBase} />
          ),
        )}
      </article>

      {showContents && (
        <nav className={styles.toc} aria-label={t("detailTocTitle")}>
          <p className={`igm-mono ${styles.tocTitle}`}>{t("detailTocTitle")}</p>
          <ul className={styles.tocList}>
            {headings.map((entry, index) => (
              <li
                key={entry.block.id}
                className={styles[`lvl${Math.min(entry.block.level ?? 2, 3)}`]}
              >
                <button
                  type="button"
                  className={`${styles.tocItem} ${
                    activeAnchor === iGM_Exam_BlockAnchor(entry.block.id)
                      ? styles.tocActive
                      : index === activeIndex && activeAnchor === ""
                        ? styles.tocActive
                        : ""
                  }`}
                  onClick={() => scrollToAnchor(iGM_Exam_BlockAnchor(entry.block.id))}
                >
                  {entry.block.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

// 导出 //
export default iGM_ExamBlockView;