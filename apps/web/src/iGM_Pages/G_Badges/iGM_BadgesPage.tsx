/**
 * 文件路径：apps/web/src/iGM_Pages/G_Badges/iGM_BadgesPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Badges
 * 模块：G_Badges
 * 作用：勋章墙——全部勋章的网格展示与获得状态
 * 内容：勋章卡片（图标、名称、描述、达成条件）、
 *       登录用户高亮已获得勋章并展示获得时间、未登录提示
 * 说明：纯静态 SSG，数据在客户端经 iGM_PointsClient 调用本地后端；
 *       勋章名称与描述为后端预设数据，条件文案来自语言包
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, LoaderCircle, Lock } from "lucide-react";
import {
  iGM_ApiListBadges,
  type iGM_Badge,
} from "../../iGM_Services/iGM_PointsClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Points.module.css";

// 类型定义 //
// （数据类型来自 iGM_PointsClient）

// 核心逻辑 //
/** 勋章达成条件文案键（与后端 conditionType 对应） */
const iGM_ConditionKeys = [
  "posts_count",
  "comments_count",
  "resources_count",
  "checkin_days",
  "likes_received",
  "points_total",
] as const;

/** 勋章墙页主体 */
export function iGM_BadgesInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const { status } = iGM_UseAuth();

  const [badges, setBadges] = useState<iGM_Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  /** 加载勋章列表（登录时附带获得状态） */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    iGM_ApiListBadges()
      .then((response) => {
        if (cancelled) return;
        if (response.data) setBadges(response.data.badges);
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
  }, [status]);

  /** 条件文案：已知类型走语言包，未知类型回退原文 */
  function iGM_ConditionText(badge: iGM_Badge): string {
    const known = (iGM_ConditionKeys as readonly string[]).includes(
      badge.conditionType,
    );
    return known
      ? t(`badges.conditions.${badge.conditionType}`, {
          value: badge.conditionValue,
        })
      : badge.conditionType;
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <BadgeCheck size={22} strokeWidth={1.8} />
          </span>
          {t("pages.badges.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.badges.description")}
        </p>
      </header>

      {/* 未登录提示：仍可浏览勋章，但不显示获得状态 */}
      {status === "anonymous" && (
        <div className={styles.loginHint}>{t("badges.loginHint")}</div>
      )}

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("badges.loadFailed")}
        </div>
      ) : (
        <div className={styles.badgeGrid}>
          {badges.map((badge) => (
            <article
              key={badge.id}
              className={[
                styles.badgeCard,
                badge.granted ? styles.badgeCardGranted : styles.badgeCardLocked,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className={styles.badgeIcon}>
                {badge.granted ? (
                  <BadgeCheck size={24} strokeWidth={1.6} />
                ) : (
                  <Lock size={24} strokeWidth={1.6} />
                )}
              </span>
              <h2 className={styles.badgeName}>{badge.name}</h2>
              <p className={styles.badgeDescription}>{badge.description}</p>
              <div className={styles.badgeFooter}>
                <span>{iGM_ConditionText(badge)}</span>
                {badge.granted && badge.grantedAt && (
                  <span className={styles.badgeGrantedTag}>
                    {t("badges.grantedAt", {
                      date: iGM_FormatDate(locale, badge.grantedAt),
                    })}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** 勋章墙页 */
export function iGM_BadgesPage() {
  const IGM_BadgesInner = iGM_BadgesInner;
  return <IGM_BadgesInner />;
}

// 导出 //
export default iGM_BadgesPage;
