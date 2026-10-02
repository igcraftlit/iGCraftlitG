/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_DeveloperStatsRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Admin
 * 模块：iGM_DeveloperStatsRepository
 * 作用：管理后台「开发者」分区的数据访问封装
 * 内容：已通过开发者账号列表（用户名 / iGMUid / 联系方式 / 申请时间）、
 *       iGM_DeveloperCallStats 调用量事件写入与多维度聚合（总量 / 通道 / 按日 / 按应用）
 * 说明：iGM_Channel 取值为 api / sdk / app 且可扩展，后续新增开发者项目
 *       只要按新通道写入事件，监测面板自动纳入聚合，无需改动本文件
 */

// 导入依赖 //
import { randomUUID } from "node:crypto";
import { iGM_Db } from "../iGM_Database/iGM_Database";

// 类型定义 //
/** 已通过开发者账号行 */
export interface iGM_DeveloperAccountRow {
  iGM_ApplicationId: string;
  iGM_UserId: string;
  iGM_Username: string;
  iGM_DisplayName: string | null;
  iGM_Uid: string;
  iGM_Contact: string;
  iGM_ProjectName: string;
  iGM_AppliedAt: string;
}

/** 通道聚合行 */
export interface iGM_ChannelCountRow {
  iGM_Channel: string;
  iGM_Count: number;
}

/** 按日 + 通道聚合行 */
export interface iGM_DailyCountRow {
  iGM_Day: string;
  iGM_Channel: string;
  iGM_Count: number;
}

/** 按应用聚合行 */
export interface iGM_ClientCountRow {
  iGM_ClientId: string;
  iGM_Count: number;
}

/** 调用量事件入参 */
export interface iGM_InsertCallStatParams {
  channel: string;
  action: string;
  clientId?: string | null;
  developerUid?: string | null;
  ip?: string | null;
  now: string;
}

// 核心逻辑 //
/**
 * 已通过开发者账号列表：每个用户只取最近一条 approved 申请
 * （PostgreSQL DISTINCT ON），附用户名、昵称、iGMUid 与联系方式
 */
export async function iGM_ListApprovedDeveloperAccounts(): Promise<
  iGM_DeveloperAccountRow[]
> {
  return (await iGM_Db.query(
    `SELECT DISTINCT ON (a.iGM_UserId)
            a.iGM_Id AS iGM_ApplicationId,
            a.iGM_UserId,
            u.iGM_Username,
            u.iGM_DisplayName,
            u.iGM_Uid,
            a.iGM_Contact,
            a.iGM_ProjectName,
            a.iGM_CreatedAt AS iGM_AppliedAt
       FROM iGM_DeveloperApplications a
       JOIN iGM_Users u ON u.iGM_Id = a.iGM_UserId
      WHERE a.iGM_Status = 'approved'
      ORDER BY a.iGM_UserId, a.iGM_CreatedAt DESC`,
  ).all()) as iGM_DeveloperAccountRow[];
}

/** 写入一条开发者调用量事件（供开放 API / SDK / OAuth 应用链路记录） */
export async function iGM_InsertDeveloperCallStat(
  params: iGM_InsertCallStatParams,
): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO iGM_DeveloperCallStats
       (iGM_Id, iGM_Channel, iGM_Action, iGM_ClientId, iGM_DeveloperUid, iGM_Ip, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      params.channel,
      params.action,
      params.clientId ?? null,
      params.developerUid ?? null,
      params.ip ?? null,
      params.now,
    ],
  );
}

/** 时间范围内总调用量 */
export async function iGM_CountCallStatsSince(sinceIso: string): Promise<number> {
  const row = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Total
         FROM iGM_DeveloperCallStats
        WHERE iGM_CreatedAt >= ?`,
    )
    .get(sinceIso)) as { iGM_Total: number };
  return row.iGM_Total;
}

/** 时间范围内按通道聚合（api / sdk / app 及未来扩展通道） */
export async function iGM_CountCallStatsByChannel(
  sinceIso: string,
): Promise<iGM_ChannelCountRow[]> {
  return (await iGM_Db.query(
    `SELECT iGM_Channel, COUNT(*) AS iGM_Count
       FROM iGM_DeveloperCallStats
      WHERE iGM_CreatedAt >= ?
      GROUP BY iGM_Channel
      ORDER BY iGM_Count DESC`,
  ).all(sinceIso)) as iGM_ChannelCountRow[];
}

/** 时间范围内按日 + 通道聚合（UTC 日期，YYYY-MM-DD） */
export async function iGM_CountCallStatsDaily(
  sinceIso: string,
): Promise<iGM_DailyCountRow[]> {
  return (await iGM_Db.query(
    `SELECT LEFT(iGM_CreatedAt, 10) AS iGM_Day,
            iGM_Channel,
            COUNT(*) AS iGM_Count
       FROM iGM_DeveloperCallStats
      WHERE iGM_CreatedAt >= ?
      GROUP BY LEFT(iGM_CreatedAt, 10), iGM_Channel
      ORDER BY iGM_Day ASC`,
  ).all(sinceIso)) as iGM_DailyCountRow[];
}

/** 时间范围内按应用（clientId）聚合，取调用量前 20 */
export async function iGM_CountCallStatsByClient(
  sinceIso: string,
): Promise<iGM_ClientCountRow[]> {
  return (await iGM_Db.query(
    `SELECT iGM_ClientId, COUNT(*) AS iGM_Count
       FROM iGM_DeveloperCallStats
      WHERE iGM_CreatedAt >= ?
        AND iGM_ClientId IS NOT NULL
      GROUP BY iGM_ClientId
      ORDER BY iGM_Count DESC
      LIMIT 20`,
  ).all(sinceIso)) as iGM_ClientCountRow[];
}

// 导出 //
export default {
  iGM_ListApprovedDeveloperAccounts,
  iGM_InsertDeveloperCallStat,
  iGM_CountCallStatsSince,
  iGM_CountCallStatsByChannel,
  iGM_CountCallStatsDaily,
  iGM_CountCallStatsByClient,
};
