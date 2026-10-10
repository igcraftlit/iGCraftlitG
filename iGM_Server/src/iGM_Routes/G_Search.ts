/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Search.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Search
 * 模块：G_Search
 * 作用：全站聚合搜索接口（帖子 / 资源 / 用户 / 组织）
 * 内容：GET /G_Search，支持关键词 q、类型 type（all/post/resource/user/org）、
 *       分页 page/pageSize，返回统一 { success, code, message, data } 结构
 * 约束：公开只读，未登录可访问；按客户端 IP 限流防滥用；
 *       类型与分页参数在服务层归一化，非法入参回退 all / 默认值，不返回 4xx
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import {
  iGM_ClientIp,
  iGM_EnforceRateLimit,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_SearchAllService } from "../iGM_Services/iGM_SearchService";

// 类型定义 //
// （路由层无额外类型，搜索结果类型见 iGM_Types/iGM_Search.ts）

// 核心逻辑 //
/** 全站聚合搜索（公开只读，按 IP 限流） */
async function iGM_HandleSearch(ctx: iGM_RouteContext) {
  iGM_EnforceRateLimit(ctx, "search", `ip:${iGM_ClientIp(ctx)}`);
  return iGM_Ok(
    await iGM_SearchAllService({
      q: iGM_Query(ctx.query, "q") || "",
      // 非法类型在服务内归一化为 all，不返回 4xx
      type: iGM_Query(ctx.query, "type", "all"),
      page: iGM_Query(ctx.query, "page", "1"),
      pageSize: iGM_Query(ctx.query, "pageSize", "20"),
    }),
  );
}

/**
 * G_Search 全站搜索路由集合
 * 公开只读：未登录可访问，仅按 IP 限流
 */
export const G_Search = new Elysia({ name: "G_Search" }).get(
  "/G_Search",
  iGM_HandleSearch as never,
);

// 导出 //
export default G_Search;
