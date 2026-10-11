/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Question.ts
 * 所属层：后端 / 路由层
 * 路由：/api/question/*
 * 模块：G_Question
 * 作用：题库与题目编辑器接口集合（公开题库、我的题库、AI 分析、增删改、发布）
 * 内容：公开已发布题库分页、我的题目分页、AI 智能分析、创建、更新、删除、发布
 * 约束：统一响应 { success, code, message, data }；公开题库无需登录，其余须登录且
 *       具备命题创作者资格（管理人员放行）；操作者身份一律取自会话，禁止前端传参
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
  iGM_PageQuery,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_RequireExaminer } from "../iGM_Services/iGM_ExaminerService";
import {
  iGM_CreateQuestionService,
  iGM_DeleteQuestionService,
  iGM_ListMyQuestionService,
  iGM_ListPublicQuestionService,
  iGM_PublishQuestionService,
  iGM_QuestionError,
  iGM_UpdateQuestionService,
  type iGM_QuestionActor,
  type iGM_QuestionWriteInput,
} from "../iGM_Services/iGM_QuestionService";
import {
  iGM_AnalyzeQuestionService,
  type iGM_QuestionAnalyzeInput,
} from "../iGM_Services/iGM_QuestionAnalyzeService";
import type { iGM_QuestionOption } from "../iGM_Types/iGM_Question";

// 类型定义 //
// （路由层无额外对外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 读取请求体中的字符串数组（兼容数组与逗号分隔字符串），非数组一律返回空数组 */
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

/** 读取请求体中的数值字段（兼容数字与数字字符串），非法一律为 null */
function iGM_NumberField(body: unknown, key: string): number | null {
  const source = (body ?? {}) as Record<string, unknown>;
  const value = source[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const num = Number(value.trim());
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * 读取请求体中的选项：兼容对象数组、字符串数组、JSON 字符串与逗号分隔字符串，
 * 统一归一为 { key, text } 数组
 */
function iGM_QuestionOptionsField(
  body: unknown,
  key: string,
): iGM_QuestionOption[] {
  const source = (body ?? {}) as Record<string, unknown>;
  let value = source[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return [];
    if (trimmed.startsWith("[")) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        return [];
      }
    } else {
      return trimmed
        .split(/[,，]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((text, index) => ({ key: String.fromCharCode(65 + index), text }));
    }
  }
  if (!Array.isArray(value)) return [];
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

/**
 * 解析题目操作者：必须登录；管理人员可管理全部题目，
 * 其余用户必须具备命题创作者资格；身份一律取自会话，禁止前端传参
 */
async function iGM_ResolveQuestionActor(
  ctx: iGM_RouteContext,
): Promise<iGM_QuestionActor> {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const isAdmin = iGM_IsStaff(user);
  if (!isAdmin) await iGM_RequireExaminer(user.iGM_Id);
  return { userId: user.iGM_Id, isAdmin };
}

/** 从请求体读取题目写入入参 */
function iGM_ReadWriteInput(ctx: iGM_RouteContext): iGM_QuestionWriteInput {
  const body = ctx.body;
  return {
    stem: iGM_Field(body, "stem"),
    type: iGM_Field(body, "type"),
    options: iGM_QuestionOptionsField(body, "options"),
    answer: iGM_Field(body, "answer"),
    analysis: iGM_Field(body, "analysis"),
    textbookCode: iGM_Field(body, "textbookCode"),
    difficultyCoefficient: iGM_NumberField(body, "difficultyCoefficient"),
    difficultyLevel: iGM_Field(body, "difficultyLevel") || null,
    tags: iGM_StringArrayField(body, "tags"),
    aiTextbookCode: iGM_Field(body, "aiTextbookCode") || null,
    aiSource: iGM_Field(body, "aiSource") || null,
  };
}

/** 读取必填的 questionId 请求体字段 */
function iGM_RequireQuestionId(ctx: iGM_RouteContext): string {
  const questionId = iGM_Field(ctx.body, "questionId").trim();
  if (!questionId) throw new iGM_QuestionError("缺少题目 ID", 400);
  return questionId;
}

/* ---------- 公开：已发布题库分页 ---------- */
async function iGM_HandleList(ctx: iGM_RouteContext) {
  iGM_EnforceRateLimit(ctx, "questionRead", `ip:${iGM_ClientIp(ctx)}`);
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    await iGM_ListPublicQuestionService({
      textbookCode: iGM_Query(ctx.query, "textbookCode") || undefined,
      q: iGM_Query(ctx.query, "q") || undefined,
      page,
      pageSize,
    }),
  );
}

/* ---------- 我的题库分页（命题创作者仅见本人，管理人员见全部） ---------- */
async function iGM_HandleMine(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveQuestionActor(ctx);
  iGM_EnforceRateLimit(ctx, "questionRead", `ip:${iGM_ClientIp(ctx)}`);
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    await iGM_ListMyQuestionService(actor, {
      status: iGM_Query(ctx.query, "status") || undefined,
      page,
      pageSize,
    }),
  );
}

