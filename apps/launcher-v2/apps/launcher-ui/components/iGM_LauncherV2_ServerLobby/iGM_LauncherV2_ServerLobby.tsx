/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_ServerLobby/iGM_LauncherV2_ServerLobby.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main·方块广场·客户端同步大厅 / 开服中心
 * 模块：iGM_LauncherV2_ServerLobby
 * 作用：方块广场的服务器区块：上方为「客户端同步大厅」，下方为「开服中心」与「客户端清单工作室」
 * 内容：
 *   1) 客户端同步大厅（syncHall.*）：渲染由开服中心发布流程自动写入的同步记录（custom 条目），
 *      展示名称、局域网地址（ip:port）、客户端清单外部直链（点击经系统浏览器打开）、自动同步标签；
 *      每条可「启动并同步」（拉取外部清单、比对哈希、补齐 mods / config 后进服）与「一键进服」，
 *      仅 my: 前缀条目可删除；清单未生成时展示 manifestMissing 与 ownerHint 引导；
 *   2) 开服中心（server.local.*）：选择服务端核心与游戏版本创建本地服务器，版本下拉为全量动态版本
 *      （iGM_LauncherV2_UseCoreVersions），支持输入搜索过滤与一键刷新；每条本地服务器展示运行状态徽标、
 *      「启动 / 停止服务器」、「复制局域网地址」、固定高度可滚动的运行日志控制台（自动滚底、可清空），
 *      以及「生成客户端清单外部直链」与发布结果（复制 / 打开直链）；
 *   3) 客户端清单工作室（iGM_LauncherV2_ManifestStudio）：为本地服务器生成 manifest.json 与客户端 ZIP 包；
 *   说明：v26.5.5 已按要求移除「手动添加第三方服务器 IP」的 UI 入口（按钮 / 录入弹窗 / 提交与校验），
 *         保留一键进服与单项删除等既有能力（由同步大厅卡片承载）
 * 说明：组件为纯展示层，所有网络请求与本地进程控制均由 Bun 主进程执行；
 *       界面只通过 HostBridge 的 UseServerLobby / UseServerCenter / UseLocalServers / UseCoreVersions / UseHorizons
 *       投递指令并展示回推状态，文案全部由 next-intl 按 i18n 键解析
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  Info,
  Link2,
  LogIn,
  Play,
  RefreshCw,
  Server,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_OpenLink as IGM_LauncherV2_OpenLink,
  iGM_LauncherV2_UseCoreVersions as IGM_LauncherV2_UseCoreVersions,
  iGM_LauncherV2_UseHorizons as IGM_LauncherV2_UseHorizons,
  iGM_LauncherV2_UseLocalServers as IGM_LauncherV2_UseLocalServers,
  iGM_LauncherV2_UseServerCenter as IGM_LauncherV2_UseServerCenter,
  iGM_LauncherV2_UseServerLobby as IGM_LauncherV2_UseServerLobby,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  iGM_LauncherV2_ManifestStudio as IGM_LauncherV2_ManifestStudio,
} from "@/components/iGM_LauncherV2_ManifestStudio/iGM_LauncherV2_ManifestStudio";
import type {
  iGM_LauncherV2_LocalServer,
  iGM_LauncherV2_ServerCore,
  iGM_LauncherV2_ServerEntry,
  iGM_LauncherV2_ServerLogEntry,
  iGM_LauncherV2_ServerRuntime,
  iGM_LauncherV2_ServerRunState,
  iGM_LauncherV2_ServerSyncState,
} from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_ServerLobby.module.css";

// 类型定义 //

/** 客户端清单外部直链发布结果（由外壳回推，界面仅展示） */
interface iGM_LauncherV2_PublishResult {
  id: string;
  ok: boolean;
  url: string;
  message: string;
}

// 常量与文案 //

