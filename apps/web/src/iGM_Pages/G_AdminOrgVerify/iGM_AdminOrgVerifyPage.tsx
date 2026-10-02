/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminOrgVerify/iGM_AdminOrgVerifyPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminOrgVerify
 * 模块：G_AdminOrgVerify
 * 作用：认证审核——组织认证申请列表检索、审核（通过/拒绝 + 审核意见）
 * 内容：状态筛选 chips、组织筛选（仅 admin 可见，负责人后端强制本组织）、
 *       分页申请列表（申请人头像/邮箱/组织/理由/证明材料）、
 *       审核意见输入与通过/拒绝按钮
 * 说明：纯静态 SSG，数据在客户端经 iGM_OrgVerifyClient 调用本地后端；
 *       审核权限为 admin 或对应组织负责人，由后端严格校验并写操作日志；
 *       不能审核自己的申请（前端隐藏按钮，后端二次拦截）
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  CircleCheck,
  CircleSlash,
  FileDown,
  LoaderCircle,
} from "lucide-react";
import {
  iGM_ApiAdminOrgVerificationReview,
  iGM_ApiAdminOrgVerifications,
  iGM_ApiOrgVerifyOrganizations,
  type iGM_AdminOrgVerification,
  type iGM_Organization,
  type iGM_OrgVerifyStatus,
} from "../../iGM_Services/iGM_OrgVerifyClient";
import { iGM_FileDownloadUrl } from "../../iGM_Services/iGM_FileClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import styles from "../iGM_Admin.module.css";
import verifyStyles from "../iGM_OrgVerify.module.css";

// 类型定义 //
type iGM_StatusFilter = iGM_OrgVerifyStatus | "all";

// 核心逻辑 //
/** 状态徽标样式映射 */
const iGM_StatusClass: Record<iGM_OrgVerifyStatus, string> = {
  pending: styles.statusPending,
  approved: styles.statusActive,
  rejected: styles.statusSuspended,
  cancelled: "",
  left: "",
};

