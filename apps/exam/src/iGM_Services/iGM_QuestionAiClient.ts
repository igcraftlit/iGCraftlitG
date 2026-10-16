/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_QuestionAiClient.ts
 * 所属层：前端 / 服务层
 * 路由：E_Admin_Exam（/admin）、E_QuestionEditor（/editor）
 * 模块：iGM_QuestionAiClient
 * 作用：AI 亮点题目检索、送往命题管理、待审核题目列表与审核决策的后端访问出口
 * 内容：统一响应解包、GET / POST 封装、AI 选题结果 / 待审核题目 / 审核入参与结果类型、
 *       选项结构归一化
 * 说明：统一携带 Cookie（credentials: "include"），解包 { success, code, message, data }，
 *       失败抛出 iGM_ExamRequestError
 */

// 导入依赖 //
import { iGM_ExamConfig } from "./iGM_ExamConfig";
import { iGM_ExamRequestError } from "./iGM_ExamClient";
import type { iGM_QuestionOption, iGM_QuestionType } from "./iGM_QuestionClient";

// 类型定义 //
/** AI 选题来源：ollama 本地大模型 / keyword 规则筛选 */
export type iGM_AiSelectSource = "ollama" | "keyword";

/** AI 选中的亮点题目 */
export interface iGM_AiSelectedQuestion {
  selectionId: string;
  questionIndex: number;
  stem: string;
  type: iGM_QuestionType;
  options: iGM_QuestionOption[];
  answer: string;
  analysis: string;
  qualityScore: number;
  difficultyCoefficient: number | null;
  difficultyLevel: string;
  reason: string;
  tags: string[];
  textbookCode: string;
  textbookName: string;
  status: string;
}

/** AI 选题结果 */
export interface iGM_AiSelectResult {
  examId: string;
  model: string;
  source: iGM_AiSelectSource;
  scanned: number;
  selected: number;
  questions: iGM_AiSelectedQuestion[];
}

/** 送往命题管理结果 */
export interface iGM_AiSendResult {
  created: number;
  questionIds: string[];
}

/** 待审核题目 */
export interface iGM_PendingQuestion {
  id: string;
  stem: string;
  type: iGM_QuestionType;
  options: iGM_QuestionOption[];
  answer: string;
  analysis: string;
  difficultyCoefficient: number | null;
  difficultyLevel: string;
  tags: string[];
  textbookCode: string;
  textbookName: string;
  status: string;
  qualityScore: number | null;
  aiReason: string;
  aiSelected: boolean;
  reviewStatus: string;
  modelUsed: string;
  sourceExamId: string;
  createdAt: string;
}

/** 审核决策动作 */
export type iGM_ReviewAction = "approve" | "reject";

/** 审核时可编辑的字段（仅提交被修改项） */
export interface iGM_ReviewEdits {
  stem?: string;
  options?: iGM_QuestionOption[];
  answer?: string;
  analysis?: string;
  textbookCode?: string;
  tags?: string[];
  difficultyCoefficient?: number;
  difficultyLevel?: string;
}

/** 审核入参 */
export interface iGM_ReviewInput {
  questionId: string;
  action: iGM_ReviewAction;
  edits?: iGM_ReviewEdits;
}

/** 审核结果 */
export interface iGM_ReviewResult {
  questionId: string;
  reviewStatus: string;
  status: string;
}

/** 统一响应结构 */
interface iGM_QuestionAiEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
}

// 核心逻辑 //
/**
 * 选项结构归一化：兼容后端返回 { key, text } 对象数组或纯字符串数组，
 * 统一为 { key, text }；非数组时返回空数组
 */
export function iGM_QuestionAi_NormalizeOptions(raw: unknown): iGM_QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const fallbackKey = String.fromCharCode(65 + index);
    if (typeof item === "string") {
      return { key: fallbackKey, text: item };
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return {
        key: typeof record.key === "string" ? record.key : fallbackKey,
        text: typeof record.text === "string" ? record.text : "",
      };
    }
    return { key: fallbackKey, text: "" };
  });
}

/** 解析统一响应：失败时抛出带 message 与 code 的错误 */
async function iGM_QuestionAi_Unwrap<T>(response: Response): Promise<T> {
  let payload: iGM_QuestionAiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as iGM_QuestionAiEnvelope<T>;
  } catch {
    throw new iGM_ExamRequestError(
      `Unexpected response from the question AI service (HTTP ${response.status}).`,
      response.status,
    );
  }
  if (!response.ok || !payload.success || payload.data === null) {
    throw new iGM_ExamRequestError(
      payload.message || `HTTP ${response.status}`,
      payload.code ?? response.status,
    );
  }
  return payload.data;
}

/** GET 请求（携带 Cookie） */
async function iGM_QuestionAi_Get<T>(path: string): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    return await iGM_QuestionAi_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the question AI service. Please try again later.",
    );
  }
}

/** POST JSON 请求（携带 Cookie） */
async function iGM_QuestionAi_Post<T>(path: string, body: unknown): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    return await iGM_QuestionAi_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the question AI service. Please try again later.",
    );
  }
}

/* ---------- AI 亮点题目 ---------- */

/** 按试卷检索 AI 亮点题目（同步返回，可能耗时较长） */
export async function iGM_QuestionAi_Select(
  examId: string,
): Promise<iGM_AiSelectResult> {
  const data = await iGM_QuestionAi_Post<iGM_AiSelectResult>(
    "/api/exam/select-ai-questions",
    { examId },
  );
  return { ...data, questions: Array.isArray(data.questions) ? data.questions : [] };
}

/** 将选中的亮点题目送往命题管理（生成待审核题目） */
export async function iGM_QuestionAi_SendToEditor(
  selectionIds: string[],
): Promise<iGM_AiSendResult> {
  return await iGM_QuestionAi_Post<iGM_AiSendResult>("/api/exam/send-to-editor", {
    selectionIds,
  });
}

/* ---------- 待审核题目 ---------- */

/** 拉取待审核题目列表 */
export async function iGM_QuestionAi_FetchPending(): Promise<iGM_PendingQuestion[]> {
  const data = await iGM_QuestionAi_Get<{ questions: iGM_PendingQuestion[] }>(
    "/api/exam/pending-questions",
  );
  return Array.isArray(data.questions) ? data.questions : [];
}

/* ---------- 审核决策 ---------- */

/** 审核题目：通过 / 拒绝，可在通过时携带编辑项 */
export async function iGM_QuestionAi_Review(
  input: iGM_ReviewInput,
): Promise<iGM_ReviewResult> {
  return await iGM_QuestionAi_Post<iGM_ReviewResult>(
    "/api/exam/review-question",
    input,
  );
}

// 导出 //
export default {
  iGM_QuestionAi_NormalizeOptions,
  iGM_QuestionAi_Select,
  iGM_QuestionAi_SendToEditor,
  iGM_QuestionAi_FetchPending,
  iGM_QuestionAi_Review,
};
