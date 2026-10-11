/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_QuestionAnalyzeService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Question（POST /api/question/analyze）
 * 模块：iGM_QuestionAnalyzeService
 * 作用：对题目做 AI 智能分析（难度、题型、标签、教材归属、建议），失败时回退关键词匹配
 * 内容：非流式上游调用（Ollama OpenAI 兼容端点）、严格 JSON 解析与字段归一、
 *       关键词分级回退、教材名称强制取自固定目录
 * 说明：本服务不复用 iGM_AIService（其为流式 + 计费通道）；任何异常都不向调用方抛出，
 *       始终返回带 source 标记的分析结果（ollama / keyword / keyword-default）
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_IsQuestionType,
  iGM_IsTextbookCode,
  iGM_NormalizeDifficultyLevel,
  iGM_QuestionTextbookCodes,
  iGM_QuestionTextbooks,
  iGM_ResolveTextbookName,
  type iGM_QuestionAnalysis,
  type iGM_QuestionDifficultyLevel,
  type iGM_QuestionOption,
  type iGM_QuestionType,
  type iGM_TextbookCode,
} from "../iGM_Types/iGM_Question";

// 类型定义 //
/** 分析入参 */
export interface iGM_QuestionAnalyzeInput {
  stem: string;
  options?: iGM_QuestionOption[];
  answer?: string;
  analysis?: string;
}

/** 关键词分级规则：按优先级顺序排列，命中即返回该级教材 */
interface iGM_QuestionKeywordTier {
  code: iGM_TextbookCode;
  keywords: string[];
}

// 核心逻辑 //
/** 固定教材目录文本（供 System Prompt 使用） */
const iGM_TextbookCatalogText = iGM_QuestionTextbookCodes.map(
  (code) => `${code} = ${iGM_QuestionTextbooks[code]}`,
).join("\n");

/** System Prompt：仅输出严格 JSON，字段与取值受限 */
const iGM_SystemPrompt = [
  "你是一名 Minecraft 教育题库的命题分析助手。",
  "请只输出一个严格合法的 JSON 对象，不要输出任何解释文字、Markdown 代码块或多余符号。",
  "JSON 必须包含以下字段：",
  '{ "difficultyCoefficient": 0.00-1.00 的数字, "difficultyLevel": "easy|medium|hard",',
  '  "type": "single_choice|multiple_choice|true_false|fill_blank|short_answer",',
  '  "tags": ["最多 5 个中文标签，每个不超过 8 个字"],',
  '  "textbookCode": "教材编码", "textbookName": "与编码对应的教材名称",',
  '  "suggestion": "不超过 60 字的命题建议" }',
  "textbookCode 必须严格取自下列六项之一：",
  iGM_TextbookCatalogText,
  "textbookName 必须与所选 textbookCode 的名称完全一致。",
].join("\n");

/** 关键词分级规则（严格按此优先级：命中第一级即返回） */
const iGM_KeywordTiers: iGM_QuestionKeywordTier[] = [
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
      "function", "数据包", "datapack", "execute", "选择器", "selector",
      "链式", "模块化",
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

/** 数值裁剪到 [0,1]；非法值回退默认 */
function iGM_ClampCoefficient(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

/** 由选项推断题型（有选项视为单选，否则简答） */
function iGM_InferType(options: iGM_QuestionOption[] | undefined): iGM_QuestionType {
  return options && options.length > 0 ? "single_choice" : "short_answer";
}

/** 归一难度等级：合法值直接采用，否则按系数派生 */
function iGM_NormalizeLevel(
  value: unknown,
  coefficient: number,
): iGM_QuestionDifficultyLevel {
  if (value === "easy" || value === "medium" || value === "hard") return value;
  return iGM_NormalizeDifficultyLevel(coefficient);
}

/** 归一标签：去空去重、最多 5 个 */
function iGM_NormalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim();
    if (tag.length === 0) continue;
    seen.add(tag.slice(0, 16));
    if (seen.size >= 5) break;
  }
  return [...seen];
}

/** 把内容切片为不超过 max 长度的字符串（空值回退空串） */
function iGM_SliceText(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : "";
  return text.slice(0, max);
}

/** 构造发送给模型的用户文本 */
function iGM_BuildUserText(input: iGM_QuestionAnalyzeInput): string {
  const optionText = (input.options ?? [])
    .map((option) => `${option.key}. ${option.text}`)
    .join(" | ");
  return [
    `题干：${input.stem}`,
    `选项：${optionText}`,
    `答案：${input.answer ?? ""}`,
    `解析：${input.analysis ?? ""}`,
  ].join("\n");
}

