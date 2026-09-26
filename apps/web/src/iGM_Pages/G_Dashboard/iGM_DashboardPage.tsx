/**
 * 文件路径：apps/web/src/iGM_Pages/G_Dashboard/iGM_DashboardPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Dashboard
 * 模块：G_Dashboard
 * 作用：运营看板——核心数据指标与趋势图表
 * 内容：指标宫格、用户增长折线图、发帖量柱状图、评论量折线图、
 *       热门帖子/热门资源/活跃用户 Top 10
 * 说明：仅 moderator 及以上可见；数据经 iGM_StatsClient 获取，
 *       图表经 next/dynamic ssr:false 延迟加载
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import {
  Activity,
  ChartColumn,
  Download,
  FileText,
  LoaderCircle,
  MessageSquare,
  Users,
} from "lucide-react";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import {
  iGM_ApiStatsLeaderboards,
  iGM_ApiStatsOverview,
  iGM_ApiStatsTrend,
  type iGM_StatsLeaderboards,
  type iGM_StatsOverview,
  type iGM_StatsTrendPoint,
} from "../../iGM_Services/iGM_StatsClient";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import styles from "./iGM_DashboardPage.module.css";

// 类型定义 //
// （数据类型来自 iGM_StatsClient）

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

/** 指标宫格条目 */
const iGM_OverviewTiles: {
  key: string;
  icon: typeof Users;
  value: (data: iGM_StatsOverview) => number;
}[] = [
  { key: "totalUsers", icon: Users, value: (d) => d.totalUsers },
  { key: "newUsersToday", icon: Users, value: (d) => d.newUsersToday },
  { key: "activeUsersDaily", icon: Activity, value: (d) => d.activeUsersDaily },
  { key: "activeUsersWeekly", icon: Activity, value: (d) => d.activeUsersWeekly },
  { key: "activeUsersMonthly", icon: Activity, value: (d) => d.activeUsersMonthly },
  { key: "totalPosts", icon: FileText, value: (d) => d.totalPosts },
  { key: "postsToday", icon: FileText, value: (d) => d.postsToday },
  { key: "totalComments", icon: MessageSquare, value: (d) => d.totalComments },
  { key: "commentsToday", icon: MessageSquare, value: (d) => d.commentsToday },
  { key: "totalLikes", icon: Activity, value: (d) => d.totalLikes },
  { key: "totalResources", icon: Download, value: (d) => d.totalResources },
  { key: "totalActivities", icon: Activity, value: (d) => d.totalActivities },
  { key: "totalActivityRegistrations", icon: Activity, value: (d) => d.totalActivityRegistrations },
  { key: "totalResourceDownloads", icon: Download, value: (d) => d.totalResourceDownloads },
  { key: "onlineUsers", icon: Users, value: (d) => d.onlineUsers },
];

