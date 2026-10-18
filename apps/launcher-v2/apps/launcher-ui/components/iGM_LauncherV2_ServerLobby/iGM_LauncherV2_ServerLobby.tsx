/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_ServerLobby/iGM_LauncherV2_ServerLobby.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main·服务器大厅
 * 模块：iGM_LauncherV2_ServerLobby
 * 作用：服务器大厅页：展示公开服务器列表与自定义服务器，支持状态查询与一键进服
 * 内容：顶部为来源说明与工具栏（「刷新列表」「刷新状态」「添加服务器」，说明文案随列表来源变化）；
 *       列表按热度（在线人数）降序排列，自定义服务器始终置顶，热门服务器带「热门」标签；
 *       卡片展示图标、名称、地址、版本与在线人数，
 *       并提供一键进服、查询状态、访问官网与删除自定义服务器等操作；
 *       卡片内展示查询到的实时状态（在线 / 离线、人数、延迟与 MOTD）；
 *       添加服务器弹窗支持名称、地址、端口与官网链接，提交后由外壳落盘；
 *       弹窗支持 Esc 与点击遮罩关闭；
 *       界面文案已接入多语言（next-intl，键为 server 与 common）
 * 说明：组件为纯展示层，所有网络请求与本地落盘均由 Bun 主进程执行，
 *       界面只通过 iGM_LauncherV2_UseServerLobby 投递指令并展示回推状态
 */

// 导入依赖 //
"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  ExternalLink,
  Flame,
  Gauge,
  Info,
  Play,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
  iGM_LauncherV2_StatusDot as IGM_LauncherV2_StatusDot,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_OpenLink as IGM_LauncherV2_OpenLink,
  iGM_LauncherV2_UseServerLobby as IGM_LauncherV2_UseServerLobby,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import type {
  iGM_LauncherV2_ServerEntry,
  iGM_LauncherV2_ServerStatus,
} from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_ServerLobby.module.css";

// 类型定义 //

/** 列表来源：远端接口 / 本地缓存 / 空 */
type iGM_LauncherV2_ServerSource = "remote" | "cache" | "empty";

/** 模块级辅助函数所需的翻译函数签名（t 由组件显式传入，避免在组件外调用 Hook） */
type iGM_LauncherV2_ServerLobbyTranslate = ReturnType<typeof useTranslations>;

/** 添加服务器表单字段（端口以字符串承载，便于输入过程中编辑） */
interface iGM_LauncherV2_ServerForm {
  name: string;
  ip: string;
  port: string;
  site: string;
}

// 常量与文案 //

/** 默认端口：与 Minecraft 服务端默认端口保持一致 */
const IGM_SERVER_LOBBY_DEFAULT_PORT = 25565;

/** 热门阈值：状态在线且在线人数达到该值时标记为「热门」 */
const IGM_SERVER_LOBBY_HOT_THRESHOLD = 1000;

/** 列表来源说明文案（值为 i18n 键，界面侧以 useTranslations 解析） */
const IGM_SERVER_LOBBY_SOURCE_TEXT: Record<iGM_LauncherV2_ServerSource, string> = {
  remote: "server.source.remote",
  cache: "server.source.cache",
  empty: "server.source.empty",
};

/** 拉取中的说明文案（值为 i18n 键） */
const IGM_SERVER_LOBBY_LOADING_TEXT = "server.loadingList";

/** 添加服务器表单初值 */
const IGM_SERVER_LOBBY_EMPTY_FORM: iGM_LauncherV2_ServerForm = {
  name: "",
  ip: "",
  port: String(IGM_SERVER_LOBBY_DEFAULT_PORT),
  site: "",
};

// 核心逻辑 //

