/**
 * 文件路径：apps/web/src/iGM_Pages/G_Points/iGM_PointsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Points
 * 模块：G_Points
 * 作用：我的积分——积分概览、等级进度、积分流水、等级规则与任务清单
 * 内容：总积分与等级卡片、距下一等级进度条、分页积分记录、
 *       等级规则列表、任务进度列表
 * 说明：纯静态 SSG，数据在客户端经 iGM_PointsClient 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Award, Coins, LoaderCircle, ScrollText, Target } from "lucide-react";
import {
  iGM_ApiGetMyPoints,
  iGM_ApiListLevels,
  iGM_ApiListPointsRecords,
  iGM_ApiListTasks,
  type iGM_Level,
  type iGM_MyPoints,
  type iGM_PointsRecordsData,
  type iGM_Task,
} from "../../iGM_Services/iGM_PointsClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Points.module.css";

// 类型定义 //
// （数据类型来自 iGM_PointsClient）

// 核心逻辑 //
/** 积分动作文案键映射：未识别动作回退显示原文 */
function iGM_ActionLabel(
  t: ReturnType<typeof useTranslations>,
  action: string,
): string {
  const known = [
    "post_create",
    "comment_create",
    "like_received",
    "resource_upload",
    "activity_join",
    "checkin",
    "task_reward",
  ];
  return known.includes(action) ? t(`points.actions.${action}`) : action;
}

/** 等级积分区间文案 */
function iGM_LevelRange(
  t: ReturnType<typeof useTranslations>,
  level: iGM_Level,
): string {
  return level.maxPoints === null
    ? t("points.levels.noUpper", { min: level.minPoints })
    : t("points.levels.range", { min: level.minPoints, max: level.maxPoints });
}

