/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_StatsRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Stats
 * 模块：iGM_StatsRepository
 * 作用：运营统计的唯一数据访问出口
 * 内容：核心指标计数、按日时间序列（用户/帖子/评论/点赞/活跃用户）、
 *       热门帖子与热门资源排行、活跃用户排行、活动参与统计、
 *       每日聚合表 iGM_StatsDaily 与快照表 iGM_StatsSnapshots 读写
 * 说明：所有时间范围过滤基于 ISO 字符串比较（与既有表 iGM_CreatedAt 口径一致）；
 *       日界由服务层按 Asia/Shanghai 计算后传入
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";

// 类型定义 //
/** 热门帖子排行行 */
export interface iGM_HotPostRow {
  iGM_Id: string;
  iGM_Title: string;
  iGM_AuthorName: string;
  iGM_LikeCount: number;
  iGM_CommentCount: number;
  iGM_Score: number;
}

/** 热门资源排行行 */
export interface iGM_HotResourceRow {
  iGM_Id: string;
  iGM_Title: string;
  iGM_UploaderName: string;
  iGM_DownloadCount: number;
}

/** 活跃用户排行行 */
export interface iGM_ActiveUserRow {
  iGM_Id: string;
  iGM_Username: string;
  iGM_DisplayName: string | null;
  iGM_Avatar: string | null;
  iGM_VerifiedOrgId: string | null;
  iGM_Email: string;
  iGM_ActionCount: number;
}

/** 活动参与统计行 */
export interface iGM_ActivityStatRow {
  iGM_Id: string;
  iGM_Title: string;
  iGM_Status: string;
  iGM_StartTime: string | null;
  iGM_CreatedAt: string;
  iGM_RegistrationCount: number;
}

/** iGM_StatsDaily 表数据行 */
export interface iGM_StatsDailyRow {
  iGM_Id: string;
  iGM_Date: string;
  iGM_NewUsers: number;
  iGM_ActiveUsers: number;
  iGM_PostsCount: number;
  iGM_CommentsCount: number;
  iGM_LikesCount: number;
  iGM_ResourcesCount: number;
  iGM_ActivitiesCount: number;
}

// 核心逻辑 //
/* ---------- 通用计数 ---------- */

/** 通用行计数 */
function iGM_Count(sql: string, params: (string | number)[] = []): number {
  const row = iGM_Db.query(sql).get(...params) as { total: number };
  return row.total;
}

/* ---------- 概览计数 ---------- */

/** 指定时间窗内的新增用户数（startIso 含，endIso 不含；endIso 省略表示至今） */
export function iGM_CountUsersBetween(startIso: string, endIso?: string): number {
  return iGM_Count(
    `SELECT COUNT(*) AS total FROM iGM_Users
      WHERE iGM_CreatedAt >= ?${endIso ? " AND iGM_CreatedAt < ?" : ""}`,
    endIso ? [startIso, endIso] : [startIso],
  );
}

/** 时间窗内发帖数（仅统计正常发布状态） */
export function iGM_CountPostsBetween(startIso: string, endIso?: string): number {
  return iGM_Count(
    `SELECT COUNT(*) AS total FROM iGM_Posts
      WHERE iGM_Status = 'published' AND iGM_CreatedAt >= ?${endIso ? " AND iGM_CreatedAt < ?" : ""}`,
    endIso ? [startIso, endIso] : [startIso],
  );
}

/** 时间窗内评论数（仅统计可见状态） */
export function iGM_CountCommentsBetween(startIso: string, endIso?: string): number {
  return iGM_Count(
    `SELECT COUNT(*) AS total FROM iGM_Comments
      WHERE iGM_Status = 'visible' AND iGM_CreatedAt >= ?${endIso ? " AND iGM_CreatedAt < ?" : ""}`,
    endIso ? [startIso, endIso] : [startIso],
  );
}