/** 本地开服可选服务端核心（展示名走 server.local.coreNames.* 多语言键） */
const IGM_SERVER_LOBBY_LOCAL_CORES: iGM_LauncherV2_ServerCore[] = [
  "vanilla",
  "paper",
  "fabric",
  "forge",
  "neoforge",
];

/** 服务端运行日志来源标签（错误控制台每行前缀，值为 i18n 键） */
const IGM_SERVER_LOBBY_LOG_STREAM_LABEL: Record<
  iGM_LauncherV2_ServerLogEntry["stream"],
  string
> = {
  system: "shell.logStream.system",
  stdout: "shell.logStream.stdout",
  stderr: "shell.logStream.stderr",
};

/** 运行状态对应的圆点样式：就绪 / 异常 / 过渡态各用不同颜色标记 */
const IGM_SERVER_LOBBY_RUN_TONE: Record<iGM_LauncherV2_ServerRunState, string> = {
  stopped: styles.runDotStopped,
  starting: styles.runDotStarting,
  ready: styles.runDotReady,
  stopping: styles.runDotStopping,
  error: styles.runDotError,
};

// 核心逻辑 //

/** 时间格式化：年-月-日 时:分，用于本地服务器创建时间展示 */
function iGM_LauncherV2_FormatTime(value: number | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const pad = (input: number) => String(input).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** 服务端日志时间格式化（时:分:秒） */
function iGM_LauncherV2_FormatLogTime(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 复制文本到剪贴板：优先 Clipboard API，权限受限时以临时文本域兜底 */
async function iGM_LauncherV2_CopyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 运行状态徽标：按 runtimes[item.id] 的 state 渲染不同颜色的状态点与文案。
 * 文案优先取外壳回推的 messageKey，缺失时回退到 server.local.run.<state> 系列键；
 * 就绪且已解析出局域网地址时，额外在徽标后附带 lanIp:port。
 */
function IGM_LauncherV2_RunBadge({
  runtime,
}: {
  runtime: iGM_LauncherV2_ServerRuntime | undefined;
}) {
  const t = useTranslations();
  const state: iGM_LauncherV2_ServerRunState = runtime?.state ?? "stopped";
  const messageKey = runtime?.messageKey ?? "";
  const label = messageKey
    ? t(messageKey, runtime?.messageParams ?? {})
    : t(`server.local.run.${state}`, {
        ip: runtime?.lanIp ?? "",
        port: runtime?.port ?? 0,
      });

  return (
    <span className={styles.runBadge}>
      <span
        className={`${styles.runDot} ${IGM_SERVER_LOBBY_RUN_TONE[state]}`}
        aria-hidden
      />
      <span className={styles.runLabel}>{label}</span>
    </span>
  );
}

/**
 * 运行日志控制台：固定高度、内部滚动、等宽字体，stderr / error 行标红。
 * 新日志到达时按「自动滚动」开关（默认开启）滚到底部；
 * 「清空」仅丢弃本地展示副本的前缀（用 dropped 记录已丢弃行数），不向外壳投递指令。
 */
function IGM_LauncherV2_ServerLogConsole({
  entries,
}: {
  entries: iGM_LauncherV2_ServerLogEntry[];
}) {
  const t = useTranslations();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // 已丢弃的本地展示行数：清空后新日志追加在末尾仍可见
  const [dropped, setDropped] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const shown = dropped > 0 ? entries.slice(dropped) : entries;

  // 新日志到达后滚到底部，用户无需手动翻找最新输出
  useEffect(() => {
    const node = bodyRef.current;
    if (node && autoScroll) node.scrollTop = node.scrollHeight;
  }, [shown.length, autoScroll]);

  return (
    <div className={styles.console}>
      <div className={styles.consoleHead}>
        <span className={styles.consoleTitle}>{t("server.local.run.console")}</span>
        <div className={styles.consoleActions}>
          <label className={styles.autoScroll}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(event) => setAutoScroll(event.target.checked)}
            />
            <span>{t("server.local.run.autoScroll")}</span>
          </label>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("server.local.run.consoleClear")}
            title={t("server.local.run.consoleClear")}
            onClick={() => setDropped(entries.length)}
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
          <Terminal size={15} strokeWidth={2.2} className={styles.consoleIcon} />
        </div>
      </div>

      <div className={styles.consoleBody} ref={bodyRef}>
        {shown.length === 0 ? (
          <p className={styles.consoleEmpty}>{t("server.local.run.consoleEmpty")}</p>
        ) : (
          shown.map((entry, index) => (
            <p
              key={`${entry.time}-${dropped + index}`}
              className={`${styles.consoleLine} ${
                entry.stream === "stderr" || entry.level === "error"
                  ? styles.consoleLineError
                  : ""
              }`}
            >
              <span className={styles.consoleTime}>
                {iGM_LauncherV2_FormatLogTime(entry.time)}
              </span>
              <span className={styles.consoleStream}>
                {t(IGM_SERVER_LOBBY_LOG_STREAM_LABEL[entry.stream])}
              </span>
              <span className={styles.consoleText}>{entry.line}</span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * 可搜索版本下拉框：文本输入框 + 下方暗色浮层列表。
 * 过滤逻辑为大小写不敏感的子串匹配；拉取中 / 空列表 / 结果提示均按 i18n 键展示；
 * 旁侧【刷新版本列表】按钮在拉取中禁用并显示加载态。
 */
function IGM_LauncherV2_VersionPicker({
  value,
  onChange,
  versions,
  loading,
  message,
  onRefresh,
}: {
  value: string;
  onChange: (next: string) => void;
  versions: string[];
  loading: boolean;
  message: string;
  onRefresh: () => void;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 外部已选版本变化时同步到输入框（如切换核心后清空）
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // 点击浮层外部时收起列表
  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // 大小写不敏感的子串过滤；无关键词时展示全量
  const keyword = query.trim().toLowerCase();
  const filtered = keyword
    ? versions.filter((item) => item.toLowerCase().includes(keyword))
    : versions;

  /** 选中某一版本：回填输入框并收起列表 */
  const pick = (item: string) => {
    onChange(item);
    setQuery(item);
    setOpen(false);
  };

  return (
    <div className={styles.picker} ref={wrapRef}>
      <div className={styles.pickerField}>
        <input
          className={styles.input}
          value={query}
          placeholder={t("server.local.versions.searchPlaceholder")}
          aria-label={t("server.local.versionLabel")}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            // 输入即视为选择（兼容 datalist 式自由输入），同时用于过滤浮层列表
            setQuery(event.target.value);
            onChange(event.target.value);
            setOpen(true);
          }}
        />
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t("server.local.versions.refresh")}
          title={t("server.local.versions.refresh")}
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw
            size={15}
            strokeWidth={2.2}
            className={loading ? styles.spin : undefined}
          />
        </button>
      </div>

      {open ? (
        <div className={styles.pickerList} role="listbox">
          <span className={styles.pickerHead}>{t("server.local.versions.title")}</span>
          {loading ? (
            <p className={styles.pickerHint}>{t("server.local.versions.loading")}</p>
          ) : filtered.length === 0 ? (
            <p className={styles.pickerHint}>{t("server.local.versions.empty")}</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={item === value}
                className={`${styles.pickerOption} ${
                  item === value ? styles.pickerOptionOn : ""
                }`}
                onClick={() => pick(item)}
              >
                {item}
              </button>
            ))
          )}
        </div>
      ) : null}

      {/* 结果提示：拉取中不重复展示 message，避免与 loading 文案叠加 */}
      {message && !loading ? <p className={styles.toolHint}>{message}</p> : null}
    </div>
  );
}

/**
 * 单条本地服务器条目：展示名称 / 核心 / 版本信息与创建时间，
 * 并提供运行状态徽标、启停控制、局域网地址复制、运行日志控制台、
 * 客户端清单外部直链发布与结果展示，以及删除（二次确认）。
 */
function IGM_LauncherV2_LocalServerItem({
  item,
  runtime,
  logs,
  publishResult,
  onStart,
  onStop,
  onLoadLogs,
  onPublish,
  onRemove,
}: {
  item: iGM_LauncherV2_LocalServer;
  runtime: iGM_LauncherV2_ServerRuntime | undefined;
  logs: iGM_LauncherV2_ServerLogEntry[];
  publishResult: iGM_LauncherV2_PublishResult | null;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onLoadLogs: (id: string) => void;
  onPublish: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations();
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const state: iGM_LauncherV2_ServerRunState = runtime?.state ?? "stopped";
  const running = state === "starting" || state === "ready" || state === "stopping";
  const ready = state === "ready";
  const lanAddress =
    ready && runtime && runtime.lanIp ? `http://${runtime.lanIp}:${runtime.port}` : "";
  const published =
    publishResult && publishResult.id === item.id ? publishResult : null;

  // 复制提示短暂展示后复位
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!linkCopied) return;
    const timer = window.setTimeout(() => setLinkCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [linkCopied]);

  /** 展开 / 收起日志控制台：首次展开时拉取一次日志缓冲全量 */
  const toggleConsole = () => {
    const next = !consoleOpen;
    setConsoleOpen(next);
    if (next) onLoadLogs(item.id);
  };

  /** 复制局域网地址（http://<lanIp>:<port>） */
  const copyAddress = async () => {
    if (!lanAddress) return;
    const ok = await iGM_LauncherV2_CopyText(lanAddress);
    if (ok) setCopied(true);
  };

  /** 复制客户端清单外部直链 */
  const copyLink = async () => {
    if (!published?.url) return;
    const ok = await iGM_LauncherV2_CopyText(published.url);
    if (ok) setLinkCopied(true);
  };

  return (
    <li className={styles.localItem}>
      <div className={styles.localItemRow}>
        <span className={styles.cardTitle}>{item.name}</span>
        <span className={styles.metaItem}>{t(`server.local.coreNames.${item.core}`)}</span>
        <span className={styles.metaItem}>{item.gameVersion}</span>
        {item.loaderVersion ? (
          <span className={styles.metaItem}>{item.loaderVersion}</span>
        ) : null}
        <button
          type="button"
          className={`${styles.iconButton} ${styles.iconButtonDanger}`}
          aria-label={t("server.local.remove")}
          onClick={() => onRemove(item.id)}
        >
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      </div>
      <span className={styles.localDir}>
        {t("server.local.dirLabel")}：{item.dir}
      </span>
      <span className={styles.cardSub}>
        {t("server.local.createdAt", { time: iGM_LauncherV2_FormatTime(item.createdAt) })}
      </span>

      {/* 运行状态与进程控制 */}
      <div className={styles.runHead}>
        <IGM_LauncherV2_RunBadge runtime={runtime} />
        {ready && runtime && runtime.lanIp ? (
          <span className={styles.runAddress}>
            {runtime.lanIp}:{runtime.port}
          </span>
        ) : null}
        <div className={styles.runActions}>
          {/* 停止中 / 已就绪 / 启动中展示停止按钮；已停止 / 异常展示启动按钮 */}
          {running ? (
            <button
              type="button"
              className={styles.actionButton}
              disabled={state === "stopping"}
              onClick={() => onStop(item.id)}
            >
              <Square size={14} strokeWidth={2.2} />
              <span>{t("server.local.run.stop")}</span>
            </button>
          ) : (
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => onStart(item.id)}
            >
              <Play size={14} strokeWidth={2.2} />
              <span>{t("server.local.run.start")}</span>
            </button>
          )}
          {/* 复制局域网地址：仅就绪且已解析出地址时可见 */}
          {lanAddress ? (
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void copyAddress()}
            >
              <Copy size={14} strokeWidth={2.2} />
              <span>
                {copied
                  ? t("server.local.run.copied")
                  : t("server.local.run.copyAddress")}
              </span>
            </button>
          ) : null}
          {/* 生成客户端清单外部直链 */}
          <button
            type="button"
            className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
            onClick={() => onPublish(item.id)}
          >
            <Link2 size={14} strokeWidth={2.2} />
            <span>{t("server.local.run.publish")}</span>
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${
              consoleOpen ? styles.actionButtonPrimary : ""
            }`}
            onClick={toggleConsole}
          >
            <Terminal size={14} strokeWidth={2.2} />
            <span>{t("server.local.run.console")}</span>
          </button>
        </div>
      </div>

      {/* 未就绪提示：发布前给出引导，点击仍可调用（外壳返回失败原因） */}
      {!ready ? <p className={styles.toolHint}>{t("server.local.run.notReady")}</p> : null}

      {/* 发布结果：按 ok 展示成功（带直链）或失败（带原因），并提供复制 / 打开直链 */}
      {published ? (
        <div
          className={`${styles.syncBox} ${
            published.ok ? styles.syncBoxDone : styles.syncBoxError
          }`}
        >
          <span className={styles.syncText}>
            {published.ok
              ? t("server.local.run.publishOk", { url: published.url })
              : t("server.local.run.publishFail", { message: published.message })}
          </span>
          {published.ok && published.url ? (
            <div className={styles.pathRow}>
              <span className={styles.pathText}>{published.url}</span>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void copyLink()}
              >
                <Copy size={14} strokeWidth={2.2} />
                <span>
                  {linkCopied ? t("server.local.run.copied") : t("common.copy")}
                </span>
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => IGM_LauncherV2_OpenLink(published.url)}
              >
                <ExternalLink size={14} strokeWidth={2.2} />
                <span>{t("common.open")}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {consoleOpen ? <IGM_LauncherV2_ServerLogConsole entries={logs} /> : null}
    </li>
  );
}

/**
 * 开服中心区块：选择服务端核心与游戏版本，由外壳下载核心并创建本地服务器目录。
 * 版本下拉改为 iGM_LauncherV2_UseCoreVersions 提供的全量动态版本（支持搜索与刷新）；
 * 创建进度经 server:core 实时回推，完成后列表自动刷新；每条服务器支持启停、日志与清单直链发布。
 */
function IGM_LauncherV2_LocalServerPanel() {
  const t = useTranslations();
  const local = IGM_LauncherV2_UseLocalServers();
  const [name, setName] = useState("");
  const [core, setCore] = useState<iGM_LauncherV2_ServerCore>("vanilla");
  const [version, setVersion] = useState("");
  const [loaderVersion, setLoaderVersion] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const catalog = IGM_LauncherV2_UseCoreVersions(core);

  // 核心切换后清空已选版本，避免提交不属于该核心的版本
  useEffect(() => {
    setVersion("");
  }, [core]);

  // 仅 Fabric / Forge / NeoForge 需要填写加载器版本
  const needLoader = core === "fabric" || core === "forge" || core === "neoforge";
  const coreState = local.coreState;
  const statePercent = coreState ? Math.max(0, Math.min(100, coreState.percent)) : 0;

  /** 创建：先做版本与名称校验，通过后投递创建指令 */
  const create = () => {
    if (!version) {
      setErrorKey("server.local.needVersion");
      return;
    }
    if (!name.trim()) {
      setErrorKey("server.local.needName");
      return;
    }
    setErrorKey("");
    local.create({
      name: name.trim(),
      core,
      gameVersion: version,
      loaderVersion: needLoader ? loaderVersion.trim() : "",
    });
  };

  /** 删除：二次确认后调用 remove，避免误删服务器目录 */
  const remove = (id: string) => {
    if (window.confirm(t("server.local.remove"))) local.remove(id);
  };

  return (
    <IGM_LauncherV2_Card className={styles.local}>
      <div className={styles.localHead}>
        <h2 className={styles.localTitle}>{t("server.local.title")}</h2>
        <p className={styles.localDesc}>{t("server.local.desc")}</p>
      </div>

      <div className={styles.toolCard}>
        <div className={styles.toolHead}>
          <Download size={15} strokeWidth={2.2} />
          <span className={styles.toolTitle}>{t("server.local.create")}</span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t("server.local.nameLabel")}</span>
          <input
            className={styles.input}
            value={name}
            maxLength={48}
            placeholder={t("server.local.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t("server.local.coreLabel")}</span>
          <select
            className={styles.select}
            value={core}
            aria-label={t("server.local.coreLabel")}
            onChange={(event) => setCore(event.target.value as iGM_LauncherV2_ServerCore)}
          >
            {IGM_SERVER_LOBBY_LOCAL_CORES.map((item) => (
              <option key={item} value={item}>
                {t(`server.local.coreNames.${item}`)}
              </option>
            ))}
          </select>
        </div>
        {/* 游戏版本：全量动态版本 + 输入搜索过滤 + 刷新版本列表 */}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t("server.local.versionLabel")}</span>
          <IGM_LauncherV2_VersionPicker
            value={version}
            onChange={setVersion}
            versions={catalog.versions}
            loading={catalog.loading}
            message={catalog.message}
            onRefresh={catalog.refresh}
          />
        </div>
        {/* 加载器版本：仅 Fabric / Forge / NeoForge 展示 */}
        {needLoader ? (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("server.local.loaderLabel")}</span>
            <input
              className={styles.input}
              value={loaderVersion}
              placeholder={t("server.local.loaderPlaceholder")}
              onChange={(event) => setLoaderVersion(event.target.value)}
            />
            <span className={styles.fieldHint}>
              <Info size={12} strokeWidth={2.2} />
              <span>{t("server.local.loaderHint")}</span>
            </span>
          </div>
        ) : null}

        {errorKey ? <p className={styles.toolHint}>{t(errorKey)}</p> : null}

        <button
          type="button"
          className={styles.localCreateButton}
          disabled={coreState !== null && coreState.phase !== "done" && coreState.phase !== "error"}
          onClick={create}
        >
          <Download size={14} strokeWidth={2.2} />
          <span>
            {coreState && coreState.phase !== "done" && coreState.phase !== "error"
              ? t("server.local.creating")
              : t("server.local.createConfirm")}
          </span>
        </button>
      </div>

      {/* 创建进度：核心状态非空时展示进度条与阶段文案，失败以错误色强调 */}
      {coreState ? (
        <div
          className={`${styles.syncBox} ${
            coreState.phase === "error" ? styles.syncBoxError : ""
          }`}
        >
          <div className={styles.syncHead}>
            <span className={styles.syncText}>
              {t(coreState.messageKey, coreState.messageParams)}
            </span>
            <span className={styles.syncPercent}>{statePercent}%</span>
          </div>
          <div className={styles.syncTrack}>
            <div
              className={`${styles.syncFill} ${
                coreState.phase === "error" ? styles.syncFillError : ""
              }`}
              style={{ width: `${statePercent}%` }}
            />
          </div>
        </div>
      ) : null}

      {local.message ? (
        <p className={styles.notice}>
          <Info size={13} strokeWidth={2.2} />
          <span>{local.message}</span>
        </p>
      ) : null}

      <div className={styles.localList}>
        <span className={styles.localListTitle}>{t("server.local.listTitle")}</span>
        {local.items.length === 0 ? (
          <p className={styles.toolHint}>{t("server.local.empty")}</p>
        ) : (
          <ul className={styles.localItems}>
            {local.items.map((item: iGM_LauncherV2_LocalServer) => (
              <IGM_LauncherV2_LocalServerItem
                key={item.id}
                item={item}
                runtime={local.runtimes[item.id]}
                logs={local.logs[item.id] ?? []}
                publishResult={local.publishResult}
                onStart={local.start}
                onStop={local.stop}
                onLoadLogs={local.loadLogs}
                onPublish={local.publish}
                onRemove={remove}
              />
            ))}
          </ul>
        )}
      </div>
    </IGM_LauncherV2_Card>
  );
}

/**
 * 客户端同步大厅卡片：展示一条由开服中心自动写入的同步记录。
 * 内容：名称、地址（ip:port）、客户端清单直链（点击经系统浏览器打开）、自动同步标签；
 *       清单未生成时展示缺失提示与服主侧说明；同步进度按回推 messageKey 实时展示；
 *       提供【启动并同步】（前端补种清单后进服）、【一键进服】与删除（仅 my: 前缀可删）。
 */
function IGM_LauncherV2_SyncHallCard({
  entry,
  syncState,
  syncHint,
  onSync,
  onJoin,
  onRemove,
}: {
  entry: iGM_LauncherV2_ServerEntry;
  syncState: iGM_LauncherV2_ServerSyncState | null;
  syncHint: boolean;
  onSync: (id: string) => void;
  onJoin: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations();
  const hasManifest = entry.manifest.trim().length > 0;
  const syncPercent = syncState ? Math.max(0, Math.min(100, syncState.percent)) : 0;

  return (
    <IGM_LauncherV2_Card className={styles.card}>
      <div className={styles.cardText}>
        <div className={styles.cardTitleLine}>
          <span className={styles.cardTitle}>{entry.name}</span>
          <span className={styles.tagMine}>{t("syncHall.badge")}</span>
          {/* 客户端清单状态标识：已生成为高亮，未生成为低饱和提示 */}
          {hasManifest ? (
            <span className={styles.tagManifestOn}>
              <CheckCircle2 size={12} strokeWidth={2.2} />
              <span>{t("server.manifestReady")}</span>
            </span>
          ) : (
            <span className={styles.tagManifestOff}>
              <FileJson size={12} strokeWidth={2.2} />
              <span>{t("server.manifestMissing")}</span>
            </span>
          )}
        </div>
        <span className={styles.cardSub}>
          {t("syncHall.address")}：{entry.ip}:{entry.port}
        </span>
      </div>

      {/* 客户端清单直链 / 缺失提示 */}
      {hasManifest ? (
        <div className={styles.syncField}>
          <span className={styles.syncFieldLabel}>{t("syncHall.manifest")}</span>
          <button
            type="button"
            className={styles.syncLink}
            title={entry.manifest}
            onClick={() => IGM_LauncherV2_OpenLink(entry.manifest)}
          >
            {entry.manifest}
          </button>
        </div>
      ) : (
        <div className={styles.syncMissing}>
          <FileJson size={13} strokeWidth={2.2} />
          <div className={styles.syncMissingText}>
            <span className={styles.syncMissingTitle}>
              {t("syncHall.manifestMissing")}
            </span>
            <span className={styles.syncMissingHint}>{t("syncHall.ownerHint")}</span>
          </div>
        </div>
      )}

      {/* 同步进度：仅在已开始同步该记录时展示，失败与完成分别用错误色 / 成功色 */}
      {syncState ? (
        <div
          className={`${styles.syncBox} ${
            syncState.phase === "error"
              ? styles.syncBoxError
              : syncState.phase === "done"
                ? styles.syncBoxDone
                : ""
          }`}
        >
          <div className={styles.syncHead}>
            <span className={styles.syncText}>
              {t(syncState.messageKey, syncState.messageParams)}
            </span>
            <span className={styles.syncPercent}>{syncPercent}%</span>
          </div>
          <div className={styles.syncTrack}>
            <div
              className={`${styles.syncFill} ${
                syncState.phase === "error"
                  ? styles.syncFillError
                  : syncState.phase === "done"
                    ? styles.syncFillDone
                    : ""
              }`}
              style={{ width: `${syncPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* 同步前置提示：未选择视界时点击同步按钮给出明确引导 */}
      {syncHint ? (
        <p className={styles.syncHintNotice}>
          <Info size={13} strokeWidth={2.2} />
          <span>{t("server.syncNeedHorizon")}</span>
        </p>
      ) : null}

      <div className={styles.cardActions}>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
          onClick={() => onSync(entry.id)}
        >
          <Play size={14} strokeWidth={2.2} />
          <span>{t("syncHall.launchAndSync")}</span>
        </button>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => onJoin(entry.id)}
        >
          <LogIn size={14} strokeWidth={2.2} />
          <span>{t("server.join")}</span>
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.iconButtonDanger}`}
          aria-label={t("server.deleteServer")}
          onClick={() => onRemove(entry.id)}
        >
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      </div>
    </IGM_LauncherV2_Card>
  );
}

/**
 * 方块广场服务器区块总入口。
 * 区块顺序：客户端同步大厅（自动同步房间）→ 开服中心（本地服务器）→ 客户端清单工作室；
 * 同步大厅数据来自 UseServerLobby 的 custom 条目，
 * 「启动并同步」经 UseServerCenter 投递 server:sync 并展示回推进度。
 */
export function iGM_LauncherV2_ServerLobby() {
  const t = useTranslations();
  const lobby = IGM_LauncherV2_UseServerLobby();
  const horizons = IGM_LauncherV2_UseHorizons();
  const center = IGM_LauncherV2_UseServerCenter();
  const [syncBlockedId, setSyncBlockedId] = useState<string | null>(null);

  // 同步目标视界：优先外壳记录的当前视界，其次列表首项；两者皆无时视为未选择
  const targetHorizonId = horizons.currentId || horizons.items[0]?.id || "";

  // 自动同步记录：由开服中心发布 / 同步流程写入（custom 为 true）
  const syncRecords = lobby.items.filter((entry) => entry.custom);

  /**
   * 启动并同步：写入目标视界目录。
   * 未选择视界时在对应卡片给出 server.syncNeedHorizon 引导，不投递无效指令。
   */
  const handleSync = (id: string) => {
    if (!targetHorizonId) {
      setSyncBlockedId(id);
      return;
    }
    setSyncBlockedId(null);
    center.sync(id, targetHorizonId);
  };

  return (
    <section className={styles.lobby}>
      {/* 客户端同步大厅：由开服中心自动写入的局域网同步记录 */}
      <div className={styles.syncHall}>
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 className={styles.title}>{t("syncHall.title")}</h2>
            <p className={styles.desc}>{t("syncHall.subtitle")}</p>
          </div>
        </header>

        {lobby.notice ? (
          <p className={styles.notice}>
            <Info size={13} strokeWidth={2.2} />
            <span>{lobby.notice}</span>
          </p>
        ) : null}

        {syncRecords.length === 0 ? (
          <div className={styles.empty}>
            <Server size={26} strokeWidth={1.8} className={styles.emptyIcon} />
            <p className={styles.emptyText}>{t("syncHall.empty")}</p>
          </div>
        ) : (
          <ul className={styles.grid}>
            {syncRecords.map((entry) => (
              <li key={entry.id}>
                <IGM_LauncherV2_SyncHallCard
                  entry={entry}
                  syncState={center.states[entry.id] ?? null}
                  syncHint={syncBlockedId === entry.id}
                  onSync={handleSync}
                  onJoin={lobby.join}
                  onRemove={lobby.remove}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 开服中心：下载服务端核心并创建本地服务器目录，含启停 / 日志 / 清单直链发布 */}
      <IGM_LauncherV2_LocalServerPanel />

      {/* 客户端清单工作室：为本地服务器生成 manifest.json 与客户端 ZIP 包 */}
      <IGM_LauncherV2_ManifestStudio />
    </section>
  );
}

// 导出 //
export default iGM_LauncherV2_ServerLobby;
