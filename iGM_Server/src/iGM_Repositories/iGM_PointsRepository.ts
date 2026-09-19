/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_PointsRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Points
 * 模块：iGM_PointsRepository
 * 作用：积分、等级、勋章、签到与任务的数据访问封装
 * 内容：积分流水写入与统计、用户积分汇总读写、等级/勋章/任务配置查询、
 *       用户勋章唯一写入、签到唯一写入、排行榜查询
 */

// 导入依赖 //
import { randomUUID } from "node:crypto";
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type {
  iGM_BadgeRow,
  iGM_CheckinRow,
  iGM_LevelRow,
  iGM_PointsRecordRow,
  iGM_TaskRow,
  iGM_UserBadgeRow,
  iGM_UserPointsRow,
  iGM_UserTaskRow,
} from "../iGM_Types/iGM_Points";

// 类型定义 //
// （行类型见 iGM_Types/iGM_Points.ts）

// 核心逻辑 //
/* ---------- 积分流水 ---------- */

/** 写入一条积分流水 */
export function iGM_InsertPointsRecord(params: {
  userId: string;
  points: number;
  action: string;
  description?: string | null;
  now: string;
}): iGM_PointsRecordRow {
  const row: iGM_PointsRecordRow = {
    iGM_Id: randomUUID(),
    iGM_UserId: params.userId,
    iGM_Points: params.points,
    iGM_Action: params.action,
    iGM_Description: params.description ?? null,
    iGM_CreatedAt: params.now,
  };
  iGM_Db.run(
    `INSERT INTO iGM_PointsRecords
       (iGM_Id, iGM_UserId, iGM_Points, iGM_Action, iGM_Description, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UserId,
      row.iGM_Points,
      row.iGM_Action,
      row.iGM_Description,
      row.iGM_CreatedAt,
    ],
  );
  return row;
}

/** 统计用户某动作在指定时间起点之后的记录条数（防刷分日上限用） */
export function iGM_CountRecordsSince(
  userId: string,
  action: string,
  sinceIso: string,
): number {
  const row = iGM_Db.query(
    `SELECT COUNT(*) AS total FROM iGM_PointsRecords
     WHERE iGM_UserId = ? AND iGM_Action = ? AND iGM_CreatedAt >= ?`,
  ).get(userId, action, sinceIso) as { total: number };
  return row.total;
}

/** 分页查询用户积分流水 */
export function iGM_ListRecordsByUser(
  userId: string,
  page: number,
  pageSize: number,
): { items: iGM_PointsRecordRow[]; total: number } {
  const total = (
    iGM_Db.query(
      `SELECT COUNT(*) AS total FROM iGM_PointsRecords WHERE iGM_UserId = ?`,
    ).get(userId) as { total: number }
  ).total;
  const items = iGM_Db.query(
    `SELECT * FROM iGM_PointsRecords
     WHERE iGM_UserId = ?
     ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
     LIMIT ? OFFSET ?`,
  ).all(userId, pageSize, (page - 1) * pageSize) as iGM_PointsRecordRow[];
  return { items, total };
}

/* ---------- 用户积分汇总 ---------- */

/** 读取用户积分汇总行（不存在返回 null） */
export function iGM_FindUserPoints(userId: string): iGM_UserPointsRow | null {
  return (
    (iGM_Db.query(`SELECT * FROM iGM_UserPoints WHERE iGM_UserId = ?`)
      .get(userId) as iGM_UserPointsRow | undefined) ?? null
  );
}

/** 写入或累加用户积分汇总，并更新等级 */
export function iGM_UpsertUserPoints(
  userId: string,
  delta: number,
  levelId: string | null,
  now: string,
): iGM_UserPointsRow {
  const existing = iGM_FindUserPoints(userId);
  if (!existing) {
    const row: iGM_UserPointsRow = {
      iGM_Id: randomUUID(),
      iGM_UserId: userId,
      iGM_TotalPoints: Math.max(0, delta),
      iGM_LevelId: levelId,
      iGM_UpdatedAt: now,
    };
    iGM_Db.run(
      `INSERT INTO iGM_UserPoints
         (iGM_Id, iGM_UserId, iGM_TotalPoints, iGM_LevelId, iGM_UpdatedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [row.iGM_Id, row.iGM_UserId, row.iGM_TotalPoints, row.iGM_LevelId, row.iGM_UpdatedAt],
    );
    return row;
  }

  const next = Math.max(0, existing.iGM_TotalPoints + delta);
  iGM_Db.run(
    `UPDATE iGM_UserPoints
     SET iGM_TotalPoints = ?, iGM_LevelId = ?, iGM_UpdatedAt = ?
     WHERE iGM_UserId = ?`,
    [next, levelId, now, userId],
  );
  return { ...existing, iGM_TotalPoints: next, iGM_LevelId: levelId, iGM_UpdatedAt: now };
}

/* ---------- 等级 ---------- */

/** 全部等级（按分值升序） */
export function iGM_ListLevels(): iGM_LevelRow[] {
  return iGM_Db.query(
    `SELECT * FROM iGM_Levels ORDER BY iGM_MinPoints ASC`,
  ).all() as iGM_LevelRow[];
}

