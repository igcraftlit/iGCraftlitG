/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamHighlightService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_ExamHighlight（POST /api/exam/select-ai-questions）
 * 模块：iGM_ExamHighlightService
 * 作用：从试卷转换后的 HTML 文本层抽取候选题目，逐题调用本地 deepseek-r1:7b 评分筛选亮点题目，
 *       并把 isExcellent 的结果写入 iGM_AIQuestionSelections（候选题）
 * 内容：HTML 文本层抽取与候选切分、选项识别、模型非流式调用与 JSON 健壮解析、
 *       关键词规则降级、候选落库与 DTO 组装
 * 说明：固定使用 Pro 版底层模型（iGM_Config.ai.channel.proModel），只取 content，忽略 reasoning_content；
 *       并发 1、每题间隔 500 毫秒、候选上限 60、单次上游超时 120 秒；
 *       上游不可用或异常一律降级为关键词规则，流程绝不抛出阻塞
 */

// 导入依赖 //
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_FindExamById } from "../iGM_Repositories/iGM_ExamRepository";
import { iGM_InsertSelection } from "../iGM_Repositories/iGM_AIQuestionSelectionRepository";
import {
  iGM_QuestionError,
  type iGM_QuestionActor,
} from "./iGM_QuestionService";
import { iGM_ExamHtmlDir } from "./iGM_ExamIngestService";
import {
  iGM_IsTextbookCode,
  iGM_JoinCommaList,
  iGM_NormalizeDifficultyLevel,
  iGM_ParseQuestionOptions,
  iGM_ResolveTextbookName,
  iGM_SerializeQuestionOptions,
  iGM_SplitCommaList,
  type iGM_QuestionDifficultyLevel,
  type iGM_QuestionOption,
  type iGM_QuestionType,
  type iGM_TextbookCode,
} from "../iGM_Types/iGM_Question";
import type {
  iGM_HighlightAnalyzeResult,
  iGM_HighlightQuestionDto,
} from "../iGM_Types/iGM_AIQuestionSelection";

// 类型定义 //
/** 单题评估结果 */
interface iGM_Evaluation {
  isExcellent: boolean;
  qualityScore: number;
  difficultyCoefficient: number;
  difficultyLevel: iGM_QuestionDifficultyLevel;
  reason: string;
  tags: string[];
  textbookCode: iGM_TextbookCode;
  fromModel: boolean;
}

/** 教材关键词分级规则（关键词降级时归属教材） */
interface iGM_TextbookKeywordTier {
  code: iGM_TextbookCode;
  keywords: string[];
}

// 核心逻辑 //
/** 候选上限、单题评估间隔、候选最短长度 */
const iGM_MaxCandidates = 60;
const iGM_EvalGapMs = 500;
const iGM_MinCandidateLength = 8;

/** System Prompt：固定评估维度与严格 JSON 输出格式 */
const iGM_HighlightSystemPrompt = [
  "你是一位资深 Minecraft 命题专家。请评估以下题目的质量。",
  "评估维度：综合性、创新性、难度、图示复杂度、指令嵌套、材料价值。",
  "只输出 JSON：",
  '{"isExcellent": true/false, "qualityScore": 0.95, "difficultyCoefficient": 0.55, "reason": "简要理由", "tags": ["红石","指令"], "textbookCode": "Compulsory_2", "textbookName": "必修二：红石与指令基础"}',
].join("\n");

/** 题号切分正则：行首/空白后的「第N题 / N. / N、 / N) / （N）」 */
const iGM_QuestionMarker =
  /(?:^|\n|\s)(?:第\s*\d{1,3}\s*题|\d{1,3}\s*[.、．)）](?!\d)|（\s*\d{1,3}\s*）|\(\s*\d{1,3}\s*\))/g;

/** 选项切分正则：行首/空白后的「A. / A、 / A) / A）」 */
const iGM_OptionMarker = /(?:^|\n|\s)([A-Da-d])\s*[.、．)）]\s*/g;