/** 认证审核页主体（admin 或对应组织负责人；embedded 时作为审核面板 Tab） */
function iGM_AdminOrgVerifyInner({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const { user: currentUser } = iGM_UseAuth();
  /** admin 可切换组织筛选；负责人仅能看到自己组织（后端强制） */
  const isAdmin = currentUser?.role === "admin";

  const [statusFilter, setStatusFilter] = useState<iGM_StatusFilter>("pending");
  /** 组织筛选：null = 全部组织（仅 admin 可选） */
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<iGM_Organization[]>([]);
  const [items, setItems] = useState<iGM_AdminOrgVerification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  /** 每行审核意见输入（verificationId -> comment） */
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});
  /** 正在提交审核的申请 ID（防重复点击） */
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  /** admin 加载受信任组织列表用于筛选；负责人无需组织筛选器 */
  useEffect(() => {
    if (!isAdmin) return;
    iGM_ApiOrgVerifyOrganizations()
      .then((response) => {
        if (response.data) setOrgs(response.data.items);
      })
      .catch(() => undefined);
  }, [isAdmin]);

  /** 加载申请列表 */
  const iGM_Load = useCallback(
    (
      nextStatus: iGM_StatusFilter,
      nextPage: number,
      nextOrgId: string | null,
    ) => {
      setLoading(true);
      iGM_ApiAdminOrgVerifications(
        nextStatus === "all" ? null : nextStatus,
        nextPage,
        10,
        nextOrgId,
      )
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
    iGM_Load("pending", 1, null);
  }, [iGM_Load]);

  /** 切换状态筛选 */
  function iGM_SwitchStatus(next: iGM_StatusFilter): void {
    setStatusFilter(next);
    iGM_Load(next, 1, orgFilter);
  }

  /** 切换组织筛选（仅 admin） */
  function iGM_SwitchOrg(nextOrgId: string | null): void {
    setOrgFilter(nextOrgId);
    iGM_Load(statusFilter, 1, nextOrgId);
  }

  /** 审核（通过/拒绝） */
  async function iGM_HandleReview(
    item: iGM_AdminOrgVerification,
    action: "approve" | "reject",
  ): Promise<void> {
    if (reviewingId) return;
    setErrorText(null);
    setSuccessText(null);
    setReviewingId(item.id);
    try {
      await iGM_ApiAdminOrgVerificationReview({
        verificationId: item.id,
        action,
        comment: (commentMap[item.id] ?? "").trim() || null,
      });
      setSuccessText(
        t(action === "approve" ? "orgVerify.messages.approved" : "orgVerify.messages.rejected"),
      );
      iGM_Load(statusFilter, page, orgFilter);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头：嵌入审核面板时由面板统一提供，独立页面保留 */}
      {!embedded && (
        <header className={pageStyles.pageHeader}>
          <h1 className={pageStyles.pageTitle}>
            <span className={pageStyles.pageTitleIcon}>
              <BadgeCheck size={22} strokeWidth={1.8} />
            </span>
            {t("pages.adminOrgVerify.title")}
          </h1>
          <p className={pageStyles.pageDescription}>
            {t("pages.adminOrgVerify.description")}
          </p>
        </header>
      )}

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>{errorText}</div>
      )}
      {successText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertSuccess}`}>
          <CircleCheck size={15} strokeWidth={1.8} className={uiStyles.alertIcon} />
          {successText}
        </div>
      )}

      {/* 状态筛选 */}
      <div className={uiStyles.chips}>
        {(
          [
            ["pending", "filterPending"],
            ["approved", "filterApproved"],
            ["rejected", "filterRejected"],
            ["cancelled", "filterCancelled"],
            ["all", "filterAll"],
          ] as [iGM_StatusFilter, string][]
        ).map(([value, key]) => (
          <button
            key={value}
            type="button"
            className={`${uiStyles.chip} ${statusFilter === value ? uiStyles.chipActive : ""}`}
            onClick={() => iGM_SwitchStatus(value)}
          >
            {t(`orgVerify.admin.${key}`)}
          </button>
        ))}
      </div>

      {/* 组织筛选（仅 admin：全部组织 + 各受信任组织；负责人由后端限定本组织） */}
      {isAdmin && orgs.length > 0 && (
        <div className={uiStyles.chips} aria-label={t("orgVerify.admin.filterOrg")}>
          <button
            type="button"
            className={`${uiStyles.chip} ${orgFilter === null ? uiStyles.chipActive : ""}`}
            onClick={() => iGM_SwitchOrg(null)}
          >
            {t("orgVerify.admin.filterOrgAll")}
          </button>
          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              className={`${uiStyles.chip} ${orgFilter === org.id ? uiStyles.chipActive : ""}`}
              onClick={() => iGM_SwitchOrg(org.id)}
            >
              {org.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("orgVerify.errors.loadFailed")}
        </div>
      ) : items.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("orgVerify.admin.empty")}</div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={tileStyles.recordList}>
            {items.map((item) => {
              /** 自己的申请不可审核（后端同样拦截） */
              const isSelf = item.userId === currentUser?.id;
              return (
                <div key={item.id} className={tileStyles.recordRow}>
                  <div className={tileStyles.recordMain}>
                    {/* 申请人：头像 + 名称 + 申请组织 + 状态徽标 */}
                    <span className={tileStyles.recordAction}>
                      <span className={verifyStyles.userCell}>
                        <IGM_Avatar
                          src={item.userAvatar}
                          name={item.userDisplayName || item.username}
                          size="sm"
                        />
                        <span className={verifyStyles.userNameRow}>
                          {item.userDisplayName || item.username}
                          <span className={styles.userMeta}>
                            @{item.username} · {item.userEmail}
                          </span>
                          → {item.org.name}
                          <span
                            className={`${styles.statusBadge} ${iGM_StatusClass[item.status]}`}
                          >
                            {t(`orgVerify.status.${item.status}`)}
                          </span>
                        </span>
                      </span>
                    </span>
                    {/* 申请理由 */}
                    <span className={tileStyles.recordDesc}>
                      {t("orgVerify.list.reason")}：{item.reason}
                    </span>
                    {/* 证明材料附件 */}
                    {item.proof && (
                      <a
                        className={verifyStyles.proofLink}
                        href={iGM_FileDownloadUrl(item.proof)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileDown size={12} strokeWidth={1.8} />
                        {t("orgVerify.list.proofView")}
                      </a>
                    )}
                    {/* 已审核：审核意见与审核人 */}
                    {item.reviewComment && (
                      <span className={tileStyles.recordDesc}>
                        {t("orgVerify.list.reviewComment")}：{item.reviewComment}
                      </span>
                    )}
                    <span className={styles.userMeta}>
                      {t("orgVerify.list.submittedAt", {
                        time: iGM_FormatDateTime(locale, item.createdAt),
                      })}
                      {item.reviewerName
                        ? ` · ${t("orgVerify.list.reviewer")}：${item.reviewerName}`
                        : ""}
                    </span>
                  </div>
                  {/* 待审核：审核意见 + 通过/拒绝 */}
                  {item.status === "pending" && (
                    <div className={styles.rowActions}>
                      {isSelf ? (
                        <span className={styles.userMeta}>
                          {t("orgVerify.admin.selfTip")}
                        </span>
                      ) : (
                        <>
                          <input
                            className={verifyStyles.commentInput}
                            type="text"
                            value={commentMap[item.id] ?? ""}
                            maxLength={500}
                            placeholder={t("orgVerify.admin.commentPlaceholder")}
                            aria-label={t("orgVerify.list.reviewComment")}
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
                            {t("orgVerify.admin.approve")}
                          </button>
                          <button
                            type="button"
                            className={`${styles.smallButton} ${styles.smallButtonDanger}`}
                            disabled={reviewingId === item.id}
                            onClick={() => iGM_HandleReview(item, "reject")}
                          >
                            <CircleSlash size={13} strokeWidth={1.8} />
                            {t("orgVerify.admin.reject")}
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
            onChange={(next) => iGM_Load(statusFilter, next, orgFilter)}
          />
        </section>
      )}
    </div>
  );
}

/** 认证审核页（admin 或组织负责人；具体权限由后端校验） */
export function iGM_AdminOrgVerifyPage() {
  // JSX 组件名须大写开头
  const IGM_AdminOrgVerifyInner = iGM_AdminOrgVerifyInner;
  return (
    <IGM_RequireAuth>
      <IGM_AdminOrgVerifyInner />
    </IGM_RequireAuth>
  );
}

/** 模块二十五：审核面板「认证审核」Tab 内容（无独立页头） */
export function iGM_OrgVerifyPanel() {
  const IGM_AdminOrgVerifyInner = iGM_AdminOrgVerifyInner;
  return <IGM_AdminOrgVerifyInner embedded />;
}

// 导出 //
export default iGM_AdminOrgVerifyPage;
