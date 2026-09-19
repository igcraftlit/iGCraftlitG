/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_ActivityRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Activity
 * 模块：iGM_ActivityRepository
 * 作用：社区活动（iGM_Activities）与活动报名（iGM_ActivityRegistrations）
 *       的唯一数据访问出口
 * 内容：活动创建/更新/删除/查询/分页筛选、报名写入与取消、报名列表与计数
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_ActivityRegistrationRow,
  iGM_ActivityRow,
  iGM_ActivityStatus,
} from "../iGM_Types/iGM_Activity";

// 类型定义 //
/** 活动列表筛选参数 */
export interface iGM_ActivityListParams {
  statuses: iGM_ActivityStatus[];
  search: string | null;
  creatorId: string | null;
  page: number;
  pageSize: number;
}

/** 活动分页查询结果 */
export interface iGM_ActivityListResult {
  items: iGM_ActivityRow[];
  total: number;
}

/** 活动创建入参 */
export interface iGM_CreateActivityInput {
  creatorId: string;
  title: string;
  description: string;
  coverFileId: string | null;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
  status: iGM_ActivityStatus;
  maxParticipants: number | null;
  now: string;
}

/** 活动更新入参 */
export interface iGM_UpdateActivityInput {
  title: string;
  description: string;
  coverFileId: string | null;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
  status: iGM_ActivityStatus;
  maxParticipants: number | null;
  now: string;
}

// 核心逻辑 //
/** 转义 LIKE 通配符，与 ESCAPE '\' 配合防止用户输入扩大匹配范围 */
function iGM_EscapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 组装筛选条件与绑定参数（列表与计数共用，保证口径一致） */
function iGM_BuildFilters(params: iGM_ActivityListParams): {
  where: string;
  bindings: (string | number)[];
} {
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.statuses.length > 0) {
    clauses.push(
      `a.iGM_Status IN (${params.statuses.map(() => "?").join(", ")})`,
    );
    bindings.push(...params.statuses);
  }
  if (params.creatorId) {
    clauses.push(`a.iGM_CreatorId = ?`);
    bindings.push(params.creatorId);
  }
  if (params.search && params.search.trim().length > 0) {
    const keyword = `%${iGM_EscapeLike(params.search.trim())}%`;
    clauses.push(
      `(a.iGM_Title LIKE ? ESCAPE '\\' OR a.iGM_Description LIKE ? ESCAPE '\\')`,
    );
    bindings.push(keyword, keyword);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    bindings,
  };
}

/** 新建活动 */
export function iGM_CreateActivity(
  input: iGM_CreateActivityInput,
): iGM_ActivityRow {
  const row: iGM_ActivityRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_CreatorId: input.creatorId,
    iGM_Title: input.title,
    iGM_Description: input.description,
    iGM_CoverFileId: input.coverFileId,
    iGM_Location: input.location,
    iGM_StartTime: input.startTime,
    iGM_EndTime: input.endTime,
    iGM_Status: input.status,
    iGM_MaxParticipants: input.maxParticipants,
    iGM_CreatedAt: input.now,
    iGM_UpdatedAt: input.now,
  };
  iGM_Db.run(
    `INSERT INTO iGM_Activities
       (iGM_Id, iGM_CreatorId, iGM_Title, iGM_Description, iGM_CoverFileId,
        iGM_Location, iGM_StartTime, iGM_EndTime, iGM_Status,
        iGM_MaxParticipants, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_CreatorId,
      row.iGM_Title,
      row.iGM_Description,
      row.iGM_CoverFileId,
      row.iGM_Location,
      row.iGM_StartTime,
      row.iGM_EndTime,
      row.iGM_Status,
      row.iGM_MaxParticipants,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 按主键查询活动 */
export function iGM_FindActivityById(id: string): iGM_ActivityRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Activities WHERE iGM_Id = ?`)
      .get(id) as iGM_ActivityRow | undefined) ?? null
  );
}

/** 更新活动（覆盖全部可编辑字段） */
export function iGM_UpdateActivity(
  id: string,
  input: iGM_UpdateActivityInput,
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Activities SET
       iGM_Title = ?, iGM_Description = ?, iGM_CoverFileId = ?,
       iGM_Location = ?, iGM_StartTime = ?, iGM_EndTime = ?,
       iGM_Status = ?, iGM_MaxParticipants = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [
      input.title,
      input.description,
      input.coverFileId,
      input.location,
      input.startTime,
      input.endTime,
      input.status,
      input.maxParticipants,
      input.now,
      id,
    ],
  );
  return result.changes > 0;
}

