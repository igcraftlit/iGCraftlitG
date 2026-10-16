/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_ExamHighlight.ts
 * 所属层：后端 / 路由层
 * 路由：/api/exam/select-ai-questions、/api/exam/send-to-editor、
 *       /api/exam/pending-questions、/api/exam/review-question
 * 模块：G_ExamHighlight
 * 作用：考试站 AI 亮点题目检索、送往命题管理、待审核审批接口集合
 * 内容：
 *   1) POST /api/exam/select-ai-questions：抽取试卷候选题目并逐题评分，落库亮点候选题
 *   2) POST /api/exam/send-to-editor：把候选题写入题库并标记为待审核
 *   3) GET  /api/exam/pending-questions：列出待审题目（命题创作者仅见本人，管理员见全部）
 *   4) POST /api/exam/review-question：审批题目（通过即发布 / 拒绝），支持可选编辑
 * 约束：统一响应 { success, code, message, data }；须登录且具备命题创作者资格（管理员放行），
 *       操作者身份一律取自会话，禁止前端传参；业务错误复用 iGM_QuestionError
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_IsStaff, iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_ClientIp,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_RequireExaminer } from "../iGM_Services/iGM_ExaminerService";
import {
  iGM_QuestionError,
  type iGM_QuestionActor,
} from "../iGM_Services/iGM_QuestionService";
import { iGM_SelectAIQuestionsService } from "../iGM_Services/iGM_ExamHighlightService";
import {
  iGM_ListPendingQuestionsService,
  iGM_ReviewQuestionService,
  iGM_SendSelectionsToEditorService,
} from "../iGM_Services/iGM_AIQuestionSelectionService";
import type {
  iGM_ReviewAction,
  iGM_ReviewQuestionEdits,
} from "../iGM_Types/iGM_AIQuestionSelection";
import type { iGM_QuestionOption } from "../iGM_Types/iGM_Question";

