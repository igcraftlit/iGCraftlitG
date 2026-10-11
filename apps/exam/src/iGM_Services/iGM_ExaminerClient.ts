/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_ExaminerClient.ts
 * 所属层：前端 / 服务层
 * 路由：E_Examiner_Apply（/apply）、E_Examiner_Status（/status）、E_Issuer_Presets（/presets）、
 *       E_Admin_Exam（/admin）、E_Admin_Upload（/admin/upload）
 * 模块：iGM_ExaminerClient
 * 作用：命题创作者（Examiner）申请、准入状态与命题方预设的后端访问出口
 * 内容：登录态读取（/G_Auth/me）、准入状态查询、申请提交、命题方预设的增删改查
 * 说明：统一携带 Cookie（credentials: "include"），解包 { success, code, message, data }，
 *       失败抛出 iGM_ExamRequestError；审核面板（review）在社区主站实现，本模块不包含
 */

// 导入依赖 //
import { iGM_ExamConfig } from "./iGM_ExamConfig";
import { iGM_ExamRequestError } from "./iGM_ExamClient";

// 类型定义 //
/** 准入状态：none 未申请 / pending 待审核 / approved 已通过 / rejected 已拒绝 / suspended 已撤销 */
export type iGM_ExaminerGate =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

/** 申请状态 */
export type iGM_ExaminerApplicationStatus = "pending" | "approved" | "rejected";

/** 命题方向 */
export type iGM_ExaminerDirection =
  | "minecraft"
  | "java"
  | "informatics"
  | "general";

/** 命题创作者申请单 */
export interface iGM_ExaminerApplicationDto {
  id: string;
  userId: string;
  realName: string;
  contact: string;
  bio: string;
  directions: string[];
  portfolioUrl: string;
  reason: string;
  status: iGM_ExaminerApplicationStatus;
  reviewComment: string;
  createdAt: string;
  updatedAt: string;
}

/** 准入状态响应 */
export interface iGM_ExaminerStatus {
  isExaminer: boolean;
  gate: iGM_ExaminerGate;
  application: iGM_ExaminerApplicationDto | null;
  canReview: boolean;
  history: iGM_ExaminerApplicationDto[];
}

/** 命题方预设 */
export interface iGM_IssuerPresetDto {
  id: string;
  name: string;
  keywords: string[];
  creatorId: string;
  isPublic: boolean;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 当前登录用户（/G_Auth/me 返回的 user 字段） */
export interface iGM_ExaminerUser {
  id: string;
  username: string;
  displayName: string;
  uid: string;
  role: string;
  email: string;
}

/** 申请提交入参 */
export interface iGM_ExaminerApplyInput {
  realName: string;
  contact: string;
  bio: string;
  directions: string[];
  portfolioUrl?: string;
  reason: string;
}

/** 命题方预设入参 */
export interface iGM_IssuerPresetInput {
  name: string;
  keywords: string[];
  isPublic: boolean;
}

/** 统一响应结构 */
interface iGM_ExaminerEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
}

// 核心逻辑 //
/** 解析统一响应：失败时抛出带 message 与 code 的错误 */
async function iGM_Examiner_Unwrap<T>(response: Response): Promise<T> {
  let payload: iGM_ExaminerEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as iGM_ExaminerEnvelope<T>;
  } catch {
    throw new iGM_ExamRequestError(
      `Unexpected response from the examiner service (HTTP ${response.status}).`,
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
async function iGM_Examiner_Get<T>(path: string): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    return await iGM_Examiner_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the examiner service. Please try again later.",
    );
  }
}

/** POST JSON 请求（携带 Cookie） */
async function iGM_Examiner_Post<T>(path: string, body: unknown): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    return await iGM_Examiner_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the examiner service. Please try again later.",
    );
  }
}

/* ---------- 登录态 ---------- */

/** 读取当前登录用户；未登录时后端返回 401（error.code === 401） */
export async function iGM_Examiner_FetchMe(): Promise<iGM_ExaminerUser> {
  const data = await iGM_Examiner_Get<{ user: iGM_ExaminerUser }>("/G_Auth/me");
  return data.user;
}

/* ---------- 准入状态 ---------- */

/** 查询当前用户的命题创作者准入状态 */
export async function iGM_Examiner_FetchStatus(): Promise<iGM_ExaminerStatus> {
  return await iGM_Examiner_Get<iGM_ExaminerStatus>("/G_Examiner/status");
}

/** 提交命题创作者申请 */
export async function iGM_Examiner_SubmitApply(
  input: iGM_ExaminerApplyInput,
): Promise<iGM_ExaminerApplicationDto> {
  const data = await iGM_Examiner_Post<{ application: iGM_ExaminerApplicationDto }>(
    "/G_Examiner/apply",
    input,
  );
  return data.application;
}

/* ---------- 命题方预设 ---------- */

/** 命题方预设列表（含全站可见与他人共享的预设） */
export async function iGM_Examiner_FetchPresets(): Promise<iGM_IssuerPresetDto[]> {
  const data = await iGM_Examiner_Get<{ presets: iGM_IssuerPresetDto[] }>(
    "/G_Examiner/presets",
  );
  return Array.isArray(data.presets) ? data.presets : [];
}

/** 新建命题方预设 */
export async function iGM_Examiner_CreatePreset(
  input: iGM_IssuerPresetInput,
): Promise<iGM_IssuerPresetDto> {
  const data = await iGM_Examiner_Post<{ preset: iGM_IssuerPresetDto }>(
    "/G_Examiner/presets",
    input,
  );
  return data.preset;
}

/** 更新命题方预设 */
export async function iGM_Examiner_UpdatePreset(
  presetId: string,
  input: iGM_IssuerPresetInput,
): Promise<iGM_IssuerPresetDto> {
  const data = await iGM_Examiner_Post<{ preset: iGM_IssuerPresetDto }>(
    "/G_Examiner/presets/update",
    { presetId, ...input },
  );
  return data.preset;
}

/** 删除命题方预设 */
export async function iGM_Examiner_DeletePreset(
  presetId: string,
): Promise<string> {
  const data = await iGM_Examiner_Post<{ presetId: string }>(
    "/G_Examiner/presets/delete",
    { presetId },
  );
  return data.presetId;
}

// 导出 //
export default {
  iGM_Examiner_FetchMe,
  iGM_Examiner_FetchStatus,
  iGM_Examiner_SubmitApply,
  iGM_Examiner_FetchPresets,
  iGM_Examiner_CreatePreset,
  iGM_Examiner_UpdatePreset,
  iGM_Examiner_DeletePreset,
};
