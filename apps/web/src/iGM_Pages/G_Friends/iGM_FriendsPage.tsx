/**
 * 文件路径：apps/web/src/iGM_Pages/G_Friends/iGM_FriendsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Friends（RequireAuth 登录可见）
 * 模块：G_Friends
 * 作用：好友管理——好友列表、收到的申请、发出的申请
 * 内容：三个标签页（好友/收到申请/发出申请）；收到申请可接受或拒绝；
 *       发出申请可撤回；好友可移除、可私信
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  LoaderCircle,
  MessageCircle,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiListFriendRequests,
  iGM_ApiListFriends,
  iGM_ApiRemoveFriend,
  iGM_ApiRespondFriendRequest,
  type iGM_FriendListData,
  type iGM_FriendRequestListData,
} from "../../iGM_Services/iGM_SocialClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module10.module.css";

// 类型定义 //
type iGM_FriendsTab = "friends" | "incoming" | "outgoing";

// 核心逻辑 //
/** 好友管理页主体（已包在 RequireAuth 内） */
function iGM_FriendsContent() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const [tab, setTab] = useState<iGM_FriendsTab>("friends");
  const [page, setPage] = useState(1);
  const [friends, setFriends] = useState<iGM_FriendListData | null>(null);
  const [requests, setRequests] = useState<iGM_FriendRequestListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** 拉取好友列表 */
  const iGM_LoadFriends = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiListFriends(page);
      setFriends(response.data?.data ?? null);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  /** 拉取申请列表 */
  const iGM_LoadRequests = useCallback(async () => {
    try {
      const response = await iGM_ApiListFriendRequests();
      setRequests(response.data?.data ?? null);
    } catch {
      // 申请加载失败不致命，保留空列表
      setRequests({ incoming: [], outgoing: [], incomingCount: 0 });
    }
  }, []);

  useEffect(() => {
    if (tab === "friends") void iGM_LoadFriends();
  }, [tab, iGM_LoadFriends]);

  useEffect(() => {
    void iGM_LoadRequests();
  }, [iGM_LoadRequests]);

  /** 处理收到的申请：接受或拒绝 */
  async function iGM_HandleRespond(
    requestId: string,
    action: "accept" | "reject",
  ): Promise<void> {
    setBusyId(requestId);
    setErrorText(null);
    try {
      await iGM_ApiRespondFriendRequest(requestId, action);
      await iGM_LoadRequests();
      if (action === "accept") await iGM_LoadFriends();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  /** 移除好友 / 撤回发出的申请 */
  async function iGM_HandleRemove(userId: string): Promise<void> {
    setBusyId(userId);
    setErrorText(null);
    try {
      await iGM_ApiRemoveFriend(userId);
      await iGM_LoadRequests();
      await iGM_LoadFriends();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Users size={22} strokeWidth={1.8} />
          </span>
          {t("social.friendsTitle")}
        </h1>
        <p className={pageStyles.pageDescription}>{t("social.friendsDescription")}</p>
      </header>

      {/* 标签页 */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "friends" ? styles.tabActive : ""}`}
          onClick={() => setTab("friends")}
        >
          {t("social.tabFriends")}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "incoming" ? styles.tabActive : ""}`}
          onClick={() => setTab("incoming")}
        >
          {t("social.tabIncoming")}
          {requests && requests.incomingCount > 0 && (
            <span className={styles.tabCount}>{requests.incomingCount}</span>
          )}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "outgoing" ? styles.tabActive : ""}`}
          onClick={() => setTab("outgoing")}
        >
          {t("social.tabOutgoing")}
        </button>
      </div>

      {errorText && <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>}

      {/* 好友列表 */}
      {tab === "friends" &&
        (loading ? (
          <div className={styles.stateBox}>
            <LoaderCircle size={16} className="igm-spin" />
            {t("social.stateLoading")}
          </div>
        ) : friends && friends.items.length > 0 ? (
          <>
            <div className={styles.sectionCard}>
              <div className={styles.list}>
                {friends.items.map((entry) => {
                  const name = entry.friend.displayName ?? entry.friend.username;
                  return (
                    <div key={entry.friend.id} className={styles.userRow}>
                      <IGM_Avatar size="default" src={entry.friend.avatar} name={name} />
                      <div className={styles.userMain}>
                        <Link
                          href={`/G_User?userId=${encodeURIComponent(entry.friend.id)}`}
                          className={styles.userName}
                        >
                          {name}
                        </Link>
                        <span className={styles.userSub}>
                          {t("social.friendsSince", { date: iGM_FormatDate(locale, entry.createdAt) })}
                        </span>
                      </div>
                      <div className={styles.rowActions}>
                        <Link
                          href={`/G_MessageDetail?peerId=${encodeURIComponent(entry.friend.id)}`}
                          className={styles.iconButton}
                          title={t("social.sendMessage")}
                        >
                          <MessageCircle size={15} strokeWidth={1.8} />
                        </Link>
                        <button
                          type="button"
                          className={styles.iconButton}
                          title={t("social.removeFriend")}
                          disabled={busyId === entry.friend.id}
                          onClick={() => void iGM_HandleRemove(entry.friend.id)}
                        >
                          <UserMinus size={15} strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <IGM_Pagination
              page={friends.page}
              totalPages={friends.totalPages}
              onChange={(next) => {
                setPage(next);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </>
        ) : (
          <IGM_EmptyState
            icon={Users}
            title={t("social.emptyFriends")}
            description={t("social.emptyFriendsDescription")}
          />
        ))}

      {/* 收到的申请 */}
      {tab === "incoming" &&
        (requests && requests.incoming.length > 0 ? (
          <div className={styles.sectionCard}>
            <div className={styles.list}>
              {requests.incoming.map((request) => {
                const name = request.requester.displayName ?? request.requester.username;
                return (
                  <div key={request.id} className={styles.userRow}>
                    <IGM_Avatar size="default" src={request.requester.avatar} name={name} />
                    <div className={styles.userMain}>
                      <Link
                        href={`/G_User?userId=${encodeURIComponent(request.requester.id)}`}
                        className={styles.userName}
                      >
                        {name}
                      </Link>
                      <span className={styles.userSub}>
                        {t("social.requestAt", { date: iGM_FormatDate(locale, request.createdAt) })}
                      </span>
                    </div>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={busyId === request.id}
                        onClick={() => void iGM_HandleRespond(request.id, "accept")}
                      >
                        <Check size={14} strokeWidth={2} />
                        {t("social.accept")}
                      </button>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        disabled={busyId === request.id}
                        onClick={() => void iGM_HandleRespond(request.id, "reject")}
                      >
                        <X size={14} strokeWidth={2} />
                        {t("social.reject")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <IGM_EmptyState icon={UserPlus} title={t("social.emptyIncoming")} />
        ))}

      {/* 发出的申请 */}
      {tab === "outgoing" &&
        (requests && requests.outgoing.length > 0 ? (
          <div className={styles.sectionCard}>
            <div className={styles.list}>
              {requests.outgoing.map((request) => {
                const name = request.recipient.displayName ?? request.recipient.username;
                return (
                  <div key={request.id} className={styles.userRow}>
                    <IGM_Avatar size="default" src={request.recipient.avatar} name={name} />
                    <div className={styles.userMain}>
                      <Link
                        href={`/G_User?userId=${encodeURIComponent(request.recipient.id)}`}
                        className={styles.userName}
                      >
                        {name}
                      </Link>
                      <span className={styles.userSub}>
                        {t("social.requestAt", { date: iGM_FormatDate(locale, request.createdAt) })}
                      </span>
                    </div>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        disabled={busyId === request.recipient.id}
                        onClick={() => void iGM_HandleRemove(request.recipient.id)}
                      >
                        <X size={14} strokeWidth={2} />
                        {t("social.cancelRequest")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <IGM_EmptyState icon={UserPlus} title={t("social.emptyOutgoing")} />
        ))}
    </div>
  );
}

/** 好友管理页（登录守卫） */
const IGM_FriendsContent = iGM_FriendsContent;
export function iGM_FriendsPage() {
  return (
    <IGM_RequireAuth>
      <IGM_FriendsContent />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_FriendsPage;
