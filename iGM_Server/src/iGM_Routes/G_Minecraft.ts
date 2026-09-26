/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Minecraft.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Minecraft/*
 * 模块：G_Minecraft
 * 作用：Minecraft 资源分区接口集合
 * 内容：分区资源列表（类型/版本/加载器/平台筛选与搜索）、表单选项字典、
 *       资源详情、创建、编辑、删除、下载（二进制流）
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
import {
  iGM_BuildFileResponse,
} from "../iGM_Services/iGM_FileService";
import {
  iGM_CreateResourceService,
  iGM_DeleteResourceService,
  iGM_DownloadResourceService,
  iGM_GetResourceDetail,
  iGM_ListMinecraftResourcesService,
  iGM_UpdateResourceService,
} from "../iGM_Services/iGM_ResourceService";
import {
  iGM_McLoaders,
  iGM_McPlatforms,
  iGM_McResourceTypes,
  iGM_McVersionOptions,
  type iGM_ResourceInput,
} from "../iGM_Types/iGM_Resource";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 从请求体提取 Minecraft 资源写入入参（创建与编辑共用） */
function iGM_ReadMinecraftInput(body: unknown): iGM_ResourceInput {
  const source = (body ?? {}) as Record<string, unknown>;
  /** 多选字段：数组原样提交，服务端按数组或分隔字符串统一解析 */
  const readMulti = (key: string): string[] => {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
    return typeof value === "string" ? [value] : [];
  };
  return {
    minecraft: true,
    title: iGM_Field(body, "title"),
    description: iGM_Field(body, "description"),
    resourceType: iGM_Field(body, "resourceType"),
    mcVersions: readMulti("mcVersions"),
    loaders: readMulti("loaders"),
    platforms: readMulti("platforms"),
    license: iGM_Field(body, "license"),
    originalAuthor: iGM_Field(body, "originalAuthor"),
    originalUrl: iGM_Field(body, "originalUrl"),
    changelog: iGM_Field(body, "changelog"),
    fileId: iGM_Field(body, "fileId"),
    coverFileId: iGM_Field(body, "coverFileId"),
    tags: iGM_Field(body, "tags"),
  };
}

/* ---------- 分区资源列表 ---------- */
function iGM_HandleList(ctx: iGM_RouteContext) {
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    iGM_ListMinecraftResourcesService(iGM_CurrentUser(ctx), {
      type: iGM_Query(ctx.query, "type") || undefined,
      version: iGM_Query(ctx.query, "version") || undefined,
      loader: iGM_Query(ctx.query, "loader") || undefined,
      platform: iGM_Query(ctx.query, "platform") || undefined,
      search: iGM_Query(ctx.query, "search") || undefined,
      page,
      pageSize,
    }),
  );
}

/* ---------- 表单选项字典 ---------- */
function iGM_HandleOptions() {
  return iGM_Ok({
    resourceTypes: iGM_McResourceTypes,
    versionOptions: iGM_McVersionOptions,
    loaders: iGM_McLoaders,
    platforms: iGM_McPlatforms,
  });
}

/* ---------- 资源详情 ---------- */
function iGM_HandleDetail(ctx: iGM_RouteContext) {
  const resourceId = iGM_Query(ctx.query, "resourceId");
  if (!resourceId) throw new iGM_ContentError("resource.errors.notFound", 404);
  const detail = iGM_GetResourceDetail(iGM_CurrentUser(ctx), resourceId);
  if (!detail || !detail.resourceType) {
    throw new iGM_ContentError("resource.errors.notFound", 404);
  }
  return iGM_Ok({ resource: detail });
}

/* ---------- 创建资源 ---------- */
function iGM_HandleCreate(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "mcWrite", `user:${user.iGM_Id}`);
  const detail = iGM_CreateResourceService(user, iGM_ReadMinecraftInput(ctx.body));
  ctx.set.status = 201;
  return iGM_Ok({ resource: detail }, "resource.messages.created");
}

/* ---------- 编辑资源 ---------- */
function iGM_HandleEdit(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "mcWrite", `user:${user.iGM_Id}`);
  const resourceId = iGM_Field(ctx.body, "resourceId").trim();
  if (!resourceId) throw new iGM_ContentError("resource.errors.notFound", 404);
  const detail = iGM_UpdateResourceService(
    user,
    resourceId,
    iGM_ReadMinecraftInput(ctx.body),
  );
  return iGM_Ok({ resource: detail }, "resource.messages.updated");
}

/* ---------- 删除资源 ---------- */
function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "mcWrite", `user:${user.iGM_Id}`);
  const resourceId = iGM_Query(ctx.query, "resourceId");
  if (!resourceId) throw new iGM_ContentError("resource.errors.notFound", 404);
  iGM_DeleteResourceService(user, resourceId);
  return iGM_Ok({ deleted: true }, "resource.messages.deleted");
}

/* ---------- 下载资源（附件，二进制流） ---------- */
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
 * G_Minecraft Minecraft 分区路由集合
 * 下载接口直接返回二进制 Response（不套统一响应结构）
 */
export const G_Minecraft = new Elysia({ name: "G_Minecraft" })
  .get("/G_Minecraft/list", iGM_HandleList as never)
  .get("/G_Minecraft/options", iGM_HandleOptions as never)
  .get("/G_Minecraft/detail", iGM_HandleDetail as never)
  .post("/G_Minecraft/create", iGM_HandleCreate as never)
  .put("/G_Minecraft/edit", iGM_HandleEdit as never)
  .delete("/G_Minecraft/delete", iGM_HandleDelete as never)
  .get("/G_Minecraft/download", iGM_HandleDownload as never);

// 导出 //
export default G_Minecraft;
