/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamBlockParser.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/upload、/api/exam/reparse 内部调用）
 * 模块：iGM_ExamBlockParser
 * 作用：使用 pdfjs-dist 把 PDF 逐页解析为结构化内容块（非 Markdown），并把内嵌图片
 *       解码落盘到 images 目录
 * 内容：逐页文本抽取与行归并、标题/列表/表格/公式/题目启发式识别、
 *       图片算子遍历与原始位图 PNG 编码落盘、逐页进度回调
 * 说明：
 *   - 解析结果仅含渲染数据，磁盘路径不下发；图片块仅保存 images 目录内文件名
 *   - 图片抽取失败时静默跳过该图片，不影响文本块解析
 *   - 进度通过回调上报（总页数 / 已解析页数），由调用方写入数据库
 */

// 导入依赖 //
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { iGM_RandomUuid } from "./iGM_SecurityService";
import type { iGM_ExamBlock } from "../iGM_Types/iGM_Exam";

// 类型定义 //
/** 逐页进度回调：total 为总页数，parsed 为已解析页数 */
export interface iGM_ExamParseHandlers {
  /** 读取到总页数时回调（解析开始前） */
  onTotal?: (totalPages: number) => Promise<void> | void;
  /** 每解析完一页回调 */
  onPage?: (
    parsedPages: number,
    totalPages: number,
    blockCount: number,
  ) => Promise<void> | void;
}

/** pdf.js 文本项（仅使用本模块需要的字段） */
interface iGM_PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** 归并后的文本行 */
interface iGM_PdfLine {
  text: string;
  size: number;
  x: number;
  page: number;
}

/** pdf.js 图片对象（仅使用本模块需要的字段） */
interface iGM_PdfImage {
  width?: number;
  height?: number;
  data?: Uint8Array | Uint8ClampedArray;
  kind?: number;
}

/** pdf.js 页面对象（仅使用本模块需要的字段） */
interface iGM_PdfPage {
  getTextContent: () => Promise<{ items: iGM_PdfTextItem[] }>;
  getOperatorList: () => Promise<{
    fnArray: number[];
    argsArray: unknown[][];
  }>;
  objs: { get: (name: string) => iGM_PdfImage | null };
  cleanup: () => void;
}

/** pdf.js 文档对象（仅使用本模块需要的字段） */
interface iGM_PdfDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<iGM_PdfPage>;
}

// 核心逻辑 //
/** 单文档最大解析页数，防止异常文档耗尽资源 */
const iGM_ExamMaxPages = 400;
/** 单页最大图片数量，防止异常文档产生海量图片 */
const iGM_ExamMaxImagesPerPage = 20;
/** 标题相对正文的字号放大阈值 */
const iGM_ExamHeadingRatio = 1.18;

/** 结构性行标记：无序列表 */
const iGM_ExamListBullet =
  /^\s*(?:[•·▪◦●○※]|[-*—–])\s+/;
/** 结构性行标记：有序列表 */
const iGM_ExamOrderedList = /^\s*(\d{1,2})\s*[.)、）]\s+\S/;
/** 题目序号（题号以顿号/点/括号收尾） */
const iGM_ExamQuestionMark =
  /^\s*(?:第\s*)?(\d{1,3})\s*(?:题|[.、．)）])\s*/;
/** 中文大题干序号 */
const iGM_ExamSectionMark =
  /^\s*(?:第\s*)?[一二三四五六七八九十]+\s*[、.．)]\s*/;
