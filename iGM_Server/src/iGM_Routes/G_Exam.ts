/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Exam.ts
 * 所属层：后端 / 路由层
 * 路由：/api/exam/*
 * 模块：G_Exam
 * 作用：iG&M 教育考试系统路由集合（试卷列表 / 详情 / 原文预览 / 上传解析 / 校对 / 确认删除 / 重新解析 / 删除）
 * 内容：公开列表与详情、管理端列表与详情、原始文件内联预览或下载、上传解析建档、
 *       校对更新、确认删除原文件并发布、重新解析、删除、交卷记录
 * 约束：统一响应 { success, code, message, data }；原始文件按格式返回二进制流；
 *       本模块暂不做登录与权限校验
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
  iGM_ConfirmExamService,
  iGM_DeleteExamService,
  iGM_ExamError,
  iGM_GetExamDetailService,
  iGM_ListAdminExamsService,
  iGM_ListPublicExamsService,
  iGM_ReadExamFileService,
  iGM_ReparseExamService,
  iGM_SubmitExamService,
  iGM_UpdateExamService,
  iGM_UploadExamService,
} from "../iGM_Services/iGM_ExamService";

// 类型定义 //
/** 原始文件 MIME 与是否可内联预览 */
const iGM_ExamFileHeaders: Record<
  string,
  { mime: string; inline: boolean }
> = {
  pdf: { mime: "application/pdf", inline: true },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    inline: false,
  },
  doc: { mime: "application/msword", inline: false },
  txt: { mime: "text/plain; charset=utf-8", inline: false },
  md: { mime: "text/markdown; charset=utf-8", inline: false },
};

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

/** 读取必填的 examId 请求体字段 */
function iGM_RequireExamIdBody(ctx: iGM_RouteContext): string {
  const examId = iGM_Field(ctx.body, "examId");
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  return examId;
}

/* ---------- 公开：已发布试卷列表 ---------- */
async function iGM_HandlePublicList(ctx: iGM_RouteContext) {
  iGM_EnforceRateLimit(ctx, "examRead", `ip:${iGM_ClientIp(ctx)}`);
  return iGM_Ok({ exams: await iGM_ListPublicExamsService() });
}

/* ---------- 公开：试卷详情（含解析全文） ---------- */
async function iGM_HandleDetail(ctx: iGM_RouteContext) {
  const examId = iGM_RequireExamId(ctx);
  return iGM_Ok({
    exam: await iGM_GetExamDetailService(examId, { publicOnly: true }),
  });
}

/* ---------- 管理端：试卷详情（允许草稿，供校对界面读取） ---------- */
async function iGM_HandleAdminDetail(ctx: iGM_RouteContext) {
  const examId = iGM_RequireExamId(ctx);
  return iGM_Ok({
    exam: await iGM_GetExamDetailService(examId, { publicOnly: false }),
  });
}

/* ---------- 原始文件：PDF 内联预览，其余格式按附件下载 ---------- */
async function iGM_HandleFile(ctx: iGM_RouteContext) {
  const examId = iGM_RequireExamId(ctx);
  const { bytes, fileName, fileType } = await iGM_ReadExamFileService(examId);
  const meta = iGM_ExamFileHeaders[fileType] ?? {
    mime: "application/octet-stream",
    inline: false,
  };
  const encodedName = encodeURIComponent(fileName);
  ctx.set.headers["Content-Type"] = meta.mime;
  ctx.set.headers["Content-Disposition"] = `${
    meta.inline ? "inline" : "attachment"
  }; filename*=UTF-8''${encodedName}`;
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

/* ---------- 管理端：上传试卷文档并解析建档 ---------- */
async function iGM_HandleUpload(ctx: iGM_RouteContext) {
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examUpload", `ip:${ip}`);
  const user = await iGM_CurrentUser(ctx);
  const file = iGM_ExtractUploadFile(ctx.body);
  const exam = await iGM_UploadExamService(file, user?.iGM_Id ?? null);
  ctx.set.status = 201;
  return iGM_Ok({ exam }, "试卷已解析建档，请校对后确认");
}

/* ---------- 管理端：校对更新（元数据 + 解析全文） ---------- */
async function iGM_HandleUpdate(ctx: iGM_RouteContext) {
  const body = ctx.body;
  const examId = iGM_RequireExamIdBody(ctx);
  await iGM_UpdateExamService(examId, {
    title: iGM_Field(body, "title"),
    subject: iGM_Field(body, "subject"),
    issuer: iGM_Field(body, "issuer"),
    reviewer: iGM_Field(body, "reviewer"),
    duration: iGM_NumberField(body, "duration"),
    totalScore: iGM_NumberField(body, "totalScore"),
    questionCount: iGM_NumberField(body, "questionCount"),
    notice: iGM_Field(body, "notice"),
    contentMarkdown: iGM_Field(body, "contentMarkdown"),
  });
  return iGM_Ok({ updated: true }, "试卷信息已保存");
}

/* ---------- 管理端：确认并删除原文件，同时发布 ---------- */
async function iGM_HandleConfirm(ctx: iGM_RouteContext) {
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examUpload", `ip:${ip}`);
  const examId = iGM_RequireExamIdBody(ctx);
  await iGM_ConfirmExamService(examId);
  return iGM_Ok({ confirmed: true }, "已确认并删除原始文件，试卷已发布");
}

/* ---------- 管理端：使用原始文件重新解析 ---------- */
async function iGM_HandleReparse(ctx: iGM_RouteContext) {
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examUpload", `ip:${ip}`);
  const examId = iGM_RequireExamIdBody(ctx);
  await iGM_ReparseExamService(examId);
  return iGM_Ok({ reparsed: true }, "已按原始文件重新解析");
}

/* ---------- 管理端：删除试卷及其原始文件 ---------- */
async function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const examId = iGM_RequireExamIdBody(ctx);
  await iGM_DeleteExamService(examId);
  return iGM_Ok({ deleted: true }, "试卷已删除");
}

/* ---------- 公开：交卷 ---------- */
async function iGM_HandleSubmit(ctx: iGM_RouteContext) {
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examSubmit", `ip:${ip}`);
  const examId = iGM_RequireExamIdBody(ctx);
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
 * 前缀统一 /api/exam/；原始文件直接返回二进制 Response（不套统一响应结构）
 */
export const G_Exam = new Elysia({ name: "G_Exam" })
  .get("/api/exam/list", iGM_HandlePublicList as never)
  .get("/api/exam/detail", iGM_HandleDetail as never)
  .get("/api/exam/file", iGM_HandleFile as never)
  .get("/api/exam/admin/list", iGM_HandleAdminList as never)
  .get("/api/exam/admin/detail", iGM_HandleAdminDetail as never)
  .post("/api/exam/upload", iGM_HandleUpload as never)
  .post("/api/exam/update", iGM_HandleUpdate as never)
  .post("/api/exam/confirm", iGM_HandleConfirm as never)
  .post("/api/exam/reparse", iGM_HandleReparse as never)
  .post("/api/exam/delete", iGM_HandleDelete as never)
  .post("/api/exam/submit", iGM_HandleSubmit as never);

// 导出 //
export default G_Exam;
