/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_PointsService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Points
 * 模块：iGM_PointsService
 * 作用：积分、等级、勋章、签到与任务的核心业务编排
 * 内容：动作积分规则与每日上限（防刷分）、事务内发分与等级重算、
 *       每周 / 每季任务进度与奖励领取、勋章条件评估与幂等授予、
 *       等级考核申请与审核、签到与连续天数奖励、排行榜与各类查询
 * 说明：iGM_AwardPoints 为模块三/四埋点入口，内部吞掉异常，
 *       保证积分故障不影响发帖评论等主流程；
 *       模块十五起普通发帖 / 评论 / 点赞不再发分，仅推进任务进度，
 *       第 8/9/10 级需考核通过方可生效，传说勋章仅管理员人工授予
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import {
  iGM_CountCheckinDays,
  iGM_CountCompletedTasksByType,
  iGM_CountPassedExams,
  iGM_CountRecordsSince,
  iGM_FindCheckinByDate,
  iGM_FindExamById,
  iGM_FindLatestCheckin,
  iGM_FindLatestExamByLevel,
  iGM_FindUserPoints,
  iGM_FindUserTask,
  iGM_GrantBadge,
  iGM_IncrementTaskProgress,
  iGM_InsertCheckin,
  iGM_InsertLevelExam,
  iGM_InsertPointsRecord,
  iGM_ListBadges,
  iGM_ListCheckinDatesOfMonth,
  iGM_ListExamsByUser,
  iGM_ListExamsForAdmin,
  iGM_ListLeaderboardByTotal,
  iGM_ListLeaderboardByWeekly,
  iGM_ListLevels,
  iGM_ListPassedExamLevelIds,
  iGM_ListRecordsByUser,
  iGM_ListTasks,
  iGM_ListUserBadges,
  iGM_ListUserTasks,
  iGM_MarkTaskClaimed,
  iGM_ReviewExam,
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
  iGM_LevelExamDto,
  iGM_LevelExamRow,
  iGM_LevelProgressDto,
  iGM_LevelRow,
  iGM_MyPointsDto,
  iGM_PointsRecordDto,
  iGM_TaskClaimResultDto,
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

/**
 * 动作 → 规则映射（模块十五调整：普通发帖、评论、被点赞不再发放积分，
 * 仅保留资源上传、活动报名与签到；任务进度与发分解耦）
 */
const iGM_PointActions: Record<string, iGM_PointActionRule> = {
  resource_upload: { points: 20, dailyCap: 60 },
  activity_join: { points: 15, dailyCap: 30 },
  checkin: { points: 5, dailyCap: 1 },
};

/** 签到基础分与连续奖励：基础 5 分，连续每多一天 +1，最多 +15 */
const iGM_CheckinBasePoints = 5;
const iGM_CheckinBonusMax = 15;

/** 任务奖励流水使用的动作名（不受每日上限约束） */
const iGM_TaskRewardAction = "task_reward";

/** 传说勋章稀有度标记：仅管理员人工授予，系统评估时跳过 */
const iGM_LegendaryRarity = "legendary";
/** 人工授予条件类型：系统评估时跳过 */
const iGM_ManualCondition = "manual";

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
    isExamRequired: row.iGM_IsExamRequired === 1,
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
    rarity: row.iGM_Rarity,
    granted: grantedAt != null,
    grantedAt: grantedAt ?? null,
  };
}

