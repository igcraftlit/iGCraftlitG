/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ResourceService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Resource
 * 模块：iGM_ResourceService
 * 作用：资源库的创建、编辑、删除、列表、详情、下载与筛选编排
 * 内容：内容 XSS 净化与长度校验、分类与标签解析、权限判定（上传者/协管员/管理员）、
 *       资源 DTO 组装（上传者、分类、标签、附件、封面、计数）、
 *       下载计数与通知、隐藏/恢复
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import {
  iGM_CreateResource,
  iGM_DeleteResource,
  iGM_FindResourceById,
  iGM_FindResourceByIdentifier,
  iGM_FindResourceCategoryById,
  iGM_FindResourceTagBySlug,
  iGM_FindOrCreateResourceTags,
  iGM_GetTagsForResources,
  iGM_IncrementDownloadCount,
  iGM_ListResourceCategories,
  iGM_ListResources,
  iGM_ReplaceResourceTags,
  iGM_UpdateResource,
} from "../iGM_Repositories/iGM_ResourceRepository";
import { iGM_FindUsersByIds } from "../iGM_Repositories/iGM_UserRepository";
import { iGM_FindActivityById } from "../iGM_Repositories/iGM_ActivityRepository";
import { iGM_ContentError, iGM_SanitizeContent } from "./iGM_ContentService";
import { iGM_Notify } from "./iGM_NotificationService";
import { iGM_AwardPoints } from "./iGM_PointsService";
import {
  iGM_GetFileDto,
  iGM_GetFileDtoMap,
  iGM_ReadFileContentService,
} from "./iGM_FileService";
import type { iGM_AuthorDto } from "../iGM_Types/iGM_Community";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";
import { iGM_ResolveUserOrgBadge } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import {
  iGM_IsMcLoader,
  iGM_IsMcPlatform,
  iGM_IsMcResourceType,
  iGM_ParseMultiValue,
  iGM_ToResourceCategoryDto,
  iGM_ToResourceTagDto,
  type iGM_ResourceCategoryDto,
  type iGM_ResourceDetailDto,
  type iGM_ResourceInput,
  type iGM_ResourceListItemDto,
  type iGM_ResourceListData,
  type iGM_ResourceRow,
  type iGM_ResourceStatus,
} from "../iGM_Types/iGM_Resource";
import type { iGM_FileContent } from "./iGM_FileService";

// 类型定义 //
/** 资源列表查询入参 */
export interface iGM_ResourceQueryInput {
  category?: string;
  tag?: string;
  /** 仅列出关联到该活动的资源 */
  activityId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// 核心逻辑 //
const iGM_TitleMaxLength = 100;
const iGM_DescriptionMaxLength = 5000;
const iGM_MaxTags = 5;
const iGM_TagNameMaxLength = 20;
const iGM_MaxPageSize = 50;
const iGM_DefaultPageSize = 10;
const iGM_ExcerptLength = 160;

/**
 * 生成资源的 CLI 下载标识符：u{uid}-{slug}
 * slug 规则：标题转小写，空白与标点替换为连字符，保留字母数字与中文，
 * 去除首尾连字符并压缩多个连字符
 */
function iGM_BuildResourceSlug(uid: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `u${uid}-${slug || "resource"}`;
}

/** 协管员及以上可管理任意资源与分类 */
function iGM_CanModerate(user: iGM_UserRow): boolean {
  return user.iGM_Role === "moderator" || user.iGM_Role === "admin";
}

/** 是否为资源上传者 */
function iGM_IsUploader(user: iGM_UserRow, uploaderId: string): boolean {
  return user.iGM_Id === uploaderId;
}

/** 用户行转作者简要 DTO */
async function iGM_ToAuthorDto(user: iGM_UserRow): Promise<iGM_AuthorDto> {
  return {
    id: user.iGM_Id,
    username: user.iGM_Username,
    displayName: user.iGM_DisplayName,
    avatar: user.iGM_Avatar,
    role: user.iGM_Role,
    // 模块七：认证组织徽标（负责人邮箱匹配时带 isOwner 金标）
    verifiedOrg: await iGM_ResolveUserOrgBadge(
      user.iGM_VerifiedOrgId ?? null,
      user.iGM_Email,
    ),
  };
}

/** 上传者已注销占位 */
function iGM_DeletedAuthorPlaceholder(authorId: string): iGM_AuthorDto {
  return {
    id: authorId,
    username: "unknown",
    displayName: null,
    avatar: null,
    role: "user",
    verifiedOrg: null,
  };
}

/** 由描述生成单行摘要 */
function iGM_BuildExcerpt(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > iGM_ExcerptLength
    ? `${singleLine.slice(0, iGM_ExcerptLength)}…`
    : singleLine;
}

/** 分类列表 DTO */
export async function iGM_ListResourceCategoriesService(): Promise<iGM_ResourceCategoryDto[]> {
  return (await iGM_ListResourceCategories()).map(iGM_ToResourceCategoryDto);
}

/** 解析标签原始字符串（复用社区口径：逗号/顿号/分号/空白分隔） */
function iGM_ParseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,，、;；\s]+/)
    .map((tag) => iGM_SanitizeContent(tag).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const result: string[] = [];
  const seen = new Set<string>();
  for (const tag of parts) {
    if (tag.length > iGM_TagNameMaxLength) {
      throw new iGM_ContentError("resource.errors.tagTooLong", 422);
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= iGM_MaxTags) break;
  }
  return result;
}

