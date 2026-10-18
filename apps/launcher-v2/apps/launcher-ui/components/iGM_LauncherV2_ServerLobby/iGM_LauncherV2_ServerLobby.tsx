/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_ServerLobby/iGM_LauncherV2_ServerLobby.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main·方块广场·客户端同步大厅
 * 模块：iGM_LauncherV2_ServerLobby
 * 作用：客户端同步大厅：管理本地服务器条目，并为服务器生成客户端同步清单与本地开服
 * 内容：顶部为大厅标题与「添加服务器」入口；列表只展示用户本地添加的条目，
 *       每条可「启动并同步」（拉取外部清单并补齐 mods / config）或删除；
 *       下方内联展开「客户端清单工作室」（扫描目录、勾选文件、生成清单与 ZIP 包）与「本地开服」区块
 *       （选择核心与游戏版本创建本地服务器，展示创建进度与服务器列表）；
 *       添加服务器弹窗支持名称、地址、端口、官网链接与客户端同步清单 URL，提交后由外壳落盘；
 *       弹窗支持 Esc 与点击遮罩关闭；界面文案已接入多语言（next-intl，键为 server 与 common）
 * 说明：组件为纯展示层，所有网络请求与本地落盘均由 Bun 主进程执行，
 *       界面只通过 iGM_LauncherV2_UseServerLobby / UseServerCenter / UseLocalServers / UseHorizons
 *       投递指令并展示回推状态
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  CloudDownload,
  Download,
  ExternalLink,
  FileJson,
  Info,
  Play,
  Plus,
  Server,
  Trash2,
  X,
} from "lucide-react";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
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
  iGM_LauncherV2_ServerSyncState,
} from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_ServerLobby.module.css";

// 类型定义 //

/** 添加服务器表单字段（端口以字符串承载，便于输入过程中编辑） */
interface iGM_LauncherV2_ServerForm {
  name: string;
  ip: string;
  port: string;
  site: string;
  /** 客户端同步清单 URL（外部托管直链 JSON，可留空） */
  manifest: string;
}

// 常量与文案 //

/** 默认端口：与 Minecraft 服务端默认端口保持一致 */
const IGM_SERVER_LOBBY_DEFAULT_PORT = 25565;

/** 添加服务器表单初值 */
const IGM_SERVER_LOBBY_EMPTY_FORM: iGM_LauncherV2_ServerForm = {
  name: "",
  ip: "",
  port: String(IGM_SERVER_LOBBY_DEFAULT_PORT),
  site: "",
  manifest: "",
};

/** 本地开服可选服务端核心（展示名走 server.local.coreNames.* 多语言键） */
const IGM_SERVER_LOBBY_LOCAL_CORES: iGM_LauncherV2_ServerCore[] = [
  "vanilla",
  "paper",
  "fabric",
  "forge",
  "neoforge",
];

/** 本地开服可选游戏版本（一组常见 Java 版本常量） */
const IGM_SERVER_LOBBY_LOCAL_VERSIONS: string[] = [
  "1.21.4",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.1",
  "1.20",
  "1.19.4",
  "1.19.2",
  "1.18.2",
  "1.17.1",
  "1.16.5",
];

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

/**
 * 单张本地服务器条目卡片：展示名称、版本与客户端同步清单配置状态。
 * 提供「一键进服」「启动并同步」「访问官网」与删除；删除需 window.confirm 二次确认。
 */
