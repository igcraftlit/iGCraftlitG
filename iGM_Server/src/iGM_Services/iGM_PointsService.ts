/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_PointsService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Points
 * 模块：iGM_PointsService
 * 作用：积分、等级、勋章、签到与任务的核心业务编排
 * 内容：动作积分规则与每日上限（防刷分）、事务内发分与等级重算、
 *       任务进度与一次性奖励、勋章条件评估与幂等授予、签到与连续天数奖励、
 *       排行榜与各类查询
 * 说明：iGM_AwardPoints 为模块三/四埋点入口，内部吞掉异常，
 *       保证积分故障不影响发帖评论等主流程
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import {
  iGM_CountCheckinDays,
  iGM_CountRecordsSince,
  iGM_FindCheckinByDate,
  iGM_FindLatestCheckin,
  iGM_FindLevelByPoints,
  iGM_FindUserPoints,
  iGM_FindUserTask,
  iGM_GrantBadge,
  iGM_IncrementTaskProgress,
  iGM_InsertCheckin,
  iGM_InsertPointsRecord,
  iGM_ListBadges,
  iGM_ListCheckinDatesOfMonth,
  iGM_ListLeaderboardByTotal,
  iGM_ListLeaderboardByWeekly,
  iGM_ListLevels,
  iGM_ListRecordsByUser,
  iGM_ListTasks,
  iGM_ListUserBadges,
  iGM_ListUserTasks,
  iGM_UpsertUserPoints,
} from "../iGM_Repositories/iGM_PointsRepository";
import { iGM_FindUserById } from "../iGM_Repositories/iGM_UserRepository";
import type {
  iGM_BadgeDto,
  iGM_BadgeRow,
  iGM_CheckinResultDto,
  iGM_CheckinStatusDto,
  iGM_LeaderboardEntryDto,
  iGM_LevelDto,
  iGM_LevelRow,
  iGM_MyPointsDto,
  iGM_PointsRecordDto,
  iGM_TaskDto,
} from "../iGM_Types/iGM_Points";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_PointsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_PointsError";
  }
}

/** 积分动作规则：单次分值与每日上限（防刷分） */
interface iGM_PointActionRule {
  points: number;
  dailyCap: number;
}

/** 动作 → 规则映射：发帖/评论/被点赞/上传资源/报名活动/签到 */
const iGM_PointActions: Record<string, iGM_PointActionRule> = {
  post_create: { points: 10, dailyCap: 50 },
  comment_create: { points: 5, dailyCap: 30 },
  like_received: { points: 2, dailyCap: 50 },
  resource_upload: { points: 20, dailyCap: 60 },
  activity_join: { points: 15, dailyCap: 30 },
  checkin: { points: 5, dailyCap: 1 },
};

/** 签到基础分与连续奖励：基础 5 分，连续每多一天 +1，最多 +15 */
const iGM_CheckinBasePoints = 5;
const iGM_CheckinBonusMax = 15;

/** 任务奖励流水使用的动作名（不受每日上限约束） */
const iGM_TaskRewardAction = "task_reward";

// 核心逻辑 //
/* ---------- DTO 组装 ---------- */

function iGM_ToLevelDto(row: iGM_LevelRow): iGM_LevelDto {
  return {
    id: row.iGM_Id,
    name: row.iGM_Name,
    minPoints: row.iGM_MinPoints,
    maxPoints: row.iGM_MaxPoints,
    icon: row.iGM_Icon,
    sortOrder: row.iGM_SortOrder,
  };
}

function iGM_ToBadgeDto(row: iGM_BadgeRow, grantedAt?: string | null): iGM_BadgeDto {
  return {
    id: row.iGM_Id,
    name: row.iGM_Name,
    description: row.iGM_Description,
    icon: row.iGM_Icon,
    conditionType: row.iGM_ConditionType,
    conditionValue: row.iGM_ConditionValue,
    granted: grantedAt != null,
    grantedAt: grantedAt ?? null,
  };
}

/* ---------- 内部：任务进度与勋章评估 ---------- */

/**
 * 记录任务进度：action 对应任务进度 +1，
 * 达标且为一次性任务时发放奖励积分（流水动作 task_reward，不受日上限约束）
 */
function iGM_RecordTaskProgress(userId: string, action: string, now: string): void {
  const tasks = iGM_ListTasks().filter((task) => task.iGM_Action === action);
  for (const task of tasks) {
    const existing = iGM_FindUserTask(userId, task.iGM_Id);
    if (existing?.iGM_IsCompleted === 1) continue;

    const { justCompleted } = iGM_IncrementTaskProgress(
      userId,
      task.iGM_Id,
      task.iGM_TargetCount,
      now,
    );
    if (justCompleted && task.iGM_RewardPoints > 0) {
      iGM_InsertPointsRecord({
        userId,
        points: task.iGM_RewardPoints,
        action: iGM_TaskRewardAction,
        description: task.iGM_Name,
        now,
      });
      iGM_UpsertUserPoints(userId, task.iGM_RewardPoints, null, now);
    }
  }
}

