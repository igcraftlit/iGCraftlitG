/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_QuestionClient.ts
 * 所属层：前端 / 服务层
 * 路由：E_QuestionEditor（/editor）
 * 模块：iGM_QuestionClient
 * 作用：题库（question）后端访问出口：我的题目分页、AI 辅助判断、创建 / 更新 / 删除 / 发布
 * 内容：统一响应解包、GET / POST 封装、题目 DTO 与分页结构、分析结果结构、五类题型与状态枚举
 * 说明：统一携带 Cookie（credentials: "include"），解包 { success, code, message, data }，
 *       失败抛出 iGM_ExamRequestError；准入闸门复用 iGM_ExaminerClient，不在此重复实现
 */

// 导入依赖 //
import { iGM_ExamConfig } from "./iGM_ExamConfig";
import { iGM_ExamRequestError } from "./iGM_ExamClient";

// 类型定义 //
/** 题型：单选 / 多选 / 判断 / 填空 / 简答 */
export type iGM_QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "short_answer";

/** 题目状态：草稿 / 已发布 */
export type iGM_QuestionStatus = "draft" | "published";

/** 选项（键 + 文本） */
export interface iGM_QuestionOption {
  key: string;
  text: string;
}

/** 题目实体 */
export interface iGM_QuestionDto {
  id: string;
  textbookCode: string;
  textbookName: string;
  stem: string;
  type: iGM_QuestionType;
  options: iGM_QuestionOption[];
  answer: string;
  analysis: string;
  difficultyCoefficient: number | null;
  difficultyLevel: string;
  tags: string[];
  status: iGM_QuestionStatus;
  createdAt: string;
  updatedAt?: string;
}

/** 分页结构（list / mine 共用） */
export interface iGM_QuestionPage {
  items: iGM_QuestionDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** AI 辅助判断结果 */
export interface iGM_QuestionAnalysis {
  difficultyCoefficient: number;
  difficultyLevel: string;
  type: iGM_QuestionType;
  tags: string[];
  textbookCode: string;
  textbookName: string;
  suggestion: string;
  source: string;
}

/** AI 辅助判断入参 */
export interface iGM_QuestionAnalyzeInput {
  stem: string;
  options?: iGM_QuestionOption[];
  answer?: string;
  analysis?: string;
}

/** 创建入参 */
export interface iGM_QuestionCreateInput {
  stem: string;
  type: iGM_QuestionType;
  options?: iGM_QuestionOption[];
  answer?: string;
  analysis?: string;
  textbookCode: string;
  difficultyCoefficient?: number;
  difficultyLevel?: string;
  tags?: string[];
  aiTextbookCode?: string;
  aiSource?: string;
}

/** 更新入参 */
export interface iGM_QuestionUpdateInput extends iGM_QuestionCreateInput {
  questionId: string;
}

/** 发布结果（deploying 为 true 表示已触发静态部署） */
export interface iGM_QuestionPublishResult {
  question: iGM_QuestionDto;
  deploying: boolean;
}

/** 我的题目查询参数 */
export interface iGM_QuestionMineQuery {
  page?: number;
  pageSize?: number;
  status?: string;
}

/** 统一响应结构 */
interface iGM_QuestionEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
}

// 核心逻辑 //
/** 解析统一响应：失败时抛出带 message 与 code 的错误 */
async function iGM_Question_Unwrap<T>(response: Response): Promise<T> {
  let payload: iGM_QuestionEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as iGM_QuestionEnvelope<T>;
  } catch {
    throw new iGM_ExamRequestError(
      `Unexpected response from the question service (HTTP ${response.status}).`,
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
async function iGM_Question_Get<T>(path: string): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    return await iGM_Question_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the question service. Please try again later.",
    );
  }
}

/** POST JSON 请求（携带 Cookie） */
async function iGM_Question_Post<T>(path: string, body: unknown): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    return await iGM_Question_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the question service. Please try again later.",
    );
  }
}

/* ---------- 我的题目 ---------- */

/** 我的题目分页（需登录且通过准入） */
export async function iGM_Question_FetchMine(
  query: iGM_QuestionMineQuery = {},
): Promise<iGM_QuestionPage> {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 50));
  if (query.status) params.set("status", query.status);
  return await iGM_Question_Get<iGM_QuestionPage>(
    `/api/question/mine?${params.toString()}`,
  );
}

/* ---------- AI 辅助判断 ---------- */

/** 依据题干 / 选项 / 答案 / 解析推断题型、难度、标签与教材 */
export async function iGM_Question_Analyze(
  input: iGM_QuestionAnalyzeInput,
): Promise<iGM_QuestionAnalysis> {
  return await iGM_Question_Post<iGM_QuestionAnalysis>(
    "/api/question/analyze",
    input,
  );
}

/* ---------- 增删改与发布 ---------- */

/** 创建题目（返回新建的题目实体） */
export async function iGM_Question_Create(
  input: iGM_QuestionCreateInput,
): Promise<iGM_QuestionDto> {
  const data = await iGM_Question_Post<{ question: iGM_QuestionDto }>(
    "/api/question/create",
    input,
  );
  return data.question;
}

/** 更新题目（返回更新后的题目实体） */
export async function iGM_Question_Update(
  input: iGM_QuestionUpdateInput,
): Promise<iGM_QuestionDto> {
  const data = await iGM_Question_Post<{ question: iGM_QuestionDto }>(
    "/api/question/update",
    input,
  );
  return data.question;
}

/** 删除题目 */
export async function iGM_Question_Delete(questionId: string): Promise<boolean> {
  const data = await iGM_Question_Post<{ deleted: boolean }>(
    "/api/question/delete",
    { questionId },
  );
  return Boolean(data.deleted);
}

/** 发布题目（返回题目与部署标记） */
export async function iGM_Question_Publish(
  questionId: string,
): Promise<iGM_QuestionPublishResult> {
  const data = await iGM_Question_Post<{
    question: iGM_QuestionDto;
    deploying: boolean;
  }>("/api/question/publish", { questionId });
  return { question: data.question, deploying: Boolean(data.deploying) };
}

// 导出 //
export default {
  iGM_Question_FetchMine,
  iGM_Question_Analyze,
  iGM_Question_Create,
  iGM_Question_Update,
  iGM_Question_Delete,
  iGM_Question_Publish,
};
