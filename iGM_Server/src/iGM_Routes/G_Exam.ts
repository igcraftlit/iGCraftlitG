/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Exam.ts
 * 所属层：后端 / 路由层
 * 路由：/api/exam/*
 * 模块：G_Exam
 * 作用：iG&M 教育考试系统路由集合（试卷列表 / 详情 / 预览 / 上传识别 / 校对 / 发布）
 * 内容：公开列表与详情、试卷 PDF 内联预览、管理端列表与上传建档、
 *       校对更新、发布 / 关闭 / 删除、交卷记录、替换试卷文件
 * 约束：统一响应 { success, code, message, data }；PDF 预览直接返回二进制流；
 *       本模块暂不做登录与权限校验；试卷文件仅站内展示，禁止下载导出
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import {
  iGM_ClientIp,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_ExtractUploadFile } from "../iGM_Services/iGM_FileService";
import {
  iGM_CloseExamService,
  iGM_DeleteExamService,
  iGM_ExamError,
  iGM_GetExamDetailService,
  iGM_ListAdminExamsService,
  iGM_ListPublicExamsService,
  iGM_PublishExamService,
  iGM_ReadExamFileService,
  iGM_ReplaceExamFileService,
  iGM_SubmitExamService,
  iGM_UpdateExamService,
  iGM_UploadExamService,
} from "../iGM_Services/iGM_ExamService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 从请求体读取可选整数：空串/非法一律为 null */
function iGM_NumberField(body: unknown, key: string): number | null {
  const raw = iGM_Field(body, key);
  if (raw.length === 0) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** 读取必填的 examId 查询参数 */
function iGM_RequireExamId(ctx: iGM_RouteContext): string {
  const examId = iGM_Query(ctx.query, "examId");
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  return examId;
}

/* ---------- 公开：已发布试卷列表 ---------- */
async function iGM_HandlePublicList(ctx: iGM_RouteContext) {
  iGM_EnforceRateLimit(ctx, "examRead", `ip:${iGM_ClientIp(ctx)}`);
  return iGM_Ok({ exams: await iGM_ListPublicExamsService() });
}

/* ---------- 公开：试卷详情 ---------- */
async function iGM_HandleDetail(ctx: iGM_RouteContext) {
  const examId = iGM_RequireExamId(ctx);
  return iGM_Ok({
    exam: await iGM_GetExamDetailService(examId, { publicOnly: true }),
  });
}

/* ---------- 公开：试卷 PDF 内联预览（禁止下载导出） ---------- */
async function iGM_HandleFile(ctx: iGM_RouteContext) {
  const examId = iGM_RequireExamId(ctx);
  const { bytes, fileName } = await iGM_ReadExamFileService(examId);
  ctx.set.headers["Content-Type"] = "application/pdf";
  ctx.set.headers["Content-Disposition"] =
    `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  ctx.set.headers["Content-Length"] = String(bytes.byteLength);
  ctx.set.headers["Cache-Control"] = "no-store";
  ctx.set.headers["X-Content-Type-Options"] = "nosniff";
  // Uint8Array 在 TS 的 BodyInit 定义下不被直接接受，转为底层 ArrayBuffer 传入
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(body, { status: 200, headers: ctx.set.headers });
}

/* ---------- 管理端：全部试卷列表 ---------- */
async function iGM_HandleAdminList(ctx: iGM_RouteContext) {
  iGM_EnforceRateLimit(ctx, "examRead", `ip:${iGM_ClientIp(ctx)}`);
  return iGM_Ok({ exams: await iGM_ListAdminExamsService() });
}

/* ---------- 管理端：上传 PDF 并自动识别建档 ---------- */
async function iGM_HandleUpload(ctx: iGM_RouteContext) {
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examUpload", `ip:${ip}`);
  const user = await iGM_CurrentUser(ctx);
  const file = iGM_ExtractUploadFile(ctx.body);
  const result = await iGM_UploadExamService(file, user?.iGM_Id ?? null);
  ctx.set.status = 201;
  return iGM_Ok(result, "试卷上传成功，已按识别结果建档");
}

/* ---------- 管理端：校对更新 ---------- */
async function iGM_HandleUpdate(ctx: iGM_RouteContext) {
  const body = ctx.body;
  const examId = iGM_Field(body, "examId");
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  await iGM_UpdateExamService(examId, {
    title: iGM_Field(body, "title"),
    subject: iGM_Field(body, "subject"),
    issuer: iGM_Field(body, "issuer"),
    reviewer: iGM_Field(body, "reviewer"),
    duration: iGM_NumberField(body, "duration"),
    totalScore: iGM_NumberField(body, "totalScore"),
    questionCount: iGM_NumberField(body, "questionCount"),
    notice: iGM_Field(body, "notice"),
  });
  return iGM_Ok({ updated: true }, "试卷信息已保存");
}

/* ---------- 管理端：发布 ---------- */
async function iGM_HandlePublish(ctx: iGM_RouteContext) {
  const examId = iGM_Field(ctx.body, "examId");
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  await iGM_PublishExamService(examId);
  return iGM_Ok({ published: true }, "试卷已发布");
}

/* ---------- 管理端：关闭 ---------- */
async function iGM_HandleClose(ctx: iGM_RouteContext) {
  const examId = iGM_Field(ctx.body, "examId");
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  await iGM_CloseExamService(examId);
  return iGM_Ok({ closed: true }, "试卷已关闭");
}

/* ---------- 管理端：删除 ---------- */
async function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const examId = iGM_Field(ctx.body, "examId");
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  await iGM_DeleteExamService(examId);
  return iGM_Ok({ deleted: true }, "试卷已删除");
}

/* ---------- 管理端：替换试卷文件 ---------- */
async function iGM_HandleReplace(ctx: iGM_RouteContext) {
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examUpload", `ip:${ip}`);
  const examId = iGM_Field(ctx.body, "examId");
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  const file = iGM_ExtractUploadFile(ctx.body);
  await iGM_ReplaceExamFileService(examId, file);
  return iGM_Ok({ replaced: true }, "试卷文件已替换");
}

/* ---------- 公开：交卷 ---------- */
async function iGM_HandleSubmit(ctx: iGM_RouteContext) {
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examSubmit", `ip:${ip}`);
  const body = ctx.body;
  const examId = iGM_Field(body, "examId");
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  const user = await iGM_CurrentUser(ctx);
  const submission = await iGM_SubmitExamService(
    examId,
    user?.iGM_Id ?? null,
  );
  ctx.set.status = 201;
  return iGM_Ok({ submission }, "交卷成功");
}

/**
 * G_Exam 路由集合
 * 前缀统一 /api/exam/；PDF 预览直接返回二进制 Response（不套统一响应结构）
 */
export const G_Exam = new Elysia({ name: "G_Exam" })
  .get("/api/exam/list", iGM_HandlePublicList as never)
  .get("/api/exam/detail", iGM_HandleDetail as never)
  .get("/api/exam/file", iGM_HandleFile as never)
  .get("/api/exam/admin/list", iGM_HandleAdminList as never)
  .post("/api/exam/upload", iGM_HandleUpload as never)
  .post("/api/exam/update", iGM_HandleUpdate as never)
  .post("/api/exam/publish", iGM_HandlePublish as never)
  .post("/api/exam/close", iGM_HandleClose as never)
  .post("/api/exam/delete", iGM_HandleDelete as never)
  .post("/api/exam/replace", iGM_HandleReplace as never)
  .post("/api/exam/submit", iGM_HandleSubmit as never);

// 导出 //
export default G_Exam;
