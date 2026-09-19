/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminDashboard/iGM_AdminDashboardPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminDashboard
 * 模块：G_AdminDashboard
 * 作用：管理后台数据概览——用户/内容/举报/签到等关键指标宫格
 * 内容：十个概览指标卡片（moderator 及以上可见），加载与失败状态
 * 说明：纯静态 SSG，数据在客户端经 iGM_AdminClient 调用本地后端
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutDashboard, LoaderCircle } from "lucide-react";
import {
  iGM_ApiAdminOverview,
  type iGM_AdminOverview,
} from "../../iGM_Services/iGM_AdminClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import tileStyles from "../iGM_Points.module.css";
import styles from "../iGM_Admin.module.css";

// 类型定义 //
// （数据类型来自 iGM_AdminClient）

// 核心逻辑 //
/** 概览宫格的条目定义：语言包键 + 数值取值器 */
const iGM_OverviewTiles: { key: string; value: (data: iGM_AdminOverview) => number }[] = [
  { key: "users", value: (data) => data.users },
  { key: "usersToday", value: (data) => data.usersToday },
  { key: "usersSuspended", value: (data) => data.usersSuspended },
  { key: "posts", value: (data) => data.posts },
  { key: "postsToday", value: (data) => data.postsToday },
  { key: "comments", value: (data) => data.comments },
  { key: "resources", value: (data) => data.resources },
  { key: "activities", value: (data) => data.activities },
  { key: "reportsPending", value: (data) => data.reportsPending },
  { key: "checkinsToday", value: (data) => data.checkinsToday },
];

/** 管理后台概览页主体 */
function iGM_DashboardInner() {
  const t = useTranslations();

  const [overview, setOverview] = useState<iGM_AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  /** 加载概览数据 */
  useEffect(() => {
    let cancelled = false;
    iGM_ApiAdminOverview()
      .then((response) => {
        if (cancelled) return;
        if (response.data) setOverview(response.data);
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
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <LayoutDashboard size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminDashboard.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminDashboard.description")}
        </p>
      </header>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed || !overview ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("admin.errors.loadFailed")}
        </div>
      ) : (
        <div className={styles.overviewGrid}>
          {iGM_OverviewTiles.map((tile) => (
            <div key={tile.key} className={tileStyles.statTile}>
              <span className={tileStyles.statLabel}>
                {t(`admin.overview.${tile.key}`)}
              </span>
              <span className={tileStyles.statValue}>{tile.value(overview)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 管理后台概览页（moderator 及以上） */
export function iGM_AdminDashboardPage() {
  const IGM_DashboardInner = iGM_DashboardInner;
  return (
    <IGM_RequireAuth role="moderator">
      <IGM_DashboardInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminDashboardPage;
