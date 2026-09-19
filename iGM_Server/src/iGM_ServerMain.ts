/**
 * 文件路径：iGM_Server/src/iGM_ServerMain.ts
 * 所属层：后端 / 启动入口层
 * 路由：全局
 * 模块：iGM_Server
 * 作用：Bun + Elysia 本地后端启动入口
 * 内容：CORS 白名单、统一错误处理、自动数据库迁移、路由挂载
 * 说明：导出 Web Standard fetch，便于将来迁移到 Cloudflare Workers
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { iGM_Config } from "./iGM_Config/iGM_Config";
import { iGM_RunMigrations } from "./iGM_Database/iGM_Database";
import { iGM_Fail } from "./iGM_Types/iGM_Response";
import { iGM_AuthError } from "./iGM_Services/iGM_AuthService";
import { iGM_ContentError } from "./iGM_Services/iGM_ContentService";
import { iGM_StorageError, iGM_EnsureUploadRoot } from "./iGM_Services/iGM_StorageService";
import { G_Health } from "./iGM_Routes/G_Health";
import { G_Auth } from "./iGM_Routes/G_Auth";
import { G_Community } from "./iGM_Routes/G_Community";
import { G_Post } from "./iGM_Routes/G_Post";
import { G_Notification } from "./iGM_Routes/G_Notification";
import { G_File } from "./iGM_Routes/G_File";
import { G_Activity } from "./iGM_Routes/G_Activity";
import { G_Resource } from "./iGM_Routes/G_Resource";

// 类型定义 //
// （本入口无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
const iGM_Server = new Elysia()
  // CORS：仅允许正式域名与本地前端开发地址；认证 Cookie 需要 credentials
  .use(
    cors({
      origin: (request): boolean =>
        iGM_Config.corsOrigins.includes(request.headers.get("Origin") ?? ""),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  )
  // 统一日志：记录每次请求
  .onRequest(({ request }) => {
    console.log(`[iGM_Server] ${request.method} ${new URL(request.url).pathname}`);
  })
  // 统一错误处理：业务错误按自带状态码返回，其余异常返回 500
  .onError(({ code, error, set }) => {
    // 认证业务错误：message 为前端 i18n 文案键，禁止泄露堆栈
    if (error instanceof iGM_AuthError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块三社区业务错误：同样以 i18n 文案键作为 message
    if (error instanceof iGM_ContentError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块四文件存储业务错误：类型/大小/落盘失败等
    if (error instanceof iGM_StorageError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 请求体解析失败等客户端错误（沿用模块二通用文案键）
    if (code === "PARSE" || code === "VALIDATION") {
      set.status = 400;
      return iGM_Fail(400, "auth.errors.badRequest");
    }
    console.error(`[iGM_Server] 错误：${String(code)}`, error);
    set.status = 500;
    return iGM_Fail(500, "Internal Server Error");
  })
  // 健康检查
  .use(G_Health)
  // 模块二：用户认证与账户体系
  .use(G_Auth)
  // 模块三：社区帖子评论系统与用户个人中心
  .use(G_Community)
  .use(G_Post)
  // 模块四：通知系统、文件上传与媒体管理、活动与资源库
  .use(G_Notification)
  .use(G_File)
  .use(G_Activity)
  .use(G_Resource)
  // 根路径占位
  .get("/", () => ({
    success: true,
    code: 200,
    message: "iGCraftLit Community API",
    data: null,
  }));

// 启动前确保上传根目录存在（建目录不幂等、空实现即可安全重复调用）
await iGM_EnsureUploadRoot();

// 启动时自动执行数据库迁移
await iGM_RunMigrations();

// 仅在本地直接运行时监听端口（被导入时不占用端口）
if (import.meta.main) {
  iGM_Server.listen(iGM_Config.port);
  console.log(
    `[iGM_Server] 后端已启动：http://localhost:${iGM_Config.port}（健康检查 /G_Api_Health）`,
  );
}

// 导出 Web Standard fetch，便于将来迁移
export default iGM_Server;
export const fetch = iGM_Server.fetch;
