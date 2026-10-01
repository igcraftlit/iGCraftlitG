/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_OAuthRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_OAuth
 * 模块：iGM_OAuthRepository
 * 作用：模块二十一 OAuth/OIDC 六张表的唯一数据访问出口
 * 内容：应用（Clients）增查改删、授权码（Codes）签发与核销、
 *       令牌（Tokens）签发/查询/撤销、用户授权同意（Consents）读写、
 *       操作日志（Logs）写入与检索、签名密钥（Keys）读取与写入
 * 说明：令牌与 client_secret 一律只存哈希，本层不接触任何明文密钥
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type {
  iGM_OAuthClientRow,
  iGM_OAuthCodeRow,
  iGM_OAuthConsentRow,
  iGM_OAuthKeyRow,
  iGM_OAuthLogRow,
  iGM_OAuthTokenRow,
} from "../iGM_Types/iGM_OAuth";

// 类型定义 //
/** 管理端应用列表行：连申请人用户名与昵称 */
export interface iGM_OAuthClientAdminRow extends iGM_OAuthClientRow {
  iGM_Username: string;
  iGM_DisplayName: string | null;
}

/** 用户授权同意列表行：连应用基本信息 */
export interface iGM_OAuthConsentClientRow extends iGM_OAuthConsentRow {
  iGM_Name: string;
  iGM_Type: string;
  iGM_Description: string;
  iGM_Status: string;
}

// 核心逻辑 //
/* ---------- 应用 Clients ---------- */

/** 写入一条 OAuth 应用（初始状态 pending，secret 为空） */
export async function iGM_InsertOAuthClient(params: {
  id: string;
  clientId: string;
  name: string;
  type: string;
  description: string;
  redirectUris: string;
  scopes: string;
  purpose: string;
  contact: string;
  ownerUid: string;
  now: string;
}): Promise<iGM_OAuthClientRow> {
  await iGM_Db.run(
    `INSERT INTO iGM_OAuthClients
       (iGM_Id, iGM_ClientId, iGM_ClientSecretHash, iGM_Name, iGM_Type,
        iGM_Description, iGM_RedirectUris, iGM_Scopes, iGM_Purpose,
        iGM_Contact, iGM_OwnerUid, iGM_Status, iGM_ReviewerId,
        iGM_ReviewComment, iGM_SecretRotatedAt, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
    [
      params.id,
      params.clientId,
      params.name,
      params.type,
      params.description,
      params.redirectUris,
      params.scopes,
      params.purpose,
      params.contact,
      params.ownerUid,
      params.now,
      params.now,
    ],
  );
  const row = await iGM_FindOAuthClientById(params.id);
  if (!row) throw new Error("iGM_InsertOAuthClient：写入后查询失败");
  return row;
}

/** 按主键查询应用 */
export async function iGM_FindOAuthClientById(
  id: string,
): Promise<iGM_OAuthClientRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_OAuthClients WHERE iGM_Id = ?`)
      .get(id)) as iGM_OAuthClientRow | undefined) ?? null
  );
}

/** 按 client_id 查询应用 */
export async function iGM_FindOAuthClientByClientId(
  clientId: string,
): Promise<iGM_OAuthClientRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_OAuthClients WHERE iGM_ClientId = ?`)
      .get(clientId)) as iGM_OAuthClientRow | undefined) ?? null
  );
}

/** 开发者侧：按申请人 UID 列出全部应用（创建时间倒序） */
export async function iGM_ListOAuthClientsByOwner(
  ownerUid: string,
): Promise<iGM_OAuthClientRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_OAuthClients
     WHERE iGM_OwnerUid = ? ORDER BY iGM_CreatedAt DESC`,
  ).all(ownerUid)) as iGM_OAuthClientRow[];
}

/** 管理端：按状态分页列出应用（连申请人用户名与昵称） */
export async function iGM_ListOAuthClientsForAdmin(params: {
  status: string | null;
  limit: number;
  offset: number;
}): Promise<{ items: iGM_OAuthClientAdminRow[]; total: number }> {
  const where = params.status ? `WHERE c.iGM_Status = ?` : "";
  const args: Array<string | number> = params.status ? [params.status] : [];
  const total = (
    (await iGM_Db
      .query(`SELECT COUNT(*) AS total FROM iGM_OAuthClients c ${where}`)
      .get(...args)) as { total: number }
  ).total;
  const items = (await iGM_Db.query(
    `SELECT c.*, u.iGM_Username, u.iGM_DisplayName
     FROM iGM_OAuthClients c
     JOIN iGM_Users u ON u.iGM_Uid = c.iGM_OwnerUid
     ${where}
     ORDER BY c.iGM_CreatedAt DESC
     LIMIT ? OFFSET ?`,
  ).all(...args, params.limit, params.offset)) as iGM_OAuthClientAdminRow[];
  return { items, total };
}

