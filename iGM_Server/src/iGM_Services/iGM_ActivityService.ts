/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ActivityService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Activity
 * 模块：iGM_ActivityService
 * 作用：社区活动的创建、编辑、删除、列表、详情、报名、取消与报名列表编排
 * 内容：内容 XSS 净化与长度校验、时间与名额校验、权限判定（创建者/协管员/管理员）、
 *       活动 DTO 组装（创建者、封面、报名数、当前用户状态）、报名与取消、
 *       报名成功创建通知
 * 权限：社交生态优化后活动发布权收回——仅协管员及以上可创建活动，
 *       普通用户仅可浏览与报名；编辑/删除沿用创建者本人或协管员及以上
 */

// 导入依赖 //
import {
  iGM_CountRegistrations,
  iGM_CountRegistrationsBatch,
  iGM_CreateActivity,
  iGM_DeleteActivity,
  iGM_FindActivityById,
  iGM_FindRegistration,
  iGM_ListActivities,
  iGM_ListRegistrations,
  iGM_UpdateActivity,
  iGM_UpsertRegistration,
} from "../iGM_Repositories/iGM_ActivityRepository";
import { iGM_FindUsersByIds } from "../iGM_Repositories/iGM_UserRepository";
import { iGM_GetFileDtoMap, iGM_GetFileDto } from "./iGM_FileService";
import { iGM_ContentError, iGM_SanitizeContent } from "./iGM_ContentService";
import { iGM_Notify } from "./iGM_NotificationService";
import { iGM_AwardPoints } from "./iGM_PointsService";
import { iGM_ListActivityResourcesService } from "./iGM_ResourceService";
import type { iGM_AuthorDto } from "../iGM_Types/iGM_Community";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";
import { iGM_ResolveUserOrgBadge } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import {
  iGM_IsActivityStatus,
  type iGM_ActivityDetailDto,
  type iGM_ActivityInput,
  type iGM_ActivityListItemDto,
  type iGM_ActivityListData,
  type iGM_ActivityRegistrationDto,
  type iGM_ActivityRow,
} from "../iGM_Types/iGM_Activity";

// 类型定义 //
/** 活动列表查询入参 */
export interface iGM_ActivityQueryInput {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// 核心逻辑 //
const iGM_TitleMaxLength = 100;
const iGM_DescriptionMaxLength = 5000;
const iGM_MaxParticipants = 9999;
const iGM_MaxPageSize = 50;
const iGM_DefaultPageSize = 10;
const iGM_ExcerptLength = 160;

/** 协管员及以上可管理任意活动 */
function iGM_CanModerate(user: iGM_UserRow): boolean {
  return user.iGM_Role === "moderator" || user.iGM_Role === "admin";
}

/** 是否为活动创建者 */
function iGM_IsCreator(user: iGM_UserRow, creatorId: string): boolean {
  return user.iGM_Id === creatorId;
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

/** 作者已注销场景占位 */
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

/** 解析可选时间字符串，非法返回 null */
function iGM_ParseTime(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+/.test(trimmed)) return null;
  const time = new Date(trimmed);
  if (Number.isNaN(time.getTime())) return null;
  return time.toISOString();
}

/** 解析可选人数，非法或空返回 null */
function iGM_ParseMaxParticipants(
  value?: string | number | null,
): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num =
    typeof value === "number" ? value : Number(iGM_SanitizeContent(String(value)));
  if (!Number.isInteger(num) || num < 1 || num > iGM_MaxParticipants) {
    throw new iGM_ContentError("activity.errors.maxInvalid", 422);
  }
  return num;
}