/** 时间窗内点赞数 */
export function iGM_CountLikesBetween(startIso: string, endIso?: string): number {
  return iGM_Count(
    `SELECT COUNT(*) AS total FROM iGM_Likes
      WHERE iGM_CreatedAt >= ?${endIso ? " AND iGM_CreatedAt < ?" : ""}`,
    endIso ? [startIso, endIso] : [startIso],
  );
}

/**
 * 时间窗内活跃用户数（去重）：
 * 在发帖、评论、点赞、签到、活动报名任一行为中有记录的用户
 * @param shanghaiDate 单日统计时传入当日上海日期（签到表按日期字符串存储）；范围统计传 null 跳过签到
 */
export function iGM_CountActiveUsersBetween(
  startIso: string,
  endIso: string,
  shanghaiDate: string | null,
): number {
  const checkinClause = shanghaiDate
    ? `UNION SELECT iGM_UserId AS uid FROM iGM_Checkins WHERE iGM_CheckinDate = '${shanghaiDate}'`
    : "";
  const row = iGM_Db
    .query(
      `SELECT COUNT(DISTINCT uid) AS total FROM (
         SELECT iGM_AuthorId AS uid FROM iGM_Posts WHERE iGM_CreatedAt >= ? AND iGM_CreatedAt < ?
         UNION
         SELECT iGM_AuthorId AS uid FROM iGM_Comments WHERE iGM_CreatedAt >= ? AND iGM_CreatedAt < ?
         UNION
         SELECT iGM_UserId AS uid FROM iGM_Likes WHERE iGM_CreatedAt >= ? AND iGM_CreatedAt < ?
         UNION
         SELECT iGM_UserId AS uid FROM iGM_ActivityRegistrations WHERE iGM_CreatedAt >= ? AND iGM_CreatedAt < ?
         ${checkinClause}
       )`,
    )
    .get(startIso, endIso, startIso, endIso, startIso, endIso, startIso, endIso) as {
    total: number;
  };
  return row.total;
}

/** 总量计数：点赞总数、活动报名总数（registered）、资源总数、资源下载总量 */
export function iGM_GetTotalCounts(): {
  likes: number;
  activityRegistrations: number;
  resources: number;
  resourceDownloads: number;
} {
  const likes = iGM_Count(`SELECT COUNT(*) AS total FROM iGM_Likes`);
  const registrations = iGM_Count(
    `SELECT COUNT(*) AS total FROM iGM_ActivityRegistrations WHERE iGM_Status = 'registered'`,
  );
  const resources = iGM_Count(
    `SELECT COUNT(*) AS total FROM iGM_Resources WHERE iGM_Status = 'published'`,
  );
  const downloads = iGM_Db
    .query(`SELECT COALESCE(SUM(iGM_DownloadCount), 0) AS total FROM iGM_Resources`)
    .get() as { total: number };
  return {
    likes,
    activityRegistrations: registrations,
    resources,
    resourceDownloads: downloads.total,
  };
}

/* ---------- 排行榜 ---------- */

/** 热门帖子 Top N：按时间窗内 点赞数 + 评论数 合计排序（仅已发布帖子） */
export function iGM_ListHotPosts(
  startIso: string,
  endIso: string,
  limit: number,
): iGM_HotPostRow[] {
  return iGM_Db
    .query(
      `SELECT p.iGM_Id,
              p.iGM_Title,
              COALESCE(u.iGM_DisplayName, u.iGM_Username) AS iGM_AuthorName,
              (SELECT COUNT(*) FROM iGM_Likes l
                WHERE l.iGM_TargetType = 'post' AND l.iGM_TargetId = p.iGM_Id
                  AND l.iGM_CreatedAt >= ? AND l.iGM_CreatedAt < ?) AS iGM_LikeCount,
              (SELECT COUNT(*) FROM iGM_Comments c
                WHERE c.iGM_PostId = p.iGM_Id AND c.iGM_Status = 'visible'
                  AND c.iGM_CreatedAt >= ? AND c.iGM_CreatedAt < ?) AS iGM_CommentCount
         FROM iGM_Posts p
         JOIN iGM_Users u ON u.iGM_Id = p.iGM_AuthorId
        WHERE p.iGM_Status = 'published'
        ORDER BY (iGM_LikeCount + iGM_CommentCount) DESC, p.iGM_CreatedAt DESC
        LIMIT ?`,
    )
    .all(startIso, endIso, startIso, endIso, limit)
    .map((row) => {
      const r = row as Omit<iGM_HotPostRow, "iGM_Score">;
      return { ...r, iGM_Score: r.iGM_LikeCount + r.iGM_CommentCount };
    });
}