/** 单个勋章条件的当前值统计口径 */
function iGM_MeasureCondition(
  userId: string,
  conditionType: string,
): number {
  switch (conditionType) {
    case "posts_count":
      return (
        iGM_Db.query(
          `SELECT COUNT(*) AS total FROM iGM_Posts WHERE iGM_AuthorId = ?`,
        ).get(userId) as { total: number }
      ).total;
    case "comments_count":
      return (
        iGM_Db.query(
          `SELECT COUNT(*) AS total FROM iGM_Comments WHERE iGM_AuthorId = ?`,
        ).get(userId) as { total: number }
      ).total;
    case "resources_count":
      return (
        iGM_Db.query(
          `SELECT COUNT(*) AS total FROM iGM_Resources WHERE iGM_UploaderId = ?`,
        ).get(userId) as { total: number }
      ).total;
    case "checkin_days":
      return iGM_CountCheckinDays(userId);
    case "likes_received": {
      // 帖子被赞 + 评论被赞（本人内容收到的点赞总数）
      const posts = iGM_Db.query(
        `SELECT COUNT(*) AS total FROM iGM_Likes l
         JOIN iGM_Posts p ON p.iGM_Id = l.iGM_TargetId AND l.iGM_TargetType = 'post'
         WHERE p.iGM_AuthorId = ?`,
      ).get(userId) as { total: number };
      const comments = iGM_Db.query(
        `SELECT COUNT(*) AS total FROM iGM_Likes l
         JOIN iGM_Comments c ON c.iGM_Id = l.iGM_TargetId AND l.iGM_TargetType = 'comment'
         WHERE c.iGM_AuthorId = ?`,
      ).get(userId) as { total: number };
      return posts.total + comments.total;
    }
    case "points_total":
      return iGM_FindUserPoints(userId)?.iGM_TotalPoints ?? 0;
    default:
      return 0;
  }
}

/** 评估并授予达标勋章，返回本次新获得的勋章行 */
function iGM_EvaluateBadges(userId: string, now: string): iGM_BadgeRow[] {
  const grantedRows: iGM_BadgeRow[] = [];
  const owned = new Set(
    iGM_ListUserBadges(userId).map((row) => row.iGM_BadgeId),
  );
  for (const badge of iGM_ListBadges()) {
    if (owned.has(badge.iGM_Id)) continue;
    const value = iGM_MeasureCondition(userId, badge.iGM_ConditionType);
    if (value >= badge.iGM_ConditionValue) {
      if (iGM_GrantBadge(userId, badge.iGM_Id, now)) {
        grantedRows.push(badge);
      }
    }
  }
  return grantedRows;
}

/* ---------- 发分核心 ---------- */

/**
 * 积分发放入口（供各业务服务埋点调用，永不抛异常）
 * 防刷分：同一动作当日达到上限后仅记任务进度、不再发分
 * 返回发放结果摘要；未发分时 points 为 0
 */
export function iGM_AwardPoints(
  userId: string,
  action: string,
  description?: string | null,
): { awarded: boolean; points: number; totalPoints: number } {
  try {
    const rule = iGM_PointActions[action];
    if (!rule) return { awarded: false, points: 0, totalPoints: 0 };

    const now = new Date().toISOString();
    const total = iGM_Db.transaction(() => {
      // 1. 任务进度始终记录（与积分上限无关）
      iGM_RecordTaskProgress(userId, action, now);

      // 2. 防刷分：动作当日发分次数达到上限则跳过
      const dayStart = `${iGM_TodayDate()}T00:00:00.000+08:00`;
      const usedToday = iGM_CountRecordsSince(userId, action, dayStart);
      let awarded = false;
      let points = 0;
      if (usedToday < rule.dailyCap) {
        points = rule.points;
        iGM_InsertPointsRecord({ userId, points, action, description, now });
        awarded = true;
      }

      // 3. 汇总总分并重算等级
      const row = iGM_UpsertUserPoints(userId, points, null, now);
      const level = iGM_FindLevelByPoints(row.iGM_TotalPoints);
      const finalRow =
        level && level.iGM_Id !== row.iGM_LevelId
          ? iGM_UpsertUserPoints(userId, 0, level.iGM_Id, now)
          : row;

      // 4. 勋章评估（积分总数类勋章依赖最新总分）
      iGM_EvaluateBadges(userId, now);

      return { awarded, points, totalPoints: finalRow.iGM_TotalPoints };
    })();
    return total;
  } catch (error) {
    console.error(`[iGM_PointsService] 积分发放失败：${action}`, error);
    return { awarded: false, points: 0, totalPoints: 0 };
  }
}

