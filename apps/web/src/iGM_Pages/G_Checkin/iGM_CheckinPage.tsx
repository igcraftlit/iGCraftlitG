/**
 * 文件路径：apps/web/src/iGM_Pages/G_Checkin/iGM_CheckinPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Checkin
 * 模块：G_Checkin
 * 作用：每日签到——签到面板、连续天数与本月签到日历
 * 内容：签到按钮（已签禁用）、今日可得积分预估、连续天数、
 *       当月日历（已签日期高亮）、签到成功结果（含升级与新勋章提示）
 * 说明：纯静态 SSG，数据在客户端经 iGM_PointsClient 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, LoaderCircle } from "lucide-react";
import {
  iGM_ApiCheckin,
  iGM_ApiGetCheckinStatus,
  type iGM_CheckinResult,
  type iGM_CheckinStatus,
} from "../../iGM_Services/iGM_PointsClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Points.module.css";

// 类型定义 //
// （数据类型来自 iGM_PointsClient）

// 核心逻辑 //
/** 签到页主体（在登录守卫内） */
function iGM_CheckinInner() {
  const t = useTranslations();

  const [status, setStatus] = useState<iGM_CheckinStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<iGM_CheckinResult | null>(null);

  /** 加载签到状态 */
  const iGM_LoadStatus = useCallback(() => {
    iGM_ApiGetCheckinStatus()
      .then((response) => {
        if (response.data) setStatus(response.data);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    iGM_LoadStatus();
  }, [iGM_LoadStatus]);

  /** 执行签到 */
  async function iGM_HandleCheckin(): Promise<void> {
    if (checking) return;
    setChecking(true);
    setErrorText(null);
    setResult(null);
    try {
      const response = await iGM_ApiCheckin();
      if (response.data) setResult(response.data);
      iGM_LoadStatus(); // 签到成功后刷新日历与状态
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setChecking(false);
    }
  }

  /** 当月日历网格：前置空位 + 1..月末，标记已签与今日 */
  function iGM_RenderCalendar(): { day: number; checked: boolean; today: boolean }[] {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const today = now.getDate();
    const checkedSet = new Set(status?.monthDates ?? []);

    const cells: { day: number; checked: boolean; today: boolean }[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ day: 0, checked: false, today: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ day, checked: checkedSet.has(iso), today: day === today });
    }
    return cells;
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <CalendarCheck size={22} strokeWidth={1.8} />
          </span>
          {t("pages.checkin.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.checkin.description")}
        </p>
      </header>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : (
        <section className={uiStyles.sectionCard}>
          {errorText && (
            <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
              {errorText}
            </div>
          )}
          {result && (
            <div className={`${styles.checkinResult} ${uiStyles.alert} ${uiStyles.alertSuccess}`}>
              {t("checkin.success", { points: result.pointsEarned })}
              {result.levelUp && ` ${t("checkin.levelUp")}`}
              {result.newBadges.length > 0 &&
                ` ${t("checkin.newBadges", {
                  names: result.newBadges.map((badge) => badge.name).join(", "),
                })}`}
            </div>
          )}

          {/* 签到面板 */}
          <div className={styles.checkinPanel}>
            <div className={styles.checkinStats}>
              <div className={styles.checkinStat}>
                <span className={styles.checkinStatValue}>
                  {status?.continuousDays ?? 0}
                </span>
                <span className={styles.checkinStatLabel}>
                  {t("checkin.continuousDays")}
                </span>
              </div>
              <div className={styles.checkinStat}>
                <span className={styles.checkinStatValue}>
                  +{status?.todayPoints ?? 0}
                </span>
                <span className={styles.checkinStatLabel}>
                  {t("checkin.todayPoints")}
                </span>
              </div>
            </div>

            <button
              type="button"
              className={uiStyles.primaryButton}
              disabled={checking || status?.checkedToday === true}
              onClick={iGM_HandleCheckin}
            >
              {checking && <LoaderCircle size={14} className="igm-spin" />}
              {status?.checkedToday
                ? t("checkin.buttonDone")
                : t("checkin.button")}
            </button>

            {/* 当月签到日历 */}
            <div className={styles.calendar} aria-hidden>
              {iGM_RenderCalendar().map((cell, index) => (
                <span
                  key={index}
                  className={[
                    styles.calendarCell,
                    cell.day === 0 ? styles.calendarCellEmpty : "",
                    cell.checked ? styles.calendarCellChecked : "",
                    cell.today && !cell.checked ? styles.calendarCellToday : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {cell.day > 0 ? cell.day : ""}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/** 签到页（登录守卫包裹） */
export function iGM_CheckinPage() {
  const IGM_CheckinInner = iGM_CheckinInner;
  return (
    <IGM_RequireAuth>
      <IGM_CheckinInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_CheckinPage;