/** 关键词降级时的教材分级规则（命中第一级即归属该教材） */
const iGM_TextbookKeywordTiers: iGM_TextbookKeywordTier[] = [
  {
    code: "Elective_3",
    keywords: [
      "服务器", "服务端", "插件", "plugin", "后端", "架构", "部署", "运维",
      "并发", "性能", "负载", "反作弊", "权限组", "数据库", "网络", "线程", "内存",
    ],
  },
  {
    code: "Elective_2",
    keywords: [
      "进阶", "复杂", "计时器", "计数器", "计分板", "scoreboard", "函数",
      "function", "数据包", "datapack", "execute", "选择器", "selector", "链式", "模块化",
    ],
  },
  {
    code: "Compulsory_2",
    keywords: [
      "红石", "redstone", "指令", "命令", "command", "命令方块", "中继器",
      "比较器", "活塞", "信号", "逻辑门", "setblock", "fill", "tp", "give", "循环",
    ],
  },
  {
    code: "Elective_1",
    keywords: [
      "建筑", "建造", "美学", "风格", "城市", "装饰", "景观", "规划",
      "社区", "公会", "联盟", "合作", "立面", "色彩", "光影",
    ],
  },
  {
    code: "Elective_4",
    keywords: [
      "内容创作", "创作", "视频", "直播", "叙事", "剧情", "地图创作",
      "模组创作", "美术", "音乐", "文案", "商业化", "版权", "跨平台",
    ],
  },
  {
    code: "Compulsory_1",
    keywords: [
      "基础", "入门", "导论", "生存", "合成", "背包", "挖矿", "生物",
      "第一天", "出生", "操作", "界面", "材质",
    ],
  },
];

/** 延时 */
function iGM_Sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 安全地把码点转为字符（非法码点返回空串） */
function iGM_CodePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

/** HTML 实体解码 */
function iGM_DecodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      iGM_CodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, dec: string) => iGM_CodePoint(Number(dec)));
}

/** HTML → 纯文本：移除脚本样式、块级标签转换行、去标签、解码实体 */
function iGM_HtmlToPlainText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withBreaks = withoutBlocks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(p|div|li|tr|td|th|h[1-6]|section|article|blockquote|pre)\s*>/gi,
      "\n",
    );
  return iGM_DecodeHtmlEntities(withBreaks.replace(/<[^>]*>/g, " "));
}

/** 归一候选文本：折叠空白、去首尾 */
function iGM_NormalizeCandidate(text: string): string {
  return text
    .replace(/[ \t\u00a0\u3000]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** 按题号标记切分（不足两段返回空数组，交由长度分块兜底） */
function iGM_SplitByMarkers(text: string): string[] {
  const matches = [...text.matchAll(iGM_QuestionMarker)];
  if (matches.length < 2) return [];
  const segments: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    segments.push(text.slice(start, end));
  }
  return segments;
}

/** 按长度分块（尽量在句末断开），用于无题号标记的兜底 */
function iGM_ChunkByLength(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + size, text.length);
    if (end < text.length) {
      const slice = text.slice(cursor, end);
      const breakMatch = /[。！？；\n][^。！？；\n]*$/.exec(slice);
      if (breakMatch) end = cursor + breakMatch.index + 1;
    }
    chunks.push(text.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}

/** 抽取候选题目文本（读不到文件返回空数组，绝不抛错） */
async function iGM_ExtractCandidates(examId: string): Promise<string[]> {
  let html: string;
  try {
    html = await readFile(join(iGM_ExamHtmlDir(examId), "index.html"), "utf8");
  } catch {
    return [];
  }
  const text = iGM_NormalizeCandidate(iGM_HtmlToPlainText(html));
  if (text.length === 0) return [];

  let segments = iGM_SplitByMarkers(text);
  if (segments.length < 2) segments = iGM_ChunkByLength(text, 400);

  const cleaned: string[] = [];
  for (const segment of segments) {
    const value = iGM_NormalizeCandidate(segment);
    if (value.length < iGM_MinCandidateLength) continue;
    cleaned.push(value.slice(0, 2000));
    if (cleaned.length >= iGM_MaxCandidates) break;
  }
  return cleaned;
}

/** 从候选文本识别题干与选项（选项标记不足两个时视为纯题干） */
function iGM_ParseCandidate(candidate: string): {
  stem: string;
  options: iGM_QuestionOption[];
} {
  const matches = [...candidate.matchAll(iGM_OptionMarker)];
  if (matches.length < 2) return { stem: candidate, options: [] };

  const firstIndex = matches[0].index ?? 0;
  const stem = candidate.slice(0, firstIndex).trim();
  const options: iGM_QuestionOption[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const markerEnd = (matches[i].index ?? 0) + matches[i][0].length;
    const nextStart =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? candidate.length)
        : candidate.length;
    options.push({
      key: matches[i][1].toUpperCase(),
      text: candidate.slice(markerEnd, nextStart).trim(),
    });
  }
  return { stem: stem.length > 0 ? stem : candidate, options };
}

