/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_QuestionService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Question（/api/question/*）
 * 模块：iGM_QuestionService
 * 作用：题库题目的增删改查、发布与列表业务逻辑
 * 内容：题目业务错误类型、字段校验（题干 / 题型 / 教材必填）、教材名称服务端派生、
 *       归属校验、创建（草稿）、更新（保持状态）、删除、发布、公开题库与我的题库分页，
 *       已发布集合变更后触发静态导出
 * 说明：教材名称一律按教材编码在服务端派生，忽略前端传入值；
 *       是否为「人工调整」由 AI 建议编码与最终编码是否不一致自动计算
 */

// 导入依赖 //
import {
  iGM_DeleteQuestion,
  iGM_FindQuestionById,
  iGM_InsertQuestion,
  iGM_ListPublicQuestions,
  iGM_ListPublishedQuestions,
  iGM_ListQuestionsByCreator,
  iGM_SetQuestionStatus,
  iGM_UpdateQuestion,
} from "../iGM_Repositories/iGM_QuestionRepository";
import {
  iGM_IsQuestionStatus,
  iGM_IsQuestionType,
  iGM_IsTextbookCode,
  iGM_JoinCommaList,
  iGM_NormalizeDifficultyLevel,
  iGM_ParseQuestionOptions,
  iGM_ResolveTextbookName,
  iGM_SerializeQuestionOptions,
  iGM_SplitCommaList,
  type iGM_QuestionDifficultyLevel,
  type iGM_QuestionDto,
  type iGM_QuestionOption,
  type iGM_QuestionRow,
} from "../iGM_Types/iGM_Question";
import {
  iGM_CommitQuestionStaticFiles,
  iGM_ExportQuestionBankStatic,
} from "./iGM_QuestionStaticService";

// 类型定义 //
/** 题目业务错误：message 为可直接展示的中文提示 */
export class iGM_QuestionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_QuestionError";
  }
}

/** 题目操作者：创建者本人或管理人员（管理人员可管理全部题目） */
export interface iGM_QuestionActor {
  userId: string;
  isAdmin: boolean;
}

/** 题目写入入参（创建 / 更新共用） */
export interface iGM_QuestionWriteInput {
  stem: string;
  type: string;
  options: iGM_QuestionOption[];
  answer: string;
  analysis: string;
  textbookCode: string;
  difficultyCoefficient: number | null;
  difficultyLevel: string | null;
  tags: string[];
  aiTextbookCode: string | null;
  aiSource: string | null;
}