/** 净化并校验资源输入 */
function iGM_ValidateResourceInput(input: iGM_ResourceInput): {
  title: string;
  description: string;
  tags: string[];
} {
  const title = iGM_SanitizeContent(String(input.title ?? "")).replace(/\s+/g, " ");
  if (title.length < 1 || title.length > iGM_TitleMaxLength) {
    throw new iGM_ContentError("resource.errors.titleInvalid", 422);
  }
  const description = iGM_SanitizeContent(String(input.description ?? ""));
  if (description.length > iGM_DescriptionMaxLength) {
    throw new iGM_ContentError("resource.errors.descriptionInvalid", 422);
  }
  return { title, description, tags: iGM_ParseTags(input.tags) };
}

/** 校验附件文件存在（必填） */
async function iGM_ResolveFile(fileId?: string | null): Promise<string> {
  const id = (fileId ?? "").trim();
  if (!id) throw new iGM_ContentError("resource.errors.fileRequired", 422);
  await iGM_GetFileDto(id); // 不存在会抛 404
  return id;
}

/** 校验封面文件存在（可选） */
async function iGM_ResolveCover(coverFileId?: string | null): Promise<string | null> {
  if (!coverFileId || !coverFileId.trim()) return null;
  const id = coverFileId.trim();
  await iGM_GetFileDto(id);
  return id;
}

/** 解析分类（可选） */
async function iGM_ResolveCategory(categoryId?: string | null): Promise<string | null> {
  if (!categoryId || !categoryId.trim()) return null;
  const id = categoryId.trim();
  const category = await iGM_FindResourceCategoryById(id);
  if (!category) {
    throw new iGM_ContentError("resource.errors.categoryNotFound", 422);
  }
  return id;
}

/** 解析关联活动（可选，活动必须存在） */
async function iGM_ResolveActivity(activityId?: string | null): Promise<string | null> {
  if (!activityId || !activityId.trim()) return null;
  const id = activityId.trim();
  if (!(await iGM_FindActivityById(id))) {
    throw new iGM_ContentError("resource.errors.activityNotFound", 422);
  }
  return id;
}

/* ---------- 模块十：Minecraft 字段校验 ---------- */

/** Minecraft 扩展字段（已校验，数组可直接 JSON 序列化） */
interface iGM_McFields {
  resourceType: string | null;
  mcVersions: string[];
  loaders: string[];
  platforms: string[];
  license: string | null;
  originalAuthor: string | null;
  originalUrl: string | null;
  changelog: string | null;
}

/** 版本数量与文本长度上限 */
const iGM_McMaxVersions = 10;
const iGM_McVersionMaxLength = 20;
const iGM_McLicenseMaxLength = 100;
const iGM_McAuthorMaxLength = 50;
const iGM_McChangelogMaxLength = 5000;

/** 解析行内 JSON 数组文本；非法或空值返回空数组 */
function iGM_ParseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** 普通资源的空 Minecraft 字段（全部 null） */
function iGM_EmptyMcFields(): iGM_McFields {
  return {
    resourceType: null,
    mcVersions: [],
    loaders: [],
    platforms: [],
    license: null,
    originalAuthor: null,
    originalUrl: null,
    changelog: null,
  };
}