/** 审核：仅待审核可被审核，写入状态、审核人与意见 */
export async function iGM_ReviewOAuthClient(params: {
  id: string;
  status: string;
  reviewerId: string;
  reviewComment: string | null;
  now: string;
}): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_OAuthClients
     SET iGM_Status = ?, iGM_ReviewerId = ?, iGM_ReviewComment = ?,
         iGM_UpdatedAt = ?
     WHERE iGM_Id = ? AND iGM_Status = 'pending'`,
    [
      params.status,
      params.reviewerId,
      params.reviewComment,
      params.now,
      params.id,
    ],
  );
  return result.changes > 0;
}

/** 管理端：更新应用状态（启用 / 禁用 / 删除前置） */
export async function iGM_UpdateOAuthClientStatus(params: {
  id: string;
  status: string;
  reviewerId: string;
  now: string;
}): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_OAuthClients
     SET iGM_Status = ?, iGM_ReviewerId = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [params.status, params.reviewerId, params.now, params.id],
  );
  return result.changes > 0;
}

/** 写入 / 重置 client_secret 哈希（明文不落库） */
export async function iGM_SetOAuthClientSecret(params: {
  id: string;
  secretHash: string;
  now: string;
}): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_OAuthClients
     SET iGM_ClientSecretHash = ?, iGM_SecretRotatedAt = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [params.secretHash, params.now, params.now, params.id],
  );
  return result.changes > 0;
}

/** 开发者撤回本人待审核申请 */
export async function iGM_WithdrawOAuthClient(params: {
  id: string;
  ownerUid: string;
  now: string;
}): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_OAuthClients
     SET iGM_Status = 'withdrawn', iGM_UpdatedAt = ?
     WHERE iGM_Id = ? AND iGM_OwnerUid = ? AND iGM_Status = 'pending'`,
    [params.now, params.id, params.ownerUid],
  );
  return result.changes > 0;
}

/** 删除应用（级联清理授权码 / 令牌 / 同意记录） */
export async function iGM_DeleteOAuthClient(id: string): Promise<boolean> {
  const result = await iGM_Db.run(`DELETE FROM iGM_OAuthClients WHERE iGM_Id = ?`, [
    id,
  ]);
  return result.changes > 0;
}

/* ---------- 授权码 Codes ---------- */

/** 写入一次性授权码 */
export async function iGM_InsertOAuthCode(params: {
  id: string;
  code: string;
  clientId: string;
  userId: string;
  scope: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  nonce: string | null;
  expiresAt: string;
  now: string;
}): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO iGM_OAuthCodes
       (iGM_Id, iGM_Code, iGM_ClientId, iGM_UserId, iGM_Scope, iGM_RedirectUri,
        iGM_CodeChallenge, iGM_CodeChallengeMethod, iGM_Nonce, iGM_ExpiresAt,
        iGM_Used, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      params.id,
      params.code,
      params.clientId,
      params.userId,
      params.scope,
      params.redirectUri,
      params.codeChallenge,
      params.codeChallengeMethod,
      params.nonce,
      params.expiresAt,
      params.now,
    ],
  );
}

/** 按授权码查询 */
export async function iGM_FindOAuthCodeByCode(
  code: string,
): Promise<iGM_OAuthCodeRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_OAuthCodes WHERE iGM_Code = ?`)
      .get(code)) as iGM_OAuthCodeRow | undefined) ?? null
  );
}

/** 核销授权码：仅未使用时可标记，保证一次性 */
export async function iGM_MarkOAuthCodeUsed(id: string): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_OAuthCodes SET iGM_Used = 1 WHERE iGM_Id = ? AND iGM_Used = 0`,
    [id],
  );
  return result.changes > 0;
}

/* ---------- 令牌 Tokens ---------- */

