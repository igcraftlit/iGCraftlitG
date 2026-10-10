/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Exam.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Exam（/api/exam/*）
 * 模块：iGM_Exam
 * 作用：iG&M 教育考试系统的状态枚举、数据行、DTO 与识别结果类型
 * 内容：试卷状态、试卷/文件/交卷数据行、列表与详情 DTO、PDF 自动识别结果
 */

// 导入依赖 //
// （纯类型模块，无运行时依赖）

// 类型定义 //
/** 试卷状态：草稿 / 已发布 / 已关闭 */
export type iGM_ExamStatus = "draft" | "published" | "closed";

/** 试卷状态全集（服务端白名单校验） */
export const iGM_ExamStatuses: readonly iGM_ExamStatus[] = [
  "draft",
  "published",
  "closed",
];

/** 试卷数据行（对应 iGM_Exams 表） */
export interface iGM_ExamRow {
  iGM_Id: string;
  iGM_Title: string | null;
  iGM_Subject: string | null;
  iGM_Issuer: string | null;
  iGM_Reviewer: string | null;
  iGM_Duration: number | null;
  iGM_TotalScore: number | null;
  iGM_QuestionCount: number | null;
  iGM_Notice: string | null;
  iGM_FileUrl: string | null;
  iGM_Status: string;
  iGM_CreatedBy: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 试卷文件数据行（对应 iGM_ExamFiles 表） */
export interface iGM_ExamFileRow {
  iGM_Id: string;
  iGM_ExamId: string;
  iGM_FileName: string;
  iGM_RawText: string | null;
  iGM_CreatedAt: string;
}

/** 交卷记录数据行（对应 iGM_ExamSubmissions 表） */
export interface iGM_ExamSubmissionRow {
  iGM_Id: string;
  iGM_ExamId: string;
  iGM_UserId: string | null;
  iGM_SubmittedAt: string;
}

/**
 * PDF 自动识别结果
 * 字段均可为空（无法识别时留空，由管理员在校对界面补全）
 */
export interface iGM_ExamRecognized {
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
}

/** 试卷列表项 DTO（索引卡片展示所需字段） */
export interface iGM_ExamListItemDto {
  id: string;
  /** 试卷编号，形如 E-2026-001（按创建年份顺序生成） */
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

/** 试卷详情 DTO（不含磁盘路径，仅暴露文件接口地址） */
export interface iGM_ExamDetailDto extends iGM_ExamListItemDto {
  reviewer: string;
  notice: string;
  /** 试卷 PDF 预览接口地址（仅站内展示，禁止下载导出） */
  fileApiPath: string;
  /** PDF 文件名（原始名，仅用于展示） */
  fileName: string;
}

/** 试卷无法下载受限错误：message 为提示键 */
export interface iGM_ExamSubmitResult {
  id: string;
  examId: string;
  submittedAt: string;
}

// 核心逻辑 //
/** 判断任意字符串是否为合法试卷状态 */
export function iGM_IsExamStatus(value: string): value is iGM_ExamStatus {
  return (iGM_ExamStatuses as readonly string[]).includes(value);
}

// 导出 //
export default iGM_ExamStatuses;
