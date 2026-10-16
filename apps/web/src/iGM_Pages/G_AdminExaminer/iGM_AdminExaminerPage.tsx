/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminExaminer/iGM_AdminExaminerPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminExaminer
 * 模块：G_AdminExaminer
 * 作用：命题创作者申请审核面板——查看、通过、拒绝命题创作者申请
 * 内容：状态筛选（全部 / 待审核 / 已通过 / 已拒绝）、关键词检索、分页列表、
 *       申请详情弹层（完整申请表单）、审核通过、拒绝并填写理由、审核日志展示
 * 说明：纯静态 SSG，数据在客户端经 iGM_AdminClient 调用本地后端；
 *       权限由后端 /api/admin/examiner-applications 强制校验（仅 admin），
 *       前端 RequireAuth 仅为体验优化；禁止 emoji，图标统一 lucide-react
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CircleCheck,
  CircleX,
  ClipboardCheck,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import {
  iGM_ApiAdminApproveExaminerApplication,
  iGM_ApiAdminExaminerApplicationDetail,
  iGM_ApiAdminExaminerApplications,
  iGM_ApiAdminRejectExaminerApplication,
  type iGM_ExaminerApplication,
  type iGM_ExaminerApplicationDetail,
  type iGM_ExaminerApplicationStatus,
} from "../../iGM_Services/iGM_AdminClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import adminStyles from "../iGM_Admin.module.css";
import styles from "./iGM_AdminExaminer.module.css";

// 类型定义 //
/** 状态筛选取值：全部 / 待审核 / 已通过 / 已拒绝 */
type iGM_ExaminerStatusFilter = "all" | iGM_ExaminerApplicationStatus;

/** 拒绝弹层目标 */
interface iGM_RejectTarget {
  id: string;
  name: string;
}

/** 状态 → 徽标样式（沿用管理后台通用状态色） */
const iGM_StatusBadgeClass: Record<iGM_ExaminerApplicationStatus, string> = {
  pending: adminStyles.statusPending,
  approved: adminStyles.statusActive,
  rejected: adminStyles.statusSuspended,
};

