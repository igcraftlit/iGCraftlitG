/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_ExaminerClient.ts
 * 所属层：前端 / 服务层
 * 路由：E_Admin_Exam（/admin）、E_Admin_Upload（/admin/upload）、
 *       E_QuestionEditor（/editor）
 * 模块：iGM_ExaminerClient
 * 作用：命题创作者（Examiner）准入状态与命题者编号档案的后端访问出口
 * 内容：登录态读取（/G_Auth/me）、准入状态查询、命题者编号档案读取
 * 说明：统一携带 Cookie（credentials: "include"），解包 { success, code, message, data }，
 *       失败抛出 iGM_ExamRequestError
 */

// 导入依赖 //
import { iGM_ExamConfig } from "./iGM_ExamConfig";
import { iGM_ExamRequestError } from "./iGM_ExamClient";

// 类型定义 //
/** 准入状态：none 未申请 / approved 已通过（其余状态前端不再关注） */
export type iGM_ExaminerGate = "none" | "approved";

/** 准入状态响应（已移除 application / history 字段） */
export interface iGM_ExaminerStatus {
  isExaminer: boolean;
  gate: iGM_ExaminerGate;
}

/** 命题者编号档案（考试站右上角徽标使用） */
export interface iGM_CreatorProfile {
  isExaminer: boolean;
  creatorNumber: string;
  /** 准入状态（现仅 approved） */
  status: string;
}

/** 我的申请状态 DTO（后端 /api/exam/creator/my-status 返回的 data） */
export interface iGM_MyApplicationStatus {
  hasApplication: boolean;
  status: "pending" | "approved" | "rejected" | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  reviewComment: string | null;
}

/** 命题方向多选枚举（后端持久化为逗号分隔） */
export const iGM_ExaminerDirections = [
  "minecraft_java",
  "redstone",
  "build",
  "server_dev",
  "mod_dev",
  "general",
] as const;
export type iGM_ExaminerDirection = (typeof iGM_ExaminerDirections)[number];

/** 申请表单输入 */
export interface iGM_ExaminerApplyForm {
  realName: string;
  contact: string;
  bio: string;
  directions: iGM_ExaminerDirection[];
  portfolioUrl?: string;
  reason: string;
  agreedToRules: boolean;
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

/* ---------- 命题者编号档案 ---------- */

/**
 * 读取当前登录用户的命题者编号档案。
 * 未登录或非在册命题创作者时，后端返回 HTTP 200 + success:false（code:"NOT_EXAMINER"），
 * 此时返回 null；网络异常同样返回 null，绝不抛出，供徽标静默降级。
 */
export async function iGM_Examiner_FetchCreatorProfile(): Promise<iGM_CreatorProfile | null> {
  try {
    const response = await fetch(
      `${iGM_ExamConfig.apiBase}/api/exam/creator/profile`,
      {
        headers: { Accept: "application/json" },
        credentials: "include",
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      success: boolean;
      code: number | string;
      data: iGM_CreatorProfile | null;
    };
    if (!payload.success || payload.code === "NOT_EXAMINER" || !payload.data) {
      return null;
    }
    return {
      isExaminer: true,
      creatorNumber: payload.data.creatorNumber,
      status: payload.data.status ?? "approved",
    };
  } catch {
    return null;
  }
}

/* ---------- 独立申请页：提交 ---------- */

/** 提交命题创作者申请 */
export async function iGM_Examiner_SubmitApply(
  form: iGM_ExaminerApplyForm,
): Promise<{ id: string }> {
  return await iGM_Examiner_Post<{ id: string }>(
    "/api/exam/creator/apply",
    form,
  );
}

/* ---------- 独立申请页：我的申请状态 ---------- */

/** 查询我的申请状态（未登录时后端返回 401 → 前端跳登录） */
export async function iGM_Examiner_FetchMyApplyStatus(): Promise<iGM_MyApplicationStatus> {
  return await iGM_Examiner_Get<iGM_MyApplicationStatus>(
    "/api/exam/creator/my-status",
  );
}

// 私有：POST 请求（携带 Cookie）
async function iGM_Examiner_Post<T>(
  path: string,
  body: unknown,
): Promise<T> {
  try {
    const response = await fetch(`${iGM_ExamConfig.apiBase}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return await iGM_Examiner_Unwrap<T>(response);
  } catch (error) {
    if (error instanceof iGM_ExamRequestError) throw error;
    throw new iGM_ExamRequestError(
      "Unable to reach the examiner service. Please try again later.",
    );
  }
}

// 导出 //
export default {
  iGM_Examiner_FetchMe,
  iGM_Examiner_FetchStatus,
  iGM_Examiner_FetchCreatorProfile,
};
