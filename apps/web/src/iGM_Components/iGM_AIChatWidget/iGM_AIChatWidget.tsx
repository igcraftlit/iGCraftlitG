/**
 * 文件路径：apps/web/src/iGM_Components/iGM_AIChatWidget/iGM_AIChatWidget.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（挂载于 iGM_Providers）
 * 模块：iGM_AIChatWidget
 * 作用：iGM StarWhisper AI 助手——右下角悬浮按钮，点击弹出屏幕居中模态框
 *       （AI 赋能系统模块一 / 模块二 / 模块三 / 模块四）
 * 内容：居中模态框（约 600x600、半透明遮罩、玻璃态）、通道切换 Tab（滑动气泡，
 *       Free (UPR) / Premium (SPR)）、按通道显示余额与模型名、Premium 充值入口、
 *       消息气泡列表、SSE 流式打字（光标闪烁）、模型信息按钮（展开态本地持久化）、
 *       余额不足拦截、会话 id 本地持久化、历史回填、错误兜底提示；
 *       模块四新增：会话记录目录（最多 3 个、可切换/新建、移动端可折叠）、
 *       点击 UPR 余额查看消耗流水（分页滚动加载）、能力边界提示行；
 *       本次修正：弹窗顶部账号专属提示、超时（红）/ 超字数截断（黄）气泡下方提示；
 *       模块五（安全修复）：账号切换清空 AI 本地缓存 + 按 userId 强制重挂载、
 *       未登录拦截（禁用输入 + 去登录）、Markdown 代码块渲染（语言标签 / 复制按钮）、
 *       停止生成按钮（AbortController 中止流式，已生成内容保留）
 * 说明：文案全部来自语言包 ai.*（五种语言）；请求只经 iGM_AIClient，
 *       DeepSeek 由后端代理，前端不接触任何密钥
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronUp,
  Coins,
  Cpu,
  History,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_RequestError } from "../../iGM_Services/iGM_Request";
import {
  iGM_ApiAIInfo,
  iGM_ApiAIConversation,
  iGM_ApiAIConversations,
  iGM_ApiAIStreamChat,
  iGM_ApiAIUPRTransactions,
  type iGM_AIChatMessage,
  type iGM_AIConversation,
  type iGM_AIChannel,
  type iGM_AIStreamNotice,
  type iGM_UPRTransactionItem,
} from "../../iGM_Services/iGM_AIClient";
import {
  iGM_FormatDateTime,
  iGM_FormatQuota,
  iGM_FormatRelative,
} from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_AIChatMarkdown as IGM_AIChatMarkdown } from "./iGM_AIChatMarkdown";
import styles from "./iGM_AIChatWidget.module.css";

// 类型定义 //
/** 会话 id 本地持久化键（刷新页面后继续上次对话） */
const iGM_AI_CONVERSATION_STORAGE_KEY = "iGM_AIConversationId";

/** 会话 id 归属账号键（换号时校验，归属不符立即清空，防止跨账号串号） */
const iGM_AI_CONVERSATION_OWNER_STORAGE_KEY = "iGM_AIConversationOwner";

/** 模型信息展开态本地持久化键（仅前端状态，不写数据库） */
const iGM_AI_MODEL_INFO_STORAGE_KEY = "iGM_AIModelInfoOpen";

/** 提问长度上限（与后端 DEEPSEEK_MAX_MESSAGE_LENGTH 口径一致） */
const iGM_AI_MESSAGE_MAX_LENGTH = 2000;

/** 单次提问固定扣费（UPR），与后端 IGM_AI_UPR_QUESTION_COST 默认值一致 */
const iGM_AI_QUESTION_COST = 0.02;

/** UPR 消耗流水分页大小（与后端默认值一致，服务端上限 50） */
const iGM_AI_UPR_PAGE_SIZE = 20;

/** 通道 Tab 文案（UPR / SPR 为额度专名，按惯例硬编码英文，同「Model Info」） */
const iGM_AI_CHANNEL_LABELS: Record<iGM_AIChannel, string> = {
  free: "Free (UPR)",
  premium: "Premium (SPR)",
};

