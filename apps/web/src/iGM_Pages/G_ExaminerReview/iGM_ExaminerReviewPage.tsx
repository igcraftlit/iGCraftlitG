/**
 * 文件路径：apps/web/src/iGM_Pages/G_ExaminerReview/iGM_ExaminerReviewPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_ExaminerReview
 * 模块：G_ExaminerReview
 * 作用：命题创作者申请审核——待审核申请与历史申请检索、审核（通过 / 拒绝 + 审核意见）
 * 内容：状态筛选 chips、分页申请列表（申请人展示名 / iGMUid / 邮箱、真实姓名、
 *       联系方式、个人简介、命题方向、作品链接、申请理由）、审核意见输入与通过 / 拒绝按钮
 * 说明：纯静态 SSG，数据在客户端经 iGM_ExaminerClient 调用本地后端；
 *       审核权限为管理员或信任组织负责人，由后端严格校验；
 *       不能审核自己的申请（前端隐藏按钮，后端二次拦截）
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CircleCheck,
  CircleSlash,
  ClipboardList,
  LoaderCircle,
} from "lucide-react";
import {
  iGM_ApiListExaminerApplications,
  iGM_ApiReviewExaminer,
  type iGM_ExaminerApplicationList,
} from "../../iGM_Services/iGM_ExaminerClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import adminStyles from "../iGM_Admin.module.css";
import styles from "./iGM_ExaminerReviewPage.module.css";

// 类型定义 //
/** 状态筛选：三种申请状态 + 全部 */
type iGM_ReviewFilter = "pending" | "approved" | "rejected" | "all";

/** 列表项：申请 DTO + 后端附加的申请人展示名 / iGMUid / 邮箱 */
type iGM_ReviewItem = iGM_ExaminerApplicationList["applications"][number];

/** 每页条数 */
const iGM_PageSize = 10;

/** 筛选 chips 取值（顺序即展示顺序） */
const iGM_ReviewFilters: iGM_ReviewFilter[] = [
  "pending",
  "approved",
  "rejected",
  "all",
];

/** 状态 → 徽标样式映射 */
const iGM_StateBadgeClass: Record<string, string> = {
  pending: adminStyles.statusPending,
  approved: adminStyles.statusActive,
  rejected: adminStyles.statusSuspended,
};

