/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Examiner.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Examiner（/api/exam/creator/profile、/G_Examiner/revoke）
 * 模块：iGM_Examiner
 * 作用：命题创作者数据行、编号 DTO 与辅助函数类型
 * 说明：命题创作者申请与命题方预设模块已于 047 迁移移除
 */

// 导入依赖 //
// （纯类型模块，无运行时依赖）

// 类型定义 //
/** 命题创作者账号状态：正常 / 已撤销 */
export type iGM_ExaminerStatus = "active" | "suspended";

/** 命题创作者数据行（对应 iGM_Examiners） */
export interface iGM_ExaminerRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Status: string;
  /** 命题创作者专属编号（10 位零填充，形如 0000000001；未编号时为 null） */
  iGM_CreatorNumber: string | null;
  iGM_ApprovedAt: string;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 命题者编号 DTO（对外，考试站右上角徽标使用） */
export interface iGM_CreatorProfileDto {
  /** 是否具备命题创作者资格 */
  isExaminer: boolean;
  /** 命题创作者专属编号（10 位零填充，前端补 # 前缀） */
  creatorNumber: string;
  /** 准入状态（仅在册命题创作者会返回，固定为 approved） */
  status: iGM_ExaminerStatus | "approved";
}

// 核心逻辑 //
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

// 导出 //

// ===== 命题创作者申请 =====

/** 申请状态 */
export type iGM_ApplicationStatus = "pending" | "approved" | "rejected";

/** 命题创作者申请表的数据行（iGM_ExaminerApplications） */
export interface iGM_ExaminerApplicationRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_RealName: string;
  iGM_Contact: string;
  iGM_Bio: string;
  iGM_Directions: string;
  iGM_PortfolioUrl: string | null;
  iGM_Reason: string;
  iGM_Status: iGM_ApplicationStatus;
  iGM_ReviewerId: string | null;
  iGM_ReviewComment: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
  iGM_AgreedToRules: boolean;
}

/** 提交命题创作者申请的输入 DTO */
export interface iGM_ExaminerApplyInput {
  realName: string;
  contact: string;
  bio: string;
  directions: string[];
  portfolioUrl?: string;
  reason: string;
  agreedToRules: boolean;
}

/** 我的申请状态 DTO（前端独立申请页用） */
export interface iGM_MyApplicationDto {
  hasApplication: boolean;
  status: iGM_ApplicationStatus | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  reviewComment: string | null;
}

/** 管理端：申请列表项 DTO */
export interface iGM_ExaminerApplicationItemDto {
  id: string;
  userId: string;
  applicantName: string;
  applicantUid: string;
  realName: string;
  contact: string;
  status: iGM_ApplicationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewerName: string | null;
  reviewComment: string | null;
}

/** 管理端：申请详情 DTO（含完整申请表单与审核日志） */
export interface iGM_ExaminerApplicationDetailDto
  extends iGM_ExaminerApplicationItemDto {
  applicantEmail: string;
  bio: string;
  directions: string[];
  portfolioUrl: string | null;
  reason: string;
  agreedToRules: boolean;
}

/** 管理端：申请分页结果 DTO */
export interface iGM_ExaminerApplicationPageDto {
  items: iGM_ExaminerApplicationItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