/** 看板主体 */
function iGM_DashboardInner() {
  const t = useTranslations();

  const [overview, setOverview] = useState<iGM_StatsOverview | null>(null);
  const [trendUsers, setTrendUsers] = useState<iGM_StatsTrendPoint[]>([]);
  const [trendPosts, setTrendPosts] = useState<iGM_StatsTrendPoint[]>([]);
  const [trendComments, setTrendComments] = useState<iGM_StatsTrendPoint[]>([]);
  const [leaderboards, setLeaderboards] = useState<iGM_StatsLeaderboards | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      iGM_ApiStatsOverview(),
      iGM_ApiStatsTrend("users", "7d"),
      iGM_ApiStatsTrend("posts", "7d"),
      iGM_ApiStatsTrend("comments", "7d"),
      iGM_ApiStatsLeaderboards("7d"),
    ])
      .then(([ov, tu, tp, tc, lb]) => {
        if (cancelled) return;
        if (ov.data) setOverview(ov.data.overview);
        if (tu.data) setTrendUsers(tu.data.series);
        if (tp.data) setTrendPosts(tp.data.series);
        if (tc.data) setTrendComments(tc.data.series);
        if (lb.data) setLeaderboards(lb.data);
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

  if (loading) {
    return (
      <div className={uiStyles.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("community.state.loading")}
      </div>
    );
  }

  if (loadFailed || !overview) {
    return (
      <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
        {t("admin.errors.loadFailed")}
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <ChartColumn size={22} strokeWidth={1.8} />
          </span>
          {t("pages.dashboard.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.dashboard.description")}
        </p>
      </header>

      {/* 指标宫格 */}
      <div className={styles.metricsGrid}>
        {iGM_OverviewTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.key} className={tileStyles.statTile}>
              <span className={tileStyles.statLabel}>
                <Icon size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                {t(`dashboard.metrics.${tile.key}`)}
              </span>
              <span className={tileStyles.statValue}>{tile.value(overview)}</span>
            </div>
          );
        })}
      </div>

      {/* 趋势图表 */}
      <div className={styles.chartGrid}>
        <section className={uiStyles.sectionCard}>
          <h2 className={uiStyles.sectionTitle}>
            <span className={uiStyles.sectionTitleIcon}>
              <Users size={16} />
            </span>
            {t("dashboard.charts.userGrowth")}
          </h2>
          <IGM_LineChart
            data={trendUsers}
            dataKey="value"
            name={t("dashboard.charts.newUsers")}
          />
        </section>

        <section className={uiStyles.sectionCard}>
          <h2 className={uiStyles.sectionTitle}>
            <span className={uiStyles.sectionTitleIcon}>
              <FileText size={16} />
            </span>
            {t("dashboard.charts.postVolume")}
          </h2>
          <IGM_BarChart
            data={trendPosts}
            dataKey="value"
            name={t("dashboard.charts.posts")}
          />
        </section>

        <section className={uiStyles.sectionCard}>
          <h2 className={uiStyles.sectionTitle}>
            <span className={uiStyles.sectionTitleIcon}>
              <MessageSquare size={16} />
            </span>
            {t("dashboard.charts.commentVolume")}
          </h2>
          <IGM_LineChart
            data={trendComments}
            dataKey="value"
            name={t("dashboard.charts.comments")}
          />
        </section>
      </div>

      {/* 排行榜 */}
      {leaderboards && (
        <div className={styles.leaderboardGrid}>
          {/* 热门帖子 */}
          <section className={uiStyles.sectionCard}>
            <h2 className={uiStyles.sectionTitle}>
              <span className={uiStyles.sectionTitleIcon}>
                <FileText size={16} />
              </span>
              {t("dashboard.leaderboards.hotPosts")}
            </h2>
            <div className={styles.rankList}>
              {leaderboards.hotPosts.length === 0 ? (
                <div className={styles.emptyRank}>{t("dashboard.noData")}</div>
              ) : (
                leaderboards.hotPosts.map((item, index) => (
                  <div key={item.id} className={styles.rankRow}>
                    <span className={`${styles.rankNum} ${index < 3 ? styles.rankTop : ""}`}>
                      {index + 1}
                    </span>
                    <div className={styles.rankInfo}>
                      <div className={styles.rankTitle}>{item.title}</div>
                      <div className={styles.rankMeta}>
                        {item.authorName} · {t("dashboard.leaderboards.likes")} {item.likeCount} ·{" "}
                        {t("dashboard.leaderboards.comments")} {item.commentCount}
                      </div>
                    </div>
                    <span className={styles.rankScore}>{item.score}</span>
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
            <div className={styles.rankList}>
              {leaderboards.hotResources.length === 0 ? (
                <div className={styles.emptyRank}>{t("dashboard.noData")}</div>
              ) : (
                leaderboards.hotResources.map((item, index) => (
                  <div key={item.id} className={styles.rankRow}>
                    <span className={`${styles.rankNum} ${index < 3 ? styles.rankTop : ""}`}>
                      {index + 1}
                    </span>
                    <div className={styles.rankInfo}>
                      <div className={styles.rankTitle}>{item.title}</div>
                      <div className={styles.rankMeta}>{item.uploaderName}</div>
                    </div>
                    <span className={styles.rankScore}>{item.downloadCount}</span>
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
            <div className={styles.rankList}>
              {leaderboards.activeUsers.length === 0 ? (
                <div className={styles.emptyRank}>{t("dashboard.noData")}</div>
              ) : (
                leaderboards.activeUsers.map((item, index) => (
                  <div key={item.userId} className={styles.rankRow}>
                    <span className={`${styles.rankNum} ${index < 3 ? styles.rankTop : ""}`}>
                      {index + 1}
                    </span>
                    <IGM_Avatar
                      src={item.avatar}
                      name={item.displayName ?? item.username}
                      size="sm"
                    />
                    <div className={styles.rankInfo}>
                      <div className={styles.rankTitle}>
                        {item.displayName ?? item.username}
                        {item.verifiedOrg && (
                          <span className={styles.verifiedTag}>{item.verifiedOrg.name}</span>
                        )}
                      </div>
                      <div className={styles.rankMeta}>@{item.username}</div>
                    </div>
                    <span className={styles.rankScore}>{item.actionCount}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/** 运营看板（moderator 及以上） */
export function iGM_DashboardPage() {
  // JSX 要求组件名大写开头，内部函数保留 iGM_ 前缀命名
  const IGM_DashboardInner = iGM_DashboardInner;
  return (
    <IGM_RequireAuth role="moderator">
      <IGM_DashboardInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_DashboardPage;
