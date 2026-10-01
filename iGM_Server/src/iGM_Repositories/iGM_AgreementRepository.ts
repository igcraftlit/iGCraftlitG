/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_AgreementRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Auth
 * 模块：iGM_AgreementRepository
 * 作用：iGM_UserAgreements 表的唯一数据访问出口
 * 内容：写入同意记录（含版本与客户端 IP）、查询用户最近一次同意记录
 * 说明：版本变更时保留历史记录，注册第四步 IP 授权同意同样写入本表
 */

// 导入依赖 //
import { randomUUID } from "node:crypto";
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type { iGM_UserAgreementRow } from "../iGM_Types/iGM_Agreement";

// 类型定义 //
// （行类型见 iGM_Types/iGM_Agreement.ts）

// 核心逻辑 //
/** 写入一条用户协议同意记录 */
export async function iGM_InsertAgreement(params: {
  userId: string;
  version: string;
  acceptedIp: string | null;
  now: string;
}): Promise<iGM_UserAgreementRow> {
  const row: iGM_UserAgreementRow = {
    iGM_Id: randomUUID(),
    iGM_UserId: params.userId,
    iGM_Version: params.version,
    iGM_AcceptedIp: params.acceptedIp,
    iGM_AcceptedAt: params.now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_UserAgreements
       (iGM_Id, iGM_UserId, iGM_Version, iGM_AcceptedIp, iGM_AcceptedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UserId,
      row.iGM_Version,
      row.iGM_AcceptedIp,
      row.iGM_AcceptedAt,
    ],
  );
  return row;
}

/** 用户最近一次同意记录（不存在返回 null） */
export async function iGM_FindLatestAgreement(
  userId: string,
): Promise<iGM_UserAgreementRow | null> {
  return (
    ((await iGM_Db.query(
      `SELECT * FROM iGM_UserAgreements
       WHERE iGM_UserId = ? ORDER BY iGM_AcceptedAt DESC LIMIT 1`,
    ).get(userId)) as iGM_UserAgreementRow | undefined) ?? null
  );
}

/** 用户全部同意记录（按时间倒序，供留痕查询） */
export async function iGM_ListAgreementsByUser(userId: string): Promise<iGM_UserAgreementRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_UserAgreements
     WHERE iGM_UserId = ? ORDER BY iGM_AcceptedAt DESC`,
  ).all(userId)) as iGM_UserAgreementRow[];
}

// 导出 //
export default {
  iGM_InsertAgreement,
  iGM_FindLatestAgreement,
  iGM_ListAgreementsByUser,
};