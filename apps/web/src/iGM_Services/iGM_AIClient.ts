/**
 * 文件路径：apps/web/src/iGM_Services/iGM_AIClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_AI/*
 * 模块：iGM_AIClient
 * 作用：AI 助手接口前端调用出口（单通道 Chat iGM Nove V0.1 + UQ/Coin 双币种）
 * 内容：UQ/Coin 双余额与模型信息查询、SSE 流式提问、会话历史、会话列表、
 *       UQ / Coin 流水查询（需登录）
 * 约束：大模型响应慢，超时放宽到 90 秒
 */

// 导入依赖 //
import { iGM_Config } from "./iGM_Config";
import {
  iGM_Get,
  iGM_ReadLocaleCookie,
  iGM_RequestError,
  type iGM_ApiResponse,
} from "./iGM_Request";
import { iGM_HandleUnauthorized } from "./iGM_OAuthTokenStore";

// 类型定义 //
/** 消息角色：仅用户提问与 AI 回复两种 */
export type iGM_AIChatRole = "user" | "assistant";

/** 流式问答异常通知 */
export type iGM_AIStreamNotice = "timeout" | "truncated";

/** 双余额与模型信息（GET /G_AI/balance） */
export interface iGM_AIInfo {
  /** UQ 余额（3 位小数） */
  uqBalance: number;
  /** Coin 余额（3 位小数） */
  coinBalance: number;
  /** 对外展示模型名 */
  modelName: string;
}

/** 消息条目 */
export interface iGM_AIChatMessage {
  id: string;
  role: iGM_AIChatRole;
  content: string;
  createdAt: string;
}

/** 会话摘要 */
export interface iGM_AIConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** 会话历史数据 */
export interface iGM_AIConversationData {
  conversation: iGM_AIConversation;
  messages: iGM_AIChatMessage[];
}

/** 流水类型 */
export type iGM_QuotaTransactionType =
  | "register"
  | "chat_question"
  | "chat_answer"
  | "recharge"
  | "reward";

/** 流水条目（点击余额查看消耗详情用） */
export interface iGM_QuotaTransactionItem {
  id: string;
  type: iGM_QuotaTransactionType;
  amount: number;
  balanceAfter: number;
  detail: string;
  createdAt: string;
}

/** 流水分页结果 */
export interface iGM_QuotaTransactionPage {
  items: iGM_QuotaTransactionItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 流式问答回调 */
export interface iGM_AIStreamHandlers {
  onConversationId?: (conversationId: string) => void;
  onDelta: (delta: string) => void;
  onNotice?: (notice: iGM_AIStreamNotice) => void;
}

/** SSE 数据帧最小结构 */
interface iGM_AIStreamFrame {
  conversationId?: unknown;
  delta?: unknown;
  notice?: unknown;
  error?: unknown;
}

function iGM_IsAIStreamNotice(value: unknown): value is iGM_AIStreamNotice {
  return value === "timeout" || value === "truncated";
}

// 核心逻辑 //
const iGM_AI_CHAT_TIMEOUT_MS = 90000;

/** 查询 UQ / Coin 双余额与模型信息（需登录） */
export function iGM_ApiAIInfo(): Promise<iGM_ApiResponse<iGM_AIInfo>> {
  return iGM_Get<iGM_AIInfo>("/G_AI/balance");
}

/** 查询会话历史（需登录，仅能查本人） */
export function iGM_ApiAIConversation(
  conversationId: string,
): Promise<iGM_ApiResponse<iGM_AIConversationData>> {
  return iGM_Get(
    `/G_AI/messages?conversationId=${encodeURIComponent(conversationId)}`,
  );
}

/** 查询本人会话列表（最多 3 个，最新在前；需登录） */
export function iGM_ApiAIConversations(): Promise<
  iGM_ApiResponse<iGM_AIConversation[]>
> {
  return iGM_Get<iGM_AIConversation[]>("/G_AI/conversations");
}

/**
 * 查询本人某币种流水（分页，时间倒序；需登录）。
 * channel: "uq" 或 "coin"
 */
export function iGM_ApiAIQuotaTransactions(
  channel: "uq" | "coin",
  page: number,
  pageSize: number,
): Promise<iGM_ApiResponse<iGM_QuotaTransactionPage>> {
  return iGM_Get<iGM_QuotaTransactionPage>(
    `/G_AI/${channel}-transactions?page=${page}&pageSize=${pageSize}`,
  );
}

/**
 * 流式提问（SSE）：fetch + ReadableStream 逐块解析 `data: {...}` 帧。
 * 不再需要通道参数（单通道）。
 */
export async function iGM_ApiAIStreamChat(
  message: string,
  conversationId: string | null,
  handlers: iGM_AIStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const params = new URLSearchParams({ message });
  if (conversationId) params.set("conversationId", conversationId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), iGM_AI_CHAT_TIMEOUT_MS);
  const relayAbort = (): void => controller.abort();
  signal?.addEventListener("abort", relayAbort);

  try {
    let response: Response;
    try {
      response = await fetch(
        `${iGM_Config.apiBase}/G_AI/chat?${params.toString()}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "text/event-stream",
            "x-igm-locale": iGM_ReadLocaleCookie(),
          },
          signal: controller.signal,
        },
      );
    } catch {
      if (signal?.aborted) return;
      if (controller.signal.aborted) {
        throw new iGM_RequestError("ai.errors.timeout", "timeout");
      }
      throw new iGM_RequestError("无法连接本地后端服务", "network");
    }

    if (!response.ok) {
      let payload: iGM_ApiResponse<null> | null = null;
      try {
        payload = (await response.json()) as iGM_ApiResponse<null>;
      } catch {
        payload = null;
      }
      if (response.status === 401) iGM_HandleUnauthorized("session");
      throw new iGM_RequestError(
        payload?.message || `HTTP ${response.status}`,
        "business",
        payload?.code ?? response.status,
      );
    }

    const body = response.body;
    if (!body) {
      throw new iGM_RequestError("ai.errors.upstream", "business", 502);
    }

    try {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (raw.length === 0) continue;
            if (raw === "[DONE]") { finished = true; break; }
            let payload: iGM_AIStreamFrame;
            try { payload = JSON.parse(raw) as iGM_AIStreamFrame; } catch { continue; }
            if (typeof payload.conversationId === "string") handlers.onConversationId?.(payload.conversationId);
            if (typeof payload.delta === "string" && payload.delta.length > 0) handlers.onDelta(payload.delta);
            if (iGM_IsAIStreamNotice(payload.notice)) handlers.onNotice?.(payload.notice);
            if (typeof payload.error === "string") throw new iGM_RequestError(payload.error, "business");
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      if (error instanceof iGM_RequestError) throw error;
      if (signal?.aborted) return;
      if (controller.signal.aborted) throw new iGM_RequestError("ai.errors.timeout", "timeout");
      throw new iGM_RequestError("ai.errors.upstream", "business", 502);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}

// 导出 //
export default {
  iGM_ApiAIInfo,
  iGM_ApiAIConversation,
  iGM_ApiAIConversations,
  iGM_ApiAIQuotaTransactions,
  iGM_ApiAIStreamChat,
};