// 类型定义 //
// （路由层无额外对外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 读取请求体中的字符串数组（兼容数组与逗号分隔字符串） */
function iGM_StringArrayField(body: unknown, key: string): string[] {
  const source = (body ?? {}) as Record<string, unknown>;
  const value = source[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(/[,，]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

/** 把原始数组归一为选项对象数组 */
function iGM_OptionsFrom(value: unknown[]): iGM_QuestionOption[] {
  return value
    .map((item, index): iGM_QuestionOption | null => {
      if (typeof item === "string") {
        return { key: String.fromCharCode(65 + index), text: item };
      }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        return {
          key: typeof obj.key === "string" ? obj.key : "",
          text: typeof obj.text === "string" ? obj.text : "",
        };
      }
      return null;
    })
    .filter((option): option is iGM_QuestionOption => option !== null)
    .filter((option) => option.key.length > 0 || option.text.length > 0);
}

/** 读取可选 edits 对象（不存在返回 undefined；仅收集显式提供的字段） */
function iGM_ReadReviewEdits(
  ctx: iGM_RouteContext,
): iGM_ReviewQuestionEdits | undefined {
  const source = (ctx.body ?? {}) as Record<string, unknown>;
  const value = source.edits;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const edits: iGM_ReviewQuestionEdits = {};
  if (typeof raw.stem === "string") edits.stem = raw.stem;
  if (typeof raw.answer === "string") edits.answer = raw.answer;
  if (typeof raw.analysis === "string") edits.analysis = raw.analysis;
  if (typeof raw.textbookCode === "string") edits.textbookCode = raw.textbookCode;
  if (Array.isArray(raw.options)) edits.options = iGM_OptionsFrom(raw.options);
  if (Array.isArray(raw.tags)) {
    edits.tags = raw.tags.filter((tag): tag is string => typeof tag === "string");
  } else if (typeof raw.tags === "string") {
    edits.tags = raw.tags
      .split(/[,，]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (typeof raw.difficultyCoefficient === "number") {
    edits.difficultyCoefficient = Number.isFinite(raw.difficultyCoefficient)
      ? raw.difficultyCoefficient
      : null;
  } else if (raw.difficultyCoefficient === null) {
    edits.difficultyCoefficient = null;
  }
  if (typeof raw.difficultyLevel === "string") {
    edits.difficultyLevel = raw.difficultyLevel;
  }
  return edits;
}

/**
 * 解析题目操作者：必须登录；管理人员放行，
 * 其余用户必须具备命题创作者资格；身份一律取自会话
 */
async function iGM_ResolveActor(ctx: iGM_RouteContext): Promise<iGM_QuestionActor> {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const isAdmin = iGM_IsStaff(user);
  if (!isAdmin) await iGM_RequireExaminer(user.iGM_Id);
  return { userId: user.iGM_Id, isAdmin };
}

/* ---------- AI 亮点题目检索（抽取 + 评分 + 落库候选题） ---------- */
async function iGM_HandleSelectAIQuestions(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveActor(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "highlightAnalyze",
    `user:${actor.userId}:${iGM_ClientIp(ctx)}`,
  );
  const examId = iGM_Field(ctx.body, "examId");
  return iGM_Ok(await iGM_SelectAIQuestionsService(actor, examId));
}

/* ---------- 送往命题管理（候选题写入题库并标记待审核） ---------- */
async function iGM_HandleSendToEditor(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveActor(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "highlightWrite",
    `user:${actor.userId}:${iGM_ClientIp(ctx)}`,
  );
  const selectionIds = iGM_StringArrayField(ctx.body, "selectionIds");
  if (selectionIds.length === 0) {
    throw new iGM_QuestionError("请选择候选题", 400);
  }
  const result = await iGM_SendSelectionsToEditorService(actor, selectionIds);
  return iGM_Ok(result, "已送往命题管理");
}

/* ---------- 待审题目列表 ---------- */
async function iGM_HandlePendingQuestions(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveActor(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "questionRead",
    `user:${actor.userId}:${iGM_ClientIp(ctx)}`,
  );
  return iGM_Ok({ questions: await iGM_ListPendingQuestionsService(actor) });
}

/* ---------- 审批题目（通过即发布 / 拒绝） ---------- */
async function iGM_HandleReviewQuestion(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveActor(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "highlightWrite",
    `user:${actor.userId}:${iGM_ClientIp(ctx)}`,
  );
  const questionId = iGM_Field(ctx.body, "questionId").trim();
  if (!questionId) throw new iGM_QuestionError("缺少题目 ID", 400);
  const actionRaw = iGM_Field(ctx.body, "action").trim();
  if (actionRaw !== "approve" && actionRaw !== "reject") {
    throw new iGM_QuestionError("审批动作不合法", 422);
  }
  const action = actionRaw as iGM_ReviewAction;
  const result = await iGM_ReviewQuestionService(
    actor,
    questionId,
    action,
    iGM_ReadReviewEdits(ctx),
  );
  return iGM_Ok(result, action === "approve" ? "题目已通过并发布" : "题目已拒绝");
}

/**
 * G_ExamHighlight 路由集合
 * 前缀统一 /api/exam/，与既有 G_Exam 的 /api/exam/* 路径互不冲突；
 * 业务错误统一抛 iGM_QuestionError，由 iGM_ServerMain 全局错误处理器格式化
 */
export const G_ExamHighlight = new Elysia({ name: "G_ExamHighlight" })
  .post("/api/exam/select-ai-questions", iGM_HandleSelectAIQuestions as never)
  .post("/api/exam/send-to-editor", iGM_HandleSendToEditor as never)
  .get("/api/exam/pending-questions", iGM_HandlePendingQuestions as never)
  .post("/api/exam/review-question", iGM_HandleReviewQuestion as never);

// 导出 //
export default G_ExamHighlight;