/** 我的积分页主体（在登录守卫内） */
function iGM_PointsInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();

  const [points, setPoints] = useState<iGM_MyPoints | null>(null);
  const [records, setRecords] = useState<iGM_PointsRecordsData | null>(null);
  const [levels, setLevels] = useState<iGM_Level[]>([]);
  const [tasks, setTasks] = useState<iGM_Task[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  /** 加载积分概览、等级规则与任务（一次拉齐） */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    Promise.all([
      iGM_ApiGetMyPoints(),
      iGM_ApiListLevels(),
      iGM_ApiListTasks(),
    ])
      .then(([pointsRes, levelsRes, tasksRes]) => {
        if (cancelled) return;
        if (pointsRes.data) setPoints(pointsRes.data);
        if (levelsRes.data) setLevels(levelsRes.data.levels);
        if (tasksRes.data) setTasks(tasksRes.data.tasks);
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

  /** 按页加载积分流水 */
  const iGM_LoadRecords = useCallback((nextPage: number) => {
    iGM_ApiListPointsRecords(nextPage, 10)
      .then((response) => {
        if (response.data) setRecords(response.data);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    iGM_LoadRecords(page);
  }, [page, iGM_LoadRecords]);

  /** 距下一等级进度百分比 */
  function iGM_ProgressPercent(data: iGM_MyPoints): number {
    if (!data.level || !data.nextLevel) return 100;
    const span = data.nextLevel.minPoints - data.level.minPoints;
    if (span <= 0) return 100;
    const gained = data.totalPoints - data.level.minPoints;
    return Math.min(100, Math.max(0, Math.round((gained / span) * 100)));
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Coins size={22} strokeWidth={1.8} />
          </span>
          {t("pages.points.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.points.description")}
        </p>
      </header>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("points.loadFailed")}
        </div>
      ) : (
        <div className={uiStyles.stack}>
          {/* 概览与等级进度 */}
          <section className={uiStyles.sectionCard}>
            {points && (
              <>
                <div className={styles.overview}>
                  <div className={styles.statTile}>
                    <span className={styles.statLabel}>
                      {t("points.overview.total")}
                    </span>
                    <span className={styles.statValue}>
                      {points.totalPoints}
                    </span>
                  </div>
                  <div className={styles.statTile}>
                    <span className={styles.statLabel}>
                      {t("points.overview.level")}
                    </span>
                    <span className={styles.statValue}>
                      {points.level?.name ?? t("points.overview.levelNone")}
                    </span>
                    <span className={styles.statSub}>
                      {points.level ? iGM_LevelRange(t, points.level) : ""}
                    </span>
                  </div>
                </div>

                {/* 等级进度条 */}
                {points.nextLevel && (
                  <div>
                    <div className={styles.levelHeader}>
                      <span className={styles.levelName}>
                        {t("points.overview.nextLevel", {
                          name: points.nextLevel.name,
                        })}
                      </span>
                      <span className={styles.levelPoints}>
                        {t("points.overview.toNext", {
                          points: points.pointsToNext,
                        })}
                      </span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${iGM_ProgressPercent(points)}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* 积分流水 */}
          <section className={uiStyles.sectionCard}>
            <h2 className={uiStyles.sectionTitle}>
              <span className={uiStyles.sectionTitleIcon}>
                <ScrollText size={16} strokeWidth={1.8} />
              </span>
              {t("points.records.title")}
            </h2>
            {records && records.items.length > 0 ? (
              <div className={styles.recordList}>
                {records.items.map((record) => (
                  <div key={record.id} className={styles.recordRow}>
                    <div className={styles.recordMain}>
                      <span className={styles.recordAction}>
                        {iGM_ActionLabel(t, record.action)}
                      </span>
                      {record.description && (
                        <span className={styles.recordDesc}>
                          {record.description}
                        </span>
                      )}
                    </div>
                    <div className={styles.recordSide}>
                      <span className={styles.recordPoints}>
                        +{record.points}
                      </span>
                      <span className={styles.recordTime}>
                        {iGM_FormatDateTime(locale, record.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={uiStyles.hint}>{t("points.records.empty")}</p>
            )}
            {records && (
              <IGM_Pagination
                page={records.page}
                totalPages={records.totalPages}
                onChange={setPage}
              />
            )}
          </section>

          {/* 等级规则 */}
          <section className={uiStyles.sectionCard}>
            <h2 className={uiStyles.sectionTitle}>
              <span className={uiStyles.sectionTitleIcon}>
                <Award size={16} strokeWidth={1.8} />
              </span>
              {t("points.levels.title")}
            </h2>
            <div className={styles.recordList}>
              {levels.map((level) => (
                <div key={level.id} className={styles.recordRow}>
                  <span className={styles.recordAction}>{level.name}</span>
                  <span className={styles.taskProgress}>
                    {iGM_LevelRange(t, level)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 任务清单 */}
          <section className={uiStyles.sectionCard}>
            <h2 className={uiStyles.sectionTitle}>
              <span className={uiStyles.sectionTitleIcon}>
                <Target size={16} strokeWidth={1.8} />
              </span>
              {t("points.tasks.title")}
            </h2>
            <div className={styles.recordList}>
              {tasks.map((task) => (
                <div key={task.id} className={styles.taskRow}>
                  <div className={styles.taskMain}>
                    <span className={styles.taskName}>{task.name}</span>
                    <span className={styles.taskDescription}>
                      {task.description}
                    </span>
                  </div>
                  <div className={styles.taskSide}>
                    <span className={styles.taskReward}>
                      {t("points.tasks.reward", { points: task.rewardPoints })}
                    </span>
                    {task.isCompleted ? (
                      <span className={styles.taskDone}>
                        {t("points.tasks.done")}
                      </span>
                    ) : (
                      <span className={styles.taskProgress}>
                        {t("points.tasks.progress", {
                          progress: task.progress,
                          target: task.targetCount,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/** 我的积分页（登录守卫包裹） */
export function iGM_PointsPage() {
  const IGM_PointsInner = iGM_PointsInner;
  return (
    <IGM_RequireAuth>
      <IGM_PointsInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_PointsPage;