/** 删除活动（报名记录由外键级联清理） */
export function iGM_DeleteActivity(id: string): boolean {
  const result = iGM_Db.run(`DELETE FROM iGM_Activities WHERE iGM_Id = ?`, [id]);
  return result.changes > 0;
}

/** 按筛选条件分页查询活动（按开始时间倒序，未填时间时退化为创建时间） */
export function iGM_ListActivities(
  params: iGM_ActivityListParams,
): iGM_ActivityListResult {
  const { where, bindings } = iGM_BuildFilters(params);
  const offset = (params.page - 1) * params.pageSize;

  const totalRow = iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Activities a ${where}`)
    .get(...bindings) as { iGM_Count: number };

  const items = iGM_Db
    .query(
      `SELECT a.* FROM iGM_Activities a
       ${where}
       ORDER BY COALESCE(a.iGM_StartTime, a.iGM_CreatedAt) DESC,
                a.iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...bindings, params.pageSize, offset) as iGM_ActivityRow[];

  return { items, total: totalRow.iGM_Count };
}

/* ---------- 报名 ---------- */

/** 查询某用户对某活动的报名记录 */
export function iGM_FindRegistration(
  activityId: string,
  userId: string,
): iGM_ActivityRegistrationRow | null {
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_ActivityRegistrations
          WHERE iGM_ActivityId = ? AND iGM_UserId = ?`,
      )
      .get(activityId, userId) as iGM_ActivityRegistrationRow | undefined) ??
    null
  );
}

/** 写入报名（已存在则更新状态与时间） */
export function iGM_UpsertRegistration(
  activityId: string,
  userId: string,
  status: "registered" | "cancelled",
  now: string,
): void {
  iGM_Db.run(
    `INSERT INTO iGM_ActivityRegistrations
       (iGM_Id, iGM_ActivityId, iGM_UserId, iGM_Status, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (iGM_ActivityId, iGM_UserId) DO UPDATE SET
       iGM_Status = excluded.iGM_Status,
       iGM_CreatedAt = excluded.iGM_CreatedAt`,
    [iGM_RandomUuid(), activityId, userId, status, now],
  );
}

/** 统计活动有效报名人数 */
export function iGM_CountRegistrations(activityId: string): number {
  const row = iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_ActivityRegistrations
        WHERE iGM_ActivityId = ? AND iGM_Status = 'registered'`,
    )
    .get(activityId) as { iGM_Count: number };
  return row.iGM_Count;
}

/** 批量统计一组活动的有效报名人数：activityId -> 数量 */
export function iGM_CountRegistrationsBatch(
  activityIds: string[],
): Map<string, number> {
  const map = new Map<string, number>();
  const unique = Array.from(new Set(activityIds)).filter(Boolean);
  if (unique.length === 0) return map;
  const placeholders = unique.map(() => "?").join(", ");
  const rows = iGM_Db
    .query(
      `SELECT iGM_ActivityId AS iGM_TargetId, COUNT(*) AS iGM_Count
         FROM iGM_ActivityRegistrations
        WHERE iGM_Status = 'registered'
          AND iGM_ActivityId IN (${placeholders})
        GROUP BY iGM_ActivityId`,
    )
    .all(...unique) as { iGM_TargetId: string; iGM_Count: number }[];
  for (const row of rows) map.set(row.iGM_TargetId, row.iGM_Count);
  return map;
}

/** 查询某活动全部有效报名记录（时间正序，先报名在前） */
export function iGM_ListRegistrations(
  activityId: string,
): iGM_ActivityRegistrationRow[] {
  return iGM_Db
    .query(
      `SELECT * FROM iGM_ActivityRegistrations
        WHERE iGM_ActivityId = ? AND iGM_Status = 'registered'
        ORDER BY iGM_CreatedAt ASC`,
    )
    .all(activityId) as iGM_ActivityRegistrationRow[];
}

// 导出 //
export default {
  iGM_CreateActivity,
  iGM_FindActivityById,
  iGM_UpdateActivity,
  iGM_DeleteActivity,
  iGM_ListActivities,
  iGM_FindRegistration,
  iGM_UpsertRegistration,
  iGM_CountRegistrations,
  iGM_CountRegistrationsBatch,
  iGM_ListRegistrations,
};
