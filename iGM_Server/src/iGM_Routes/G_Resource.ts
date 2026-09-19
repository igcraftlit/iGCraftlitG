/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Resource.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Resource/*
 * 模块：G_Resource
 * 作用：资源库列表、详情、创建、编辑、删除、上下架与下载接口集合
 * 内容：资源分页列表（分类/标签筛选与关键词搜索）、分类字典、资源详情、
 *       创建资源、编辑资源、删除资源、上架下架、下载资源附件（二进制流）
 * 约束：统一响应 { success, code, message, data }；
 *       写入要求登录并做基础限流；下载直接返回文件流并单独限流
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_PageQuery,
  iGM_Query,
  iGM_RequestLocale,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_ContentError } from "../iGM_Services/iGM_ContentService";
import { iGM_BuildFileResponse } from "../iGM_Services/iGM_FileService";
import {
  iGM_CreateResourceService,
  iGM_DeleteResourceService,
  iGM_DownloadResourceService,
  iGM_GetResourceDetail,
  iGM_ListResourceCategoriesService,
  iGM_ListResourcesService,
  iGM_SetResourceStatusService,
  iGM_UpdateResourceService,
} from "../iGM_Services/iGM_ResourceService";
import {
  iGM_IsResourceStatus,
  type iGM_ResourceInput,
} from "../iGM_Types/iGM_Resource";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 从请求体提取资源写入入参（创建与编辑共用） */
function iGM_ReadResourceInput(body: unknown): iGM_ResourceInput {
  return {
    title: iGM_Field(body, "title"),
    description: iGM_Field(body, "description"),
    categoryId: iGM_Field(body, "categoryId"),
    fileId: iGM_Field(body, "fileId"),
    coverFileId: iGM_Field(body, "coverFileId"),
    activityId: iGM_Field(body, "activityId"),
    tags: iGM_Field(body, "tags"),
    status: iGM_Field(body, "status"),
  };
}

/* ---------- 资源列表 ---------- */
function iGM_HandleList(ctx: iGM_RouteContext) {
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    iGM_ListResourcesService(iGM_CurrentUser(ctx), {
      category: iGM_Query(ctx.query, "category") || undefined,
      tag: iGM_Query(ctx.query, "tag") || undefined,
      activityId: iGM_Query(ctx.query, "activityId") || undefined,
      search: iGM_Query(ctx.query, "search") || undefined,
      page,
      pageSize,
    }),
  );
}

/* ---------- 资源分类字典 ---------- */
function iGM_HandleCategories() {
  return iGM_Ok({ items: iGM_ListResourceCategoriesService() });
}

/* ---------- 资源详情 ---------- */
function iGM_HandleDetail(ctx: iGM_RouteContext) {
  const resourceId = iGM_Query(ctx.query, "resourceId");
  if (!resourceId) throw new iGM_ContentError("resource.errors.notFound", 404);
  const detail = iGM_GetResourceDetail(iGM_CurrentUser(ctx), resourceId);
  if (!detail) throw new iGM_ContentError("resource.errors.notFound", 404);
  return iGM_Ok({ resource: detail });
}

/* ---------- 创建资源 ---------- */
function iGM_HandleCreate(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "resourceWrite", `user:${user.iGM_Id}`);
  const detail = iGM_CreateResourceService(user, iGM_ReadResourceInput(ctx.body));
  ctx.set.status = 201;
  return iGM_Ok({ resource: detail }, "resource.messages.created");
}

/* ---------- 编辑资源 ---------- */
function iGM_HandleEdit(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "resourceWrite", `user:${user.iGM_Id}`);
  const resourceId = iGM_Field(ctx.body, "resourceId").trim();
  if (!resourceId) throw new iGM_ContentError("resource.errors.notFound", 404);
  const detail = iGM_UpdateResourceService(
    user,
    resourceId,
    iGM_ReadResourceInput(ctx.body),
  );
  return iGM_Ok({ resource: detail }, "resource.messages.updated");
}

/* ---------- 删除资源 ---------- */
function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "resourceWrite", `user:${user.iGM_Id}`);
  const resourceId = iGM_Query(ctx.query, "resourceId");
  if (!resourceId) throw new iGM_ContentError("resource.errors.notFound", 404);
  iGM_DeleteResourceService(user, resourceId);
  return iGM_Ok({ deleted: true }, "resource.messages.deleted");
}

/* ---------- 上架 / 下架 ---------- */
function iGM_HandleSetStatus(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "resourceWrite", `user:${user.iGM_Id}`);
  const resourceId = iGM_Field(ctx.body, "resourceId").trim();
  const status = iGM_Field(ctx.body, "status").trim();
  if (!resourceId) throw new iGM_ContentError("resource.errors.notFound", 404);
  if (!iGM_IsResourceStatus(status)) {
    throw new iGM_ContentError("resource.errors.notFound", 422);
  }
  const detail = iGM_SetResourceStatusService(user, resourceId, status);
  return iGM_Ok({ resource: detail }, "resource.messages.statusUpdated");
}

/* ---------- 下载资源（附件） ---------- */
async function iGM_HandleDownload(ctx: iGM_RouteContext) {
  const resourceId = iGM_Query(ctx.query, "resourceId");
  if (!resourceId) throw new iGM_ContentError("resource.errors.notFound", 404);
  iGM_EnforceRateLimit(ctx, "resourceDownload", `res:${resourceId}`);
  const content = await iGM_DownloadResourceService(
    iGM_CurrentUser(ctx),
    resourceId,
    iGM_RequestLocale(ctx),
  );
  return iGM_BuildFileResponse(content, false);
}

/**
 * G_Resource 资源路由集合
 * 下载接口直接返回二进制 Response（不套统一响应结构）
 */
export const G_Resource = new Elysia({ name: "G_Resource" })
  .get("/G_Resource/list", iGM_HandleList as never)
  .get("/G_Resource/categories", iGM_HandleCategories as never)
  .get("/G_Resource/detail", iGM_HandleDetail as never)
  .post("/G_Resource/create", iGM_HandleCreate as never)
  .put("/G_Resource/edit", iGM_HandleEdit as never)
  .delete("/G_Resource/delete", iGM_HandleDelete as never)
  .post("/G_Resource/status", iGM_HandleSetStatus as never)
  .get("/G_Resource/download", iGM_HandleDownload as never);

// 导出 //
export default G_Resource;
