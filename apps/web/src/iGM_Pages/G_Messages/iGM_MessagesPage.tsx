/**
 * 文件路径：apps/web/src/iGM_Pages/G_Messages/iGM_MessagesPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Messages（RequireAuth 登录可见）
 * 模块：G_Messages
 * 作用：私信会话列表——对端、最后一条消息、未读数、更新时间
 * 内容：会话条目（点击进入会话详情）、隐私设置入口、实时事件触发刷新、
 *       空状态引导
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  LoaderCircle,
  Lock,
  MessageSquare,
  MessagesSquare,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiListConversations,
  type iGM_ConversationListData,
} from "../../iGM_Services/iGM_MessageClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UseWebSocket } from "../../iGM_Providers/iGM_WebSocketProvider";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module10.module.css";

// 类型定义 //

// 核心逻辑 //
/** 会话列表页主体（已包在 RequireAuth 内） */
function iGM_MessagesContent() {
  const t = useTranslations();
  const { messageEvents } = iGM_UseWebSocket();
  const { locale } = iGM_UseLocale();
  const [data, setData] = useState<iGM_ConversationListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 拉取会话列表 */
  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiListConversations();
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  // 有实时私信事件时刷新列表
  const latestEventKey = messageEvents[0]
    ? `${messageEvents[0].type}-${messageEvents[0].conversationId}`
    : "";
  useEffect(() => {
    if (latestEventKey) void iGM_Load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestEventKey]);

  return (
    <div className={pageStyles.page}>
      {/* 页头（含隐私设置入口） */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <MessagesSquare size={22} strokeWidth={1.8} />
          </span>
          {t("message.listTitle")}
        </h1>
        <p className={pageStyles.pageDescription}>
          <Link href="/G_MessageSettings" className={styles.backLink}>
            <Lock size={13} strokeWidth={1.8} />
            {t("message.privacySettings")}
          </Link>
        </p>
      </header>

      {/* 主体 */}
      {loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("message.stateLoading")}
        </div>
      ) : errorText ? (
        <div className={styles.sectionCard}>
          <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
          <div className={styles.actionRow}>
            <button type="button" className={styles.ghostButton} onClick={() => void iGM_Load()}>
              {t("community.state.retry")}
            </button>
          </div>
        </div>
      ) : data && data.items.length > 0 ? (
        <div className={styles.sectionCard}>
          <div className={styles.list}>
            {data.items.map((conversation) => {
              const name = conversation.peer.displayName ?? conversation.peer.username;
              const last = conversation.lastMessage;
              return (
                <Link
                  key={conversation.id}
                  href={`/G_MessageDetail?conversationId=${encodeURIComponent(conversation.id)}`}
                  className={styles.userRow}
                >
                  <IGM_Avatar size="default" src={conversation.peer.avatar} name={name} />
                  <div className={styles.userMain}>
                    <span className={styles.userName}>{name}</span>
                    <span className={styles.userSub}>
                      {last
                        ? last.isRecalled
                          ? t("message.recalledInline")
                          : last.content
                        : t("message.noMessages")}
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    <span className={styles.userSub}>
                      {last ? iGM_FormatDateTime(locale, last.createdAt) : ""}
                    </span>
                    {conversation.unreadCount > 0 ? (
                      <span className={styles.unreadBadge}>{conversation.unreadCount}</span>
                    ) : (
                      <span className={styles.unreadDot} style={{ visibility: "hidden" }} />
                    )}
                  </div>
                </Link>
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
  );
}

/** 会话列表页（登录守卫） */
const IGM_MessagesContent = iGM_MessagesContent;
export function iGM_MessagesPage() {
  return (
    <IGM_RequireAuth>
      <IGM_MessagesContent />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_MessagesPage;
