/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminReports/iGM_AdminReportsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminReports
 * 模块：G_AdminReports
 * 作用：举报处理——举报列表检索、处理举报（可联动隐藏/删除目标内容）
 * 内容：状态筛选 chips、分页举报列表、处理表单（处理结论 + 内容处置）
 * 说明：纯静态 SSG，数据在客户端经 iGM_AdminClient 调用本地后端；
 *       处理权限 moderator 及以上，由后端严格校验并写操作日志
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, CircleSlash, Flag, LoaderCircle } from "lucide-react";
import {
  iGM_ApiAdminHandleReport,
  iGM_ApiAdminReports,
  type iGM_AdminReport,
} from "../../iGM_Services/iGM_AdminClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import styles from "../iGM_Admin.module.css";

// 类型定义 //
type iGM_ReportStatus = "pending" | "resolved" | "dismissed";
type iGM_StatusFilter = iGM_ReportStatus | "all";
type iGM_ContentAction = "none" | "hide" | "delete";

// 核心逻辑 //
/** 举报处理页主体（moderator 及以上） */
function iGM_ReportsInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();

  const [statusFilter, setStatusFilter] = useState<iGM_StatusFilter>("pending");
  const [reports, setReports] = useState<iGM_AdminReport[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  /** 每行选中的内容处置动作（reportId -> action） */
  const [actionMap, setActionMap] = useState<Record<string, iGM_ContentAction>>({});

  /** 加载举报列表 */
  const iGM_Load = useCallback(
    (nextStatus: iGM_StatusFilter, nextPage: number) => {
      setLoading(true);
      iGM_ApiAdminReports(
        nextStatus === "all" ? null : (nextStatus as iGM_ReportStatus),
        nextPage,
        10,
      )
        .then((response) => {
          if (response.data) {
            setReports(response.data.items);
            setPage(response.data.page);
            setTotalPages(response.data.totalPages);
            setActionMap({});
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
  function iGM_SwitchStatus(next: iGM_StatusFilter): void {
    setStatusFilter(next);
    iGM_Load(next, 1);
  }

  /** 处理举报 */
  async function iGM_Handle(
    report: iGM_AdminReport,
    decision: "resolved" | "dismissed",
  ): Promise<void> {
    setErrorText(null);
    try {
      await iGM_ApiAdminHandleReport(
        report.id,
        decision,
        actionMap[report.id] ?? "none",
      );
      iGM_Load(statusFilter, page);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }

  /** 状态徽标样式映射 */
  const statusClass: Record<iGM_ReportStatus, string> = {
    pending: styles.statusPending,
    resolved: styles.statusActive,
    dismissed: styles.statusSuspended,
  };

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Flag size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminReports.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminReports.description")}
        </p>
      </header>

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>{errorText}</div>
      )}

      {/* 状态筛选 */}
      <div className={uiStyles.chips}>
        {(
          [
            ["pending", "filterPending"],
            ["resolved", "filterResolved"],
            ["dismissed", "filterDismissed"],
            ["all", "filterAll"],
          ] as [iGM_StatusFilter, string][]
        ).map(([value, key]) => (
          <button
            key={value}
            type="button"
            className={`${uiStyles.chip} ${statusFilter === value ? uiStyles.chipActive : ""}`}
            onClick={() => iGM_SwitchStatus(value)}
          >
            {t(`admin.reports.${key}`)}
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
          {t("admin.errors.loadFailed")}
        </div>
      ) : reports.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("admin.reports.empty")}</div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={tileStyles.recordList}>
            {reports.map((report) => (
              <div key={report.id} className={tileStyles.recordRow}>
                <div className={tileStyles.recordMain}>
                  <span className={tileStyles.recordAction}>
                    {t(`admin.reports.target${report.targetType === "comment" ? "Comment" : "Post"}`)}
                    <span className={styles.userMeta}>
                      {" "}
                      · {report.targetSummary || report.targetId}
                    </span>
                  </span>
                  <span className={tileStyles.recordDesc}>{report.reason}</span>
                  <span className={styles.userMeta}>
                    {t("admin.reports.by", { name: report.reporterName || report.reporterId })}
                    {" · "}
                    {iGM_FormatDateTime(locale, report.createdAt)}
                    {report.handledAt
                      ? ` · ${t("admin.reports.handledAt", {
                          time: iGM_FormatDateTime(locale, report.handledAt),
                        })}`
                      : ""}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <span className={`${styles.statusBadge} ${statusClass[report.status]}`}>
                    {t(`admin.reports.status${report.status === "pending" ? "Pending" : report.status === "resolved" ? "Resolved" : "Dismissed"}`)}
                  </span>
                  {report.status === "pending" && (
                    <>
                      <select
                        className={styles.roleSelect}
                        value={actionMap[report.id] ?? "none"}
                        aria-label={t("admin.reports.contentAction")}
                        onChange={(event) =>
                          setActionMap((previous) => ({
                            ...previous,
                            [report.id]: event.target.value as iGM_ContentAction,
                          }))
                        }
                      >
                        <option value="none">{t("admin.reports.actionNone")}</option>
                        <option value="hide">{t("admin.reports.actionHide")}</option>
                        <option value="delete">{t("admin.reports.actionDelete")}</option>
                      </select>
                      <button
                        type="button"
                        className={styles.smallButton}
                        onClick={() => iGM_Handle(report, "resolved")}
                      >
                        <CircleCheck size={13} strokeWidth={1.8} />
                        {t("admin.reports.resolve")}
                      </button>
                      <button
                        type="button"
                        className={`${styles.smallButton} ${styles.smallButtonDanger}`}
                        onClick={() => iGM_Handle(report, "dismissed")}
                      >
                        <CircleSlash size={13} strokeWidth={1.8} />
                        {t("admin.reports.dismiss")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
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

/** 举报处理页（moderator 及以上） */
export function iGM_AdminReportsPage() {
  const IGM_ReportsInner = iGM_ReportsInner;
  return (
    <IGM_RequireAuth role="moderator">
      <IGM_ReportsInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminReportsPage;
