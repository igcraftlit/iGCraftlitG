/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_AdminRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Admin
 * 模块：iGM_AdminRepository
 * 作用：管理后台的数据访问封装
 * 内容：用户检索列表（含积分与内容计数）、概览统计、操作日志写入与查询、
 *       举报列表联表查询、后台内容列表（帖子/评论全状态检索）
 */

// 导入依赖 //
import { randomUUID } from "node:crypto";
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type {
  iGM_AdminContentDto,
  iGM_AdminLogRow,
  iGM_AdminOverviewDto,
  iGM_ReportRow,
} from "../iGM_Types/iGM_Admin";

// 类型定义 //
/** 用户管理列表行（原始行 + 计数） */
export interface iGM_AdminUserListRow {
  iGM_Id: string;
  iGM_Username: string;
  iGM_Email: string;
  iGM_Role: string;
  iGM_Status: string;
  iGM_EmailVerified: number;
  iGM_DisplayName: string | null;
  iGM_Avatar: string | null;
  iGM_CreatedAt: string;
  iGM_TotalPoints: number;
  iGM_PostCount: number;
  iGM_CommentCount: number;
}

// 核心逻辑 //
/* ---------- 用户管理 ---------- */

/** 检索用户列表：用户名/邮箱模糊搜索 + 分页，附积分与内容计数 */
export function iGM_ListUsersForAdmin(
  search: string | null,
  page: number,
  pageSize: number,
): { items: iGM_AdminUserListRow[]; total: number } {
  // 说明：bun:sqlite 命名参数绑定到 LIMIT 位置会触发 SQLITE_MISMATCH，
  // 因此本查询统一使用位置参数（与仓库层其他分页查询一致）
  const where = search
    ? `WHERE u.iGM_Username LIKE ? OR u.iGM_Email LIKE ?`
    : ``;
  const searchArgs = search ? [`%${search}%`, `%${search}%`] : [];
  const total = (
    iGM_Db.query(
      `SELECT COUNT(*) AS total FROM iGM_Users u ${where}`,
    ).get(...searchArgs) as { total: number }
  ).total;
  const items = iGM_Db.query(
    `SELECT u.iGM_Id, u.iGM_Username, u.iGM_Email, u.iGM_Role, u.iGM_Status,
            u.iGM_EmailVerified, u.iGM_DisplayName, u.iGM_Avatar, u.iGM_CreatedAt,
            COALESCE(up.iGM_TotalPoints, 0) AS iGM_TotalPoints,
            (SELECT COUNT(*) FROM iGM_Posts p WHERE p.iGM_AuthorId = u.iGM_Id) AS iGM_PostCount,
            (SELECT COUNT(*) FROM iGM_Comments c WHERE c.iGM_AuthorId = u.iGM_Id) AS iGM_CommentCount
     FROM iGM_Users u
     LEFT JOIN iGM_UserPoints up ON up.iGM_UserId = u.iGM_Id
     ${where}
     ORDER BY u.iGM_CreatedAt DESC
     LIMIT ? OFFSET ?`,
  ).all(...searchArgs, pageSize, (page - 1) * pageSize) as iGM_AdminUserListRow[];
  return { items, total };
}

/* ---------- 概览统计 ---------- */

/** 数据概览：用户/帖子/评论/资源/活动/举报/签到计数 */
export function iGM_GetOverviewStats(): iGM_AdminOverviewDto {
  const count = (sql: string): number =>
    (iGM_Db.query(sql).get() as { total: number }).total;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());

  return {
    users: count(`SELECT COUNT(*) AS total FROM iGM_Users`),
    usersToday: count(
      `SELECT COUNT(*) AS total FROM iGM_Users WHERE iGM_CreatedAt >= '${todayIso}'`,
    ),
    usersSuspended: count(
      `SELECT COUNT(*) AS total FROM iGM_Users WHERE iGM_Status = 'suspended'`,
    ),
    posts: count(`SELECT COUNT(*) AS total FROM iGM_Posts`),
    postsToday: count(
      `SELECT COUNT(*) AS total FROM iGM_Posts WHERE iGM_CreatedAt >= '${todayIso}'`,
    ),
    comments: count(`SELECT COUNT(*) AS total FROM iGM_Comments`),
    resources: count(`SELECT COUNT(*) AS total FROM iGM_Resources`),
    activities: count(`SELECT COUNT(*) AS total FROM iGM_Activities`),
    reportsPending: count(
      `SELECT COUNT(*) AS total FROM iGM_Reports WHERE iGM_Status = 'pending'`,
    ),
    checkinsToday: count(
      `SELECT COUNT(*) AS total FROM iGM_Checkins WHERE iGM_CheckinDate = '${todayDate}'`,
    ),
  };
}

/* ---------- 操作日志 ---------- */

