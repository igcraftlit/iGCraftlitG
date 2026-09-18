/**
 * 文件路径：apps/web/src/iGM_Pages/G_UserPosts/iGM_MyPostsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_UserPosts
 * 模块：G_UserPosts
 * 作用：我的帖子列表（含已隐藏帖子），仅本人可见，分页
 * 内容：页头、帖子卡片列表（隐藏标记由卡片渲染）、分页、空状态引导
 * 说明：iGM_RequireAuth 为体验守卫，权限边界在后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  FileText,
  LoaderCircle,
  PenSquare,
} from "lucide-react";
import {
  iGM_ApiMyPosts,
  type iGM_PostListData,
} from "../../iGM_Services/iGM_CommunityClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_PostCard as IGM_PostCard } from "../../iGM_Components/iGM_PostCard/iGM_PostCard";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Community.module.css";

// 类型定义 //
// （列表数据类型来自 iGM_CommunityClient）

// 核心逻辑 //
/** 我的帖子页 */
export function iGM_MyPostsPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_PostListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiMyPosts(page);
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
            <FileText size={22} strokeWidth={1.8} />
          </span>
          {t("community.myPosts.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("community.myPosts.description")}
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
            {data.items.map((post) => (
              <IGM_PostCard key={post.id} post={post} />
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
          icon={FileText}
          title={t("community.myPosts.emptyTitle")}
          description={t("community.myPosts.emptyDesc")}
          action={
            <Link href="/G_PostEdit" className={styles.primaryButton}>
              <PenSquare size={15} strokeWidth={1.8} />
              {t("community.communityPage.newPost")}
            </Link>
          }
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_MyPostsPage;