// 核心逻辑 //
/** 命题创作者申请审核页主体（管理员或信任组织负责人） */
function iGM_ExaminerReviewInner({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const { user: currentUser } = iGM_UseAuth();

  const [statusFilter, setStatusFilter] = useState<iGM_ReviewFilter>("pending");
  const [items, setItems] = useState<iGM_ReviewItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  /** 每行审核意见输入（applicationId -> comment） */
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});
  /** 正在提交审核的申请 ID（防重复点击） */
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  /** 加载申请列表 */
  const iGM_Load = useCallback(
    (nextStatus: iGM_ReviewFilter, nextPage: number) => {
      setLoading(true);
      setLoadFailed(false);
      iGM_ApiListExaminerApplications({
        status: nextStatus === "all" ? undefined : nextStatus,
        page: nextPage,
        pageSize: iGM_PageSize,
      })
        .then((response) => {
          if (response.data) {
            setItems(response.data.applications);
            setPage(response.data.page);
            setTotalPages(
              Math.max(1, Math.ceil(response.data.total / iGM_PageSize)),
            );
            setCommentMap({});
          }
        })
        .catch(() => setLoadFailed(true))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    iGM_Load("pending", 1);
  }, [iGM_Load]);

  /** 切换状态筛选 */
  function iGM_SwitchFilter(next: iGM_ReviewFilter): void {
    setStatusFilter(next);
    iGM_Load(next, 1);
  }

  /** 审核（通过 / 拒绝） */
  async function iGM_HandleReview(
    item: iGM_ReviewItem,
    action: "approve" | "reject",
  ): Promise<void> {
    if (reviewingId) return;
    setErrorText(null);
    setSuccessText(null);
    setReviewingId(item.id);
    try {
      await iGM_ApiReviewExaminer({
        applicationId: item.id,
        action,
        comment: (commentMap[item.id] ?? "").trim() || undefined,
      });
      setSuccessText(
        t(
          action === "approve"
            ? "examiner.review.messages.approved"
            : "examiner.review.messages.rejected",
        ),
      );
      iGM_Load(statusFilter, page);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头：嵌入管理分区时由面板统一提供，独立页面保留 */}
      {!embedded && (
        <header className={pageStyles.pageHeader}>
          <h1 className={pageStyles.pageTitle}>
            <span className={pageStyles.pageTitleIcon}>
              <ClipboardList size={22} strokeWidth={1.8} />
            </span>
            {t("pages.examinerReview.title")}
          </h1>
          <p className={pageStyles.pageDescription}>
            {t("pages.examinerReview.description")}
          </p>
        </header>
      )}

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {errorText}
        </div>
      )}
      {successText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertSuccess}`}>
          <CircleCheck
            size={15}
            strokeWidth={1.8}
            className={uiStyles.alertIcon}
          />
          {successText}
        </div>
      )}

      {/* 状态筛选 */}
      <div className={uiStyles.chips}>
        {iGM_ReviewFilters.map((value) => (
          <button
            key={value}
            type="button"
            className={`${uiStyles.chip} ${
              statusFilter === value ? uiStyles.chipActive : ""
            }`}
            onClick={() => iGM_SwitchFilter(value)}
          >
            {value === "all"
              ? t("examiner.review.all")
              : t(`examiner.review.status.${value}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("examiner.review.loadFailed")}
        </div>
      ) : items.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("examiner.review.empty")}</div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={tileStyles.recordList}>
            {items.map((item) => {
              /** 自己的申请不可审核（后端同样拦截） */
              const isSelf = item.userId === currentUser?.id;
              return (
                <div key={item.id} className={tileStyles.recordRow}>
                  <div className={tileStyles.recordMain}>
                    {/* 申请人 + 状态徽标 */}
                    <span className={tileStyles.recordAction}>
                      <span className={styles.applicantRow}>
                        {item.applicantName || item.realName}
                        {item.applicantUid && (
                          <span className={adminStyles.userMeta}>
                            @{item.applicantUid}
                          </span>
                        )}
                        <span
                          className={`${adminStyles.statusBadge} ${
                            iGM_StateBadgeClass[item.status] ?? ""
                          }`}
                        >
                          {t(`examiner.review.status.${item.status}`)}
                        </span>
                      </span>
                    </span>
                    {/* 真实姓名 / 联系方式 / 邮箱 */}
                    <span className={tileStyles.recordDesc}>
                      {t("examiner.review.realName")}：{item.realName}
                      {" · "}
                      {t("examiner.review.contact")}：{item.contact}
                    </span>
                    {item.applicantEmail && (
                      <span className={styles.metaLine}>
                        {t("examiner.review.email")}：{item.applicantEmail}
                      </span>
                    )}
                    {/* 个人简介 */}
                    {item.bio && (
                      <span className={tileStyles.recordDesc}>
                        {t("examiner.review.bio")}：{item.bio}
                      </span>
                    )}
                    {/* 命题方向 */}
                    {item.directions.length > 0 && (
                      <span className={styles.directionList}>
                        {t("examiner.review.directions")}：
                        {item.directions.map((direction) => (
                          <span key={direction} className={styles.directionTag}>
                            {direction}
                          </span>
                        ))}
                      </span>
                    )}
                    {/* 作品链接 */}
                    {item.portfolioUrl && (
                      <a
                        className={styles.portfolioLink}
                        href={item.portfolioUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.portfolioUrl}
                      </a>
                    )}
                    {/* 申请理由 */}
                    <span className={tileStyles.recordDesc}>
                      {t("examiner.review.reason")}：{item.reason}
                    </span>
                    {/* 已审核：审核意见 */}
                    {item.reviewComment && (
                      <span className={tileStyles.recordDesc}>
                        {t("examiner.review.reviewComment")}：
                        {item.reviewComment}
                      </span>
                    )}
                    <span className={styles.metaLine}>
                      {t("examiner.review.submittedAt")}：
                      {iGM_FormatDateTime(locale, item.createdAt)}
                    </span>
                  </div>
                  {/* 待审核：审核意见 + 通过 / 拒绝 */}
                  {item.status === "pending" && (
                    <div className={adminStyles.rowActions}>
                      {isSelf ? (
                        <span className={adminStyles.userMeta}>
                          {t("examiner.review.selfTip")}
                        </span>
                      ) : (
                        <>
                          <input
                            className={styles.commentInput}
                            type="text"
                            value={commentMap[item.id] ?? ""}
                            maxLength={500}
                            placeholder={t("examiner.review.commentPlaceholder")}
                            aria-label={t("examiner.review.reviewComment")}
                            onChange={(event) =>
                              setCommentMap((previous) => ({
                                ...previous,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className={adminStyles.smallButton}
                            disabled={reviewingId === item.id}
                            onClick={() => iGM_HandleReview(item, "approve")}
                          >
                            {reviewingId === item.id ? (
                              <LoaderCircle size={13} className="igm-spin" />
                            ) : (
                              <CircleCheck size={13} strokeWidth={1.8} />
                            )}
                            {t("examiner.review.approve")}
                          </button>
                          <button
                            type="button"
                            className={`${adminStyles.smallButton} ${adminStyles.smallButtonDanger}`}
                            disabled={reviewingId === item.id}
                            onClick={() => iGM_HandleReview(item, "reject")}
                          >
                            <CircleSlash size={13} strokeWidth={1.8} />
                            {t("examiner.review.reject")}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <IGM_Pagination
            page={page}
            totalPages={totalPages}
            onChange={(next) => iGM_Load(statusFilter, next)}
          />
        </section>
      )}
    </div>
  );
}

/** 命题创作者申请审核页（管理员或信任组织负责人；具体权限由后端校验） */
export function iGM_ExaminerReviewPage() {
  // JSX 组件名须大写开头
  const IGM_ExaminerReviewInner = iGM_ExaminerReviewInner;
  return (
    <IGM_RequireAuth staff>
      <IGM_ExaminerReviewInner />
    </IGM_RequireAuth>
  );
}

/** 命题创作者申请审核面板（无独立页头，供管理后台嵌入式使用） */
export function iGM_ExaminerReviewPanel() {
  const IGM_ExaminerReviewInner = iGM_ExaminerReviewInner;
  return <IGM_ExaminerReviewInner embedded />;
}

// 导出 //
export default iGM_ExaminerReviewPage;
