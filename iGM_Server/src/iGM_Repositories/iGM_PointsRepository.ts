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
  iGM_LevelExamRow,
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
export async function iGM_InsertPointsRecord(params: {
  userId: string;
  points: number;
  action: string;
  description?: string | null;
  now: string;
}): Promise<iGM_PointsRecordRow> {
  const row: iGM_PointsRecordRow = {
    iGM_Id: randomUUID(),
    iGM_UserId: params.userId,
    iGM_Points: params.points,
    iGM_Action: params.action,
    iGM_Description: params.description ?? null,
    iGM_CreatedAt: params.now,
  };
  await iGM_Db.run(
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
export async function iGM_CountRecordsSince(
  userId: string,
  action: string,
  sinceIso: string,
): Promise<number> {
  const row = (await iGM_Db.query(
    `SELECT COUNT(*) AS total FROM iGM_PointsRecords
     WHERE iGM_UserId = ? AND iGM_Action = ? AND iGM_CreatedAt >= ?`,
  ).get(userId, action, sinceIso)) as { total: number };
  return row.total;
}

/** 分页查询用户积分流水 */
export async function iGM_ListRecordsByUser(
  userId: string,
  page: number,
  pageSize: number,
): Promise<{ items: iGM_PointsRecordRow[]; total: number }> {
  const total = (
    (await iGM_Db.query(
      `SELECT COUNT(*) AS total FROM iGM_PointsRecords WHERE iGM_UserId = ?`,
    ).get(userId)) as { total: number }
  ).total;
  const items = (await iGM_Db.query(
    `SELECT * FROM iGM_PointsRecords
     WHERE iGM_UserId = ?
     ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
     LIMIT ? OFFSET ?`,
  ).all(userId, pageSize, (page - 1) * pageSize)) as iGM_PointsRecordRow[];
  return { items, total };
}

/* ---------- 用户积分汇总 ---------- */

/** 读取用户积分汇总行（不存在返回 null） */
export async function iGM_FindUserPoints(userId: string): Promise<iGM_UserPointsRow | null> {
  return (
    ((await iGM_Db.query(`SELECT * FROM iGM_UserPoints WHERE iGM_UserId = ?`)
      .get(userId)) as iGM_UserPointsRow | undefined) ?? null
  );
}

/** 写入或累加用户积分汇总，并更新等级 */
export async function iGM_UpsertUserPoints(
  userId: string,
  delta: number,
  levelId: string | null,
  now: string,
): Promise<iGM_UserPointsRow> {
  const existing = await iGM_FindUserPoints(userId);
  if (!existing) {
    const row: iGM_UserPointsRow = {
      iGM_Id: randomUUID(),
      iGM_UserId: userId,
      iGM_TotalPoints: Math.max(0, delta),
      iGM_LevelId: levelId,
      iGM_UpdatedAt: now,
    };
    await iGM_Db.run(
      `INSERT INTO iGM_UserPoints
         (iGM_Id, iGM_UserId, iGM_TotalPoints, iGM_LevelId, iGM_UpdatedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [row.iGM_Id, row.iGM_UserId, row.iGM_TotalPoints, row.iGM_LevelId, row.iGM_UpdatedAt],
    );
    return row;
  }

  const next = Math.max(0, existing.iGM_TotalPoints + delta);
  await iGM_Db.run(
    `UPDATE iGM_UserPoints
     SET iGM_TotalPoints = ?, iGM_LevelId = ?, iGM_UpdatedAt = ?
     WHERE iGM_UserId = ?`,
    [next, levelId, now, userId],
  );
  return { ...existing, iGM_TotalPoints: next, iGM_LevelId: levelId, iGM_UpdatedAt: now };
}

/* ---------- 等级 ---------- */

/** 全部等级（按分值升序） */
export async function iGM_ListLevels(): Promise<iGM_LevelRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_Levels ORDER BY iGM_MinPoints ASC`,
  ).all()) as iGM_LevelRow[];
}

/** 按总分解析等级：minPoints ≤ 总分 ≤ maxPoints（max 为空表示无上限） */
export async function iGM_FindLevelByPoints(totalPoints: number): Promise<iGM_LevelRow | null> {
  return (
    ((await iGM_Db.query(
      `SELECT * FROM iGM_Levels
       WHERE iGM_MinPoints <= ?
         AND (iGM_MaxPoints IS NULL OR iGM_MaxPoints >= ?)
       ORDER BY iGM_MinPoints DESC
       LIMIT 1`,
    ).get(totalPoints, totalPoints)) as iGM_LevelRow | undefined) ?? null
  );
}

/* ---------- 勋章 ---------- */

/** 全部勋章定义（按稀有度普通→稀有→传说、再按条件值升序） */
export async function iGM_ListBadges(): Promise<iGM_BadgeRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_Badges
     ORDER BY CASE iGM_Rarity WHEN 'common' THEN 0 WHEN 'rare' THEN 1 ELSE 2 END ASC,
              iGM_ConditionValue ASC`,
  ).all()) as iGM_BadgeRow[];
}

/** 授予勋章（幂等：已拥有返回 false） */
export async function iGM_GrantBadge(userId: string, badgeId: string, now: string): Promise<boolean> {
  const exists = await iGM_Db.query(
    `SELECT 1 FROM iGM_UserBadges WHERE iGM_UserId = ? AND iGM_BadgeId = ?`,
  ).get(userId, badgeId);
  if (exists) return false;
  await iGM_Db.run(
    `INSERT INTO iGM_UserBadges (iGM_Id, iGM_UserId, iGM_BadgeId, iGM_GrantedAt)
     VALUES (?, ?, ?, ?)`,
    [randomUUID(), userId, badgeId, now],
  );
  return true;
}

/** 用户已获勋章行集合 */
export async function iGM_ListUserBadges(userId: string): Promise<iGM_UserBadgeRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_UserBadges WHERE iGM_UserId = ?`,
  ).all(userId)) as iGM_UserBadgeRow[];
}

