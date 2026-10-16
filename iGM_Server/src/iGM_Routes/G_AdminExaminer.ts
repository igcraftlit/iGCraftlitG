/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_AdminExaminer.ts
 * 所属层：后端 / 路由层
 * 路由：/api/admin/examiner-applications/*
 * 模块：G_AdminExaminer
 * 作用：主站管理后台「命题创作者申请审核」接口集合
 * 内容：申请列表（分页 + 状态筛选 + 关键词搜索）、申请详情、
 *       审核通过（授予命题创作者资格并自动分配命题者编号）、
 *       拒绝申请（必须填写拒绝理由）
 * 约束：统一响应 { success, code, message, data }；全部接口仅管理员（admin）可访问，
 *       权限校验在本路由内强制执行，禁止前端传参决定身份
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_CurrentUser, iGM_Field, iGM_Query, type iGM_RouteContext } from "./iGM_RouteSupport";
import { iGM_RequireRole } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_ExaminerError,
  iGM_GetExaminerApplicationDetailService,
  iGM_ListExaminerApplicationsService,
  iGM_ReviewExaminerApplicationService,
} from "../iGM_Services/iGM_ExaminerService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/**
 * 管理端强制守卫：仅 admin 角色可访问，返回管理员用户行
 * 前端角色控制仅为体验优化，这里才是真正的安全边界
 */
async function iGM_RequireAdmin(ctx: iGM_RouteContext) {
  return iGM_RequireRole(await iGM_CurrentUser(ctx), "admin");
}

/** 读取路径中的申请 ID */
function iGM_RequireApplicationId(ctx: iGM_RouteContext): string {
  const id = (ctx.params?.id ?? "").trim();
  if (!id) throw new iGM_ExaminerError("缺少申请 ID", 400);
  return id;
}

/* ---------- 申请列表（分页 + 状态筛选 + 关键词搜索） ---------- */
async function iGM_HandleListApplications(ctx: iGM_RouteContext) {
  await iGM_RequireAdmin(ctx);
  const page = Number(iGM_Query(ctx.query, "page", "1"));
  const pageSize = Number(iGM_Query(ctx.query, "pageSize", "20"));
  return iGM_Ok(
    await iGM_ListExaminerApplicationsService({
      status: iGM_Query(ctx.query, "status") || undefined,
      q: iGM_Query(ctx.query, "q") || undefined,
      page,
      pageSize,
    }),
  );
}

/* ---------- 申请详情 ---------- */
async function iGM_HandleApplicationDetail(ctx: iGM_RouteContext) {
  await iGM_RequireAdmin(ctx);
  const id = iGM_RequireApplicationId(ctx);
  return iGM_Ok(await iGM_GetExaminerApplicationDetailService(id));
}

/* ---------- 审核通过（授予资格并分配编号） ---------- */
async function iGM_HandleApprove(ctx: iGM_RouteContext) {
  const admin = await iGM_RequireAdmin(ctx);
  const id = iGM_RequireApplicationId(ctx);
  const comment = iGM_Field(ctx.body, "comment").trim() || null;
  await iGM_ReviewExaminerApplicationService(id, admin.iGM_Id, "approve", comment);
  return iGM_Ok({ id, status: "approved" }, "审核通过");
}

/* ---------- 拒绝申请（必须填写拒绝理由） ---------- */
async function iGM_HandleReject(ctx: iGM_RouteContext) {
  const admin = await iGM_RequireAdmin(ctx);
  const id = iGM_RequireApplicationId(ctx);
  const reason = iGM_Field(ctx.body, "reason").trim();
  if (!reason) throw new iGM_ExaminerError("请填写拒绝理由", 400);
  await iGM_ReviewExaminerApplicationService(id, admin.iGM_Id, "reject", reason);
  return iGM_Ok({ id, status: "rejected" }, "已拒绝");
}

/**
 * G_AdminExaminer 管理端命题创作者申请审核路由集合
 * 业务错误统一抛 iGM_ExaminerError / iGM_AuthError，
 * 由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */
export const G_AdminExaminer = new Elysia({ name: "G_AdminExaminer" })
  .get("/api/admin/examiner-applications", iGM_HandleListApplications as never)
  .get("/api/admin/examiner-applications/:id", iGM_HandleApplicationDetail as never)
  .post("/api/admin/examiner-applications/:id/approve", iGM_HandleApprove as never)
  .post("/api/admin/examiner-applications/:id/reject", iGM_HandleReject as never);

// 导出 //
export default G_AdminExaminer;
