/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_UserRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Auth
 * 模块：iGM_UserRepository
 * 作用：iGM_Users 表的唯一数据访问出口
 * 内容：创建用户、按 id/邮箱/用户名查询、更新密码、邮箱验证标记、
 *       更新时间戳、管理员用户列表
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type {
  iGM_UserRole,
  iGM_UserRow,
  iGM_UserStatus,
} from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 创建用户所需字段 */
export interface iGM_CreateUserParams {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: iGM_UserRole;
  now: string;
}

// 核心逻辑 //
/** 创建新用户 */
export function iGM_CreateUser(params: iGM_CreateUserParams): iGM_UserRow {
  iGM_Db.run(
    `INSERT INTO iGM_Users
       (iGM_Id, iGM_Username, iGM_Email, iGM_PasswordHash,
        iGM_Role, iGM_Status, iGM_EmailVerified, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
    [
      params.id,
      params.username,
      params.email,
      params.passwordHash,
      params.role,
      params.now,
      params.now,
    ],
  );
  const row = iGM_FindUserById(params.id);
  if (!row) throw new Error("iGM_CreateUser：创建后查询用户失败");
  return row;
}

/** 按主键查询用户 */
export function iGM_FindUserById(id: string): iGM_UserRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Users WHERE iGM_Id = ?`)
      .get(id) as iGM_UserRow | undefined) ?? null
  );
}

/** 按邮箱查询用户（邮箱存储为小写，唯一索引 NOCASE） */
export function iGM_FindUserByEmail(email: string): iGM_UserRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Users WHERE iGM_Email = ? COLLATE NOCASE`)
      .get(email) as iGM_UserRow | undefined) ?? null
  );
}

/** 按用户名查询用户 */
export function iGM_FindUserByUsername(username: string): iGM_UserRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Users WHERE iGM_Username = ? COLLATE NOCASE`)
      .get(username) as iGM_UserRow | undefined) ?? null
  );
}

/** 标记邮箱已验证，并刷新 updatedAt */
export function iGM_MarkEmailVerified(
  userId: string,
  now: string,
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Users
       SET iGM_EmailVerified = 1, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [now, userId],
  );
  return result.changes > 0;
}

/** 更新密码哈希，并刷新 updatedAt */
export function iGM_UpdatePassword(
  userId: string,
  passwordHash: string,
  now: string,
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Users
       SET iGM_PasswordHash = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [passwordHash, now, userId],
  );
  return result.changes > 0;
}

/** 管理员查询用户列表（分页，按创建时间倒序） */
export function iGM_ListUsers(limit: number, offset: number): iGM_UserRow[] {
  return iGM_Db
    .query(
      `SELECT * FROM iGM_Users
       ORDER BY iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as iGM_UserRow[];
}

/** 统计用户总数 */
export function iGM_CountUsers(): number {
  const row = iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Users`)
    .get() as { iGM_Count: number };
  return row.iGM_Count;
}

/** 按主键批量查询用户（帖子/评论列表组装作者信息，避免 N+1 查询） */
export function iGM_FindUsersByIds(ids: string[]): iGM_UserRow[] {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(", ");
  return iGM_Db
    .query(`SELECT * FROM iGM_Users WHERE iGM_Id IN (${placeholders})`)
    .all(...unique) as iGM_UserRow[];
}

/** 更新本人公开资料（昵称、头像 URL、简介、网站），并刷新 updatedAt */
export function iGM_UpdateProfile(
  userId: string,
  fields: {
    displayName: string | null;
    avatar: string | null;
    bio: string | null;
    website: string | null;
    now: string;
  },
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Users
       SET iGM_DisplayName = ?, iGM_Avatar = ?, iGM_Bio = ?,
           iGM_Website = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [
      fields.displayName,
      fields.avatar,
      fields.bio,
      fields.website,
      fields.now,
      userId,
    ],
  );
  return result.changes > 0;
}

/** （可选）管理员更新角色与状态 */
export function iGM_UpdateUserAdmin(
  userId: string,
  fields: { role?: iGM_UserRole; status?: iGM_UserStatus; now: string },
): boolean {
  const assignments: string[] = ["iGM_UpdatedAt = ?"];
  const values: string[] = [fields.now];
  if (fields.role) {
    assignments.push("iGM_Role = ?");
    values.push(fields.role);
  }
  if (fields.status) {
    assignments.push("iGM_Status = ?");
    values.push(fields.status);
  }
  values.push(userId);
  const result = iGM_Db.run(
    `UPDATE iGM_Users SET ${assignments.join(", ")} WHERE iGM_Id = ?`,
    values,
  );
  return result.changes > 0;
}

// 导出 //
export default {
  iGM_CreateUser,
  iGM_FindUserById,
  iGM_FindUserByEmail,
  iGM_FindUserByUsername,
  iGM_FindUsersByIds,
  iGM_MarkEmailVerified,
  iGM_UpdatePassword,
  iGM_UpdateProfile,
  iGM_ListUsers,
  iGM_CountUsers,
  iGM_UpdateUserAdmin,
};