/** 签到动作专用发分（指定分值，绕过动作规则表） */
function iGM_AwardCheckinPoints(
  userId: string,
  points: number,
  description: string,
  now: string,
): number {
  iGM_InsertPointsRecord({ userId, points, action: "checkin", description, now });
  const row = iGM_UpsertUserPoints(userId, points, null, now);
  const level = iGM_FindLevelByPoints(row.iGM_TotalPoints);
  if (level && level.iGM_Id !== row.iGM_LevelId) {
    iGM_UpsertUserPoints(userId, 0, level.iGM_Id, now);
  }
  iGM_RecordTaskProgress(userId, "checkin", now);
  iGM_EvaluateBadges(userId, now);
  return iGM_FindUserPoints(userId)?.iGM_TotalPoints ?? points;
}

/* ---------- 日期工具 ---------- */

/** 当前 Asia/Shanghai 自然日（YYYY-MM-DD） */
function iGM_TodayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());
}

/** 计算连续签到天数：昨日有签到则 +1，否则从 1 开始 */
function iGM_NextContinuousDays(userId: string): number {
  const today = iGM_TodayDate();
  const yesterday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const latest = iGM_FindLatestCheckin(userId);
  if (latest && latest.iGM_CheckinDate === yesterday) {
    return latest.iGM_ContinuousDays + 1;
  }
  if (latest && latest.iGM_CheckinDate === today) {
    return latest.iGM_ContinuousDays;
  }
  return 1;
}

/* ---------- 查询服务 ---------- */

/** 我的积分概览：总分、当前等级与下一等级 */
export function iGM_GetMyPointsService(userId: string): iGM_MyPointsDto {
  const totalPoints = iGM_FindUserPoints(userId)?.iGM_TotalPoints ?? 0;
  const levels = iGM_ListLevels();
  const level = iGM_FindLevelByPoints(totalPoints);
  const nextLevel =
    levels.find((item) => item.iGM_MinPoints > totalPoints) ?? null;
  return {
    totalPoints,
    level: level ? iGM_ToLevelDto(level) : null,
    nextLevel: nextLevel ? iGM_ToLevelDto(nextLevel) : null,
    pointsToNext: nextLevel ? nextLevel.iGM_MinPoints - totalPoints : 0,
  };
}

