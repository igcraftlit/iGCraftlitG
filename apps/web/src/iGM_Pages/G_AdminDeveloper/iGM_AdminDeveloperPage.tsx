/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminDeveloper/iGM_AdminDeveloperPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminDeveloper（G_Admin_Developer 开发者分区）
 * 模块：G_AdminDeveloper
 * 作用：管理后台独立「开发者」分区
 * 内容：① 开发者申请审核（待审 / 已通过 / 已拒绝，复用申请审核页）
 *       ② OAuth 应用审核（通过 / 禁用 / 删除，复用应用审核页）
 *       ③ 开发者账号列表（用户名 / iGMUid / 联系方式 / 申请时间）
 *       ④ 调用量监测（API / SDK / 应用通道，支持 7/30/90 天筛选，
 *          通道可扩展，后续新增开发者项目自动纳入聚合）
 * 说明：纯静态 SSG；仅管理员与受信任组织负责人可访问，后端 iGM_RequireStaff 强制
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Code2,
  KeySquare,
  LoaderCircle,
  UserCheck,
  Users,
} from "lucide-react";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_AdminTabs as IGM_AdminTabs } from "../../iGM_Components/iGM_AdminPanel/iGM_AdminTabs";
import { iGM_DeveloperReviewPanel as IGM_DeveloperReviewPanel } from "../G_DeveloperReview/iGM_DeveloperReviewPage";
import { iGM_AdminOAuthPanel as IGM_AdminOAuthPanel } from "../G_AdminOAuth/iGM_AdminOAuthPage";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import {
  iGM_ApiAdminDeveloperAccounts,
  iGM_ApiAdminDeveloperCallStats,
  type iGM_DeveloperAccount,
  type iGM_DeveloperCallStats,
} from "../../iGM_Services/iGM_AdminClient";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import styles from "./iGM_AdminDeveloperPage.module.css";

// 类型定义 //
/** 调用量监测可选时间范围 */
type iGM_StatsRange = 7 | 30 | 90;