/** 空数组序列化为 null（与历史普通资源一致），非空序列化为 JSON 文本 */
function iGM_SerializeMcArray(values: string[]): string | null {
  return values.length > 0 ? JSON.stringify(values) : null;
}

/** 由已有资源行提取 Minecraft 字段（普通资源编辑时保留原值） */
function iGM_McFieldsFromRow(row: iGM_ResourceRow): iGM_McFields {
  return {
    resourceType: row.iGM_ResourceType,
    mcVersions: iGM_ParseJsonArray(row.iGM_McVersions),
    loaders: iGM_ParseJsonArray(row.iGM_Loaders),
    platforms: iGM_ParseJsonArray(row.iGM_Platforms),
    license: row.iGM_License,
    originalAuthor: row.iGM_OriginalAuthor,
    originalUrl: row.iGM_OriginalUrl,
    changelog: row.iGM_Changelog,
  };
}

/**
 * 校验 Minecraft 上传/编辑表单：
 * 资源类型必填且合法；版本去重限 10 个；加载器须为白名单值；
 * 平台至少选择一个且合法；原帖链接须为 http(s)；
 * 许可协议、原作者、更新日志做长度校验与净化。
 */
function iGM_ValidateMcFields(input: iGM_ResourceInput): iGM_McFields {
  const resourceType =
    typeof input.resourceType === "string" ? input.resourceType.trim() : "";
  if (!iGM_IsMcResourceType(resourceType)) {
    throw new iGM_ContentError("minecraft.errors.resourceTypeInvalid", 422);
  }

  const mcVersions = iGM_ParseMultiValue(input.mcVersions).map((version) =>
    version.trim(),
  );
  if (mcVersions.length > iGM_McMaxVersions) {
    throw new iGM_ContentError("minecraft.errors.tooManyVersions", 422);
  }
  if (mcVersions.some((version) => version.length > iGM_McVersionMaxLength)) {
    throw new iGM_ContentError("minecraft.errors.versionInvalid", 422);
  }

  const loaders = iGM_ParseMultiValue(input.loaders);
  if (loaders.some((loader) => !iGM_IsMcLoader(loader))) {
    throw new iGM_ContentError("minecraft.errors.loaderInvalid", 422);
  }

  const platforms = iGM_ParseMultiValue(input.platforms);
  if (platforms.length === 0) {
    throw new iGM_ContentError("minecraft.errors.platformRequired", 422);
  }
  if (platforms.some((platform) => !iGM_IsMcPlatform(platform))) {
    throw new iGM_ContentError("minecraft.errors.platformInvalid", 422);
  }

  const license =
    iGM_SanitizeContent(String(input.license ?? "")).slice(
      0,
      iGM_McLicenseMaxLength,
    ) || null;
  const originalAuthor =
    iGM_SanitizeContent(String(input.originalAuthor ?? "")).slice(
      0,
      iGM_McAuthorMaxLength,
    ) || null;

  const originalUrlRaw =
    typeof input.originalUrl === "string" ? input.originalUrl.trim() : "";
  let originalUrl: string | null = null;
  if (originalUrlRaw) {
    if (!/^https?:\/\/[^\s]+$/i.test(originalUrlRaw)) {
      throw new iGM_ContentError("minecraft.errors.originalUrlInvalid", 422);
    }
    originalUrl = originalUrlRaw;
  }

  const changelog = iGM_SanitizeContent(String(input.changelog ?? ""));
  if (changelog.length > iGM_McChangelogMaxLength) {
    throw new iGM_ContentError("minecraft.errors.changelogInvalid", 422);
  }

  return {
    resourceType,
    mcVersions,
    loaders,
    platforms,
    license,
    originalAuthor,
    originalUrl,
    changelog: changelog || null,
  };
}

/** 规范化分页参数 */
function iGM_ResolvePagination(
  pageRaw?: number,
  pageSizeRaw?: number,
): { page: number; pageSize: number } {
  const page =
    Number.isFinite(pageRaw) && (pageRaw as number) >= 1
      ? Math.floor(pageRaw as number)
      : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) &&
    (pageSizeRaw as number) >= 1 &&
    (pageSizeRaw as number) <= iGM_MaxPageSize
      ? Math.floor(pageSizeRaw as number)
      : iGM_DefaultPageSize;
  return { page, pageSize };
}

