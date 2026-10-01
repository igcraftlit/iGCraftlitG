/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Message.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Message/*
 * 模块：G_Message
 * 作用：一对一私信会话、消息与隐私设置接口集合
 * 内容：会话列表、会话详情、打开会话、发送消息、标记已读、限时撤回、
 *       删除会话（仅对本人隐藏）、隐私设置读写、未读数
 * 约束：统一响应 { success, code, message, data }；
 *       全部接口要求登录；写入与发送做基础限流
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_Query,
  iGM_RequestLocale,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_DeleteConversationService,
  iGM_GetConversationDetailService,
  iGM_GetSettingsService,
  iGM_GetUnreadCountService,
  iGM_ListConversationsService,
  iGM_MarkReadService,
  iGM_OpenConversationService,
  iGM_RecallMessageService,
  iGM_SendMessageService,
  iGM_UpdateSettingsService,
} from "../iGM_Services/iGM_MessageService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 会话列表 / 未读数 ---------- */
async function iGM_HandleList(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok(await iGM_ListConversationsService(user));
}

async function iGM_HandleUnreadCount(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok({ unreadCount: await iGM_GetUnreadCountService(user.iGM_Id) });
}

/* ---------- 会话详情 ---------- */
async function iGM_HandleDetail(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const conversationId = iGM_Query(ctx.query, "conversationId").trim();
  return iGM_Ok({
    conversation: await iGM_GetConversationDetailService(user, conversationId),
  });
}

/* ---------- 打开会话 ---------- */
async function iGM_HandleOpen(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const peerId = iGM_Field(ctx.body, "peerId").trim();
  return iGM_Ok({
    conversation: await iGM_OpenConversationService(user, peerId),
  });
}

/* ---------- 发送消息 ---------- */
async function iGM_HandleSend(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "messageWrite", `user:${user.iGM_Id}`);
  const conversationId = iGM_Field(ctx.body, "conversationId").trim();
  const peerId = iGM_Field(ctx.body, "peerId").trim();
  const message = await iGM_SendMessageService(
    user,
    {
      conversationId: conversationId || undefined,
      peerId: peerId || undefined,
    },
    iGM_Field(ctx.body, "content"),
    iGM_RequestLocale(ctx),
  );
  return iGM_Ok({ message });
}

/* ---------- 标记已读 ---------- */
async function iGM_HandleRead(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const conversationId = iGM_Field(ctx.body, "conversationId").trim();
  return iGM_Ok(await iGM_MarkReadService(user, conversationId));
}

/* ---------- 撤回消息 ---------- */
async function iGM_HandleRecall(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "messageWrite", `user:${user.iGM_Id}`);
  const messageId = iGM_Field(ctx.body, "messageId").trim();
  await iGM_RecallMessageService(user, messageId);
  return iGM_Ok({ recalled: true });
}

/* ---------- 删除会话 ---------- */
async function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const conversationId = iGM_Query(ctx.query, "conversationId").trim();
  await iGM_DeleteConversationService(user, conversationId);
  return iGM_Ok({ deleted: true });
}

/* ---------- 隐私设置 ---------- */
async function iGM_HandleGetSettings(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok(await iGM_GetSettingsService(user.iGM_Id));
}

async function iGM_HandleUpdateSettings(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok(
    await iGM_UpdateSettingsService(user, iGM_Field(ctx.body, "allowFrom")),
  );
}

/**
 * G_Message 私信路由集合
 */
export const G_Message = new Elysia({ name: "G_Message" })
  .get("/G_Message/list", iGM_HandleList as never)
  .get("/G_Message/unreadCount", iGM_HandleUnreadCount as never)
  .get("/G_Message/detail", iGM_HandleDetail as never)
  .post("/G_Message/open", iGM_HandleOpen as never)
  .post("/G_Message/send", iGM_HandleSend as never)
  .post("/G_Message/read", iGM_HandleRead as never)
  .post("/G_Message/recall", iGM_HandleRecall as never)
  .delete("/G_Message/delete", iGM_HandleDelete as never)
  .get("/G_Message/settings", iGM_HandleGetSettings as never)
  .put("/G_Message/settings", iGM_HandleUpdateSettings as never);

// 导出 //
export default G_Message;
