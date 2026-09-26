/**
 * 文件路径：apps/web/src/iGM_Pages/G_StatsDetail/iGM_StatsDetailPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_StatsDetail
 * 模块：G_StatsDetail
 * 作用：数据详情页——按时间范围查看用户增长、发帖量、评论量、
 *       活跃度、热门内容、资源下载排行、活动参与统计
 * 内容：时间范围切换（7/30/90 天）、四个趋势图、完整排行榜、活动参与表
 * 说明：仅 moderator 及以上可见；数据经 iGM_StatsClient 获取，
 *       图表经 next/dynamic ssr:false 延迟加载
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import {
  Activity,
  CalendarDays,
  ChartLine,
  Download,
  FileText,
  LoaderCircle,
  MessageSquare,
  Users,
} from "lucide-react";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import {
  iGM_ApiStatsActivities,
  iGM_ApiStatsLeaderboards,
  iGM_ApiStatsTrend,
  type iGM_StatsActivities,
  type iGM_StatsLeaderboards,
  type iGM_StatsMetric,
  type iGM_StatsTrendPoint,
} from "../../iGM_Services/iGM_StatsClient";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import dashStyles from "../G_Dashboard/iGM_DashboardPage.module.css";
import styles from "./iGM_StatsDetailPage.module.css";

// 类型定义 //
/** 时间范围 */
type iGM_Range = "7d" | "30d" | "90d";

/** 趋势图配置 */
interface iGM_TrendSection {
  key: string;
  metric: iGM_StatsMetric;
  icon: typeof Users;
  chart: "line" | "bar";
}

// 核心逻辑 //
/** 动态加载图表（recharts 依赖浏览器环境，禁止 SSR） */
const IGM_LineChart = dynamic(
  () =>
    import("../../iGM_Components/iGM_StatsCharts/iGM_StatsCharts").then(
      (mod) => mod.iGM_StatsLineChart,
    ),
  { ssr: false },
);
const IGM_BarChart = dynamic(
  () =>
    import("../../iGM_Components/iGM_StatsCharts/iGM_StatsCharts").then(
      (mod) => mod.iGM_StatsBarChart,
    ),
  { ssr: false },
);

/** 四个趋势区配置 */
const iGM_TrendSections: iGM_TrendSection[] = [
  { key: "userGrowth", metric: "users", icon: Users, chart: "line" },
  { key: "postVolume", metric: "posts", icon: FileText, chart: "bar" },
  { key: "commentVolume", metric: "comments", icon: MessageSquare, chart: "line" },
  { key: "activity", metric: "activity", icon: Activity, chart: "line" },
];

/** 可选时间范围 */
const iGM_Ranges: iGM_Range[] = ["7d", "30d", "90d"];