/** 由资源行组装列表项 DTO */
async function iGM_AssembleResourceList(
  rows: iGM_ResourceRow[],
): Promise<iGM_ResourceListItemDto[]> {
  if (rows.length === 0) return [];

  const uploaderRows = await iGM_FindUsersByIds(rows.map((row) => row.iGM_UploaderId));
  const uploaderMap = new Map(uploaderRows.map((user) => [user.iGM_Id, user]));
  const categoryMap = new Map(
    (await iGM_ListResourceCategories()).map((category) => [category.iGM_Id, category]),
  );
  const tagsMap = await iGM_GetTagsForResources(rows.map((row) => row.iGM_Id));
  const fileIds = rows.flatMap((row) => [
    row.iGM_FileId,
    row.iGM_CoverFileId,
  ]);
  const fileMap = await iGM_GetFileDtoMap(fileIds);

  const items: iGM_ResourceListItemDto[] = [];
  for (const row of rows) {
    const uploaderRow = uploaderMap.get(row.iGM_UploaderId);
    const categoryRow = row.iGM_CategoryId
      ? (categoryMap.get(row.iGM_CategoryId) ?? null)
      : null;
    const tags = (tagsMap.get(row.iGM_Id) ?? []).map(iGM_ToResourceTagDto);

    items.push({
      id: row.iGM_Id,
      title: row.iGM_Title,
      excerpt: iGM_BuildExcerpt(row.iGM_Description),
      status: row.iGM_Status,
      category: categoryRow ? iGM_ToResourceCategoryDto(categoryRow) : null,
      tags,
      activityId: row.iGM_ActivityId,
      downloadCount: row.iGM_DownloadCount,
      // 模块十：Minecraft 扩展字段（JSON 文本解析为数组）
      resourceType: row.iGM_ResourceType,
      mcVersions: iGM_ParseJsonArray(row.iGM_McVersions),
      loaders: iGM_ParseJsonArray(row.iGM_Loaders),
      platforms: iGM_ParseJsonArray(row.iGM_Platforms),
      license: row.iGM_License,
      originalAuthor: row.iGM_OriginalAuthor,
      originalUrl: row.iGM_OriginalUrl,
      changelog: row.iGM_Changelog,
      uploader: uploaderRow
        ? await iGM_ToAuthorDto(uploaderRow)
        : iGM_DeletedAuthorPlaceholder(row.iGM_UploaderId),
      file: fileMap.get(row.iGM_FileId) as iGM_ResourceListItemDto["file"],
      cover: row.iGM_CoverFileId ? fileMap.get(row.iGM_CoverFileId) ?? null : null,
      createdAt: row.iGM_CreatedAt,
      updatedAt: row.iGM_UpdatedAt,
    });
  }
  return items;
}

/* ---------- 创建 / 编辑 / 删除 / 状态 ---------- */

/** 创建资源：登录用户上传；必须绑定一个上传好的文件 */
export async function iGM_CreateResourceService(
  user: iGM_UserRow,
  input: iGM_ResourceInput,
): Promise<iGM_ResourceDetailDto> {
  const { title, description, tags } = iGM_ValidateResourceInput(input);
  const fileId = await iGM_ResolveFile(input.fileId);
  const coverFileId = await iGM_ResolveCover(input.coverFileId);
  const categoryId = await iGM_ResolveCategory(input.categoryId);
  const activityId = await iGM_ResolveActivity(input.activityId);
  // 模块十：仅 Minecraft 分区表单携带 minecraft 标记并做扩展校验
  const mc = input.minecraft ? iGM_ValidateMcFields(input) : iGM_EmptyMcFields();
  // 模块十三：CLI 下载——勾选可下载时生成 slug（含用户 uid）
  const downloadable = input.downloadable === true;
  const slug = downloadable ? iGM_BuildResourceSlug(user.iGM_Uid, title) : null;
  const version = downloadable ? (input.version ?? null) : null;

  const resource = await iGM_Db.transaction(async () => {
    const created = await iGM_CreateResource({
      uploaderId: user.iGM_Id,
      title,
      description,
      categoryId,
      fileId,
      coverFileId,
      activityId,
      status: "published",
      // 模块十：Minecraft 扩展字段
      resourceType: mc.resourceType,
      mcVersionsJson: iGM_SerializeMcArray(mc.mcVersions),
      loadersJson: iGM_SerializeMcArray(mc.loaders),
      platformsJson: iGM_SerializeMcArray(mc.platforms),
      license: mc.license,
      originalAuthor: mc.originalAuthor,
      originalUrl: mc.originalUrl,
      changelog: mc.changelog,
      // 模块十三：CLI 下载
      downloadable,
      slug,
      version,
      now: new Date().toISOString(),
    });
    if (tags.length > 0) {
      const tagRows = await iGM_FindOrCreateResourceTags(tags);
      await iGM_ReplaceResourceTags(
        created.iGM_Id,
        tagRows.map((tag) => tag.iGM_Id),
      );
    }
    return created;
  })();

  const detail = await iGM_GetResourceDetail(user, resource.iGM_Id);
  if (!detail) throw new Error("iGM_CreateResourceService：创建后详情组装失败");
  // 模块五：上传资源积分埋点（内部吞异常，不影响主流程）
  await iGM_AwardPoints(user.iGM_Id, "resource_upload", title);
  return detail;
}