/* ---------- 签到 ---------- */

/** 写入签到记录 */
export async function iGM_InsertCheckin(params: {
  userId: string;
  checkinDate: string;
  pointsEarned: number;
  continuousDays: number;
  now: string;
}): Promise<iGM_CheckinRow> {
  const row: iGM_CheckinRow = {
    iGM_Id: randomUUID(),
    iGM_UserId: params.userId,
    iGM_CheckinDate: params.checkinDate,
    iGM_PointsEarned: params.pointsEarned,
    iGM_ContinuousDays: params.continuousDays,
    iGM_CreatedAt: params.now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_Checkins
       (iGM_Id, iGM_UserId, iGM_CheckinDate, iGM_PointsEarned, iGM_ContinuousDays, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.iGM_Id, row.iGM_UserId, row.iGM_CheckinDate, row.iGM_PointsEarned, row.iGM_ContinuousDays, row.iGM_CreatedAt],
  );
  return row;
}

/** 查询用户指定自然日的签到记录 */
export async function iGM_FindCheckinByDate(userId: string, date: string): Promise<iGM_CheckinRow | null> {
  return (
    ((await iGM_Db.query(
      `SELECT * FROM iGM_Checkins WHERE iGM_UserId = ? AND iGM_CheckinDate = ?`,
    ).get(userId, date)) as iGM_CheckinRow | undefined) ?? null
  );
}

/** 用户最近一条签到（连续天数计算用） */
export async function iGM_FindLatestCheckin(userId: string): Promise<iGM_CheckinRow | null> {
  return (
    ((await iGM_Db.query(
      `SELECT * FROM iGM_Checkins
       WHERE iGM_UserId = ? ORDER BY iGM_CheckinDate DESC LIMIT 1`,
    ).get(userId)) as iGM_CheckinRow | undefined) ?? null
  );
}

