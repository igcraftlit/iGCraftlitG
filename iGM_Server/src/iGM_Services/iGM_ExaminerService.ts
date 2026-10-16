/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExaminerService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Examiner（/G_Examiner/revoke）、/api/exam/creator/profile
 * 模块：iGM_ExaminerService
 * 作用：命题创作者资格判定、强制校验、编号档案查询、撤销资格
 * 说明：命题创作者资格审核通过后写入 iGM_Examiners；
 *       已被撤销或未通过的用户不能上传 / 管理试卷；
 *       申请审核与命题方预设模块已于 047 迁移移除
 */

// 导入依赖 //
import {
  iGM_FindExaminerByUser,
  iGM_RemoveExaminer,
} from "../iGM_Repositories/iGM_ExaminerRepository";
import type { iGM_CreatorProfileDto } from "../iGM_Types/iGM_Examiner";

// 核心逻辑 //
/** 命题创作者业务错误：message 为可直接展示的中文提示 */
export class iGM_ExaminerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_ExaminerError";
  }
}

/** 当前用户是否为在册（active）命题创作者 */
export async function iGM_IsActiveExaminer(userId: string): Promise<boolean> {
  const row = await iGM_FindExaminerByUser(userId);
  return Boolean(row && row.iGM_Status === "active");
}

/** 强制要求当前用户具备命题创作者资格，否则抛 403 */
export async function iGM_RequireExaminer(userId: string): Promise<void> {
  if (!(await iGM_IsActiveExaminer(userId))) {
    throw new iGM_ExaminerError("尚无命题创作者资格", 403);
  }
}

/**
 * 命题者编号档案：仅当用户存在「在册（active）且已分配编号」的创作者行时返回，
 * 否则返回 null（访客、非命题创作者、已撤销或尚未编号的用户）
 */
export async function iGM_GetCreatorProfileService(
  userId: string,
): Promise<iGM_CreatorProfileDto | null> {
  const examiner = await iGM_FindExaminerByUser(userId);
  if (
    !examiner ||
    examiner.iGM_Status !== "active" ||
    !examiner.iGM_CreatorNumber
  ) {
    return null;
  }
  return {
    isExaminer: true,
    creatorNumber: examiner.iGM_CreatorNumber,
    status: "approved",
  };
}

/** 管理端：撤销命题创作者资格 */
export async function iGM_RevokeExaminerService(
  userId: string,
): Promise<void> {
  await iGM_RemoveExaminer(userId);
}

// 导出 //
export default {
  iGM_IsActiveExaminer,
  iGM_RequireExaminer,
  iGM_GetCreatorProfileService,
  iGM_RevokeExaminerService,
};
