/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Examiner.ts
 * 所属层：后端 / 路由层
 * 路由：/api/exam/creator/profile（命题者编号档案）、/G_Examiner/revoke
 * 模块：G_Examiner
 * 作用：命题创作者编号档案查询、撤销命题创作者资格
 * 内容：命题者编号档案（/api/exam/creator/profile）、管理端撤销资格
 * 说明：命题创作者申请与命题方预设模块已于 047 迁移移除
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import {
  iGM_ClientIp,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_IsStaff, iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_ExaminerError,
  iGM_GetCreatorProfileService,
  iGM_RevokeExaminerService,
} from "../iGM_Services/iGM_ExaminerService";

// 核心逻辑 //
/** 管理端：撤销命题创作者资格 */
async function iGM_HandleRevoke(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  if (!iGM_IsStaff(user)) {
    throw new iGM_ExaminerError("无权执行此操作", 403);
  }
  iGM_EnforceRateLimit(
    ctx,
    "adminWrite",
    `user:${user.iGM_Id}:${iGM_ClientIp(ctx)}`,
  );
  const userId = iGM_Field(ctx.body, "userId").trim();
  if (!userId) throw new iGM_ExaminerError("缺少用户 ID", 400);
  await iGM_RevokeExaminerService(userId);
  return iGM_Ok({ userId }, "命题创作者资格已撤销");
}

/* ---------- 命题者编号档案（登录用户；非命题创作者返回 NOT_EXAMINER） ---------- */
async function iGM_HandleCreatorProfile(ctx: iGM_RouteContext) {
  const user = await iGM_CurrentUser(ctx);
  const profile = user
    ? await iGM_GetCreatorProfileService(user.iGM_Id)
    : null;
  // 未登录 / 非在册命题创作者：HTTP 200 + success:false + 字符串码，不抛错
  if (!profile) {
    return {
      success: false as const,
      code: "NOT_EXAMINER",
      message: "当前账号不是命题创作者",
      data: null,
    };
  }
  return iGM_Ok(profile);
}

/**
 * G_Examiner 命题创作者路由集合
 * 业务错误统一抛 iGM_ExaminerError，由 iGM_ServerMain 全局错误处理器格式化
 */
export const G_Examiner = new Elysia({ name: "G_Examiner" })
  .get("/api/exam/creator/profile", iGM_HandleCreatorProfile as never)
  .post("/G_Examiner/revoke", iGM_HandleRevoke as never);

// 导出 //
export default G_Examiner;
