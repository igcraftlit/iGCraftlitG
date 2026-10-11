/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Exam.ts
 * 所属层：后端 / 路由层
 * 路由：/api/exam/* 与 /uploads/exams/*
 * 模块：G_Exam
 * 作用：iGC&M 教育考试系统路由集合（试卷列表 / 详情 / 原文下载 / 答案附件 / 转换 HTML 静态资源 /
 *       转换进度 / 上传即发布 / 答案上传 / 元数据修改 / 重新转换 / 删除 / 交卷）
 * 内容：公开列表与详情、管理端列表与详情（按命题创作者隔离）、原始 PDF 与答案 PDF 内联预览、
 *       转换后 HTML 目录静态服务、转换进度查询、上传（命题创作者填写元数据 + PDF）直接发布、
 *       答案附件上传、元数据修改、重新转换、删除、交卷记录
 * 约束：统一响应 { success, code, message, data }；二进制流不套统一响应结构；
 *       管理端接口强制登录并校验命题创作者资格，操作者身份一律取自鉴权，禁止前端传参
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
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_ExtractUploadFile } from "../iGM_Services/iGM_FileService";
import { iGM_RequireExaminer } from "../iGM_Services/iGM_ExaminerService";
import {
  iGM_AssertExamAccessService,
  iGM_DeleteExamService,
  iGM_ExamError,
  iGM_GetExamConvertProgressService,
  iGM_GetExamDetailService,
  iGM_ListAdminExamsService,
  iGM_ListPublicExamsService,
  iGM_ReadExamAnswerService,
  iGM_ReadExamFileService,
  iGM_ReadExamHtmlAssetService,
  iGM_ReparseExamService,
  iGM_SubmitExamService,
  iGM_UpdateExamMetaService,
  iGM_UploadAnswerService,
  iGM_UploadExamService,
  type iGM_ExamActor,
} from "../iGM_Services/iGM_ExamService";

// 类型定义 //
/** 原始文件 MIME 与是否可内联预览（本模块仅 PDF） */
const iGM_ExamFileHeaders: Record<
  string,
  { mime: string; inline: boolean }
> = {
  pdf: { mime: "application/pdf", inline: true },
};

// 核心逻辑 //
/** 读取字符串字段（兼容 multipart FormData 与 JSON 对象两种请求体） */
function iGM_FormField(body: unknown, key: string): string {
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const value = body.get(key);
    return typeof value === "string" ? value : "";
  }
  return iGM_Field(body, key);
}

/** 从请求体读取可选整数：空串/非法一律为 null */
function iGM_NumberField(body: unknown, key: string): number | null {
  const raw = iGM_FormField(body, key).trim();
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
  const examId = iGM_FormField(ctx.body, "examId").trim();
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  return examId;
}

/** Uint8Array → ArrayBuffer（TS 的 BodyInit 定义不接受 Uint8Array 视图） */
function iGM_BinaryBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/**
 * 解析管理端操作者：必须登录；管理人员可管理全部试卷，
 * 其余用户必须具备命题创作者资格；身份一律取自会话，禁止前端传参
 */
async function iGM_ResolveExamActor(
  ctx: iGM_RouteContext,
): Promise<iGM_ExamActor> {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const isAdmin = iGM_IsStaff(user);
  if (!isAdmin) await iGM_RequireExaminer(user.iGM_Id);
  return { userId: user.iGM_Id, isAdmin };
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

/* ---------- 管理端：试卷详情（仅本人试卷，管理员可见全部） ---------- */
async function iGM_HandleAdminDetail(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  const examId = iGM_RequireExamId(ctx);
  await iGM_AssertExamAccessService(examId, actor);
  return iGM_Ok({
    exam: await iGM_GetExamDetailService(examId, { publicOnly: false }),
  });
}

/* ---------- 原始文件：PDF 内联预览（仅本人试卷，转换失败保留期内可用） ---------- */
async function iGM_HandleFile(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  const examId = iGM_RequireExamId(ctx);
  const { bytes, fileName, fileType } = await iGM_ReadExamFileService(
    examId,
    actor,
  );
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
  return new Response(iGM_BinaryBody(bytes), {
    status: 200,
    headers: ctx.set.headers,
  });
}

/* ---------- 转换后 HTML 静态服务：iframe 首页与同级 CSS / JS / 字体 / 图片 ---------- */
async function iGM_HandleHtmlAsset(ctx: iGM_RouteContext) {
  const examId = ctx.params?.examId ?? "";
  const name = ctx.params?.name ?? "";
  if (!examId || !name) throw new iGM_ExamError("缺少试卷资源参数", 400);
  const { bytes, contentType } = await iGM_ReadExamHtmlAssetService(
    examId,
    name,
  );
  ctx.set.headers["Content-Type"] = contentType;
  ctx.set.headers["Content-Length"] = String(bytes.byteLength);
  // 首页不缓存（草稿可随时重新转换），其余静态资源长缓存
  ctx.set.headers["Cache-Control"] =
    name === "index.html" ? "no-store" : "public, max-age=86400";
  ctx.set.headers["X-Content-Type-Options"] = "nosniff";
  return new Response(iGM_BinaryBody(bytes), {
    status: 200,
    headers: ctx.set.headers,
  });
}

/* ---------- 管理端：转换进度（仅本人试卷） ---------- */
async function iGM_HandleProgress(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  iGM_EnforceRateLimit(ctx, "examRead", `ip:${iGM_ClientIp(ctx)}`);
  const examId = iGM_RequireExamId(ctx);
  await iGM_AssertExamAccessService(examId, actor);
  return iGM_Ok({
    progress: await iGM_GetExamConvertProgressService(examId),
  });
}

/* ---------- 管理端：试卷列表（命题创作者仅见本人，管理员见全部） ---------- */
async function iGM_HandleAdminList(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  iGM_EnforceRateLimit(ctx, "examRead", `ip:${iGM_ClientIp(ctx)}`);
  return iGM_Ok({ exams: await iGM_ListAdminExamsService(actor) });
}

/* ---------- 管理端：上传 PDF 并直接发布（命题创作者填写元数据） ---------- */
async function iGM_HandleUpload(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examUpload", `user:${actor.userId}:${ip}`);
  const body = ctx.body;
  const exam = await iGM_UploadExamService(
    {
      file: iGM_ExtractUploadFile(body),
      title: iGM_FormField(body, "title"),
      subject: iGM_FormField(body, "subject"),
      issuer: iGM_FormField(body, "issuer"),
      reviewer: iGM_FormField(body, "reviewer"),
      duration: iGM_NumberField(body, "duration"),
      totalScore: iGM_NumberField(body, "totalScore"),
      questionCount: iGM_NumberField(body, "questionCount"),
      notice: iGM_FormField(body, "notice"),
    },
    actor.userId,
  );
  ctx.set.status = 201;
  return iGM_Ok({ exam, deploying: true }, "试卷已发布，正在转换并部署");
}

/* ---------- 管理端：使用原始 PDF 重新转换（仅本人试卷） ---------- */
async function iGM_HandleReparse(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examUpload", `user:${actor.userId}:${ip}`);
  const examId = iGM_RequireExamIdBody(ctx);
  await iGM_ReparseExamService(examId, actor);
  return iGM_Ok({ reparsed: true }, "已按原始文件重新转换");
}

/* ---------- 管理端：删除试卷及其原始文件与 HTML 目录（仅本人试卷） ---------- */
async function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  const examId = iGM_RequireExamIdBody(ctx);
  await iGM_DeleteExamService(examId, actor);
  return iGM_Ok({ deleted: true }, "试卷已删除");
}

