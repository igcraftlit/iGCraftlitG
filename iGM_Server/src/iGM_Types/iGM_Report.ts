/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Report.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Post、G_Admin
 * 模块：iGM_Report
 * 作用：用户举报（帖子/评论）的枚举、输入行与 DTO 类型
 * 内容：举报原因六分类、举报目标类型、提交入参与校验类型守卫
 */

// 导入依赖 //
// （纯类型模块，无运行时依赖）

// 类型定义 //
/** 举报原因分类码（入库 iGM_Reports.iGM_Reason） */
export type iGM_ReportReason =
  | "spam"
  | "abuse"
  | "porn"
  | "illegal"
  | "plagiarism"
  | "other";

/** 举报目标类型：帖子 / 评论 */
export type iGM_ReportTargetType = "post" | "comment";

/** 举报原因分类码全集（服务端白名单校验） */
export const iGM_ReportReasons: readonly iGM_ReportReason[] = [
  "spam",
  "abuse",
  "porn",
  "illegal",
  "plagiarism",
  "other",
];

/** 用户提交举报入参 */
export interface iGM_ReportSubmitInput {
  /** 目标类型，当前仅开放帖子举报 */
  targetType: iGM_ReportTargetType;
  /** 目标 ID（帖子 ID） */
  targetId: string;
  /** 原因分类码 */
  reason: iGM_ReportReason;
  /** 原因描述（5-500 字） */
  detail: string;
}

/** 举报数据行（对应 iGM_Reports 表） */
export interface iGM_ReportRow {
  iGM_Id: string;
  iGM_ReporterId: string;
  iGM_TargetType: string;
  iGM_TargetId: string;
  iGM_Reason: string;
  iGM_ReasonDetail: string;
  iGM_Status: "pending" | "resolved" | "dismissed";
  iGM_HandlerId: string | null;
  iGM_CreatedAt: string;
  iGM_HandledAt: string | null;
}

// 核心逻辑 //
/** 判断任意字符串是否为合法举报原因分类码 */
export function iGM_IsReportReason(value: string): value is iGM_ReportReason {
  return (iGM_ReportReasons as readonly string[]).includes(value);
}

// 导出 //
export default iGM_ReportReasons;
