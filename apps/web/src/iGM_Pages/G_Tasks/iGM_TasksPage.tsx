/**
 * 文件路径：apps/web/src/iGM_Pages/G_Tasks/iGM_TasksPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Tasks
 * 模块：G_Tasks
 * 作用：任务中心——每周任务与每季任务分标签展示、进度与奖励领取
 * 内容：weekly / seasonal 标签页切换、任务卡片（描述、目标、进度条、奖励积分）、
 *       完成后「领取奖励」按钮、每季任务的赛季标识
 * 说明：纯静态 SSG，数据在客户端经 iGM_PointsClient 调用本地后端；
 *       任务进度、完成状态与奖励领取均由后端统一管理
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Gift, ListChecks, LoaderCircle } from "lucide-react";
import {
  iGM_ApiClaimTask,
  iGM_ApiListTasks,
  type iGM_Task,
} from "../../iGM_Services/iGM_PointsClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Module15.module.css";

// 类型定义 //
/** 任务标签页：每周 / 每季 */
type iGM_TaskTab = "weekly" | "seasonal";

// 核心逻辑 //
/** 任务中心主体 */
export function iGM_TasksInner() {
  const t = useTranslations();
  const { status } = iGM_UseAuth();

  const [tab, setTab] = useState<iGM_TaskTab>("weekly");
  const [tasks, setTasks] = useState<iGM_Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const iGM_Load = useCallback((target: iGM_TaskTab) => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    iGM_ApiListTasks(target)
      .then((response) => {
        if (!cancelled && response.data) setTasks(response.data.tasks);
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

  useEffect(() => iGM_Load(tab), [iGM_Load, tab, status]);

  /** 领取任务奖励 */
  function iGM_HandleClaim(task: iGM_Task) {
    setClaimingId(task.id);
    setClaimError(null);
    iGM_ApiClaimTask(task.id)
      .then(() => iGM_Load(tab))
      .catch(() => setClaimError(t("tasks.claimFailed")))
      .finally(() => setClaimingId(null));
  }

  /** 任务进度百分比 */
  function iGM_Percent(task: iGM_Task): number {
    if (task.targetCount <= 0) return task.isCompleted ? 100 : 0;
    return Math.min(100, Math.round((task.progress / task.targetCount) * 100));
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <ListChecks size={22} strokeWidth={1.8} />
          </span>
          {t("pages.tasks.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.tasks.description")}
        </p>
      </header>

      {/* 标签页：每周 / 每季 */}
      <div className={styles.tabs} role="tablist">
        {(["weekly", "seasonal"] as iGM_TaskTab[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={[styles.tab, tab === item ? styles.tabActive : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setTab(item)}
          >
            {t(`tasks.tab.${item}`)}
          </button>
        ))}
      </div>

      <p className={styles.levelPoints}>
        {t(`tasks.cycle.${tab}`)}
      </p>

      {status === "anonymous" && (
        <div className={styles.examStatus}>{t("tasks.loginHint")}</div>
      )}

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("tasks.loadFailed")}
        </div>
      ) : tasks.length === 0 ? (
        <div className={uiStyles.stateBox}>{t("tasks.empty")}</div>
      ) : (
        <div className={styles.taskList}>
          {tasks.map((task) => (
            <article key={task.id} className={styles.taskCard}>
              <div className={styles.taskHead}>
                <h2 className={styles.taskName}>{task.name}</h2>
                <span className={styles.taskReward}>
                  <Gift size={13} strokeWidth={1.8} aria-hidden />{" "}
                  {t("tasks.reward", { points: task.rewardPoints })}
                </span>
              </div>
              <p className={styles.taskDesc}>{task.description}</p>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${iGM_Percent(task)}%` }}
                />
              </div>
              <div className={styles.taskFoot}>
                <span className={styles.taskProgressText}>
                  {t("tasks.progress", {
                    progress: task.progress,
                    target: task.targetCount,
                  })}
                  {tab === "seasonal" && task.seasonId
                    ? ` · ${t("tasks.season", { season: task.seasonId })}`
                    : ""}
                </span>
                {task.isClaimed ? (
                  <span className={styles.taskProgressText}>
                    {t("tasks.claimed")}
                  </span>
                ) : task.isCompleted ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={claimingId === task.id || status !== "authenticated"}
                    onClick={() => iGM_HandleClaim(task)}
                  >
                    {claimingId === task.id
                      ? t("tasks.claiming")
                      : t("tasks.claim")}
                  </button>
                ) : (
                  <span className={styles.taskProgressText}>
                    {t("tasks.unfinished")}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {claimError && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {claimError}
        </div>
      )}
    </div>
  );
}

/** 任务中心页 */
export function iGM_TasksPage() {
  const IGM_TasksInner = iGM_TasksInner;
  return <IGM_TasksInner />;
}

// 导出 //
export default iGM_TasksPage;