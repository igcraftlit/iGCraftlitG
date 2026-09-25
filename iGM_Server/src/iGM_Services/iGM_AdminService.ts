/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_AdminService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Admin
 * 模块：iGM_AdminService
 * 作用：管理后台核心业务编排
 * 内容：数据概览、用户管理（检索/封禁/解封/改角色/删除账号）、内容审核（隐藏/恢复/删除）、
 *       举报处理、测试邮件发送、操作日志与系统信息查询
 * 权限：全部接口要求 moderator 及以上；封禁/解封、角色修改、
 *       系统信息与测试邮件仅 admin；所有写操作写入 iGM_AdminLogs
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_FindUserById, iGM_DeleteUser, iGM_UpdateUserAdmin } from "../iGM_Repositories/iGM_UserRepository";
import { iGM_DeleteSessionsByUser } from "../iGM_Repositories/iGM_SessionRepository";
import {
  iGM_GetOverviewStats,
  iGM_InsertAdminLog,
  iGM_ListAdminLogs,
  iGM_ListCommentsForAdmin,
  iGM_ListPostsForAdmin,
  iGM_ListReports,
  iGM_ListUsersForAdmin,
  iGM_FindReportById,
  iGM_UpdateReportStatus,
} from "../iGM_Repositories/iGM_AdminRepository";
import {
  iGM_DeleteCommentService,
  iGM_DeletePostService,
  iGM_SetCommentStatusService,
  iGM_SetPostStatusService,
} from "./iGM_ContentService";
import { iGM_SendMail } from "./iGM_MailService";
import { iGM_ResolveUserOrgBadge } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import { iGM_ToUserDto, type iGM_UserRow } from "../iGM_Types/iGM_Auth";
import type {
  iGM_AdminContentDto,
  iGM_AdminLogDto,
  iGM_AdminOverviewDto,
  iGM_AdminReportDto,
  iGM_AdminUserDto,
} from "../iGM_Types/iGM_Admin";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_AdminError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_AdminError";
  }
}

/** 内容审核动作 */
export type iGM_ReviewAction = "hide" | "restore" | "delete";

/** 举报处理动作 */
export type iGM_ReportDecision = "resolved" | "dismissed";

// 核心逻辑 //
/* ---------- 内部工具 ---------- */

/** 校验邮箱格式（测试邮件收件人） */
function iGM_IsEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** 规范化分页参数 */
function iGM_Page(pageRaw: number, pageSizeRaw: number): {
  page: number;
  pageSize: number;
} {
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 && pageSizeRaw <= 50
      ? Math.floor(pageSizeRaw)
      : 10;
  return { page, pageSize };
}

/** 写操作日志 */
function iGM_Log(params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
}): void {
  iGM_InsertAdminLog({
    adminId: params.adminId,
    action: params.action,
    targetType: params.targetType ?? null,
    targetId: params.targetId ?? null,
    detail: params.detail ?? null,
    now: new Date().toISOString(),
  });
}

/* ---------- 概览 ---------- */

/** 数据概览统计 */
export function iGM_GetOverviewService(): iGM_AdminOverviewDto {
  return iGM_GetOverviewStats();
}

/* ---------- 用户管理 ---------- */