/** 规范化并净化活动输入 */
function iGM_ValidateActivityInput(input: iGM_ActivityInput): {
  title: string;
  description: string;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
  status: "draft" | "open" | "closed";
  maxParticipants: number | null;
} {
  const title = iGM_SanitizeContent(String(input.title ?? "")).replace(/\s+/g, " ");
  if (title.length < 1 || title.length > iGM_TitleMaxLength) {
    throw new iGM_ContentError("activity.errors.titleInvalid", 422);
  }
  const description = iGM_SanitizeContent(String(input.description ?? ""));
  if (description.length > iGM_DescriptionMaxLength) {
    throw new iGM_ContentError("activity.errors.descriptionInvalid", 422);
  }

  const status = iGM_IsActivityStatus(input.status) ? input.status : "open";

  const startTime = iGM_ParseTime(
    typeof input.startTime === "string" ? input.startTime : undefined,
  );
  const endTime = iGM_ParseTime(
    typeof input.endTime === "string" ? input.endTime : undefined,
  );
  if (startTime && endTime && new Date(endTime) < new Date(startTime)) {
    throw new iGM_ContentError("activity.errors.timeInvalid", 422);
  }

  return {
    title,
    description,
    location: iGM_SanitizeContent(
      String(input.location ?? ""),
    ) ? iGM_SanitizeContent(String(input.location ?? "")) : null,
    startTime,
    endTime,
    status,
    maxParticipants: iGM_ParseMaxParticipants(input.maxParticipants),
  };
}

