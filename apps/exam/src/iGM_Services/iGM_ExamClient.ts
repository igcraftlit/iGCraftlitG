/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_ExamClient.ts
 * 所属层：前端 / 服务层
 * 路由：全局（调用后端 /api/exam/*）
 * 模块：iGM_ExamClient
 * 作用：iG&M 教育考试系统唯一的后端访问出口
 * 内容：统一响应解包、列表 / 详情 / 管理端列表与详情、上传解析建档、
 *       校对更新、确认删除原文件、重新解析、删除、交卷记录、原始文件地址构造
 * 说明：统一响应结构 { success, code, message, data }；错误归一化后抛出可读信息
 */

// 导入依赖 //
import { iGM_ExamConfig } from "./iGM_ExamConfig";

// 类型定义 //
/** 试卷状态：草稿 / 已发布 / 已关闭 */
export type iGM_ExamStatus = "draft" | "published" | "closed";

/** 解析状态：待解析 / 已解析 / 已确认 / 解析失败 */
export type iGM_ExamParseStatus = "pending" | "parsed" | "confirmed" | "failed";

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
  parseStatus: iGM_ExamParseStatus;
  createdAt: string;
}

/** 管理端列表项（含交卷数） */
export interface iGM_ExamAdminListItem extends iGM_ExamListItem {
  submissionCount: number;
}

/** 试卷详情（含解析全文与原始文件信息） */
export interface iGM_ExamDetail extends iGM_ExamListItem {
  reviewer: string;
  notice: string;
  /** 解析后的试卷全文（Markdown） */
  contentMarkdown: string;
  /** 原始文件是否仍在服务器上（管理员确认后为 false） */
  hasOriginalFile: boolean;
  /** 原始文件预览 / 下载接口地址；无原始文件时为空串 */
  fileApiPath: string;
  /** 原始文件名（仅用于展示） */
  fileName: string;
  /** 原始文件格式：pdf 可内联预览，其余仅下载 */
  fileType: string;
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
  /** 解析全文（Markdown），可手动修改 */
  contentMarkdown: string;
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

/* ---------- 通用 ---------- */

/** 将后端返回的相对接口地址补全为可访问的绝对地址 */
export function iGM_Exam_AbsoluteUrl(path: string): string {
  if (!path) return "";
  return `${iGM_ExamConfig.apiBase}${path}`;
}

/* ---------- 公开接口 ---------- */

/** 已发布试卷列表 */
export async function iGM_Exam_FetchList(): Promise<iGM_ExamListItem[]> {
  const data = await iGM_Exam_Get<{ exams: iGM_ExamListItem[] }>("/api/exam/list");
  return data.exams;
}

/** 试卷详情（公开） */
export async function iGM_Exam_FetchDetail(
  examId: string,
): Promise<iGM_ExamDetail> {
  const data = await iGM_Exam_Get<{ exam: iGM_ExamDetail }>(
    `/api/exam/detail?examId=${encodeURIComponent(examId)}`,
  );
  return data.exam;
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

/** 单个试卷详情（管理端，允许草稿） */
export async function iGM_Exam_FetchAdminDetail(
  examId: string,
): Promise<iGM_ExamDetail> {
  const data = await iGM_Exam_Get<{ exam: iGM_ExamDetail }>(
    `/api/exam/admin/detail?examId=${encodeURIComponent(examId)}`,
  );
  return data.exam;
}

/** 上传试卷文档：解析全文并建档为草稿 */
export async function iGM_Exam_Upload(file: File): Promise<iGM_ExamDetail> {
  const form = new FormData();
  form.append("file", file);
  const data = await iGM_Exam_PostForm<{ exam: iGM_ExamDetail }>(
    "/api/exam/upload",
    form,
  );
  return data.exam;
}

/** 校对更新（元数据 + 解析全文，不删除原始文件） */
export async function iGM_Exam_Update(
  input: iGM_ExamUpdateInput,
): Promise<void> {
  await iGM_Exam_Post<{ updated: boolean }>("/api/exam/update", input);
}

/** 确认并删除原始文件，同时发布试卷 */
export async function iGM_Exam_Confirm(examId: string): Promise<void> {
  await iGM_Exam_Post<{ confirmed: boolean }>("/api/exam/confirm", { examId });
}

/** 使用原始文件重新解析 */
export async function iGM_Exam_Reparse(examId: string): Promise<void> {
  await iGM_Exam_Post<{ reparsed: boolean }>("/api/exam/reparse", { examId });
}

/** 删除试卷及关联文件 */
export async function iGM_Exam_Delete(examId: string): Promise<void> {
  await iGM_Exam_Post<{ deleted: boolean }>("/api/exam/delete", { examId });
}

// 导出 //
export default {
  iGM_Exam_AbsoluteUrl,
  iGM_Exam_FetchList,
  iGM_Exam_FetchDetail,
  iGM_Exam_Submit,
  iGM_Exam_FetchAdminList,
  iGM_Exam_FetchAdminDetail,
  iGM_Exam_Upload,
  iGM_Exam_Update,
  iGM_Exam_Confirm,
  iGM_Exam_Reparse,
  iGM_Exam_Delete,
};
