/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Health.ts
 * 所属层：后端 / 路由层
 * 路由：GET /G_Api_Health
 * 模块：G_Api_Health
 * 作用：后端健康检查路由，返回统一响应结构
 * 内容：健康检查端点定义
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_GetHealth } from "../iGM_Services/iGM_HealthService";
import { iGM_Ok } from "../iGM_Types/iGM_Response";

// 核心逻辑 //
/** G_Api_Health 健康检查路由 */
export const G_Health = new Elysia({ name: "G_Api_Health" }).get(
  "/G_Api_Health",
  () => iGM_Ok(iGM_GetHealth()),
);

// 导出 //
export default G_Health;
