/**
 * 文件路径：apps/web/src/iGM_Pages/G_UserRelations/iGM_UserRelationsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_UserRelations?userId=&tab=following|followers&page=
 * 模块：G_UserRelations
 * 作用：查看指定用户的关注与粉丝名单（标签页切换）
 * 内容：页头（对应用户名）、关注/粉丝标签、用户行（头像/昵称/注册时间）、
 *       分页、加载/错误/空状态
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  LoaderCircle,
  MessageCircle,
  UserCheck,
  Users,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiListFollowers,
  iGM_ApiListFollowing,
  type iGM_RelationListData,
} from "../../iGM_Services/iGM_SocialClient";
import { iGM_ApiGetProfile } from "../../iGM_Services/iGM_CommunityClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module10.module.css";

// 类型定义 //
type iGM_RelationTab = "following" | "followers";

// 核心逻辑 //
/** 关注/粉丝名单页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_UserRelationsPage() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const searchParams = useSearchParams();
  const { user, status } = iGM_UseAuth();

  // 无 userId 时默认查看本人（导航入口场景）
  const userId =
    searchParams.get("userId") ??
    (status === "authenticated" ? user?.id ?? "" : "");
  const initialTab: iGM_RelationTab =
    searchParams.get("tab") === "followers" ? "followers" : "following";

  const [tab, setTab] = useState<iGM_RelationTab>(initialTab);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_RelationListData | null>(null);
  const [targetName, setTargetName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 读取目标用户名称（用于页头展示） */
  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    iGM_ApiGetProfile(userId)
      .then((response) => {
        if (!cancelled && response.data?.profile) {
          const profile = response.data.profile;
          setTargetName(profile.displayName ?? profile.username);
        }
      })
      .catch(() => {
        // 名称读取失败不阻塞名单
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** 按当前标签与页码拉取名单 */
  const iGM_Load = useCallback(async () => {
    if (!userId) {
      setErrorText(t("social.errors.userMissing"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const response =
        tab === "following"
          ? await iGM_ApiListFollowing(userId, page)
          : await iGM_ApiListFollowers(userId, page);
      setData(response.data?.data ?? null);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [tab, page, userId, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 切换标签并回到第一页 */
  function iGM_HandleTabChange(next: iGM_RelationTab): void {
    setTab(next);
    setPage(1);
  }

  return (
    <div className={pageStyles.page}>
      {/* 返回用户主页 */}
      {userId && (
        <Link href={`/G_User?userId=${encodeURIComponent(userId)}`} className={styles.backLink}>
          <ChevronLeft size={14} strokeWidth={2} />
          {t("social.backToProfile")}
        </Link>
      )}

      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Users size={22} strokeWidth={1.8} />
          </span>
          {targetName
            ? t("social.relationsTitleWithName", { name: targetName })
            : t("social.relationsTitle")}
        </h1>
      </header>

      {/* 标签页 */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "following" ? styles.tabActive : ""}`}
          onClick={() => iGM_HandleTabChange("following")}
        >
          {t("social.following")}
          {data && tab === "following" && (
            <span className={styles.tabCount}>{data.followingCount}</span>
          )}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "followers" ? styles.tabActive : ""}`}
          onClick={() => iGM_HandleTabChange("followers")}
        >
          {t("social.followers")}
          {data && tab === "followers" && (
            <span className={styles.tabCount}>{data.followerCount}</span>
          )}
        </button>
      </div>

      {/* 主体 */}
      {loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("social.stateLoading")}
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
        <>
          <div className={styles.sectionCard}>
            <div className={styles.list}>
              {data.items.map((entry) => {
                const name = entry.user.displayName ?? entry.user.username;
                return (
                  <div key={entry.user.id} className={styles.userRow}>
                    <IGM_Avatar size="default" src={entry.user.avatar} name={name} />
                    <div className={styles.userMain}>
                      <Link href={`/G_User?userId=${encodeURIComponent(entry.user.id)}`} className={styles.userName}>
                        {name}
                      </Link>
                      <span className={styles.userSub}>
                        {t("social.followedAt", { date: iGM_FormatDate(locale, entry.createdAt) })}
                      </span>
                    </div>
                    <div className={styles.rowActions}>
                      <Link
                        href={`/G_MessageDetail?peerId=${encodeURIComponent(entry.user.id)}`}
                        className={styles.iconButton}
                        title={t("social.sendMessage")}
                      >
                        <MessageCircle size={15} strokeWidth={1.8} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <IGM_Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(next) => {
              setPage(next);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </>
      ) : (
        <IGM_EmptyState
          icon={UserCheck}
          title={tab === "following" ? t("social.emptyFollowing") : t("social.emptyFollowers")}
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_UserRelationsPage;
