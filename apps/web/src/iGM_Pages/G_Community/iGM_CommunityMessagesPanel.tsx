/**
 * 文件路径：apps/web/src/iGM_Pages/G_Community/iGM_CommunityMessagesPanel.tsx
 * 所属层：前端 / 页面层（G_Community 子面板）
 * 路由：/G_Community?tab=messages&conversationId= 或 &peerId=
 * 模块：G_Community
 * 作用：社区广场「私信」标签——会话列表与会话详情双栏
 * 内容：会话列表（对端、末条消息、未读数、实时刷新）、消息流、发送、
 *       限时撤回、已读状态、删除会话；隐私设置入口指向账户设置
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
  Lock,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiDeleteConversation,
  iGM_ApiGetConversation,
  iGM_ApiListConversations,
  iGM_ApiMarkConversationRead,
  iGM_ApiOpenConversation,
  iGM_ApiRecallMessage,
  iGM_ApiSendMessage,
  type iGM_ConversationListData,
  type iGM_Message,
} from "../../iGM_Services/iGM_MessageClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_UseWebSocket } from "../../iGM_Providers/iGM_WebSocketProvider";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDateTime, iGM_FormatTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import socialStyles from "../iGM_Module10.module.css";
import hubStyles from "./iGM_CommunityHub.module.css";

// 类型定义 //
/** 撤回时限（与后端一致：2 分钟） */
const iGM_RecallWindowMs = 2 * 60 * 1000;

/** 会话对端简要资料 */
interface iGM_PeerBrief {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

// 核心逻辑 //
/** 私信标签：列表 + 会话双栏（移动端单栏切换） */
export function iGM_CommunityMessagesPanel() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const { user } = iGM_UseAuth();
  const { locale } = iGM_UseLocale();
  const { messageEvents, refreshMessageUnread } = iGM_UseWebSocket();

  const queryConversationId = searchParams.get("conversationId");
  const queryPeerId = searchParams.get("peerId");
  const inDetail = queryConversationId !== null || queryPeerId !== null;