/** 提取模型输出中的 JSON 对象（去代码块围栏、取首尾花括号、容错解析） */
function iGM_ExtractJson(content: string): Record<string, unknown> | null {
  let text = content.trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 把解析出的对象归一为分析结果；教材编码非法时返回 null（转关键词回退） */
function iGM_NormalizeAnalysis(
  raw: Record<string, unknown>,
  input: iGM_QuestionAnalyzeInput,
): iGM_QuestionAnalysis | null {
  const codeRaw = typeof raw.textbookCode === "string" ? raw.textbookCode : "";
  if (!iGM_IsTextbookCode(codeRaw)) return null;
  const coefficient = iGM_ClampCoefficient(raw.difficultyCoefficient, 0.5);
  const type =
    typeof raw.type === "string" && iGM_IsQuestionType(raw.type)
      ? raw.type
      : iGM_InferType(input.options);
  return {
    difficultyCoefficient: coefficient,
    difficultyLevel: iGM_NormalizeLevel(raw.difficultyLevel, coefficient),
    type,
    tags: iGM_NormalizeTags(raw.tags),
    textbookCode: codeRaw,
    // 教材名称强制取自固定目录，忽略模型返回值
    textbookName: iGM_ResolveTextbookName(codeRaw),
    suggestion: iGM_SliceText(raw.suggestion, 120),
    source: "ollama",
  };
}

/** 关键词回退：按分级规则命中第一级；无命中回退必修一并标记 keyword-default */
function iGM_KeywordFallback(
  input: iGM_QuestionAnalyzeInput,
): iGM_QuestionAnalysis {
  const parts: string[] = [input.stem, input.answer ?? "", input.analysis ?? ""];
  for (const option of input.options ?? []) {
    parts.push(option.key ?? "", option.text ?? "");
  }
  const haystack = parts.join(" ").toLowerCase();

  for (const tier of iGM_KeywordTiers) {
    if (tier.keywords.some((keyword) => haystack.includes(keyword))) {
      return {
        difficultyCoefficient: 0.5,
        difficultyLevel: "medium",
        type: iGM_InferType(input.options),
        tags: [],
        textbookCode: tier.code,
        textbookName: iGM_ResolveTextbookName(tier.code),
        suggestion: `已按关键词命中归入「${iGM_ResolveTextbookName(tier.code)}」。`,
        source: "keyword",
      };
    }
  }

  return {
    difficultyCoefficient: 0.5,
    difficultyLevel: "medium",
    type: iGM_InferType(input.options),
    tags: [],
    textbookCode: "Compulsory_1",
    textbookName: iGM_ResolveTextbookName("Compulsory_1"),
    suggestion: "未识别到明确关键词，已默认归入必修一，请人工确认教材归属。",
    source: "keyword-default",
  };
}

/**
 * 调用本地模型（OpenAI 兼容 /chat/completions），返回消息正文。
 * 任一步骤失败返回 null；useJsonFormat 控制是否携带 response_format。
 */
async function iGM_CallModel(
  userText: string,
  useJsonFormat: boolean,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(iGM_Config.ai.channel.timeoutMs, 30000),
  );
  try {
    const body: Record<string, unknown> = {
      model: iGM_Config.ai.channel.model,
      messages: [
        { role: "system", content: iGM_SystemPrompt },
        { role: "user", content: userText },
      ],
      stream: false,
      temperature: 0,
      max_tokens: 400,
    };
    if (useJsonFormat) body.response_format = { type: "json_object" };
    const response = await fetch(
      `${iGM_Config.ai.channel.apiBase}/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    return typeof content === "string" && content.length > 0 ? content : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 分析题目：优先调用模型；response_format 触发失败时去掉该参数重试一次；
 * 仍失败或结果不可用则回退关键词匹配。永不抛出。
 */
export async function iGM_AnalyzeQuestionService(
  input: iGM_QuestionAnalyzeInput,
): Promise<iGM_QuestionAnalysis> {
  const userText = iGM_BuildUserText(input);
  let content = await iGM_CallModel(userText, true);
  if (content === null) {
    content = await iGM_CallModel(userText, false);
  }
  if (content !== null) {
    const parsed = iGM_ExtractJson(content);
    if (parsed) {
      const normalized = iGM_NormalizeAnalysis(parsed, input);
      if (normalized) return normalized;
    }
  }
  return iGM_KeywordFallback(input);
}

// 导出 //
export default { iGM_AnalyzeQuestionService };
