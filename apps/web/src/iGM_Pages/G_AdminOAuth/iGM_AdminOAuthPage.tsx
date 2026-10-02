/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminOAuth/iGM_AdminOAuthPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminOAuth
 * 模块：G_AdminOAuth
 * 作用：管理端 OAuth 应用审核——通过 / 拒绝 / 禁用 / 启用 / 删除
 * 内容：状态筛选 chips、分页应用列表（申请人、类型、描述、回调地址、scope、用途、联系方式、
 *       应用主页、隐私政策、服务条款、数据使用说明）、审核意见输入与通过 / 拒绝，
 *       已通过可禁用（同时撤销其全部令牌），已禁用可重新启用，任意状态可删除
 * 说明：纯静态 SSG；权限为管理员，由后端 iGM_RequireRole 严格校验；
 *       模块二十五起审核通过不再向管理员展示 client_secret，
 *       密钥由开发者在「我的应用」页首次进入时一次性领取；
 *       所有操作写入 iGM_OAuthLogs 留痕
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CircleCheck,
  CircleSlash,
  LoaderCircle,
  Play,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  iGM_ApiDeleteOAuthApp,
  iGM_ApiListOAuthAppsAdmin,
  iGM_ApiReviewOAuthApp,
  iGM_ApiSetOAuthAppStatus,
  type iGM_OAuthApplicationAdmin,
} from "../../iGM_Services/iGM_OAuthClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Module15.module.css";

// 类型定义 //
/** 状态筛选：四种应用状态 + 全部 */
type iGM_AdminFilter = "pending" | "approved" | "rejected" | "disabled" | "all";

/** 筛选 chips 取值（顺序即展示顺序） */
const iGM_AdminFilters: iGM_AdminFilter[] = [
  "pending",
  "approved",
  "rejected",
  "disabled",
  "all",
];

/** 状态 → 徽标样式映射 */
const iGM_StatusBadgeClass: Record<string, string> = {
  pending: styles.stateBadgePending,
  approved: styles.stateBadgeApproved,
  rejected: styles.stateBadgeRejected,
  disabled: styles.stateBadgeRejected,
  withdrawn: styles.stateBadge,
};

// 核心逻辑 //
/**
 * 管理端 OAuth 审核页主体（模块二十五起：管理员或受信任组织负责人）。
 * embedded 时作为开发者分区的「应用审核」Tab。
 */
