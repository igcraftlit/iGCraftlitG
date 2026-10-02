/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_UserRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Auth
 * 模块：iGM_UserRepository
 * 作用：iGM_Users 表的唯一数据访问出口
 * 内容：创建用户、按 id/邮箱/用户名查询、更新密码、邮箱验证标记、
 *       更新时间戳、管理员用户列表、物理删除用户（外键级联清理全部关联数据）
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
  /** 11 位全局唯一 UID（由注册服务经 iGM_GenerateUniqueUid 分配） */
  uid: string;
  username: string;
  email: string;
  passwordHash: string;
  role: iGM_UserRole;
  /** 特殊负责人邮箱账号注册时自动写入认证组织 */
  verifiedOrgId?: string | null;
  /** 模块八：同意《用户管理规定》时的客户端 IP（来自请求上下文，非前端传值） */
  rulesAcceptedIp?: string | null;
  /** 模块二十五：注册时客户端 IP（同时写入 iGM_RegisterIp，供异常 IP 排查） */
  registerIp?: string | null;
  now: string;
}

// 核心逻辑 //
/**
 * UID 区分位（模块十六，共 11 位：第 1 位为区分位 + 后 10 位全局顺序号）。
 * 0 管理员 / 官方人员、1-8 普通用户（当前统一使用 1，其余位保留扩展）、9 测试账号。
 * 顺序号从 1 开始、按注册顺序递增、全局唯一、不使用 0，一经分配不可更改。
 */
export const iGM_UidScopeAdmin = "0";
export const iGM_UidScopeUser = "1";
export const iGM_UidScopeTest = "9";

/**
 * 取某区分位的下一个顺序号（在事务内自增 iGM_UIDSequence）。
 * 顺序号只增不减；首次使用某区分位时自动建行，起始值为 1。
 */
async function iGM_NextUidSequence(scope: string): Promise<number> {
  const allocate = iGM_Db.transaction(
    async (targetScope: string): Promise<number> => {
      const row = (await iGM_Db
        .query(
          `SELECT iGM_LastSequence FROM iGM_UIDSequence WHERE iGM_Scope = ?`,
        )
        .get(targetScope)) as { iGM_LastSequence: number } | undefined;
      const next = (row?.iGM_LastSequence ?? 0) + 1;
      await iGM_Db.run(
        `INSERT INTO iGM_UIDSequence (iGM_Id, iGM_Scope, iGM_LastSequence, iGM_UpdatedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (iGM_Scope)
       DO UPDATE SET iGM_LastSequence = excluded.iGM_LastSequence,
                     iGM_UpdatedAt = excluded.iGM_UpdatedAt`,
        [
          `uid-scope-${targetScope}`,
          targetScope,
          next,
          new Date().toISOString(),
        ],
      );
      return next;
    },
  );
  return await allocate(scope);
}

/**
 * 按区分位分配 11 位 UID：顺序号不足 10 位时左补 0。
 * 例：scope 1 的第 1 号 → 10000000001。
 */
export async function iGM_AllocateUid(scope: string): Promise<string> {
  const sequence = await iGM_NextUidSequence(scope);
  return `${scope}${String(sequence).padStart(10, "0")}`;
}

/**
 * 按角色分配 UID：管理员 / 官方人员走区分位 0，普通用户走区分位 1。
 * UID 作为认证值，注册后不可修改；唯一索引 iGM_Idx_Users_Uid 兜底。
 */
export async function iGM_GenerateUniqueUid(
  role: iGM_UserRole = "user",
): Promise<string> {
  const scope =
    role === "admin" || role === "moderator"
      ? iGM_UidScopeAdmin
      : iGM_UidScopeUser;
  return await iGM_AllocateUid(scope);
}

/** 按 UID 查询用户 */
export async function iGM_FindUserByUid(uid: string): Promise<iGM_UserRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_Users WHERE iGM_Uid = ?`)
      .get(uid)) as iGM_UserRow | undefined) ?? null
  );
}

/** 创建新用户 */
export async function iGM_CreateUser(
  params: iGM_CreateUserParams,
): Promise<iGM_UserRow> {
  await iGM_Db.run(
    `INSERT INTO iGM_Users
       (iGM_Id, iGM_Uid, iGM_Username, iGM_Email, iGM_PasswordHash,
        iGM_Role, iGM_Status, iGM_EmailVerified, iGM_VerifiedOrgId,
        iGM_RulesAcceptedIp, iGM_RulesAcceptedAt,
        iGM_RegisterIp, iGM_LastLoginIp,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.uid,
      params.username,
      params.email,
      params.passwordHash,
      params.role,
      params.verifiedOrgId ?? null,
      params.rulesAcceptedIp ?? null,
      params.rulesAcceptedIp ? params.now : null,
      params.registerIp ?? null,
      params.registerIp ?? null,
      params.now,
      params.now,
    ],
  );
  const row = await iGM_FindUserById(params.id);
  if (!row) throw new Error("iGM_CreateUser：创建后查询用户失败");
  return row;
}

