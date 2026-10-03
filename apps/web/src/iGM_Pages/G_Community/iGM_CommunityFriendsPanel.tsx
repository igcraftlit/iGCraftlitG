/**
 * 文件路径：apps/web/src/iGM_Pages/G_Community/iGM_CommunityFriendsPanel.tsx
 * 所属层：前端 / 页面层（G_Community 子面板）
 * 路由：/G_Community?tab=friends&subtab=friends|incoming|outgoing
 * 模块：G_Community
 * 作用：社区广场「好友」标签——好友管理与找朋友
 * 内容：好友/收到申请/发出申请三个子标签；接受、拒绝、撤回、移除好友；
 *       找朋友搜索（iGMUid 精确 / 用户名模糊）直接发起申请；
 *       G_UserRelations（关注/粉丝/黑名单）入口
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端；未登录不渲染
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Check,
  LoaderCircle,
  MessageCircle,
  Search,
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
  iGM_ApiSearchUsers,
  type iGM_FriendListData,
  type iGM_FriendRequestListData,
  type iGM_UserSearchData,
} from "../../iGM_Services/iGM_SocialClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UserCard as IGM_UserCard } from "../../iGM_Components/iGM_UserCard/iGM_UserCard";
import { iGM_FriendButton as IGM_FriendButton } from "../../iGM_Components/iGM_FriendButton/iGM_FriendButton";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import socialStyles from "../iGM_Module10.module.css";
import communityStyles from "../iGM_Community.module.css";
import hubStyles from "./iGM_CommunityHub.module.css";

// 类型定义 //
type iGM_FriendsSubtab = "friends" | "incoming" | "outgoing";

interface iGM_CommunityFriendsPanelProps {
  /** 收到申请数量上抛，用于顶层标签红点 */
  onIncomingCount?: (count: number) => void;
}

