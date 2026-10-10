/**
 * 文件路径：apps/web/src/iGM_Components/iGM_AIChatWidget/iGM_AIChatWidget.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（挂载于 iGM_Providers）
 * 模块：iGM_AIChatWidget
 * 作用：Chat iGM Nove V0.1 智能助手——右下角悬浮按钮，点击弹出屏幕居中模态框
 * 内容：居中模态框（约 600x600、半透明遮罩、玻璃态）、UQ/Coin 双余额与模型名展示、
 *       消息气泡列表、SSE 流式打字、模型信息按钮、余额不足拦截、会话持久化、
 *       未登录拦截、Markdown 代码块渲染、停止生成按钮、能力边界提示行；
 *       点击 UQ / Coin 余额查看消耗流水（分页滚动加载）
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
  iGM_ApiAIQuotaTransactions,
  type iGM_AIChatMessage,
  type iGM_AIConversation,
  type iGM_AIStreamNotice,
  type iGM_QuotaTransactionItem,
} from "../../iGM_Services/iGM_AIClient";
import {
  iGM_FormatDateTime,
  iGM_FormatQuota,
  iGM_FormatRelative,
} from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_AIChatMarkdown as IGM_AIChatMarkdown } from "./iGM_AIChatMarkdown";
import styles from "./iGM_AIChatWidget.module.css";

// 类型定义 //
const iGM_AI_CONVERSATION_STORAGE_KEY = "iGM_AIConversationId";
const iGM_AI_CONVERSATION_OWNER_STORAGE_KEY = "iGM_AIConversationOwner";
const iGM_AI_MODEL_INFO_STORAGE_KEY = "iGM_AIModelInfoOpen";
const iGM_AI_MESSAGE_MAX_LENGTH = 2000;
const iGM_AI_QUESTION_COST = 0.02;
const iGM_AI_QUOTA_PAGE_SIZE = 20;

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
  "ai.errors.quotaInsufficient",
  "ai.errors.quotaInsufficient",
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

/** 流水类型中文标签 */
function iGM_QuotaTypeLabel(type: string): string {
  const map: Record<string, string> = {
    register: "注册赠送",
    chat_question: "AI 提问",
    chat_answer: "AI 回答",
    recharge: "充值",
    reward: "社区奖励",
  };
  return map[type] ?? type;
}

/** 服务端消息转界面气泡 */
function iGM_ToBubble(message: iGM_AIChatMessage): iGM_AIBubble {
  return { id: message.id, role: message.role, content: message.content };
}

/** 把任意错误归一化为可展示的文案键 */
function iGM_ResolveErrorKey(error: unknown): iGM_AINoticeKey {
  if (error instanceof iGM_RequestError) {
    if (error.kind === "timeout") return "ai.errors.timeout";
    if (error.kind === "network") return "ai.errors.network";
    if (error.code === 401) return "ai.widget.loginRequired";
    if (error.code === 402) return "ai.errors.quotaInsufficient";
    if (error.code === 429) return "ai.errors.busy";
    if ((iGM_AI_NOTICE_KEYS as readonly string[]).includes(error.message)) {
      return error.message as iGM_AINoticeKey;
    }
  }
  return "ai.errors.generic";
}