/** 可展示的提示文案键集合（本地错误归一化与后端业务错误均收敛到这些键） */
const iGM_AI_NOTICE_KEYS = [
  "ai.widget.loginRequired",
  "ai.errors.network",
  "ai.errors.timeout",
  "ai.errors.authError",
  "ai.errors.busy",
  "ai.errors.upstream",
  "ai.errors.generic",
  "ai.errors.emptyMessage",
  "ai.errors.messageTooLong",
  "ai.errors.conversationNotFound",
  "ai.errors.uprInsufficient",
  "ai.errors.sprInsufficient",
  "ai.errors.quotaUserNotFound",
] as const;

type iGM_AINoticeKey = (typeof iGM_AI_NOTICE_KEYS)[number];

/** 界面气泡（本地消息与服务端历史消息统一形态） */
interface iGM_AIBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 异常提示：超时（红）或超字数截断（黄），显示在气泡下方 */
  notice?: iGM_AIStreamNotice;
}

/** 本地临时气泡序号（仅用于 React key，不参与业务） */
let iGM_AIBubbleSeq = 0;

// 核心逻辑 //
/** 读取本地保存的会话 id（构建期无 window，返回 null） */
function iGM_ReadStoredConversationId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(iGM_AI_CONVERSATION_STORAGE_KEY);
}

/** 读取本地会话 id 的归属账号 id（回填前的隔离校验用） */
function iGM_ReadStoredConversationOwner(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(iGM_AI_CONVERSATION_OWNER_STORAGE_KEY);
}

/** 清空全部 AI 本地缓存（会话 id / 归属账号 / 模型信息展开态；登录、登出、换号时调用） */
function iGM_ClearAIChatStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(iGM_AI_CONVERSATION_STORAGE_KEY);
  window.localStorage.removeItem(iGM_AI_CONVERSATION_OWNER_STORAGE_KEY);
  window.localStorage.removeItem(iGM_AI_MODEL_INFO_STORAGE_KEY);
}

/** 写入或清除本地会话 id 与归属账号（清除时二者一并移除，避免残留他人会话 id） */
function iGM_WriteStoredConversationId(
  id: string | null,
  ownerId: string | null,
): void {
  if (typeof window === "undefined") return;
  if (id && ownerId) {
    window.localStorage.setItem(iGM_AI_CONVERSATION_STORAGE_KEY, id);
    window.localStorage.setItem(iGM_AI_CONVERSATION_OWNER_STORAGE_KEY, ownerId);
  } else {
    window.localStorage.removeItem(iGM_AI_CONVERSATION_STORAGE_KEY);
    window.localStorage.removeItem(iGM_AI_CONVERSATION_OWNER_STORAGE_KEY);
  }
}

/** 生成本地临时气泡 id */
function iGM_NextBubbleId(role: "user" | "assistant"): string {
  iGM_AIBubbleSeq += 1;
  return `ai-${role}-${iGM_AIBubbleSeq}`;
}

/** 服务端消息转界面气泡 */
function iGM_ToBubble(message: iGM_AIChatMessage): iGM_AIBubble {
  return { id: message.id, role: message.role, content: message.content };
}

/** 把任意错误归一化为可展示的文案键，保证界面永不暴露原始错误或 i18n 键 */
function iGM_ResolveErrorKey(
  error: unknown,
  channel: iGM_AIChannel = "free",
): iGM_AINoticeKey {
  if (error instanceof iGM_RequestError) {
    if (error.kind === "timeout") return "ai.errors.timeout";
    if (error.kind === "network") return "ai.errors.network";
    if (error.code === 401) return "ai.widget.loginRequired";
    // 402 余额不足：后端 message 已按通道给出文案键；兜底按当前通道映射
    if (error.code === 402) {
      return channel === "free"
        ? "ai.errors.uprInsufficient"
        : "ai.errors.sprInsufficient";
    }
    if (error.code === 429) return "ai.errors.busy";
    // 后端业务错误 message 即文案键（ai.errors.*）
    if ((iGM_AI_NOTICE_KEYS as readonly string[]).includes(error.message)) {
      return error.message as iGM_AINoticeKey;
    }
  }
  return "ai.errors.generic";
}

/** 当前通道余额是否不足以发起下一次提问（余额未知时不拦截，由后端兜底） */
function iGM_IsBalanceInsufficient(
  channel: iGM_AIChannel,
  balance: number | null,
): boolean {
  if (balance === null) return false;
  return channel === "free" ? balance < iGM_AI_QUESTION_COST : balance <= 0;
}