function iGM_AdminOAuthInner({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();

  const [filter, setFilter] = useState<iGM_AdminFilter>("pending");
  const [items, setItems] = useState<iGM_OAuthApplicationAdmin[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  /** 每行审核意见输入（clientId -> comment） */
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});
  /** 正在提交操作的应用 clientId */
  const [actingId, setActingId] = useState<string | null>(null);

  /** 加载应用列表 */
  const iGM_Load = useCallback(
    (nextFilter: iGM_AdminFilter, nextPage: number) => {
      setLoading(true);
      setLoadFailed(false);
      iGM_ApiListOAuthAppsAdmin({
        status: nextFilter === "all" ? undefined : nextFilter,
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
  function iGM_SwitchFilter(next: iGM_AdminFilter): void {
    setFilter(next);
    iGM_Load(next, 1);
  }

  /** 审核（通过后密钥由开发者在「我的应用」一次性领取，管理端不展示明文） */
  function iGM_HandleReview(
    item: iGM_OAuthApplicationAdmin,
    action: "approve" | "reject",
  ): void {
    if (actingId) return;
    setErrorText(null);
    setSuccessText(null);
    setActingId(item.clientId);
    iGM_ApiReviewOAuthApp({
      clientId: item.clientId,
      action,
      comment: (commentMap[item.clientId] ?? "").trim() || undefined,
    })
      .then(() => {
        setSuccessText(
          t(
            action === "approve"
              ? "oauth.admin.approved"
              : "oauth.admin.rejected",
          ),
        );
        iGM_Load(filter, page);
      })
      .catch((error) => setErrorText(iGM_ResolveErrorText(t, error)))
      .finally(() => setActingId(null));
  }

  /** 启用 / 禁用应用（禁用会撤销其全部令牌） */
  function iGM_HandleToggleStatus(
    item: iGM_OAuthApplicationAdmin,
    disabled: boolean,
  ): void {
    if (actingId) return;
    if (disabled && !window.confirm(t("oauth.admin.disableConfirm"))) return;
    setErrorText(null);
    setSuccessText(null);
    setActingId(item.clientId);
    iGM_ApiSetOAuthAppStatus({ clientId: item.clientId, disabled })
      .then(() => {
        setSuccessText(
          t(disabled ? "oauth.admin.disabled" : "oauth.admin.enabled"),
        );
        iGM_Load(filter, page);
      })
      .catch((error) => setErrorText(iGM_ResolveErrorText(t, error)))
      .finally(() => setActingId(null));
  }

  /** 删除应用 */
  function iGM_HandleDelete(item: iGM_OAuthApplicationAdmin): void {
    if (actingId) return;
    if (!window.confirm(t("oauth.admin.deleteConfirm"))) return;
    setErrorText(null);
    setSuccessText(null);
    setActingId(item.clientId);
    iGM_ApiDeleteOAuthApp(item.clientId)
      .then(() => {
        setSuccessText(t("oauth.admin.deleted"));
        iGM_Load(filter, page);
      })
      .catch((error) => setErrorText(iGM_ResolveErrorText(t, error)))
      .finally(() => setActingId(null));
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头：嵌入开发者分区时由面板统一提供，独立页面保留 */}
      {!embedded && (
        <header className={pageStyles.pageHeader}>
          <h1 className={pageStyles.pageTitle}>
            <span className={pageStyles.pageTitleIcon}>
              <ShieldCheck size={22} strokeWidth={1.8} />
            </span>
            {t("pages.adminOAuth.title")}
          </h1>
          <p className={pageStyles.pageDescription}>
            {t("pages.adminOAuth.description")}
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
        {iGM_AdminFilters.map((value) => (
          <button
            key={value}
            type="button"
            className={`${uiStyles.chip} ${
              filter === value ? uiStyles.chipActive : ""
            }`}
            onClick={() => iGM_SwitchFilter(value)}
          >
            {value === "all" ? t("oauth.admin.all") : t(`oauth.status.${value}`)}
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
          {t("oauth.admin.loadFailed")}
        </div>
      ) : items.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("oauth.admin.empty")}</div>
      ) : (
        <div className={uiStyles.list}>
          {items.map((item) => {
            return (
              <section key={item.id} className={styles.statusCard}>
                <div className={styles.progressHead}>
                  <h2 className={styles.progressTitle}>
                    {item.name}
                    <span className={styles.levelTag}>
                      {t(`oauth.clientTypes.${item.type}`)}
                    </span>
                  </h2>
                  <span
                    className={`${styles.stateBadge} ${iGM_StatusBadgeClass[item.status] ?? ""}`}
                  >
                    {t(`oauth.status.${item.status}`)}
                  </span>
                </div>

                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.admin.applicant")}
                  </span>
                  <span className={styles.statusValue}>
                    {item.displayName || item.username}
                    {" (@"}
                    {item.username}
                    {")"}
                  </span>
                </div>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.apps.clientId")}
                  </span>
                  <span className={styles.statusValue}>{item.clientId}</span>
                </div>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.apps.descriptionLabel")}
                  </span>
                  <span className={styles.statusValue}>{item.description}</span>
                </div>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.apps.redirectUris")}
                  </span>
                  <span className={styles.statusValue}>
                    {item.redirectUris.join(" · ")}
                  </span>
                </div>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.apps.scopes")}
                  </span>
                  <span className={styles.statusValue}>
                    {item.scopes
                      .map((scope) => t(`oauth.scopes.${scope}`))
                      .join(" · ")}
                  </span>
                </div>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.apps.purpose")}
                  </span>
                  <span className={styles.statusValue}>{item.purpose}</span>
                </div>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.apps.contact")}
                  </span>
                  <span className={styles.statusValue}>{item.contact}</span>
                </div>
                {/* 模块二十五：合规字段，供审核评估 */}
                {item.homepageUrl && (
                  <div className={styles.statusRow}>
                    <span className={styles.statusLabel}>
                      {t("oauth.apps.homepageUrl")}
                    </span>
                    <span className={styles.statusValue}>
                      <a href={item.homepageUrl} target="_blank" rel="noreferrer">
                        {item.homepageUrl}
                      </a>
                    </span>
                  </div>
                )}
                {item.privacyPolicyUrl && (
                  <div className={styles.statusRow}>
                    <span className={styles.statusLabel}>
                      {t("oauth.apps.privacyPolicyUrl")}
                    </span>
                    <span className={styles.statusValue}>
                      <a
                        href={item.privacyPolicyUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.privacyPolicyUrl}
                      </a>
                    </span>
                  </div>
                )}
                {item.termsOfServiceUrl && (
                  <div className={styles.statusRow}>
                    <span className={styles.statusLabel}>
                      {t("oauth.apps.termsOfServiceUrl")}
                    </span>
                    <span className={styles.statusValue}>
                      <a
                        href={item.termsOfServiceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.termsOfServiceUrl}
                      </a>
                    </span>
                  </div>
                )}
                {item.dataUsage && (
                  <div className={styles.statusRow}>
                    <span className={styles.statusLabel}>
                      {t("oauth.apps.dataUsage")}
                    </span>
                    <span className={styles.statusValue}>{item.dataUsage}</span>
                  </div>
                )}
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.apps.createdAt")}
                  </span>
                  <span className={styles.statusValue}>
                    {iGM_FormatDateTime(locale, item.createdAt)}
                  </span>
                </div>
                {item.reviewComment && (
                  <div className={styles.statusRow}>
                    <span className={styles.statusLabel}>
                      {t("oauth.apps.reviewComment")}
                    </span>
                    <span className={styles.statusValue}>
                      {item.reviewComment}
                    </span>
                  </div>
                )}

                {/* 审核意见（待审核时输入） */}
                {item.status === "pending" && (
                  <label className={styles.field}>
                    <span className={styles.label}>
                      {t("oauth.admin.comment")}
                      <span className={styles.optional}>
                        {t("developer.apply.optional")}
                      </span>
                    </span>
                    <input
                      className={styles.input}
                      type="text"
                      value={commentMap[item.clientId] ?? ""}
                      maxLength={500}
                      placeholder={t("oauth.admin.commentPlaceholder")}
                      onChange={(event) =>
                        setCommentMap((previous) => ({
                          ...previous,
                          [item.clientId]: event.target.value,
                        }))
                      }
                    />
                  </label>
                )}

                <div className={styles.actionRow}>
                  {item.status === "pending" && (
                    <>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={actingId === item.clientId}
                        onClick={() => iGM_HandleReview(item, "approve")}
                      >
                        {actingId === item.clientId ? (
                          <LoaderCircle size={15} className="igm-spin" />
                        ) : (
                          <CircleCheck size={15} strokeWidth={1.8} />
                        )}
                        {t("oauth.admin.approve")}
                      </button>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        disabled={actingId === item.clientId}
                        onClick={() => iGM_HandleReview(item, "reject")}
                      >
                        <CircleSlash size={15} strokeWidth={1.8} />
                        {t("oauth.admin.reject")}
                      </button>
                    </>
                  )}
                  {item.status === "approved" && (
                    <button
                      type="button"
                      className={styles.ghostButton}
                      disabled={actingId === item.clientId}
                      onClick={() => iGM_HandleToggleStatus(item, true)}
                    >
                      <CircleSlash size={15} strokeWidth={1.8} />
                      {t("oauth.admin.disable")}
                    </button>
                  )}
                  {item.status === "disabled" && (
                    <button
                      type="button"
                      className={styles.ghostButton}
                      disabled={actingId === item.clientId}
                      onClick={() => iGM_HandleToggleStatus(item, false)}
                    >
                      <Play size={15} strokeWidth={1.8} />
                      {t("oauth.admin.enable")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={uiStyles.dangerButton}
                    disabled={actingId === item.clientId}
                    onClick={() => iGM_HandleDelete(item)}
                  >
                    <Trash2 size={15} strokeWidth={1.8} />
                    {t("oauth.admin.delete")}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!loading && !loadFailed && items.length > 0 && (
        <IGM_Pagination
          page={page}
          totalPages={totalPages}
          onChange={(next) => iGM_Load(filter, next)}
        />
      )}
    </div>
  );
}

/** 管理端 OAuth 审核页（须登录，管理人员权限由后端校验） */
export function iGM_AdminOAuthPage() {
  const IGM_AdminOAuthInner = iGM_AdminOAuthInner;
  return (
    <IGM_RequireAuth staff>
      <IGM_AdminOAuthInner />
    </IGM_RequireAuth>
  );
}

/** 模块二十五：开发者分区「应用审核」Tab 内容（无独立页头） */
export function iGM_AdminOAuthPanel() {
  const IGM_AdminOAuthInner = iGM_AdminOAuthInner;
  return <IGM_AdminOAuthInner embedded />;
}

// 导出 //
export default iGM_AdminOAuthPage;
