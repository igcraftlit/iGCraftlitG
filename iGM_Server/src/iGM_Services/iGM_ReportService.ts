/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ReportService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Post
 * 模块：iGM_Report
 * 作用：用户侧举报业务——提交帖子举报的校验、防重与写入
 * 内容：iGM_SubmitPostReportService：原因枚举/描述长度校验、帖子存在性、
 *       同举报人同目标 pending 防重；后台列表与处理仍在 iGM_AdminService
 */

// 导入依赖 //
import { iGM_FindPostById } from "../iGM_Repositories/iGM_PostRepository";
import {
  iGM_FindPendingReport,
  iGM_InsertReport,
} from "../iGM_Repositories/iGM_ReportRepository";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";
import {
  iGM_IsReportReason,
  type iGM_ReportReason,
  type iGM_ReportSubmitInput,
} from "../iGM_Types/iGM_Report";

// 类型定义 //
/** 举报原因描述长度边界 */
export const iGM_ReportDetailMin = 5;
export const iGM_ReportDetailMax = 500;

/** 举报业务错误：携带语言包文案键与 HTTP 状态码 */
export class iGM_ReportError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_ReportError";
  }
}

// 核心逻辑 //
/**
 * 提交帖子举报：
 * 仅受理公开（published）帖子；原因必须为白名单分类；描述 5-500 字；
 * 同一举报人对同一帖子存在 pending 举报时拒绝（部分唯一索引兜底）。
 */
export async function iGM_SubmitPostReportService(
  reporter: iGM_UserRow,
  input: iGM_ReportSubmitInput,
): Promise<{ reportId: string }> {
  const targetId = input.targetId.trim();
  if (!targetId) {
    throw new iGM_ReportError("community.errors.postNotFound", 404);
  }
  if (input.targetType !== "post") {
    throw new iGM_ReportError("report.errors.badRequest", 400);
  }

  let reason: iGM_ReportReason;
  if (iGM_IsReportReason(input.reason)) {
    reason = input.reason;
  } else {
    throw new iGM_ReportError("report.errors.reasonInvalid", 422);
  }

  const detail = input.detail.trim();
  if (detail.length < iGM_ReportDetailMin || detail.length > iGM_ReportDetailMax) {
    throw new iGM_ReportError("report.errors.detailLength", 422);
  }

  const post = await iGM_FindPostById(targetId);
  if (!post || post.iGM_Status !== "published") {
    throw new iGM_ReportError("community.errors.postNotFound", 404);
  }

  const existing = await iGM_FindPendingReport(
    reporter.iGM_Id,
    "post",
    targetId,
  );
  if (existing) {
    throw new iGM_ReportError("report.errors.duplicatePending", 409);
  }

  const reportId = await iGM_InsertReport({
    reporterId: reporter.iGM_Id,
    targetType: "post",
    targetId,
    reason,
    detail,
    now: new Date().toISOString(),
  });

  return { reportId };
}

// 导出 //
export default iGM_SubmitPostReportService;