/** 我的积分流水分页 */
export function iGM_ListMyRecordsService(
  userId: string,
  pageRaw?: number,
  pageSizeRaw?: number,
): { items: iGM_PointsRecordDto[]; total: number; page: number; pageSize: number; totalPages: number } {
  const page = Number.isFinite(pageRaw) && (pageRaw as number) >= 1 ? Math.floor(pageRaw as number) : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) && (pageSizeRaw as number) >= 1 && (pageSizeRaw as number) <= 50
      ? Math.floor(pageSizeRaw as number)
      : 10;
  const { items, total } = iGM_ListRecordsByUser(userId, page, pageSize);
  return {
    items: items.map((row) => ({
      id: row.iGM_Id,
      points: row.iGM_Points,
      action: row.iGM_Action,
      description: row.iGM_Description,
      createdAt: row.iGM_CreatedAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 等级规则列表 */
export function iGM_GetLevelRulesService(): iGM_LevelDto[] {
  return iGM_ListLevels().map(iGM_ToLevelDto);
}

/** 勋章列表（含我的获得状态） */
export function iGM_GetBadgesService(userId: string | null): iGM_BadgeDto[] {
  const grantedMap = new Map(
    userId
      ? iGM_ListUserBadges(userId).map((row) => [row.iGM_BadgeId, row.iGM_GrantedAt])
      : [],
  );
  return iGM_ListBadges().map((badge) =>
    iGM_ToBadgeDto(badge, grantedMap.get(badge.iGM_Id) ?? null),
  );
}

/** 任务列表与我的进度 */
export function iGM_GetTasksService(userId: string | null): iGM_TaskDto[] {
  const progressMap = new Map(
    userId
      ? iGM_ListUserTasks(userId).map((row) => [row.iGM_TaskId, row])
      : [],
  );
  return iGM_ListTasks().map((task) => {
    const progress = progressMap.get(task.iGM_Id);
    return {
      id: task.iGM_Id,
      name: task.iGM_Name,
      description: task.iGM_Description,
      action: task.iGM_Action,
      targetCount: task.iGM_TargetCount,
      rewardPoints: task.iGM_RewardPoints,
      taskType: task.iGM_TaskType,
      sortOrder: task.iGM_SortOrder,
      progress: progress?.iGM_Progress ?? 0,
      isCompleted: progress?.iGM_IsCompleted === 1,
    };
  });
}

/** 排行榜：sort=total 按总分 / sort=weekly 按周增量 */
export function iGM_GetLeaderboardService(
  sort: string,
  limitRaw?: number,
): iGM_LeaderboardEntryDto[] {
  const limit =
    Number.isFinite(limitRaw) && (limitRaw as number) >= 1 && (limitRaw as number) <= 50
      ? Math.floor(limitRaw as number)
      : 20;
  const rows =
    sort === "weekly"
      ? iGM_ListLeaderboardByWeekly(
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          limit,
        )
      : iGM_ListLeaderboardByTotal(limit);
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.iGM_UserId,
    username: row.iGM_Username,
    displayName: row.iGM_DisplayName,
    avatar: row.iGM_Avatar,
    totalPoints: row.iGM_TotalPoints,
    weeklyPoints: row.iGM_WeeklyPoints,
    levelId: row.iGM_LevelId,
    levelName: row.iGM_LevelName,
  }));
}

/* ---------- 签到 ---------- */

/** 签到状态：今日是否已签、连续天数、今日可得分数与本月签到日历 */
export function iGM_GetCheckinStatusService(userId: string): iGM_CheckinStatusDto {
  const today = iGM_TodayDate();
  const todayRow = iGM_FindCheckinByDate(userId, today);
  const latest = iGM_FindLatestCheckin(userId);
  // 未签时连续天数按「若今日不签则保持的连续数」展示：
  // 昨日有签则取昨日连续数，否则为 0
  const continuousIfNotToday =
    latest && latest.iGM_CheckinDate === today
      ? latest.iGM_ContinuousDays
      : latest && latest.iGM_CheckinDate === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(Date.now() - 24 * 60 * 60 * 1000))
        ? latest.iGM_ContinuousDays
        : 0;
  const monthPrefix = today.slice(0, 7);
  return {
    checkedToday: todayRow !== null,
    continuousDays: continuousIfNotToday,
    todayPoints:
      iGM_CheckinBasePoints +
      Math.min(continuousIfNotToday, iGM_CheckinBonusMax),
    monthDates: iGM_ListCheckinDatesOfMonth(userId, monthPrefix),
  };
}

/** 执行签到：唯一约束防重复，连续天数给额外奖励，返回签到结果与升级/新勋章 */
export function iGM_CheckinService(userId: string): iGM_CheckinResultDto {
  const user = iGM_FindUserById(userId);
  if (!user || user.iGM_Status !== "active") {
    throw new iGM_PointsError("auth.errors.unauthorized", 401);
  }
  const today = iGM_TodayDate();
  if (iGM_FindCheckinByDate(userId, today)) {
    throw new iGM_PointsError("points.errors.alreadyCheckedIn", 409);
  }

  const beforePoints = iGM_FindUserPoints(userId)?.iGM_TotalPoints ?? 0;
  const beforeLevelId = iGM_FindUserPoints(userId)?.iGM_LevelId ?? null;

  const continuousDays = iGM_NextContinuousDays(userId);
  const pointsEarned =
    iGM_CheckinBasePoints + Math.min(continuousDays - 1, iGM_CheckinBonusMax);

  const result = iGM_Db.transaction(() => {
    iGM_InsertCheckin({
      userId,
      checkinDate: today,
      pointsEarned,
      continuousDays,
      now: new Date().toISOString(),
    });
    const totalPoints = iGM_AwardCheckinPoints(
      userId,
      pointsEarned,
      `连续签到 ${continuousDays} 天`,
      new Date().toISOString(),
    );
    const level = iGM_FindLevelByPoints(totalPoints);
    // 补齐等级列（AwardCheckinPoints 内部已重算，这里读取最终行）
    const finalPoints = iGM_FindUserPoints(userId)?.iGM_TotalPoints ?? totalPoints;
    const finalLevel = iGM_FindLevelByPoints(finalPoints);
    const newBadges = iGM_EvaluateBadges(userId, new Date().toISOString());
    return { totalPoints: finalPoints, level: finalLevel ?? level, newBadges };
  })();

  return {
    checkinDate: today,
    pointsEarned,
    continuousDays,
    totalPoints: result.totalPoints,
    level: result.level ? iGM_ToLevelDto(result.level) : null,
    levelUp:
      result.level !== null &&
      beforeLevelId !== null &&
      result.level.iGM_Id !== beforeLevelId,
    newBadges: result.newBadges.map((badge) => iGM_ToBadgeDto(badge)),
  };
}