/** 编辑资源：仅上传者本人或协管员及以上 */
export async function iGM_UpdateResourceService(
  user: iGM_UserRow,
  resourceId: string,
  input: iGM_ResourceInput,
): Promise<iGM_ResourceDetailDto> {
  const resource = await iGM_FindResourceById(resourceId);
  if (!resource) throw new iGM_ContentError("resource.errors.notFound", 404);
  if (!iGM_IsUploader(user, resource.iGM_UploaderId) && !iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }

  const { title, description, tags } = iGM_ValidateResourceInput(input);
  const fileId = await iGM_ResolveFile(input.fileId ?? resource.iGM_FileId);
  const coverFileId =
    input.coverFileId === "" || input.coverFileId === null
      ? null
      : await iGM_ResolveCover(input.coverFileId ?? resource.iGM_CoverFileId);
  const categoryId = await iGM_ResolveCategory(input.categoryId);
  const activityId =
    input.activityId === undefined
      ? resource.iGM_ActivityId
      : await iGM_ResolveActivity(input.activityId);
  // 模块十：Minecraft 表单按提交校验；普通表单保留资源原 MC 字段
  const mc = input.minecraft
    ? iGM_ValidateMcFields(input)
    : iGM_McFieldsFromRow(resource);
  // 模块十三：CLI 下载——勾选可下载时重新生成 slug（含用户 uid）
  const downloadable = input.downloadable === true;
  const slug = downloadable ? iGM_BuildResourceSlug(user.iGM_Uid, title) : null;
  const version = downloadable ? (input.version ?? null) : null;

  await iGM_Db.transaction(async () => {
    await iGM_UpdateResource(resourceId, {
      title,
      description,
      categoryId,
      fileId,
      coverFileId,
      activityId,
      status:
        input.status && (input.status === "published" || input.status === "hidden")
          ? input.status
          : resource.iGM_Status,
      // 模块十：Minecraft 扩展字段
      resourceType: mc.resourceType,
      mcVersionsJson: iGM_SerializeMcArray(mc.mcVersions),
      loadersJson: iGM_SerializeMcArray(mc.loaders),
      platformsJson: iGM_SerializeMcArray(mc.platforms),
      license: mc.license,
      originalAuthor: mc.originalAuthor,
      originalUrl: mc.originalUrl,
      changelog: mc.changelog,
      // 模块十三：CLI 下载
      downloadable,
      slug,
      version,
      now: new Date().toISOString(),
    });
    const tagRows = tags.length > 0 ? await iGM_FindOrCreateResourceTags(tags) : [];
    await iGM_ReplaceResourceTags(
      resourceId,
      tagRows.map((tag) => tag.iGM_Id),
    );
  })();

  const detail = await iGM_GetResourceDetail(user, resourceId);
  if (!detail) throw new Error("iGM_UpdateResourceService：更新后详情组装失败");
  return detail;
}