/* ---------- AI 智能分析（难度 / 题型 / 标签 / 教材归属 / 建议） ---------- */
async function iGM_HandleAnalyze(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveQuestionActor(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "questionAnalyze",
    `user:${actor.userId}:${iGM_ClientIp(ctx)}`,
  );
  const body = ctx.body;
  const input: iGM_QuestionAnalyzeInput = {
    stem: iGM_Field(body, "stem"),
    options: iGM_QuestionOptionsField(body, "options"),
    answer: iGM_Field(body, "answer"),
    analysis: iGM_Field(body, "analysis"),
  };
  return iGM_Ok(await iGM_AnalyzeQuestionService(input));
}

/* ---------- 创建题目（草稿） ---------- */
async function iGM_HandleCreate(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveQuestionActor(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "questionWrite",
    `user:${actor.userId}:${iGM_ClientIp(ctx)}`,
  );
  const question = await iGM_CreateQuestionService(
    actor,
    iGM_ReadWriteInput(ctx),
  );
  ctx.set.status = 201;
  return iGM_Ok({ question }, "题目已创建");
}

/* ---------- 更新题目 ---------- */
async function iGM_HandleUpdate(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveQuestionActor(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "questionWrite",
    `user:${actor.userId}:${iGM_ClientIp(ctx)}`,
  );
  const questionId = iGM_RequireQuestionId(ctx);
  const question = await iGM_UpdateQuestionService(
    questionId,
    actor,
    iGM_ReadWriteInput(ctx),
  );
  return iGM_Ok({ question }, "题目已保存");
}

/* ---------- 删除题目 ---------- */
async function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveQuestionActor(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "questionWrite",
    `user:${actor.userId}:${iGM_ClientIp(ctx)}`,
  );
  const questionId = iGM_RequireQuestionId(ctx);
  await iGM_DeleteQuestionService(questionId, actor);
  return iGM_Ok({ deleted: true }, "题目已删除");
}

/* ---------- 发布题目（导出静态题库） ---------- */
async function iGM_HandlePublish(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveQuestionActor(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "questionWrite",
    `user:${actor.userId}:${iGM_ClientIp(ctx)}`,
  );
  const questionId = iGM_RequireQuestionId(ctx);
  const question = await iGM_PublishQuestionService(questionId, actor);
  return iGM_Ok({ question, deploying: true }, "题目已发布，正在部署");
}

/**
 * G_Question 题库路由集合
 * 前缀统一 /api/question/；业务错误统一抛 iGM_QuestionError，
 * 由 iGM_ServerMain 全局错误处理器格式化
 */
export const G_Question = new Elysia({ name: "G_Question" })
  .get("/api/question/list", iGM_HandleList as never)
  .get("/api/question/mine", iGM_HandleMine as never)
  .post("/api/question/analyze", iGM_HandleAnalyze as never)
  .post("/api/question/create", iGM_HandleCreate as never)
  .post("/api/question/update", iGM_HandleUpdate as never)
  .post("/api/question/delete", iGM_HandleDelete as never)
  .post("/api/question/publish", iGM_HandlePublish as never);

// 导出 //
export default G_Question;
