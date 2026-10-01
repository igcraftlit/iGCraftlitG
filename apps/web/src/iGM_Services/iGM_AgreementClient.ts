/**
 * 文件路径：apps/web/src/iGM_Services/iGM_AgreementClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：/G_UserAgreement（独立查看页）与注册向导第三步阅读模块
 * 模块：iGM_AgreementClient
 * 作用：《iGCraftLit 用户管理规定》Markdown 文件的读取与极简解析
 * 内容：从静态资源 /docs/iGM_UserAgreement.md 拉取全文，
 *       解析 frontmatter 版本号、标题层级（篇/章/节）、有序/无序列表、分隔线，
 *       并据此生成 ON THIS PAGE 目录条目（篇为一级、章为二级）
 * 约束：纯静态 SSG，文档以静态资源形式随 out 一并发布；
 *       前端不自带 Markdown 依赖，采用极简自研解析，仅覆盖规定文档用到的语法
 */

// 导入依赖 //
import type { iGM_TocItem } from "../iGM_Components/iGM_PageToc/iGM_PageToc";

// 类型定义 //
/** 解析后的文档区块 */
export interface iGM_AgreementBlock {
  /** h1 / h2 / h3 / h4 / p / ul / ol / hr */
  type: "h1" | "h2" | "h3" | "h4" | "p" | "ul" | "ol" | "hr";
  /** 标题区块的锚点 id */
  id?: string;
  /** 标题或段落文本 */
  text?: string;
  /** 列表条目 */
  items?: string[];
}

/** 解析后的规定文档 */
export interface iGM_AgreementDoc {
  /** 版本号（frontmatter，缺省为 0.0.0） */
  version: string;
  /** 文档标题 */
  title: string;
  /** 正文区块（顺序渲染） */
  blocks: iGM_AgreementBlock[];
  /** ON THIS PAGE 目录条目（篇一级、章二级） */
  toc: iGM_TocItem[];
}

// 核心逻辑 //
/** 静态资源路径：随前端 out 一并发布的用户管理规定 Markdown */
export const iGM_UserAgreementPath = "/docs/iGM_UserAgreement.md";

/** 生成稳定的标题锚点 id */
function iGM_HeadAnchor(index: number): string {
  return `iGM_Agreement_h${index}`;
}

/**
 * 极简 Markdown 解析：仅支持规定文档实际使用的语法
 * （frontmatter、标题 h1-h4、有序/无序列表、分隔线、段落）
 */
export function iGM_ParseUserAgreement(markdown: string): iGM_AgreementDoc {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: iGM_AgreementBlock[] = [];
  const toc: iGM_TocItem[] = [];
  let version = "0.0.0";
  let title = "iGCraftLit 用户管理规定";
  let headIndex = 0;
  let cursor = 0;

  // frontmatter：位于文件开头的 --- 包裹块
  if (lines[0]?.trim() === "---") {
    let end = 1;
    while (end < lines.length && lines[end].trim() !== "---") end += 1;
    for (let i = 1; i < end; i += 1) {
      const match = /^(\w+):\s*(.*)$/.exec(lines[i]);
      if (!match) continue;
      if (match[1] === "version") version = match[2].trim();
      if (match[1] === "title") title = match[2].trim();
    }
    cursor = Math.min(end + 1, lines.length);
  }

  while (cursor < lines.length) {
    const raw = lines[cursor];
    const line = raw.trim();

    // 空行
    if (line.length === 0) {
      cursor += 1;
      continue;
    }

    // 分隔线
    if (line === "---") {
      blocks.push({ type: "hr" });
      cursor += 1;
      continue;
    }

    // 标题
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      headIndex += 1;
      const id = iGM_HeadAnchor(headIndex);
      const type = (level === 1
        ? "h1"
        : level === 2
          ? "h2"
          : level === 3
            ? "h3"
            : "h4") as "h1" | "h2" | "h3" | "h4";
      blocks.push({ type, id, text });
      // 目录：篇（h2）一级、章（h3）二级
      if (level === 2) toc.push({ id, label: text, level: 1 });
      if (level === 3) toc.push({ id, label: text, level: 2 });
      cursor += 1;
      continue;
    }

    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (cursor < lines.length && /^[-*]\s+/.test(lines[cursor].trim())) {
        items.push(lines[cursor].trim().replace(/^[-*]\s+/, ""));
        cursor += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (cursor < lines.length && /^\d+\.\s+/.test(lines[cursor].trim())) {
        items.push(lines[cursor].trim().replace(/^\d+\.\s+/, ""));
        cursor += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // 段落
    blocks.push({ type: "p", text: line });
    cursor += 1;
  }

  return { version, title, blocks, toc };
}

/** 拉取并解析用户管理规定（静态资源，随前端一并发布） */
export async function iGM_FetchUserAgreement(): Promise<iGM_AgreementDoc> {
  const response = await fetch(iGM_UserAgreementPath, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`iGM_Agreement: HTTP ${response.status}`);
  }
  const markdown = await response.text();
  return iGM_ParseUserAgreement(markdown);
}

// 导出 //
export default {
  iGM_UserAgreementPath,
  iGM_ParseUserAgreement,
  iGM_FetchUserAgreement,
};