/** 按总分解析等级：minPoints ≤ 总分 ≤ maxPoints（max 为空表示无上限） */
export function iGM_FindLevelByPoints(totalPoints: number): iGM_LevelRow | null {
  return (
    (iGM_Db.query(
      `SELECT * FROM iGM_Levels
       WHERE iGM_MinPoints <= ?
         AND (iGM_MaxPoints IS NULL OR iGM_MaxPoints >= ?)
       ORDER BY iGM_MinPoints DESC
       LIMIT 1`,
    ).get(totalPoints, totalPoints) as iGM_LevelRow | undefined) ?? null
  );
}

/* ---------- 勋章 ---------- */

/** 全部勋章定义 */
export function iGM_ListBadges(): iGM_BadgeRow[] {
  return iGM_Db.query(`SELECT * FROM iGM_Badges ORDER BY iGM_ConditionValue ASC`).all() as iGM_BadgeRow[];
}

/** 授予勋章（幂等：已拥有返回 false） */
export function iGM_GrantBadge(userId: string, badgeId: string, now: string): boolean {
  const exists = iGM_Db.query(
    `SELECT 1 FROM iGM_UserBadges WHERE iGM_UserId = ? AND iGM_BadgeId = ?`,
  ).get(userId, badgeId);
  if (exists) return false;
  iGM_Db.run(
    `INSERT INTO iGM_UserBadges (iGM_Id, iGM_UserId, iGM_BadgeId, iGM_GrantedAt)
     VALUES (?, ?, ?, ?)`,
    [randomUUID(), userId, badgeId, now],
  );
  return true;
}

/** 用户已获勋章行集合 */
export function iGM_ListUserBadges(userId: string): iGM_UserBadgeRow[] {
  return iGM_Db.query(
    `SELECT * FROM iGM_UserBadges WHERE iGM_UserId = ?`,
  ).all(userId) as iGM_UserBadgeRow[];
}

/* ---------- 签到 ---------- */

/** 写入签到记录 */
export function iGM_InsertCheckin(params: {
  userId: string;
  checkinDate: string;
  pointsEarned: number;
  continuousDays: number;
  now: string;
}): iGM_CheckinRow {
  const row: iGM_CheckinRow = {
    iGM_Id: randomUUID(),
    iGM_UserId: params.userId,
    iGM_CheckinDate: params.checkinDate,
    iGM_PointsEarned: params.pointsEarned,
    iGM_ContinuousDays: params.continuousDays,
    iGM_CreatedAt: params.now,
  };
  iGM_Db.run(
    `INSERT INTO iGM_Checkins
       (iGM_Id, iGM_UserId, iGM_CheckinDate, iGM_PointsEarned, iGM_ContinuousDays, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.iGM_Id, row.iGM_UserId, row.iGM_CheckinDate, row.iGM_PointsEarned, row.iGM_ContinuousDays, row.iGM_CreatedAt],
  );
  return row;
}

/** 查询用户指定自然日的签到记录 */
export function iGM_FindCheckinByDate(userId: string, date: string): iGM_CheckinRow | null {
  return (
    (iGM_Db.query(
      `SELECT * FROM iGM_Checkins WHERE iGM_UserId = ? AND iGM_CheckinDate = ?`,
    ).get(userId, date) as iGM_CheckinRow | undefined) ?? null
  );
}

/** 用户最近一条签到（连续天数计算用） */
export function iGM_FindLatestCheckin(userId: string): iGM_CheckinRow | null {
  return (
    (iGM_Db.query(
      `SELECT * FROM iGM_Checkins
       WHERE iGM_UserId = ? ORDER BY iGM_CheckinDate DESC LIMIT 1`,
    ).get(userId) as iGM_CheckinRow | undefined) ?? null
  );
}

/** 用户累计签到天数 */
export function iGM_CountCheckinDays(userId: string): number {
  const row = iGM_Db.query(
    `SELECT COUNT(*) AS total FROM iGM_Checkins WHERE iGM_UserId = ?`,
  ).get(userId) as { total: number };
  return row.total;
}

/** 用户本月签到日期列表 */
export function iGM_ListCheckinDatesOfMonth(
  userId: string,
  monthPrefix: string,
): string[] {
  const rows = iGM_Db.query(
    `SELECT iGM_CheckinDate FROM iGM_Checkins
     WHERE iGM_UserId = ? AND iGM_CheckinDate LIKE ?
     ORDER BY iGM_CheckinDate ASC`,
  ).all(userId, `${monthPrefix}%`) as Array<{ iGM_CheckinDate: string }>;
  return rows.map((row) => row.iGM_CheckinDate);
}

/* ---------- 任务 ---------- */

/** 全部任务定义（按排序号） */
export function iGM_ListTasks(): iGM_TaskRow[] {
  return iGM_Db.query(`SELECT * FROM iGM_Tasks ORDER BY iGM_SortOrder ASC`).all() as iGM_TaskRow[];
}

/** 用户全部任务进度行 */
export function iGM_ListUserTasks(userId: string): iGM_UserTaskRow[] {
  return iGM_Db.query(
    `SELECT * FROM iGM_UserTasks WHERE iGM_UserId = ?`,
  ).all(userId) as iGM_UserTaskRow[];
}

/** 读取用户某任务进度行（不存在返回 null） */
export function iGM_FindUserTask(userId: string, taskId: string): iGM_UserTaskRow | null {
  return (
    (iGM_Db.query(
      `SELECT * FROM iGM_UserTasks WHERE iGM_UserId = ? AND iGM_TaskId = ?`,
    ).get(userId, taskId) as iGM_UserTaskRow | undefined) ?? null
  );
}

/** 递增任务进度并返回最新行；已完成任务不再累加 */
export function iGM_IncrementTaskProgress(
  userId: string,
  taskId: string,
  targetCount: number,
  now: string,
): { row: iGM_UserTaskRow; justCompleted: boolean } {
  const existing = iGM_FindUserTask(userId, taskId);
  if (!existing) {
    const completed = targetCount <= 1 ? 1 : 0;
    const row: iGM_UserTaskRow = {
      iGM_Id: randomUUID(),
      iGM_UserId: userId,
      iGM_TaskId: taskId,
      iGM_Progress: 1,
      iGM_IsCompleted: completed,
      iGM_UpdatedAt: now,
    };
    iGM_Db.run(
      `INSERT INTO iGM_UserTasks
         (iGM_Id, iGM_UserId, iGM_TaskId, iGM_Progress, iGM_IsCompleted, iGM_UpdatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.iGM_Id, row.iGM_UserId, row.iGM_TaskId, row.iGM_Progress, row.iGM_IsCompleted, row.iGM_UpdatedAt],
    );
    return { row, justCompleted: completed === 1 };
  }

  if (existing.iGM_IsCompleted === 1) {
    return { row: existing, justCompleted: false };
  }

  const progress = Math.min(existing.iGM_Progress + 1, targetCount);
  const justCompleted = progress >= targetCount;
  iGM_Db.run(
    `UPDATE iGM_UserTasks
     SET iGM_Progress = ?, iGM_IsCompleted = ?, iGM_UpdatedAt = ?
     WHERE iGM_UserId = ? AND iGM_TaskId = ?`,
    [progress, justCompleted ? 1 : 0, now, userId, taskId],
  );
  return {
    row: { ...existing, iGM_Progress: progress, iGM_IsCompleted: justCompleted ? 1 : 0 },
    justCompleted,
  };
}