/** 提取模型输出中的 JSON 对象（去围栏、取首尾花括号、容错解析） */
function iGM_ExtractJson(content: string): Record<string, unknown> | null {
  let text = content.trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 调用本地模型（OpenAI 兼容 /chat/completions），失败返回 null；只取 content */
async function iGM_CallHighlightModel(
  stem: string,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    iGM_Config.ai.channel.proTimeoutMs,
  );
  try {
    const response = await fetch(
      `${iGM_Config.ai.channel.apiBase}/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: iGM_Config.ai.channel.proModel,
          messages: [
            { role: "system", content: iGM_HighlightSystemPrompt },
            { role: "user", content: `题目：${stem}` },
          ],
          stream: false,
          temperature: 0,
          max_tokens: 400,
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) return null;
    return iGM_ExtractJson(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** 数值裁剪到 [0,1]；非法回退默认 */
function iGM_Clamp01(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

/** 归一标签：去空去重、最多 max 个 */
function iGM_NormalizeStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim().slice(0, 16);
    if (tag.length === 0) continue;
    seen.add(tag);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** 松散判定布尔（兼容 true / "true" / 1） */
function iGM_IsTruthy(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

/** 把模型返回归一为评估结果（教材编码非法时回退必修一，名称一律服务端派生） */
function iGM_NormalizeModelEvaluation(
  raw: Record<string, unknown>,
): iGM_Evaluation {
  const codeRaw = typeof raw.textbookCode === "string" ? raw.textbookCode : "";
  const textbookCode: iGM_TextbookCode = iGM_IsTextbookCode(codeRaw)
    ? codeRaw
    : "Compulsory_1";
  const difficultyCoefficient = iGM_Clamp01(raw.difficultyCoefficient, 0.5);
  return {
    isExcellent: iGM_IsTruthy(raw.isExcellent),
    qualityScore: iGM_Clamp01(raw.qualityScore, 0),
    difficultyCoefficient,
    difficultyLevel: iGM_NormalizeDifficultyLevel(difficultyCoefficient),
    reason: typeof raw.reason === "string" ? raw.reason.trim().slice(0, 200) : "",
    tags: iGM_NormalizeStringArray(raw.tags, 5),
    textbookCode,
    fromModel: true,
  };
}

/** 关键词规则降级：按题干长度、关键词、题型判定亮点与打分 */
function iGM_EvaluateByKeyword(
  stem: string,
  options: iGM_QuestionOption[],
): iGM_Evaluation {
  const haystack =
    `${stem} ${options.map((option) => option.text).join(" ")}`.toLowerCase();
  const length = stem.trim().length;
  const hasOptions = options.length > 0;

  let textbookCode: iGM_TextbookCode = "Compulsory_1";
  let hits: string[] = [];
  for (const tier of iGM_TextbookKeywordTiers) {
    const matched = tier.keywords.filter((keyword) =>
      haystack.includes(keyword.toLowerCase()),
    );
    if (matched.length > 0) {
      textbookCode = tier.code;
      hits = matched;
      break;
    }
  }

  const lengthScore =
    length >= 80 ? 0.5 : length >= 40 ? 0.4 : length >= 20 ? 0.3 : 0.2;
  const qualityScore = iGM_Clamp01(
    lengthScore + Math.min(hits.length, 3) * 0.1 + (hasOptions ? 0.1 : 0),
    0.3,
  );
  const isExcellent = length >= 20 && (hits.length > 0 || hasOptions);
  const difficultyCoefficient = iGM_Clamp01(
    0.35 + Math.min(hits.length, 4) * 0.08 + (length >= 60 ? 0.15 : 0),
    0.5,
  );
  const tags = [...new Set(hits)].slice(0, 5);

  return {
    isExcellent,
    qualityScore,
    difficultyCoefficient,
    difficultyLevel: iGM_NormalizeDifficultyLevel(difficultyCoefficient),
    reason:
      tags.length > 0
        ? `关键词规则命中：${tags.join("、")}`
        : "关键词规则筛选：按题干长度与题型判定",
    tags,
    textbookCode,
    fromModel: false,
  };
}

/**
 * 检索并筛选试卷的 AI 亮点题目
 * 流程：校验归属 → 抽取候选 → 逐题评估（模型优先，失败降级关键词）→ 落库候选题
 * 上游不可用时后续题目一律降级，避免重复长超时阻塞；流程永不抛出
 */
export async function iGM_SelectAIQuestionsService(
  actor: iGM_QuestionActor,
  examId: string,
): Promise<iGM_HighlightAnalyzeResult> {
  const id = examId.trim();
  if (!id) throw new iGM_QuestionError("缺少试卷 ID", 400);
  const exam = await iGM_FindExamById(id);
  if (!exam) throw new iGM_QuestionError("试卷不存在", 404);
  if (!actor.isAdmin && exam.iGM_CreatedBy !== actor.userId) {
    throw new iGM_QuestionError("无权分析该试卷", 403);
  }

  const candidates = await iGM_ExtractCandidates(id);
  const scanned = candidates.length;
  const model = iGM_Config.ai.channel.proModel;
  const questions: iGM_HighlightQuestionDto[] = [];
  let usedOllama = false;
  let ollamaAvailable = true;

  for (let index = 0; index < candidates.length; index += 1) {
    const parsed = iGM_ParseCandidate(candidates[index]);

    let evaluation: iGM_Evaluation | null = null;
    if (ollamaAvailable) {
      const raw = await iGM_CallHighlightModel(parsed.stem);
      if (raw) {
        evaluation = iGM_NormalizeModelEvaluation(raw);
        usedOllama = true;
      } else {
        // 上游不可用或异常：本次及后续一律降级为关键词规则
        ollamaAvailable = false;
      }
    }
    if (!evaluation) {
      evaluation = iGM_EvaluateByKeyword(parsed.stem, parsed.options);
    }

    if (evaluation.isExcellent) {
      const type: iGM_QuestionType =
        parsed.options.length > 0 ? "single_choice" : "short_answer";
      const row = await iGM_InsertSelection({
        examId: id,
        creatorId: actor.userId,
        questionIndex: index + 1,
        stem: parsed.stem,
        type,
        options: iGM_SerializeQuestionOptions(parsed.options) || "[]",
        answer: "",
        analysis: "",
        qualityScore: evaluation.qualityScore,
        difficultyCoefficient: evaluation.difficultyCoefficient,
        difficultyLevel: evaluation.difficultyLevel,
        reason: evaluation.reason,
        tags: iGM_JoinCommaList(evaluation.tags),
        textbookCode: evaluation.textbookCode,
        textbookName: iGM_ResolveTextbookName(evaluation.textbookCode),
      });
      questions.push({
        selectionId: row.iGM_Id,
        questionIndex: row.iGM_QuestionIndex,
        stem: row.iGM_Stem,
        type,
        options: iGM_ParseQuestionOptions(row.iGM_Options),
        answer: row.iGM_Answer,
        analysis: row.iGM_Analysis,
        qualityScore: row.iGM_QualityScore,
        difficultyCoefficient: row.iGM_DifficultyCoefficient,
        difficultyLevel: iGM_NormalizeDifficultyLevel(
          row.iGM_DifficultyCoefficient,
        ),
        reason: row.iGM_Reason,
        tags: iGM_SplitCommaList(row.iGM_Tags),
        textbookCode: row.iGM_TextbookCode,
        textbookName: row.iGM_TextbookName,
        status: row.iGM_Status,
      });
    }

    if (index + 1 < candidates.length) await iGM_Sleep(iGM_EvalGapMs);
  }

  return {
    examId: id,
    model,
    source: usedOllama ? "ollama" : "keyword",
    scanned,
    selected: questions.length,
    questions,
  };
}

// 导出 //
export default { iGM_SelectAIQuestionsService };
