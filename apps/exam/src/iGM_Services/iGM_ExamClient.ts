/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_ExamClient.ts
 * 所属层：前端 / 服务层
 * 路由：全局（调用后端 /api/exam/*）
 * 模块：iGM_ExamClient
 * 作用：iG&M 教育考试系统唯一的后端访问出口
 * 内容：统一响应解包、列表 / 详情 / 管理端列表、PDF 上传与替换、
 *       校对更新、发布 / 关闭 / 删除、交卷记录、PDF 预览地址构造
 * 说明：统一响应结构 { success, code, message, data }；错误归一化后抛出可读信息
 */

// 导入依赖 //
import { iGM_ExamConfig } from "./iGM_ExamConfig";

// 类型定义 //
export type iGM_ExamStatus = "draft" | "published" | "closed";

/** 统一响应结构 */
interface iGM_ExamEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
}

/** 试卷列表项 */
export interface iGM_ExamListItem {
  id: string;
  code: string;
  title: string;
  subject: string;
  issuer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
  status: iGM_ExamStatus;
  createdAt: string;
}

/** 管理端列表项（含交卷数） */
export interface iGM_ExamAdminListItem extends iGM_ExamListItem {
  submissionCount: number;
}

/** 试卷详情 */
export interface iGM_ExamDetail extends iGM_ExamListItem {
  reviewer: string;
  notice: string;
  fileApiPath: string;
  fileName: string;
}

/** PDF 自动识别结果 */
export interface iGM_ExamRecognized {
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
}

/** 上传建档结果 */
export interface iGM_ExamUploadResult {
  examId: string;
  recognized: iGM_ExamRecognized;
}

/** 校对更新入参 */
export interface iGM_ExamUpdateInput {
  examId: string;
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
  notice: string;
}

/** 交卷结果 */
export interface iGM_ExamSubmission {
  id: string;
  examId: string;
  submittedAt: string;
}

/** 请求失败时抛出的归一化错误 */
export class iGM_ExamRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "iGM_ExamRequestError";
  }
}

// 核心逻辑 //
/** 解析统一响应：失败时抛出带 message 的错误 */
async function iGM_Exam_Unwrap<T>(response: Response): Promise<T> {
  let payload: iGM_ExamEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as iGM_ExamEnvelope<T>;
  } catch {
    throw new iGM_ExamRequestError(
      `Unexpected response from the examination service (HTTP ${response.status}).`,
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

/** GET 请求 */
async function iGM_Exam_Get<T>(path: string): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      headers: { Accept: "application/json" },
    });
    return await iGM_Exam_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the examination service. Please try again later.",
    );
  }
}

/** POST JSON 请求 */
async function iGM_Exam_Post<T>(path: string, body: unknown): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await iGM_Exam_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the examination service. Please try again later.",
    );
  }
}

/** POST multipart 请求（文件上传） */
async function iGM_Exam_PostForm<T>(path: string, form: FormData): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    });
    return await iGM_Exam_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the examination service. Please try again later.",
    );
  }
}

/* ---------- 公开接口 ---------- */

/** 已发布试卷列表 */
export async function iGM_Exam_FetchList(): Promise<iGM_ExamListItem[]> {
  const data = await iGM_Exam_Get<{ exams: iGM_ExamListItem[] }>("/api/exam/list");
  return data.exams;
}

/** 试卷详情 */
export async function iGM_Exam_FetchDetail(
  examId: string,
): Promise<iGM_ExamDetail> {
  const data = await iGM_Exam_Get<{ exam: iGM_ExamDetail }>(
    `/api/exam/detail?examId=${encodeURIComponent(examId)}`,
  );
  return data.exam;
}

/** 构造试卷 PDF 预览地址（仅站内展示，禁止下载导出） */
export function iGM_Exam_BuildFileUrl(examId: string): string {
  return `${iGM_ExamConfig.apiBase}/api/exam/file?examId=${encodeURIComponent(examId)}`;
}

/** 交卷 */
export async function iGM_Exam_Submit(
  examId: string,
): Promise<iGM_ExamSubmission> {
  const data = await iGM_Exam_Post<{ submission: iGM_ExamSubmission }>(
    "/api/exam/submit",
    { examId },
  );
  return data.submission;
}

/* ---------- 管理端接口 ---------- */

/** 全部试卷列表（管理端） */
export async function iGM_Exam_FetchAdminList(): Promise<iGM_ExamAdminListItem[]> {
  const data = await iGM_Exam_Get<{ exams: iGM_ExamAdminListItem[] }>(
    "/api/exam/admin/list",
  );
  return data.exams;
}

/** 上传 PDF 并自动识别建档 */
export async function iGM_Exam_Upload(
  file: File,
): Promise<iGM_ExamUploadResult> {
  const form = new FormData();
  form.append("file", file);
  return await iGM_Exam_PostForm<iGM_ExamUploadResult>("/api/exam/upload", form);
}

/** 替换试卷 PDF 文件 */
export async function iGM_Exam_ReplaceFile(
  examId: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("examId", examId);
  form.append("file", file);
  await iGM_Exam_PostForm<{ replaced: boolean }>("/api/exam/replace", form);
}

/** 校对更新 */
export async function iGM_Exam_Update(
  input: iGM_ExamUpdateInput,
): Promise<void> {
  await iGM_Exam_Post<{ updated: boolean }>("/api/exam/update", input);
}

/** 发布 */
export async function iGM_Exam_Publish(examId: string): Promise<void> {
  await iGM_Exam_Post<{ published: boolean }>("/api/exam/publish", { examId });
}

/** 关闭 */
export async function iGM_Exam_Close(examId: string): Promise<void> {
  await iGM_Exam_Post<{ closed: boolean }>("/api/exam/close", { examId });
}

/** 删除 */
export async function iGM_Exam_Delete(examId: string): Promise<void> {
  await iGM_Exam_Post<{ deleted: boolean }>("/api/exam/delete", { examId });
}

// 导出 //
export default {
  iGM_Exam_FetchList,
  iGM_Exam_FetchDetail,
  iGM_Exam_FetchAdminList,
  iGM_Exam_BuildFileUrl,
  iGM_Exam_Upload,
  iGM_Exam_ReplaceFile,
  iGM_Exam_Update,
  iGM_Exam_Publish,
  iGM_Exam_Close,
  iGM_Exam_Delete,
  iGM_Exam_Submit,
};
