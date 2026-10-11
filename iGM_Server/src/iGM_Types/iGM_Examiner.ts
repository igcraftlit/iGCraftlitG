/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Examiner.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Examiner（/G_Examiner/*）、G_Exam（/api/exam/*）
 * 模块：iGM_Examiner
 * 作用：命题创作者申请 / 命题创作者 / 命题方预设的状态枚举、数据行与 DTO 类型
 * 内容：申请状态与方向白名单、申请 / 创作者 / 预设数据行、
 *       申请 DTO、准入状态 DTO、预设 DTO、申请与预设入参、表单校验常量
 * 说明：命题创作者资格由社区主站管理员审核通过后写入 iGM_Examiners；
 *       预设默认全站可见，试卷命题方文本命中关键词时归档到对应预设
 */

// 导入依赖 //
// （纯类型模块，无运行时依赖）

// 类型定义 //
/** 命题创作者申请状态：待审核 / 已通过 / 已拒绝 */
export type iGM_ExaminerAppStatus = "pending" | "approved" | "rejected";

/** 命题创作者账号状态：正常 / 已撤销 */
export type iGM_ExaminerStatus = "active" | "suspended";

/** 命题方向白名单（多选值） */
export const iGM_ExaminerDirections = [
  "minecraft",
  "java",
  "informatics",
  "general",
] as const;

/** 命题方向 */
export type iGM_ExaminerDirection = (typeof iGM_ExaminerDirections)[number];

/** 命题创作者准入综合状态（前端页面据此分支展示） */
export type iGM_ExaminerGate =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

/** 命题创作者申请表数据行（对应 iGM_ExaminerApplications） */
export interface iGM_ExaminerApplicationRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_RealName: string;
  iGM_Contact: string;
  iGM_Bio: string;
  /** 逗号分隔的命题方向 */
  iGM_Directions: string;
  iGM_PortfolioUrl: string | null;
  iGM_Reason: string;
  iGM_Status: string;
  iGM_ReviewerId: string | null;
  iGM_ReviewComment: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 命题创作者数据行（对应 iGM_Examiners） */
export interface iGM_ExaminerRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Status: string;
  iGM_ApprovedAt: string;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 命题方预设数据行（对应 iGM_IssuerPresets） */
export interface iGM_IssuerPresetRow {
  iGM_Id: string;
  iGM_Name: string;
  /** 逗号分隔的关键词 */
  iGM_Keywords: string;
  iGM_CreatorId: string;
  iGM_IsPublic: boolean;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 命题创作者申请 DTO（对外） */
export interface iGM_ExaminerApplicationDto {
  id: string;
  userId: string;
  realName: string;
  contact: string;
  bio: string;
  /** 命题方向数组 */
  directions: string[];
  portfolioUrl: string;
  reason: string;
  status: iGM_ExaminerAppStatus;
  reviewComment: string;
  createdAt: string;
  updatedAt: string;
  /** 管理端审核列表附加：申请人展示名 / UID / 邮箱 */
  applicantName?: string;
  applicantUid?: string;
  applicantEmail?: string;
}

/** 命题创作者准入状态 DTO（当前登录用户） */
export interface iGM_ExaminerGateDto {
  /** 是否具备命题创作者资格（审核通过且未被撤销） */
  isExaminer: boolean;
  /** 综合准入状态 */
  gate: iGM_ExaminerGate;
  /** 最近一次申请（无申请时为 null） */
  application: iGM_ExaminerApplicationDto | null;
  /** 当前用户是否具备审核资格（管理员 / 信任组织负责人） */
  canReview: boolean;
}

/** 命题方预设 DTO（对外） */
export interface iGM_IssuerPresetDto {
  id: string;
  name: string;
  /** 关键词数组 */
  keywords: string[];
  creatorId: string;
  isPublic: boolean;
  /** 是否为当前请求者创建 */
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 命题创作者申请入参 */
export interface iGM_ExaminerApplyInput {
  realName: string;
  contact: string;
  bio: string;
  /** 命题方向多选值数组 */
  directions: string[];
  portfolioUrl: string | null;
  reason: string;
}

/** 命题方预设入参 */
export interface iGM_IssuerPresetInput {
  name: string;
  /** 关键词数组（逗号分隔输入解析后） */
  keywords: string[];
  isPublic: boolean;
}

// 核心逻辑 //
/** 个人简介最少字数 */
export const iGM_ExaminerMinBioLength = 100;

/** 申请理由最少字数 */
export const iGM_ExaminerMinReasonLength = 200;

/** 命题方预设名称最大长度 */
export const iGM_ExaminerMaxPresetName = 120;

/** 判断字符串是否为合法申请状态 */
export function iGM_IsExaminerAppStatus(
  value: string,
): value is iGM_ExaminerAppStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

/** 逗号分隔文本 → 去重去空数组 */
export function iGM_SplitCommaList(value: string): string[] {
  const seen = new Set<string>();
  for (const part of value.split(/[,，]/)) {
    const trimmed = part.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen];
}

/** 数组 → 逗号分隔文本 */
export function iGM_JoinCommaList(values: readonly string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(",");
}

/** 过滤出合法的命题方向（未知值一律丢弃） */
export function iGM_NormalizeDirections(
  values: readonly string[],
): iGM_ExaminerDirection[] {
  return iGM_ExaminerDirections.filter((direction) =>
    values.includes(direction),
  );
}

// 导出 //
export default iGM_ExaminerDirections;