/** 写入一条管理操作日志 */
export function iGM_InsertAdminLog(params: {
  adminId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
  now: string;
}): void {
  iGM_Db.run(
    `INSERT INTO iGM_AdminLogs
       (iGM_Id, iGM_AdminId, iGM_Action, iGM_TargetType, iGM_TargetId, iGM_Detail, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      params.adminId,
      params.action,
      params.targetType ?? null,
      params.targetId ?? null,
      params.detail ?? null,
      params.now,
    ],
  );
}

/** 分页查询操作日志（附管理员用户名） */
export function iGM_ListAdminLogs(
  page: number,
  pageSize: number,
): { items: iGM_AdminLogRow[]; total: number; adminNames: Map<string, string> } {
  const total = (
    iGM_Db.query(`SELECT COUNT(*) AS total FROM iGM_AdminLogs`).get() as {
      total: number;
    }
  ).total;
  const items = iGM_Db.query(
    `SELECT * FROM iGM_AdminLogs
     ORDER BY iGM_CreatedAt DESC
     LIMIT ? OFFSET ?`,
  ).all(pageSize, (page - 1) * pageSize) as iGM_AdminLogRow[];
  const adminIds = [...new Set(items.map((row) => row.iGM_AdminId))];
  const adminNames = new Map<string, string>();
  for (const adminId of adminIds) {
    const row = iGM_Db.query(
      `SELECT iGM_Username FROM iGM_Users WHERE iGM_Id = ?`,
    ).get(adminId) as { iGM_Username: string } | undefined;
    if (row) adminNames.set(adminId, row.iGM_Username);
  }
  return { items, total, adminNames };
}

/* ---------- 举报 ---------- */

/** 分页查询举报列表（状态过滤 + 联表摘要） */
export function iGM_ListReports(
  status: string | null,
  page: number,
  pageSize: number,
): {
  items: iGM_ReportRow[];
  total: number;
  reporterNames: Map<string, string>;
  handlerNames: Map<string, string>;
  postSummaries: Map<string, { title: string; status: string }>;
  commentSummaries: Map<string, { content: string; status: string; postTitle: string }>;
} {
  const where = status ? `WHERE iGM_Status = ?` : ``;
  const params = status ? [status] : [];
  const total = (
    iGM_Db.query(
      `SELECT COUNT(*) AS total FROM iGM_Reports ${where}`,
    ).get(...params) as { total: number }
  ).total;
  const items = iGM_Db.query(
    `SELECT * FROM iGM_Reports ${where}
     ORDER BY iGM_CreatedAt DESC
     LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, (page - 1) * pageSize) as iGM_ReportRow[];

  const reporterNames = new Map<string, string>();
  const handlerNames = new Map<string, string>();
  const postSummaries = new Map<string, { title: string; status: string }>();
  const commentSummaries = new Map<
    string,
    { content: string; status: string; postTitle: string }
  >();

  const nameOf = (userId: string): string | null => {
    const row = iGM_Db.query(
      `SELECT iGM_Username FROM iGM_Users WHERE iGM_Id = ?`,
    ).get(userId) as { iGM_Username: string } | undefined;
    return row?.iGM_Username ?? null;
  };

  for (const row of items) {
    if (!reporterNames.has(row.iGM_ReporterId)) {
      reporterNames.set(row.iGM_ReporterId, nameOf(row.iGM_ReporterId) ?? "");
    }
    if (row.iGM_HandlerId && !handlerNames.has(row.iGM_HandlerId)) {
      handlerNames.set(row.iGM_HandlerId, nameOf(row.iGM_HandlerId) ?? "");
    }
    if (row.iGM_TargetType === "post" && !postSummaries.has(row.iGM_TargetId)) {
      const post = iGM_Db.query(
        `SELECT iGM_Title, iGM_Status FROM iGM_Posts WHERE iGM_Id = ?`,
      ).get(row.iGM_TargetId) as
        | { iGM_Title: string; iGM_Status: string }
        | undefined;
      if (post) {
        postSummaries.set(row.iGM_TargetId, {
          title: post.iGM_Title,
          status: post.iGM_Status,
        });
      }
    }
    if (
      row.iGM_TargetType === "comment" &&
      !commentSummaries.has(row.iGM_TargetId)
    ) {
      const comment = iGM_Db.query(
        `SELECT c.iGM_Content, c.iGM_Status, p.iGM_Title
         FROM iGM_Comments c
         JOIN iGM_Posts p ON p.iGM_Id = c.iGM_PostId
         WHERE c.iGM_Id = ?`,
      ).get(row.iGM_TargetId) as
        | { iGM_Content: string; iGM_Status: string; iGM_Title: string }
        | undefined;
      if (comment) {
        commentSummaries.set(row.iGM_TargetId, {
          content: comment.iGM_Content,
          status: comment.iGM_Status,
          postTitle: comment.iGM_Title,
        });
      }
    }
  }

  return { items, total, reporterNames, handlerNames, postSummaries, commentSummaries };
}