function IGM_LauncherV2_ServerCard({
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
  // 是否已配置客户端同步清单（非空即视为已配置）
  const hasManifest = entry.manifest.trim().length > 0;
  // 同步进度百分比：收敛到 0-100，避免外壳回推异常值时进度条溢出
  const syncPercent = syncState ? Math.max(0, Math.min(100, syncState.percent)) : 0;

  return (
    <IGM_LauncherV2_Card className={styles.card}>
      <div className={styles.cardText}>
        <div className={styles.cardTitleLine}>
          <span className={styles.cardTitle}>{entry.name}</span>
          <span className={styles.tagMine}>{t("server.mine")}</span>
          {/* 客户端同步清单标识：已配置为高亮，未配置为低饱和提示 */}
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
          {entry.ip}:{entry.port}
        </span>
      </div>

      {/* 版本信息：远端已不再拉取，仅展示条目自身携带的版本标注 */}
      <div className={styles.meta}>
        <span className={styles.metaItem}>
          {t("server.versionLabel", { version: entry.version || t("server.versionUnknown") })}
        </span>
      </div>

      {/* 同步进度：仅在已开始同步该服务器时展示，失败与完成分别用错误色 / 成功色 */}
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
          className={styles.actionButton}
          onClick={() => onJoin(entry.id)}
        >
          <Play size={14} strokeWidth={2.2} />
          <span>{t("server.join")}</span>
        </button>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
          onClick={() => onSync(entry.id)}
        >
          <CloudDownload size={14} strokeWidth={2.2} />
          <span>{t("server.syncAction")}</span>
        </button>
        {/* 官网链接：条目填写了官网时才提供入口 */}
        {entry.site ? (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => window.open(entry.site, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink size={14} strokeWidth={2.2} />
            <span>{t("server.visitSite")}</span>
          </button>
        ) : null}
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

/** 添加服务器弹窗：名称与地址必填，端口默认 25565，官网链接与客户端同步清单 URL 选填 */
function IGM_LauncherV2_AddServerDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    ip: string;
    port: number;
    site: string;
    manifest: string;
  }) => void;
}) {
  const t = useTranslations();
  const [form, setForm] = useState<iGM_LauncherV2_ServerForm>(IGM_SERVER_LOBBY_EMPTY_FORM);

  // Esc 关闭弹窗
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const name = form.name.trim();
  const ip = form.ip.trim();
  const valid = name.length > 0 && ip.length > 0;

  /** 提交：端口非法时回退默认端口，避免落盘无效配置；清单 URL 去空白后提交 */
  const submit = () => {
    if (!valid) return;
    const parsed = Number.parseInt(form.port, 10);
    const port =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 65535
        ? parsed
        : IGM_SERVER_LOBBY_DEFAULT_PORT;
    onSubmit({ name, ip, port, site: form.site.trim(), manifest: form.manifest.trim() });
  };

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t("server.addServer")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{t("server.addServer")}</h2>
            <p className={styles.modalDesc}>{t("server.addDesc")}</p>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("server.closeDialog")}
            onClick={onClose}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        <form
          className={styles.fieldList}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("server.fieldName")}</span>
            <input
              className={styles.input}
              value={form.name}
              maxLength={48}
              placeholder={t("server.namePlaceholder")}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("server.fieldIp")}</span>
            <input
              className={styles.input}
              value={form.ip}
              placeholder={t("server.ipPlaceholder")}
              onChange={(event) => setForm({ ...form, ip: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("server.fieldPort")}</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={65535}
              value={form.port}
              placeholder={t("server.portPlaceholder")}
              onChange={(event) => setForm({ ...form, port: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("server.fieldSite")}</span>
            <input
              className={styles.input}
              value={form.site}
              placeholder={t("server.sitePlaceholder")}
              onChange={(event) => setForm({ ...form, site: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("server.manifestField")}</span>
            <input
              className={styles.input}
              value={form.manifest}
              placeholder={t("server.manifestPlaceholder")}
              onChange={(event) => setForm({ ...form, manifest: event.target.value })}
            />
            <span className={styles.fieldHint}>
              <FileJson size={12} strokeWidth={2.2} />
              <span>{t("server.manifestHint")}</span>
            </span>
          </label>

          <div className={styles.modalFoot}>
            <button type="button" className={styles.actionButton} onClick={onClose}>
              <span>{t("common.cancel")}</span>
            </button>
            <button
              type="submit"
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
              disabled={!valid}
            >
              <Plus size={14} strokeWidth={2.2} />
              <span>{t("common.add")}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * 本地开服区块：选择服务端核心与游戏版本，由外壳下载核心并创建本地服务器目录。
 * 创建进度经 server:core 回推实时展示，完成后列表自动刷新；删除需二次确认。
 */
function IGM_LauncherV2_LocalServerPanel() {
  const t = useTranslations();
  const local = IGM_LauncherV2_UseLocalServers();
  const [name, setName] = useState("");
  const [core, setCore] = useState<iGM_LauncherV2_ServerCore>("vanilla");
  const [version, setVersion] = useState("");
  const [loaderVersion, setLoaderVersion] = useState("");
  const [errorKey, setErrorKey] = useState("");

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
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t("server.local.versionLabel")}</span>
          <select
            className={styles.select}
            value={version}
            aria-label={t("server.local.versionLabel")}
            onChange={(event) => setVersion(event.target.value)}
          >
            <option value="">{t("server.local.versionPlaceholder")}</option>
            {IGM_SERVER_LOBBY_LOCAL_VERSIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
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
              <li key={item.id} className={styles.localItem}>
                <div className={styles.localItemRow}>
                  <span className={styles.cardTitle}>{item.name}</span>
                  <span className={styles.metaItem}>
                    {t(`server.local.coreNames.${item.core}`)}
                  </span>
                  <span className={styles.metaItem}>{item.gameVersion}</span>
                  {item.loaderVersion ? (
                    <span className={styles.metaItem}>{item.loaderVersion}</span>
                  ) : null}
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                    aria-label={t("server.local.remove")}
                    onClick={() => remove(item.id)}
                  >
                    <Trash2 size={15} strokeWidth={2.2} />
                  </button>
                </div>
                <span className={styles.localDir}>
                  {t("server.local.dirLabel")}：{item.dir}
                </span>
                <span className={styles.cardSub}>
                  {t("server.local.createdAt", {
                    time: iGM_LauncherV2_FormatTime(item.createdAt),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </IGM_LauncherV2_Card>
  );
}

export function iGM_LauncherV2_ServerLobby() {
  const t = useTranslations();
  const lobby = IGM_LauncherV2_UseServerLobby();
  const horizons = IGM_LauncherV2_UseHorizons();
  const center = IGM_LauncherV2_UseServerCenter();
  const [addOpen, setAddOpen] = useState(false);
  const [syncBlockedId, setSyncBlockedId] = useState<string | null>(null);

  // 同步目标视界：优先外壳记录的当前视界，其次列表首项；两者皆无时视为未选择
  const targetHorizonId = horizons.currentId || horizons.items[0]?.id || "";

  // 列表仅展示用户本地添加的条目，不再拉取远端公开列表
  const entries = lobby.items.filter((entry) => entry.custom);

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
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>{t("server.hall.title")}</h2>
          <p className={styles.desc}>{t("server.hall.desc")}</p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
            onClick={() => setAddOpen(true)}
          >
            <Plus size={14} strokeWidth={2.2} />
            <span>{t("server.addServer")}</span>
          </button>
        </div>
      </header>

      {lobby.notice ? (
        <p className={styles.notice}>
          <Info size={13} strokeWidth={2.2} />
          <span>{lobby.notice}</span>
        </p>
      ) : null}

      {entries.length === 0 ? (
        <div className={styles.empty}>
          <Server size={26} strokeWidth={1.8} className={styles.emptyIcon} />
          <p className={styles.emptyText}>{t("server.emptyLoaded")}</p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <IGM_LauncherV2_ServerCard
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

      {/* 服务器管理：客户端清单工作室，为所选本地服务器生成同步清单 */}
      <IGM_LauncherV2_ManifestStudio />

      {/* 本地开服：下载服务端核心并创建本地服务器目录 */}
      <IGM_LauncherV2_LocalServerPanel />

      {addOpen ? (
        <IGM_LauncherV2_AddServerDialog
          onClose={() => setAddOpen(false)}
          onSubmit={(input) => {
            lobby.add(input);
            setAddOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

// 导出 //
export default iGM_LauncherV2_ServerLobby;