/** 用户累计签到天数 */
export async function iGM_CountCheckinDays(userId: string): Promise<number> {
  const row = (await iGM_Db.query(
    `SELECT COUNT(*) AS total FROM iGM_Checkins WHERE iGM_UserId = ?`,
  ).get(userId)) as { total: number };
  return row.total;
}

/** 用户本月签到日期列表 */
export async function iGM_ListCheckinDatesOfMonth(
  userId: string,
  monthPrefix: string,
): Promise<string[]> {
  const rows = (await iGM_Db.query(
    `SELECT iGM_CheckinDate FROM iGM_Checkins
     WHERE iGM_UserId = ? AND iGM_CheckinDate LIKE ?
     ORDER BY iGM_CheckinDate ASC`,
  ).all(userId, `${monthPrefix}%`)) as Array<{ iGM_CheckinDate: string }>;
  return rows.map((row) => row.iGM_CheckinDate);
}

/* ---------- 任务 ---------- */

/** 全部任务定义（按排序号） */
export async function iGM_ListTasks(): Promise<iGM_TaskRow[]> {
  return (await iGM_Db.query(`SELECT * FROM iGM_Tasks ORDER BY iGM_SortOrder ASC`).all()) as iGM_TaskRow[];
}

/** 用户全部任务进度行 */
export async function iGM_ListUserTasks(userId: string): Promise<iGM_UserTaskRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_UserTasks WHERE iGM_UserId = ?`,
  ).all(userId)) as iGM_UserTaskRow[];
}

/** 读取用户某任务进度行（不存在返回 null） */
export async function iGM_FindUserTask(userId: string, taskId: string): Promise<iGM_UserTaskRow | null> {
  return (
    ((await iGM_Db.query(
      `SELECT * FROM iGM_UserTasks WHERE iGM_UserId = ? AND iGM_TaskId = ?`,
    ).get(userId, taskId)) as iGM_UserTaskRow | undefined) ?? null
  );
}

/** 递增任务进度并返回最新行；已完成任务不再累加，周期变更时自动重置 */
export async function iGM_IncrementTaskProgress(params: {
  userId: string;
  taskId: string;
  targetCount: number;
  /** 当前周期键（周 / 季）；与行内不一致时视为新周期并重置进度 */
  cycleKey: string;
  now: string;
}): Promise<{ row: iGM_UserTaskRow; justCompleted: boolean }> {
  const { userId, taskId, targetCount, cycleKey, now } = params;
  const existing = await iGM_FindUserTask(userId, taskId);
  const completed = targetCount <= 1 ? 1 : 0;

  if (!existing) {
    const row: iGM_UserTaskRow = {
      iGM_Id: randomUUID(),
      iGM_UserId: userId,
      iGM_TaskId: taskId,
      iGM_Progress: 1,
      iGM_IsCompleted: completed,
      iGM_UpdatedAt: now,
      iGM_IsClaimed: 0,
      iGM_CycleKey: cycleKey,
    };
    await iGM_Db.run(
      `INSERT INTO iGM_UserTasks
         (iGM_Id, iGM_UserId, iGM_TaskId, iGM_Progress, iGM_IsCompleted,
          iGM_UpdatedAt, iGM_IsClaimed, iGM_CycleKey)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.iGM_Id,
        row.iGM_UserId,
        row.iGM_TaskId,
        row.iGM_Progress,
        row.iGM_IsCompleted,
        row.iGM_UpdatedAt,
        row.iGM_IsClaimed,
        row.iGM_CycleKey,
      ],
    );
    return { row, justCompleted: completed === 1 };
  }

  // 周期变更：重置进度与领取状态，开始新一周 / 新一季
  if (existing.iGM_CycleKey !== cycleKey) {
    await iGM_Db.run(
      `UPDATE iGM_UserTasks
       SET iGM_Progress = 1, iGM_IsCompleted = ?, iGM_IsClaimed = 0,
           iGM_CycleKey = ?, iGM_UpdatedAt = ?
       WHERE iGM_UserId = ? AND iGM_TaskId = ?`,
      [completed, cycleKey, now, userId, taskId],
    );
    return {
      row: {
        ...existing,
        iGM_Progress: 1,
        iGM_IsCompleted: completed,
        iGM_IsClaimed: 0,
        iGM_CycleKey: cycleKey,
        iGM_UpdatedAt: now,
      },
      justCompleted: completed === 1,
    };
  }

  if (existing.iGM_IsCompleted === 1) {
    return { row: existing, justCompleted: false };
  }

  const progress = Math.min(existing.iGM_Progress + 1, targetCount);
  const justCompleted = progress >= targetCount;
  await iGM_Db.run(
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

/** 标记任务奖励已领取（仅当前周期内有效） */
export async function iGM_MarkTaskClaimed(
  userId: string,
  taskId: string,
  now: string,
): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_UserTasks
     SET iGM_IsClaimed = 1, iGM_UpdatedAt = ?
     WHERE iGM_UserId = ? AND iGM_TaskId = ? AND iGM_IsCompleted = 1`,
    [now, userId, taskId],
  );
  return result.changes > 0;
}

/** 统计用户当前周期内已完成的任务数（勋章条件：季度任务用） */
export async function iGM_CountCompletedTasksByType(
  userId: string,
  taskType: string,
): Promise<number> {
  const row = (await iGM_Db.query(
    `SELECT COUNT(*) AS total FROM iGM_UserTasks ut
     JOIN iGM_Tasks t ON t.iGM_Id = ut.iGM_TaskId
     WHERE ut.iGM_UserId = ? AND ut.iGM_IsCompleted = 1 AND t.iGM_TaskType = ?`,
  ).get(userId, taskType)) as { total: number };
  return row.total;
}

/* ---------- 等级考核 ---------- */

/** 写入一条等级考核申请 */
export async function iGM_InsertLevelExam(params: {
  userId: string;
  levelId: string;
  content: string | null;
  now: string;
}): Promise<iGM_LevelExamRow> {
  const row: iGM_LevelExamRow = {
    iGM_Id: randomUUID(),
    iGM_UserId: params.userId,
    iGM_LevelId: params.levelId,
    iGM_Content: params.content,
    iGM_Status: "pending",
    iGM_ReviewerId: null,
    iGM_ReviewNote: null,
    iGM_CreatedAt: params.now,
    iGM_UpdatedAt: params.now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_LevelExams
       (iGM_Id, iGM_UserId, iGM_LevelId, iGM_Content, iGM_Status,
        iGM_ReviewerId, iGM_ReviewNote, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UserId,
      row.iGM_LevelId,
      row.iGM_Content,
      row.iGM_Status,
      row.iGM_ReviewerId,
      row.iGM_ReviewNote,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 用户对指定等级最近一条考核记录 */
export async function iGM_FindLatestExamByLevel(
  userId: string,
  levelId: string,
): Promise<iGM_LevelExamRow | null> {
  return (
    ((await iGM_Db.query(
      `SELECT * FROM iGM_LevelExams
       WHERE iGM_UserId = ? AND iGM_LevelId = ?
       ORDER BY iGM_CreatedAt DESC LIMIT 1`,
    ).get(userId, levelId)) as iGM_LevelExamRow | undefined) ?? null
  );
}

/** 用户全部考核记录（按时间倒序） */
export async function iGM_ListExamsByUser(userId: string): Promise<iGM_LevelExamRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_LevelExams WHERE iGM_UserId = ? ORDER BY iGM_CreatedAt DESC`,
  ).all(userId)) as iGM_LevelExamRow[];
}

