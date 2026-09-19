/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminContents/iGM_AdminContentsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminContents
 * 模块：G_AdminContents
 * 作用：内容审核——帖子/评论列表检索、隐藏/恢复/删除
 * 内容：类型切换 chips、状态筛选 chips、搜索框、分页内容列表与行内审核操作
 * 说明：纯静态 SSG，数据在客户端经 iGM_AdminClient 调用本地后端；
 *       审核权限 moderator 及以上，由后端严格校验
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Eye,
  EyeOff,
  FileText,
  LoaderCircle,
  Search,
  Trash2,
} from "lucide-react";
import {
  iGM_ApiAdminContents,
  iGM_ApiAdminReviewContent,
  type iGM_AdminContent,
} from "../../iGM_Services/iGM_AdminClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import styles from "../iGM_Admin.module.css";

// 类型定义 //
type iGM_ContentType = "post" | "comment";
type iGM_StatusFilter = "all" | "normal" | "hidden";
type iGM_ReviewAction = "hide" | "restore" | "delete";

// 核心逻辑 //
/** 内容审核页主体（moderator 及以上） */
function iGM_ContentsInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();

  const [contentType, setContentType] = useState<iGM_ContentType>("post");
  const [statusFilter, setStatusFilter] = useState<iGM_StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [contents, setContents] = useState<iGM_AdminContent[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 加载内容列表 */
  const iGM_Load = useCallback(
    (nextType: iGM_ContentType, nextStatus: iGM_StatusFilter, nextPage: number, query: string) => {
      setLoading(true);
      iGM_ApiAdminContents({
        type: nextType,
        search: query,
        status: nextStatus === "all" ? null : nextStatus,
        page: nextPage,
        pageSize: 10,
      })
        .then((response) => {
          if (response.data) {
            setContents(response.data.items);
            setPage(response.data.page);
            setTotalPages(response.data.totalPages);
          }
        })
        .catch(() => setLoadFailed(true))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    iGM_Load("post", "all", 1, "");
  }, [iGM_Load]);

  /** 切换类型或状态时重置到第一页 */
  function iGM_SwitchType(next: iGM_ContentType): void {
    setContentType(next);
    iGM_Load(next, statusFilter, 1, search);
  }
  function iGM_SwitchStatus(next: iGM_StatusFilter): void {
    setStatusFilter(next);
    iGM_Load(contentType, next, 1, search);
  }

  /** 检索提交 */
  function iGM_HandleSearch(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    iGM_Load(contentType, statusFilter, 1, search);
  }

  /** 审核操作：隐藏/恢复/删除 */
  async function iGM_HandleReview(target: iGM_AdminContent, action: iGM_ReviewAction): Promise<void> {
    setErrorText(null);
    try {
      await iGM_ApiAdminReviewContent(target.type, target.id, action);
      iGM_Load(contentType, statusFilter, page, search);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }

  /** 帖子 published / 评论 visible 均视为正常状态 */
  const isHidden = (status: string) => status === "hidden";

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <FileText size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminContents.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminContents.description")}
        </p>
      </header>

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>{errorText}</div>
      )}

      {/* 类型与状态筛选 */}
      <div className={uiStyles.chips}>
        {(["post", "comment"] as iGM_ContentType[]).map((type) => (
          <button
            key={type}
            type="button"
            className={`${uiStyles.chip} ${contentType === type ? uiStyles.chipActive : ""}`}
            onClick={() => iGM_SwitchType(type)}
          >
            {t(`admin.contents.type${type === "post" ? "Post" : "Comment"}`)}
          </button>
        ))}
        <span className={styles.rowActions} aria-hidden />
        {(["all", "normal", "hidden"] as iGM_StatusFilter[]).map((status) => (
          <button
            key={status}
            type="button"
            className={`${uiStyles.chip} ${statusFilter === status ? uiStyles.chipActive : ""}`}
            onClick={() => iGM_SwitchStatus(status)}
          >
            {t(
              `admin.contents.filter${status === "all" ? "All" : status === "normal" ? "Normal" : "Hidden"}`,
            )}
          </button>
        ))}
      </div>

      {/* 检索 */}
      <form className={uiStyles.toolbar} onSubmit={iGM_HandleSearch}>
        <div className={uiStyles.searchBox}>
          <span className={uiStyles.searchIcon}>
            <Search size={15} strokeWidth={1.8} />
          </span>
          <input
            className={uiStyles.searchInput}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.contents.searchPlaceholder")}
            maxLength={100}
          />
        </div>
        <button type="submit" className={uiStyles.primaryButton}>
          {t("admin.users.search")}
        </button>
      </form>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("admin.errors.loadFailed")}
        </div>
      ) : contents.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("admin.contents.empty")}</div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={tileStyles.recordList}>
            {contents.map((content) => (
              <div key={content.id} className={tileStyles.recordRow}>
                <div className={tileStyles.recordMain}>
                  <span className={tileStyles.recordAction}>{content.title}</span>
                  <span className={tileStyles.recordDesc}>{content.excerpt}</span>
                  <span className={styles.userMeta}>
                    {content.authorName
                      ? content.authorName
                      : t("admin.contents.authorUnknown")}
                    {" · "}
                    {iGM_FormatDate(locale, content.createdAt)}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <span
                    className={`${styles.statusBadge} ${
                      isHidden(content.status) ? styles.statusSuspended : styles.statusActive
                    }`}
                  >
                    {isHidden(content.status)
                      ? t("admin.contents.statusHidden")
                      : t("admin.contents.statusNormal")}
                  </span>
                  {isHidden(content.status) ? (
                    <button
                      type="button"
                      className={styles.smallButton}
                      onClick={() => iGM_HandleReview(content, "restore")}
                    >
                      <Eye size={13} strokeWidth={1.8} />
                      {t("admin.contents.restore")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.smallButton}
                      onClick={() => iGM_HandleReview(content, "hide")}
                    >
                      <EyeOff size={13} strokeWidth={1.8} />
                      {t("admin.contents.hide")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.smallButton} ${styles.smallButtonDanger}`}
                    onClick={() => iGM_HandleReview(content, "delete")}
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                    {t("admin.contents.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <IGM_Pagination
            page={page}
            totalPages={totalPages}
            onChange={(next) => iGM_Load(contentType, statusFilter, next, search)}
          />
        </section>
      )}
    </div>
  );
}

/** 内容审核页（moderator 及以上） */
export function iGM_AdminContentsPage() {
  const IGM_ContentsInner = iGM_ContentsInner;
  return (
    <IGM_RequireAuth role="moderator">
      <IGM_ContentsInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminContentsPage;
