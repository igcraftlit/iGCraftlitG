/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_AIQuestionSelectionService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_ExamHighlight（POST /api/exam/send-to-editor 等 3 个接口）
 * 模块：iGM_AIQuestionSelectionService
 * 作用：候选题送往命题管理、待审题列表、审批（通过 / 拒绝）的业务逻辑
 * 内容：候选题 → 题库写入（带审批列）、候选题状态推进、待审列表组装、
 *       审批编辑应用、通过与发布（触发现有的题库静态导出）
 * 说明：复用 iGM_QuestionService 的 DTO 映射与发布/导出逻辑；
 *       教材名称一律按教材编码服务端派生，忽略前端传入值；
 *       归属校验：管理人员可操作全部，其余仅限本人
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_FindSelectionById,
  iGM_SetSelectionStatus,
} from "../iGM_Repositories/iGM_AIQuestionSelectionRepository";
import {
  iGM_FindQuestionById,
  iGM_InsertReviewQuestion,
  iGM_ListQuestionsByReviewStatus,
  iGM_UpdateQuestion,
  iGM_UpdateQuestionReview,
  type iGM_QuestionUpdateFields,
} from "../iGM_Repositories/iGM_QuestionRepository";
import {
  iGM_PublishQuestionService,
  iGM_QuestionError,
  iGM_ToQuestionDto,
  type iGM_QuestionActor,
} from "./iGM_QuestionService";
import {
  iGM_IsQuestionType,
  iGM_IsTextbookCode,
  iGM_JoinCommaList,
  iGM_NormalizeDifficultyLevel,
  iGM_ResolveTextbookName,
  iGM_SerializeQuestionOptions,
  type iGM_QuestionDifficultyLevel,
} from "../iGM_Types/iGM_Question";
import {
  iGM_IsReviewStatus,
  type iGM_PendingQuestionDto,
  type iGM_QuestionReviewStatus,
  type iGM_ReviewAction,
  type iGM_ReviewQuestionEdits,
  type iGM_ReviewQuestionRow,
  type iGM_ReviewResult,
  type iGM_SendToEditorResult,
} from "../iGM_Types/iGM_AIQuestionSelection";

// 类型定义 //
// （本服务对外类型见 iGM_Types/iGM_AIQuestionSelection.ts）

// 核心逻辑 //
/** 判断难度等级是否合法 */
function iGM_IsDifficultyLevelValue(
  value: string,
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

/** 带审批列的题目数据行 → 待审题目 DTO */
function iGM_ToPendingQuestionDto(
  row: iGM_ReviewQuestionRow,
): iGM_PendingQuestionDto {
  const reviewStatus: iGM_QuestionReviewStatus =
    row.iGM_ReviewStatus && iGM_IsReviewStatus(row.iGM_ReviewStatus)
      ? row.iGM_ReviewStatus
      : "pending_review";
  return {
    ...iGM_ToQuestionDto(row),
    qualityScore: row.iGM_QualityScore,
    aiReason: row.iGM_AiReason ?? "",
    aiSelected: row.iGM_AiSelected,
    reviewStatus,
    modelUsed: row.iGM_ModelUsed,
    sourceExamId: row.iGM_SourceExamId,
  };
}

/**
 * 把候选题逐条写入题库（draft + pending_review + AI 标记），并把候选题状态推进为 sent
 * 幂等：已完成发送（sent）的候选题跳过；归属非本人的候选题拒绝
 */
export async function iGM_SendSelectionsToEditorService(
  actor: iGM_QuestionActor,
  selectionIds: string[],
): Promise<iGM_SendToEditorResult> {
  const questionIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of selectionIds) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const selection = await iGM_FindSelectionById(id);
    if (!selection) throw new iGM_QuestionError("候选题不存在", 404);
    if (!actor.isAdmin && selection.iGM_CreatorId !== actor.userId) {
      throw new iGM_QuestionError("无权操作该候选题", 403);
    }
    if (selection.iGM_Status === "sent") continue;

    const textbookCode = iGM_IsTextbookCode(selection.iGM_TextbookCode)
      ? selection.iGM_TextbookCode
      : "Compulsory_1";
    const row = await iGM_InsertReviewQuestion({
      creatorId: actor.userId,
      stem: selection.iGM_Stem,
      type: iGM_IsQuestionType(selection.iGM_Type)
        ? selection.iGM_Type
        : "short_answer",
      options: selection.iGM_Options,
      answer: selection.iGM_Answer,
      analysis: selection.iGM_Analysis,
      textbookCode,
      textbookName: iGM_ResolveTextbookName(textbookCode),
      difficultyCoefficient: selection.iGM_DifficultyCoefficient,
      difficultyLevel: selection.iGM_DifficultyLevel,
      tags: selection.iGM_Tags,
      aiTextbookCode: textbookCode,
      aiSource: "ollama",
      adjustedByUser: false,
      status: "draft",
      reviewStatus: "pending_review",
      qualityScore: selection.iGM_QualityScore,
      aiSelected: true,
      aiReason: selection.iGM_Reason,
      modelUsed: iGM_Config.ai.channel.proModel,
      sourceExamId: selection.iGM_ExamId,
    });
    await iGM_SetSelectionStatus(id, "sent");
    questionIds.push(row.iGM_Id);
  }
  return { created: questionIds.length, questionIds };
}