/** 选项行：A. / A、 / （A） */
const iGM_ExamOptionMark = /^\s*[（(]?([A-Ha-h])[)）.、．]\s+\S/;
/** 公式符号特征 */
const iGM_ExamFormulaChars = /[∫∑√∞≤≥≠≈±×÷∏∂∇∈∉∪∩→⇒⇔]/;
/** LaTeX 片段特征 */
const iGM_ExamLatexMark = /\\[a-zA-Z]{2,}|\^\{|_\{|\\frac|\\sqrt/;
/** 句末终止符：出现时不再与下一行合并为同段 */
const iGM_ExamSentenceEnd = /[。．！？!?；;：:]$/;

/** 文本是否包含中文 */
function iGM_HasCjk(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

/** 归一化空白 */
function iGM_Collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 拆分同一行内的多个选项（如 "A. 3 B. 4 C. 5"）
 * 以选项字母标记为切分点，返回各选项正文（保留原选项字母）
 */
function iGM_SplitOptions(text: string): string[] {
  const marker = /[（(]?([A-Ha-h])[)）.、．]\s*/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) return [];
  return matches.map((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end =
      i < matches.length - 1 ? (matches[i + 1].index ?? text.length) : text.length;
    const body = iGM_Collapse(text.slice(start, end));
    return `${match[1].toUpperCase()}. ${body}`;
  });
}

/* ---------- 行归并 ---------- */

/** 把单页文本项归并为按阅读顺序排列的文本行 */
function iGM_BuildLines(
  items: iGM_PdfTextItem[],
  pageNumber: number,
): iGM_PdfLine[] {
  const usable = items.filter(
    (item) => typeof item.str === "string" && item.str.trim().length > 0,
  );
  if (usable.length === 0) return [];

  // 字号取该项字高，缺失时回退到变换矩阵推导
  const sizeOf = (item: iGM_PdfTextItem): number => {
    if (Number.isFinite(item.height) && item.height > 0) return item.height;
    const transform = item.transform ?? [];
    const derived = Math.hypot(transform[2] ?? 0, transform[3] ?? 0);
    return derived > 0 ? derived : 10;
  };

  // 按 y 降序（自上而下）、x 升序（自左向右）排序
  const sorted = [...usable].sort((a, b) => {
    const ya = a.transform?.[5] ?? 0;
    const yb = b.transform?.[5] ?? 0;
    if (Math.abs(ya - yb) > 0.6) return yb - ya;
    return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
  });

  const lines: iGM_PdfLine[] = [];
  let current: iGM_PdfTextItem[] = [];
  let currentY: number | null = null;
  let currentSize = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    const ordered = [...current].sort(
      (a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0),
    );
    let text = "";
    let prevRight: number | null = null;
    for (const item of ordered) {
      const x = item.transform?.[4] ?? 0;
      const width = Number.isFinite(item.width) ? item.width : 0;
      // 词间距较大时补一个空格，避免英文单词粘连
      if (
        prevRight !== null &&
        x - prevRight > Math.max(1.2, currentSize * 0.22)
      ) {
        text += " ";
      }
      text += item.str;
      prevRight = x + width;
    }
    const collapsed = iGM_Collapse(text);
    if (collapsed.length > 0) {
      lines.push({
        text: collapsed,
        size: currentSize || 10,
        x: ordered[0]?.transform?.[4] ?? 0,
        page: pageNumber,
      });
    }
    current = [];
    currentY = null;
    currentSize = 0;
  };

  for (const item of sorted) {
    const y = item.transform?.[5] ?? 0;
    const size = sizeOf(item);
    if (currentY === null) {
      currentY = y;
      currentSize = size;
      current.push(item);
      continue;
    }
    // 容差取当前行字高的一半，兼顾上下标与轻微基线偏移
    const tolerance = Math.max(2, currentSize * 0.5);
    if (Math.abs(y - currentY) <= tolerance) {
      current.push(item);
      currentSize = Math.max(currentSize, size);
    } else {
      flush();
      currentY = y;
      currentSize = size;
      current.push(item);
    }
  }
  flush();
  return lines;
}

/* ---------- 行分类 ---------- */

/** 计算行字号中位数（正文基准字号） */
function iGM_MedianSize(lines: iGM_PdfLine[]): number {
  if (lines.length === 0) return 10;
  const sizes = lines.map((line) => line.size).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] ?? 10;
}

/** 是否为表格行：含两个及以上以宽间隔分隔的单元格 */
function iGM_SplitCells(text: string): string[] {
  return text
    .split(/\s{2,}|\t+/)
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
}

/** 判断行是否为公式 */
function iGM_IsFormula(text: string): boolean {
  if (iGM_ExamLatexMark.test(text)) return true;
  if (!iGM_ExamFormulaChars.test(text)) return false;
  // 含大量中文的行更可能是文字说明而非纯公式
  return text.length <= 120 && !iGM_HasCjk(text);
}