/** 服务器图标：地址为空或加载失败时回退到 lucide 的 Server 图标，避免出现破损图片 */
function IGM_LauncherV2_ServerIcon({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <Server size={22} strokeWidth={2.1} className={styles.iconFallback} aria-label={alt} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={44}
      height={44}
      className={styles.iconImage}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

/** 在线人数文案：任一未知（-1）即显示「人数未知」，否则给出「在线 X / Y」（t 由组件传入，避免在组件外调用 Hook） */
function IGM_LauncherV2_FormatPlayers(
  players: number,
  maxPlayers: number,
  t: iGM_LauncherV2_ServerLobbyTranslate,
): string {
  if (players < 0 || maxPlayers < 0) return t("server.playersUnknown");
  return t("server.players", { online: players, max: maxPlayers });
}

/** 单张服务器卡片：展示基本信息、实时状态与操作按钮 */
function IGM_LauncherV2_ServerCard({
  entry,
  status,
  onQuery,
  onJoin,
  onRemove,
}: {
  entry: iGM_LauncherV2_ServerEntry;
  status: iGM_LauncherV2_ServerStatus | null;
  onQuery: (id: string) => void;
  onJoin: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations();
  // 生效人数：已查询且在线时取实时值，否则回退到列表自带人数（未知为 -1）
  const effectivePlayers = status && status.online ? status.players : entry.players;
  const effectiveMaxPlayers = status && status.online ? status.maxPlayers : entry.maxPlayers;
  // 热门：仅在状态在线且实时人数达到阈值时标记
  const isHot = status?.online === true && status.players >= IGM_SERVER_LOBBY_HOT_THRESHOLD;

  return (
    <IGM_LauncherV2_Card className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.iconBox}>
          <IGM_LauncherV2_ServerIcon
            src={entry.icon}
            alt={t("server.iconAlt", { name: entry.name })}
          />
        </span>
        <div className={styles.cardText}>
          <div className={styles.cardTitleLine}>
            <span className={styles.cardTitle}>{entry.name}</span>
            {entry.custom ? <span className={styles.tagMine}>{t("server.mine")}</span> : null}
            {isHot ? (
              <span className={styles.tagHot}>
                <Flame size={12} strokeWidth={2.2} />
                <span>{t("server.hot")}</span>
              </span>
            ) : null}
            {status ? (
              <IGM_LauncherV2_StatusDot tone={status.online ? "ok" : "warn"}>
                {status.online ? t("server.online") : t("server.offline")}
              </IGM_LauncherV2_StatusDot>
            ) : null}
          </div>
          <span className={styles.cardSub}>
            {entry.ip}:{entry.port}
          </span>
        </div>
      </div>

      <div className={styles.meta}>
        <span className={styles.metaItem}>{entry.version || t("server.versionUnknown")}</span>
        <span className={styles.metaItem}>
          {IGM_LauncherV2_FormatPlayers(effectivePlayers, effectiveMaxPlayers, t)}
        </span>
      </div>

      {/* 实时状态区：仅在已查询到该服务器状态时展示 */}
      {status ? (
        <div className={styles.statusBox}>
          <div className={styles.statusHead}>
            {status.latency >= 0 ? (
              <span className={styles.statusMetric}>{t("server.latency", { ms: status.latency })}</span>
            ) : null}
            {status.version ? (
              <span className={styles.statusMetric}>
                {t("server.versionLabel", { version: status.version })}
              </span>
            ) : null}
          </div>
          {status.motd ? <p className={styles.statusMotd}>{status.motd}</p> : null}
        </div>
      ) : null}

      <div className={styles.cardActions}>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
          onClick={() => onJoin(entry.id)}
        >
          <Play size={14} strokeWidth={2.2} />
          <span>{t("server.join")}</span>
        </button>
        <button type="button" className={styles.actionButton} onClick={() => onQuery(entry.id)}>
          <Activity size={14} strokeWidth={2.2} />
          <span>{t("server.queryStatus")}</span>
        </button>
        {entry.site ? (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => IGM_LauncherV2_OpenLink(entry.site)}
          >
            <ExternalLink size={14} strokeWidth={2.2} />
            <span>{t("server.visitSite")}</span>
          </button>
        ) : null}
        {entry.custom ? (
          <button
            type="button"
            className={`${styles.iconButton} ${styles.iconButtonDanger}`}
            aria-label={t("server.deleteServer")}
            onClick={() => onRemove(entry.id)}
          >
            <Trash2 size={15} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
    </IGM_LauncherV2_Card>
  );
}

/** 添加服务器弹窗：名称与地址必填，端口默认 25565，官网链接选填 */
function IGM_LauncherV2_AddServerDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: { name: string; ip: string; port: number; site: string }) => void;
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

  /** 提交：端口非法时回退默认端口，避免落盘无效配置 */
  const submit = () => {
    if (!valid) return;
    const parsed = Number.parseInt(form.port, 10);
    const port =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 65535
        ? parsed
        : IGM_SERVER_LOBBY_DEFAULT_PORT;
    onSubmit({ name, ip, port, site: form.site.trim() });
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

export function iGM_LauncherV2_ServerLobby() {
  const t = useTranslations();
  const lobby = IGM_LauncherV2_UseServerLobby();
  const [addOpen, setAddOpen] = useState(false);

  // 热度排序：自定义服务器始终置顶，组内与公开列表均按生效人数降序（未知置底）再按名称
  const ordered = useMemo(() => {
    const liveCount = (entry: iGM_LauncherV2_ServerEntry): number => {
      const status = lobby.statuses[entry.id];
      return status && status.online ? status.players : entry.players;
    };
    const compare = (left: iGM_LauncherV2_ServerEntry, right: iGM_LauncherV2_ServerEntry): number => {
      const leftCount = liveCount(left);
      const rightCount = liveCount(right);
      const leftRank = leftCount < 0 ? Number.NEGATIVE_INFINITY : leftCount;
      const rightRank = rightCount < 0 ? Number.NEGATIVE_INFINITY : rightCount;
      if (rightRank !== leftRank) return rightRank - leftRank;
      return left.name.localeCompare(right.name, "zh-Hans-CN");
    };
    const mine = lobby.items.filter((entry) => entry.custom).sort(compare);
    const others = lobby.items.filter((entry) => !entry.custom).sort(compare);
    return [...mine, ...others];
  }, [lobby.items, lobby.statuses]);

  const summary = lobby.loading
    ? t(IGM_SERVER_LOBBY_LOADING_TEXT)
    : t(IGM_SERVER_LOBBY_SOURCE_TEXT[lobby.source]);

  return (
    <section className={styles.lobby}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.desc}>{summary}</p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.actionButton}
            disabled={lobby.loading}
            onClick={() => lobby.refresh()}
          >
            <RefreshCw size={14} strokeWidth={2.2} />
            <span>{t("common.refresh")}</span>
          </button>
          <button
            type="button"
            className={`${styles.actionButton}${lobby.refreshing ? ` ${styles.actionButtonBusy}` : ""}`}
            disabled={lobby.refreshing}
            onClick={() => lobby.refreshStatuses()}
          >
            <Gauge size={14} strokeWidth={2.2} />
            <span>{lobby.refreshing ? t("server.refreshing") : t("common.refreshState")}</span>
          </button>
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

      {/* 结果提示：拉取期间不展示，避免与顶部说明文案重复 */}
      {!lobby.loading && lobby.message ? (
        <p className={styles.notice}>
          <Info size={13} strokeWidth={2.2} />
          <span>{lobby.message}</span>
        </p>
      ) : null}

      {ordered.length === 0 ? (
        <div className={styles.empty}>
          <Server size={26} strokeWidth={1.8} className={styles.emptyIcon} />
          <p className={styles.emptyText}>
            {lobby.loaded
              ? t("server.emptyLoaded")
              : t("server.preparing")}
          </p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {ordered.map((entry) => (
            <li key={entry.id}>
              <IGM_LauncherV2_ServerCard
                entry={entry}
                status={lobby.statuses[entry.id] ?? null}
                onQuery={lobby.queryStatus}
                onJoin={lobby.join}
                onRemove={lobby.remove}
              />
            </li>
          ))}
        </ul>
      )}

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