// 核心逻辑 //
/** 命题创作者申请审核面板主体（仅管理员） */
function iGM_AdminExaminerInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();

  const [filter, setFilter] = useState<iGM_ExaminerStatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<iGM_ExaminerApplication[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 详情弹层当前申请（null 关闭） */
  const [detail, setDetail] = useState<iGM_ExaminerApplicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /** 拒绝弹层目标与理由 */
  const [rejectTarget, setRejectTarget] = useState<iGM_RejectTarget | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  /** 审核操作进行中（防重复提交） */
  const [submitting, setSubmitting] = useState(false);

  /** 加载申请列表 */
  const iGM_Load = useCallback(
    (nextPage: number, query: string, status: iGM_ExaminerStatusFilter) => {
      setLoading(true);
      iGM_ApiAdminExaminerApplications({
        status: status === "all" ? null : status,
        q: query,
        page: nextPage,
        pageSize: 10,
      })
        .then((response) => {
          if (response.data) {
            setItems(response.data.items);
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
    iGM_Load(1, "", "pending");
  }, [iGM_Load]);

  /** 切换状态筛选：重置到第一页并按当前关键词重新加载 */
  function iGM_HandleFilter(next: iGM_ExaminerStatusFilter): void {
    setFilter(next);
    iGM_Load(1, search, next);
  }

  /** 检索提交 */
  function iGM_HandleSearch(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    iGM_Load(1, search, filter);
  }

  /** 打开详情弹层 */
  async function iGM_HandleOpenDetail(id: string): Promise<void> {
    setErrorText(null);
    setDetailLoading(true);
    try {
      const response = await iGM_ApiAdminExaminerApplicationDetail(id);
      if (response.data) setDetail(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setDetailLoading(false);
    }
  }

  /** 审核通过（授予命题创作者资格并自动分配编号） */
  async function iGM_HandleApprove(item: iGM_ExaminerApplication): Promise<void> {
    const name = item.applicantName || item.realName;
    if (!window.confirm(t("admin.examiner.approveConfirm", { name }))) return;
    setErrorText(null);
    setSubmitting(true);
    try {
      await iGM_ApiAdminApproveExaminerApplication(item.id);
      setDetail(null);
      iGM_Load(page, search, filter);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSubmitting(false);
    }
  }

  /** 拒绝：必须先填写理由 */
  async function iGM_HandleRejectConfirm(): Promise<void> {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setErrorText(t("admin.examiner.rejectReasonRequired"));
      return;
    }
    setErrorText(null);
    setSubmitting(true);
    try {
      await iGM_ApiAdminRejectExaminerApplication(rejectTarget.id, reason);
      setRejectTarget(null);
      setRejectReason("");
      setDetail(null);
      iGM_Load(page, search, filter);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSubmitting(false);
    }
  }

  /** 申请摘要行的审核操作按钮（仅待审核显示） */
  function iGM_RenderActions(item: iGM_ExaminerApplication) {
    if (item.status !== "pending") return null;
    return (
      <>
        <button
          type="button"
          className={adminStyles.smallButton}
          onClick={() => iGM_HandleApprove(item)}
          disabled={submitting}
        >
          <CircleCheck size={13} strokeWidth={1.8} />
          {t("admin.examiner.approve")}
        </button>
        <button
          type="button"
          className={`${adminStyles.smallButton} ${adminStyles.smallButtonDanger}`}
          onClick={() =>
            setRejectTarget({
              id: item.id,
              name: item.applicantName || item.realName,
            })
          }
          disabled={submitting}
        >
          <CircleX size={13} strokeWidth={1.8} />
          {t("admin.examiner.reject")}
        </button>
      </>
    );
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <ClipboardCheck size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminExaminer.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminExaminer.description")}
        </p>
      </header>

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {errorText}
        </div>
      )}

      {/* 状态筛选 */}
      <div className={styles.filterBar}>
        {(["pending", "approved", "rejected", "all"] as iGM_ExaminerStatusFilter[]).map(
          (value) => (
            <button
              key={value}
              type="button"
              className={`${styles.filterButton} ${
                filter === value ? styles.filterButtonActive : ""
              }`}
              onClick={() => iGM_HandleFilter(value)}
            >
              {t(`admin.examiner.filters.${value}`)}
            </button>
          ),
        )}
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
            placeholder={t("admin.examiner.searchPlaceholder")}
            maxLength={100}
          />
        </div>
        <button type="submit" className={uiStyles.primaryButton}>
          {t("admin.examiner.search")}
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
      ) : items.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("admin.examiner.empty")}</div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={tileStyles.recordList}>
            {items.map((item) => (
              <div key={item.id} className={tileStyles.recordRow}>
                <div className={tileStyles.recordMain}>
                  <span className={styles.applicantName}>
                    {item.applicantName}
                  </span>
                  <span className={styles.applicantMeta}>
                    {t("admin.examiner.uid")} {item.applicantUid}
                  </span>
                  <span className={styles.detailLine}>
                    {t("admin.examiner.realName")} {item.realName}
                  </span>
                  <span className={styles.detailLine}>
                    {t("admin.examiner.contact")} {item.contact}
                  </span>
                  <span className={styles.applicantMeta}>
                    {t("admin.examiner.submittedAt")}{" "}
                    {iGM_FormatDateTime(locale, item.submittedAt)}
                  </span>
                </div>
                <div className={adminStyles.rowActions}>
                  <span
                    className={`${adminStyles.statusBadge} ${
                      iGM_StatusBadgeClass[item.status]
                    }`}
                  >
                    {t(`admin.examiner.status.${item.status}`)}
                  </span>
                  <button
                    type="button"
                    className={adminStyles.smallButton}
                    onClick={() => iGM_HandleOpenDetail(item.id)}
                  >
                    <ClipboardCheck size={13} strokeWidth={1.8} />
                    {t("admin.examiner.viewDetail")}
                  </button>
                  {iGM_RenderActions(item)}
                </div>
              </div>
            ))}
          </div>
          <IGM_Pagination
            page={page}
            totalPages={totalPages}
            onChange={(next) => iGM_Load(next, search, filter)}
          />
        </section>
      )}

      {/* 申请详情弹层 */}
      {detail && (
        <div
          className={styles.detailOverlay}
          onClick={() => setDetail(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t("admin.examiner.detailTitle")}
        >
          <div
            className={styles.detailDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>
                {t("admin.examiner.detailTitle")}
              </h2>
              <button
                type="button"
                className={styles.detailClose}
                onClick={() => setDetail(null)}
                aria-label={t("admin.examiner.close")}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className={styles.detailBody}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.applicant")}
                </span>
                <span className={styles.detailValue}>
                  {detail.applicantName} · {t("admin.examiner.uid")}{" "}
                  {detail.applicantUid}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.email")}
                </span>
                <span className={styles.detailValue}>{detail.applicantEmail}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.realName")}
                </span>
                <span className={styles.detailValue}>{detail.realName}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.contact")}
                </span>
                <span className={styles.detailValue}>{detail.contact}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.submittedAt")}
                </span>
                <span className={styles.detailValue}>
                  {iGM_FormatDateTime(locale, detail.submittedAt)}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.bio")}
                </span>
                <pre className={styles.detailPre}>{detail.bio}</pre>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.directions")}
                </span>
                <span className={styles.detailValue}>
                  {detail.directions.length > 0
                    ? detail.directions.join(" / ")
                    : "—"}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.portfolio")}
                </span>
                <span className={styles.detailValue}>
                  {detail.portfolioUrl ?? "—"}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.reason")}
                </span>
                <pre className={styles.detailPre}>{detail.reason}</pre>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.agreedToRules")}
                </span>
                <span className={styles.detailValue}>
                  {detail.agreedToRules
                    ? t("admin.examiner.yes")
                    : t("admin.examiner.no")}
                </span>
              </div>

              {/* 审核日志：仅已审核过的申请展示 */}
              {detail.status !== "pending" && (
                <div className={styles.detailSection}>
                  <span className={styles.detailSectionTitle}>
                    {t("admin.examiner.reviewLog")}
                  </span>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>
                      {t("admin.examiner.reviewerName")}
                    </span>
                    <span className={styles.detailValue}>
                      {detail.reviewerName ?? "—"}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>
                      {t("admin.examiner.reviewedAt")}
                    </span>
                    <span className={styles.detailValue}>
                      {detail.reviewedAt
                        ? iGM_FormatDateTime(locale, detail.reviewedAt)
                        : "—"}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>
                      {t("admin.examiner.reviewComment")}
                    </span>
                    <pre className={styles.detailPre}>
                      {detail.reviewComment ?? t("admin.examiner.noComment")}
                    </pre>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.detailActions}>
              {detail.status === "pending" && (
                <>
                  <button
                    type="button"
                    className={adminStyles.smallButton}
                    onClick={() => iGM_HandleApprove(detail)}
                    disabled={submitting}
                  >
                    <CircleCheck size={13} strokeWidth={1.8} />
                    {t("admin.examiner.approve")}
                  </button>
                  <button
                    type="button"
                    className={`${adminStyles.smallButton} ${adminStyles.smallButtonDanger}`}
                    onClick={() => {
                      setDetail(null);
                      setRejectReason("");
                      setRejectTarget({
                        id: detail.id,
                        name: detail.applicantName || detail.realName,
                      });
                    }}
                    disabled={submitting}
                  >
                    <CircleX size={13} strokeWidth={1.8} />
                    {t("admin.examiner.reject")}
                  </button>
                </>
              )}
              <button
                type="button"
                className={adminStyles.smallButton}
                onClick={() => setDetail(null)}
              >
                {t("admin.examiner.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情加载占位（避免点击后无反馈） */}
      {detailLoading && !detail && (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      )}

      {/* 拒绝弹层：必须填写理由 */}
      {rejectTarget && (
        <div
          className={styles.detailOverlay}
          onClick={() => setRejectTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t("admin.examiner.rejectTitle")}
        >
          <div
            className={styles.detailDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>
                {t("admin.examiner.rejectTitle")}
              </h2>
              <button
                type="button"
                className={styles.detailClose}
                onClick={() => setRejectTarget(null)}
                aria-label={t("admin.examiner.close")}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className={styles.detailBody}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.applicant")}
                </span>
                <span className={styles.detailValue}>{rejectTarget.name}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  {t("admin.examiner.reviewComment")}
                </span>
                <textarea
                  className={styles.rejectTextarea}
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder={t("admin.examiner.rejectReasonPlaceholder")}
                  maxLength={500}
                />
              </div>
            </div>
            <div className={styles.detailActions}>
              <button
                type="button"
                className={`${adminStyles.smallButton} ${adminStyles.smallButtonDanger}`}
                onClick={iGM_HandleRejectConfirm}
                disabled={submitting}
              >
                <CircleX size={13} strokeWidth={1.8} />
                {t("admin.examiner.rejectConfirm")}
              </button>
              <button
                type="button"
                className={adminStyles.smallButton}
                onClick={() => setRejectTarget(null)}
                disabled={submitting}
              >
                {t("admin.examiner.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 命题创作者申请审核面板（仅 admin，后端 /api/admin/* 强制执行） */
export function iGM_AdminExaminerPage() {
  const IGM_AdminExaminerInnerComponent = iGM_AdminExaminerInner;
  return (
    <IGM_RequireAuth role="admin">
      <IGM_AdminExaminerInnerComponent />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminExaminerPage;