  /* ---------- 会话列表 ---------- */
  const [listData, setListData] = useState<iGM_ConversationListData | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const iGM_LoadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const response = await iGM_ApiListConversations();
      setListData(response.data);
    } catch (error) {
      setListError(iGM_ResolveErrorText(t, error));
    } finally {
      setListLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void iGM_LoadList();
  }, [iGM_LoadList]);

  // 实时私信事件刷新列表
  const latestListEventKey = messageEvents[0]
    ? `${messageEvents[0].type}-${messageEvents[0].conversationId}`
    : "";
  useEffect(() => {
    if (latestListEventKey) void iGM_LoadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestListEventKey]);

  /** 打开会话：以 query 驱动列表/详情切换 */
  function iGM_OpenConversation(conversationId: string): void {
    router.replace(`/G_Community?tab=messages&conversationId=${encodeURIComponent(conversationId)}`);
  }

  /** 返回会话列表 */
  function iGM_BackToList(): void {
    router.replace("/G_Community?tab=messages");
  }

  /* ---------- 会话详情 ---------- */
  const [conversationId, setConversationId] = useState<string>(
    queryConversationId ?? "",
  );
  const [peer, setPeer] = useState<iGM_PeerBrief | null>(null);
  const [messages, setMessages] = useState<iGM_Message[]>([]);
  const [draft, setDraft] = useState("");
  const [detailLoading, setDetailLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** 按会话 ID 或对端 ID 加载会话 */
  const iGM_LoadDetail = useCallback(async () => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = queryConversationId
        ? await iGM_ApiGetConversation(queryConversationId)
        : queryPeerId
          ? await iGM_ApiOpenConversation(queryPeerId)
          : null;
      const conversation = response?.data?.conversation;
      if (!conversation) {
        setDetailError(t("message.errors.conversationNotFound"));
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
      setDetailError(iGM_ResolveErrorText(t, error));
    } finally {
      setDetailLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryConversationId, queryPeerId, t]);

  useEffect(() => {
    if (inDetail) void iGM_LoadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryConversationId, queryPeerId]);

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
        prev.some((item) => item.id === incoming.id) ? prev : [...prev, incoming],
      );
      if (incoming.senderId !== user?.id) {
        void iGM_ApiMarkConversationRead(conversationId).then(() =>
          refreshMessageUnread(),
        );
      }
    } else if (latestEvent.type === "messageRecall") {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === latestEvent.messageId ? { ...item, isRecalled: true } : item,
        ),
      );
    } else if (latestEvent.type === "messageRead") {
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
    setDetailError(null);
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
      setDetailError(iGM_ResolveErrorText(t, error));
    } finally {
      setSending(false);
    }
  }

  /** Enter 发送，Shift+Enter 换行 */
  function iGM_HandleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void iGM_HandleSend();
    }
  }

  /** 撤回本人消息（限时 2 分钟） */
  async function iGM_HandleRecall(messageId: string): Promise<void> {
    setDetailError(null);
    try {
      await iGM_ApiRecallMessage(messageId);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === messageId ? { ...item, isRecalled: true } : item,
        ),
      );
    } catch (error) {
      setDetailError(iGM_ResolveErrorText(t, error));
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
      iGM_BackToList();
    } catch (error) {
      setDetailError(iGM_ResolveErrorText(t, error));
    }
  }

  const peerName = useMemo(
    () => (peer ? (peer.displayName ?? peer.username) : ""),
    [peer],
  );

  return (
    <div className={hubStyles.messageShell} data-mode={inDetail ? "detail" : "list"}>
      {/* 会话列表栏 */}
      <div className={hubStyles.messageListPane}>
        <div className={socialStyles.actionRow} style={{ justifyContent: "space-between" }}>
          <Link href="/G_Settings" className={socialStyles.backLink}>
            <Lock size={13} strokeWidth={1.8} />
            {t("message.privacySettings")}
          </Link>
        </div>
        {listLoading ? (
          <div className={socialStyles.stateBox}>
            <LoaderCircle size={16} className="igm-spin" />
            {t("message.stateLoading")}
          </div>
        ) : listError ? (
          <div className={socialStyles.sectionCard}>
            <div className={`${socialStyles.alert} ${socialStyles.alertError}`}>
              {listError}
            </div>
            <div className={socialStyles.actionRow}>
              <button
                type="button"
                className={socialStyles.ghostButton}
                onClick={() => void iGM_LoadList()}
              >
                {t("community.state.retry")}
              </button>
            </div>
          </div>
        ) : listData && listData.items.length > 0 ? (
          <div className={socialStyles.sectionCard}>
            <div className={socialStyles.list}>
              {listData.items.map((conversation) => {
                const name = conversation.peer.displayName ?? conversation.peer.username;
                const last = conversation.lastMessage;
                return (
                  <button
                    type="button"
                    key={conversation.id}
                    className={`${socialStyles.userRow} ${hubStyles.conversationButton}`}
                    onClick={() => iGM_OpenConversation(conversation.id)}
                  >
                    <IGM_Avatar size="default" src={conversation.peer.avatar} name={name} />
                    <div className={socialStyles.userMain}>
                      <span className={socialStyles.userName}>{name}</span>
                      <span className={socialStyles.userSub}>
                        {last
                          ? last.isRecalled
                            ? t("message.recalledInline")
                            : last.content
                          : t("message.noMessages")}
                      </span>
                    </div>
                    <div className={socialStyles.rowActions}>
                      <span className={socialStyles.userSub}>
                        {last ? iGM_FormatDateTime(locale, last.createdAt) : ""}
                      </span>
                      {conversation.unreadCount > 0 ? (
                        <span className={socialStyles.unreadBadge}>
                          {conversation.unreadCount}
                        </span>
                      ) : (
                        <span
                          className={socialStyles.unreadDot}
                          style={{ visibility: "hidden" }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <IGM_EmptyState
            icon={MessageSquare}
            title={t("message.emptyConversations")}
            description={t("message.emptyConversationsDescription")}
          />
        )}
      </div>

      {/* 会话详情栏 */}
      <div className={hubStyles.messageDetailPane}>
        {!inDetail ? (
          <IGM_EmptyState
            icon={MessageSquare}
            title={t("message.backToList")}
            description={t("message.emptyConversationsDescription")}
          />
        ) : (
          <div className={hubStyles.messageDetailInner}>
            <div className={socialStyles.actionRow} style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className={socialStyles.backLink}
                onClick={iGM_BackToList}
              >
                <ArrowLeft size={14} strokeWidth={2} />
                {t("message.backToList")}
              </button>
              <button
                type="button"
                className={socialStyles.iconButton}
                title={t("message.deleteConversation")}
                onClick={() => void iGM_HandleDelete()}
              >
                <Trash2 size={15} strokeWidth={1.8} />
              </button>
            </div>

            {peer && (
              <div className={`${socialStyles.sectionCard} ${socialStyles.actionRow}`}>
                <IGM_Avatar size="default" src={peer.avatar} name={peerName} />
                <Link
                  href={`/G_User?userId=${encodeURIComponent(peer.id)}`}
                  className={socialStyles.userName}
                >
                  {peerName}
                </Link>
              </div>
            )}

            {detailError && (
              <div className={`${socialStyles.alert} ${socialStyles.alertError}`}>
                {detailError}
              </div>
            )}

            {detailLoading ? (
              <div className={socialStyles.stateBox}>
                <LoaderCircle size={16} className="igm-spin" />
                {t("message.stateLoading")}
              </div>
            ) : (
              <div className={`${socialStyles.sectionCard} ${socialStyles.conversationWrap}`}>
                <div ref={scrollRef} className={socialStyles.messageScroll}>
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
                        className={`${socialStyles.bubbleRow} ${
                          isSelf ? socialStyles.bubbleRowSelf : socialStyles.bubbleRowPeer
                        }`}
                      >
                        <div
                          className={`${socialStyles.bubble} ${
                            message.isRecalled
                              ? socialStyles.bubbleRecalled
                              : isSelf
                                ? socialStyles.bubbleSelf
                                : socialStyles.bubblePeer
                          }`}
                        >
                          {message.isRecalled ? t("message.recalledInline") : message.content}
                        </div>
                        <span className={socialStyles.bubbleMeta}>
                          {iGM_FormatTime(locale, message.createdAt)}
                          {isSelf &&
                            !message.isRecalled &&
                            (message.isRead ? (
                              <CheckCheck size={13} strokeWidth={1.8} />
                            ) : (
                              <Check size={13} strokeWidth={1.8} />
                            ))}
                          {canRecall && (
                            <button
                              type="button"
                              className={socialStyles.bubbleMetaButton}
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

                <div className={socialStyles.composer}>
                  <textarea
                    className={socialStyles.composerInput}
                    rows={1}
                    value={draft}
                    placeholder={t("message.composerPlaceholder")}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={iGM_HandleKeyDown}
                  />
                  <button
                    type="button"
                    className={socialStyles.primaryButton}
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
        )}
      </div>
    </div>
  );
}

// 导出 //
export default iGM_CommunityMessagesPanel;
