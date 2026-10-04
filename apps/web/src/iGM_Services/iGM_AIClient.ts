/**
 * 文件路径：apps/web/src/iGM_Services/iGM_AIClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_AI/*
 * 模块：iGM_AIClient
 * 作用：AI 助手接口的唯一前端调用出口（AI 赋能系统模块一 / 模块二 / 模块三 / 模块四）
 * 内容：UPR / SPR 双余额与双模型信息查询、SSE 流式提问（fetch + ReadableStream 逐块解析）、
 *       会话历史查询、会话列表查询、UPR 消耗流水分页查询；
 *       类型与后端 iGM_Types/iGM_AI.ts、iGM_Types/iGM_Quota.ts 保持一致
 * 约束：常规请求只经 iGM_Request；流式请求无法复用统一封装，在本模块内
 *       保持同一错误归一化口径与语言头、凭证策略；大模型响应慢，超时放宽到 90 秒
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

/** 通道：free（本地 Qwen，扣 UPR）/ premium（DeepSeek Flash，扣 SPR） */
export type iGM_AIChannel = "free" | "premium";

/**
 * 流式问答的异常通知：timeout 流式超时（已按生成内容扣费）/
 * truncated 超过最大字数被截断（已按已生成内容扣费）
 */
export type iGM_AIStreamNotice = "timeout" | "truncated";

