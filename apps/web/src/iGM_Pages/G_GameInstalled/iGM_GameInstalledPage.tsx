/**
 * 文件路径：apps/web/src/iGM_Pages/G_GameInstalled/iGM_GameInstalledPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_GameInstalled
 * 模块：G_GameInstalled
 * 作用：Minecraft 安装管理——查看进行中的下载任务、管理已安装版本
 * 内容：下载任务区（进度条 / 查看进度 / 取消 / 失败重试）、已安装列表
 *       （版本目录/加载器/安装目录/更新时间）、校验结果提示、
 *       逐条校验/修复/删除操作
 * 说明：
 *   - 纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 *   - 下载任务区每 4 秒刷新一次，仅在存在进行中任务时轮询
 *   - 多版本隔离：每个版本（含加载器差异）拥有独立目录，
 *     删除即整体移除该版本的安装目录，不影响其它版本
 *   - “启动游戏”由启动器承担，本模块不提供启动能力
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  Download,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiCancelGameInstall,
  iGM_ApiListGameInstalls,
  iGM_ApiListInstalledGames,
  iGM_ApiRemoveGameInstall,
  iGM_ApiRemoveGameTask,
  iGM_ApiRepairGameInstall,
  iGM_ApiVerifyGameInstall,
  type iGM_GameInstall,
  type iGM_GameInstallStatus,
} from "../../iGM_Services/iGM_GameClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import m15 from "../iGM_Module15.module.css";
import mc from "../iGM_Minecraft.module.css";
import styles from "../iGM_Game.module.css";

// 类型定义 //
/** 每条安装记录的校验结果文本 */
type iGM_VerifyMap = Record<string, string>;

// 核心逻辑 //
/** 任务区轮询间隔（毫秒） */
const iGM_TaskPollIntervalMs = 4000;

/** 非完成状态的任务过滤值：与已安装列表互不重复 */
const iGM_TaskStatusFilter = "pending,running,failed,canceled";

/** 状态对应的徽标样式 */
function iGM_StatusClass(status: iGM_GameInstallStatus): string {
  if (status === "completed") return m15.stateBadgeApproved;
  if (status === "failed" || status === "canceled") return m15.stateBadgeRejected;
  return m15.stateBadgePending;
}

/** 把后端下发的 i18n 文案键解析为当前语言文本 */
function iGM_ResolveKey(
  t: ReturnType<typeof useTranslations>,
  key: string,
): string {
  return key.includes(".") && t.has(key) ? t(key) : key;
}