/** 按 ID 查询举报行 */
export function iGM_FindReportById(reportId: string): iGM_ReportRow | null {
  return (
    (iGM_Db.query(`SELECT * FROM iGM_Reports WHERE iGM_Id = ?`).get(reportId) as
      | iGM_ReportRow
      | undefined) ?? null
  );
}

/** 更新举报处理状态 */
export function iGM_UpdateReportStatus(
  reportId: string,
  status: "resolved" | "dismissed",
  handlerId: string,
  now: string,
): void {
  iGM_Db.run(
    `UPDATE iGM_Reports
     SET iGM_Status = ?, iGM_HandlerId = ?, iGM_HandledAt = ?
     WHERE iGM_Id = ?`,
    [status, handlerId, now, reportId],
  );
}

/* ---------- 后台内容检索 ---------- */

/** 帖子管理列表：全状态 + 关键词搜索 + 分页 */
export function iGM_ListPostsForAdmin(
  search: string | null,
  statuses: string[] | null,
  page: number,
  pageSize: number,
): { items: iGM_AdminContentDto[]; total: number } {
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (search) {
    conditions.push(`(p.iGM_Title LIKE ? OR p.iGM_Content LIKE ?)`);
    values.push(`%${search}%`, `%${search}%`);
  }
  if (statuses && statuses.length > 0) {
    conditions.push(
      `p.iGM_Status IN (${statuses.map(() => "?").join(", ")})`,
    );
    values.push(...statuses);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ``;
  const total = (
    iGM_Db.query(
      `SELECT COUNT(*) AS total FROM iGM_Posts p ${where}`,
    ).get(...values) as { total: number }
  ).total;
  const rows = iGM_Db.query(
    `SELECT p.iGM_Id, p.iGM_Title, p.iGM_Content, p.iGM_Status,
            p.iGM_AuthorId, u.iGM_Username AS iGM_AuthorName, p.iGM_CreatedAt
     FROM iGM_Posts p
     LEFT JOIN iGM_Users u ON u.iGM_Id = p.iGM_AuthorId
     ${where}
     ORDER BY p.iGM_CreatedAt DESC
     LIMIT ? OFFSET ?`,
  ).all(...values, pageSize, (page - 1) * pageSize) as Array<{
    iGM_Id: string;
    iGM_Title: string;
    iGM_Content: string;
    iGM_Status: string;
    iGM_AuthorId: string;
    iGM_AuthorName: string | null;
    iGM_CreatedAt: string;
  }>;
  return {
    items: rows.map((row) => ({
      type: "post" as const,
      id: row.iGM_Id,
      title: row.iGM_Title,
      excerpt: row.iGM_Content.slice(0, 120),
      status: row.iGM_Status,
      authorId: row.iGM_AuthorId,
      authorName: row.iGM_AuthorName,
      createdAt: row.iGM_CreatedAt,
    })),
    total,
  };
}

/** 评论管理列表：全状态 + 关键词搜索 + 分页 */
export function iGM_ListCommentsForAdmin(
  search: string | null,
  statuses: string[] | null,
  page: number,
  pageSize: number,
): { items: iGM_AdminContentDto[]; total: number } {
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (search) {
    conditions.push(`c.iGM_Content LIKE ?`);
    values.push(`%${search}%`);
  }
  if (statuses && statuses.length > 0) {
    conditions.push(
      `c.iGM_Status IN (${statuses.map(() => "?").join(", ")})`,
    );
    values.push(...statuses);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ``;
  const total = (
    iGM_Db.query(
      `SELECT COUNT(*) AS total FROM iGM_Comments c ${where}`,
    ).get(...values) as { total: number }
  ).total;
  const rows = iGM_Db.query(
    `SELECT c.iGM_Id, c.iGM_Content, c.iGM_Status, c.iGM_AuthorId,
            u.iGM_Username AS iGM_AuthorName, p.iGM_Title AS iGM_PostTitle,
            c.iGM_CreatedAt
     FROM iGM_Comments c
     LEFT JOIN iGM_Users u ON u.iGM_Id = c.iGM_AuthorId
     LEFT JOIN iGM_Posts p ON p.iGM_Id = c.iGM_PostId
     ${where}
     ORDER BY c.iGM_CreatedAt DESC
     LIMIT ? OFFSET ?`,
  ).all(...values, pageSize, (page - 1) * pageSize) as Array<{
    iGM_Id: string;
    iGM_Content: string;
    iGM_Status: string;
    iGM_AuthorId: string;
    iGM_AuthorName: string | null;
    iGM_PostTitle: string | null;
    iGM_CreatedAt: string;
  }>;
  return {
    items: rows.map((row) => ({
      type: "comment" as const,
      id: row.iGM_Id,
      title: row.iGM_PostTitle ?? "",
      excerpt: row.iGM_Content.slice(0, 120),
      status: row.iGM_Status,
      authorId: row.iGM_AuthorId,
      authorName: row.iGM_AuthorName,
      createdAt: row.iGM_CreatedAt,
    })),
    total,
  };
}