// 核心逻辑 //
/** 好友标签：好友管理 + 找朋友 */
export function iGM_CommunityFriendsPanel({
  onIncomingCount,
}: iGM_CommunityFriendsPanelProps) {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const { locale } = iGM_UseLocale();

  const subtabParam = searchParams.get("subtab");
  const initialSubtab: iGM_FriendsSubtab =
    subtabParam === "incoming" || subtabParam === "outgoing"
      ? subtabParam
      : "friends";

  const [subtab, setSubtab] = useState<iGM_FriendsSubtab>(initialSubtab);
  const [page, setPage] = useState(1);
  const [friends, setFriends] = useState<iGM_FriendListData | null>(null);
  const [requests, setRequests] = useState<iGM_FriendRequestListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 找朋友
  const [findInput, setFindInput] = useState("");
  const [findKeyword, setFindKeyword] = useState("");
  const [findPage, setFindPage] = useState(1);
  const [findData, setFindData] = useState<iGM_UserSearchData | null>(null);
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);

  /** 合并写入地址栏（保留 q 等广场参数） */
  function iGM_SyncUrl(next: Record<string, string | undefined>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `/G_Community?${query}` : "/G_Community");
  }

  /** 切换子标签并同步地址栏 */
  function iGM_HandleSubtabChange(next: iGM_FriendsSubtab): void {
    setSubtab(next);
    iGM_SyncUrl({ subtab: next === "friends" ? undefined : next });
  }

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
      const data = response.data?.data ?? {
        incoming: [],
        outgoing: [],
        incomingCount: 0,
      };
      setRequests(data);
      onIncomingCount?.(data.incomingCount);
    } catch {
      // 申请加载失败不致命，保留空列表
      const fallback = { incoming: [], outgoing: [], incomingCount: 0 };
      setRequests(fallback);
      onIncomingCount?.(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (subtab === "friends") void iGM_LoadFriends();
  }, [subtab, iGM_LoadFriends]);

  useEffect(() => {
    void iGM_LoadRequests();
  }, [iGM_LoadRequests]);

  /** 找朋友搜索 */
  const iGM_RunFind = useCallback(async () => {
    if (!findKeyword) return;
    setFindLoading(true);
    setFindError(null);
    try {
      const response = await iGM_ApiSearchUsers(findKeyword, findPage);
      setFindData(response.data?.data ?? null);
    } catch (error) {
      setFindError(iGM_ResolveErrorText(t, error));
    } finally {
      setFindLoading(false);
    }
  }, [findKeyword, findPage, t]);

  useEffect(() => {
    if (findKeyword) void iGM_RunFind();
  }, [iGM_RunFind, findKeyword]);

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
      if (findKeyword) await iGM_RunFind();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  /** 提交找朋友搜索 */
  function iGM_HandleFindSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFindPage(1);
    setFindKeyword(findInput.trim());
  }

  return (
    <div className={socialStyles.stack}>
      {/* 标题行：关系管理入口 */}
      <div className={hubStyles.panelHeader}>
        <p className={hubStyles.panelHint}>{t("social.friendsDescription")}</p>
        <Link href="/G_UserRelations" className={socialStyles.backLink}>
          <Users size={13} strokeWidth={1.8} />
          {t("social.relationsTitle")}
        </Link>
      </div>

      {/* 子标签页 */}
      <div className={socialStyles.tabs}>
        <button
          type="button"
          className={`${socialStyles.tab} ${
            subtab === "friends" ? socialStyles.tabActive : ""
          }`}
          onClick={() => iGM_HandleSubtabChange("friends")}
        >
          {t("social.tabFriends")}
        </button>
        <button
          type="button"
          className={`${socialStyles.tab} ${
            subtab === "incoming" ? socialStyles.tabActive : ""
          }`}
          onClick={() => iGM_HandleSubtabChange("incoming")}
        >
          {t("social.tabIncoming")}
          {requests && requests.incomingCount > 0 && (
            <span className={socialStyles.tabCount}>{requests.incomingCount}</span>
          )}
        </button>
        <button
          type="button"
          className={`${socialStyles.tab} ${
            subtab === "outgoing" ? socialStyles.tabActive : ""
          }`}
          onClick={() => iGM_HandleSubtabChange("outgoing")}
        >
          {t("social.tabOutgoing")}
        </button>
      </div>

      {errorText && (
        <div className={`${socialStyles.alert} ${socialStyles.alertError}`}>
          {errorText}
        </div>
      )}

      {/* 好友列表（含找朋友） */}
      {subtab === "friends" && (
        <>
          <form className={communityStyles.toolbar} onSubmit={iGM_HandleFindSubmit}>
            <div className={communityStyles.searchBox}>
              <span className={communityStyles.searchIcon}>
                <Search size={15} strokeWidth={2} />
              </span>
              <input
                className={communityStyles.searchInput}
                type="search"
                value={findInput}
                placeholder={t("community.communityPage.searchUsersPlaceholder")}
                onChange={(event) => setFindInput(event.target.value)}
              />
            </div>
            <button type="submit" className={communityStyles.ghostButton}>
              <UserPlus size={14} strokeWidth={1.8} />
              {t("social.findUsers")}
            </button>
          </form>

          {findLoading ? (
            <div className={socialStyles.stateBox}>
              <LoaderCircle size={16} className="igm-spin" />
              {t("social.stateLoading")}
            </div>
          ) : findError ? (
            <div className={`${socialStyles.alert} ${socialStyles.alertError}`}>
              {findError}
            </div>
          ) : findData && findKeyword ? (
            <div className={socialStyles.sectionCard}>
              <div className={socialStyles.list}>
                {findData.items.length > 0 ? (
                  findData.items.map((entry) => (
                    <IGM_UserCard
                      key={entry.user.id}
                      user={entry.user}
                      subtitle={t("community.communityPage.userUid", {
                        uid: entry.user.uid,
                      })}
                    >
                      {entry.isSelf ? (
                        <span className={socialStyles.badge}>
                          {t("community.communityPage.userSelf")}
                        </span>
                      ) : (
                        <>
                          <IGM_FriendButton
                            targetId={entry.user.id}
                            initialState={entry.friendState}
                            onRespond={() => iGM_HandleSubtabChange("incoming")}
                            onError={setFindError}
                          />
                          <Link
                            href={`/G_Community?tab=messages&peerId=${encodeURIComponent(entry.user.id)}`}
                            className={socialStyles.iconButton}
                            title={t("social.sendMessage")}
                          >
                            <MessageCircle size={15} strokeWidth={1.8} />
                          </Link>
                        </>
                      )}
                    </IGM_UserCard>
                  ))
                ) : (
                  <IGM_EmptyState
                    icon={UserPlus}
                    title={t("community.communityPage.usersEmptyTitle")}
                  />
                )}
              </div>
              {findData.totalPages > 1 && (
                <IGM_Pagination
                  page={findData.page}
                  totalPages={findData.totalPages}
                  onChange={(next) => {
                    setFindPage(next);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              )}
            </div>
          ) : null}

          {loading ? (
            <div className={socialStyles.stateBox}>
              <LoaderCircle size={16} className="igm-spin" />
              {t("social.stateLoading")}
            </div>
          ) : friends && friends.items.length > 0 ? (
            <>
              <div className={socialStyles.sectionCard}>
                <div className={socialStyles.list}>
                  {friends.items.map((entry) => (
                      <IGM_UserCard
                        key={entry.friend.id}
                        user={entry.friend}
                        subtitle={t("social.friendsSince", {
                          date: iGM_FormatDate(locale, entry.createdAt),
                        })}
                      >
                        <Link
                          href={`/G_Community?tab=messages&peerId=${encodeURIComponent(entry.friend.id)}`}
                          className={socialStyles.iconButton}
                          title={t("social.sendMessage")}
                        >
                          <MessageCircle size={15} strokeWidth={1.8} />
                        </Link>
                        <button
                          type="button"
                          className={socialStyles.iconButton}
                          title={t("social.removeFriend")}
                          disabled={busyId === entry.friend.id}
                          onClick={() => void iGM_HandleRemove(entry.friend.id)}
                        >
                          <UserMinus size={15} strokeWidth={1.8} />
                        </button>
                      </IGM_UserCard>
                  ))}
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
          )}
        </>
      )}

      {/* 收到的申请 */}
      {subtab === "incoming" &&
        (requests && requests.incoming.length > 0 ? (
          <div className={socialStyles.sectionCard}>
            <div className={socialStyles.list}>
              {requests.incoming.map((request) => (
                <IGM_UserCard
                  key={request.id}
                  user={request.requester}
                  subtitle={t("social.requestAt", {
                    date: iGM_FormatDate(locale, request.createdAt),
                  })}
                >
                  <button
                    type="button"
                    className={socialStyles.primaryButton}
                    disabled={busyId === request.id}
                    onClick={() => void iGM_HandleRespond(request.id, "accept")}
                  >
                    <Check size={14} strokeWidth={2} />
                    {t("social.accept")}
                  </button>
                  <button
                    type="button"
                    className={socialStyles.ghostButton}
                    disabled={busyId === request.id}
                    onClick={() => void iGM_HandleRespond(request.id, "reject")}
                  >
                    <X size={14} strokeWidth={2} />
                    {t("social.reject")}
                  </button>
                </IGM_UserCard>
              ))}
            </div>
          </div>
        ) : (
          <IGM_EmptyState icon={UserPlus} title={t("social.emptyIncoming")} />
        ))}

      {/* 发出的申请 */}
      {subtab === "outgoing" &&
        (requests && requests.outgoing.length > 0 ? (
          <div className={socialStyles.sectionCard}>
            <div className={socialStyles.list}>
              {requests.outgoing.map((request) => (
                <IGM_UserCard
                  key={request.id}
                  user={request.recipient}
                  subtitle={t("social.requestAt", {
                    date: iGM_FormatDate(locale, request.createdAt),
                  })}
                >
                  <button
                    type="button"
                    className={socialStyles.ghostButton}
                    disabled={busyId === request.recipient.id}
                    onClick={() => void iGM_HandleRemove(request.recipient.id)}
                  >
                    <X size={14} strokeWidth={2} />
                    {t("social.cancelRequest")}
                  </button>
                </IGM_UserCard>
              ))}
            </div>
          </div>
        ) : (
          <IGM_EmptyState icon={UserPlus} title={t("social.emptyOutgoing")} />
        ))}
    </div>
  );
}

// 导出 //
export default iGM_CommunityFriendsPanel;