/** 删除资源：上传者本人或协管员及以上 */
export async function iGM_DeleteResourceService(
  user: iGM_UserRow,
  resourceId: string,
): Promise<void> {
  const resource = await iGM_FindResourceById(resourceId);
  if (!resource) throw new iGM_ContentError("resource.errors.notFound", 404);
  if (!iGM_IsUploader(user, resource.iGM_UploaderId) && !iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
  await iGM_DeleteResource(resourceId);
}

/** 上架/下架资源：上传者本人或协管员及以上 */
export async function iGM_SetResourceStatusService(
  user: iGM_UserRow,
  resourceId: string,
  status: iGM_ResourceStatus,
): Promise<iGM_ResourceDetailDto> {
  const resource = await iGM_FindResourceById(resourceId);
  if (!resource) throw new iGM_ContentError("resource.errors.notFound", 404);
  if (!iGM_IsUploader(user, resource.iGM_UploaderId) && !iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
  // 模块十：状态变更不触碰内容与 Minecraft 字段，原样回填
  const mc = iGM_McFieldsFromRow(resource);
  await iGM_UpdateResource(resourceId, {
    title: resource.iGM_Title,
    description: resource.iGM_Description,
    categoryId: resource.iGM_CategoryId,
    fileId: resource.iGM_FileId,
    coverFileId: resource.iGM_CoverFileId,
    activityId: resource.iGM_ActivityId,
    status,
    resourceType: mc.resourceType,
    mcVersionsJson: iGM_SerializeMcArray(mc.mcVersions),
    loadersJson: iGM_SerializeMcArray(mc.loaders),
    platformsJson: iGM_SerializeMcArray(mc.platforms),
    license: mc.license,
    originalAuthor: mc.originalAuthor,
    originalUrl: mc.originalUrl,
    changelog: mc.changelog,
    now: new Date().toISOString(),
  });
  const detail = await iGM_GetResourceDetail(user, resourceId);
  if (!detail) throw new Error("iGM_SetResourceStatusService：状态更新后组装失败");
  return detail;
}

/* ---------- 查询 ---------- */

/** 资源列表：已发布公开可见，隐藏资源仅上传者与协管员可见 */
export async function iGM_ListResourcesService(
  currentUser: iGM_UserRow | null,
  query: iGM_ResourceQueryInput,
): Promise<iGM_ResourceListData> {
  const { page, pageSize } = iGM_ResolvePagination(query.page, query.pageSize);
  const canModerate = currentUser ? iGM_CanModerate(currentUser) : false;

  let tagId: string | null = null;
  if (query.tag) {
    const tag = await iGM_FindResourceTagBySlug(query.tag);
    if (!tag) return iGM_EmptyPage(page, pageSize);
    tagId = tag.iGM_Id;
  }
  let categoryId: string | null = null;
  if (query.category) {
    const category = (await iGM_ListResourceCategories()).find(
      (item) => item.iGM_Slug === query.category,
    );
    if (!category) return iGM_EmptyPage(page, pageSize);
    categoryId = category.iGM_Id;
  }

  const { items, total } = await iGM_ListResources({
    statuses: canModerate ? ["published", "hidden"] : ["published"],
    categoryId,
    tagId,
    uploaderId: null,
    activityId: query.activityId?.trim() ? query.activityId.trim() : null,
    search: query.search?.trim() ? query.search.trim() : null,
    page,
    pageSize,
  });

  return {
    items: await iGM_AssembleResourceList(items),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 空分页结果（筛选分类/标签不存在时使用） */
function iGM_EmptyPage(
  page: number,
  pageSize: number,
): iGM_ResourceListData {
  return { items: [], total: 0, page, pageSize, totalPages: 1 };
}

/* ---------- 模块十：Minecraft 分区列表 ---------- */

/** Minecraft 分区列表：仅 Minecraft 资源，支持类型/版本/加载器/平台筛选与搜索 */
export async function iGM_ListMinecraftResourcesService(
  currentUser: iGM_UserRow | null,
  query: {
    type?: string;
    version?: string;
    loader?: string;
    platform?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<iGM_ResourceListData> {
  const { page, pageSize } = iGM_ResolvePagination(query.page, query.pageSize);
  const canModerate = currentUser ? iGM_CanModerate(currentUser) : false;
  const { items, total } = await iGM_ListResources({
    statuses: canModerate ? ["published", "hidden"] : ["published"],
    categoryId: null,
    tagId: null,
    uploaderId: null,
    activityId: null,
    search: query.search?.trim() ? query.search.trim() : null,
    minecraftOnly: true,
    mcResourceType: query.type?.trim() ?? null,
    mcVersion: query.version?.trim() ?? null,
    mcLoader: query.loader?.trim() ?? null,
    mcPlatform: query.platform?.trim() ?? null,
    page,
    pageSize,
  });
  return {
    items: await iGM_AssembleResourceList(items),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 活动详情用：列出关联到该活动的已发布资源（最多 20 条，按创建时间倒序） */
export async function iGM_ListActivityResourcesService(
  activityId: string,
): Promise<iGM_ResourceListItemDto[]> {
  const { items } = await iGM_ListResources({
    statuses: ["published"],
    categoryId: null,
    tagId: null,
    uploaderId: null,
    activityId,
    search: null,
    page: 1,
    pageSize: 20,
  });
  return await iGM_AssembleResourceList(items);
}

/** 资源详情：隐藏资源仅上传者与协管员可见 */
export async function iGM_GetResourceDetail(
  currentUser: iGM_UserRow | null,
  resourceId: string,
): Promise<iGM_ResourceDetailDto | null> {
  const row = await iGM_FindResourceById(resourceId);
  if (!row) return null;

  const isUploader = currentUser !== null && row.iGM_UploaderId === currentUser.iGM_Id;
  const canModerate = currentUser ? iGM_CanModerate(currentUser) : false;
  if (row.iGM_Status !== "published" && !isUploader && !canModerate) {
    return null;
  }

  const [item] = await iGM_AssembleResourceList([row]);
  if (!item) return null;
  const { excerpt: _excerpt, ...rest } = item;
  return {
    ...rest,
    description: row.iGM_Description,
    canManage: isUploader || canModerate,
    downloadable: row.iGM_Downloadable === 1,
    slug: row.iGM_Slug,
    version: row.iGM_Version,
  };
}

/* ---------- 下载 ---------- */

/**
 * 下载资源附件：读取文件内容、访问计数 +1、创建下载通知并返回响应体
 * @param actor 触发下载的用户（登录用户）；游客下载不产生通知
 * @param locale 触发者界面语言，用于通知文案
 */
export async function iGM_DownloadResourceService(
  actor: iGM_UserRow | null,
  resourceId: string,
  locale?: string,
): Promise<iGM_FileContent> {
  const resource = await iGM_FindResourceById(resourceId);
  if (!resource || resource.iGM_Status !== "published") {
    throw new iGM_ContentError("resource.errors.notFound", 404);
  }

  await iGM_IncrementDownloadCount(resourceId);

  // 登录用户下载他人资源时，通知资源上传者
  if (actor && actor.iGM_Id !== resource.iGM_UploaderId) {
    await iGM_Notify({
      userId: resource.iGM_UploaderId,
      actorId: actor.iGM_Id,
      actorName: actor.iGM_DisplayName ?? actor.iGM_Username,
      type: "resource",
      title: resource.iGM_Title,
      link: `/G_ResourceDetail?resourceId=${resourceId}`,
      locale,
    });
  }

  return await iGM_ReadFileContentService(resource.iGM_FileId);
}

/**
 * 按标识符（资源 ID 或标题）下载资源附件。
 * 供 iGM CLI 的 `igm install <资源>` 调用，路径形如 /G_Resource/:identifier/download。
 */
export async function iGM_DownloadResourceByIdentifierService(
  actor: iGM_UserRow | null,
  identifier: string,
  locale?: string,
): Promise<iGM_FileContent> {
  const resource = await iGM_FindResourceByIdentifier(identifier);
  if (!resource || resource.iGM_Status !== "published") {
    throw new iGM_ContentError("resource.errors.notFound", 404);
  }
  const resourceId = resource.iGM_Id;

  await iGM_IncrementDownloadCount(resourceId);

  if (actor && actor.iGM_Id !== resource.iGM_UploaderId) {
    await iGM_Notify({
      userId: resource.iGM_UploaderId,
      actorId: actor.iGM_Id,
      actorName: actor.iGM_DisplayName ?? actor.iGM_Username,
      type: "resource",
      title: resource.iGM_Title,
      link: `/G_ResourceDetail?resourceId=${resourceId}`,
      locale,
    });
  }

  return await iGM_ReadFileContentService(resource.iGM_FileId);
}

// 导出 //
export default {
  iGM_ListResourceCategoriesService,
  iGM_CreateResourceService,
  iGM_UpdateResourceService,
  iGM_DeleteResourceService,
  iGM_SetResourceStatusService,
  iGM_ListResourcesService,
  iGM_ListActivityResourcesService,
  iGM_GetResourceDetail,
  iGM_DownloadResourceService,
  iGM_DownloadResourceByIdentifierService,
};