/** 按主键查询用户 */
export async function iGM_FindUserById(id: string): Promise<iGM_UserRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_Users WHERE iGM_Id = ?`)
      .get(id)) as iGM_UserRow | undefined) ?? null
  );
}

/** 按邮箱查询用户（邮箱存储为小写，唯一索引 NOCASE） */
export async function iGM_FindUserByEmail(
  email: string,
): Promise<iGM_UserRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_Users WHERE LOWER(iGM_Email) = LOWER(?)`)
      .get(email)) as iGM_UserRow | undefined) ?? null
  );
}

/** 按用户名查询用户 */
export async function iGM_FindUserByUsername(
  username: string,
): Promise<iGM_UserRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_Users WHERE LOWER(iGM_Username) = LOWER(?)`)
      .get(username)) as iGM_UserRow | undefined) ?? null
  );
}

/** 标记邮箱已验证，并刷新 updatedAt */
export async function iGM_MarkEmailVerified(
  userId: string,
  now: string,
): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_Users
       SET iGM_EmailVerified = 1, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [now, userId],
  );
  return result.changes > 0;
}

/** 更新密码哈希，并刷新 updatedAt */
export async function iGM_UpdatePassword(
  userId: string,
  passwordHash: string,
  now: string,
): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_Users
       SET iGM_PasswordHash = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [passwordHash, now, userId],
  );
  return result.changes > 0;
}

/** 管理员查询用户列表（分页，按创建时间倒序） */
export async function iGM_ListUsers(
  limit: number,
  offset: number,
): Promise<iGM_UserRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_Users
       ORDER BY iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset)) as iGM_UserRow[];
}

/** 统计用户总数 */
export async function iGM_CountUsers(): Promise<number> {
  const row = (await iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Users`)
    .get()) as { iGM_Count: number };
  return row.iGM_Count;
}

/** 按主键批量查询用户（帖子/评论列表组装作者信息，避免 N+1 查询） */
export async function iGM_FindUsersByIds(ids: string[]): Promise<iGM_UserRow[]> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(", ");
  return (await iGM_Db
    .query(`SELECT * FROM iGM_Users WHERE iGM_Id IN (${placeholders})`)
    .all(...unique)) as iGM_UserRow[];
}

/** 更新本人公开资料（昵称、头像 URL、简介、网站），并刷新 updatedAt */
export async function iGM_UpdateProfile(
  userId: string,
  fields: {
    displayName: string | null;
    avatar: string | null;
    bio: string | null;
    website: string | null;
    now: string;
  },
): Promise<boolean> {
  const result = await iGM_Db.run(
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
export async function iGM_UpdateUserAdmin(
  userId: string,
  fields: { role?: iGM_UserRole; status?: iGM_UserStatus; now: string },
): Promise<boolean> {
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
  const result = await iGM_Db.run(
    `UPDATE iGM_Users SET ${assignments.join(", ")} WHERE iGM_Id = ?`,
    values,
  );
  return result.changes > 0;
}

/** 模块二十五：登录成功后回写最后登录 IP（失败不阻断登录流程） */
export async function iGM_UpdateLastLoginIp(
  userId: string,
  ip: string | null,
  now: string,
): Promise<boolean> {
  if (!ip) return false;
  const result = await iGM_Db.run(
    `UPDATE iGM_Users
       SET iGM_LastLoginIp = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [ip, now, userId],
  );
  return result.changes > 0;
}

/**
 * 物理删除用户（模块七第三轮：自助注销 / 管理员删号共用出口）。
 * 数据库连接已开启 PRAGMA foreign_keys=ON，会话、令牌、帖子、评论、
 * 点赞、收藏、通知、积分、认证申请等关联行均按 ON DELETE CASCADE 自动清理；
 * 审核记录等弱关联按 ON DELETE SET NULL 保留留痕。
 */
export async function iGM_DeleteUser(userId: string): Promise<boolean> {
  const result = await iGM_Db.run(`DELETE FROM iGM_Users WHERE iGM_Id = ?`, [
    userId,
  ]);
  return result.changes > 0;
}

// 导出 //
export default {
  iGM_CreateUser,
  iGM_DeleteUser,
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
  iGM_UpdateLastLoginIp,
};