/**
 * 热门资源 Top N：按累计下载量排序
 * 说明：下载量以计数器存储（无逐次时间戳），无法按时间窗过滤，采用全量口径
 */
export function iGM_ListHotResources(limit: number): iGM_HotResourceRow[] {
  return iGM_Db
    .query(
      `SELECT r.iGM_Id,
              r.iGM_Title,
              COALESCE(u.iGM_DisplayName, u.iGM_Username) AS iGM_UploaderName,
              r.iGM_DownloadCount
         FROM iGM_Resources r
         JOIN iGM_Users u ON u.iGM_Id = r.iGM_UploaderId
        WHERE r.iGM_Status = 'published'
        ORDER BY r.iGM_DownloadCount DESC, r.iGM_CreatedAt DESC
        LIMIT ?`,
    )
    .all(limit) as iGM_HotResourceRow[];
}

/** 活跃用户 Top N：按时间窗内 发帖 + 评论 + 点赞 行为合计排序 */
export function iGM_ListActiveUsers(
  startIso: string,
  endIso: string,
  limit: number,
): iGM_ActiveUserRow[] {
  return iGM_Db
    .query(
      `SELECT u.iGM_Id,
              u.iGM_Username,
              u.iGM_DisplayName,
              u.iGM_Avatar,
              u.iGM_VerifiedOrgId,
              u.iGM_Email,
              (SELECT COUNT(*) FROM iGM_Posts p
                WHERE p.iGM_AuthorId = u.iGM_Id AND p.iGM_CreatedAt >= ? AND p.iGM_CreatedAt < ?) +
              (SELECT COUNT(*) FROM iGM_Comments c
                WHERE c.iGM_AuthorId = u.iGM_Id AND c.iGM_CreatedAt >= ? AND c.iGM_CreatedAt < ?) +
              (SELECT COUNT(*) FROM iGM_Likes l
                WHERE l.iGM_UserId = u.iGM_Id AND l.iGM_CreatedAt >= ? AND l.iGM_CreatedAt < ?)
              AS iGM_ActionCount
         FROM iGM_Users u
        WHERE u.iGM_Status = 'active'
        ORDER BY iGM_ActionCount DESC, u.iGM_CreatedAt ASC
        LIMIT ?`,
    )
    .all(startIso, endIso, startIso, endIso, startIso, endIso, limit) as iGM_ActiveUserRow[];
}

/** 活动参与统计：时间窗内创建的活动及其当前有效报名数 */
export function iGM_ListActivityStats(
  startIso: string,
  endIso: string,
): iGM_ActivityStatRow[] {
  return iGM_Db
    .query(
      `SELECT a.iGM_Id,
              a.iGM_Title,
              a.iGM_Status,
              a.iGM_StartTime,
              a.iGM_CreatedAt,
              (SELECT COUNT(*) FROM iGM_ActivityRegistrations r
                WHERE r.iGM_ActivityId = a.iGM_Id AND r.iGM_Status = 'registered')
              AS iGM_RegistrationCount
         FROM iGM_Activities a
        WHERE a.iGM_CreatedAt >= ? AND a.iGM_CreatedAt < ?
        ORDER BY a.iGM_CreatedAt DESC`,
    )
    .all(startIso, endIso) as iGM_ActivityStatRow[];
}

/* ---------- 每日聚合表 iGM_StatsDaily ---------- */