/** 详情页主体 */
function iGM_StatsDetailInner() {
  const t = useTranslations();

  const [range, setRange] = useState<iGM_Range>("7d");
  const [trends, setTrends] = useState<Record<string, iGM_StatsTrendPoint[]>>({});
  const [leaderboards, setLeaderboards] = useState<iGM_StatsLeaderboards | null>(null);
  const [activities, setActivities] = useState<iGM_StatsActivities | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  /** 按范围加载全部数据 */
  const iGM_LoadAll = useCallback((nextRange: iGM_Range) => {
    setLoading(true);
    setLoadFailed(false);

    Promise.all([
      iGM_ApiStatsTrend("users", nextRange),
      iGM_ApiStatsTrend("posts", nextRange),
      iGM_ApiStatsTrend("comments", nextRange),
      iGM_ApiStatsTrend("activity", nextRange),
      iGM_ApiStatsLeaderboards(nextRange),
      iGM_ApiStatsActivities(nextRange),
    ])
      .then(([tu, tp, tc, ta, lb, act]) => {
        const nextTrends: Record<string, iGM_StatsTrendPoint[]> = {};
        if (tu.data) nextTrends.users = tu.data.series;
        if (tp.data) nextTrends.posts = tp.data.series;
        if (tc.data) nextTrends.comments = tc.data.series;
        if (ta.data) nextTrends.activity = ta.data.series;
        setTrends(nextTrends);
        if (lb.data) setLeaderboards(lb.data);
        if (act.data) setActivities(act.data);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    iGM_LoadAll(range);
  }, [range, iGM_LoadAll]);

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <ChartLine size={22} strokeWidth={1.8} />
          </span>
          {t("pages.statsDetail.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.statsDetail.description")}
        </p>
      </header>

      {/* 时间范围切换 */}
      <div className={uiStyles.chips}>
        {iGM_Ranges.map((item) => (
          <button
            key={item}
            type="button"
            className={`${uiStyles.chip} ${range === item ? uiStyles.chipActive : ""}`}
            onClick={() => setRange(item)}
          >
            {t(`stats.ranges.${item}`)}
          </button>
        ))}
      </div>

      {loadFailed && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("admin.errors.loadFailed")}
        </div>
      )}

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : (
        <>
          {/* 趋势图表 */}
          <div className={styles.trendGrid}>
            {iGM_TrendSections.map((section) => {
              const Icon = section.icon;
              const series = trends[section.metric] ?? [];
              const chartName = t(`stats.charts.${section.metric}`);
              return (
                <section key={section.key} className={uiStyles.sectionCard}>
                  <h2 className={uiStyles.sectionTitle}>
                    <span className={uiStyles.sectionTitleIcon}>
                      <Icon size={16} />
                    </span>
                    {t(`stats.sections.${section.key}`)}
                  </h2>
                  {section.chart === "bar" ? (
                    <IGM_BarChart data={series} dataKey="value" name={chartName} />
                  ) : (
                    <IGM_LineChart data={series} dataKey="value" name={chartName} />
                  )}
                </section>
              );
            })}
          </div>

          {/* 排行榜 */}
          {leaderboards && (
            <div className={dashStyles.leaderboardGrid}>
              {/* 热门帖子 */}
              <section className={uiStyles.sectionCard}>
                <h2 className={uiStyles.sectionTitle}>
                  <span className={uiStyles.sectionTitleIcon}>
                    <FileText size={16} />
                  </span>
                  {t("dashboard.leaderboards.hotPosts")}
                </h2>
                <div className={dashStyles.rankList}>
                  {leaderboards.hotPosts.length === 0 ? (
                    <div className={dashStyles.emptyRank}>{t("dashboard.noData")}</div>
                  ) : (
                    leaderboards.hotPosts.map((item, index) => (
                      <div key={item.id} className={dashStyles.rankRow}>
                        <span
                          className={`${dashStyles.rankNum} ${index < 3 ? dashStyles.rankTop : ""}`}
                        >
                          {index + 1}
                        </span>
                        <div className={dashStyles.rankInfo}>
                          <div className={dashStyles.rankTitle}>{item.title}</div>
                          <div className={dashStyles.rankMeta}>
                            {item.authorName} · {t("dashboard.leaderboards.likes")}{" "}
                            {item.likeCount} · {t("dashboard.leaderboards.comments")}{" "}
                            {item.commentCount}
                          </div>
                        </div>
                        <span className={dashStyles.rankScore}>{item.score}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* 热门资源 */}
              <section className={uiStyles.sectionCard}>
                <h2 className={uiStyles.sectionTitle}>
                  <span className={uiStyles.sectionTitleIcon}>
                    <Download size={16} />
                  </span>
                  {t("dashboard.leaderboards.hotResources")}
                </h2>
                <div className={dashStyles.rankList}>
                  {leaderboards.hotResources.length === 0 ? (
                    <div className={dashStyles.emptyRank}>{t("dashboard.noData")}</div>
                  ) : (
                    leaderboards.hotResources.map((item, index) => (
                      <div key={item.id} className={dashStyles.rankRow}>
                        <span
                          className={`${dashStyles.rankNum} ${index < 3 ? dashStyles.rankTop : ""}`}
                        >
                          {index + 1}
                        </span>
                        <div className={dashStyles.rankInfo}>
                          <div className={dashStyles.rankTitle}>{item.title}</div>
                          <div className={dashStyles.rankMeta}>{item.uploaderName}</div>
                        </div>
                        <span className={dashStyles.rankScore}>{item.downloadCount}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* 活跃用户 */}
              <section className={uiStyles.sectionCard}>
                <h2 className={uiStyles.sectionTitle}>
                  <span className={uiStyles.sectionTitleIcon}>
                    <Users size={16} />
                  </span>
                  {t("dashboard.leaderboards.activeUsers")}
                </h2>
                <div className={dashStyles.rankList}>
                  {leaderboards.activeUsers.length === 0 ? (
                    <div className={dashStyles.emptyRank}>{t("dashboard.noData")}</div>
                  ) : (
                    leaderboards.activeUsers.map((item, index) => (
                      <div key={item.userId} className={dashStyles.rankRow}>
                        <span
                          className={`${dashStyles.rankNum} ${index < 3 ? dashStyles.rankTop : ""}`}
                        >
                          {index + 1}
                        </span>
                        <IGM_Avatar
                          src={item.avatar}
                          name={item.displayName ?? item.username}
                          size="sm"
                        />
                        <div className={dashStyles.rankInfo}>
                          <div className={dashStyles.rankTitle}>
                            {item.displayName ?? item.username}
                            {item.verifiedOrg && (
                              <span className={dashStyles.verifiedTag}>
                                {item.verifiedOrg.name}
                              </span>
                            )}
                          </div>
                          <div className={dashStyles.rankMeta}>@{item.username}</div>
                        </div>
                        <span className={dashStyles.rankScore}>{item.actionCount}</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}

          {/* 活动参与统计 */}
          {activities && (
            <section className={uiStyles.sectionCard}>
              <h2 className={uiStyles.sectionTitle}>
                <span className={uiStyles.sectionTitleIcon}>
                  <CalendarDays size={16} />
                </span>
                {t("stats.activities.title")}
              </h2>
              <div className={styles.activitySummary}>
                <span>
                  {t("stats.activities.totalActivities")}: {activities.totalActivities}
                </span>
                <span>
                  {t("stats.activities.totalRegistrations")}: {activities.totalRegistrations}
                </span>
              </div>
              {activities.items.length === 0 ? (
                <div className={dashStyles.emptyRank}>{t("dashboard.noData")}</div>
              ) : (
                <div className={styles.activityTableWrap}>
                  <table className={styles.activityTable}>
                    <thead>
                      <tr>
                        <th>{t("stats.activities.colTitle")}</th>
                        <th>{t("stats.activities.colStatus")}</th>
                        <th>{t("stats.activities.colStartTime")}</th>
                        <th>{t("stats.activities.colRegistrations")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.items.map((item) => {
                        // 活动状态仅 draft/open/closed 三种，复用 activity.statusLabel 文案
                        const statusKey = ["draft", "open", "closed"].includes(item.status)
                          ? item.status
                          : null;
                        return (
                          <tr key={item.id}>
                            <td className={styles.activityTitle}>{item.title}</td>
                            <td>
                              <span className={`${uiStyles.badge} ${uiStyles.badgeOpen}`}>
                                {statusKey
                                  ? t(`activity.statusLabel.${statusKey}`)
                                  : item.status}
                              </span>
                            </td>
                            <td className={styles.activityTime}>
                              {item.startTime ? item.startTime.slice(0, 10) : "-"}
                            </td>
                            <td className={styles.activityCount}>{item.registrationCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 数据详情页（moderator 及以上） */
export function iGM_StatsDetailPage() {
  // JSX 要求组件名大写开头，内部函数保留 iGM_ 前缀命名
  const IGM_StatsDetailInner = iGM_StatsDetailInner;
  return (
    <IGM_RequireAuth role="moderator">
      <IGM_StatsDetailInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_StatsDetailPage;
