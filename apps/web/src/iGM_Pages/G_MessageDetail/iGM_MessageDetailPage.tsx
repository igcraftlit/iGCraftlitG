/**
 * 文件路径：apps/web/src/iGM_Pages/G_MessageDetail/iGM_MessageDetailPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_MessageDetail?conversationId= 或 peerId=（RequireAuth 登录可见）
 * 模块：G_MessageDetail
 * 作用：一对一私信会话——消息流、发送、限时撤回、对端已读状态、删除会话
 * 内容：对端信息条、气泡消息列表（本人/对端）、文本输入框、撤回（2 分钟内）、
 *       删除会话（仅对本人隐藏）、实时消息/撤回/已读事件处理
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端；
 *       消息仅会话双方可见，服务端为真正安全边界
 */

// 导入依赖 //
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiDeleteConversation,
  iGM_ApiGetConversation,
  iGM_ApiMarkConversationRead,
  iGM_ApiOpenConversation,
  iGM_ApiRecallMessage,
  iGM_ApiSendMessage,
  type iGM_Message,
} from "../../iGM_Services/iGM_MessageClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_UseWebSocket } from "../../iGM_Providers/iGM_WebSocketProvider";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_FormatTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module10.module.css";

// 类型定义 //
/** 撤回时限（与后端一致：2 分钟） */
const iGM_RecallWindowMs = 2 * 60 * 1000;