/** 识别并追加文本块（合并连续普通行，结构行独立成块） */
function iGM_PushLinesToBlocks(
  lines: iGM_PdfLine[],
  bodySize: number,
  blocks: iGM_ExamBlock[],
): void {
  let index = 0;

  const push = (block: Omit<iGM_ExamBlock, "id">): void => {
    blocks.push({ id: iGM_RandomUuid(), ...block });
  };

  while (index < lines.length) {
    const line = lines[index];
    const text = line.text;

    // 1. 标题：字号明显大于正文，或匹配大题干序号
    if (
      line.size >= bodySize * iGM_ExamHeadingRatio ||
      iGM_ExamSectionMark.test(text)
    ) {
      const ratio = line.size / bodySize;
      const level = ratio >= 1.7 ? 1 : ratio >= 1.4 ? 2 : 3;
      // 大题干序号后的短行按二级标题处理
      const headingLevel = iGM_ExamSectionMark.test(text) && text.length <= 40 ? 2 : level;
      push({ type: "heading", level: headingLevel, text, page: line.page });
      index += 1;
      continue;
    }

    // 2. 图片占位由图片抽取阶段单独追加，此处跳过

    // 3. 题目：题号开头，收集题干与后续选项（含同一行内的多个选项）
    if (iGM_ExamQuestionMark.test(text)) {
      const numberMatch = iGM_ExamQuestionMark.exec(text);
      const number = numberMatch?.[1] ?? "";
      let stem = text.replace(iGM_ExamQuestionMark, "").trim();
      const options: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const candidate = lines[cursor].text;
        if (iGM_ExamOptionMark.test(candidate)) {
          options.push(...iGM_SplitOptions(candidate));
          cursor += 1;
          continue;
        }
        // 题干续行（未出现新结构且上一行未以句末符收尾）
        if (
          options.length === 0 &&
          !iGM_ExamQuestionMark.test(candidate) &&
          !iGM_ExamListBullet.test(candidate) &&
          !iGM_ExamSentenceEnd.test(stem)
        ) {
          stem += candidate;
          cursor += 1;
          continue;
        }
        break;
      }
      push({
        type: "question",
        number,
        text: stem,
        options: options.length > 0 ? options : undefined,
        page: line.page,
      });
      index = cursor;
      continue;
    }

    // 4. 列表：连续的无序 / 有序列表行合并为一个列表块
    if (iGM_ExamListBullet.test(text) || iGM_ExamOrderedList.test(text)) {
      const ordered = !iGM_ExamListBullet.test(text);
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index];
        const bullet = iGM_ExamListBullet.test(candidate.text);
        const numbered = iGM_ExamOrderedList.test(candidate.text);
        if (!bullet && !numbered) break;
        items.push(
          iGM_Collapse(
            candidate.text
              .replace(iGM_ExamListBullet, "")
              .replace(iGM_ExamOrderedList, (match) =>
                match.replace(/^\s*\d{1,2}\s*[.)、）]\s*/, ""),
              ),
          ),
        );
        index += 1;
      }
      push({ type: "list", ordered, items, page: line.page });
      continue;
    }

    // 5. 公式
    if (iGM_IsFormula(text)) {
      push({ type: "formula", text, page: line.page });
      index += 1;
      continue;
    }

    // 7. 表格：连续两行及以上均由多单元格组成
    const firstCells = iGM_SplitCells(text);
    if (firstCells.length >= 2 && index + 1 < lines.length) {
      const secondCells = iGM_SplitCells(lines[index + 1].text);
      if (secondCells.length >= 2) {
        const rows: string[][] = [firstCells];
        let cursor = index + 1;
        while (cursor < lines.length) {
          const cells = iGM_SplitCells(lines[cursor].text);
          if (cells.length < 2) break;
          rows.push(cells);
          cursor += 1;
        }
        if (rows.length >= 2) {
          push({ type: "table", rows, page: line.page });
          index = cursor;
          continue;
        }
      }
    }

    // 8. 普通段落：合并后续续行
    let paragraph = text;
    let cursor = index + 1;
    while (cursor < lines.length) {
      const candidate = lines[cursor].text;
      const blocked =
        iGM_ExamHeadingRatio > 0 &&
        lines[cursor].size >= bodySize * iGM_ExamHeadingRatio;
      if (
        blocked ||
        iGM_ExamListBullet.test(candidate) ||
        iGM_ExamOrderedList.test(candidate) ||
        iGM_ExamQuestionMark.test(candidate) ||
        iGM_ExamOptionMark.test(candidate) ||
        iGM_ExamSectionMark.test(candidate) ||
        iGM_ExamSentenceEnd.test(paragraph)
      ) {
        break;
      }
      paragraph += candidate;
      cursor += 1;
    }
    push({ type: "paragraph", text: paragraph, page: line.page });
    index = cursor;
  }
}

/**
 * 把纯文本 / Markdown 文本转换为结构化内容块
 * 说明：非 PDF 文档（DOC / DOCX / TXT / MD）没有版式信息，无法推断字号与坐标，
 *       故按 Markdown 标记与空行切分，仅产出标题 / 列表 / 段落三类块
 */
