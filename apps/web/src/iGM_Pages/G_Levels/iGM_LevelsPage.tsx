/**
 * 文件路径：apps/web/src/iGM_Pages/G_Levels/iGM_LevelsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Levels
 * 模块：G_Levels
 * 作用：等级展示页——10 个等级的名称、积分区间、图标与考核要求
 * 内容：等级阶梯（当前等级高亮）、我的升级进度条、
 *       第 8/9/10 级考核申请入口与我的考核记录
 * 说明：纯静态 SSG，数据在客户端经 iGM_PointsClient 调用本地后端；
 *       未登录访客可浏览等级规则，登录后可查看进度并提交考核申请
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GraduationCap, LoaderCircle, TrendingUp } from "lucide-react";
import {
  iGM_ApiGetLevelProgress,
  iGM_ApiListLevels,
  iGM_ApiListMyExams,
  iGM_ApiSubmitLevelExam,
  type iGM_Level,
  type iGM_LevelExam,
  type iGM_LevelProgress,
} from "../../iGM_Services/iGM_PointsClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Module15.module.css";

// 类型定义 //
// （数据类型来自 iGM_PointsClient）

// 核心逻辑 //
/** 等级与考核页主体 */
export function iGM_LevelsInner() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const { status } = iGM_UseAuth();

  const [levels, setLevels] = useState<iGM_Level[]>([]);
  const [progress, setProgress] = useState<iGM_LevelProgress | null>(null);
  const [exams, setExams] = useState<iGM_LevelExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [examContent, setExamContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  /** 加载等级规则（公开）；登录时附带进度与考核记录 */
  const iGM_Load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    const tasks: Promise<unknown>[] = [
      iGM_ApiListLevels().then((response) => {
        if (!cancelled && response.data) setLevels(response.data.levels);
      }),
    ];
    if (status === "authenticated") {
      tasks.push(
        iGM_ApiGetLevelProgress().then((response) => {
          if (!cancelled && response.data) setProgress(response.data);
        }),
        iGM_ApiListMyExams().then((response) => {
          if (!cancelled && response.data) setExams(response.data.exams);
        }),
      );
    }
    Promise.all(tasks)
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

  useEffect(() => iGM_Load(), [iGM_Load]);

  /** 提交考核申请 */
  function iGM_HandleSubmitExam() {
    if (!progress?.nextLevel) return;
    setSubmitting(true);
    setSubmitError(null);
    iGM_ApiSubmitLevelExam({
      levelId: progress.nextLevel.id,
      content: examContent.trim(),
    })
      .then(() => {
        setSubmitted(true);
        setExamContent("");
        iGM_Load();
      })
      .catch(() => setSubmitError(t("levels.exam.submitFailed")))
      .finally(() => setSubmitting(false));
  }

  /** 积分区间文案 */
  function iGM_LevelRange(level: iGM_Level): string {
    return level.maxPoints === null
      ? t("levels.rangeFrom", { min: level.minPoints })
      : t("levels.range", { min: level.minPoints, max: level.maxPoints });
  }

  /** 进度百分比（下一等级区间内） */
  function iGM_ProgressPercent(): number {
    if (!progress?.nextLevel) return 100;
    const current = progress.level?.minPoints ?? 0;
    const target = Math.max(1, progress.nextLevel.minPoints - current);
    const gained = Math.max(0, progress.totalPoints - current);
    return Math.min(100, Math.round((gained / target) * 100));
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <GraduationCap size={22} strokeWidth={1.8} />
          </span>
          {t("pages.levels.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.levels.description")}
        </p>
      </header>

      {loading ? (
        <div className={uiStyles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : loadFailed ? (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("levels.loadFailed")}
        </div>
      ) : (
        <>
          {/* 我的升级进度（登录） */}
          {progress && (
            <section className={styles.progressCard}>
              <div className={styles.progressHead}>
                <h2 className={styles.progressTitle}>
                  {t("levels.progress.title")}
                </h2>
                <span className={styles.progressMeta}>
                  {t("levels.progress.points", { points: progress.totalPoints })}
                </span>
              </div>
              <div className={styles.progressMeta}>
                {progress.level
                  ? t("levels.progress.current", { name: progress.level.name })
                  : t("levels.progress.noLevel")}
                {progress.nextLevel
                  ? progress.pointsReached
                    ? t("levels.progress.reached", {
                        name: progress.nextLevel.name,
                      })
                    : t("levels.progress.toNext", {
                        points: progress.pointsToNext,
                        name: progress.nextLevel.name,
                      })
                  : t("levels.progress.maxed")}
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${iGM_ProgressPercent()}%` }}
                />
              </div>
            </section>
          )}

          {/* 考核申请（登录且下一等级需考核） */}
          {progress?.nextLevelExamRequired && progress.pointsReached && (
            <section className={styles.examBox}>
              <h2 className={styles.progressTitle}>
                {t("levels.exam.title", { name: progress.nextLevel?.name ?? "" })}
              </h2>
              <p className={styles.examStatus}>
                {progress.examStatus === "pending"
                  ? t("levels.exam.pending")
                  : progress.examStatus === "approved"
                    ? t("levels.exam.approved")
                    : t("levels.exam.hint")}
              </p>
              {(progress.examStatus === "none" ||
                progress.examStatus === "rejected") && (
                <>
                  <textarea
                    className={styles.examTextarea}
                    value={examContent}
                    onChange={(event) => setExamContent(event.target.value)}
                    placeholder={t("levels.exam.placeholder")}
                  />
                  <div className={styles.progressActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={submitting}
                      onClick={iGM_HandleSubmitExam}
                    >
                      {submitting
                        ? t("levels.exam.submitting")
                        : t("levels.exam.submit")}
                    </button>
                    {submitError && (
                      <span className={styles.examStatus}>{submitError}</span>
                    )}
                  </div>
                </>
              )}
              {submitted && (
                <span className={styles.examStatus}>
                  {t("levels.exam.submitted")}
                </span>
              )}
            </section>
          )}

          {/* 我的考核记录（登录） */}
          {exams.length > 0 && (
            <section className={styles.examBox}>
              <h2 className={styles.progressTitle}>{t("levels.exam.history")}</h2>
              <div className={styles.examList}>
                {exams.map((exam) => (
                  <div key={exam.id} className={styles.examItem}>
                    <span>
                      {t("levels.exam.record", {
                        name: exam.levelName ?? exam.levelId,
                      })}
                    </span>
                    <span className={styles.examStatus}>
                      {t(`levels.exam.status.${exam.status}`)}
                      {" · "}
                      {iGM_FormatDate(locale, exam.createdAt)}
                      {exam.reviewNote ? ` · ${exam.reviewNote}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 等级阶梯 */}
          <div className={styles.levelGrid}>
            {levels.map((level) => (
              <article
                key={level.id}
                className={[
                  styles.levelCard,
                  progress?.level?.id === level.id ? styles.levelCardCurrent : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className={styles.levelHead}>
                  <h2 className={styles.levelName}>{level.name}</h2>
                  <span className={styles.levelOrder}>
                    {t("levels.order", { order: level.sortOrder })}
                  </span>
                </div>
                <span className={styles.levelPoints}>
                  <TrendingUp size={13} strokeWidth={1.8} aria-hidden />{" "}
                  {iGM_LevelRange(level)}
                </span>
                <div className={styles.levelTags}>
                  {progress?.level?.id === level.id && (
                    <span className={`${styles.levelTag} ${styles.levelTagCurrent}`}>
                      {t("levels.tagCurrent")}
                    </span>
                  )}
                  {level.isExamRequired && (
                    <span className={`${styles.levelTag} ${styles.levelTagExam}`}>
                      {t("levels.tagExam")}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 等级展示页 */
export function iGM_LevelsPage() {
  const IGM_LevelsInner = iGM_LevelsInner;
  return <IGM_LevelsInner />;
}

// 导出 //
export default iGM_LevelsPage;