/**
 * 文件路径：apps/web/src/iGM_Pages/G_Leaderboard/iGM_LeaderboardPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Leaderboard
 * 模块：G_Leaderboard
 * 作用：积分排行榜——按积分总量或周增量排序的用户榜单
 * 内容：排序切换（总量/周增量）、榜单列表（名次、头像、昵称、等级、积分）
 * 说明：纯静态 SSG，数据在客户端经 iGM_PointsClient 调用本地后端
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, Trophy } from "lucide-react";
import {
  iGM_ApiGetLeaderboard,
  type iGM_LeaderboardEntry,
} from "../../iGM_Services/iGM_PointsClient";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Points.module.css";

// 类型定义 //
type iGM_SortMode = "total" | "weekly";

// 核心逻辑 //
/** 排行榜页主体 */
export function iGM_LeaderboardInner() {
  const t = useTranslations();

  const [sort, setSort] = useState<iGM_SortMode>("total");
  const [items, setItems] = useState<iGM_LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  /** 按排序模式加载榜单 */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    iGM_ApiGetLeaderboard(sort, 20)
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
  }, [sort]);

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Trophy size={22} strokeWidth={1.8} />
          </span>
          {t("pages.leaderboard.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.leaderboard.description")}
        </p>
      </header>

      {/* 排序切换 */}
      <div className={uiStyles.toolbar}>
        <button
          type="button"
          className={`${uiStyles.chip} ${sort === "total" ? uiStyles.chipActive : ""}`}
          onClick={() => setSort("total")}
        >
          {t("leaderboard.sortTotal")}
        </button>
        <button
          type="button"
          className={`${uiStyles.chip} ${sort === "weekly" ? uiStyles.chipActive : ""}`}
          onClick={() => setSort("weekly")}
        >
          {t("leaderboard.sortWeekly")}
        </button>
      </div>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("leaderboard.loadFailed")}
        </div>
      ) : items.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("leaderboard.empty")}</div>
      ) : (
        <section className={uiStyles.sectionCard}>
          <div className={styles.recordList}>
            {items.map((entry) => (
              <div key={entry.userId} className={styles.rankRow}>
                <span
                  className={`${styles.rankNum} ${entry.rank <= 3 ? styles.rankTop : ""}`}
                >
                  {entry.rank}
                </span>
                <IGM_Avatar
                  src={entry.avatar}
                  name={entry.displayName || entry.username}
                  size="sm"
                />
                <div className={styles.rankName}>
                  <span className={styles.rankUsername}>
                    {entry.displayName || entry.username}
                  </span>
                  <span className={styles.rankLevel}>
                    {entry.levelName ?? t("leaderboard.levelNone")}
                  </span>
                </div>
                <span className={styles.rankPoints}>
                  {sort === "total" ? entry.totalPoints : entry.weeklyPoints}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** 排行榜页 */
export function iGM_LeaderboardPage() {
  const IGM_LeaderboardInner = iGM_LeaderboardInner;
  return <IGM_LeaderboardInner />;
}

// 导出 //
export default iGM_LeaderboardPage;
