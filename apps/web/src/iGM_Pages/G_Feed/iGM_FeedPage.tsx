/**
 * 文件路径：apps/web/src/iGM_Pages/G_Feed/iGM_FeedPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Feed（RequireAuth 登录可见）
 * 模块：G_Feed
 * 作用：动态流——关注对象与好友的最新发帖、评论
 * 内容：动态卡片（操作者/动作/帖子标题/摘要/时间）、分页、
 *       空状态引导去发现更多用户
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  LoaderCircle,
  MessageSquare,
  Newspaper,
  PenLine,
  Users,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiGetFeed,
  type iGM_FeedData,
} from "../../iGM_Services/iGM_SocialClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module10.module.css";

// 类型定义 //

// 核心逻辑 //
/** 动态流页主体（已包在 RequireAuth 内） */
function iGM_FeedContent() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 拉取动态流 */
  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiGetFeed(page);
      setData(response.data?.data ?? null);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Newspaper size={22} strokeWidth={1.8} />
          </span>
          {t("social.feedTitle")}
        </h1>
        <p className={pageStyles.pageDescription}>{t("social.feedDescription")}</p>
      </header>

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
            {data.items.map((item, index) => {
              const name = item.actor.displayName ?? item.actor.username;
              const ActionIcon = item.type === "post" ? PenLine : MessageSquare;
              return (
                <div key={`${item.type}-${item.postId}-${index}`} className={styles.feedCard}>
                  <IGM_Avatar size="default" src={item.actor.avatar} name={name} />
                  <div className={styles.feedBody}>
                    <span className={styles.feedLine}>
                      <Link
                        href={`/G_User?userId=${encodeURIComponent(item.actor.id)}`}
                        className={styles.feedLink}
                      >
                        {name}
                      </Link>{" "}
                      {item.type === "post" ? t("social.actionPosted") : t("social.actionCommented")}
                      <ActionIcon
                        size={13}
                        strokeWidth={1.8}
                        style={{ marginLeft: 6, verticalAlign: "-2px" }}
                      />
                    </span>
                    <Link href={`/G_Post?postId=${encodeURIComponent(item.postId)}`} className={styles.feedLink}>
                      {item.postTitle}
                    </Link>
                    {item.excerpt && <span className={styles.feedExcerpt}>{item.excerpt}</span>}
                    <span className={styles.feedTime}>{iGM_FormatDateTime(locale, item.createdAt)}</span>
                  </div>
                </div>
              );
            })}
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
          icon={Users}
          title={t("social.emptyFeed")}
          description={t("social.emptyFeedDescription")}
          action={
            <Link href="/G_Community" className={styles.primaryButton}>
              {t("social.exploreCommunity")}
            </Link>
          }
        />
      )}
    </div>
  );
}

/** 动态流页（登录守卫） */
const IGM_FeedContent = iGM_FeedContent;
export function iGM_FeedPage() {
  return (
    <IGM_RequireAuth>
      <IGM_FeedContent />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_FeedPage;