// 核心逻辑 //
/** 会话详情主体（已包在 RequireAuth 内） */
function iGM_MessageDetailContent() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const { user } = iGM_UseAuth();
  const { locale } = iGM_UseLocale();
  const { messageEvents, refreshMessageUnread } = iGM_UseWebSocket();

  const queryConversationId = searchParams.get("conversationId");
  const queryPeerId = searchParams.get("peerId");

  const [conversationId, setConversationId] = useState<string>(queryConversationId ?? "");
  const [peer, setPeer] = useState<{ id: string; username: string; displayName: string | null; avatar: string | null } | null>(null);
  const [messages, setMessages] = useState<iGM_Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** 初始加载：按会话 ID 或对端 ID 打开会话 */
  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = queryConversationId
        ? await iGM_ApiGetConversation(queryConversationId)
        : queryPeerId
          ? await iGM_ApiOpenConversation(queryPeerId)
          : null;
      const conversation = response?.data?.conversation;
      if (!conversation) {
        setErrorText(t("message.errors.conversationNotFound"));
        return;
      }
      setConversationId(conversation.id);
      setPeer(conversation.peer);
      setMessages(conversation.messages);
      // 进入会话即标记已读并同步全局未读数
      if (conversation.unreadCount > 0) {
        await iGM_ApiMarkConversationRead(conversation.id);
        await refreshMessageUnread();
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryConversationId, queryPeerId, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 消息变化时滚动到底部 */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  /** 处理实时事件：仅关注当前会话 */
  const latestEvent = messageEvents[0];
  useEffect(() => {
    if (!latestEvent || latestEvent.conversationId !== conversationId) return;
    if (latestEvent.type === "message") {
      const incoming = latestEvent.message;
      setMessages((prev) =>
        prev.some((item) => item.id === incoming.id)
          ? prev
          : [...prev, incoming],
      );
      // 对端消息到达且会话在前台：立即标记已读
      if (incoming.senderId !== user?.id) {
        void iGM_ApiMarkConversationRead(conversationId).then(() =>
          refreshMessageUnread(),
        );
      }
    } else if (latestEvent.type === "messageRecall") {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === latestEvent.messageId
            ? { ...item, isRecalled: true }
            : item,
        ),
      );
    } else if (latestEvent.type === "messageRead") {
      // 对端已读：将本人发出的消息置为已读
      setMessages((prev) =>
        prev.map((item) =>
          item.senderId === user?.id ? { ...item, isRead: true } : item,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestEvent, conversationId, user?.id]);

  /** 发送消息 */
  async function iGM_HandleSend(): Promise<void> {
    const content = draft.trim();
    if (!content || sending || !conversationId) return;
    setSending(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiSendMessage({ conversationId, content });
      const sent = response.data?.message;
      if (sent) {
        setMessages((prev) =>
          prev.some((item) => item.id === sent.id) ? prev : [...prev, sent],
        );
      }
      setDraft("");
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSending(false);
    }
  }

  /** 输入框：Enter 发送，Shift+Enter 换行 */
  function iGM_HandleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void iGM_HandleSend();
    }
  }

  /** 撤回本人消息（限时 2 分钟） */
  async function iGM_HandleRecall(messageId: string): Promise<void> {
    setErrorText(null);
    try {
      await iGM_ApiRecallMessage(messageId);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === messageId ? { ...item, isRecalled: true } : item,
        ),
      );
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }

  /** 删除会话（仅对本人隐藏）后返回列表 */
  async function iGM_HandleDelete(): Promise<void> {
    if (!conversationId) return;
    const confirmed = window.confirm(t("message.confirmDelete"));
    if (!confirmed) return;
    try {
      await iGM_ApiDeleteConversation(conversationId);
      await refreshMessageUnread();
      router.push("/G_Messages");
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }

  const peerName = useMemo(
    () => (peer ? (peer.displayName ?? peer.username) : ""),
    [peer],
  );

  return (
    <div className={pageStyles.page}>
      {/* 顶部操作行 */}
      <div className={styles.actionRow}>
        <Link href="/G_Messages" className={styles.backLink}>
          <ArrowLeft size={14} strokeWidth={2} />
          {t("message.backToList")}
        </Link>
        <button
          type="button"
          className={styles.iconButton}
          title={t("message.deleteConversation")}
          onClick={() => void iGM_HandleDelete()}
        >
          <Trash2 size={15} strokeWidth={1.8} />
        </button>
      </div>

      {/* 对端信息条 */}
      {peer && (
        <div className={`${styles.sectionCard} ${styles.actionRow}`}>
          <IGM_Avatar size="default" src={peer.avatar} name={peerName} />
          <Link href={`/G_User?userId=${encodeURIComponent(peer.id)}`} className={styles.userName}>
            {peerName}
          </Link>
        </div>
      )}

      {errorText && <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>}

      {/* 会话主体 */}
      {loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("message.stateLoading")}
        </div>
      ) : (
        <div className={`${styles.sectionCard} ${styles.conversationWrap}`}>
          <div ref={scrollRef} className={styles.messageScroll}>
            {messages.map((message) => {
              const isSelf = message.senderId === user?.id;
              const canRecall =
                isSelf &&
                !message.isRecalled &&
                Date.now() - new Date(message.createdAt).getTime() <
                  iGM_RecallWindowMs;
              return (
                <div
                  key={message.id}
                  className={`${styles.bubbleRow} ${
                    isSelf ? styles.bubbleRowSelf : styles.bubbleRowPeer
                  }`}
                >
                  <div
                    className={`${styles.bubble} ${
                      message.isRecalled
                        ? styles.bubbleRecalled
                        : isSelf
                          ? styles.bubbleSelf
                          : styles.bubblePeer
                    }`}
                  >
                    {message.isRecalled ? t("message.recalledInline") : message.content}
                  </div>
                  <span className={styles.bubbleMeta}>
                    {iGM_FormatTime(locale, message.createdAt)}
                    {isSelf && !message.isRecalled && (
                      message.isRead ? (
                        <CheckCheck size={13} strokeWidth={1.8} />
                      ) : (
                        <Check size={13} strokeWidth={1.8} />
                      )
                    )}
                    {canRecall && (
                      <button
                        type="button"
                        className={styles.bubbleMetaButton}
                        onClick={() => void iGM_HandleRecall(message.id)}
                      >
                        {t("message.recall")}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 输入区 */}
          <div className={styles.composer}>
            <textarea
              className={styles.composerInput}
              rows={1}
              value={draft}
              placeholder={t("message.composerPlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={iGM_HandleKeyDown}
            />
            <button
              type="button"
              className={styles.primaryButton}
              disabled={sending || !draft.trim()}
              onClick={() => void iGM_HandleSend()}
            >
              {sending ? (
                <LoaderCircle size={15} className="igm-spin" />
              ) : (
                t("message.send")
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 会话详情页（登录守卫） */
const IGM_MessageDetailContent = iGM_MessageDetailContent;
export function iGM_MessageDetailPage() {
  return (
    <IGM_RequireAuth>
      <IGM_MessageDetailContent />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_MessageDetailPage;
