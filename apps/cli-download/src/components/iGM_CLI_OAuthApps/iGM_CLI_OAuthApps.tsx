/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_OAuthApps/iGM_CLI_OAuthApps.tsx
 * 所属层：前端 / 组件层
 * 路由：/oauth/apps
 * 模块：iGM_CLI_OAuthApps
 * 作用：开发者侧 OAuth 应用管理——查看已提交应用、重置 client_secret、查看接入日志
 * 内容：应用卡片列表（状态徽标、client_id、类型、描述、scope、回调地址、用途、
 *       联系方式、提交时间、审核意见）、待审核撤回、已通过重置 client_secret
 *       （明文仅本次展示 + 复制）、应用接入日志按页展开
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  LoaderCircle,
  ListChecks,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  iGM_CLI_ApiDeleteOAuthApp,
  iGM_CLI_ApiListMyOAuthApps,
  iGM_CLI_ApiListMyOAuthLogs,
  iGM_CLI_ApiResetOAuthSecret,
  iGM_CLI_ApiRevealOAuthSecret,
  iGM_CLI_ApiWithdrawOAuthApp,
  iGM_CLI_ResolveErrorText,
  type iGM_CLI_OAuthApplication,
  type iGM_CLI_OAuthClientStatus,
  type iGM_CLI_OAuthLogItem,
} from "../../services/iGM_CLI_OAuthClient";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import { iGM_CLI_OAuthShell as IGM_CLI_OAuthShell } from "../iGM_CLI_OAuthShell/iGM_CLI_OAuthShell";
import { iGM_CLI_OAuthGate as IGM_CLI_OAuthGate } from "../iGM_CLI_OAuthShell/iGM_CLI_OAuthGate";
import styles from "../iGM_CLI_OAuthShell/iGM_CLI_OAuth.module.css";

// 类型定义 //
/** 单页日志条数 */
const iGM_CLI_LogPageSize = 10;

/** 日志动作 → 语言包键（未收录的动作直接展示后端机器码，不展示 i18n 键） */
const iGM_CLI_LogActionKeys: Record<string, string> = {
  apply: "apply",
  withdraw: "withdraw",
  "secret.reset": "secretReset",
  "secret.reveal": "secretReveal",
  approve: "approve",
  reject: "reject",
  delete: "delete",
  authorize: "authorize",
  deny: "deny",
  token: "token",
  refresh: "refresh",
  revoke: "revoke",
  "consent.revoke": "consentRevoke",
};

