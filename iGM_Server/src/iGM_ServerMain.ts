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
import { iGM_PointsError } from "./iGM_Services/iGM_PointsService";
import { iGM_DeveloperError } from "./iGM_Services/iGM_DeveloperService";
import { iGM_AdminError } from "./iGM_Services/iGM_AdminService";
import { iGM_OrgVerifyError } from "./iGM_Services/iGM_OrgVerifyService";
// 模块十：社交关系与私信业务错误
import { iGM_SocialError } from "./iGM_Services/iGM_SocialService";
import { iGM_MessageError } from "./iGM_Services/iGM_MessageService";
// 社交生态优化：帖子举报业务错误
import { iGM_ReportError } from "./iGM_Services/iGM_ReportService";
import { G_Health } from "./iGM_Routes/G_Health";
import { G_Api } from "./iGM_Routes/G_Api";
import { G_Auth } from "./iGM_Routes/G_Auth";
import { G_Community } from "./iGM_Routes/G_Community";
import { G_Post } from "./iGM_Routes/G_Post";
import { G_Notification } from "./iGM_Routes/G_Notification";
import { G_File } from "./iGM_Routes/G_File";
import { G_Activity } from "./iGM_Routes/G_Activity";
import { G_Resource } from "./iGM_Routes/G_Resource";
import { G_Points } from "./iGM_Routes/G_Points";
import { G_Admin } from "./iGM_Routes/G_Admin";
import { G_Seo } from "./iGM_Routes/G_Seo";
import { G_OrgVerify } from "./iGM_Routes/G_OrgVerify";
import { G_Realtime } from "./iGM_Routes/G_Realtime";
import { G_Stats } from "./iGM_Routes/G_Stats";
// 模块十：社交关系、私信、Minecraft 资源分区
import { G_Social } from "./iGM_Routes/G_Social";
import { G_Message } from "./iGM_Routes/G_Message";
import { G_Minecraft } from "./iGM_Routes/G_Minecraft";
import { G_Developer } from "./iGM_Routes/G_Developer";
// 模块十七：Minecraft 游戏本体下载与自动组装
import { G_Game } from "./iGM_Routes/G_Game";
import { iGM_GameError } from "./iGM_Services/iGM_GameService";
// 模块二十：第三方资源（Modrinth，仅 Fabric 兼容）与下载进度同步
import { G_ThirdParty } from "./iGM_Routes/G_ThirdParty";
import { iGM_ThirdPartyError } from "./iGM_Services/iGM_ThirdPartyService";
// 模块二十一：OAuth 2.0 + OpenID Connect 身份提供方
import { G_OAuth } from "./iGM_Routes/G_OAuth";
import { iGM_OAuthError } from "./iGM_Services/iGM_OAuthService";
// 模块二十六（启动器 26.3.2）：启动器发布历史
import { G_LauncherRelease } from "./iGM_Routes/G_LauncherRelease";
// AI 赋能系统模块一：AI 助手基础对话（DeepSeek 代理）
import { G_AI } from "./iGM_Routes/G_AI";
import { iGM_AIError } from "./iGM_Services/iGM_AIService";
// AI 赋能系统模块三：UPR / SPR 额度业务错误（余额不足 402 / 账户不存在）
import { iGM_QuotaError } from "./iGM_Services/iGM_QuotaService";
// iG&M 教育考试系统：试卷业务错误（上传/识别/发布等）
import { G_Exam } from "./iGM_Routes/G_Exam";
import { iGM_ExamError } from "./iGM_Services/iGM_ExamService";
import { iGM_EnsureExamStorageRoot } from "./iGM_Services/iGM_ExamIngestService";
import { iGM_StartExamCleanup } from "./iGM_Services/iGM_ExamCleanupService";

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
    // 模块五积分业务错误：签到重复等
    if (error instanceof iGM_PointsError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块十五开发者申请业务错误：重复申请/字段非法等
    if (error instanceof iGM_DeveloperError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块五管理后台业务错误：权限/状态冲突等
    if (error instanceof iGM_AdminError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块七组织认证业务错误：重复申请/越权审核等
    if (error instanceof iGM_OrgVerifyError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块十社交业务错误：黑名单/关系冲突等
    if (error instanceof iGM_SocialError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块十私信业务错误：隐私设置/撤回时限等
    if (error instanceof iGM_MessageError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 社交生态优化：举报业务错误（原因非法/重复举报等）
    if (error instanceof iGM_ReportError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块十七游戏本体下载业务错误：路径非法/版本不存在/任务冲突/已取消等
    if (error instanceof iGM_GameError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块二十第三方资源业务错误：上游异常/路径非法/任务冲突/校验失败等
    if (error instanceof iGM_ThirdPartyError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // 模块二十一 OAuth/OIDC 业务错误：站内端点走统一响应壳
    // （标准 /oauth/* 端点已在路由内自行转换为 OAuth 规范错误响应）
    if (error instanceof iGM_OAuthError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // AI 赋能系统模块一：AI 对话业务错误（未配置/超时/上游异常/会话越权等）
    if (error instanceof iGM_AIError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // AI 赋能系统模块三：UPR / SPR 额度业务错误（余额不足 402 / 账户不存在）
    if (error instanceof iGM_QuotaError) {
      set.status = error.status;
      return iGM_Fail(error.status, error.message);
    }
    // iG&M 教育考试系统：试卷业务错误（上传/识别/发布/删除等）
    if (error instanceof iGM_ExamError) {
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
  // 模块八：公共客户端信息（IP 检测，纯自研解析）
  .use(G_Api)
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
  // 模块五：积分等级勋章、管理后台、SEO 数据
  .use(G_Points)
  .use(G_Admin)
  .use(G_Seo)
  // 模块七：组织认证
  .use(G_OrgVerify)
  // 模块九：实时通信与运营统计
  .use(G_Realtime)
  .use(G_Stats)
  // 模块十：社交关系与私信系统
  .use(G_Social)
  .use(G_Message)
  // 模块十：Minecraft 资源分区
  .use(G_Minecraft)
  // 模块十五：开发者申请（API Key / SDK / 适配器协议）
  .use(G_Developer)
  // 模块十七：Minecraft 游戏本体下载与自动组装
  .use(G_Game)
  // 模块二十：第三方资源（Modrinth）与下载进度同步
  .use(G_ThirdParty)
  // 模块二十一：OAuth 2.0 + OIDC 身份提供方
  .use(G_OAuth)
  // 模块二十六（启动器 26.3.2）：启动器发布历史（官网下载页与启动器共用）
  .use(G_LauncherRelease)
  // AI 赋能系统模块一：AI 助手基础对话（DeepSeek 代理）
  .use(G_AI)
  // iG&M 教育考试系统：试卷列表 / 详情 / 上传识别 / 校对 / 发布（/api/exam/*）
  .use(G_Exam)
  // 根路径占位
  .get("/", () => ({
    success: true,
    code: 200,
    message: "iGCraftLit Community API",
    data: null,
  }));

// 启动前确保上传根目录存在（建目录不幂等、空实现即可安全重复调用）
await iGM_EnsureUploadRoot();

// iG&M 教育考试系统：确保试卷临时目录存在（D:/IGWEB/uploads/exams/temp）
await iGM_EnsureExamStorageRoot();

// 启动时自动执行数据库迁移
await iGM_RunMigrations();

// iG&M 教育考试系统：注册临时文件清理任务（未确认 7 天 / 解析失败 24 小时）
iGM_StartExamCleanup();

// 仅在本地直接运行时监听端口（被导入时不占用端口）
if (import.meta.main) {
  // idleTimeout：本地模型冷启动期间（可达 60 秒以上）后端向客户端零输出，
  // Bun 默认 idleTimeout 会在此期间切断连接（前端表现为「无法连接服务」）；
  // 显式设为允许的最大值 255 秒，覆盖 Free 通道 120 秒上游超时 + 推理耗时
  iGM_Server.listen({ port: iGM_Config.port, idleTimeout: 255 });
  console.log(
    `[iGM_Server] 后端已启动：http://localhost:${iGM_Config.port}（健康检查 /G_Api_Health）`,
  );
}

// 导出 Web Standard fetch，便于将来迁移
export default iGM_Server;
export const fetch = iGM_Server.fetch;