// 核心逻辑 //
/** 开发者账号列表 Tab 主体 */
function iGM_DeveloperAccountsInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();

  const [items, setItems] = useState<iGM_DeveloperAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    iGM_ApiAdminDeveloperAccounts()
      .then((response) => {
        if (cancelled) return;
        if (response.data) setItems(response.data.items);
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

  return (
    <div className={pageStyles.page}>
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
        <div className={uiStyles.stateBox}>{t("admin.developer.accounts.empty")}</div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={tileStyles.recordList}>
            {items.map((account) => (
              <div key={account.applicationId} className={tileStyles.recordRow}>
                <div className={tileStyles.recordMain}>
                  <span className={tileStyles.recordAction}>
                    {account.displayName ?? account.username}
                    <span className={styles.metaSub}>@{account.username}</span>
                  </span>
                  <span className={tileStyles.recordDesc}>
                    {t("admin.developer.accounts.project")}：{account.projectName}
                  </span>
                  <span className={styles.metaLine}>
                    {t("admin.developer.accounts.uid")}：{account.uid}
                    {" · "}
                    {t("admin.developer.accounts.contact")}：{account.contact}
                  </span>
                </div>
                <div className={styles.appliedAt}>
                  <UserCheck size={13} strokeWidth={1.8} />
                  {t("admin.developer.accounts.appliedAt")}
                  {": "}
                  {iGM_FormatDateTime(locale, account.appliedAt)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** 调用量监测 Tab 主体：时间范围筛选 + 通道汇总 + 按日条形 + 应用 Top */
function iGM_DeveloperCallStatsInner() {
  const t = useTranslations();

  const [range, setRange] = useState<iGM_StatsRange>(7);
  const [stats, setStats] = useState<iGM_DeveloperCallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const iGM_Load = useCallback((days: iGM_StatsRange) => {
    setLoading(true);
    setLoadFailed(false);
    iGM_ApiAdminDeveloperCallStats(days)
      .then((response) => {
        if (response.data) setStats(response.data);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    iGM_Load(7);
  }, [iGM_Load]);

  /** 通道名称：已知通道走语言包，未来扩展通道原样展示键名 */
  function iGM_ChannelLabel(channel: string): string {
    const known = ["api", "sdk", "app"];
    return known.includes(channel)
      ? t(`admin.developer.callStats.channel.${channel}`)
      : channel;
  }

  /** 按日条形图的最大值（用于换算条宽） */
  const maxDaily = stats
    ? Math.max(
        1,
        ...stats.daily.map((point) =>
          Object.entries(point).reduce(
            (sum, [key, value]) =>
              key === "date" ? sum : sum + (typeof value === "number" ? value : 0),
            0,
          ),
        ),
      )
    : 1;
  const channelKeys = stats ? Object.keys(stats.channels) : [];

  return (
    <div className={pageStyles.page}>
      {/* 时间范围筛选 */}
      <div className={uiStyles.chips}>
        {([7, 30, 90] as iGM_StatsRange[]).map((days) => (
          <button
            key={days}
            type="button"
            className={`${uiStyles.chip} ${range === days ? uiStyles.chipActive : ""}`}
            onClick={() => {
              setRange(days);
              iGM_Load(days);
            }}
          >
            {t(`admin.developer.callStats.range${days}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed || !stats ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("admin.errors.loadFailed")}
        </div>
      ) : (
        <>
          {/* 总量 + 分通道调用量 */}
          <div className={styles.statsGrid}>
            <div className={tileStyles.statTile}>
              <span className={tileStyles.statLabel}>
                <BarChart3 size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                {t("admin.developer.callStats.total")}
              </span>
              <span className={tileStyles.statValue}>{stats.total}</span>
            </div>
            {channelKeys.map((channel) => (
              <div key={channel} className={tileStyles.statTile}>
                <span className={tileStyles.statLabel}>
                  {iGM_ChannelLabel(channel)}
                </span>
                <span className={tileStyles.statValue}>
                  {stats.channels[channel] ?? 0}
                </span>
              </div>
            ))}
          </div>

          {/* 按日调用量条形（API / SDK / 应用通道配色区分，可随通道扩展） */}
          <section className={uiStyles.sectionCard}>
            <h2 className={uiStyles.sectionTitle}>
              <span className={uiStyles.sectionTitleIcon}>
                <BarChart3 size={16} />
              </span>
              {t("admin.developer.callStats.dailyTitle")}
            </h2>
            <div className={styles.dailyList}>
              {stats.daily.map((point) => {
                const dayTotal = channelKeys.reduce(
                  (sum, key) => sum + (typeof point[key] === "number" ? (point[key] as number) : 0),
                  0,
                );
                return (
                  <div key={point.date as string} className={styles.dailyRow}>
                    <span className={styles.dailyDate}>{point.date as string}</span>
                    <span className={styles.dailyTrack}>
                      {channelKeys.map((channel, index) => {
                        const value = typeof point[channel] === "number" ? (point[channel] as number) : 0;
                        if (value === 0) return null;
                        return (
                          <span
                            key={channel}
                            className={styles[`dailyBar${index % 3}`]}
                            style={{ width: `${(value / maxDaily) * 100}%` }}
                            title={`${iGM_ChannelLabel(channel)}：${value}`}
                          />
                        );
                      })}
                    </span>
                    <span className={styles.dailyTotal}>{dayTotal}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 应用调用量 Top 20 */}
          <section className={uiStyles.sectionCard}>
            <h2 className={uiStyles.sectionTitle}>
              <span className={uiStyles.sectionTitleIcon}>
                <KeySquare size={16} />
              </span>
              {t("admin.developer.callStats.topClients")}
            </h2>
            {stats.topClients.length === 0 ? (
              <div className={uiStyles.stateBox}>
                {t("admin.developer.callStats.topClientsEmpty")}
              </div>
            ) : (
              <div className={tileStyles.recordList}>
                {stats.topClients.map((client) => (
                  <div key={client.clientId} className={tileStyles.recordRow}>
                    <div className={tileStyles.recordMain}>
                      <span className={tileStyles.recordAction}>{client.clientId}</span>
                    </div>
                    <span className={styles.clientCount}>{client.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** 开发者分区主体：申请审核 / 应用审核 / 开发者账号 / 调用量监测 */
function iGM_AdminDeveloperInner() {
  const t = useTranslations();
  // JSX 组件标签须大写开头（同文件局部组件大写别名）
  const IGM_DeveloperAccountsInner = iGM_DeveloperAccountsInner;
  const IGM_DeveloperCallStatsInner = iGM_DeveloperCallStatsInner;

  return (
    <div className={pageStyles.page}>
      {/* 统一页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Code2 size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminDeveloper.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminDeveloper.description")}
        </p>
      </header>

      <IGM_AdminTabs
        tabs={[
          {
            key: "applications",
            label: t("admin.panel.tabs.devApplications"),
            icon: UserCheck,
            content: <IGM_DeveloperReviewPanel />,
          },
          {
            key: "appReview",
            label: t("admin.panel.tabs.appReview"),
            icon: KeySquare,
            content: <IGM_AdminOAuthPanel />,
          },
          {
            key: "accounts",
            label: t("admin.panel.tabs.devAccounts"),
            icon: Users,
            content: <IGM_DeveloperAccountsInner />,
          },
          {
            key: "callStats",
            label: t("admin.panel.tabs.callStats"),
            icon: BarChart3,
            content: <IGM_DeveloperCallStatsInner />,
          },
        ]}
      />
    </div>
  );
}

/** 开发者分区（管理员 + 受信任组织负责人，后端强制） */
export function iGM_AdminDeveloperPage() {
  const IGM_AdminDeveloperInner = iGM_AdminDeveloperInner;
  return (
    <IGM_RequireAuth staff>
      <IGM_AdminDeveloperInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminDeveloperPage;