// 核心逻辑 //
/** 时间格式化（固定时区，避免各端渲染差异） */
function iGM_CLI_FormatDateTime(locale: string, value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

/** 状态 → 徽标样式类 */
function iGM_CLI_BadgeClass(status: string): string {
  if (status === "pending") return styles.badgePending;
  if (status === "approved") return styles.badgeApproved;
  if (status === "rejected" || status === "disabled") return styles.badgeRejected;
  return "";
}

/** 应用管理主体（登录守卫内） */
function iGM_CLI_OAuthAppsList() {
  const t = useTranslations();
  const { locale } = iGM_CLI_UseLocale();

  const [items, setItems] = useState<iGM_CLI_OAuthApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  /** 正在提交操作的应用 clientId（防重复点击） */
  const [actingId, setActingId] = useState<string | null>(null);
  /** 重置后仅本次展示的明文密钥（clientId -> secret） */
  const [secretMap, setSecretMap] = useState<Record<string, string>>({});
  /** 已复制标记 */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** 展开日志的应用与数据 */
  const [logClientId, setLogClientId] = useState<string | null>(null);
  const [logItems, setLogItems] = useState<iGM_CLI_OAuthLogItem[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logLoading, setLogLoading] = useState(false);
  /** 模块二十五：已尝试一次性领取密钥的应用（避免重复请求） */
  const revealAttempted = useRef<Set<string>>(new Set());

  /** 读取我的应用列表 */
  const iGM_CLI_Load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    iGM_CLI_ApiListMyOAuthApps()
      .then((response) => {
        if (!cancelled && response.data) {
          const list = response.data.items;
          setItems(list);
          // 模块二十五：申请通过后页面立即一次性领取并展示 client_secret
          for (const app of list) {
            if (
              app.status === "approved" &&
              app.secretRevealable &&
              !revealAttempted.current.has(app.clientId)
            ) {
              revealAttempted.current.add(app.clientId);
              iGM_CLI_ApiRevealOAuthSecret(app.clientId)
                .then((revealResponse) => {
                  if (!cancelled && revealResponse.data) {
                    setSecretMap((previous) => ({
                      ...previous,
                      [app.clientId]: revealResponse.data!.clientSecret,
                    }));
                  }
                })
                .catch(() => {
                  /* 已在他处领取（409）时静默忽略，用户可使用「重置密钥」 */
                });
            }
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => iGM_CLI_Load(), [iGM_CLI_Load]);

  /** 拉取某应用的接入日志 */
  const iGM_CLI_LoadLogs = useCallback((clientId: string, page: number) => {
    setLogLoading(true);
    iGM_CLI_ApiListMyOAuthLogs({ clientId, page, pageSize: iGM_CLI_LogPageSize })
      .then((response) => {
        if (response.data) {
          setLogItems(response.data.items);
          setLogPage(response.data.page);
          setLogTotalPages(response.data.totalPages);
        }
      })
      .catch(() => setLogItems([]))
      .finally(() => setLogLoading(false));
  }, []);

  /** 展开 / 收起日志面板 */
  function iGM_CLI_ToggleLogs(clientId: string) {
    if (logClientId === clientId) {
      setLogClientId(null);
      return;
    }
    setLogClientId(clientId);
    setLogItems([]);
    iGM_CLI_LoadLogs(clientId, 1);
  }

  /** 撤回待审核申请 */
  function iGM_CLI_HandleWithdraw(clientId: string) {
    if (!window.confirm(t("oauth.apps.withdrawConfirm"))) return;
    setErrorText(null);
    setActingId(clientId);
    iGM_CLI_ApiWithdrawOAuthApp(clientId)
      .then(() => iGM_CLI_Load())
      .catch((error) =>
        setErrorText(iGM_CLI_ResolveErrorText(t, error, "oauth.apps.loadFailed")),
      )
      .finally(() => setActingId(null));
  }

  /** 重置 client_secret（明文仅本次展示） */
  function iGM_CLI_HandleReset(clientId: string) {
    if (!window.confirm(t("oauth.apps.resetConfirm"))) return;
    setErrorText(null);
    setActingId(clientId);
    iGM_CLI_ApiResetOAuthSecret(clientId)
      .then((response) => {
        if (response.data) {
          setSecretMap((previous) => ({
            ...previous,
            [clientId]: response.data!.clientSecret,
          }));
        }
        return undefined;
      })
      .catch((error) =>
        setErrorText(iGM_CLI_ResolveErrorText(t, error, "oauth.apps.loadFailed")),
      )
      .finally(() => setActingId(null));
  }

  /** 删除应用（不可恢复：同时撤销该应用的全部授权与令牌，client_id 不可再次使用） */
  function iGM_CLI_HandleDelete(clientId: string) {
    if (!window.confirm(t("oauth.apps.deleteConfirm"))) return;
    setErrorText(null);
    setSuccessText(null);
    setActingId(clientId);
    iGM_CLI_ApiDeleteOAuthApp(clientId)
      .then(() => {
        setItems((current) =>
          current.filter((item) => item.clientId !== clientId),
        );
        setSecretMap((previous) => {
          const next = { ...previous };
          delete next[clientId];
          return next;
        });
        if (logClientId === clientId) setLogClientId(null);
        setSuccessText(t("oauth.messages.deleted"));
      })
      .catch((error) =>
        setErrorText(iGM_CLI_ResolveErrorText(t, error, "oauth.apps.loadFailed")),
      )
      .finally(() => setActingId(null));
  }

  /** 复制文本到剪贴板 */
  async function iGM_CLI_Copy(text: string, clientId: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(clientId);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      /* 剪贴板不可用时静默失败，用户可手动选中复制 */
    }
  }

  if (loading) {
    return (
      <div className={styles.stateBox}>
        <LoaderCircle size={16} className={styles.spinner} aria-hidden />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className={`${styles.alert} ${styles.alertError}`}>
        {t("oauth.apps.loadFailed")}
      </div>
    );
  }

  return (
    <>
      {errorText && (
        <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
      )}
      {successText && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          {successText}
        </div>
      )}

      <div className={styles.actionRow} style={{ marginTop: 16 }}>
        <Link
          href={iGM_CLI_LocalePath("/oauth/apply", locale)}
          className={styles.primaryButton}
        >
          <Plus size={15} strokeWidth={1.8} aria-hidden />
          {t("oauth.apps.newApply")}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className={styles.emptyBox} style={{ marginTop: 16 }}>
          {t("oauth.apps.empty")}
        </div>
      ) : (
        <div className={styles.list} style={{ marginTop: 16 }}>
          {items.map((item) => {
            const status = item.status as iGM_CLI_OAuthClientStatus;
            const plainSecret = secretMap[item.clientId];
            return (
              <section key={item.id} className={styles.statusCard}>
                <div className={styles.appHead}>
                  <h2 className={styles.appName}>{item.name}</h2>
                  <span className={styles.appBadges}>
                    {item.isLocalTest && (
                      <span className={styles.badge}>
                        {t("oauth.apps.localTestTag")}
                      </span>
                    )}
                    <span
                      className={[styles.badge, iGM_CLI_BadgeClass(status)].join(" ")}
                    >
                      {t(`oauth.status.${item.status}`)}
                    </span>
                  </span>
                </div>

                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.apps.typeLabel")}
                  </span>
                  <span className={styles.statusValue}>
                    {t(`oauth.clientTypes.${item.type}`)}
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
                    {t("oauth.apps.scopes")}
                  </span>
                  <span className={styles.statusValue}>
                    {item.scopes.map((scope) => t(`oauth.scopes.${scope}`)).join(" · ")}
                  </span>
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
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>
                    {t("oauth.apps.createdAt")}
                  </span>
                  <span className={styles.statusValue}>
                    {iGM_CLI_FormatDateTime(locale, item.createdAt)}
                  </span>
                </div>
                {item.reviewComment && (
                  <div className={styles.statusRow}>
                    <span className={styles.statusLabel}>
                      {t("oauth.apps.reviewComment")}
                    </span>
                    <span className={styles.statusValue}>{item.reviewComment}</span>
                  </div>
                )}

                {/* 重置后仅本次展示的明文密钥 */}
                {plainSecret && (
                  <>
                    <div className={styles.note} style={{ marginTop: 12 }}>
                      <AlertTriangle
                        size={15}
                        strokeWidth={1.8}
                        className={styles.noteIcon}
                        aria-hidden
                      />
                      <span>{t("oauth.apps.secretOnce")}</span>
                    </div>
                    <div className={styles.keyRow}>
                      <span className={styles.keyBox}>{plainSecret}</span>
                      <button
                        type="button"
                        className={styles.copyButton}
                        onClick={() => iGM_CLI_Copy(plainSecret, item.clientId)}
                      >
                        {copiedId === item.clientId ? (
                          <Check size={13} strokeWidth={1.8} aria-hidden />
                        ) : (
                          <Copy size={13} strokeWidth={1.8} aria-hidden />
                        )}
                        {copiedId === item.clientId
                          ? t("oauth.apps.copied")
                          : t("oauth.apps.copy")}
                      </button>
                    </div>
                  </>
                )}

                <div className={styles.actionRow} style={{ marginTop: 14 }}>
                  {status === "pending" && (
                    <button
                      type="button"
                      className={styles.ghostButton}
                      disabled={actingId === item.clientId}
                      onClick={() => iGM_CLI_HandleWithdraw(item.clientId)}
                    >
                      <Undo2 size={15} strokeWidth={1.8} aria-hidden />
                      {t("oauth.apps.withdraw")}
                    </button>
                  )}
                  {status === "approved" && (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={actingId === item.clientId}
                      onClick={() => iGM_CLI_HandleReset(item.clientId)}
                    >
                      {actingId === item.clientId ? (
                        <LoaderCircle
                          size={15}
                          className={styles.spinner}
                          aria-hidden
                        />
                      ) : (
                        <RotateCcw size={15} strokeWidth={1.8} aria-hidden />
                      )}
                      {t("oauth.apps.resetSecret")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={() => iGM_CLI_ToggleLogs(item.clientId)}
                  >
                    <ListChecks size={15} strokeWidth={1.8} aria-hidden />
                    {logClientId === item.clientId
                      ? t("oauth.apps.hideLogs")
                      : t("oauth.apps.viewLogs")}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={actingId === item.clientId}
                    onClick={() => iGM_CLI_HandleDelete(item.clientId)}
                  >
                    {actingId === item.clientId ? (
                      <LoaderCircle
                        size={15}
                        className={styles.spinner}
                        aria-hidden
                      />
                    ) : (
                      <Trash2 size={15} strokeWidth={1.8} aria-hidden />
                    )}
                    {t("oauth.apps.delete")}
                  </button>
                </div>

                {/* 接入日志 */}
                {logClientId === item.clientId && (
                  <div className={styles.logBox}>
                    {logLoading ? (
                      <div className={styles.stateBox}>
                        <LoaderCircle
                          size={15}
                          className={styles.spinner}
                          aria-hidden
                        />
                      </div>
                    ) : logItems.length === 0 ? (
                      <p className={styles.statusText}>
                        {t("oauth.apps.logsEmpty")}
                      </p>
                    ) : (
                      <>
                        <p className={styles.statusLabel}>
                          {t("oauth.apps.logsTitle")}
                        </p>
                        {logItems.map((log) => (
                          <div key={log.id} className={styles.logRow}>
                            <span className={styles.logAction}>
                              {iGM_CLI_LogActionKeys[log.action]
                                ? t(
                                    `oauth.logActions.${iGM_CLI_LogActionKeys[log.action]}`,
                                  )
                                : log.action}
                            </span>
                            <span>{log.detail ?? ""}</span>
                            <span>·</span>
                            <span>{iGM_CLI_FormatDateTime(locale, log.createdAt)}</span>
                          </div>
                        ))}
                        {logTotalPages > 1 && (
                          <div className={styles.pager}>
                            <button
                              type="button"
                              className={styles.pagerButton}
                              disabled={logPage <= 1}
                              onClick={() =>
                                iGM_CLI_LoadLogs(item.clientId, logPage - 1)
                              }
                            >
                              <ChevronLeft size={14} aria-hidden />
                            </button>
                            <span className={styles.pagerText}>
                              {logPage} / {logTotalPages}
                            </span>
                            <button
                              type="button"
                              className={styles.pagerButton}
                              disabled={logPage >= logTotalPages}
                              onClick={() =>
                                iGM_CLI_LoadLogs(item.clientId, logPage + 1)
                              }
                            >
                              <ChevronRight size={14} aria-hidden />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

/** OAuth 应用管理页（须登录） */
export function iGM_CLI_OAuthApps() {
  const t = useTranslations();
  const IGM_CLI_OAuthAppsList = iGM_CLI_OAuthAppsList;

  return (
    <IGM_CLI_OAuthShell active="apps">
      <p className={styles.pageDesc}>{t("oauth.apps.intro")}</p>
      <div className={styles.body}>
        <IGM_CLI_OAuthGate>
          <IGM_CLI_OAuthAppsList />
        </IGM_CLI_OAuthGate>
      </div>
    </IGM_CLI_OAuthShell>
  );
}

// 导出 //
export default iGM_CLI_OAuthApps;
