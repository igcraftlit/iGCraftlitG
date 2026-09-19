/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_NotificationRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Notification
 * 模块：iGM_NotificationRepository
 * 作用：站内通知（iGM_Notifications）与通知偏好（iGM_NotificationPreferences）
 *       的唯一数据访问出口
 * 内容：通知创建、按用户分页查询、未读计数、单条/全部标记已读、删除、
 *       偏好读取与写入
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_CreateNotificationInput,
  iGM_NotificationPreferenceRow,
  iGM_NotificationRow,
} from "../iGM_Types/iGM_Notification";

// 类型定义 //
/** 通知分页查询结果 */
export interface iGM_NotificationListResult {
  items: iGM_NotificationRow[];
  total: number;
}

// 核心逻辑 //
/** 新建一条站内通知 */
export function iGM_CreateNotification(
  input: iGM_CreateNotificationInput,
): iGM_NotificationRow {
  const row: iGM_NotificationRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_UserId: input.userId,
    iGM_Type: input.type,
    iGM_Title: input.title,
    iGM_Content: input.content,
    iGM_Link: input.link ?? null,
    iGM_IsRead: 0,
    iGM_CreatedAt: input.now,
  };
  iGM_Db.run(
    `INSERT INTO iGM_Notifications
       (iGM_Id, iGM_UserId, iGM_Type, iGM_Title, iGM_Content, iGM_Link, iGM_IsRead, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UserId,
      row.iGM_Type,
      row.iGM_Title,
      row.iGM_Content,
      row.iGM_Link,
      row.iGM_IsRead,
      row.iGM_CreatedAt,
    ],
  );
  return row;
}

/** 按主键查询通知 */
export function iGM_FindNotificationById(
  id: string,
): iGM_NotificationRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Notifications WHERE iGM_Id = ?`)
      .get(id) as iGM_NotificationRow | undefined) ?? null
  );
}

/** 分页查询某用户的通知（时间倒序）；onlyUnread 为 true 时仅返回未读 */
export function iGM_ListNotificationsByUser(
  userId: string,
  onlyUnread: boolean,
  page: number,
  pageSize: number,
): iGM_NotificationListResult {
  const where = onlyUnread
    ? `WHERE iGM_UserId = ? AND iGM_IsRead = 0`
    : `WHERE iGM_UserId = ?`;
  const offset = (page - 1) * pageSize;

  const totalRow = iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Notifications ${where}`)
    .get(userId) as { iGM_Count: number };

  const items = iGM_Db
    .query(
      `SELECT * FROM iGM_Notifications ${where}
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(userId, pageSize, offset) as iGM_NotificationRow[];

  return { items, total: totalRow.iGM_Count };
}

/** 统计某用户的未读通知数 */
export function iGM_CountUnreadNotifications(userId: string): number {
  const row = iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Notifications
        WHERE iGM_UserId = ? AND iGM_IsRead = 0`,
    )
    .get(userId) as { iGM_Count: number };
  return row.iGM_Count;
}

/** 将单条通知标记为已读（限定归属用户，防止越权） */
export function iGM_MarkNotificationRead(
  id: string,
  userId: string,
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Notifications SET iGM_IsRead = 1
      WHERE iGM_Id = ? AND iGM_UserId = ?`,
    [id, userId],
  );
  return result.changes > 0;
}

/** 将某用户全部通知标记为已读，返回受影响条数 */
export function iGM_MarkAllNotificationsRead(userId: string): number {
  const result = iGM_Db.run(
    `UPDATE iGM_Notifications SET iGM_IsRead = 1
      WHERE iGM_UserId = ? AND iGM_IsRead = 0`,
    [userId],
  );
  return result.changes;
}

/** 删除单条通知（限定归属用户） */
export function iGM_DeleteNotification(id: string, userId: string): boolean {
  const result = iGM_Db.run(
    `DELETE FROM iGM_Notifications WHERE iGM_Id = ? AND iGM_UserId = ?`,
    [id, userId],
  );
  return result.changes > 0;
}

/** 查询某用户的通知偏好（未设置返回 null） */
export function iGM_FindNotificationPreference(
  userId: string,
): iGM_NotificationPreferenceRow | null {
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_NotificationPreferences WHERE iGM_UserId = ?`,
      )
      .get(userId) as iGM_NotificationPreferenceRow | undefined) ?? null
  );
}

/** 写入（首次）或更新通知偏好 */
export function iGM_UpsertNotificationPreference(
  userId: string,
  siteEnabled: boolean,
  emailEnabled: boolean,
  now: string,
): void {
  iGM_Db.run(
    `INSERT INTO iGM_NotificationPreferences
       (iGM_Id, iGM_UserId, iGM_SiteEnabled, iGM_EmailEnabled, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (iGM_UserId) DO UPDATE SET
       iGM_SiteEnabled = excluded.iGM_SiteEnabled,
       iGM_EmailEnabled = excluded.iGM_EmailEnabled,
       iGM_UpdatedAt = excluded.iGM_UpdatedAt`,
    [
      iGM_RandomUuid(),
      userId,
      siteEnabled ? 1 : 0,
      emailEnabled ? 1 : 0,
      now,
    ],
  );
}

// 导出 //
export default {
  iGM_CreateNotification,
  iGM_FindNotificationById,
  iGM_ListNotificationsByUser,
  iGM_CountUnreadNotifications,
  iGM_MarkNotificationRead,
  iGM_MarkAllNotificationsRead,
  iGM_DeleteNotification,
  iGM_FindNotificationPreference,
  iGM_UpsertNotificationPreference,
};
