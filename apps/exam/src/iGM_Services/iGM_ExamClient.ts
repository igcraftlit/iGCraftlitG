/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_ExamClient.ts
 * 所属层：前端 / 服务层
 * 路由：全局（调用后端 /api/exam/*）
 * 模块：iGM_ExamClient
 * 作用：iG&M 教育考试系统唯一的后端访问出口
 * 内容：统一响应解包、列表 / 详情 / 管理端列表与详情、上传 PDF 建转换档、
 *       转换进度轮询、转换后 HTML 地址构造、占用空间格式化、校对更新、重新转换、删除、确认发布、交卷记录
 * 说明：统一响应结构 { success, code, message, data }；错误归一化后抛出可读信息；
 *       本模块仅支持 PDF，转换由后端 pdf2htmlEX 产出自包含 HTML 目录
 */

// 导入依赖 //
import { iGM_ExamConfig } from "./iGM_ExamConfig";

// 类型定义 //
/** 试卷状态：草稿 / 已发布 / 已关闭 */
export type iGM_ExamStatus = "draft" | "published" | "closed";

/** 转换状态：待转换 / 转换中 / 已完成 / 转换失败 */
export type iGM_ExamConvertStatus =
  | "pending"
  | "converting"
  | "completed"
  | "failed";

/** 转换进度快照 */
export interface iGM_ExamConvertProgress {
  examId: string;
  status: iGM_ExamConvertStatus;
  /** 进度百分比（0 待转换 / 40 转换中 / 100 完成 / 0 失败） */
  percent: number;
  /** 转换产物实际占用字节数；未完成或未知时为 null */
  fileSize: number | null;
  /** 转换失败原因（无失败时为空串） */
  error: string;
}

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
  convertStatus: iGM_ExamConvertStatus;
  /** 转换产物实际占用字节数；未完成或未知时为 null */
  fileSize: number | null;
  createdAt: string;
}

/** 管理端列表项（含交卷数） */
export interface iGM_ExamAdminListItem extends iGM_ExamListItem {
  submissionCount: number;
}

/** 试卷详情（含转换进度与 HTML 预览地址） */
export interface iGM_ExamDetail extends iGM_ExamListItem {
  reviewer: string;
  notice: string;
  /** 转换进度快照 */
  convertProgress: iGM_ExamConvertProgress;
  /** 转换后 HTML 首页的可访问地址（iframe src）；未完成时为空串 */
  htmlApiPath: string;
  /** 转换后页面基准宽度（CSS 像素）；未完成或解析失败时为 null */
  pageWidth: number | null;
  /** 转换后页面基准高度（CSS 像素）；未完成或解析失败时为 null */
  pageHeight: number | null;
  /** 原始文件是否仍在服务器上（转换成功后为 false） */
  hasOriginalFile: boolean;
  /** 原始文件下载接口地址；无原始文件时为空串 */
  fileApiPath: string;
  /** 原始文件名（仅用于展示） */
  fileName: string;
  /** 原始文件格式（本模块固定 pdf） */
  fileType: string;
}

/** 校对更新入参（仅元数据） */
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

/* ---------- 通用 ---------- */

/** 将后端返回的相对接口地址补全为可访问的绝对地址 */
export function iGM_Exam_AbsoluteUrl(path: string): string {
  if (!path) return "";
  return `${iGM_ExamConfig.apiBase}${path}`;
}

/** 转换产物占用空间（MB，保留一位小数）；未知时返回空串 */
export function iGM_Exam_FormatSizeMb(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "";
  return (bytes / (1024 * 1024)).toFixed(1);
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

/** 上传 PDF：后端落盘后立即返回，pdf2htmlEX 转换在后台进行 */
export async function iGM_Exam_Upload(file: File): Promise<iGM_ExamDetail> {
  const form = new FormData();
  form.append("file", file);
  const data = await iGM_Exam_PostForm<{ exam: iGM_ExamDetail }>(
    "/api/exam/upload",
    form,
  );
  return data.exam;
}

/** 查询转换进度（上传 / 重新转换后轮询） */
export async function iGM_Exam_FetchProgress(
  examId: string,
): Promise<iGM_ExamConvertProgress> {
  const data = await iGM_Exam_Get<{ progress: iGM_ExamConvertProgress }>(
    `/api/exam/admin/progress?examId=${encodeURIComponent(examId)}`,
  );
  return data.progress;
}

/** 校对更新（仅元数据，不改转换产物） */
export async function iGM_Exam_Update(
  input: iGM_ExamUpdateInput,
): Promise<void> {
  await iGM_Exam_Post<{ updated: boolean }>("/api/exam/update", input);
}

/** 确认并发布试卷（原始 PDF 已在转换成功时删除） */
export async function iGM_Exam_Confirm(examId: string): Promise<void> {
  await iGM_Exam_Post<{ confirmed: boolean }>("/api/exam/confirm", { examId });
}

/** 使用保留期内的原始 PDF 重新转换 */
export async function iGM_Exam_Reparse(examId: string): Promise<void> {
  await iGM_Exam_Post<{ reparsed: boolean }>("/api/exam/reparse", { examId });
}

/** 删除试卷及关联原始文件与 HTML 目录 */
export async function iGM_Exam_Delete(examId: string): Promise<void> {
  await iGM_Exam_Post<{ deleted: boolean }>("/api/exam/delete", { examId });
}

// 导出 //
export default {
  iGM_Exam_AbsoluteUrl,
  iGM_Exam_FormatSizeMb,
  iGM_Exam_FetchList,
  iGM_Exam_FetchDetail,
  iGM_Exam_Submit,
  iGM_Exam_FetchAdminList,
  iGM_Exam_FetchAdminDetail,
  iGM_Exam_Upload,
  iGM_Exam_FetchProgress,
  iGM_Exam_Update,
  iGM_Exam_Confirm,
  iGM_Exam_Reparse,
  iGM_Exam_Delete,
};