/** 分页列表结果 */
export interface iGM_QuestionListResult {
  items: iGM_QuestionDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 分页参数上限 */
const iGM_QuestionMaxPageSize = 50;

// 核心逻辑 //
/** 判断难度等级是否合法 */
function iGM_IsDifficultyLevel(
  value: string | null,
): value is iGM_QuestionDifficultyLevel {
  return value === "easy" || value === "medium" || value === "hard";
}

/** 难度系数归一（非法或空值返回 null，合法则裁剪到 [0,1]） */
function iGM_ClampCoefficient(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 数据行 → 题目 DTO（唯一映射出口） */
export function iGM_ToQuestionDto(row: iGM_QuestionRow): iGM_QuestionDto {
  const type =
    row.iGM_Type && iGM_IsQuestionType(row.iGM_Type)
      ? row.iGM_Type
      : "short_answer";
  return {
    id: row.iGM_Id,
    textbookCode: row.iGM_TextbookCode,
    textbookName: row.iGM_TextbookName,
    stem: row.iGM_Stem ?? "",
    type,
    options: iGM_ParseQuestionOptions(row.iGM_Options),
    answer: row.iGM_Answer ?? "",
    analysis: row.iGM_Analysis ?? "",
    difficultyCoefficient: row.iGM_DifficultyCoefficient,
    difficultyLevel: iGM_IsDifficultyLevel(row.iGM_DifficultyLevel)
      ? row.iGM_DifficultyLevel
      : null,
    tags: iGM_SplitCommaList(row.iGM_Tags ?? ""),
    status: iGM_IsQuestionStatus(row.iGM_Status) ? row.iGM_Status : "draft",
    aiTextbookCode: row.iGM_AiTextbookCode,
    aiSource: row.iGM_AiSource,
    adjustedByUser: row.iGM_AdjustedByUser,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 校验归属：管理人员可操作全部，其余仅限本人题目 */
function iGM_AssertQuestionAccess(
  row: iGM_QuestionRow,
  actor: iGM_QuestionActor,
): void {
  if (!actor.isAdmin && row.iGM_CreatorId !== actor.userId) {
    throw new iGM_QuestionError("无权访问该题目", 403);
  }
}

/** 校验写入入参，非法时抛错（教材缺失为 400，其余为 422） */
function iGM_AssertWriteInput(input: iGM_QuestionWriteInput): string {
  if (!input.stem.trim()) {
    throw new iGM_QuestionError("题干不能为空", 422);
  }
  if (!iGM_IsQuestionType(input.type)) {
    throw new iGM_QuestionError("题型不合法", 422);
  }
  if (!iGM_IsTextbookCode(input.textbookCode)) {
    throw new iGM_QuestionError("请选择教材", 400);
  }
  return input.textbookCode;
}

/** 组装可写字段（教材名称服务端派生、人工调整标记自动计算） */
function iGM_BuildWriteFields(
  input: iGM_QuestionWriteInput,
): {
  textbookCode: string;
  textbookName: string;
  difficultyCoefficient: number | null;
  difficultyLevel: iGM_QuestionDifficultyLevel;
  tags: string;
  options: string;
  adjustedByUser: boolean;
} {
  const textbookCode = iGM_AssertWriteInput(input);
  const coefficient = iGM_ClampCoefficient(input.difficultyCoefficient);
  const difficultyLevel = iGM_IsDifficultyLevel(input.difficultyLevel)
    ? input.difficultyLevel
    : iGM_NormalizeDifficultyLevel(coefficient);
  const aiCode = input.aiTextbookCode ? input.aiTextbookCode.trim() : "";
  return {
    textbookCode,
    textbookName: iGM_ResolveTextbookName(textbookCode),
    difficultyCoefficient: coefficient,
    difficultyLevel,
    tags: iGM_JoinCommaList(
      input.tags.map((tag) => tag.trim()).filter(Boolean),
    ),
    options: iGM_SerializeQuestionOptions(input.options),
    adjustedByUser: aiCode.length > 0 && textbookCode !== aiCode,
  };
}

/**
 * 已发布集合变更后导出题库静态数据并推送
 * 失败仅告警，不阻断业务本身
 */
async function iGM_ExportQuestionBank(): Promise<void> {
  try {
    await iGM_ExportQuestionBankStatic();
    await iGM_CommitQuestionStaticFiles();
  } catch (error) {
    console.warn(
      `[iGM_QuestionService] 导出题库静态数据失败：${String(error)}`,
    );
  }
}

/** 规范化分页参数 */
function iGM_NormalizePage(page: number, pageSize: number): {
  page: number;
  pageSize: number;
} {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), iGM_QuestionMaxPageSize)
      : 20;
  return { page: safePage, pageSize: safeSize };
}

/** 创建题目（固定为草稿状态） */
export async function iGM_CreateQuestionService(
  actor: iGM_QuestionActor,
  input: iGM_QuestionWriteInput,
): Promise<iGM_QuestionDto> {
  const fields = iGM_BuildWriteFields(input);
  const row = await iGM_InsertQuestion({
    creatorId: actor.userId,
    stem: input.stem.trim(),
    type: input.type,
    options: fields.options,
    answer: input.answer.trim(),
    analysis: input.analysis.trim(),
    textbookCode: fields.textbookCode,
    textbookName: fields.textbookName,
    difficultyCoefficient: fields.difficultyCoefficient,
    difficultyLevel: fields.difficultyLevel,
    tags: fields.tags,
    aiTextbookCode: input.aiTextbookCode ? input.aiTextbookCode.trim() : null,
    aiSource: input.aiSource ? input.aiSource.trim() : null,
    adjustedByUser: fields.adjustedByUser,
    status: "draft",
  });
  return iGM_ToQuestionDto(row);
}

/** 更新题目（保持原状态；已发布题目更新后重新导出静态题库） */
export async function iGM_UpdateQuestionService(
  questionId: string,
  actor: iGM_QuestionActor,
  input: iGM_QuestionWriteInput,
): Promise<iGM_QuestionDto> {
  const existing = await iGM_FindQuestionById(questionId);
  if (!existing) {
    throw new iGM_QuestionError("题目不存在", 404);
  }
  iGM_AssertQuestionAccess(existing, actor);
  const fields = iGM_BuildWriteFields(input);
  await iGM_UpdateQuestion(questionId, {
    stem: input.stem.trim(),
    type: input.type,
    options: fields.options,
    answer: input.answer.trim(),
    analysis: input.analysis.trim(),
    textbookCode: fields.textbookCode,
    textbookName: fields.textbookName,
    difficultyCoefficient: fields.difficultyCoefficient,
    difficultyLevel: fields.difficultyLevel,
    tags: fields.tags,
    aiTextbookCode: input.aiTextbookCode ? input.aiTextbookCode.trim() : null,
    aiSource: input.aiSource ? input.aiSource.trim() : null,
    adjustedByUser: fields.adjustedByUser,
  });
  const updated = await iGM_FindQuestionById(questionId);
  if (existing.iGM_Status === "published") {
    await iGM_ExportQuestionBank();
  }
  return iGM_ToQuestionDto(updated ?? existing);
}

/** 删除题目（已发布题目删除后重新导出静态题库） */
export async function iGM_DeleteQuestionService(
  questionId: string,
  actor: iGM_QuestionActor,
): Promise<void> {
  const existing = await iGM_FindQuestionById(questionId);
  if (!existing) {
    throw new iGM_QuestionError("题目不存在", 404);
  }
  iGM_AssertQuestionAccess(existing, actor);
  await iGM_DeleteQuestion(questionId);
  if (existing.iGM_Status === "published") {
    await iGM_ExportQuestionBank();
  }
}

/** 发布题目（置为已发布并导出静态题库；重复发布则重新导出） */
export async function iGM_PublishQuestionService(
  questionId: string,
  actor: iGM_QuestionActor,
): Promise<iGM_QuestionDto> {
  const existing = await iGM_FindQuestionById(questionId);
  if (!existing) {
    throw new iGM_QuestionError("题目不存在", 404);
  }
  iGM_AssertQuestionAccess(existing, actor);
  if (existing.iGM_Status !== "published") {
    await iGM_SetQuestionStatus(questionId, "published");
  }
  await iGM_ExportQuestionBank();
  const updated = await iGM_FindQuestionById(questionId);
  return iGM_ToQuestionDto(updated ?? existing);
}

/** 已发布题目 DTO 列表（静态导出使用） */
export async function iGM_ListPublishedQuestionDtos(): Promise<iGM_QuestionDto[]> {
  const rows = await iGM_ListPublishedQuestions();
  return rows.map(iGM_ToQuestionDto);
}

/** 公开题库分页（仅已发布；可按教材与关键词筛选） */
export async function iGM_ListPublicQuestionService(options: {
  textbookCode?: string;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<iGM_QuestionListResult> {
  const { page, pageSize } = iGM_NormalizePage(options.page, options.pageSize);
  const textbookCode =
    options.textbookCode && iGM_IsTextbookCode(options.textbookCode)
      ? options.textbookCode
      : undefined;
  const q = options.q?.trim() ? options.q.trim() : undefined;
  const { rows, total } = await iGM_ListPublicQuestions({
    textbookCode,
    q,
    page,
    pageSize,
  });
  return {
    items: rows.map(iGM_ToQuestionDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 我的题库分页（管理人员可见全部，其余仅本人；可按状态筛选） */
export async function iGM_ListMyQuestionService(
  actor: iGM_QuestionActor,
  options: { status?: string; page: number; pageSize: number },
): Promise<iGM_QuestionListResult> {
  const { page, pageSize } = iGM_NormalizePage(options.page, options.pageSize);
  const status =
    options.status && iGM_IsQuestionStatus(options.status)
      ? options.status
      : undefined;
  // 管理人员（isAdmin）不按创建者过滤，可见全部题目
  const { rows, total } = await iGM_ListQuestionsByCreator(
    actor.isAdmin ? null : actor.userId,
    { status, page, pageSize },
  );
  return {
    items: rows.map(iGM_ToQuestionDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// 导出 //
export default {
  iGM_CreateQuestionService,
  iGM_UpdateQuestionService,
  iGM_DeleteQuestionService,
  iGM_PublishQuestionService,
  iGM_ListPublishedQuestionDtos,
  iGM_ListPublicQuestionService,
  iGM_ListMyQuestionService,
};