/** 用户已通过考核的等级 ID 集合（等级解析时校验考核门槛） */
export async function iGM_ListPassedExamLevelIds(userId: string): Promise<string[]> {
  const rows = (await iGM_Db.query(
    `SELECT DISTINCT iGM_LevelId FROM iGM_LevelExams
     WHERE iGM_UserId = ? AND iGM_Status = 'approved'`,
  ).all(userId)) as Array<{ iGM_LevelId: string }>;
  return rows.map((row) => row.iGM_LevelId);
}

/** 统计用户通过的考核次数（勋章条件：考核通过） */
export async function iGM_CountPassedExams(userId: string): Promise<number> {
  const row = (await iGM_Db.query(
    `SELECT COUNT(*) AS total FROM iGM_LevelExams
     WHERE iGM_UserId = ? AND iGM_Status = 'approved'`,
  ).get(userId)) as { total: number };
  return row.total;
}

/** 考核管理列表行（连用户名与等级名，供管理后台审核） */
export interface iGM_LevelExamAdminRow extends iGM_LevelExamRow {
  iGM_Username: string;
  iGM_DisplayName: string | null;
  iGM_LevelName: string | null;
}

/** 按主键读取一条考核记录 */
export async function iGM_FindExamById(examId: string): Promise<iGM_LevelExamRow | null> {
  return (
    ((await iGM_Db.query(`SELECT * FROM iGM_LevelExams WHERE iGM_Id = ?`)
      .get(examId)) as iGM_LevelExamRow | undefined) ?? null
  );
}