/** 写入令牌行（传入的 access/refresh 均为哈希） */
export async function iGM_InsertOAuthToken(params: {
  id: string;
  accessTokenHash: string;
  refreshTokenHash: string | null;
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: string;
  refreshExpiresAt: string | null;
  now: string;
}): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO iGM_OAuthTokens
       (iGM_Id, iGM_AccessToken, iGM_RefreshToken, iGM_ClientId, iGM_UserId,
        iGM_Scope, iGM_ExpiresAt, iGM_RefreshExpiresAt, iGM_Revoked,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      params.id,
      params.accessTokenHash,
      params.refreshTokenHash,
      params.clientId,
      params.userId,
      params.scope,
      params.expiresAt,
      params.refreshExpiresAt,
      params.now,
      params.now,
    ],
  );
}

/** 按 access_token 哈希查询 */
export async function iGM_FindOAuthTokenByAccessHash(
  hash: string,
): Promise<iGM_OAuthTokenRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_OAuthTokens WHERE iGM_AccessToken = ?`)
      .get(hash)) as iGM_OAuthTokenRow | undefined) ?? null
  );
}

/** 按 refresh_token 哈希查询 */
export async function iGM_FindOAuthTokenByRefreshHash(
  hash: string,
): Promise<iGM_OAuthTokenRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_OAuthTokens WHERE iGM_RefreshToken = ?`)
      .get(hash)) as iGM_OAuthTokenRow | undefined) ?? null
  );
}

/** 按主键撤销令牌 */
export async function iGM_RevokeOAuthTokenById(id: string, now: string): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_OAuthTokens SET iGM_Revoked = 1, iGM_UpdatedAt = ?
     WHERE iGM_Id = ? AND iGM_Revoked = 0`,
    [now, id],
  );
  return result.changes > 0;
}

/** 撤销某用户在某个应用下的全部令牌（用户取消授权时调用） */
export async function iGM_RevokeOAuthTokensByUserClient(params: {
  userId: string;
  clientId: string;
  now: string;
}): Promise<number> {
  const result = await iGM_Db.run(
    `UPDATE iGM_OAuthTokens SET iGM_Revoked = 1, iGM_UpdatedAt = ?
     WHERE iGM_UserId = ? AND iGM_ClientId = ? AND iGM_Revoked = 0`,
    [params.now, params.userId, params.clientId],
  );
  return result.changes;
}

/** 撤销某应用下已签发的全部令牌（管理端禁用应用时调用） */
export async function iGM_RevokeOAuthTokensByClient(params: {
  clientId: string;
  now: string;
}): Promise<number> {
  const result = await iGM_Db.run(
    `UPDATE iGM_OAuthTokens SET iGM_Revoked = 1, iGM_UpdatedAt = ?
     WHERE iGM_ClientId = ? AND iGM_Revoked = 0`,
    [params.now, params.clientId],
  );
  return result.changes;
}

/* ---------- 授权同意 Consents ---------- */

/** 写入或更新用户对某应用的授权同意（按 用户+应用 唯一） */
export async function iGM_UpsertOAuthConsent(params: {
  id: string;
  userId: string;
  clientId: string;
  scope: string;
  now: string;
}): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO iGM_OAuthConsents
       (iGM_Id, iGM_UserId, iGM_ClientId, iGM_Scope, iGM_GrantedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (iGM_UserId, iGM_ClientId)
     DO UPDATE SET iGM_Scope = excluded.iGM_Scope,
                   iGM_UpdatedAt = excluded.iGM_UpdatedAt`,
    [params.id, params.userId, params.clientId, params.scope, params.now, params.now],
  );
}