/** 双余额与双模型信息（GET /G_AI/balance） */
export interface iGM_AIInfo {
  /** UPR 余额（可为负数：回答扣费允许扣成负数，下次提问被拦截） */
  uprBalance: number;
  /** SPR 余额（可为负数） */
  sprBalance: number;
  /** Free 通道当前模型名（供「模型信息」按钮展示） */
  freeModel: string;
  /** Premium 通道当前模型名 */
  premiumModel: string;
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

/** 会话历史数据（刷新页面后恢复对话用） */
export interface iGM_AIConversationData {
  conversation: iGM_AIConversation;
  messages: iGM_AIChatMessage[];
}

/** UPR 流水类型：注册赠送 / 提问扣费 / 回答按 token 扣费 / 充值 / 奖励 */
export type iGM_UPRTransactionType =
  | "register"
  | "chat_question"
  | "chat_answer"
  | "recharge"
  | "reward";

/** UPR 流水条目（点击余额查看消耗详情用） */
export interface iGM_UPRTransactionItem {
  id: string;
  type: iGM_UPRTransactionType;
  /** 变动值：正数为增加、负数为消耗 */
  amount: number;
  /** 变动后余额 */
  balanceAfter: number;
  detail: string;
  createdAt: string;
}

/** UPR 流水分页结果（时间倒序，默认每页 20 条） */
export interface iGM_UPRTransactionPage {
  items: iGM_UPRTransactionItem[];
  /** 流水总条数（判断是否还有下一页） */
  total: number;
  page: number;
  pageSize: number;
}

/** 流式问答回调 */
export interface iGM_AIStreamHandlers {
  /** 首帧会话 id（新建会话时后端下发，供本地持久化） */
  onConversationId?: (conversationId: string) => void;
  /** 每段增量文本（按到达顺序追加到当前气泡） */
  onDelta: (delta: string) => void;
  /** 异常通知（超时 / 超字数截断，供气泡下方展示黄色或红色提示） */
  onNotice?: (notice: iGM_AIStreamNotice) => void;
}

/** SSE 数据帧（后端下发的最小结构：会话 id / 增量 / 通知 / 错误键） */
interface iGM_AIStreamFrame {
  conversationId?: unknown;
  delta?: unknown;
  notice?: unknown;
  error?: unknown;
}

/** 判断未知值是否为合法的流式异常通知 */
function iGM_IsAIStreamNotice(value: unknown): value is iGM_AIStreamNotice {
  return value === "timeout" || value === "truncated";
}

// 核心逻辑 //
/** 对话接口超时（毫秒）：大模型推理耗时较长，独立放宽 */
const iGM_AI_CHAT_TIMEOUT_MS = 90000;

/** 查询 UPR / SPR 双余额与双模型信息（需登录，未登录返回 401） */
export function iGM_ApiAIInfo(): Promise<iGM_ApiResponse<iGM_AIInfo>> {
  return iGM_Get<iGM_AIInfo>("/G_AI/balance");
}

/** 查询会话历史（仅能查询本人会话，越权返回 404） */
export function iGM_ApiAIConversation(
  conversationId: string,
): Promise<iGM_ApiResponse<iGM_AIConversationData>> {
  return iGM_Get(
    `/G_AI/messages?conversationId=${encodeURIComponent(conversationId)}`,
  );
}

/** 查询本人会话列表（最多 3 个，最新创建在前；需登录） */
export function iGM_ApiAIConversations(): Promise<
  iGM_ApiResponse<iGM_AIConversation[]>
> {
  return iGM_Get<iGM_AIConversation[]>("/G_AI/conversations");
}

/**
 * 查询本人 UPR 消耗流水（分页，时间倒序；需登录）。
 * 默认每页 20 条，服务端将 pageSize 收敛到 1-50
 */
export function iGM_ApiAIUPRTransactions(
  page: number,
  pageSize: number,
): Promise<iGM_ApiResponse<iGM_UPRTransactionPage>> {
  return iGM_Get<iGM_UPRTransactionPage>(
    `/G_AI/upr-transactions?page=${page}&pageSize=${pageSize}`,
  );
}

/**
 * 流式提问（SSE）：fetch + ReadableStream 逐块解析 `data: {...}` 帧，
 * 直至收到 `data: [DONE]` 或流自然结束。
 *
 * 中断语义：
 *   - 外部 signal 中止（关闭弹窗/卸载组件）：静默结束，不抛错（已收到的内容保留）；
 *   - 本地 90 秒超时：抛 iGM_RequestError("ai.errors.timeout", "timeout")；
 *   - 流内错误帧（后端以 error 键下发）：抛业务错误，message 即 i18n 文案键；
 *   - 通知帧（后端以 notice 键下发）：超时 / 超字数截断时回调 onNotice，
 *     供界面在气泡下方展示黄色（截断）或红色（超时）提示
 *
 * @param channel 通道：free（默认，扣 UPR）/ premium（扣 SPR）
 * @param message 用户提问（后端限制 2000 字符内）
 * @param conversationId 会话 id，null 表示新建会话（首帧回调返回新 id）
 * @param handlers 增量回调
 * @param signal 外部中止信号（可选）
 */
export async function iGM_ApiAIStreamChat(
  channel: iGM_AIChannel,
  message: string,
  conversationId: string | null,
  handlers: iGM_AIStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const params = new URLSearchParams({ message });
  if (conversationId) params.set("conversationId", conversationId);

  // 本地超时与外部中止共用同一控制器；二者语义在下面区分处理
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), iGM_AI_CHAT_TIMEOUT_MS);
  const relayAbort = (): void => controller.abort();
  signal?.addEventListener("abort", relayAbort);

  try {
    let response: Response;
    try {
      response = await fetch(
        `${iGM_Config.apiBase}/G_AI/chat/${channel}?${params.toString()}`,
        {
          method: "GET",
          // 跨端口同站携带后端下发的 HttpOnly 会话 Cookie
          credentials: "include",
          headers: {
            Accept: "text/event-stream",
            "x-igm-locale": iGM_ReadLocaleCookie(),
          },
          signal: controller.signal,
        },
      );
    } catch {
      // 外部主动中止：静默结束，界面保留已收到内容
      if (signal?.aborted) return;
      if (controller.signal.aborted) {
        throw new iGM_RequestError("ai.errors.timeout", "timeout");
      }
      throw new iGM_RequestError("无法连接本地后端服务", "network");
    }

    // 流开始前的业务错误：后端返回统一响应壳 JSON（如 402 余额不足、401 未登录）
    if (!response.ok) {
      let payload: iGM_ApiResponse<null> | null = null;
      try {
        payload = (await response.json()) as iGM_ApiResponse<null>;
      } catch {
        payload = null;
      }
      if (response.status === 401) {
        iGM_HandleUnauthorized("session");
      }
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
            if (raw === "[DONE]") {
              finished = true;
              break;
            }
            let payload: iGM_AIStreamFrame;
            try {
              payload = JSON.parse(raw) as iGM_AIStreamFrame;
            } catch {
              // 忽略无法解析的帧（上游心跳等），不影响流式接收
              continue;
            }
            if (typeof payload.conversationId === "string") {
              handlers.onConversationId?.(payload.conversationId);
            }
            if (typeof payload.delta === "string" && payload.delta.length > 0) {
              handlers.onDelta(payload.delta);
            }
            // 通知帧先于错误帧处理：超时帧同时携带 error 与 notice，需先标记气泡提示
            if (iGM_IsAIStreamNotice(payload.notice)) {
              handlers.onNotice?.(payload.notice);
            }
            if (typeof payload.error === "string") {
              throw new iGM_RequestError(payload.error, "business");
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      // 流内业务错误（错误帧）直接上抛，界面按 i18n 键展示
      if (error instanceof iGM_RequestError) throw error;
      if (signal?.aborted) return;
      if (controller.signal.aborted) {
        throw new iGM_RequestError("ai.errors.timeout", "timeout");
      }
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
  iGM_ApiAIUPRTransactions,
  iGM_ApiAIStreamChat,
};