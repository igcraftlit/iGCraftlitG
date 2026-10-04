/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_AI.ts
 * 所属层：后端 / 路由层
 * 路由：/G_AI/*
 * 模块：G_AI
 * 作用：AI 助手接口集合（双通道代理：Free 本地 Qwen / Premium DeepSeek，
 *       AI 赋能系统模块一 / 模块二 / 模块三 / 模块四）
 * 内容：双通道流式提问（GET /G_AI/chat/free、/G_AI/chat/premium，SSE）、
 *       双余额与模型信息查询（GET /G_AI/balance）、会话历史查询（GET /G_AI/messages）、
 *       会话列表查询（GET /G_AI/conversations）、
 *       UPR 消耗详情分页查询（GET /G_AI/upr-transactions）
 * 约束：统一响应 { success, code, message, data }；全部接口要求登录，
 *       且只能读写本人会话与流水；API Key 仅由业务层从后端配置读取，不下发前端；
 *       流式接口在流开始前出错时返回统一响应壳，流开始后以 error 帧传递错误
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_AIError,
  iGM_GetAIConversationService,
  iGM_ListAIConversationsService,
  iGM_StreamAIService,
} from "../iGM_Services/iGM_AIService";
import {
  iGM_GetAIInfoService,
  iGM_GetUPRTransactionsService,
} from "../iGM_Services/iGM_QuotaService";
import type { iGM_AIChannel } from "../iGM_Types/iGM_AI";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 双通道流式提问（SSE：data: {"delta": ...} …  data: [DONE]） ---------- */
async function iGM_HandleChat(ctx: iGM_RouteContext, channel: iGM_AIChannel) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "aiChat", `user:${user.iGM_Id}`);
  return await iGM_StreamAIService(
    user.iGM_Id,
    {
      message: iGM_Query(ctx.query, "message"),
      conversationId: iGM_Query(ctx.query, "conversationId") || null,
      channel,
    },
    ctx.request.signal,
  );
}

/** Free 通道（UPR）：本地 Qwen 模型，免费使用 */
async function iGM_HandleChatFree(ctx: iGM_RouteContext) {
  return await iGM_HandleChat(ctx, "free");
}

/** Premium 通道（SPR）：DeepSeek 云端模型，按用量计费 */
async function iGM_HandleChatPremium(ctx: iGM_RouteContext) {
  return await iGM_HandleChat(ctx, "premium");
}

/* ---------- 双余额与模型信息（界面「模型信息」按钮按通道展示） ---------- */
async function iGM_HandleBalance(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok(await iGM_GetAIInfoService(user.iGM_Id));
}

/* ---------- 会话历史查询（刷新页面后恢复对话） ---------- */
async function iGM_HandleMessages(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const conversationId = iGM_Query(ctx.query, "conversationId").trim();
  if (!conversationId) {
    throw new iGM_AIError("ai.errors.conversationNotFound", 404);
  }
  return iGM_Ok(
    await iGM_GetAIConversationService(user.iGM_Id, conversationId),
  );
}

/* ---------- 会话列表（最多 3 个，最新创建在前） ---------- */
async function iGM_HandleConversations(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok(await iGM_ListAIConversationsService(user.iGM_Id));
}

/* ---------- UPR 消耗详情（点击余额查看流水，分页时间倒序） ---------- */
async function iGM_HandleUPRTransactions(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok(
    await iGM_GetUPRTransactionsService(
      user.iGM_Id,
      iGM_Query(ctx.query, "page"),
      iGM_Query(ctx.query, "pageSize"),
    ),
  );
}

/**
 * G_AI AI 助手路由集合
 * 业务错误统一抛 iGM_AIError / iGM_QuotaError，由 iGM_ServerMain 全局错误处理器
 * 格式化为统一响应体；message 为前端 i18n 文案键（ai.errors.*），status 为 HTTP 状态码
 */
export const G_AI = new Elysia({ name: "G_AI" })
  .get("/G_AI/chat/free", iGM_HandleChatFree as never)
  .get("/G_AI/chat/premium", iGM_HandleChatPremium as never)
  .get("/G_AI/balance", iGM_HandleBalance as never)
  .get("/G_AI/messages", iGM_HandleMessages as never)
  .get("/G_AI/conversations", iGM_HandleConversations as never)
  .get("/G_AI/upr-transactions", iGM_HandleUPRTransactions as never);

// 导出 //
export default G_AI;