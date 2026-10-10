/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Exam.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Exam（/api/exam/*）
 * 模块：iGM_Exam
 * 作用：iG&M 教育考试系统的状态枚举、数据行、DTO 与识别结果类型
 * 内容：试卷状态与转换状态、试卷/文件/交卷数据行、列表与详情 DTO、
 *       转换进度 DTO、文档自动识别结果、支持的文件格式白名单
 * 说明：本模块仅支持 PDF，转换由 pdf2htmlEX 产出自包含 HTML 目录，
 *       磁盘路径绝不出现在对外 DTO
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

/** 转换状态：待转换 / 转换中 / 已完成 / 转换失败 */
export type iGM_ExamConvertStatus =
  | "pending"
  | "converting"
  | "completed"
  | "failed";

/** 转换进度快照（前端上传后轮询） */
export interface iGM_ExamConvertProgressDto {
  examId: string;
  status: iGM_ExamConvertStatus;
  /** 进度百分比（0 待转换 / 40 转换中 / 100 完成 / 0 失败） */
  percent: number;
  /** 转换失败原因（无失败时为空串） */
  error: string;
}

/** 支持上传的文档格式（扩展名，小写不含点）：本模块仅 PDF */
export type iGM_ExamFileType = "pdf";

/** 支持上传的文档格式全集 */
export const iGM_ExamFileTypes: readonly iGM_ExamFileType[] = ["pdf"];

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
  /** 转换生成的 HTML 目录（相对存储根目录，不对外暴露） */
  iGM_HtmlPath: string | null;
  iGM_ParseStatus: string;
  iGM_OriginalFileDeleted: boolean;
  iGM_Status: string;
  iGM_CreatedBy: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 试卷文件数据行（对应 iGM_ExamFiles 表） */
export interface iGM_ExamFileRow {
  iGM_Id: string;
  iGM_ExamId: string;
  /** 上传时的原始文件名（仅展示） */
  iGM_FileName: string;
  iGM_FileType: string | null;
  iGM_FileSize: number | null;
  /** 临时目录中的相对路径；原始文件已删除时为 null */
  iGM_TempPath: string | null;
  iGM_ConvertStatus: string;
  /** 转换失败原因 */
  iGM_ConvertError: string | null;
  iGM_UploadedAt: string;
  /** 转换完成时间 */
  iGM_ConvertedAt: string | null;
  iGM_DeletedAt: string | null;
}

/** 交卷记录数据行（对应 iGM_ExamSubmissions 表） */
export interface iGM_ExamSubmissionRow {
  iGM_Id: string;
  iGM_ExamId: string;
  iGM_UserId: string | null;
  iGM_SubmittedAt: string;
}

/**
 * 文档自动识别结果
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
  convertStatus: iGM_ExamConvertStatus;
  createdAt: string;
}

/** 试卷详情 DTO（不含磁盘路径，仅暴露 HTML 与文件接口地址） */
export interface iGM_ExamDetailDto extends iGM_ExamListItemDto {
  reviewer: string;
  notice: string;
  /** 转换进度快照 */
  convertProgress: iGM_ExamConvertProgressDto;
  /** 转换后 HTML 首页的可访问地址（iframe src）；未完成时为空串 */
  htmlApiPath: string;
  /** 原始文件是否仍在服务器上（转换成功后为 false） */
  hasOriginalFile: boolean;
  /** 原始文件下载接口地址；无原始文件时为空串 */
  fileApiPath: string;
  /** 原始文件名（仅用于展示） */
  fileName: string;
  /** 原始文件格式（本模块固定 pdf） */
  fileType: string;
}

/** 交卷结果 */
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

/** 从文件名解析支持的文档格式，仅 PDF，其余返回 null */
export function iGM_ResolveExamFileType(
  fileName: string,
): iGM_ExamFileType | null {
  const matched = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  if (!matched) return null;
  const ext = matched[1].toLowerCase();
  return (iGM_ExamFileTypes as readonly string[]).includes(ext)
    ? (ext as iGM_ExamFileType)
    : null;
}

// 导出 //
export default iGM_ExamStatuses;