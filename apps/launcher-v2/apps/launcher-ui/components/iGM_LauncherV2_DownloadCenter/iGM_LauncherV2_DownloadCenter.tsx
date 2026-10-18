/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_DownloadCenter/iGM_LauncherV2_DownloadCenter.tsx
 * 所属层：前端 / 全局浮层组件
 * 路由：G_Main（全局挂载，不进入导航栏）
 * 模块：iGM_LauncherV2_DownloadCenter
 * 作用：右下角悬浮下载中心：仅在存在进行中的下载任务时出现，打开后为「任务管理器」
 * 内容：默认隐藏，出现时为右下角圆形按钮（下载箭头图标 + 呼吸灯 + 进行中任务角标）；
 *       点击向上弹出磨砂玻璃面板，面板内为左侧导航（进行中 / 已完成 / 历史记录）+
 *       右侧任务列表；任务行显示名称、视界名称、进度条、百分比、速度与剩余文件数，
 *       已完成项追加完成时间；进行中的任务提供「暂停 / 继续 / 取消」三个操作按钮，
 *       终态任务提供清除；
 *       游戏运行期间面板顶部常驻限速提示条（「检测到游戏运行中，已自动为您限制下载速度以防卡顿」）；
 *       任务从 running 变为终态时把快照留存进 history，清除外壳任务不清除历史；
 *       生命周期规则：任务全部到达终态（完成 / 失败 / 主动取消）后立即清理任务与临时缓存
 *       并收起悬浮图标；图标仅在下一次真正开始下载时重新出现；
 *       通道不可用等提示以独立提示条呈现，等待用户手动处理
 * 说明：组件挂在界面根节点，任何页签下都可见；不使用导航栏入口
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Gauge, Pause, Play, X } from "lucide-react";
import {
  iGM_LauncherV2_UseDownloads as IGM_LauncherV2_UseDownloads,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import type {
  iGM_LauncherV2_DownloadState,
  iGM_LauncherV2_DownloadTask,
} from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_DownloadCenter.module.css";

// 类型定义 //

/** 左侧导航分组标识 */
type iGM_LauncherV2_DownloadTab = "running" | "done" | "history";

// 常量与文案 //

/** 任务状态展示文案 */
const IGM_DOWNLOAD_STATE_LABEL: Record<iGM_LauncherV2_DownloadState, string> = {
  running: "下载中",
  paused: "已暂停",
  done: "已完成",
  failed: "已失败",
  canceled: "已取消",
};

/** 左侧导航三项 */
const IGM_DOWNLOAD_TABS: { id: iGM_LauncherV2_DownloadTab; label: string }[] = [
  { id: "running", label: "进行中" },
  { id: "done", label: "已完成" },
  { id: "history", label: "历史记录" },
];

/** 历史记录保留上限 */
const IGM_DOWNLOAD_HISTORY_LIMIT = 50;

// 核心逻辑 //

/** 字节数格式化为 MB（保留两位小数） */
function iGM_LauncherV2_ToMB(bytes: number): string {
  return (bytes / 1048576).toFixed(2);
}

/** 任务完成百分比（字节优先，字节未知时退化为文件数） */
function iGM_LauncherV2_Percent(task: iGM_LauncherV2_DownloadTask): number {
  if (task.totalBytes > 0) return Math.min(100, (task.doneBytes / task.totalBytes) * 100);
  if (task.totalFiles > 0) return Math.min(100, (task.doneFiles / task.totalFiles) * 100);
  return 0;
}

/** 时间戳格式化为 YYYY-MM-DD HH:mm:ss */
function iGM_LauncherV2_FormatTime(ms: number): string {
  if (!ms) return "—";
  const date = new Date(ms);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** 单个任务行 */
function IGM_LauncherV2_TaskRow({
  task,
  onPause,
  onResume,
  onCancel,
  onClear,
}: {
  task: iGM_LauncherV2_DownloadTask;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onClear: (id: string) => void;
}) {
  const percent = iGM_LauncherV2_Percent(task);
  const active = task.state === "running" || task.state === "paused";
  const paused = task.state === "paused";
  const remaining = Math.max(0, task.totalFiles - task.doneFiles);

  return (
    <li className={styles.taskRow}>
      <div className={styles.taskHead}>
        <span
          className={styles.dot}
          style={{
            background: `hsl(${task.hue} 82% 58%)`,
            boxShadow: `0 0 10px hsl(${task.hue} 82% 58% / 0.75)`,
          }}
        />
        <span className={styles.taskName}>{task.name}</span>
        <span className={styles.taskState}>{IGM_DOWNLOAD_STATE_LABEL[task.state]}</span>
        <span className={styles.taskActions}>
          {active ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={paused ? "继续下载" : "暂停下载"}
              title={paused ? "继续" : "暂停"}
              onClick={() => (paused ? onResume(task.id) : onPause(task.id))}
            >
              {paused ? <Play size={13} strokeWidth={2.4} /> : <Pause size={13} strokeWidth={2.4} />}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.iconButton}
            aria-label={active ? "取消下载" : "清除任务"}
            title={active ? "取消" : "清除"}
            onClick={() => (active ? onCancel(task.id) : onClear(task.id))}
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        </span>
      </div>

      <div className={styles.taskMeta}>
        <span className={styles.taskHorizon}>{task.horizonName}</span>
        {task.state === "done" ? (
          <span className={styles.taskTime}>完成于 {iGM_LauncherV2_FormatTime(task.finishedAt)}</span>
        ) : null}
      </div>

      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{ width: `${percent}%`, ["--igm-hue" as string]: String(task.hue) }}
        />
        {task.state === "running" ? <div className={styles.shimmer} /> : null}
      </div>

      <div className={styles.metrics}>
        <span>{percent.toFixed(1)}%</span>
        <span>{paused ? "已暂停" : `${iGM_LauncherV2_ToMB(task.speed)} MB/s`}</span>
        <span>剩余 {remaining} 文件</span>
      </div>

      {!active && task.message ? <p className={styles.taskMessage}>{task.message}</p> : null}
    </li>
  );
}

export function iGM_LauncherV2_DownloadCenter() {
  const downloads = IGM_LauncherV2_UseDownloads();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<iGM_LauncherV2_DownloadTab>("running");
  /** 已终结任务的快照留存（上限 50 条，清除外壳任务不会清除它） */
  const [history, setHistory] = useState<iGM_LauncherV2_DownloadTask[]>([]);
  /** 记录上一次见到的任务状态，用于识别 running -> 终态 的跃迁 */
  const prevStates = useRef<Map<string, iGM_LauncherV2_DownloadState>>(new Map());

  /** 进行中：包含「下载中」与「已暂停」，暂停任务仍属未结束，不能被收尾清理 */
  const runningTasks = downloads.tasks.filter(
    (item) => item.state === "running" || item.state === "paused",
  );
  const doneTasks = downloads.tasks.filter((item) => item.state === "done");

  /** 历史记录：已被清除的 history 快照 + 当前 failed / canceled 任务，去重后按完成时间倒序 */
  const historyItems = useMemo(() => {
    const liveIds = new Set(downloads.tasks.map((item) => item.id));
    const cleared = history.filter((item) => !liveIds.has(item.id));
    const live = downloads.tasks.filter(
      (item) => item.state === "failed" || item.state === "canceled",
    );
    const seen = new Set<string>();
    const merged: iGM_LauncherV2_DownloadTask[] = [];
    for (const task of [...live, ...cleared]) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      merged.push(task);
    }
    merged.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
    return merged;
  }, [history, downloads.tasks]);

  /**
   * 历史留存：任务由 running 变为终态（done / failed / canceled）时，
   * 把该任务的快照拷贝追加进 history，按 id 去重并限制上限。
   */
  useEffect(() => {
    const states = prevStates.current;
    const snapshots: iGM_LauncherV2_DownloadTask[] = [];
    for (const task of downloads.tasks) {
      const prev = states.get(task.id);
      const wasActive = prev === "running" || prev === "paused";
      const isTerminal =
        task.state === "done" || task.state === "failed" || task.state === "canceled";
      // 仅在「进行中 / 已暂停」跃迁到终态时留存快照；暂停属于中间态，不留存
      if (wasActive && isTerminal) snapshots.push({ ...task });
      states.set(task.id, task.state);
    }
    if (snapshots.length === 0) return;
    setHistory((current) => {
      const seen = new Set<string>();
      const merged: iGM_LauncherV2_DownloadTask[] = [];
      for (const task of [...snapshots, ...current]) {
        if (seen.has(task.id)) continue;
        seen.add(task.id);
        merged.push(task);
      }
      return merged.slice(0, IGM_DOWNLOAD_HISTORY_LIMIT);
    });
  }, [downloads.tasks]);

  /**
   * 下载生命周期收尾：本批任务只要还剩 running 就不动；一旦全部到达终态
   * （完成 / 失败 / 主动取消），立即逐个清除任务。
   * 清除指令会连外壳侧的临时缓存一并清理；任务清空后图标与面板同时立刻隐藏，
   * 只有下一次真正开始下载时才会重新出现。
   * 注意：history 不受此清理影响，用户下次打开面板时仍在「历史记录」中可见。
   */
  useEffect(() => {
    if (downloads.tasks.length === 0) return;
    if (
      downloads.tasks.some((item) => item.state === "running" || item.state === "paused")
    ) {
      return;
    }
    downloads.tasks.forEach((task) => downloads.clear(task.id));
  }, [downloads.tasks]);

  /** 悬浮图标仅在存在进行中的任务时出现（按需出现，任务结束即隐藏） */
  const visible = runningTasks.length > 0;

  // 无进行中任务时立即收起面板，避免残留空面板
  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  const rows =
    tab === "running" ? runningTasks : tab === "done" ? doneTasks : historyItems;
  const emptyText =
    tab === "running"
      ? "暂无进行中的任务。"
      : tab === "done"
        ? "暂无已完成的任务。"
        : "暂无历史记录。";

  return (
    <>
      {downloads.notice ? (
        <div className={styles.noticeBar} role="status">
          <span className={styles.noticeText}>{downloads.notice}</span>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="关闭提示"
            onClick={() => downloads.dismissNotice()}
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        </div>
      ) : null}

      {visible ? (
        <div className={styles.dock}>
          {open ? (
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <span className={styles.panelTitle}>下载中心</span>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="收起下载中心"
                  onClick={() => setOpen(false)}
                >
                  <X size={13} strokeWidth={2.4} />
                </button>
              </div>

              {/* 游戏运行限速联动提示条：由外壳在游戏进程存活期间持续回推 */}
              {downloads.throttled && downloads.throttleMessage ? (
                <div className={styles.throttleBar} role="status">
                  <Gauge size={14} strokeWidth={2.2} />
                  <span>{downloads.throttleMessage}</span>
                </div>
              ) : null}

              <div className={styles.body}>
                <nav className={styles.tabs}>
                  {IGM_DOWNLOAD_TABS.map((item) => {
                    const count =
                      item.id === "running"
                        ? runningTasks.length
                        : item.id === "done"
                          ? doneTasks.length
                          : historyItems.length;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.tab} ${tab === item.id ? styles.tabOn : ""}`}
                        onClick={() => setTab(item.id)}
                      >
                        <span>{item.label}</span>
                        <span className={styles.tabCount}>{count}</span>
                      </button>
                    );
                  })}
                </nav>

                <ul className={styles.list}>
                  {rows.length === 0 ? (
                    <li className={styles.listEmpty}>{emptyText}</li>
                  ) : (
                    rows.map((task) => (
                      <IGM_LauncherV2_TaskRow
                        key={task.id}
                        task={task}
                        onPause={downloads.pause}
                        onResume={downloads.resume}
                        onCancel={downloads.cancel}
                        onClear={downloads.clear}
                      />
                    ))
                  )}
                </ul>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className={styles.fab}
            aria-label="展开下载中心"
            onClick={() => setOpen((value) => !value)}
          >
            <Download size={20} strokeWidth={2.2} />
            {runningTasks.length > 0 ? (
              <span className={styles.badge}>{runningTasks.length}</span>
            ) : null}
          </button>
        </div>
      ) : null}
    </>
  );
}

// 导出 //
export default iGM_LauncherV2_DownloadCenter;
