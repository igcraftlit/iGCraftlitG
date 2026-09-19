/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_File.ts
 * 所属层：后端 / 路由层
 * 路由：/G_File/*
 * 模块：G_File
 * 作用：文件上传、个人文件管理与下载预览接口集合
 * 内容：上传文件（multipart/form-data）、我的文件列表、文件详情、
 *       删除文件、下载文件（附件）、预览文件（内联）
 * 约束：统一响应 { success, code, message, data }；
 *       上传与列表要求登录并做基础限流；下载与预览返回二进制流；
 *       删除仅限上传者本人或协管员及以上
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_PageQuery,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_ContentError } from "../iGM_Services/iGM_ContentService";
import {
  iGM_BuildFileResponse,
  iGM_DeleteFileService,
  iGM_ExtractUploadFile,
  iGM_ExtractUploadKind,
  iGM_GetFileDto,
  iGM_ListMyFilesService,
  iGM_ReadFileContentService,
  iGM_UploadFileService,
} from "../iGM_Services/iGM_FileService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 上传文件 ---------- */
async function iGM_HandleUpload(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "upload", `user:${user.iGM_Id}`);
  const file = iGM_ExtractUploadFile(ctx.body);
  // kind=image 为封面类上传，服务端强制真实图片内容
  const kind = iGM_ExtractUploadKind(ctx.body);
  const uploaded = await iGM_UploadFileService(user, file, kind);
  ctx.set.status = 201;
  return iGM_Ok({ file: uploaded }, "file.messages.uploaded");
}

/* ---------- 我的文件列表 ---------- */
function iGM_HandleMyFiles(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(iGM_ListMyFilesService(user, page, pageSize));
}

/* ---------- 文件详情 ---------- */
function iGM_HandleDetail(ctx: iGM_RouteContext) {
  const fileId = iGM_Query(ctx.query, "fileId");
  if (!fileId) throw new iGM_ContentError("file.errors.notFound", 404);
  return iGM_Ok({ file: iGM_GetFileDto(fileId) });
}

/* ---------- 删除文件 ---------- */
async function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const fileId = iGM_Query(ctx.query, "fileId");
  if (!fileId) throw new iGM_ContentError("file.errors.notFound", 404);
  await iGM_DeleteFileService(user, fileId);
  return iGM_Ok({ deleted: true }, "file.messages.deleted");
}

/* ---------- 下载文件（附件） ---------- */
async function iGM_HandleDownload(ctx: iGM_RouteContext) {
  const fileId = iGM_Query(ctx.query, "fileId");
  if (!fileId) throw new iGM_ContentError("file.errors.notFound", 404);
  const content = await iGM_ReadFileContentService(fileId);
  return iGM_BuildFileResponse(content, false);
}

/* ---------- 预览文件（内联） ---------- */
async function iGM_HandlePreview(ctx: iGM_RouteContext) {
  const fileId = iGM_Query(ctx.query, "fileId");
  if (!fileId) throw new iGM_ContentError("file.errors.notFound", 404);
  const content = await iGM_ReadFileContentService(fileId);
  return iGM_BuildFileResponse(content, true);
}

/**
 * G_File 文件路由集合
 * 下载与预览直接返回二进制 Response（不套统一响应结构）
 */
export const G_File = new Elysia({ name: "G_File" })
  .post("/G_File/upload", iGM_HandleUpload as never)
  .get("/G_File/list", iGM_HandleMyFiles as never)
  .get("/G_File/detail", iGM_HandleDetail as never)
  .delete("/G_File/delete", iGM_HandleDelete as never)
  .get("/G_File/download", iGM_HandleDownload as never)
  .get("/G_File/preview", iGM_HandlePreview as never);

// 导出 //
export default G_File;