/** 校验封面文件存在（可选） */
async function iGM_ResolveCover(
  coverFileId?: string | null,
): Promise<string | null> {
  if (!coverFileId || !coverFileId.trim()) return null;
  const id = coverFileId.trim();
  await iGM_GetFileDto(id); // 不存在会抛 404
  return id;
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

/** 由活动行组装列表项 DTO（创建者、封面、报名数一次取齐） */
async function iGM_AssembleActivityList(
  rows: iGM_ActivityRow[],
  currentUserId: string | null,
): Promise<iGM_ActivityListItemDto[]> {
  if (rows.length === 0) return [];

  const creatorRows = await iGM_FindUsersByIds(
    rows.map((row) => row.iGM_CreatorId),
  );
  const creatorMap = new Map(creatorRows.map((user) => [user.iGM_Id, user]));
  const coverMap = await iGM_GetFileDtoMap(
    rows.map((row) => row.iGM_CoverFileId),
  );
  const registerCounts = await iGM_CountRegistrationsBatch(
    rows.map((row) => row.iGM_Id),
  );

  return Promise.all(
    rows.map(async (row) => {
      const creatorRow = creatorMap.get(row.iGM_CreatorId);
      const cover = row.iGM_CoverFileId
        ? coverMap.get(row.iGM_CoverFileId) ?? null
        : null;
      return {
        id: row.iGM_Id,
        title: row.iGM_Title,
        excerpt: iGM_BuildExcerpt(row.iGM_Description),
        status: row.iGM_Status,
        location: row.iGM_Location,
        startTime: row.iGM_StartTime,
        endTime: row.iGM_EndTime,
        maxParticipants: row.iGM_MaxParticipants,
        registeredCount: registerCounts.get(row.iGM_Id) ?? 0,
        creator: creatorRow
          ? await iGM_ToAuthorDto(creatorRow)
          : iGM_DeletedAuthorPlaceholder(row.iGM_CreatorId),
        cover,
        createdAt: row.iGM_CreatedAt,
        updatedAt: row.iGM_UpdatedAt,
      };
    }),
  );
}

/* ---------- 创建 / 编辑 / 删除 ---------- */

/**
 * 创建活动：社交生态优化后发布权完全收回，仅协管员及以上可创建；
 * 普通用户一律 403（前端入口同步隐藏，后端为最终拦截关口）
 */
export async function iGM_CreateActivityService(
  user: iGM_UserRow,
  input: iGM_ActivityInput,
): Promise<iGM_ActivityDetailDto> {
  if (!iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
  const validated = iGM_ValidateActivityInput(input);
  // 发布权限仅限协管员及以上，状态可在入参允许范围内任意设置
  const status = validated.status;

  const activity = await iGM_CreateActivity({
    creatorId: user.iGM_Id,
    title: validated.title,
    description: validated.description,
    coverFileId: await iGM_ResolveCover(input.coverFileId),
    location: validated.location,
    startTime: validated.startTime,
    endTime: validated.endTime,
    status,
    maxParticipants: validated.maxParticipants,
    now: new Date().toISOString(),
  });

  const detail = await iGM_GetActivityDetailService(user, activity.iGM_Id);
  if (!detail) throw new Error("iGM_CreateActivityService：创建后详情组装失败");
  return detail;
}

/** 编辑活动：仅创建者本人或协管员及以上 */
export async function iGM_UpdateActivityService(
  user: iGM_UserRow,
  activityId: string,
  input: iGM_ActivityInput,
): Promise<iGM_ActivityDetailDto> {
  const activity = await iGM_FindActivityById(activityId);
  if (!activity) throw new iGM_ContentError("activity.errors.notFound", 404);
  if (!iGM_IsCreator(user, activity.iGM_CreatorId) && !iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }

  const validated = iGM_ValidateActivityInput(input);
  // 普通创建者把已开始/已结束的活动改回 draft 无意义，仅允许 open/closed；
  // 协管员及以上可任意设置
  const status = iGM_CanModerate(user)
    ? validated.status
    : validated.status === "draft"
      ? "open"
      : validated.status;

  await iGM_UpdateActivity(activityId, {
    title: validated.title,
    description: validated.description,
    coverFileId: await iGM_ResolveCover(input.coverFileId),
    location: validated.location,
    startTime: validated.startTime,
    endTime: validated.endTime,
    status,
    maxParticipants: validated.maxParticipants,
    now: new Date().toISOString(),
  });

  const detail = await iGM_GetActivityDetailService(user, activityId);
  if (!detail) throw new Error("iGM_UpdateActivityService：更新后详情组装失败");
  return detail;
}

/** 删除活动：创建者本人或协管员及以上 */
export async function iGM_DeleteActivityService(
  user: iGM_UserRow,
  activityId: string,
): Promise<void> {
  const activity = await iGM_FindActivityById(activityId);
  if (!activity) throw new iGM_ContentError("activity.errors.notFound", 404);
  if (!iGM_IsCreator(user, activity.iGM_CreatorId) && !iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
  await iGM_DeleteActivity(activityId);
}

/* ---------- 查询 ---------- */

/** 活动列表：草稿仅创建者与协管员可见，其余状态公开可见 */
export async function iGM_ListActivitiesService(
  currentUser: iGM_UserRow | null,
  query: iGM_ActivityQueryInput,
): Promise<iGM_ActivityListData> {
  const { page, pageSize } = iGM_ResolvePagination(query.page, query.pageSize);
  const canModerate = currentUser ? iGM_CanModerate(currentUser) : false;

  let statuses: ("draft" | "open" | "closed")[];
  if (query.status === "draft") {
    // 仅协管员及以上可指定草稿筛选，普通访客退化为公开状态
    statuses = canModerate ? ["draft"] : ["open", "closed"];
  } else if (query.status === "closed") {
    statuses = ["closed"];
  } else if (query.status === "open") {
    statuses = ["open"];
  } else {
    statuses = ["open", "closed", ...(canModerate ? (["draft"] as const) : [])];
  }

  const { items, total } = await iGM_ListActivities({
    statuses,
    search: query.search?.trim() ? query.search.trim() : null,
    creatorId: null,
    page,
    pageSize,
  });

  // 组装后，过滤掉普通访客不可见的草稿
  const visible = canModerate
    ? items
    : items.filter(
        (row) =>
          row.iGM_Status !== "draft" ||
          (currentUser !== null && row.iGM_CreatorId === currentUser.iGM_Id),
      );

  return {
    items: await iGM_AssembleActivityList(visible, currentUser?.iGM_Id ?? null),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 活动详情：草稿仅创建者与协管员可见；附带当前用户报名状态与编辑权限 */
export async function iGM_GetActivityDetailService(
  currentUser: iGM_UserRow | null,
  activityId: string,
): Promise<iGM_ActivityDetailDto | null> {
  const row = await iGM_FindActivityById(activityId);
  if (!row) return null;

  const isCreator = currentUser !== null && row.iGM_CreatorId === currentUser.iGM_Id;
  const canModerate = currentUser ? iGM_CanModerate(currentUser) : false;
  if (row.iGM_Status === "draft" && !isCreator && !canModerate) {
    return null;
  }

  const [item] = await iGM_AssembleActivityList(
    [row],
    currentUser?.iGM_Id ?? null,
  );
  if (!item) return null;

  const registrationRow =
    currentUser !== null
      ? await iGM_FindRegistration(activityId, currentUser.iGM_Id)
      : null;

  const { excerpt: _excerpt, ...rest } = item;
  return {
    ...rest,
    description: row.iGM_Description,
    registeredByMe: registrationRow?.iGM_Status === "registered",
    canEdit: isCreator || canModerate,
    // 活动资源：关联到本活动的已发布资源
    resources: await iGM_ListActivityResourcesService(activityId),
  };
}

/* ---------- 报名 / 取消 ---------- */

/** 报名活动：登录用户；仅报名中且未满员的活动可报名，成功后创建通知 */
export async function iGM_RegisterActivityService(
  user: iGM_UserRow,
  activityId: string,
  locale?: string,
): Promise<iGM_ActivityDetailDto> {
  const activity = await iGM_FindActivityById(activityId);
  if (!activity) throw new iGM_ContentError("activity.errors.notFound", 404);
  if (activity.iGM_Status !== "open") {
    throw new iGM_ContentError("activity.errors.notOpen", 409);
  }

  const existing = await iGM_FindRegistration(activityId, user.iGM_Id);
  if (existing?.iGM_Status === "registered") {
    throw new iGM_ContentError("activity.errors.alreadyRegistered", 409);
  }
  if (activity.iGM_MaxParticipants !== null) {
    const current = await iGM_CountRegistrations(activityId);
    if (current >= activity.iGM_MaxParticipants) {
      throw new iGM_ContentError("activity.errors.full", 409);
    }
  }

  await iGM_UpsertRegistration(
    activityId,
    user.iGM_Id,
    "registered",
    new Date().toISOString(),
  );

  // 报名成功创建站内通知（若用户开启邮件通知则附带邮件）
  await iGM_Notify({
    userId: user.iGM_Id,
    type: "activity",
    title: activity.iGM_Title,
    link: `/G_ActivityDetail?activityId=${activityId}`,
    locale,
  });

  const detail = await iGM_GetActivityDetailService(user, activityId);
  if (!detail) throw new Error("iGM_RegisterActivityService：报名后详情组装失败");
  // 模块五：报名活动积分埋点（内部吞异常，不影响主流程）
  await iGM_AwardPoints(user.iGM_Id, "activity_join", activity.iGM_Title);
  return detail;
}

/** 取消报名：仅本人可取消自己的报名 */
export async function iGM_CancelRegistrationService(
  user: iGM_UserRow,
  activityId: string,
): Promise<iGM_ActivityDetailDto> {
  const activity = await iGM_FindActivityById(activityId);
  if (!activity) throw new iGM_ContentError("activity.errors.notFound", 404);

  const existing = await iGM_FindRegistration(activityId, user.iGM_Id);
  if (!existing || existing.iGM_Status !== "registered") {
    throw new iGM_ContentError("activity.errors.notRegistered", 409);
  }

  await iGM_UpsertRegistration(
    activityId,
    user.iGM_Id,
    "cancelled",
    new Date().toISOString(),
  );

  const detail = await iGM_GetActivityDetailService(user, activityId);
  if (!detail) throw new Error("iGM_CancelRegistrationService：取消后详情组装失败");
  return detail;
}

/** 活动报名列表：每项附带报名者公开资料 */
export async function iGM_ListRegistrationsService(
  activityId: string,
): Promise<iGM_ActivityRegistrationDto[]> {
  const rows = await iGM_ListRegistrations(activityId);
  if (rows.length === 0) return [];

  const userRows = await iGM_FindUsersByIds(rows.map((row) => row.iGM_UserId));
  const userMap = new Map(userRows.map((user) => [user.iGM_Id, user]));

  return Promise.all(
    rows.map(async (row) => ({
      id: row.iGM_Id,
      status: row.iGM_Status,
      createdAt: row.iGM_CreatedAt,
      user: userMap.has(row.iGM_UserId)
        ? await iGM_ToAuthorDto(userMap.get(row.iGM_UserId) as iGM_UserRow)
        : iGM_DeletedAuthorPlaceholder(row.iGM_UserId),
    })),
  );
}

// 导出 //
export default {
  iGM_CreateActivityService,
  iGM_UpdateActivityService,
  iGM_DeleteActivityService,
  iGM_ListActivitiesService,
  iGM_GetActivityDetailService,
  iGM_RegisterActivityService,
  iGM_CancelRegistrationService,
  iGM_ListRegistrationsService,
};