/** 查询用户对某应用的授权同意 */
export async function iGM_FindOAuthConsent(
  userId: string,
  clientId: string,
): Promise<iGM_OAuthConsentRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_OAuthConsents
         WHERE iGM_UserId = ? AND iGM_ClientId = ?`,
      )
      .get(userId, clientId)) as iGM_OAuthConsentRow | undefined) ?? null
  );
}

/** 用户侧：列出已授权应用（连应用基本信息） */
export async function iGM_ListOAuthConsentsByUser(
  userId: string,
): Promise<iGM_OAuthConsentClientRow[]> {
  return (await iGM_Db.query(
    `SELECT s.*, c.iGM_Name, c.iGM_Type, c.iGM_Description, c.iGM_Status
     FROM iGM_OAuthConsents s
     JOIN iGM_OAuthClients c ON c.iGM_ClientId = s.iGM_ClientId
     WHERE s.iGM_UserId = ?
     ORDER BY s.iGM_GrantedAt DESC`,
  ).all(userId)) as iGM_OAuthConsentClientRow[];
}

/** 删除用户对某应用的授权同意（取消授权） */
export async function iGM_DeleteOAuthConsent(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const result = await iGM_Db.run(
    `DELETE FROM iGM_OAuthConsents WHERE iGM_UserId = ? AND iGM_ClientId = ?`,
    [userId, clientId],
  );
  return result.changes > 0;
}

/* ---------- 操作日志 Logs ---------- */

/** 写入一条 OAuth 操作日志 */
export async function iGM_InsertOAuthLog(params: {
  id: string;
  clientId: string | null;
  userId: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
  now: string;
}): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO iGM_OAuthLogs
       (iGM_Id, iGM_ClientId, iGM_UserId, iGM_Action, iGM_Detail, iGM_Ip, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.clientId,
      params.userId,
      params.action,
      params.detail,
      params.ip,
      params.now,
    ],
  );
}

/** 按应用分页检索日志（时间倒序） */
export async function iGM_ListOAuthLogsByClient(params: {
  clientId: string;
  limit: number;
  offset: number;
}): Promise<{ items: iGM_OAuthLogRow[]; total: number }> {
  const total = (
    (await iGM_Db
      .query(
        `SELECT COUNT(*) AS total FROM iGM_OAuthLogs WHERE iGM_ClientId = ?`,
      )
      .get(params.clientId)) as { total: number }
  ).total;
  const items = (await iGM_Db.query(
    `SELECT * FROM iGM_OAuthLogs
     WHERE iGM_ClientId = ?
     ORDER BY iGM_CreatedAt DESC
     LIMIT ? OFFSET ?`,
  ).all(params.clientId, params.limit, params.offset)) as iGM_OAuthLogRow[];
  return { items, total };
}

/* ---------- 签名密钥 Keys ---------- */

/** 读取某类别的当前启用密钥 */
export async function iGM_FindActiveOAuthKey(
  kind: string,
): Promise<iGM_OAuthKeyRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_OAuthKeys
         WHERE iGM_Kind = ? AND iGM_Active = 1
         ORDER BY iGM_CreatedAt DESC LIMIT 1`,
      )
      .get(kind)) as iGM_OAuthKeyRow | undefined) ?? null
  );
}

/** 读取某类别的全部启用密钥（JWKS 需暴露历史公钥，便于轮换平滑过渡） */
export async function iGM_ListActiveOAuthKeys(kind: string): Promise<iGM_OAuthKeyRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_OAuthKeys
     WHERE iGM_Kind = ? AND iGM_Active = 1
     ORDER BY iGM_CreatedAt DESC`,
  ).all(kind)) as iGM_OAuthKeyRow[];
}

/** 写入一条密钥 */
export async function iGM_InsertOAuthKey(params: {
  id: string;
  kind: string;
  kid: string;
  alg: string;
  publicJwk: string;
  privateJwk: string;
  now: string;
}): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO iGM_OAuthKeys
       (iGM_Id, iGM_Kind, iGM_Kid, iGM_Alg, iGM_PublicJwk, iGM_PrivateJwk,
        iGM_Active, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      params.id,
      params.kind,
      params.kid,
      params.alg,
      params.publicJwk,
      params.privateJwk,
      params.now,
    ],
  );
}

// 导出 //
export default {
  iGM_InsertOAuthClient,
  iGM_FindOAuthClientById,
  iGM_FindOAuthClientByClientId,
  iGM_ListOAuthClientsByOwner,
  iGM_ListOAuthClientsForAdmin,
  iGM_ReviewOAuthClient,
  iGM_UpdateOAuthClientStatus,
  iGM_SetOAuthClientSecret,
  iGM_WithdrawOAuthClient,
  iGM_DeleteOAuthClient,
  iGM_InsertOAuthCode,
  iGM_FindOAuthCodeByCode,
  iGM_MarkOAuthCodeUsed,
  iGM_InsertOAuthToken,
  iGM_FindOAuthTokenByAccessHash,
  iGM_FindOAuthTokenByRefreshHash,
  iGM_RevokeOAuthTokenById,
  iGM_RevokeOAuthTokensByUserClient,
  iGM_RevokeOAuthTokensByClient,
  iGM_UpsertOAuthConsent,
  iGM_FindOAuthConsent,
  iGM_ListOAuthConsentsByUser,
  iGM_DeleteOAuthConsent,
  iGM_InsertOAuthLog,
  iGM_ListOAuthLogsByClient,
  iGM_FindActiveOAuthKey,
  iGM_ListActiveOAuthKeys,
  iGM_InsertOAuthKey,
};