/** 当前余额是否不足以发起下一次提问 */
function iGM_IsBalanceInsufficient(balance: number | null): boolean {
  if (balance === null) return false;
  return balance < iGM_AI_QUESTION_COST;
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
  // 会话记录目录：本人最近 3 个会话（最新创建在前）
  const [conversations, setConversations] = useState<iGM_AIConversation[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(true);
  // 流水详情面板（支持 UQ / Coin 两个币种）
  const [quotaDetailChannel, setQuotaDetailChannel] = useState<"uq" | "coin" | null>(null);
  const [quotaItems, setQuotaItems] = useState<iGM_QuotaTransactionItem[]>([]);
  const [quotaTotal, setQuotaTotal] = useState(0);
  const [quotaPage, setQuotaPage] = useState(0);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaFailed, setQuotaFailed] = useState(false);
  // UQ / Coin 双余额与模型名（未登录 / 查询失败时为 null）
  const [uqBalance, setUqBalance] = useState<number | null>(null);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [modelInfoOpen, setModelInfoOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const quotaLoadingRef = useRef(false);
  const quotaListRef = useRef<HTMLDivElement | null>(null);
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
      setUqBalance(null);
      setCoinBalance(null);
      setModelName(null);
      setModelName(null);
      return;
    }
    try {
      const response = await iGM_ApiAIInfo();
      if (response.data) {
        setUqBalance(response.data.uqBalance);
        setCoinBalance(response.data.coinBalance);
        setModelName(response.data.modelName);
        setModelName(response.data.modelName);
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
  const iGM_LoadquotaPage = useCallback(async (page: number) => {
    if (quotaLoadingRef.current) return;
    quotaLoadingRef.current = true;
    setQuotaLoading(true);
    setQuotaFailed(false);
    try {
      const response = await iGM_ApiAIQuotaTransactions((quotaDetailChannel ?? "uq"), page, iGM_AI_QUOTA_PAGE_SIZE);
      const data = response.data;
      if (!data) {
        setQuotaFailed(true);
        return;
      }
      setQuotaItems((prev) => (page <= 1 ? data.items : [...prev, ...data.items]));
      setQuotaTotal(data.total);
      setQuotaPage(data.page);
    } catch {
      setQuotaFailed(true);
    } finally {
      quotaLoadingRef.current = false;
      setQuotaLoading(false);
    }
  }, []);

  /** 打开 UPR 消耗详情面板：重置流水并加载第一页 */
  const iGM_OpenUPRDetail = useCallback(() => {
    setQuotaDetailChannel("uq");
    setQuotaItems([]);
    setQuotaTotal(0);
    setQuotaPage(0);
    setQuotaFailed(false);
    void iGM_LoadquotaPage(1);
  }, [iGM_LoadquotaPage]);

  /** UPR 流水列表滚动触底：仍有下一页时自动加载更多（失败后由重试按钮触发） */
  const iGM_OnQuotaScroll = useCallback(() => {
    const list = quotaListRef.current;
    if (!list || quotaLoadingRef.current || quotaFailed) return;
    if (quotaItems.length === 0 || quotaItems.length >= quotaTotal) return;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 24) {
      void iGM_LoadquotaPage(quotaPage + 1);
    }
  }, [quotaItems.length, quotaTotal, quotaPage, quotaFailed, iGM_LoadquotaPage]);

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
    setQuotaDetailChannel(null);
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
    // 两个币种余额都不够才拦截
    if (iGM_IsBalanceInsufficient(uqBalance ?? 0) && iGM_IsBalanceInsufficient(coinBalance ?? 0)) {
      setNoticeKey("ai.errors.quotaInsufficient");
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
        text,
        conversationId,
        {
          onConversationId: (id: string) => {
            setConversationId(id);
            iGM_WriteStoredConversationId(id, userId);
          },
          onDelta: (delta: string) => {
            streamedText += delta;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          },
          onNotice: (streamNotice: unknown) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, notice: streamNotice as never }
                  : message,
              ),
            );
          },
        },
        controller.signal,
      );
    } catch (error) {
      const notice = iGM_ResolveErrorKey(error);
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
    uqBalance,
    coinBalance,
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

  const isAuthenticated = status === "authenticated";
  const insufficient =
    iGM_IsBalanceInsufficient(uqBalance ?? 0) &&
    iGM_IsBalanceInsufficient(coinBalance ?? 0);

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
          {isAuthenticated && (
            <div className={styles.balances}>
              <button
                type="button"
                className={`${styles.balance} ${styles.balanceAction}`}
                onClick={() => { setQuotaDetailChannel("uq"); setQuotaItems([]); setQuotaTotal(0); setQuotaPage(0); setQuotaFailed(false); void iGM_LoadquotaPage(1); }}
                title="UQ 流水"
              >
                <Coins size={13} strokeWidth={1.8} aria-hidden />
                UQ: {uqBalance !== null ? iGM_FormatQuota(uqBalance) : "--"}
              </button>
              <button
                type="button"
                className={`${styles.balance} ${styles.balanceAction}`}
                onClick={() => { setQuotaDetailChannel("coin"); setQuotaItems([]); setQuotaTotal(0); setQuotaPage(0); setQuotaFailed(false); void iGM_LoadquotaPage(1); }}
                title="Coin 流水"
              >
                Coin: {coinBalance !== null ? iGM_FormatQuota(coinBalance) : "--"}
              </button>
            </div>
          )}
          <button
            type="button"
            className={styles.headerClose}
            onClick={iGM_Close}
            aria-label={t("ai.widget.close")}
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </header>

        {/* 账号专属提示 */}
        <p className={styles.accountTip}>{t("ai.widget.accountIsolation")}</p>

        {/* 单通道提示（模型名） */}
        <div className={styles.modelRow}>
          <Cpu size={13} strokeWidth={1.8} aria-hidden />
          {modelName ?? "Chat iGM Nove V0.1"}
        </div>

        {/* 会话记录目录 */}
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
                {modelName
                  ? `${modelName} (${t("ai.widget.modelLocal")})`
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
                    ? t("ai.errors.quotaInsufficient")
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

          {/* 能力边界提示 */}
          <p className={styles.capability}>{t("ai.widget.capability")}</p>
        </footer>

        {/* 消耗详情面板：根据 quotaDetailChannel 显示 UQ 或 Coin 流水 */}
        {quotaDetailChannel !== null && (
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <p className={styles.detailTitle}>
                {quotaDetailChannel === "uq" ? "UQ 消耗流水" : "Coin 消耗流水"}
              </p>
              <button
                type="button"
                className={styles.detailClose}
                onClick={() => setQuotaDetailChannel(null)}
                aria-label={t("ai.widget.close")}
              >
                <X size={15} strokeWidth={1.8} />
              </button>
            </div>
            <div
              className={styles.detailList}
              ref={quotaListRef}
              onScroll={iGM_OnQuotaScroll}
            >
              {quotaItems.length === 0 && !quotaLoading && !quotaFailed && (
                <p className={styles.detailEmpty}>暂无流水记录</p>
              )}
              {quotaItems.map((item) => (
                <div key={item.id} className={styles.detailRow}>
                  <div className={styles.detailRowTop}>
                    <span className={styles.detailType}>
                      {iGM_QuotaTypeLabel(item.type)}
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
                  {item.detail && (
                    <p className={styles.detailDetail}>{item.detail}</p>
                  )}
                  <div className={styles.detailRowBottom}>
                    <span className={styles.detailTime}>
                      {iGM_FormatDateTime(locale, item.createdAt)}
                    </span>
                    <span className={styles.detailBalance}>
                      余额：{iGM_FormatQuota(item.balanceAfter)}
                    </span>
                  </div>
                </div>
              ))}
              {quotaLoading && (
                <p className={styles.detailHint}>
                  <Loader2 size={13} className={styles.spinner} aria-hidden />
                  加载中...
                </p>
              )}
              {!quotaLoading && quotaFailed && (
                <div className={styles.detailError} role="alert">
                  <span className={styles.detailErrorText}>
                    {t("ai.errors.network")}
                  </span>
                  <button
                    type="button"
                    className={styles.detailRetry}
                    onClick={() => void iGM_LoadquotaPage(quotaPage + 1)}
                  >
                    重试
                  </button>
                </div>
              )}
              {!quotaLoading &&
                !quotaFailed &&
                quotaItems.length > 0 &&
                quotaItems.length >= quotaTotal && (
                  <p className={styles.detailHint}>已加载全部</p>
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