function iGM_ToExamDto(
  row: iGM_LevelExamRow,
  levelName: string | null,
): iGM_LevelExamDto {
  return {
    id: row.iGM_Id,
    levelId: row.iGM_LevelId,
    levelName,
    status: row.iGM_Status,
    content: row.iGM_Content,
    reviewNote: row.iGM_ReviewNote,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/* ---------- 周期与等级解析 ---------- */

/** 读取 Asia/Shanghai 时区的年 / 月 / 日 */
function iGM_ShanghaiDateParts(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

/** 计算 ISO 周序号（周一为一周起点） */
function iGM_IsoWeek(year: number, month: number, day: number): number {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * 任务周期键：
 * - 每周任务：W:<年>-W<周序号>（每周一 00:00 切换）
 * - 每季任务：S:<年>-Q<季度>（每季度首日 00:00 切换）
 */
function iGM_TaskCycleKey(taskType: string): string {
  const { year, month, day } = iGM_ShanghaiDateParts();
  if (taskType === "seasonal") {
    return `S:${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  }
  return `W:${year}-W${String(iGM_IsoWeek(year, month, day)).padStart(2, "0")}`;
}

/**
 * 解析用户当前生效等级：按积分升序累进，
 * 遇到需考核但未通过的等级即停止（模块十五考核门槛）
 */
function iGM_ResolveLevel(userId: string, totalPoints: number): iGM_LevelRow | null {
  const passed = new Set(iGM_ListPassedExamLevelIds(userId));
  let resolved: iGM_LevelRow | null = null;
  for (const level of iGM_ListLevels()) {
    if (level.iGM_MinPoints > totalPoints) break;
    if (level.iGM_IsExamRequired === 1 && !passed.has(level.iGM_Id)) break;
    resolved = level;
  }
  return resolved;
}

/* ---------- 内部：任务进度与勋章评估 ---------- */

/**
 * 记录任务进度：action 命中任务 +1（按周 / 季周期键自动重置）。
 * 模块十五起进度与奖励解耦，达标后由用户主动领取奖励
 */
function iGM_RecordTaskProgress(userId: string, action: string, now: string): void {
  const tasks = iGM_ListTasks().filter((task) => task.iGM_Action === action);
  for (const task of tasks) {
    iGM_IncrementTaskProgress({
      userId,
      taskId: task.iGM_Id,
      targetCount: task.iGM_TargetCount,
      cycleKey: iGM_TaskCycleKey(task.iGM_TaskType),
      now,
    });
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
    case "seasonal_tasks":
      return iGM_CountCompletedTasksByType(userId, "seasonal");
    case "exams_passed":
      return iGM_CountPassedExams(userId);
    default:
      return 0;
  }
}

/** 评估并授予达标勋章，返回本次新获得的勋章行（传说 / 人工授予勋章跳过） */
function iGM_EvaluateBadges(userId: string, now: string): iGM_BadgeRow[] {
  const grantedRows: iGM_BadgeRow[] = [];
  const owned = new Set(
    iGM_ListUserBadges(userId).map((row) => row.iGM_BadgeId),
  );
  for (const badge of iGM_ListBadges()) {
    if (owned.has(badge.iGM_Id)) continue;
    // 传说勋章与人工授予条件：系统不自动发放，仅管理员手动授予
    if (
      badge.iGM_Rarity === iGM_LegendaryRarity ||
      badge.iGM_ConditionType === iGM_ManualCondition
    ) {
      continue;
    }
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
    const now = new Date().toISOString();
    const total = iGM_Db.transaction(() => {
      // 1. 任务进度始终记录（模块十五：无积分动作同样推进任务进度）
      iGM_RecordTaskProgress(userId, action, now);

      // 2. 无对应发分规则的动作（发帖 / 评论 / 点赞）仅推进任务，不发分
      let awarded = false;
      let points = 0;
      if (rule) {
        const dayStart = `${iGM_TodayDate()}T00:00:00.000+08:00`;
        const usedToday = iGM_CountRecordsSince(userId, action, dayStart);
        if (usedToday < rule.dailyCap) {
          points = rule.points;
          iGM_InsertPointsRecord({ userId, points, action, description, now });
          awarded = true;
        }
      }

      // 3. 汇总总分并重算等级（第 8/9/10 级需考核通过方可生效）
      const row = iGM_UpsertUserPoints(userId, points, null, now);
      const level = iGM_ResolveLevel(userId, row.iGM_TotalPoints);
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
  const level = iGM_ResolveLevel(userId, row.iGM_TotalPoints);
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
  const level = iGM_ResolveLevel(userId, totalPoints);
  // 下一等级取当前生效等级的下一档（考核未通过的等级仍作为目标展示）
  const nextLevel = level
    ? levels.find((item) => item.iGM_SortOrder > level.iGM_SortOrder) ?? null
    : levels[0] ?? null;
  return {
    totalPoints,
    level: level ? iGM_ToLevelDto(level) : null,
    nextLevel: nextLevel ? iGM_ToLevelDto(nextLevel) : null,
    pointsToNext: nextLevel
      ? Math.max(0, nextLevel.iGM_MinPoints - totalPoints)
      : 0,
  };
}

/* ---------- 等级考核 ---------- */

/** 升级进度：积分、目标等级、考核状态与是否可升级 */
export function iGM_GetLevelProgressService(userId: string): iGM_LevelProgressDto {
  const totalPoints = iGM_FindUserPoints(userId)?.iGM_TotalPoints ?? 0;
  const levels = iGM_ListLevels();
  const level = iGM_ResolveLevel(userId, totalPoints);
  const nextLevel = level
    ? levels.find((item) => item.iGM_SortOrder > level.iGM_SortOrder) ?? null
    : levels[0] ?? null;

  if (!nextLevel) {
    return {
      totalPoints,
      level: level ? iGM_ToLevelDto(level) : null,
      nextLevel: null,
      pointsToNext: 0,
      pointsReached: true,
      nextLevelExamRequired: false,
      examStatus: "none",
      canLevelUp: true,
    };
  }

  const pointsReached = totalPoints >= nextLevel.iGM_MinPoints;
  const examRequired = nextLevel.iGM_IsExamRequired === 1;
  const exam = examRequired
    ? iGM_FindLatestExamByLevel(userId, nextLevel.iGM_Id)
    : null;
  const examStatus = exam ? exam.iGM_Status : "none";
  return {
    totalPoints,
    level: level ? iGM_ToLevelDto(level) : null,
    nextLevel: iGM_ToLevelDto(nextLevel),
    pointsToNext: Math.max(0, nextLevel.iGM_MinPoints - totalPoints),
    pointsReached,
    nextLevelExamRequired: examRequired,
    examStatus,
    canLevelUp: pointsReached && (!examRequired || examStatus === "approved"),
  };
}

/** 我的考核记录（含等级名） */
export function iGM_GetMyExamsService(userId: string): iGM_LevelExamDto[] {
  const nameMap = new Map(iGM_ListLevels().map((row) => [row.iGM_Id, row.iGM_Name]));
  return iGM_ListExamsByUser(userId).map((row) =>
    iGM_ToExamDto(row, nameMap.get(row.iGM_LevelId) ?? null),
  );
}

/**
 * 提交等级考核申请：仅需考核且积分已达标的等级可申请，
 * 已有待审核申请时不可重复提交（未通过可再次申请）
 */
export function iGM_SubmitLevelExamService(
  userId: string,
  levelId: string,
  content: string | null,
): iGM_LevelExamDto {
  const user = iGM_FindUserById(userId);
  if (!user || user.iGM_Status !== "active") {
    throw new iGM_PointsError("auth.errors.unauthorized", 401);
  }
  const level = iGM_ListLevels().find((item) => item.iGM_Id === levelId);
  if (!level) {
    throw new iGM_PointsError("levels.errors.levelNotFound", 404);
  }
  if (level.iGM_IsExamRequired !== 1) {
    throw new iGM_PointsError("levels.errors.examNotRequired", 409);
  }
  const totalPoints = iGM_FindUserPoints(userId)?.iGM_TotalPoints ?? 0;
  if (totalPoints < level.iGM_MinPoints) {
    throw new iGM_PointsError("levels.errors.pointsNotReached", 409);
  }
  const latest = iGM_FindLatestExamByLevel(userId, levelId);
  if (latest && latest.iGM_Status === "pending") {
    throw new iGM_PointsError("levels.errors.examPending", 409);
  }
  if (latest && latest.iGM_Status === "approved") {
    throw new iGM_PointsError("levels.errors.examApproved", 409);
  }

  const row = iGM_InsertLevelExam({
    userId,
    levelId,
    content,
    now: new Date().toISOString(),
  });
  return iGM_ToExamDto(row, level.iGM_Name);
}

/** 管理端：分页查询等级考核申请 */
export function iGM_AdminListExamsService(
  status: string | null,
  pageRaw?: number,
  pageSizeRaw?: number,
): {
  items: Array<iGM_LevelExamDto & { userId: string; username: string; displayName: string | null }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const page = Number.isFinite(pageRaw) && (pageRaw as number) >= 1 ? Math.floor(pageRaw as number) : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) && (pageSizeRaw as number) >= 1 && (pageSizeRaw as number) <= 50
      ? Math.floor(pageSizeRaw as number)
      : 10;
  const { items, total } = iGM_ListExamsForAdmin({
    status: status && status.length > 0 ? status : null,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return {
    items: items.map((row) => ({
      ...iGM_ToExamDto(row, row.iGM_LevelName),
      userId: row.iGM_UserId,
      username: row.iGM_Username,
      displayName: row.iGM_DisplayName,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * 管理端：审核等级考核申请。
 * 通过时推进「季度考核」任务进度、重新评估勋章并按考核门槛重算等级
 */
export function iGM_ReviewExamService(
  reviewerId: string,
  examId: string,
  action: "approve" | "reject",
  note: string | null,
): void {
  const exam = iGM_FindExamById(examId);
  if (!exam) {
    throw new iGM_PointsError("levels.errors.examNotFound", 404);
  }
  if (exam.iGM_Status !== "pending") {
    throw new iGM_PointsError("levels.errors.examReviewed", 409);
  }
  const now = new Date().toISOString();
  const ok = iGM_ReviewExam({
    examId,
    status: action === "approve" ? "approved" : "rejected",
    reviewerId,
    note,
    now,
  });
  if (!ok) {
    throw new iGM_PointsError("levels.errors.examReviewed", 409);
  }
  if (action !== "approve") return;

  const userId = exam.iGM_UserId;
  const totalPoints = iGM_FindUserPoints(userId)?.iGM_TotalPoints ?? 0;
  iGM_RecordTaskProgress(userId, "exam_pass", now);
  iGM_EvaluateBadges(userId, now);
  const level = iGM_ResolveLevel(userId, totalPoints);
  iGM_UpsertUserPoints(userId, 0, level?.iGM_Id ?? null, now);
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

/** 勋章列表（含我的获得状态；rarity 可选按稀有度筛选） */
export function iGM_GetBadgesService(
  userId: string | null,
  rarity?: string | null,
): iGM_BadgeDto[] {
  const grantedMap = new Map(
    userId
      ? iGM_ListUserBadges(userId).map((row) => [row.iGM_BadgeId, row.iGM_GrantedAt])
      : [],
  );
  const rows = iGM_ListBadges();
  const filtered =
    rarity && rarity.length > 0
      ? rows.filter((badge) => badge.iGM_Rarity === rarity)
      : rows;
  return filtered.map((badge) =>
    iGM_ToBadgeDto(badge, grantedMap.get(badge.iGM_Id) ?? null),
  );
}

/** 任务列表与我的进度（含赛季与领取状态，按每周 / 每季分组展示） */
export function iGM_GetTasksService(userId: string | null): iGM_TaskDto[] {
  const progressMap = new Map(
    userId
      ? iGM_ListUserTasks(userId).map((row) => [row.iGM_TaskId, row])
      : [],
  );
  return iGM_ListTasks().map((task) => {
    const progress = progressMap.get(task.iGM_Id);
    // 周期变更后旧进度视为失效（展示为未开始）
    const cycleKey = iGM_TaskCycleKey(task.iGM_TaskType);
    const valid = progress?.iGM_CycleKey === cycleKey;
    return {
      id: task.iGM_Id,
      name: task.iGM_Name,
      description: task.iGM_Description,
      action: task.iGM_Action,
      targetCount: task.iGM_TargetCount,
      rewardPoints: task.iGM_RewardPoints,
      taskType: task.iGM_TaskType,
      // 每季任务落库为通配 "*"，对外返回当前赛季标识（如 2026-Q3）；每周任务为 null
      seasonId: task.iGM_SeasonId ? cycleKey.replace(/^S:/, "") : null,
      sortOrder: task.iGM_SortOrder,
      progress: valid ? progress?.iGM_Progress ?? 0 : 0,
      isCompleted: valid && progress?.iGM_IsCompleted === 1,
      isClaimed: valid && progress?.iGM_IsClaimed === 1,
    };
  });
}

/**
 * 领取任务奖励：仅当前周期内已完成且未领取的任务可领取；
 * 发分后重算等级并评估勋章（传说勋章不自动发放）
 */
export function iGM_ClaimTaskRewardService(
  userId: string,
  taskId: string,
): iGM_TaskClaimResultDto {
  const user = iGM_FindUserById(userId);
  if (!user || user.iGM_Status !== "active") {
    throw new iGM_PointsError("auth.errors.unauthorized", 401);
  }
  const task = iGM_ListTasks().find((item) => item.iGM_Id === taskId);
  if (!task) {
    throw new iGM_PointsError("tasks.errors.taskNotFound", 404);
  }
  const progress = iGM_FindUserTask(userId, taskId);
  const cycleKey = iGM_TaskCycleKey(task.iGM_TaskType);
  if (
    !progress ||
    progress.iGM_CycleKey !== cycleKey ||
    progress.iGM_IsCompleted !== 1
  ) {
    throw new iGM_PointsError("tasks.errors.notCompleted", 409);
  }
  if (progress.iGM_IsClaimed === 1) {
    throw new iGM_PointsError("tasks.errors.alreadyClaimed", 409);
  }

  const beforeLevelId = iGM_FindUserPoints(userId)?.iGM_LevelId ?? null;
  const now = new Date().toISOString();

  return iGM_Db.transaction(() => {
    iGM_MarkTaskClaimed(userId, taskId, now);
    if (task.iGM_RewardPoints > 0) {
      iGM_InsertPointsRecord({
        userId,
        points: task.iGM_RewardPoints,
        action: iGM_TaskRewardAction,
        description: task.iGM_Name,
        now,
      });
    }
    const row = iGM_UpsertUserPoints(userId, task.iGM_RewardPoints, null, now);
    const level = iGM_ResolveLevel(userId, row.iGM_TotalPoints);
    const finalRow =
      level && level.iGM_Id !== row.iGM_LevelId
        ? iGM_UpsertUserPoints(userId, 0, level.iGM_Id, now)
        : row;

    // 任务奖励同样可能触发「季度之光」等勋章，传说勋章由管理员人工授予
    const newBadges = iGM_EvaluateBadges(userId, now);

    return {
      taskId,
      pointsEarned: task.iGM_RewardPoints,
      totalPoints: finalRow.iGM_TotalPoints,
      level: level ? iGM_ToLevelDto(level) : null,
      levelUp:
        level !== null &&
        beforeLevelId !== null &&
        level.iGM_Id !== beforeLevelId,
      newBadges: newBadges.map((badge) => iGM_ToBadgeDto(badge)),
    };
  })();
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
    const finalPoints = iGM_FindUserPoints(userId)?.iGM_TotalPoints ?? totalPoints;
    const finalLevel = iGM_ResolveLevel(userId, finalPoints);
    const newBadges = iGM_EvaluateBadges(userId, new Date().toISOString());
    return { totalPoints: finalPoints, level: finalLevel, newBadges };
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