/** 已安装版本管理页主体 */
export function iGM_GameInstalledPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const { locale } = iGM_UseLocale();

  const [items, setItems] = useState<iGM_GameInstall[]>([]);
  const [tasks, setTasks] = useState<iGM_GameInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [verifyMap, setVerifyMap] = useState<iGM_VerifyMap>({});

  /** 拉取已安装列表 */
  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiListInstalledGames();
      setItems(response.data?.items ?? []);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  /** 拉取下载任务列表（仅非完成状态；silent 用于轮询时静默失败） */
  const iGM_LoadTasks = useCallback(
    async (silent = false) => {
      try {
        const response = await iGM_ApiListGameInstalls(iGM_TaskStatusFilter);
        setTasks(response.data?.items ?? []);
      } catch (error) {
        if (!silent) setErrorText(iGM_ResolveErrorText(t, error));
      }
    },
    [t],
  );

  useEffect(() => {
    void iGM_Load();
    void iGM_LoadTasks();
  }, [iGM_Load, iGM_LoadTasks]);

  /** 存在进行中任务时轮询刷新，保证进度与状态实时可见 */
  const hasActiveTask = tasks.some(
    (task) => task.status === "pending" || task.status === "running",
  );
  useEffect(() => {
    if (!hasActiveTask) return;
    const timer = setInterval(() => {
      void iGM_LoadTasks(true);
    }, iGM_TaskPollIntervalMs);
    return () => clearInterval(timer);
  }, [hasActiveTask, iGM_LoadTasks]);

  /** 任务由进行中转为结束时刷新已安装列表，避免完成的版本短暂“消失” */
  const iGM_HadActiveRef = useRef(false);
  useEffect(() => {
    if (iGM_HadActiveRef.current && !hasActiveTask) {
      void iGM_Load();
    }
    iGM_HadActiveRef.current = hasActiveTask;
  }, [hasActiveTask, iGM_Load]);

  /**
   * 取消进行中的下载任务
   * purge 为 true 时一并清除已下载的残余文件并移除该任务记录
   */
  async function iGM_HandleCancelTask(
    task: iGM_GameInstall,
    purge = false,
  ): Promise<void> {
    if (busyId) return;
    const confirmKey = purge
      ? "game.cancelAndPurgeConfirm"
      : "game.cancelConfirm";
    if (!window.confirm(t(confirmKey))) return;
    setBusyId(task.id);
    setErrorText(null);
    try {
      await iGM_ApiCancelGameInstall(task.id, purge);
      await iGM_LoadTasks(true);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  /** 清除失败/已取消任务的残余文件与该任务记录 */
  async function iGM_HandlePurgeTask(task: iGM_GameInstall): Promise<void> {
    if (busyId) return;
    if (!window.confirm(t("game.purgeConfirm"))) return;
    setBusyId(task.id);
    setErrorText(null);
    try {
      await iGM_ApiRemoveGameTask(task.id);
      await iGM_LoadTasks(true);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  /** 校验单个安装的完整性 */
  async function iGM_HandleVerify(item: iGM_GameInstall): Promise<void> {
    if (busyId) return;
    setBusyId(item.id);
    setErrorText(null);
    try {
      const response = await iGM_ApiVerifyGameInstall(item.id);
      const result = response.data?.result;
      if (result) {
        setVerifyMap((prev) => ({
          ...prev,
          [item.id]: t("game.verifyResult", {
            total: result.total,
            ok: result.ok,
            missing: result.missing,
          }),
        }));
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  /** 修复安装：复位并重新补齐缺失文件后进入进度页 */
  async function iGM_HandleRepair(item: iGM_GameInstall): Promise<void> {
    if (busyId) return;
    setBusyId(item.id);
    setErrorText(null);
    try {
      await iGM_ApiRepairGameInstall(item.id);
      router.push(`/G_GameProgress?taskId=${encodeURIComponent(item.id)}`);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setBusyId(null);
    }
  }

  /** 删除已安装版本 */
  async function iGM_HandleRemove(item: iGM_GameInstall): Promise<void> {
    if (busyId) return;
    if (!window.confirm(t("game.removeConfirm", { version: item.versionDir }))) return;
    setBusyId(item.id);
    setErrorText(null);
    try {
      await iGM_ApiRemoveGameInstall(item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 横幅 */}
      <section className={mc.mcHero}>
        <span className={mc.mcHeroTitle}>
          <span className={mc.mcHeroIcon}>
            <ShieldCheck size={24} strokeWidth={1.8} />
          </span>
          {t("game.installedTitle")}
        </span>
        <p className={mc.mcHeroDescription}>{t("game.installedDescription")}</p>
      </section>

      {errorText && <div className={`${m10.alert} ${m10.alertError}`}>{errorText}</div>}

      {/* 下载任务：进行中可查看进度与取消，失败/已取消可重试 */}
      {tasks.length > 0 && (
        <section className={m10.sectionCard}>
          <span className={m15.progressTitle}>
            <Activity
              size={16}
              strokeWidth={1.8}
              style={{ verticalAlign: "-2px", marginRight: 6 }}
            />
            {t("game.tasksTitle")}
          </span>
          <p className={m10.hint}>{t("game.tasksDescription")}</p>

          <div className={m10.list}>
            {tasks.map((task) => {
              const percent = Math.min(100, Math.max(0, task.progress));
              const active =
                task.status === "pending" || task.status === "running";
              return (
                <article key={task.id} className={styles.versionCard}>
                  <div className={styles.versionCardHead}>
                    <span className={styles.versionName}>{task.versionDir}</span>
                    <span
                      className={`${m15.stateBadge} ${iGM_StatusClass(task.status)}`}
                    >
                      {t(`game.status.${task.status}`)}
                    </span>
                  </div>

                  <div className={m15.progressTrack}>
                    <div
                      className={m15.progressFill}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className={styles.progressStats}>
                    <span className={styles.progressStat}>
                      <Activity size={13} strokeWidth={1.8} />
                      {percent.toFixed(1)}%
                    </span>
                    <span className={styles.progressStat}>
                      <Download size={13} strokeWidth={1.8} />
                      {t("game.progressFiles", {
                        done: task.downloadedFiles,
                        total: task.totalFiles,
                      })}
                    </span>
                    <span className={styles.progressStat}>
                      {iGM_FormatDateTime(locale, task.updatedAt)}
                    </span>
                  </div>

                  {task.error && (
                    <div className={`${m10.alert} ${m10.alertError}`}>
                      {iGM_ResolveKey(t, task.error)}
                    </div>
                  )}

                  <div className={styles.versionActions}>
                    <Link
                      href={`/G_GameProgress?taskId=${encodeURIComponent(task.id)}`}
                      className={m10.ghostButton}
                    >
                      <Activity size={15} strokeWidth={1.8} />
                      {t("game.viewProgress")}
                    </Link>
                    {busyId === task.id && (
                      <LoaderCircle size={15} className="igm-spin" />
                    )}
                    {active ? (
                      <>
                        <button
                          type="button"
                          className={m10.dangerButton}
                          disabled={busyId === task.id}
                          onClick={() => void iGM_HandleCancelTask(task, false)}
                        >
                          <XCircle size={15} strokeWidth={1.8} />
                          {t("game.cancelInstall")}
                        </button>
                        <button
                          type="button"
                          className={m10.ghostButton}
                          disabled={busyId === task.id}
                          onClick={() => void iGM_HandleCancelTask(task, true)}
                        >
                          <Trash2 size={15} strokeWidth={1.8} />
                          {t("game.cancelAndPurge")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={m10.ghostButton}
                          disabled={busyId === task.id}
                          onClick={() => void iGM_HandleRepair(task)}
                        >
                          <RefreshCw size={15} strokeWidth={1.8} />
                          {t("game.repair")}
                        </button>
                        <button
                          type="button"
                          className={m10.dangerButton}
                          disabled={busyId === task.id}
                          onClick={() => void iGM_HandlePurgeTask(task)}
                        >
                          <Trash2 size={15} strokeWidth={1.8} />
                          {t("game.purge")}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {loading ? (
        <div className={m10.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("game.stateLoading")}
        </div>
      ) : items.length === 0 ? (
        <IGM_EmptyState
          icon={Download}
          title={t("game.installedEmpty")}
          description={t("game.installedEmptyDescription")}
          action={
            <Link href="/G_MinecraftVersions" className={m10.primaryButton}>
              <Download size={15} strokeWidth={1.8} />
              {t("game.versionsTitle")}
            </Link>
          }
        />
      ) : (
        <div className={m10.list}>
          {items.map((item) => (
            <article key={item.id} className={styles.versionCard}>
              <div className={styles.versionCardHead}>
                <span className={styles.versionName}>{item.versionDir}</span>
                <span className={`${m15.stateBadge} ${m15.stateBadgeApproved}`}>
                  {t("game.status.completed")}
                </span>
              </div>

              <div className={styles.kvList}>
                <div className={styles.kvRow}>
                  <span className={styles.kvKey}>{t("game.loaderLabel")}</span>
                  <span className={styles.kvValue}>
                    {t.has(`game.loaderNames.${item.loader}`)
                      ? t(`game.loaderNames.${item.loader}`)
                      : item.loader}
                    {item.loaderVersion ? ` ${item.loaderVersion}` : ""}
                  </span>
                </div>
                <div className={styles.kvRow}>
                  <span className={styles.kvKey}>
                    <FolderOpen size={13} strokeWidth={1.8} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                    {t("game.installDirLabel")}
                  </span>
                  <span className={styles.kvValue}>{item.installDir}</span>
                </div>
                <div className={styles.kvRow}>
                  <span className={styles.kvKey}>{t("game.updatedAtLabel")}</span>
                  <span className={styles.kvValue}>
                    {iGM_FormatDateTime(locale, item.updatedAt)}
                  </span>
                </div>
              </div>

              {verifyMap[item.id] && (
                <div className={m10.hint}>{verifyMap[item.id]}</div>
              )}

              <div className={styles.versionActions}>
                <button
                  type="button"
                  className={m10.ghostButton}
                  disabled={busyId === item.id}
                  onClick={() => void iGM_HandleVerify(item)}
                >
                  {busyId === item.id ? (
                    <LoaderCircle size={15} className="igm-spin" />
                  ) : (
                    <ShieldCheck size={15} strokeWidth={1.8} />
                  )}
                  {t("game.verify")}
                </button>
                <button
                  type="button"
                  className={m10.ghostButton}
                  disabled={busyId === item.id}
                  onClick={() => void iGM_HandleRepair(item)}
                >
                  <RefreshCw size={15} strokeWidth={1.8} />
                  {t("game.repair")}
                </button>
                <button
                  type="button"
                  className={m10.dangerButton}
                  disabled={busyId === item.id}
                  onClick={() => void iGM_HandleRemove(item)}
                >
                  <Trash2 size={15} strokeWidth={1.8} />
                  {t("game.remove")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// 导出 //
export default iGM_GameInstalledPage;