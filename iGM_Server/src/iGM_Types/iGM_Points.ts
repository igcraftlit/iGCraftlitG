/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Points.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Points
 * 模块：iGM_Points
 * 作用：定义积分、等级、勋章、签到与任务领域共享类型
 * 内容：表数据行类型与对外 DTO 类型
 */

// 导入依赖 //
// （本文件仅包含类型定义，无运行时依赖）

// 类型定义 //
/** iGM_PointsRecords 表数据行 */
export interface iGM_PointsRecordRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Points: number;
  iGM_Action: string;
  iGM_Description: string | null;
  iGM_CreatedAt: string;
}

/** iGM_UserPoints 表数据行 */
export interface iGM_UserPointsRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_TotalPoints: number;
  iGM_LevelId: string | null;
  iGM_UpdatedAt: string;
}

/** iGM_Levels 表数据行 */
export interface iGM_LevelRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_MinPoints: number;
  iGM_MaxPoints: number | null;
  iGM_Icon: string | null;
  iGM_SortOrder: number;
  /** 模块十五：是否需通过考核方可升级（1 需考核 / 0 否） */
  iGM_IsExamRequired: number;
}

/** iGM_Badges 表数据行 */
export interface iGM_BadgeRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_Description: string;
  iGM_Icon: string | null;
  iGM_ConditionType: string;
  iGM_ConditionValue: number;
  /** 模块十五：稀有度 common 普通 / rare 稀有 / legendary 传说 */
  iGM_Rarity: string;
}

/** iGM_UserBadges 表数据行 */
export interface iGM_UserBadgeRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_BadgeId: string;
  iGM_GrantedAt: string;
}

/** iGM_Checkins 表数据行 */
export interface iGM_CheckinRow {
  iGM_Id: string;
  iGM_UserId: string;
  /** 自然日 YYYY-MM-DD（Asia/Shanghai） */
  iGM_CheckinDate: string;
  iGM_PointsEarned: number;
  iGM_ContinuousDays: number;
  iGM_CreatedAt: string;
}

/** iGM_Tasks 表数据行 */
export interface iGM_TaskRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_Description: string;
  iGM_Action: string;
  iGM_TargetCount: number;
  iGM_RewardPoints: number;
  /** weekly 每周任务 / seasonal 每季任务 */
  iGM_TaskType: string;
  iGM_SortOrder: number;
  /** 模块十五：赛季标识（每季任务使用，weekly 为 NULL） */
  iGM_SeasonId: string | null;
}

/** iGM_UserTasks 表数据行 */
export interface iGM_UserTaskRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_TaskId: string;
  iGM_Progress: number;
  iGM_IsCompleted: number;
  iGM_UpdatedAt: string;
  /** 模块十五：奖励是否已领取（1 已领取 / 0 未领取） */
  iGM_IsClaimed: number;
  /** 模块十五：当前进度所属周期键（周 / 季），周期变更时自动重置进度 */
  iGM_CycleKey: string | null;
}

/** iGM_LevelExams 表数据行（等级考核申请） */
export interface iGM_LevelExamRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_LevelId: string;
  iGM_Content: string | null;
  /** pending 待审核 / approved 已通过 / rejected 未通过 */
  iGM_Status: string;
  iGM_ReviewerId: string | null;
  iGM_ReviewNote: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/* ---------- 对外 DTO ---------- */

/** 等级 DTO */
export interface iGM_LevelDto {
  id: string;
  name: string;
  minPoints: number;
  maxPoints: number | null;
  icon: string | null;
  sortOrder: number;
  /** 模块十五：该等级是否需通过考核方可升级 */
  isExamRequired: boolean;
}

/** 积分流水 DTO */
export interface iGM_PointsRecordDto {
  id: string;
  points: number;
  action: string;
  description: string | null;
  createdAt: string;
}

/** 我的积分概览 DTO */
export interface iGM_MyPointsDto {
  totalPoints: number;
  level: iGM_LevelDto | null;
  /** 下一等级（已到顶为 null） */
  nextLevel: iGM_LevelDto | null;
  /** 距下一等级还差积分（已到顶为 0） */
  pointsToNext: number;
}

/** 排行榜条目 DTO */
export interface iGM_LeaderboardEntryDto {
  rank: number;
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  totalPoints: number;
  weeklyPoints: number;
  levelId: string | null;
  levelName: string | null;
}

/** 勋章 DTO（可附带我的获得状态） */
export interface iGM_BadgeDto {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  conditionType: string;
  conditionValue: number;
  /** 模块十五：稀有度 common 普通 / rare 稀有 / legendary 传说 */
  rarity: string;
  /** 当前登录用户是否已获得（未登录为 false） */
  granted: boolean;
  grantedAt: string | null;
}

/** 任务 DTO（可附带我的进度） */
export interface iGM_TaskDto {
  id: string;
  name: string;
  description: string;
  action: string;
  targetCount: number;
  rewardPoints: number;
  taskType: string;
  seasonId: string | null;
  sortOrder: number;
  progress: number;
  isCompleted: boolean;
  /** 模块十五：奖励是否已领取 */
  isClaimed: boolean;
}

/** 等级考核记录 DTO */
export interface iGM_LevelExamDto {
  id: string;
  levelId: string;
  levelName: string | null;
  status: string;
  content: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 升级进度 DTO */
export interface iGM_LevelProgressDto {
  totalPoints: number;
  /** 当前生效等级（考核未通过的等级不计入） */
  level: iGM_LevelDto | null;
  /** 下一个可升级目标等级（已到顶为 null） */
  nextLevel: iGM_LevelDto | null;
  /** 距下一等级还差积分（已达标或到顶为 0） */
  pointsToNext: number;
  /** 积分是否已满足下一等级要求 */
  pointsReached: boolean;
  /** 下一等级是否需考核 */
  nextLevelExamRequired: boolean;
  /** 对该等级的考核状态：none / pending / approved / rejected */
  examStatus: string;
  /** 是否已满足升级条件（积分达标且考核要求已满足） */
  canLevelUp: boolean;
}

/** 任务奖励领取结果 DTO */
export interface iGM_TaskClaimResultDto {
  taskId: string;
  pointsEarned: number;
  totalPoints: number;
  level: iGM_LevelDto | null;
  levelUp: boolean;
  newBadges: iGM_BadgeDto[];
}

/** 签到状态 DTO */
export interface iGM_CheckinStatusDto {
  /** 今日（Asia/Shanghai 自然日）是否已签到 */
  checkedToday: boolean;
  /** 当前连续天数（今日已签含今日，未签含截至昨日） */
  continuousDays: number;
  /** 今日签到可获积分预估 */
  todayPoints: number;
  /** 本月已签到日期列表（YYYY-MM-DD） */
  monthDates: string[];
}

/** 签到结果 DTO */
export interface iGM_CheckinResultDto {
  checkinDate: string;
  pointsEarned: number;
  continuousDays: number;
  totalPoints: number;
  level: iGM_LevelDto | null;
  levelUp: boolean;
  newBadges: iGM_BadgeDto[];
}