/** 用户管理列表（检索 + 分页） */
export function iGM_ListUsersService(
  search: string | null,
  pageRaw: number,
  pageSizeRaw: number,
): { items: iGM_AdminUserDto[]; total: number; page: number; pageSize: number; totalPages: number } {
  const { page, pageSize } = iGM_Page(pageRaw, pageSizeRaw);
  const { items, total } = iGM_ListUsersForAdmin(
    search && search.trim() ? search.trim() : null,
    page,
    pageSize,
  );
  return {
    items: items.map((row) => ({
      id: row.iGM_Id,
      // 模块七增强：管理员可查看每个用户的 11 位 iGMUid
      uid: row.iGM_Uid,
      username: row.iGM_Username,
      email: row.iGM_Email,
      role: row.iGM_Role as iGM_AdminUserDto["role"],
      status: row.iGM_Status as iGM_AdminUserDto["status"],
      emailVerified: row.iGM_EmailVerified === 1,
      displayName: row.iGM_DisplayName,
      avatar: row.iGM_Avatar,
      // 模块七：认证组织徽标（负责人带 isOwner 金标）
      verifiedOrg: iGM_ResolveUserOrgBadge(
        row.iGM_VerifiedOrgId ?? null,
        row.iGM_Email,
      ),
      createdAt: row.iGM_CreatedAt,
      totalPoints: row.iGM_TotalPoints,
      postCount: row.iGM_PostCount,
      commentCount: row.iGM_CommentCount,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 封禁用户：仅 admin；不可封禁自己与其他管理员；封禁后立即失效全部会话 */
export function iGM_SetUserStatusService(
  admin: iGM_UserRow,
  userId: string,
  status: "active" | "suspended",
): iGM_AdminUserDto["id"] {
  if (admin.iGM_Role !== "admin") {
    throw new iGM_AdminError("auth.errors.forbidden", 403);
  }
  if (userId === admin.iGM_Id) {
    throw new iGM_AdminError("admin.errors.cannotModifySelf", 422);
  }
  const target = iGM_FindUserById(userId);
  if (!target) throw new iGM_AdminError("admin.errors.userNotFound", 404);
  if (target.iGM_Role === "admin") {
    throw new iGM_AdminError("admin.errors.cannotModifyAdmin", 403);
  }

  iGM_Db.transaction(() => {
    iGM_UpdateUserAdmin(userId, { status, now: new Date().toISOString() });
    if (status === "suspended") {
      iGM_DeleteSessionsByUser(userId);
    }
  })();

  iGM_Log({
    adminId: admin.iGM_Id,
    action: status === "suspended" ? "user_ban" : "user_unban",
    targetType: "user",
    targetId: userId,
    detail: target.iGM_Username,
  });
  return userId;
}

/** 修改用户角色：仅 admin；不可修改自己与其他管理员 */
export function iGM_SetUserRoleService(
  admin: iGM_UserRow,
  userId: string,
  role: iGM_AdminUserDto["role"],
): string {
  if (admin.iGM_Role !== "admin") {
    throw new iGM_AdminError("auth.errors.forbidden", 403);
  }
  if (userId === admin.iGM_Id) {
    throw new iGM_AdminError("admin.errors.cannotModifySelf", 422);
  }
  const target = iGM_FindUserById(userId);
  if (!target) throw new iGM_AdminError("admin.errors.userNotFound", 404);
  if (target.iGM_Role === "admin") {
    throw new iGM_AdminError("admin.errors.cannotModifyAdmin", 403);
  }

  iGM_UpdateUserAdmin(userId, { role, now: new Date().toISOString() });
  iGM_Log({
    adminId: admin.iGM_Id,
    action: "user_role",
    targetType: "user",
    targetId: userId,
    detail: `${target.iGM_Username}: ${target.iGM_Role} -> ${role}`,
  });
  return userId;
}

/**
 * 删除用户账号（模块七第三轮）：仅 admin；无需邮箱验证码，直接物理删除。
 * 安全边界：管理员不可删除自己；其他管理员账号同样受保护（与封禁/改角色一致），
 * 防止误操作造成无管理员；组织负责人账号角色为 user，可由管理员删除，
 * 删除后其邮箱重新注册仍会按负责人规则恢复组织认证。
 * 外键级联清理帖子、评论、会话、通知等全部关联数据。
 */
export function iGM_DeleteUserService(
  admin: iGM_UserRow,
  userId: string,
  locale: string,
): string {
  if (admin.iGM_Role !== "admin") {
    throw new iGM_AdminError("auth.errors.forbidden", 403);
  }
  if (userId === admin.iGM_Id) {
    throw new iGM_AdminError("admin.errors.cannotDeleteSelf", 422);
  }
  const target = iGM_FindUserById(userId);
  if (!target) throw new iGM_AdminError("admin.errors.userNotFound", 404);
  if (target.iGM_Role === "admin") {
    throw new iGM_AdminError("admin.errors.cannotModifyAdmin", 403);
  }

  iGM_Db.transaction(() => {
    iGM_DeleteSessionsByUser(userId);
    iGM_DeleteUser(userId);
  })();

  iGM_Log({
    adminId: admin.iGM_Id,
    action: "user_delete",
    targetType: "user",
    targetId: userId,
    detail: target.iGM_Username,
  });

  // 通知用户账号已被管理员删除（邮件失败不阻断删除结果）
  const isZh = locale === "zh-CN" || locale === "zh-TW" || locale.startsWith("zh");
  iGM_SendMail({
    to: target.iGM_Email,
    subject: isZh
      ? "【iGCraftLit】你的账号已被删除"
      : "[iGCraftLit] Your account has been deleted",
    text: isZh
      ? `你好 ${target.iGM_Username}，\n\n` +
        `你的 iGCraftLit Community 账号已被管理员删除，账号相关数据已被清理且无法恢复。\n` +
        `如你认为此项操作有误，请联系：igcraftlit@outlook.com\n\n` +
        `iGCraftLit Community 团队`
      : `Hello ${target.iGM_Username},\n\n` +
        `Your iGCraftLit Community account has been deleted by an administrator. ` +
        `Account-related data has been removed and cannot be restored.\n` +
        `If you believe this was a mistake, please contact: igcraftlit@outlook.com\n\n` +
        `The iGCraftLit Community Team`,
    html: isZh
      ? `<p style="font-size:14px;color:#52525b;">你好 ${target.iGM_Username}，</p>` +
        `<p style="font-size:14px;color:#52525b;">你的 iGCraftLit Community 账号已被管理员删除，账号相关数据已被清理且无法恢复。</p>` +
        `<p style="font-size:13px;color:#71717a;">如你认为此项操作有误，请联系：igcraftlit@outlook.com</p>` +
        `<p style="font-size:12px;color:#71717a;">iGCraftLit Community 团队</p>`
      : `<p style="font-size:14px;color:#52525b;">Hello ${target.iGM_Username},</p>` +
        `<p style="font-size:14px;color:#52525b;">Your iGCraftLit Community account has been deleted by an administrator. Account-related data has been removed and cannot be restored.</p>` +
        `<p style="font-size:13px;color:#71717a;">If you believe this was a mistake, please contact: igcraftlit@outlook.com</p>` +
        `<p style="font-size:12px;color:#71717a;">The iGCraftLit Community Team</p>`,
  }).catch((error) => {
    console.warn("[iGM_AdminService] 删除账号通知邮件发送失败", error);
  });

  return userId;
}

/* ---------- 内容审核 ---------- */

/** 内容管理列表（帖子/评论全状态检索） */
export function iGM_ListContentsService(
  type: string,
  search: string | null,
  statusFilter: string | null,
  pageRaw: number,
  pageSizeRaw: number,
): { items: iGM_AdminContentDto[]; total: number; page: number; pageSize: number; totalPages: number } {
  const { page, pageSize } = iGM_Page(pageRaw, pageSizeRaw);
  const statuses =
    statusFilter === "normal"
      ? type === "post"
        ? ["published"]
        : ["visible"]
      : statusFilter === "hidden"
        ? type === "post"
          ? ["hidden"]
          : ["hidden"]
        : null;
  const result =
    type === "comment"
      ? iGM_ListCommentsForAdmin(search, statuses, page, pageSize)
      : iGM_ListPostsForAdmin(search, statuses, page, pageSize);
  return {
    items: result.items,
    total: result.total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
  };
}

/**
 * 审核内容：hide 隐藏 / restore 恢复 / delete 删除
 * moderator 及以上可操作任意内容；底层复用社区服务，操作日志在此落库
 */
export function iGM_ReviewContentService(
  admin: iGM_UserRow,
  type: string,
  contentId: string,
  action: iGM_ReviewAction,
): void {
  if (type === "post") {
    if (action === "delete") {
      iGM_DeletePostService(admin, contentId);
    } else {
      iGM_SetPostStatusService(admin, contentId, action === "hide" ? "hidden" : "published");
    }
  } else if (type === "comment") {
    if (action === "delete") {
      iGM_DeleteCommentService(admin, contentId);
    } else {
      iGM_SetCommentStatusService(admin, contentId, action === "hide" ? "hidden" : "visible");
    }
  } else {
    throw new iGM_AdminError("admin.errors.badTargetType", 422);
  }

  iGM_Log({
    adminId: admin.iGM_Id,
    action: `content_${action}`,
    targetType: type,
    targetId: contentId,
  });
}

/* ---------- 举报处理 ---------- */

/** 举报列表（状态过滤 + 分页 + 联表摘要） */
export function iGM_ListReportsService(
  status: string | null,
  pageRaw: number,
  pageSizeRaw: number,
): { items: iGM_AdminReportDto[]; total: number; page: number; pageSize: number; totalPages: number } {
  const { page, pageSize } = iGM_Page(pageRaw, pageSizeRaw);
  const resolvedStatus =
    status === "pending" || status === "resolved" || status === "dismissed"
      ? status
      : null;
  const data = iGM_ListReports(resolvedStatus, page, pageSize);
  return {
    items: data.items.map((row) => {
      let targetSummary: string | null = null;
      let targetStatus: string | null = null;
      if (row.iGM_TargetType === "post") {
        const post = data.postSummaries.get(row.iGM_TargetId);
        if (post) {
          targetSummary = post.title;
          targetStatus = post.status;
        }
      } else if (row.iGM_TargetType === "comment") {
        const comment = data.commentSummaries.get(row.iGM_TargetId);
        if (comment) {
          targetSummary = comment.content.slice(0, 120);
          targetStatus = comment.status;
        }
      }
      return {
        id: row.iGM_Id,
        reporterId: row.iGM_ReporterId,
        reporterName: data.reporterNames.get(row.iGM_ReporterId) ?? null,
        targetType: row.iGM_TargetType,
        targetId: row.iGM_TargetId,
        targetSummary,
        targetStatus,
        reason: row.iGM_Reason,
        status: row.iGM_Status,
        handlerId: row.iGM_HandlerId,
        handlerName: row.iGM_HandlerId
          ? (data.handlerNames.get(row.iGM_HandlerId) ?? null)
          : null,
        createdAt: row.iGM_CreatedAt,
        handledAt: row.iGM_HandledAt,
      };
    }),
    total: data.total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(data.total / pageSize)),
  };
}

/**
 * 处理举报：resolved 违规成立 / dismissed 驳回
 * 可选联动处置目标内容：hide 隐藏 / delete 删除（仅 resolved 时执行）
 */
export function iGM_HandleReportService(
  admin: iGM_UserRow,
  reportId: string,
  decision: iGM_ReportDecision,
  contentAction: "none" | "hide" | "delete",
): void {
  const report = iGM_FindReportById(reportId);
  if (!report) throw new iGM_AdminError("admin.errors.reportNotFound", 404);
  if (report.iGM_Status !== "pending") {
    throw new iGM_AdminError("admin.errors.reportAlreadyHandled", 409);
  }

  iGM_UpdateReportStatus(reportId, decision, admin.iGM_Id, new Date().toISOString());

  if (decision === "resolved" && contentAction !== "none") {
    iGM_ReviewContentService(admin, report.iGM_TargetType, report.iGM_TargetId, contentAction);
  }

  iGM_Log({
    adminId: admin.iGM_Id,
    action: "report_handle",
    targetType: "report",
    targetId: reportId,
    detail: `${decision}/${contentAction}`,
  });
}

/* ---------- 测试邮件 ---------- */

/** 发送测试邮件：仅 admin，验证 SMTP 配置是否正常 */
export async function iGM_SendTestMailService(
  admin: iGM_UserRow,
  to: string,
  locale: string,
): Promise<void> {
  const target = to.trim();
  if (!iGM_IsEmail(target)) {
    throw new iGM_AdminError("admin.errors.invalidEmail", 422);
  }
  const isZh = locale === "zh-CN" || locale === "zh-TW";
  const subject = isZh
    ? "◎ iGCraftLit Community 邮件测试"
    : "◎ iGCraftLit Community Mail Test";
  const text = isZh
    ? `您好，探星者 ${admin.iGM_Username}。\n\n这是一封来自管理后台的测试邮件，用于验证 SMTP 配置是否正常。\n\n—— iGCraftLit Community 团队\n\n团队官网：https://igcraftlit.com\n联系邮箱：igcraftlit@outlook.com (.Net) / igcraftlit@163.com (.CN)`
    : `Hello, Starchaser ${admin.iGM_Username}.\n\nThis is a test email from the admin console to verify the SMTP configuration.\n\n— iGCraftLit Community Team\n\nWebsite: https://igcraftlit.com\nContact: igcraftlit@outlook.com (.Net) / igcraftlit@163.com (.CN)`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#1b212e">
    <p>${isZh ? `您好，探星者` : `Hello, Starchaser`} <strong>${admin.iGM_Username}</strong>。</p>
    <p>${isZh ? "这是一封来自管理后台的测试邮件，用于验证 SMTP 配置是否正常。" : "This is a test email from the admin console to verify the SMTP configuration."}</p>
    <p>—— iGCraftLit Community 团队</p>
    <hr />
    <p style="font-size:12px;color:#6b7280">团队官网：https://igcraftlit.com<br/>联系邮箱：igcraftlit@outlook.com (.Net) / igcraftlit@163.com (.CN)</p>
  </div>`;

  try {
    await iGM_SendMail({ to: target, subject, html, text });
  } catch {
    throw new iGM_AdminError("admin.errors.mailSendFailed", 502);
  }

  iGM_Log({
    adminId: admin.iGM_Id,
    action: "mail_test",
    targetType: "mail",
    targetId: target,
  });
}

/* ---------- 操作日志与系统信息 ---------- */

/** 操作日志分页 */
export function iGM_ListLogsService(
  pageRaw: number,
  pageSizeRaw: number,
): { items: iGM_AdminLogDto[]; total: number; page: number; pageSize: number; totalPages: number } {
  const { page, pageSize } = iGM_Page(pageRaw, pageSizeRaw);
  const { items, total, adminNames } = iGM_ListAdminLogs(page, pageSize);
  return {
    items: items.map((row) => ({
      id: row.iGM_Id,
      adminId: row.iGM_AdminId,
      adminName: adminNames.get(row.iGM_AdminId) ?? null,
      action: row.iGM_Action,
      targetType: row.iGM_TargetType,
      targetId: row.iGM_TargetId,
      detail: row.iGM_Detail,
      createdAt: row.iGM_CreatedAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 系统信息（只读，admin 专用） */
export function iGM_GetSettingsService(): Record<string, unknown> {
  return {
    version: iGM_Config.version,
    port: iGM_Config.port,
    corsOrigins: iGM_Config.corsOrigins,
    database: {
      provider: "SQLite (bun:sqlite)",
    },
    upload: {
      maxFileSizeMb: Math.round(iGM_Config.upload.maxFileSize / (1024 * 1024)),
      imageMaxDimension: iGM_Config.upload.imageMaxDimension,
      allowedExtensions: iGM_Config.upload.allowedExtensions,
    },
    mail: {
      host: iGM_Config.mail.host,
      port: iGM_Config.mail.port,
      secure: iGM_Config.mail.secure,
      user: iGM_Config.mail.user ? `${iGM_Config.mail.user.slice(0, 3)}***` : "",
    },
    rateLimits: Object.fromEntries(
      Object.entries(iGM_Config.rateLimits).map(([key, rule]) => [
        key,
        `${rule.max} 次 / ${Math.round(rule.windowMs / 1000)} 秒`,
      ]),
    ),
  };
}