export function iGM_ConvertTextToBlocks(text: string): iGM_ExamBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: iGM_ExamBlock[] = [];

  const push = (block: Omit<iGM_ExamBlock, "id">): void => {
    blocks.push({ id: iGM_RandomUuid(), ...block });
  };
  const isHeading = (line: string): RegExpExecArray | null =>
    /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
  const isListItem = (line: string): boolean =>
    /^(?:[-*+]|\d{1,3}[.)])\s+\S/.test(line);

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (line.length === 0) {
      index += 1;
      continue;
    }

    // 标题：Markdown # 标记
    const heading = isHeading(line);
    if (heading) {
      push({
        type: "heading",
        level: heading[1].length,
        text: iGM_Collapse(heading[2]),
      });
      index += 1;
      continue;
    }

    // 列表：连续列表行合并为一个列表块
    if (isListItem(line)) {
      const ordered = /^\d{1,3}[.)]\s+\S/.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        if (!isListItem(candidate)) break;
        items.push(iGM_Collapse(candidate.replace(/^(?:[-*+]|\d{1,3}[.)])\s+/, "")));
        index += 1;
      }
      push({ type: "list", ordered, items });
      continue;
    }

    // 段落：合并到空行 / 标题 / 列表为止
    const parts: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (candidate.length === 0) break;
      if (isHeading(candidate) || isListItem(candidate)) break;
      parts.push(candidate);
      index += 1;
    }
    const paragraph = iGM_Collapse(parts.join(" "));
    if (paragraph.length > 0) push({ type: "paragraph", text: paragraph });
  }

  return blocks;
}

/** 把内容块序列中的可见文本拼接为纯文本（供元数据正则识别使用） */
export function iGM_BlocksToPlainText(blocks: iGM_ExamBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.text) parts.push(block.text);
    if (block.items && block.items.length > 0) parts.push(block.items.join("\n"));
    if (block.rows) {
      for (const row of block.rows) parts.push(row.join(" "));
    }
  }
  return parts.join("\n");
}

/* ---------- 图片编码 ---------- */

/** CRC32 查表（PNG 分块校验） */
const iGM_PngCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** 计算 CRC32 */
function iGM_Crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = iGM_PngCrcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** 构造 PNG 分块：长度 + 类型 + 数据 + CRC */
function iGM_PngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const chunk = new Uint8Array(8 + body.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(body, 4);
  view.setUint32(4 + body.length, iGM_Crc32(body));
  return chunk;
}

