/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_AIQuestionSelection.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_ExamHighlight（/api/exam/select-ai-questions 等 4 个接口）
 * 模块：iGM_AIQuestionSelection
 * 作用：考试站 AI 亮点题目检索、送往命题管理、待审核审批的数据行与 DTO 类型定义
 * 内容：候选题数据行、亮点题目 DTO、亮点分析结果、审批状态枚举与判定、
 *       带审批列的题目数据行、待审题目 DTO、审批动作与编辑入参
 * 说明：iGM_Status（draft / published）语义保持不变；
 *       审批流独立使用 iGM_ReviewStatus（pending_review / approved / rejected）
 */

// 导入依赖 //
import type {
  iGM_QuestionDifficultyLevel,
  iGM_QuestionDto,
  iGM_QuestionOption,
  iGM_QuestionRow,
  iGM_QuestionType,
} from "./iGM_Question";

// 类型定义 //
/** 题目审批状态 */
export type iGM_QuestionReviewStatus =
  | "pending_review"
  | "approved"
  | "rejected";

/** 候选题状态：candidate（候选）/ sent（已送往命题管理） */
export type iGM_SelectionStatus = "candidate" | "sent";

/** 审批动作 */
export type iGM_ReviewAction = "approve" | "reject";

/** 亮点检索来源：ollama（模型）/ keyword（关键词规则降级） */
export type iGM_HighlightSource = "ollama" | "keyword";

/** 候选题目数据行（对应 iGM_AIQuestionSelections 表） */
export interface iGM_AIQuestionSelectionRow {
  iGM_Id: string;
  iGM_ExamId: string;
  iGM_CreatorId: string;
  iGM_QuestionIndex: number;
  iGM_Stem: string;
  iGM_Type: string;
  iGM_Options: string;
  iGM_Answer: string;
  iGM_Analysis: string;
  iGM_QualityScore: number;
  iGM_DifficultyCoefficient: number;
  iGM_DifficultyLevel: string;
  iGM_Reason: string;
  iGM_Tags: string;
  iGM_TextbookCode: string;
  iGM_TextbookName: string;
  iGM_Status: string;
  iGM_CreatedAt: string;
}

/** 亮点题目 DTO（对外返回的候选题） */
export interface iGM_HighlightQuestionDto {
  selectionId: string;
  questionIndex: number;
  stem: string;
  type: iGM_QuestionType;
  options: iGM_QuestionOption[];
  answer: string;
  analysis: string;
  qualityScore: number;
  difficultyCoefficient: number;
  difficultyLevel: iGM_QuestionDifficultyLevel;
  reason: string;
  tags: string[];
  textbookCode: string;
  textbookName: string;
  status: string;
}

/** 亮点检索结果 */
export interface iGM_HighlightAnalyzeResult {
  examId: string;
  model: string;
  source: iGM_HighlightSource;
  scanned: number;
  selected: number;
  questions: iGM_HighlightQuestionDto[];
}

/** 带审批列的题目数据行（iGM_QuestionBank 的 SELECT * 结果） */
export interface iGM_ReviewQuestionRow extends iGM_QuestionRow {
  iGM_QualityScore: number | null;
  iGM_AiSelected: boolean;
  iGM_ReviewStatus: string | null;
  iGM_AiReason: string | null;
  iGM_ModelUsed: string | null;
  iGM_SourceExamId: string | null;
}

/** 待审题目 DTO：与题目 DTO 同构，额外含 AI 评分与审批字段 */
export interface iGM_PendingQuestionDto extends iGM_QuestionDto {
  qualityScore: number | null;
  aiReason: string;
  aiSelected: boolean;
  reviewStatus: iGM_QuestionReviewStatus;
  modelUsed: string | null;
  sourceExamId: string | null;
}

/** 审批时的可选编辑字段 */
export interface iGM_ReviewQuestionEdits {
  stem?: string;
  options?: iGM_QuestionOption[];
  answer?: string;
  analysis?: string;
  textbookCode?: string;
  tags?: string[];
  difficultyCoefficient?: number | null;
  difficultyLevel?: string | null;
}

/** 审批结果 */
export interface iGM_ReviewResult {
  questionId: string;
  reviewStatus: iGM_QuestionReviewStatus;
  status: string;
}

/** 送往命题管理的结果 */
export interface iGM_SendToEditorResult {
  created: number;
  questionIds: string[];
}

// 核心逻辑 //
/** 判断字符串是否为合法审批状态 */
export function iGM_IsReviewStatus(
  value: string,
): value is iGM_QuestionReviewStatus {
  return (
    value === "pending_review" ||
    value === "approved" ||
    value === "rejected"
  );
}

// 导出 //
export default iGM_IsReviewStatus;