/** 列出待审题目（命题创作者仅见本人，管理员见全部） */
export async function iGM_ListPendingQuestionsService(
  actor: iGM_QuestionActor,
): Promise<iGM_PendingQuestionDto[]> {
  const rows = await iGM_ListQuestionsByReviewStatus(
    "pending_review",
    actor.isAdmin ? null : actor.userId,
  );
  return rows.map(iGM_ToPendingQuestionDto);
}

/** 应用审批时的可选编辑字段（教材名称按编码服务端派生） */
async function iGM_ApplyReviewEdits(
  id: string,
  edits: iGM_ReviewQuestionEdits,
): Promise<void> {
  const update: iGM_QuestionUpdateFields = {};
  if (edits.stem !== undefined) update.stem = edits.stem.trim();
  if (edits.answer !== undefined) update.answer = edits.answer.trim();
  if (edits.analysis !== undefined) update.analysis = edits.analysis.trim();
  if (edits.options !== undefined) {
    update.options = iGM_SerializeQuestionOptions(edits.options);
  }
  if (edits.tags !== undefined) {
    update.tags = iGM_JoinCommaList(
      edits.tags.map((tag) => tag.trim()).filter(Boolean),
    );
  }
  if (edits.textbookCode !== undefined) {
    if (!iGM_IsTextbookCode(edits.textbookCode)) {
      throw new iGM_QuestionError("请选择教材", 400);
    }
    update.textbookCode = edits.textbookCode;
    update.textbookName = iGM_ResolveTextbookName(edits.textbookCode);
  }
  if (edits.difficultyCoefficient !== undefined) {
    update.difficultyCoefficient = iGM_ClampCoefficient(
      edits.difficultyCoefficient,
    );
  }
  if (edits.difficultyLevel !== undefined) {
    update.difficultyLevel =
      edits.difficultyLevel && iGM_IsDifficultyLevelValue(edits.difficultyLevel)
        ? edits.difficultyLevel
        : iGM_NormalizeDifficultyLevel(update.difficultyCoefficient ?? null);
  }
  if (Object.keys(update).length === 0) return;
  await iGM_UpdateQuestion(id, update);
}

/**
 * 审批题目：approve → 审批通过并发布（触发现有的题库静态导出）；
 * reject → 标记为已拒绝。edits 存在时先更新题目字段
 */
export async function iGM_ReviewQuestionService(
  actor: iGM_QuestionActor,
  questionId: string,
  action: iGM_ReviewAction,
  edits?: iGM_ReviewQuestionEdits,
): Promise<iGM_ReviewResult> {
  const id = questionId.trim();
  if (!id) throw new iGM_QuestionError("缺少题目 ID", 400);

  const existing = await iGM_FindQuestionById(id);
  if (!existing) throw new iGM_QuestionError("题目不存在", 404);
  if (!actor.isAdmin && existing.iGM_CreatorId !== actor.userId) {
    throw new iGM_QuestionError("无权审核该题目", 403);
  }

  if (edits) await iGM_ApplyReviewEdits(id, edits);

  if (action === "approve") {
    await iGM_UpdateQuestionReview(id, { reviewStatus: "approved" });
    // 复用现有题库发布服务：置为已发布并导出静态题库
    await iGM_PublishQuestionService(id, actor);
    const updated = await iGM_FindQuestionById(id);
    return {
      questionId: id,
      reviewStatus: "approved",
      status: updated?.iGM_Status ?? "published",
    };
  }

  await iGM_UpdateQuestionReview(id, { reviewStatus: "rejected" });
  const updated = await iGM_FindQuestionById(id);
  return {
    questionId: id,
    reviewStatus: "rejected",
    status: updated?.iGM_Status ?? existing.iGM_Status,
  };
}

// 导出 //
export default {
  iGM_SendSelectionsToEditorService,
  iGM_ListPendingQuestionsService,
  iGM_ReviewQuestionService,
};