/** 管理端分页查询考核记录（可按状态筛选） */
export async function iGM_ListExamsForAdmin(params: {
  status: string | null;
  limit: number;
  offset: number;
}): Promise<{ items: iGM_LevelExamAdminRow[]; total: number }> {
  const where = params.status ? `WHERE e.iGM_Status = ?` : "";
  const args: Array<string | number> = params.status ? [params.status] : [];
  const total = (
    (await iGM_Db.query(
      `SELECT COUNT(*) AS total FROM iGM_LevelExams e ${where}`,
    ).get(...args)) as { total: number }
  ).total;
  const items = (await iGM_Db.query(
    `SELECT e.*, u.iGM_Username, u.iGM_DisplayName, l.iGM_Name AS iGM_LevelName
     FROM iGM_LevelExams e
     JOIN iGM_Users u ON u.iGM_Id = e.iGM_UserId
     LEFT JOIN iGM_Levels l ON l.iGM_Id = e.iGM_LevelId
     ${where}
     ORDER BY e.iGM_CreatedAt DESC
     LIMIT ? OFFSET ?`,
  ).all(...args, params.limit, params.offset)) as iGM_LevelExamAdminRow[];
  return { items, total };
}

/** 审核考核申请：更新状态、审核人与审核意见 */
export async function iGM_ReviewExam(params: {
  examId: string;
  status: string;
  reviewerId: string;
  note: string | null;
  now: string;
}): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_LevelExams
     SET iGM_Status = ?, iGM_ReviewerId = ?, iGM_ReviewNote = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ? AND iGM_Status = 'pending'`,
    [params.status, params.reviewerId, params.note, params.now, params.examId],
  );
  return result.changes > 0;
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
export async function iGM_ListLeaderboardByTotal(limit: number): Promise<iGM_LeaderboardRow[]> {
  return (await iGM_Db.query(
    `SELECT up.iGM_UserId, u.iGM_Username, u.iGM_DisplayName, u.iGM_Avatar,
            up.iGM_TotalPoints, up.iGM_LevelId, lv.iGM_Name AS iGM_LevelName,
            0 AS iGM_WeeklyPoints
     FROM iGM_UserPoints up
     JOIN iGM_Users u ON u.iGM_Id = up.iGM_UserId AND u.iGM_Status = 'active'
     LEFT JOIN iGM_Levels lv ON lv.iGM_Id = up.iGM_LevelId
     ORDER BY up.iGM_TotalPoints DESC
     LIMIT ?`,
  ).all(limit)) as iGM_LeaderboardRow[];
}

/** 周增量排行榜：近 7 天流水求和，并入总分 */
export async function iGM_ListLeaderboardByWeekly(
  sinceIso: string,
  limit: number,
): Promise<iGM_LeaderboardRow[]> {
  return (await iGM_Db.query(
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
  ).all(sinceIso, limit)) as iGM_LeaderboardRow[];
}
