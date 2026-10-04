/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_AI.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_AI
 * 模块：iGM_AI
 * 作用：AI 助手模块的类型定义与行到 DTO 的转换
 * 内容：会话行 / 消息行、消息角色联合类型、流式提问入参、历史查询结果、
 *       角色判定与行转 DTO 工具
 * 说明：本模块仅基础对话问答（模块二起为 SSE 流式），不含 RAG 与向量检索
 */

// 导入依赖 //
// （本文件仅包含类型与纯函数，无运行时依赖）

// 类型定义 //
/** 消息角色：仅用户提问与 AI 回复两种 */
export type iGM_AIRole = "user" | "assistant";

/** AI 对话通道：free（UPR，本地 Qwen）/ premium（SPR，云端 DeepSeek） */
export type iGM_AIChannel = "free" | "premium";

/** iGM_AIConversations 表行 */
export interface iGM_AIConversationRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Title: string;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** iGM_AIMessages 表行（iGM_Role 由数据库返回为字符串，出参前经 iGM_IsAIRole 收敛） */
export interface iGM_AIMessageRow {
  iGM_Id: string;
  iGM_ConversationId: string;
  iGM_Role: string;
  iGM_Content: string;
  iGM_CreatedAt: string;
}

/** 对前端的会话摘要 */
export interface iGM_AIConversationDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** 对前端的消息条目 */
export interface iGM_AIMessageDto {
  id: string;
  role: iGM_AIRole;
  content: string;
  createdAt: string;
}

/** GET /G_AI/chat/free、/G_AI/chat/premium 入参（conversationId 缺省表示新建会话） */
export interface iGM_AIChatStreamInput {
  message: string;
  conversationId?: string | null;
  /** 对话通道：决定上游模型与计费额度（free → UPR / premium → SPR） */
  channel: iGM_AIChannel;
}

/** GET /G_AI/messages 返回数据 */
export interface iGM_AIConversationResult {
  conversation: iGM_AIConversationDto;
  messages: iGM_AIMessageDto[];
}

/** 上游 DeepSeek Chat Completions 的消息形态 */
export interface iGM_AIChatCompletionMessage {
  role: "system" | iGM_AIRole;
  content: string;
}

// 核心逻辑 //
/** 判断未知字符串是否为合法消息角色 */
export function iGM_IsAIRole(value: unknown): value is iGM_AIRole {
  return value === "user" || value === "assistant";
}

/** 会话行转 DTO */
export function iGM_ToAIConversationDto(
  row: iGM_AIConversationRow,
): iGM_AIConversationDto {
  return {
    id: row.iGM_Id,
    title: row.iGM_Title,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 消息行转 DTO：未知角色一律按 assistant 兜底，保证前端渲染不缺字段 */
export function iGM_ToAIMessageDto(row: iGM_AIMessageRow): iGM_AIMessageDto {
  return {
    id: row.iGM_Id,
    role: iGM_IsAIRole(row.iGM_Role) ? row.iGM_Role : "assistant",
    content: row.iGM_Content,
    createdAt: row.iGM_CreatedAt,
  };
}

// 导出 //
export default {
  iGM_IsAIRole,
  iGM_ToAIConversationDto,
  iGM_ToAIMessageDto,
};