/* ---------- 管理端：上传答案附件（PDF，≤20MB，仅本人试卷） ---------- */
async function iGM_HandleUploadAnswer(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examUpload", `user:${actor.userId}:${ip}`);
  const body = ctx.body;
  const examId = iGM_FormField(body, "examId").trim();
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  const exam = await iGM_UploadAnswerService(
    examId,
    iGM_ExtractUploadFile(body),
    actor,
  );
  return iGM_Ok({ exam }, "答案已上传，正在部署");
}

/* ---------- 管理端：修改试卷元数据（仅本人试卷） ---------- */
async function iGM_HandleUpdateMeta(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "examUpload", `user:${actor.userId}:${ip}`);
  const body = ctx.body;
  const examId = iGM_FormField(body, "examId").trim();
  if (!examId) throw new iGM_ExamError("缺少试卷 ID", 400);
  const exam = await iGM_UpdateExamMetaService(
    examId,
    {
      title: iGM_FormField(body, "title"),
      subject: iGM_FormField(body, "subject"),
      issuer: iGM_FormField(body, "issuer"),
      reviewer: iGM_FormField(body, "reviewer"),
      duration: iGM_NumberField(body, "duration"),
      totalScore: iGM_NumberField(body, "totalScore"),
      questionCount: iGM_NumberField(body, "questionCount"),
      notice: iGM_FormField(body, "notice"),
    },
    actor,
  );
  return iGM_Ok({ exam }, "修改已保存，正在部署");
}

/* ---------- 答案附件：PDF 内联预览 / 下载（仅本人试卷） ---------- */
async function iGM_HandleAnswer(ctx: iGM_RouteContext) {
  const actor = await iGM_ResolveExamActor(ctx);
  const examId = iGM_RequireExamId(ctx);
  const { bytes, fileName } = await iGM_ReadExamAnswerService(examId, actor);
  const encodedName = encodeURIComponent(fileName);
  ctx.set.headers["Content-Type"] = "application/pdf";
  ctx.set.headers["Content-Disposition"] = `inline; filename*=UTF-8''${encodedName}`;
  ctx.set.headers["Content-Length"] = String(bytes.byteLength);
  ctx.set.headers["Cache-Control"] = "no-store";
  ctx.set.headers["X-Content-Type-Options"] = "nosniff";
  return new Response(iGM_BinaryBody(bytes), {
    status: 200,
    headers: ctx.set.headers,
  });
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
 * 前缀统一 /api/exam/；转换产物走 /uploads/exams/<examId>/html/<name> 路径式静态服务
 */
export const G_Exam = new Elysia({ name: "G_Exam" })
  .get("/api/exam/list", iGM_HandlePublicList as never)
  .get("/api/exam/detail", iGM_HandleDetail as never)
  .get("/api/exam/file", iGM_HandleFile as never)
  .get("/api/exam/answer", iGM_HandleAnswer as never)
  .get("/uploads/exams/:examId/html/:name", iGM_HandleHtmlAsset as never)
  .get("/api/exam/admin/list", iGM_HandleAdminList as never)
  .get("/api/exam/admin/detail", iGM_HandleAdminDetail as never)
  .get("/api/exam/admin/progress", iGM_HandleProgress as never)
  .post("/api/exam/upload", iGM_HandleUpload as never)
  .post("/api/exam/upload-answer", iGM_HandleUploadAnswer as never)
  .post("/api/exam/update-meta", iGM_HandleUpdateMeta as never)
  .post("/api/exam/reparse", iGM_HandleReparse as never)
  .post("/api/exam/delete", iGM_HandleDelete as never)
  .post("/api/exam/submit", iGM_HandleSubmit as never);

// 导出 //
export default G_Exam;
