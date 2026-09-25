/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Api.ts
 * 所属层：后端 / 路由层
 * 路由：GET /G_Api_ClientIp
 * 模块：G_Api
 * 作用：公共客户端信息接口——返回本次请求解析出的客户端 IP
 * 内容：供《用户管理规定》独立页做 IP 检测告知；
 *       注册同意规定时以后端同口径解析的 IP 落库
 * 说明：IP 仅由本服务自行解析（直连地址 → x-forwarded-for 首段），
 *       不调用任何第三方 IP 库、付费或不可商用服务
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import {
  iGM_GetClientIp,
  type iGM_NetworkServer,
} from "../iGM_Middleware/iGM_AuthGuard";

// 类型定义 //
/** 路由处理器上下文：仅声明使用到的 Elysia 上下文字段 */
interface iGM_ApiRouteContext {
  request: Request;
  server: iGM_NetworkServer | null;
}

// 核心逻辑 //
/** G_Api 公共接口集合 */
export const G_Api = new Elysia({ name: "G_Api" }).get(
  "/G_Api_ClientIp",
  (ctx: iGM_ApiRouteContext) =>
    iGM_Ok({ ip: iGM_GetClientIp(ctx.request, ctx.server) }),
);

// 导出 //
export default G_Api;
