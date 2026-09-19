/**
 * 文件路径：apps/web/src/iGM_Pages/G_UserComments/iGM_MyCommentsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_UserComments
 * 模块：G_UserComments
 * 作用：我的评论列表（含被隐藏评论），仅本人可见，分页
 * 内容：页头、评论条目（所属帖子标题链接、正文、时间、隐藏标记、点赞数）、
 *       分页、空状态
 * 说明：iGM_RequireAuth 为体验守卫，权限边界在后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { useTranslations } from "next-intl";
import {
  EyeOff,
  FileText,
  LoaderCircle,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import {
  iGM_ApiMyComments,
  type iGM_CommentPageData,
} from "../../iGM_Services/iGM_CommunityClient";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Community.module.css";

// 类型定义 //
// （评论分页类型来自 iGM_CommunityClient）

// 核心逻辑 //
/** 我的评论页 */
export function iGM_MyCommentsPage() {
  const t = useTranslations();
  const locale = iGM_UseLocale().locale;
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_CommentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiMyComments(page);
      setData(response.data);
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
            <MessageSquare size={22} strokeWidth={1.8} />
          </span>
          {t("community.myComments.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("community.myComments.description")}
        </p>
      </header>

      {/* 加载/错误/列表 */}
      {loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : errorText ? (
        <div className={styles.sectionCard}>
          <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
          <div>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => void iGM_Load()}
            >
              {t("community.state.retry")}
            </button>
          </div>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={styles.list}>
            {data.items.map((item) => (
              <article key={item.id} className={styles.myCommentCard}>
                <div className={styles.myCommentMeta}>
                  <Link href={`/G_Post?postId=${encodeURIComponent(item.postId)}`}>
                    <FileText size={13} strokeWidth={1.8} />
                    {item.postTitle}
                  </Link>
                  <span>{iGM_FormatDate(locale, item.createdAt)}</span>
                  {item.status === "hidden" && (
                    <span className={styles.hiddenBadge}>
                      <EyeOff size={12} strokeWidth={2} />
                      {t("community.status.hidden")}
                    </span>
                  )}
                  <span className={styles.activeFilterRow}>
                    <ThumbsUp size={12} strokeWidth={1.8} />
                    {item.likeCount}
                  </span>
                </div>
                <p className={styles.myCommentContent}>{item.content}</p>
              </article>
            ))}
          </div>
          <IGM_Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={setPage}
          />
        </>
      ) : (
        <IGM_EmptyState
          icon={MessageSquare}
          title={t("community.myComments.emptyTitle")}
          description={t("community.myComments.emptyDesc")}
          action={
            <Link href="/G_Community" className={styles.primaryButton}>
              {t("community.myComments.goCommunity")}
            </Link>
          }
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_MyCommentsPage;