/* ---------- 排行榜 ---------- */

/** 排行榜行（连用户名与等级名） */
export interface iGM_LeaderboardRow {
  iGM_UserId: string;
  iGM_Username: string;
  iGM_DisplayName: string | null;
  iGM_Avatar: string | null;
  iGM_TotalPoints: number;
  iGM_LevelId: string | null;
  iGM_LevelName: string | null;
  iGM_WeeklyPoints: number;
}

/** 总分排行榜（过滤被停用用户） */
export function iGM_ListLeaderboardByTotal(limit: number): iGM_LeaderboardRow[] {
  return iGM_Db.query(
    `SELECT up.iGM_UserId, u.iGM_Username, u.iGM_DisplayName, u.iGM_Avatar,
            up.iGM_TotalPoints, up.iGM_LevelId, lv.iGM_Name AS iGM_LevelName,
            0 AS iGM_WeeklyPoints
     FROM iGM_UserPoints up
     JOIN iGM_Users u ON u.iGM_Id = up.iGM_UserId AND u.iGM_Status = 'active'
     LEFT JOIN iGM_Levels lv ON lv.iGM_Id = up.iGM_LevelId
     ORDER BY up.iGM_TotalPoints DESC
     LIMIT ?`,
  ).all(limit) as iGM_LeaderboardRow[];
}

/** 周增量排行榜：近 7 天流水求和，并入总分 */
export function iGM_ListLeaderboardByWeekly(
  sinceIso: string,
  limit: number,
): iGM_LeaderboardRow[] {
  return iGM_Db.query(
    `SELECT up.iGM_UserId, u.iGM_Username, u.iGM_DisplayName, u.iGM_Avatar,
            up.iGM_TotalPoints, up.iGM_LevelId, lv.iGM_Name AS iGM_LevelName,
            COALESCE(w.iGM_Weekly, 0) AS iGM_WeeklyPoints
     FROM iGM_UserPoints up
     JOIN iGM_Users u ON u.iGM_Id = up.iGM_UserId AND u.iGM_Status = 'active'
     LEFT JOIN iGM_Levels lv ON lv.iGM_Id = up.iGM_LevelId
     LEFT JOIN (
       SELECT iGM_UserId, SUM(iGM_Points) AS iGM_Weekly
       FROM iGM_PointsRecords
       WHERE iGM_CreatedAt >= ?
       GROUP BY iGM_UserId
     ) w ON w.iGM_UserId = up.iGM_UserId
     ORDER BY iGM_WeeklyPoints DESC, up.iGM_TotalPoints DESC
     LIMIT ?`,
  ).all(sinceIso, limit) as iGM_LeaderboardRow[];
}