/** 按日期读取聚合行 */
export function iGM_FindStatsDaily(date: string): iGM_StatsDailyRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_StatsDaily WHERE iGM_Date = ?`)
      .get(date) as iGM_StatsDailyRow | undefined) ?? null
  );
}

/** 写入或更新某日聚合行（按唯一日期 upsert） */
export function iGM_UpsertStatsDaily(
  row: Omit<iGM_StatsDailyRow, "iGM_Id">,
): void {
  iGM_Db.run(
    `INSERT INTO iGM_StatsDaily
       (iGM_Id, iGM_Date, iGM_NewUsers, iGM_ActiveUsers, iGM_PostsCount,
        iGM_CommentsCount, iGM_LikesCount, iGM_ResourcesCount, iGM_ActivitiesCount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (iGM_Date) DO UPDATE SET
       iGM_NewUsers = excluded.iGM_NewUsers,
       iGM_ActiveUsers = excluded.iGM_ActiveUsers,
       iGM_PostsCount = excluded.iGM_PostsCount,
       iGM_CommentsCount = excluded.iGM_CommentsCount,
       iGM_LikesCount = excluded.iGM_LikesCount,
       iGM_ResourcesCount = excluded.iGM_ResourcesCount,
       iGM_ActivitiesCount = excluded.iGM_ActivitiesCount`,
    [
      iGM_RandomUuid(),
      row.iGM_Date,
      row.iGM_NewUsers,
      row.iGM_ActiveUsers,
      row.iGM_PostsCount,
      row.iGM_CommentsCount,
      row.iGM_LikesCount,
      row.iGM_ResourcesCount,
      row.iGM_ActivitiesCount,
    ],
  );
}

/** 读取日期区间内的聚合行（升序） */
export function iGM_ListStatsDaily(
  startDate: string,
  endDate: string,
): iGM_StatsDailyRow[] {
  return iGM_Db
    .query(
      `SELECT * FROM iGM_StatsDaily
        WHERE iGM_Date >= ? AND iGM_Date <= ?
        ORDER BY iGM_Date ASC`,
    )
    .all(startDate, endDate) as iGM_StatsDailyRow[];
}

/* ---------- 聚合快照表 iGM_StatsSnapshots ---------- */

/** 读取新鲜快照（在 maxAgeMs 内创建才返回，否则 null） */
export function iGM_FindFreshSnapshot(
  metric: string,
  period: string,
  maxAgeMs: number,
): string | null {
  const row = iGM_Db
    .query(
      `SELECT iGM_Value, iGM_CreatedAt FROM iGM_StatsSnapshots
        WHERE iGM_Metric = ? AND iGM_Period = ?
        ORDER BY iGM_CreatedAt DESC LIMIT 1`,
    )
    .get(metric, period) as
    | { iGM_Value: string; iGM_CreatedAt: string }
    | undefined;
  if (!row) return null;
  if (Date.now() - Date.parse(row.iGM_CreatedAt) > maxAgeMs) return null;
  return row.iGM_Value;
}

/** 写入快照（同指标同周期仅保留最新一条） */
export function iGM_WriteSnapshot(
  metric: string,
  period: string,
  valueJson: string,
  now: string,
): void {
  iGM_Db.run(
    `DELETE FROM iGM_StatsSnapshots WHERE iGM_Metric = ? AND iGM_Period = ?`,
    [metric, period],
  );
  iGM_Db.run(
    `INSERT INTO iGM_StatsSnapshots (iGM_Id, iGM_Metric, iGM_Value, iGM_Period, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [iGM_RandomUuid(), metric, valueJson, period, now],
  );
}

// 导出 //
export default {
  iGM_CountUsersBetween,
  iGM_CountPostsBetween,
  iGM_CountCommentsBetween,
  iGM_CountLikesBetween,
  iGM_CountActiveUsersBetween,
  iGM_GetTotalCounts,
  iGM_ListHotPosts,
  iGM_ListHotResources,
  iGM_ListActiveUsers,
  iGM_ListActivityStats,
  iGM_FindStatsDaily,
  iGM_UpsertStatsDaily,
  iGM_ListStatsDaily,
  iGM_FindFreshSnapshot,
  iGM_WriteSnapshot,
};
