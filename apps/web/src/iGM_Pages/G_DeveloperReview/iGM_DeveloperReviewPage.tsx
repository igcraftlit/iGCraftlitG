/**
 * 文件路径：apps/web/src/iGM_Pages/G_DeveloperReview/iGM_DeveloperReviewPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_DeveloperReview
 * 模块：G_DeveloperReview
 * 作用：开发者申请审核——待审核申请与历史申请检索、审核（通过 / 拒绝 + 审核意见）
 * 内容：状态筛选 chips、分页申请列表（申请人、项目信息、联系方式、调用量、申请理由）、
 *       审核意见输入与通过 / 拒绝按钮
 * 说明：纯静态 SSG，数据在客户端经 iGM_DeveloperClient 调用本地后端；
 *       审核权限为管理员或受信任组织负责人，由后端严格校验；
 *       审核通过不发放 API Key，仅授予开发者接入资格（可进入接入界面）；
 *       不能审核自己的申请（前端隐藏按钮，后端二次拦截）
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, CircleSlash, Code2, LoaderCircle } from "lucide-react";
import {
  iGM_ApiListDeveloperApplications,
  iGM_ApiReviewDeveloper,
  type iGM_DeveloperApplicationList,
  type iGM_DeveloperStatus,
} from "../../iGM_Services/iGM_DeveloperClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import styles from "../iGM_Admin.module.css";
import reviewStyles from "../iGM_OrgVerify.module.css";

// 类型定义 //
/** 状态筛选：四种申请状态 + 全部 */
type iGM_ReviewFilter = iGM_DeveloperStatus | "all";

/** 列表项：申请 DTO + 申请人用户名与昵称（后端列表接口附加） */
type iGM_ReviewItem = iGM_DeveloperApplicationList["items"][number];

/** 筛选 chips 取值（顺序即展示顺序） */
const iGM_ReviewFilters: iGM_ReviewFilter[] = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "all",
];

/** 状态 → 徽标样式映射 */
const iGM_StateBadgeClass: Record<iGM_DeveloperStatus, string> = {
  pending: styles.statusPending,
  approved: styles.statusActive,
  rejected: styles.statusSuspended,
  withdrawn: "",
};

// 核心逻辑 //
/** 开发者申请审核页主体（管理员或组织负责人；权限由后端最终校验） */
function iGM_DeveloperReviewInner() {
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
      iGM_ApiListDeveloperApplications({
        status: nextStatus === "all" ? undefined : nextStatus,
        page: nextPage,
        pageSize: 10,
      })
        .then((response) => {
          if (response.data) {
            setItems(response.data.items);
            setPage(response.data.page);
            setTotalPages(response.data.totalPages);
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
      await iGM_ApiReviewDeveloper({
        applicationId: item.id,
        action,
        comment: (commentMap[item.id] ?? "").trim() || undefined,
      });
      setSuccessText(
        t(
          action === "approve"
            ? "developer.messages.approved"
            : "developer.messages.rejected",
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
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Code2 size={22} strokeWidth={1.8} />
          </span>
          {t("pages.developerReview.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.developerReview.description")}
        </p>
      </header>

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
              ? t("developer.review.all")
              : t(`developer.status.state.${value}`)}
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
          {t("developer.review.loadFailed")}
        </div>
      ) : items.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("developer.review.empty")}</div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={tileStyles.recordList}>
            {items.map((item) => {
              /** 自己的申请不可审核（后端同样拦截） */
              const isSelf = item.userId === currentUser?.id;
              const status = item.status as iGM_DeveloperStatus;
              return (
                <div key={item.id} className={tileStyles.recordRow}>
                  <div className={tileStyles.recordMain}>
                    {/* 申请人 + 状态徽标 */}
                    <span className={tileStyles.recordAction}>
                      <span className={reviewStyles.userNameRow}>
                        {item.displayName || item.username}
                        <span className={styles.userMeta}>
                          @{item.username}
                        </span>
                        <span
                          className={`${styles.statusBadge} ${iGM_StateBadgeClass[status] ?? ""}`}
                        >
                          {t(`developer.status.state.${item.status}`)}
                        </span>
                      </span>
                    </span>
                    {/* 项目信息 */}
                    <span className={tileStyles.recordDesc}>
                      {t("developer.status.projectName")}：{item.projectName}
                      {" · "}
                      {t(`developer.apply.projectTypeOptions.${item.projectType}`)}
                    </span>
                    <span className={tileStyles.recordDesc}>
                      {t("developer.status.projectDesc")}：{item.projectDesc}
                    </span>
                    {item.projectUrl && (
                      <a
                        className={reviewStyles.proofLink}
                        href={item.projectUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.projectUrl}
                      </a>
                    )}
                    {/* 联系方式与调用量 */}
                    <span className={tileStyles.recordDesc}>
                      {t("developer.status.contact")}：{item.contact}
                      {" · "}
                      {t("developer.status.expectedQuota")}：
                      {item.expectedQuota
                        ? t(
                            `developer.apply.expectedQuotaOptions.${item.expectedQuota}`,
                          )
                        : t("developer.status.notProvided")}
                    </span>
                    <span className={tileStyles.recordDesc}>
                      {t("developer.status.reason")}：{item.reason}
                    </span>
                    {/* 已审核：审核意见与审核人 */}
                    {item.reviewComment && (
                      <span className={tileStyles.recordDesc}>
                        {t("developer.status.reviewComment")}：
                        {item.reviewComment}
                      </span>
                    )}
                    <span className={styles.userMeta}>
                      {t("developer.status.submittedAt")}：
                      {iGM_FormatDateTime(locale, item.createdAt)}
                      {item.reviewerName
                        ? ` · ${t("developer.status.reviewer")}：${item.reviewerName}`
                        : ""}
                    </span>
                  </div>
                  {/* 待审核：审核意见 + 通过 / 拒绝 */}
                  {item.status === "pending" && (
                    <div className={styles.rowActions}>
                      {isSelf ? (
                        <span className={styles.userMeta}>
                          {t("developer.review.selfTip")}
                        </span>
                      ) : (
                        <>
                          <input
                            className={reviewStyles.commentInput}
                            type="text"
                            value={commentMap[item.id] ?? ""}
                            maxLength={500}
                            placeholder={t("developer.review.commentPlaceholder")}
                            aria-label={t("developer.status.reviewComment")}
                            onChange={(event) =>
                              setCommentMap((previous) => ({
                                ...previous,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className={styles.smallButton}
                            disabled={reviewingId === item.id}
                            onClick={() => iGM_HandleReview(item, "approve")}
                          >
                            {reviewingId === item.id ? (
                              <LoaderCircle size={13} className="igm-spin" />
                            ) : (
                              <CircleCheck size={13} strokeWidth={1.8} />
                            )}
                            {t("developer.review.approve")}
                          </button>
                          <button
                            type="button"
                            className={`${styles.smallButton} ${styles.smallButtonDanger}`}
                            disabled={reviewingId === item.id}
                            onClick={() => iGM_HandleReview(item, "reject")}
                          >
                            <CircleSlash size={13} strokeWidth={1.8} />
                            {t("developer.review.reject")}
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

/** 开发者申请审核页（管理员或组织负责人；具体权限由后端校验） */
export function iGM_DeveloperReviewPage() {
  // JSX 组件名须大写开头
  const IGM_DeveloperReviewInner = iGM_DeveloperReviewInner;
  return (
    <IGM_RequireAuth>
      <IGM_DeveloperReviewInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_DeveloperReviewPage;