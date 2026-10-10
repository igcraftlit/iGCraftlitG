/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamCleanupService.ts
 * 所属层：后端 / 业务服务层
 * 路由：无（启动时注册的定时任务）
 * 模块：iGM_ExamCleanupService
 * 作用：清理临时目录中未确认或解析失败的试卷原始文件
 * 内容：保留期判定（未确认 7 天 / 解析失败 24 小时）、磁盘文件删除、
 *       文件行临时路径置空、试卷标记原始文件已删除、定时器注册
 * 说明：已确认的文件由确认流程立即删除，不在本任务处理范围内；
 *       清理失败仅记录日志，不影响其他文件
 */

// 导入依赖 //
import {
  iGM_ClearExamFileTempPath,
  iGM_ListExamFilesWithTempPath,
  iGM_MarkExamOriginalDeleted,
} from "../iGM_Repositories/iGM_ExamRepository";
import { iGM_RemoveExamTempFile } from "./iGM_ExamIngestService";

// 类型定义 //
// （本服务仅对外暴露执行与注册两个函数）

// 核心逻辑 //
/** 未确认文件的保留期：7 天 */
const iGM_ExamRetentionMs = 7 * 24 * 60 * 60 * 1000;
/** 解析失败文件的保留期：24 小时 */
const iGM_ExamFailedRetentionMs = 24 * 60 * 60 * 1000;
/** 定时清理间隔：6 小时 */
const iGM_ExamCleanupIntervalMs = 6 * 60 * 60 * 1000;

/** 单个文件行的保留期（毫秒） */
function iGM_ExamRetentionFor(parseStatus: string): number {
  return parseStatus === "failed"
    ? iGM_ExamFailedRetentionMs
    : iGM_ExamRetentionMs;
}

/**
 * 执行一次清理：删除超过保留期的原始文件
 * @returns 本次清理的文件数量
 */
export async function iGM_RunExamCleanup(): Promise<number> {
  const files = await iGM_ListExamFilesWithTempPath();
  const now = Date.now();
  let removed = 0;
  for (const file of files) {
    const uploadedAt = Date.parse(file.iGM_UploadedAt);
    if (!Number.isFinite(uploadedAt)) continue;
    if (now - uploadedAt < iGM_ExamRetentionFor(file.iGM_ParseStatus)) continue;
    if (file.iGM_TempPath) {
      await iGM_RemoveExamTempFile(file.iGM_TempPath);
    }
    const stamp = new Date().toISOString();
    await iGM_ClearExamFileTempPath(file.iGM_ExamId, stamp);
    await iGM_MarkExamOriginalDeleted(file.iGM_ExamId);
    removed += 1;
  }
  if (removed > 0) {
    console.log(`[iGM_ExamCleanupService] 已清理过期试卷文件 ${removed} 个`);
  }
  return removed;
}

/**
 * 注册定时清理任务：启动后立即执行一次，随后每 6 小时执行一次
 * 定时器不解除引用，进程退出即随之结束
 */
export function iGM_StartExamCleanup(): void {
  void iGM_RunExamCleanup().catch((error) => {
    console.warn(`[iGM_ExamCleanupService] 启动清理失败：${String(error)}`);
  });
  setInterval(() => {
    void iGM_RunExamCleanup().catch((error) => {
      console.warn(`[iGM_ExamCleanupService] 定时清理失败：${String(error)}`);
    });
  }, iGM_ExamCleanupIntervalMs);
}

// 导出 //
export default {
  iGM_RunExamCleanup,
  iGM_StartExamCleanup,
};