/** iGM StarWhisper 悬浮入口 + 居中模态框 */
export function iGM_AIChatWidget() {
  const t = useTranslations();
  const locale = useLocale();
  const router = iGM_UseLocaleRouter();
  const pathname = usePathname();
  const { status, user } = iGM_UseAuth();
  const userId = user?.id ?? null;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<iGM_AIBubble[]>([]);
  const [input, setInput] = useState("");
  // sending：流式进行中（决定打字光标与输入禁用）
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [noticeKey, setNoticeKey] = useState<iGM_AINoticeKey | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // 会话记录目录：本人最近 3 个会话（最新创建在前），移动端默认折叠
  const [conversations, setConversations] = useState<iGM_AIConversation[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(true);
  // UPR 消耗详情面板：分页流水（下拉滚动加载更多）
  const [uprDetailOpen, setUprDetailOpen] = useState(false);
  const [uprItems, setUprItems] = useState<iGM_UPRTransactionItem[]>([]);
  const [uprTotal, setUprTotal] = useState(0);
  const [uprPage, setUprPage] = useState(0);
  const [uprLoading, setUprLoading] = useState(false);
  const [uprFailed, setUprFailed] = useState(false);
  // 当前通道：free（本地 Qwen，扣 UPR）/ premium（DeepSeek Flash，扣 SPR）
  const [channel, setChannel] = useState<iGM_AIChannel>("free");
  // UPR / SPR 双余额与双通道模型名（未登录 / 查询失败时为 null）
  const [uprBalance, setUprBalance] = useState<number | null>(null);
  const [sprBalance, setSprBalance] = useState<number | null>(null);
  const [freeModel, setFreeModel] = useState<string | null>(null);
  const [premiumModel, setPremiumModel] = useState<string | null>(null);
  const [modelInfoOpen, setModelInfoOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  // uprLoadingRef：加载中防重入（滚动事件高频触发）；historySeqRef：防旧会话响应覆盖新选择
  const uprLoadingRef = useRef(false);
  const uprListRef = useRef<HTMLDivElement | null>(null);
  const historySeqRef = useRef(0);

  // 账号切换隔离：登出或换号时清空全部 AI 本地缓存（会话 id / 归属账号 / 模型信息态）
  useEffect(() => {
    if (status === "loading") return;
    if (status === "anonymous") {
      iGM_ClearAIChatStorage();
      return;
    }
    if (
      iGM_ReadStoredConversationId() !== null &&
      iGM_ReadStoredConversationOwner() !== userId
    ) {
      iGM_ClearAIChatStorage();
    }
  }, [status, userId]);

  // 登录态就绪后恢复本地会话 id 并回填历史（刷新页面 / 登录后继续上次对话）
  useEffect(() => {
    if (status !== "authenticated") return;
    const stored = iGM_ReadStoredConversationId();
    if (!stored) return;
    // 归属二次校验：本地会话 id 不属于当前账号时清空，绝不回填他人会话
    if (iGM_ReadStoredConversationOwner() !== userId) {
      iGM_ClearAIChatStorage();
      return;
    }
    // 先恢复会话 id，保证回填期间发送的消息仍落在上次会话
    setConversationId(stored);
    setHistoryLoading(true);
    let cancelled = false;
    const seq = historySeqRef.current;
    void (async () => {
      try {
        const response = await iGM_ApiAIConversation(stored);
        // 回填期间用户已切换/新建会话（序号变化）时不覆盖当前消息
        if (cancelled || historySeqRef.current !== seq) return;
        const restored = (response.data?.messages ?? []).map(iGM_ToBubble);
        setMessages((prev) => (prev.length === 0 ? restored : prev));
      } catch (error) {
        if (cancelled || historySeqRef.current !== seq) return;
        // 会话失效（已删除或非本人）：清除本地记录，从新会话开始
        if (iGM_ResolveErrorKey(error) === "ai.errors.conversationNotFound") {
          iGM_WriteStoredConversationId(null, null);
          setConversationId(null);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  // 模型信息展开态：读取本地持久化（不写数据库）
  useEffect(() => {
    if (typeof window === "undefined") return;
    setModelInfoOpen(
      window.localStorage.getItem(iGM_AI_MODEL_INFO_STORAGE_KEY) === "1",
    );
  }, []);

  // 会话记录目录展开态：移动端默认折叠，桌面端默认展开
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSessionsOpen(!window.matchMedia("(max-width: 767px)").matches);
  }, []);

  /** 刷新双余额与双模型名（失败静默，不打断对话主流程） */
  const iGM_RefreshInfo = useCallback(async () => {
    if (status !== "authenticated") {
      setUprBalance(null);
      setSprBalance(null);
      setFreeModel(null);
      setPremiumModel(null);
      return;
    }
    try {
      const response = await iGM_ApiAIInfo();
      if (response.data) {
        setUprBalance(response.data.uprBalance);
        setSprBalance(response.data.sprBalance);
        setFreeModel(response.data.freeModel);
        setPremiumModel(response.data.premiumModel);
      }
    } catch {
      // 余额查询失败静默处理
    }
  }, [status]);

  /** 刷新会话记录目录（失败静默，不打断对话主流程） */
  const iGM_RefreshConversations = useCallback(async () => {
    if (status !== "authenticated") {
      setConversations([]);
      return;
    }
    try {
      const response = await iGM_ApiAIConversations();
      setConversations(response.data ?? []);
    } catch {
      // 会话列表刷新失败静默处理（列表保留上一次结果）
    }
  }, [status]);

  // 打开模态框（已登录）时刷新余额、模型信息与会话记录目录
  useEffect(() => {
    if (!open || status !== "authenticated") return;
    void iGM_RefreshInfo();
    void iGM_RefreshConversations();
  }, [open, status, iGM_RefreshInfo, iGM_RefreshConversations]);

  // 消息变化时平滑滚动到底部
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open, historyLoading]);

  /** 切换模型信息展开态并本地持久化 */
  const iGM_ToggleModelInfo = useCallback(() => {
    setModelInfoOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          iGM_AI_MODEL_INFO_STORAGE_KEY,
          next ? "1" : "0",
        );
      }
      return next;
    });
  }, []);

  /** 加载 UPR 消耗流水某页（第 1 页替换、其余追加；防重入，失败可重试） */
  const iGM_LoadUPRPage = useCallback(async (page: number) => {
    if (uprLoadingRef.current) return;
    uprLoadingRef.current = true;
    setUprLoading(true);
    setUprFailed(false);
    try {
      const response = await iGM_ApiAIUPRTransactions(page, iGM_AI_UPR_PAGE_SIZE);
      const data = response.data;
      if (!data) {
        setUprFailed(true);
        return;
      }
      setUprItems((prev) => (page <= 1 ? data.items : [...prev, ...data.items]));
      setUprTotal(data.total);
      setUprPage(data.page);
    } catch {
      setUprFailed(true);
    } finally {
      uprLoadingRef.current = false;
      setUprLoading(false);
    }
  }, []);

  /** 打开 UPR 消耗详情面板：重置流水并加载第一页 */
  const iGM_OpenUPRDetail = useCallback(() => {
    setUprDetailOpen(true);
    setUprItems([]);
    setUprTotal(0);
    setUprPage(0);
    setUprFailed(false);
    void iGM_LoadUPRPage(1);
  }, [iGM_LoadUPRPage]);

  /** UPR 流水列表滚动触底：仍有下一页时自动加载更多（失败后由重试按钮触发） */
  const iGM_OnUPRScroll = useCallback(() => {
    const list = uprListRef.current;
    if (!list || uprLoadingRef.current || uprFailed) return;
    if (uprItems.length === 0 || uprItems.length >= uprTotal) return;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 24) {
      void iGM_LoadUPRPage(uprPage + 1);
    }
  }, [uprItems.length, uprTotal, uprPage, uprFailed, iGM_LoadUPRPage]);

  /** 切换会话：中止当前流，按所选会话加载历史消息（序号防旧响应覆盖新选择） */
  const iGM_SelectConversation = useCallback(
    (id: string) => {
      if (id === conversationId) return;
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      setSending(false);
      setStreamingId(null);
      setNoticeKey(null);
      iGM_WriteStoredConversationId(id, userId);
      setConversationId(id);
      const seq = historySeqRef.current + 1;
      historySeqRef.current = seq;
      setHistoryLoading(true);
      void (async () => {
        try {
          const response = await iGM_ApiAIConversation(id);
          if (historySeqRef.current !== seq) return;
          setMessages((response.data?.messages ?? []).map(iGM_ToBubble));
        } catch (error) {
          if (historySeqRef.current !== seq) return;
          // 会话已失效（不存在或非本人）：清除本地记录并刷新会话目录
          if (iGM_ResolveErrorKey(error) === "ai.errors.conversationNotFound") {
            iGM_WriteStoredConversationId(null, null);
            setConversationId(null);
            setMessages([]);
            void iGM_RefreshConversations();
          }
        } finally {
          if (historySeqRef.current === seq) setHistoryLoading(false);
        }
      })();
    },
    [conversationId, iGM_RefreshConversations, userId],
  );

  /** 新建会话：清空当前对话（后端在首次提问时创建，超出 3 个自动删除最早会话） */
  const iGM_StartNewConversation = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setSending(false);
    setStreamingId(null);
    setNoticeKey(null);
    setHistoryLoading(false);
    historySeqRef.current += 1;
    iGM_WriteStoredConversationId(null, null);
    setConversationId(null);
    setMessages([]);
  }, []);

  /** 关闭模态框：流式进行中时中止流（已收到内容保留，不弹错误） */
  const iGM_Close = useCallback(() => {
    streamAbortRef.current?.abort();
    setUprDetailOpen(false);
    setOpen(false);
  }, []);

  /** 停止生成：中止当前流式请求（已生成内容保留；后端按已生成内容计费并记录「用户手动停止」） */
  const iGM_StopGenerating = useCallback(() => {
    streamAbortRef.current?.abort();
  }, []);

  /** 发送提问：乐观追加用户气泡与 AI 空气泡，SSE 增量逐段填充 */
  const iGM_Send = useCallback(async () => {
    const text = input.trim();
    if (sending || text.length === 0) return;
    if (status !== "authenticated") {
      setNoticeKey("ai.widget.loginRequired");
      return;
    }
    const activeBalance = channel === "free" ? uprBalance : sprBalance;
    if (iGM_IsBalanceInsufficient(channel, activeBalance)) {
      setNoticeKey(
        channel === "free"
          ? "ai.errors.uprInsufficient"
          : "ai.errors.sprInsufficient",
      );
      return;
    }
    setNoticeKey(null);
    setInput("");
    const userBubble: iGM_AIBubble = {
      id: iGM_NextBubbleId("user"),
      role: "user",
      content: text,
    };
    const assistantId = iGM_NextBubbleId("assistant");
    setMessages((prev) => [
      ...prev,
      userBubble,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setSending(true);
    setStreamingId(assistantId);

    const controller = new AbortController();
    streamAbortRef.current = controller;
    // 本地累计已生成文本：超时且已产出内容时只在气泡下方提示，不再叠加全局错误条
    let streamedText = "";

    try {
      await iGM_ApiAIStreamChat(
        channel,
        text,
        conversationId,
        {
          onConversationId: (id) => {
            setConversationId(id);
            iGM_WriteStoredConversationId(id, userId);
          },
          onDelta: (delta) => {
            streamedText += delta;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          },
          onNotice: (streamNotice) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, notice: streamNotice }
                  : message,
              ),
            );
          },
        },
        controller.signal,
      );
    } catch (error) {
      const notice = iGM_ResolveErrorKey(error, channel);
      if (notice === "ai.errors.timeout" && streamedText.length > 0) {
        // 超时已按生成内容扣费：仅在气泡下方以红色提示，避免与全局错误条重复
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, notice: "timeout" }
              : message,
          ),
        );
      } else {
        setNoticeKey(notice);
        // 本地残留的旧会话已失效（不存在或非本人）：清除记录，下次提问自动新建会话
        if (notice === "ai.errors.conversationNotFound") {
          iGM_WriteStoredConversationId(null, null);
          setConversationId(null);
        }
      }
      // 未产生任何内容的空气泡：直接移除，避免残留空气泡
      setMessages((prev) =>
        prev.filter(
          (message) => message.id !== assistantId || message.content.length > 0,
        ),
      );
    } finally {
      // 切换/新建会话会先行接管流状态：仅当本流仍是当前流时才重置，避免覆盖新流
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
        setStreamingId(null);
        setSending(false);
      }
      // 提问与回答均可能扣费：流结束后刷新余额；会话标题可能更新：刷新会话目录
      void iGM_RefreshInfo();
      void iGM_RefreshConversations();
    }
  }, [
    input,
    sending,
    status,
    userId,
    conversationId,
    channel,
    uprBalance,
    sprBalance,
    iGM_RefreshInfo,
    iGM_RefreshConversations,
  ]);

  /** 键盘交互：Enter 发送、Shift+Enter 换行；中文输入法组合期间不触发发送 */
  const iGM_OnKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      void iGM_Send();
    },
    [iGM_Send],
  );

  /** 引导登录：跳转登录页并携带当前路径以便登录后回跳 */
  const iGM_GoLogin = useCallback(() => {
    iGM_Close();
    router.push(`/G_Auth/login?redirect=${encodeURIComponent(pathname)}`);
  }, [iGM_Close, router, pathname]);

  // 登录态派生值：未登录（含加载中）时输入区与发送按钮整体禁用
  const isAuthenticated = status === "authenticated";

  // 当前通道派生的展示值：余额 / 模型名 / 是否不足
  const activeBalance = channel === "free" ? uprBalance : sprBalance;
  const activeModel = channel === "free" ? freeModel : premiumModel;
  const insufficient = iGM_IsBalanceInsufficient(channel, activeBalance);

  if (!open) {
    return (
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen(true)}
        aria-label={t("ai.widget.open")}
      >
        <Sparkles size={20} strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={iGM_Close}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t("ai.widget.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <span className={styles.headerIcon}>
            <Sparkles size={16} strokeWidth={1.8} />
          </span>
          <p className={styles.headerTitle}>{t("ai.widget.title")}</p>
          {activeBalance !== null &&
            (channel === "free" ? (
              <button
                type="button"
                className={`${styles.balance} ${styles.balanceAction}`}
                onClick={iGM_OpenUPRDetail}
                title={t("ai.widget.viewUPRDetail")}
              >
                <Coins size={13} strokeWidth={1.8} aria-hidden />
                {"UPR: "}
                {iGM_FormatQuota(activeBalance)}
              </button>
            ) : (
              <span className={styles.balance}>
                <Coins size={13} strokeWidth={1.8} aria-hidden />
                {"SPR: "}
                {iGM_FormatQuota(activeBalance)}
              </span>
            ))}
          <button
            type="button"
            className={styles.headerClose}
            onClick={iGM_Close}
            aria-label={t("ai.widget.close")}
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </header>

        {/* 账号专属提示：会话与流水均按当前账号严格隔离 */}
        <p className={styles.accountTip}>{t("ai.widget.accountIsolation")}</p>

        {/* 通道切换：极简 Tab + 滑动气泡（Free 扣 UPR / Premium 扣 SPR） */}
        <div
          className={styles.channelTabs}
          role="tablist"
          aria-label={t("ai.widget.title")}
        >
          <span
            className={styles.channelBubble}
            style={{
              left: channel === "premium" ? "50%" : "3px",
              right: channel === "premium" ? "3px" : "50%",
            }}
            aria-hidden
          />
          {(["free", "premium"] as iGM_AIChannel[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={channel === item}
              className={`${styles.channelTab} ${
                channel === item ? styles.channelTabActive : ""
              }`}
              onClick={() => {
                setChannel(item);
                setNoticeKey(null);
              }}
            >
              {iGM_AI_CHANNEL_LABELS[item]}
            </button>
          ))}
        </div>

        {/* 会话记录目录：本地最多保留 3 个（最新创建在前），可折叠、可切换、可新建 */}
        <div className={styles.sessionsBar}>
          <button
            type="button"
            className={styles.sessionsToggle}
            onClick={() => setSessionsOpen((prev) => !prev)}
            aria-expanded={sessionsOpen}
          >
            <History size={13} strokeWidth={1.8} aria-hidden />
            {t("ai.widget.sessions")}
            {sessionsOpen ? (
              <ChevronUp size={13} strokeWidth={1.8} aria-hidden />
            ) : (
              <ChevronDown size={13} strokeWidth={1.8} aria-hidden />
            )}
          </button>
          <button
            type="button"
            className={styles.sessionsNew}
            onClick={iGM_StartNewConversation}
          >
            <Plus size={13} strokeWidth={1.8} aria-hidden />
            {t("ai.widget.newConversation")}
          </button>
        </div>
        {sessionsOpen && (
          <div className={styles.sessionsList}>
            {conversations.length === 0 ? (
              <p className={styles.sessionsEmpty}>
                {t("ai.widget.sessionsEmpty")}
              </p>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`${styles.sessionItem} ${
                    conversation.id === conversationId
                      ? styles.sessionItemActive
                      : ""
                  }`}
                  onClick={() => iGM_SelectConversation(conversation.id)}
                >
                  <span className={styles.sessionTitle}>
                    {conversation.title.trim().length > 0
                      ? conversation.title
                      : t("ai.widget.sessionUntitled")}
                  </span>
                  <span className={styles.sessionTime}>
                    {iGM_FormatRelative(locale, conversation.updatedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <div className={styles.messages} ref={listRef}>
          {messages.length === 0 && !sending && (
            <p className={styles.placeholder}>
              {historyLoading
                ? t("ai.widget.loadingHistory")
                : t("ai.widget.empty")}
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user" ? styles.rowUser : styles.rowAssistant
              }
            >
              {message.role === "user" ? (
                <p className={`${styles.bubble} ${styles.bubbleUser}`}>
                  {message.content}
                </p>
              ) : (
                <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
                  {message.id === streamingId &&
                    message.content.length === 0 && (
                      <>
                        <Loader2
                          size={13}
                          className={styles.spinner}
                          aria-hidden
                        />
                        {t("ai.widget.thinking")}
                      </>
                    )}
                  {message.content.length > 0 && (
                    <div
                      className={
                        message.id === streamingId
                          ? styles.streamingMarkdown
                          : undefined
                      }
                    >
                      <IGM_AIChatMarkdown content={message.content} />
                    </div>
                  )}
                </div>
              )}
              {/* 异常提示：超时（红）/ 超字数截断（黄），显示在气泡下方 */}
              {message.role === "assistant" && message.notice && (
                <p
                  className={`${styles.bubbleNotice} ${
                    message.notice === "timeout"
                      ? styles.bubbleNoticeTimeout
                      : styles.bubbleNoticeTruncated
                  }`}
                >
                  {t(
                    message.notice === "timeout"
                      ? "ai.notice.timeout"
                      : "ai.notice.truncated",
                  )}
                </p>
              )}
            </div>
          ))}
        </div>

        {noticeKey && (
          <div className={styles.notice} role="alert">
            <span className={styles.noticeText}>
              {t.has(noticeKey) ? t(noticeKey) : t("ai.errors.generic")}
            </span>
            {noticeKey === "ai.widget.loginRequired" && (
              <button
                type="button"
                className={styles.noticeAction}
                onClick={iGM_GoLogin}
              >
                {t("ai.widget.goLogin")}
              </button>
            )}
          </div>
        )}

        <footer className={styles.composer}>
          {/* 模型信息按钮：输入框正上方；展开态本地持久化 */}
          <div className={styles.modelBar}>
            <button
              type="button"
              className={styles.modelToggle}
              onClick={iGM_ToggleModelInfo}
              aria-expanded={modelInfoOpen}
            >
              <Cpu size={13} strokeWidth={1.8} aria-hidden />
              {t("ai.widget.modelInfo")}
              {modelInfoOpen ? (
                <ChevronUp size={13} strokeWidth={1.8} aria-hidden />
              ) : (
                <ChevronDown size={13} strokeWidth={1.8} aria-hidden />
              )}
            </button>
            {modelInfoOpen && (
              <span className={styles.modelName}>
                {activeModel
                  ? `${activeModel} (${t(
                      channel === "free"
                        ? "ai.widget.modelLocal"
                        : "ai.widget.modelCloud",
                    )})`
                  : "—"}
              </span>
            )}
          </div>

          {/* 未登录拦截：提示文案 + 去登录按钮（输入框与发送按钮同时禁用） */}
          {status === "anonymous" && (
            <div className={styles.loginGate} role="alert">
              <span className={styles.loginGateText}>
                {t("ai.widget.loginRequired")}
              </span>
              <button
                type="button"
                className={styles.loginGateAction}
                onClick={iGM_GoLogin}
              >
                {t("ai.widget.goLogin")}
              </button>
            </div>
          )}

          <div className={styles.inputRow}>
            <textarea
              className={styles.input}
              value={input}
              rows={1}
              maxLength={iGM_AI_MESSAGE_MAX_LENGTH}
              placeholder={
                status === "anonymous"
                  ? t("ai.widget.loginRequired")
                  : insufficient
                    ? t(
                        channel === "free"
                          ? "ai.errors.uprInsufficient"
                          : "ai.errors.sprInsufficient",
                      )
                    : t("ai.widget.placeholder")
              }
              disabled={!isAuthenticated || insufficient || sending}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={iGM_OnKeyDown}
            />
            {sending ? (
              <button
                type="button"
                className={styles.stop}
                onClick={iGM_StopGenerating}
                aria-label={t("ai.widget.stopGenerating")}
              >
                <Square size={13} strokeWidth={2.2} aria-hidden />
                {t("ai.widget.stopGenerating")}
              </button>
            ) : (
              <button
                type="button"
                className={styles.send}
                onClick={() => void iGM_Send()}
                disabled={
                  !isAuthenticated || insufficient || input.trim().length === 0
                }
                aria-label={t("ai.widget.send")}
              >
                <Send size={15} strokeWidth={1.8} />
              </button>
            )}
          </div>

          {/* Premium 通道专属：充值 SPR 入口（跳转账户充值页） */}
          {channel === "premium" && (
            <button
              type="button"
              className={styles.recharge}
              onClick={() => router.push("/G_Account_Recharge")}
            >
              <Coins size={13} strokeWidth={1.8} aria-hidden />
              {t("ai.widget.rechargeSpr")}
            </button>
          )}

          {/* 能力边界提示：可答站内问题与通用知识 / 无法访问外部网站 / 不回答敏感话题 */}
          <p className={styles.capability}>{t("ai.widget.capability")}</p>
        </footer>

        {/* UPR 消耗详情：点击头部 UPR 余额打开的玻璃态覆盖层（时间倒序 + 滚动加载） */}
        {uprDetailOpen && (
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <p className={styles.detailTitle}>{t("ai.upr.title")}</p>
              <button
                type="button"
                className={styles.detailClose}
                onClick={() => setUprDetailOpen(false)}
                aria-label={t("ai.widget.close")}
              >
                <X size={15} strokeWidth={1.8} />
              </button>
            </div>
            <div
              className={styles.detailList}
              ref={uprListRef}
              onScroll={iGM_OnUPRScroll}
            >
              {uprItems.length === 0 && !uprLoading && !uprFailed && (
                <p className={styles.detailEmpty}>{t("ai.upr.empty")}</p>
              )}
              {uprItems.map((item) => (
                <div key={item.id} className={styles.detailRow}>
                  <div className={styles.detailRowTop}>
                    <span className={styles.detailType}>
                      {t(`ai.upr.type.${item.type}`)}
                    </span>
                    <span
                      className={
                        item.amount >= 0 ? styles.amountIn : styles.amountOut
                      }
                    >
                      {item.amount >= 0 ? "+" : ""}
                      {iGM_FormatQuota(item.amount)}
                    </span>
                  </div>
                  <p className={styles.detailDetail}>{item.detail}</p>
                  <div className={styles.detailRowBottom}>
                    <span className={styles.detailTime}>
                      {iGM_FormatDateTime(locale, item.createdAt)}
                    </span>
                    <span className={styles.detailBalance}>
                      {t("ai.upr.balanceAfter")}
                      {": "}
                      {iGM_FormatQuota(item.balanceAfter)}
                    </span>
                  </div>
                </div>
              ))}
              {uprLoading && (
                <p className={styles.detailHint}>
                  <Loader2 size={13} className={styles.spinner} aria-hidden />
                  {t("ai.upr.loadingMore")}
                </p>
              )}
              {!uprLoading && uprFailed && (
                <div className={styles.detailError} role="alert">
                  <span className={styles.detailErrorText}>
                    {t("ai.errors.network")}
                  </span>
                  <button
                    type="button"
                    className={styles.detailRetry}
                    onClick={() => void iGM_LoadUPRPage(uprPage + 1)}
                  >
                    {t("ai.upr.retry")}
                  </button>
                </div>
              )}
              {!uprLoading &&
                !uprFailed &&
                uprItems.length > 0 &&
                uprItems.length >= uprTotal && (
                  <p className={styles.detailHint}>{t("ai.upr.allLoaded")}</p>
                )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// 导出 //
export default iGM_AIChatWidget;