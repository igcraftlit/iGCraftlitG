/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Exam.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Exam（/api/exam/*）
 * 模块：iGM_Exam
 * 作用：iG&M 教育考试系统的状态枚举、数据行、DTO 与识别结果类型
 * 内容：试卷状态与解析状态、结构化内容块、试卷/文件/交卷数据行、列表与详情 DTO、
 *       解析进度 DTO、文档自动识别结果、支持的文件格式白名单
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

/** 解析状态：待解析 / 解析中 / 已解析 / 已确认 / 解析失败 */
export type iGM_ExamParseStatus =
  | "pending"
  | "parsing"
  | "parsed"
  | "confirmed"
  | "failed";

/**
 * 结构化内容块类型
 * 说明：试卷解析结果以块为单位存储，前端按类型用自定义组件渲染，不使用 Markdown
 */
export type iGM_ExamBlockType =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "image"
  | "formula"
  | "question";

/**
 * 结构化内容块
 * 说明：仅承载渲染所需数据；磁盘路径不出现，图片仅保存 images 目录内的文件名
 */
export interface iGM_ExamBlock {
  /** 块唯一标识（前端编辑与排序稳定键） */
  id: string;
  type: iGM_ExamBlockType;
  /** heading：层级 1-6；image：仅作说明 */
  level?: number;
  /** heading / paragraph / formula / question 题干 / image 替代文本 */
  text?: string;
  /** list：是否有序列表 */
  ordered?: boolean;
  /** list：列表项文本 */
  items?: string[];
  /** table：二维单元格文本（首行为表头） */
  rows?: string[][];
  /** image：images 目录内的文件名 */
  src?: string;
  /** image：图片原始像素宽高 */
  width?: number;
  height?: number;
  /** question：题号（如 1 / 一） */
  number?: string;
  /** question：可选项文本 */
  options?: string[];
  /** question：参考答案 */
  answer?: string;
  /** question：分值 */
  score?: number;
  /** 解析来源页码（1 起） */
  page?: number;
}

/** 解析进度快照（前端上传后轮询） */
export interface iGM_ExamParseProgressDto {
  examId: string;
  status: iGM_ExamParseStatus;
  /** 已解析页数 */
  parsedPages: number;
  /** 总页数（解析开始前为 0） */
  totalPages: number;
  /** 已生成的块数量 */
  blockCount: number;
  /** 进度百分比（0-100，取整） */
  percent: number;
  /** 解析失败原因（无失败时为空串） */
  error: string;
}

/** 支持上传的文档格式（扩展名，小写不含点） */
export type iGM_ExamFileType = "pdf" | "docx" | "doc" | "txt" | "md";

/** 支持上传的文档格式全集 */
export const iGM_ExamFileTypes: readonly iGM_ExamFileType[] = [
  "pdf",
  "docx",
  "doc",
  "txt",
  "md",
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
  /** 结构化内容块（PostgreSQL JSONB，驱动已解析为对象） */
  iGM_ContentBlocks: iGM_ExamBlock[] | null;
  /** 提取图片所在目录（相对存储根目录，不对外暴露） */
  iGM_ImagesPath: string | null;
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
  iGM_FileName: string;
  iGM_FileType: string | null;
  iGM_FileSize: number | null;
  /** 临时目录中的相对路径；原始文件已删除时为 null */
  iGM_TempPath: string | null;
  iGM_ParseStatus: string;
  /** 已解析页数 */
  iGM_ParsedPages: number;
  /** 文档总页数（解析开始前为 0） */
  iGM_TotalPages: number;
  /** 解析失败原因 */
  iGM_ParseError: string | null;
  iGM_UploadedAt: string;
  iGM_ConfirmedAt: string | null;
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
  parseStatus: iGM_ExamParseStatus;
  createdAt: string;
}

/** 试卷详情 DTO（不含磁盘路径，仅暴露文件接口地址） */
export interface iGM_ExamDetailDto extends iGM_ExamListItemDto {
  reviewer: string;
  notice: string;
  /** 结构化内容块（前端按类型渲染与编辑） */
  contentBlocks: iGM_ExamBlock[];
  /** 解析进度快照 */
  parseProgress: iGM_ExamParseProgressDto;
  /** 原始文件是否仍在服务器上（管理员确认后为 false） */
  hasOriginalFile: boolean;
  /** 原始文件下载 / 预览接口地址；无原始文件时为空串 */
  fileApiPath: string;
  /** 图片接口前缀（`imageApiBase + block.src` 即为可访问地址）；无图片目录时为空串 */
  imageApiBase: string;
  /** 原始文件名（仅用于展示） */
  fileName: string;
  /** 原始文件格式：pdf 可内联预览，其余仅下载 */
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

/** 从文件名解析支持的文档格式，不支持时返回 null */
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
