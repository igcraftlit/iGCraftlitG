/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_ReportRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Post、G_Admin
 * 模块：iGM_ReportRepository
 * 作用：用户侧举报数据访问——插入举报行与待处理举报查重
 * 内容：iGM_InsertReport 写入举报；iGM_FindPendingReport 按举报人+目标查重；
 *       与 iGM_AdminRepository 的后台列表/处理查询互补
 */

// 导入依赖 //
import { randomUUID } from "node:crypto";
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type {
  iGM_ReportReason,
  iGM_ReportRow,
  iGM_ReportTargetType,
} from "../iGM_Types/iGM_Report";

// 类型定义 //
/** 新建举报的写入参数 */
export interface iGM_InsertReportParams {
  reporterId: string;
  targetType: iGM_ReportTargetType;
  targetId: string;
  reason: iGM_ReportReason;
  detail: string;
  now: string;
}

// 核心逻辑 //
/** 插入一条待处理举报（原因分类 + 描述） */
export async function iGM_InsertReport(
  params: iGM_InsertReportParams,
): Promise<string> {
  const id = randomUUID();
  await iGM_Db.run(
    `INSERT INTO iGM_Reports
       (iGM_Id, iGM_ReporterId, iGM_TargetType, iGM_TargetId,
        iGM_Reason, iGM_ReasonDetail, iGM_Status, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      id,
      params.reporterId,
      params.targetType,
      params.targetId,
      params.reason,
      params.detail,
      params.now,
    ],
  );
  return id;
}

/** 查询某举报人对某目标是否已存在待处理举报（防重，配合部分唯一索引兜底） */
export async function iGM_FindPendingReport(
  reporterId: string,
  targetType: iGM_ReportTargetType,
  targetId: string,
): Promise<iGM_ReportRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_Reports
          WHERE iGM_ReporterId = ?
            AND iGM_TargetType = ?
            AND iGM_TargetId = ?
            AND iGM_Status = 'pending'
          LIMIT 1`,
      )
      .get(reporterId, targetType, targetId)) as iGM_ReportRow | undefined) ??
    null
  );
}

// 导出 //
export default iGM_InsertReport;