/** 把原始像素（RGB / RGBA）编码为 PNG */
export function iGM_EncodePng(
  width: number,
  height: number,
  pixels: Uint8Array | Uint8ClampedArray,
  channels: 3 | 4,
): Uint8Array {
  const rowBytes = width * channels;
  const raw = new Uint8Array((rowBytes + 1) * height);
  // 位图数据可能是 Uint8ClampedArray，统一转为 Uint8Array 后拷贝
  const src =
    pixels instanceof Uint8Array
      ? pixels
      : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  for (let y = 0; y < height; y += 1) {
    const srcStart = y * rowBytes;
    const dstStart = y * (rowBytes + 1);
    raw[dstStart] = 0; // 过滤类型 0（None）
    raw.set(src.subarray(srcStart, srcStart + rowBytes), dstStart + 1);
  }

  const signature = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // 位深
  ihdr[9] = channels === 4 ? 6 : 2; // 颜色类型：RGBA / RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = new Uint8Array(deflateSync(raw));
  const chunks = [
    signature,
    iGM_PngChunk("IHDR", ihdr),
    iGM_PngChunk("IDAT", idat),
    iGM_PngChunk("IEND", new Uint8Array(0)),
  ];
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** 判断字节是否以 JPEG SOI 开头 */
function iGM_IsJpeg(bytes: Uint8Array | Uint8ClampedArray): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** 单张图片的落盘结果 */
interface iGM_ExtractedImage {
  src: string;
  width: number;
  height: number;
}

/** 把 pdf.js 图片对象解码落盘；无法处理时返回 null */
async function iGM_StorePdfImage(
  image: iGM_PdfImage,
  imagesDir: string,
): Promise<iGM_ExtractedImage | null> {
  const data = image.data;
  if (!data) return null;

  // DCTDecode（JPEG）场景：pdf.js 直接给出 JPEG 原始字节
  if (iGM_IsJpeg(data)) {
    const name = `${iGM_RandomUuid()}.jpg`;
    await writeFile(join(imagesDir, name), data);
    return {
      src: name,
      width: image.width ?? 0,
      height: image.height ?? 0,
    };
  }

  const width = image.width ?? 0;
  const height = image.height ?? 0;
  if (width <= 0 || height <= 0) return null;

  const length = data.length;
  let channels: 3 | 4;
  if (length >= width * height * 4) channels = 4;
  else if (length >= width * height * 3) channels = 3;
  else return null;

  const png = iGM_EncodePng(width, height, data, channels);
  const name = `${iGM_RandomUuid()}.png`;
  await writeFile(join(imagesDir, name), png);
  return { src: name, width, height };
}

/**
 * 遍历页面算子列表抽取内嵌图片并落盘
 * @param xObjectOp paintImageXObject 算子码（参数为对象名）
 * @param inlineOp paintInlineImageXObject 算子码（参数为图片对象本身）
 * @returns 图片块（可直接并入内容块序列）
 */
async function iGM_ExtractPageImages(
  page: iGM_PdfPage,
  imagesDir: string,
  pageNumber: number,
  xObjectOp: number,
  inlineOp: number,
): Promise<iGM_ExamBlock[]> {
  const blocks: iGM_ExamBlock[] = [];
  try {
    const opList = await page.getOperatorList();
    const images: iGM_PdfImage[] = [];
    for (let i = 0; i < opList.fnArray.length; i += 1) {
      const fn = opList.fnArray[i];
      const arg = opList.argsArray[i]?.[0];
      if (fn === xObjectOp && typeof arg === "string") {
        let image: iGM_PdfImage | null = null;
        try {
          image = page.objs.get(arg);
        } catch {
          image = null;
        }
        if (image) images.push(image);
      } else if (fn === inlineOp && arg && typeof arg === "object") {
        images.push(arg as iGM_PdfImage);
      }
      if (images.length >= iGM_ExamMaxImagesPerPage) break;
    }
    for (const image of images) {
      try {
        const stored = await iGM_StorePdfImage(image, imagesDir);
        if (!stored) continue;
        blocks.push({
          id: iGM_RandomUuid(),
          type: "image",
          src: stored.src,
          width: stored.width || undefined,
          height: stored.height || undefined,
          page: pageNumber,
        });
      } catch {
        // 单张图片失败不影响整体解析
      }
    }
  } catch {
    // 算子列表获取失败时直接跳过本页图片
  }
  return blocks;
}

/* ---------- 主流程 ---------- */

/**
 * 把 PDF 字节解析为结构化内容块
 * @param bytes PDF 完整字节
 * @param imagesDir 图片落盘的绝对目录（调用方保证已创建）
 * @param handlers 逐页进度回调
 */
export async function iGM_ParsePdfBlocks(
  bytes: Uint8Array,
  imagesDir: string,
  handlers: iGM_ExamParseHandlers = {},
): Promise<iGM_ExamBlock[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // 标准字体数据目录：缺失时 pdf.js 会用内置回退字体继续解析，仅打印告警
  const standardFontDataUrl = new URL(
    "../../node_modules/pdfjs-dist/standard_fonts/",
    import.meta.url,
  ).href;
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl,
    // Node/Bun 环境无 Worker，交由 pdf.js 使用伪 Worker 执行
    useWorkerFetch: false,
  });
  const document = (await loadingTask.promise) as unknown as iGM_PdfDocument;
  const totalPages = Math.min(document.numPages, iGM_ExamMaxPages);
  await handlers.onTotal?.(totalPages);

  // 图片算子码取自运行时 OPS 枚举，避免版本硬编码
  const ops = (pdfjs as unknown as { OPS?: Record<string, number> }).OPS ?? {};
  const xObjectOp = ops.paintImageXObject ?? -1;
  const inlineOp = ops.paintInlineImageXObject ?? -1;

  const blocks: iGM_ExamBlock[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = iGM_BuildLines(content.items, pageNumber);
      if (lines.length > 0) {
        const bodySize = iGM_MedianSize(lines);
        iGM_PushLinesToBlocks(lines, bodySize, blocks);
      }
      const imageBlocks = await iGM_ExtractPageImages(
        page,
        imagesDir,
        pageNumber,
        xObjectOp,
        inlineOp,
      );
      blocks.push(...imageBlocks);
      page.cleanup();
      await handlers.onPage?.(pageNumber, totalPages, blocks.length);
    }
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
  return blocks;
}

/** 确保图片目录存在 */
export async function iGM_EnsureImagesDir(imagesDir: string): Promise<void> {
  await mkdir(imagesDir, { recursive: true });
}

// 导出 //
export default {
  iGM_EncodePng,
  iGM_ParsePdfBlocks,
  iGM_ConvertTextToBlocks,
  iGM_BlocksToPlainText,
  iGM_EnsureImagesDir,
};