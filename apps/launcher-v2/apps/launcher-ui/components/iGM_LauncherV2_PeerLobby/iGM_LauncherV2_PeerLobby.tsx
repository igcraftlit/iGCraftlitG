/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_PeerLobby/iGM_LauncherV2_PeerLobby.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main·联机大厅（P2P）
 * 模块：iGM_LauncherV2_PeerLobby
 * 作用：联机大厅页：与「视界」深度绑定，打通「开服 -> 邀请 -> 进服」的完整闭环
 * 内容：顶部为连接状态区（按 mode 展示绿 / 黄 / 中性 / 灰状态点、主状态文案与当前线路标记，
 *       mode 为 idle 时提供「连接联机节点」按钮，另提供「刷新状态」）；
 *       视界选择：下拉框读取本地全部视界并显示绑定版本与加载器，作为联机房间的游戏目录；
 *       房主模式：选定视界后点击「创建联机房间」，先进入「正在建立 P2P 网络…」，
 *       成功后展示 6 位房间码与复制按钮，并提供「启动游戏并开服」与图文引导
 *       （进入游戏按 ESC 点【对局域网开放】并记下端口），房主填写端口（默认 25565）后
 *       「绑定端口并等待加入」，绑定完成后展示等待状态与当前人数；
 *       好友模式：输入 6 位房间码后「加入房间」，先展示「正在连接…」，成功后展示
 *       「已成功加入房主的局域网」与「启动游戏」按钮，并引导进入游戏点击【多人游戏】
 *       双击刷新出的局域网世界；
 *       底部为必需可见的「双方案说明」区块（含 UDP 局域网广播转发说明）；
 *       外壳提示以文案键 + 占位符参数回推，界面用 next-intl 解析并常驻展示
 * 说明：组件为纯展示层，所有联机能力与游戏拉起均由 Bun 主进程执行，
 *       界面只通过 iGM_LauncherV2_UsePeerLobby 与 iGM_LauncherV2_UseLaunch 投递指令并展示回推快照
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  CheckCircle2,
  Copy,
  Info,
  Link2,
  LogIn,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Server,
  Users,
  Wifi,
} from "lucide-react";
import { iGM_LauncherV2_Card as IGM_LauncherV2_Card } from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_UseHorizons as IGM_LauncherV2_UseHorizons,
  iGM_LauncherV2_UseLaunch as IGM_LauncherV2_UseLaunch,
  iGM_LauncherV2_UsePeerLobby as IGM_LauncherV2_UsePeerLobby,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import type { iGM_LauncherV2_PeerMode } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_PeerLobby.module.css";

// 类型定义 //

/** 房间码输入：仅承载数字字符，最长 6 位 */
type iGM_LauncherV2_PeerJoinInput = string;

/** 端口输入：仅承载数字字符，最长 5 位 */
type iGM_LauncherV2_PeerPortInput = string;

// 常量与文案 //

/** 房间码固定长度 */
const IGM_PEER_ROOM_CODE_LENGTH = 6;

/** 局域网端口默认值与上限位数 */
const IGM_PEER_PORT_DEFAULT = 25565;
const IGM_PEER_PORT_MAX_DIGITS = 5;

/** 复制房间码后的反馈停留时长（毫秒） */
const IGM_PEER_COPIED_DURATION = 1600;

/** 状态点样式：按连接模式映射到对应的圆点类名 */
const IGM_PEER_DOT_CLASS: Record<iGM_LauncherV2_PeerMode, string> = {
  community: styles.dotCommunity,
  public: styles.dotPublic,
  connecting: styles.dotConnecting,
  idle: styles.dotIdle,
};

/** 当前线路标记的文案键：未连接时不展示 */
const IGM_PEER_LINE_KEY: Record<iGM_LauncherV2_PeerMode, string> = {
  community: "peer.line.community",
  public: "peer.line.public",
  connecting: "",
  idle: "",
};

// 核心逻辑 //

/** 房间码过滤：剔除所有非数字字符并截断到 6 位 */
function iGM_NormalizeRoomCode(raw: string): iGM_LauncherV2_PeerJoinInput {
  return raw.replace(/\D/g, "").slice(0, IGM_PEER_ROOM_CODE_LENGTH);
}

/** 端口过滤：剔除所有非数字字符并截断到 5 位 */
function iGM_NormalizePort(raw: string): iGM_LauncherV2_PeerPortInput {
  return raw.replace(/\D/g, "").slice(0, IGM_PEER_PORT_MAX_DIGITS);
}

/** 视界下拉项展示文案：名称 + 绑定版本 + 加载器 */
function iGM_HorizonOptionLabel(
  name: string,
  versionId: string | undefined,
  loaderLabel: string | undefined,
): string {
  const parts = [name];
  if (versionId) parts.push(versionId);
  if (loaderLabel) parts.push(loaderLabel);
  return parts.join(" · ");
}

export function iGM_LauncherV2_PeerLobby() {
  const t = useTranslations();
  const lobby = IGM_LauncherV2_UsePeerLobby();
  const horizons = IGM_LauncherV2_UseHorizons();
  const launch = IGM_LauncherV2_UseLaunch();

  const [horizonId, setHorizonId] = useState("");
  const [joinInput, setJoinInput] = useState<iGM_LauncherV2_PeerJoinInput>("");
  const [portInput, setPortInput] = useState<iGM_LauncherV2_PeerPortInput>(
    String(IGM_PEER_PORT_DEFAULT),
  );
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  // 卸载时清理复制反馈定时器，避免在已卸载组件上触发 setState
  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const items = horizons.items;
  // 默认选中：外壳记录的当前视界，其次列表首项
  const effectiveHorizonId = horizonId || horizons.currentId || items[0]?.id || "";
  const selectedHorizon = useMemo(
    () => items.find((item) => item.id === effectiveHorizonId) ?? null,
    [items, effectiveHorizonId],
  );

  const roomCode = lobby.roomCode.trim();
  const inRoom = roomCode.length > 0;
  const hostMode = inRoom && lobby.host;
  const guestJoined = inRoom && !lobby.host && lobby.ready;
  const joinReady = joinInput.length === IGM_PEER_ROOM_CODE_LENGTH;
  const portValue = Math.trunc(Number(portInput || "0"));
  const portReady =
    portInput.length > 0 && portValue > 0 && portValue <= 65535;

  const lineKey = IGM_PEER_LINE_KEY[lobby.mode];
  const notice = lobby.messageKey ? t(lobby.messageKey, lobby.messageParams) : "";
  const peersText =
    lobby.peers > 0 ? t("peer.peers", { count: lobby.peers }) : t("peer.peersUnknown");

  // 进服方启动游戏使用当前视界，缺省回落到列表首项
  const guestLaunchId = horizons.currentId || items[0]?.id || "";

  /** 复制房间码：失败时静默处理，成功后展示短时「已复制」反馈 */
  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
    } catch {
      // 剪贴板不可用时不阻断交互，仅给出本地反馈
    }
    setCopied(true);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), IGM_PEER_COPIED_DURATION);
  };

  return (
    <section className={styles.lobby}>
      {/* 连接状态区 */}
      <IGM_LauncherV2_Card className={styles.statusCard}>
        <div className={styles.statusLine}>
          <span className={`${styles.dot} ${IGM_PEER_DOT_CLASS[lobby.mode]}`} aria-hidden />
          <span className={styles.statusText}>{t(lobby.statusKey)}</span>
          {lineKey ? <span className={styles.lineChip}>{t(lineKey)}</span> : null}
        </div>
        <div className={styles.statusActions}>
          {lobby.mode === "idle" ? (
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
              onClick={() => lobby.connect()}
            >
              <Wifi size={14} strokeWidth={2.2} />
              <span>{t("peer.connect")}</span>
            </button>
          ) : null}
          <button type="button" className={styles.actionButton} onClick={() => lobby.refresh()}>
            <RefreshCw size={14} strokeWidth={2.2} />
            <span>{t("common.refreshState")}</span>
          </button>
        </div>
      </IGM_LauncherV2_Card>

      {/* 外壳提示：非空时常驻展示为次级提示行 */}
      {notice ? (
        <p className={styles.notice}>
          <Info size={13} strokeWidth={2.2} />
          <span>{notice}</span>
        </p>
      ) : null}

      {/* 视界绑定：联机房间必须以某个视界作为游戏目录 */}
      <IGM_LauncherV2_Card className={styles.horizonCard}>
        <div className={styles.panelHead}>
          <Server size={15} strokeWidth={2.2} />
          <span className={styles.sectionLabel}>{t("peer.horizon.label")}</span>
        </div>
        {items.length === 0 ? (
          <p className={styles.panelDesc}>{t("peer.horizon.empty")}</p>
        ) : (
          <>
            <select
              className={styles.select}
              value={effectiveHorizonId}
              aria-label={t("peer.horizon.label")}
              disabled={inRoom}
              onChange={(event) => setHorizonId(event.target.value)}
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {iGM_HorizonOptionLabel(item.name, item.versionId, item.loaderLabel)}
                </option>
              ))}
            </select>
            <p className={styles.panelDesc}>
              {selectedHorizon
                ? t("peer.horizon.meta", {
                    version: selectedHorizon.versionId || t("common.unknown"),
                    loader: selectedHorizon.loaderLabel || t("common.unknown"),
                  })
                : t("peer.horizon.none")}
            </p>
          </>
        )}
      </IGM_LauncherV2_Card>

      {/* 房间操作区 */}
      <div className={styles.panels}>
        {/* 房主模式 */}
        <IGM_LauncherV2_Card className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.sectionLabel}>{t("peer.host.title")}</span>
            {hostMode ? <span className={styles.hostBadge}>{t("peer.host.badge")}</span> : null}
          </div>

          {!inRoom ? (
            <>
              <p className={styles.panelDesc}>{t("peer.host.desc")}</p>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                disabled={!effectiveHorizonId}
                onClick={() => lobby.create(effectiveHorizonId)}
              >
                <Plus size={14} strokeWidth={2.2} />
                <span>{t("peer.host.create")}</span>
              </button>
            </>
          ) : (
            <>
              <p className={styles.panelDesc}>{t("peer.host.inRoomDesc")}</p>

              {/* 房间码 + 复制 */}
              <div className={styles.codeRow}>
                <span className={styles.codeBlock} aria-label={t("peer.host.codeLabel")}>
                  {roomCode}
                </span>
                <button type="button" className={styles.actionButton} onClick={copyRoomCode}>
                  {copied ? (
                    <Check size={14} strokeWidth={2.2} />
                  ) : (
                    <Copy size={14} strokeWidth={2.2} />
                  )}
                  <span>{copied ? t("common.copied") : t("peer.host.copy")}</span>
                </button>
              </div>

              {/* 开服引导：先启动游戏，再对局域网开放并记下端口 */}
              <div className={styles.guideBox}>
                <span className={styles.guideTitle}>{t("peer.host.guideTitle")}</span>
                <p className={styles.guideText}>{t("peer.host.guide")}</p>
              </div>

              <button
                type="button"
                className={styles.actionButton}
                disabled={!lobby.horizonId}
                onClick={() => lobby.horizonId && launch.launch(lobby.horizonId)}
              >
                <Play size={14} strokeWidth={2.2} />
                <span>{t("peer.host.launchAndHost")}</span>
              </button>

              {/* 端口绑定：默认 25565，绑定后隧道开始转发 UDP 局域网广播；仅房主可见 */}
              <div className={styles.portField}>
                <span className={styles.portLabel}>{t("peer.host.portLabel")}</span>
                <div className={styles.portRow}>
                  <input
                    className={styles.portInput}
                    value={portInput}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={t("peer.host.portPlaceholder")}
                    aria-label={t("peer.host.portLabel")}
                    onChange={(event) => setPortInput(iGM_NormalizePort(event.target.value))}
                  />
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                    disabled={!portReady || lobby.ready}
                    onClick={() => lobby.bindPort(portValue)}
                  >
                    <Link2 size={14} strokeWidth={2.2} />
                    <span>{t("peer.host.bindPort")}</span>
                  </button>
                </div>
                <p className={styles.portHint}>{t("peer.host.portHint")}</p>
              </div>

              {lobby.ready ? (
                <p className={styles.successLine}>
                  <CheckCircle2 size={14} strokeWidth={2.2} className={styles.iconOk} />
                  <span>{t("peer.host.bound", { port: lobby.boundPort || portValue })}</span>
                </p>
              ) : null}

              <div className={styles.roomMeta}>
                <span className={styles.roomPeers}>
                  <Users size={13} strokeWidth={2.2} />
                  <span>{peersText}</span>
                </span>
              </div>

              <button type="button" className={styles.actionButton} onClick={() => lobby.leave()}>
                <LogOut size={14} strokeWidth={2.2} />
                <span>{t("peer.host.leave")}</span>
              </button>
            </>
          )}
        </IGM_LauncherV2_Card>

        {/* 好友模式 */}
        <IGM_LauncherV2_Card className={styles.panel}>
          <span className={styles.sectionLabel}>{t("peer.guest.title")}</span>

          {guestJoined ? (
            <>
              <p className={styles.successLine}>
                <CheckCircle2 size={14} strokeWidth={2.2} className={styles.iconOk} />
                <span>{t("peer.guest.joined")}</span>
              </p>
              <p className={styles.panelDesc}>{t("peer.guest.guide")}</p>
              <div className={styles.roomMeta}>
                <span className={styles.roomPeers}>
                  <Users size={13} strokeWidth={2.2} />
                  <span>{t("peer.guest.codeTag", { code: roomCode })}</span>
                </span>
              </div>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                disabled={!guestLaunchId}
                onClick={() => guestLaunchId && launch.launch(guestLaunchId)}
              >
                <Play size={14} strokeWidth={2.2} />
                <span>{t("peer.guest.launch")}</span>
              </button>
              <button type="button" className={styles.actionButton} onClick={() => lobby.leave()}>
                <LogOut size={14} strokeWidth={2.2} />
                <span>{t("peer.guest.leave")}</span>
              </button>
            </>
          ) : (
            <>
              <p className={styles.panelDesc}>{t("peer.guest.desc")}</p>
              <form
                className={styles.joinRow}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (joinReady) lobby.join(joinInput);
                }}
              >
                <input
                  className={styles.input}
                  value={joinInput}
                  maxLength={IGM_PEER_ROOM_CODE_LENGTH}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={t("peer.guest.placeholder")}
                  aria-label={t("peer.guest.placeholder")}
                  onChange={(event) => setJoinInput(iGM_NormalizeRoomCode(event.target.value))}
                />
                <button
                  type="submit"
                  className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                  disabled={!joinReady}
                >
                  <LogIn size={14} strokeWidth={2.2} />
                  <span>{t("peer.guest.action")}</span>
                </button>
              </form>
              {joinInput.length > 0 && !joinReady ? (
                <p className={styles.joinHint}>{t("peer.guest.hint")}</p>
              ) : null}
            </>
          )}
        </IGM_LauncherV2_Card>
      </div>

      {/* 双方案说明：主站高速节点优先，不可用时降级到公共节点；隧道转发 UDP 局域网广播 */}
      <IGM_LauncherV2_Card className={styles.infoCard}>
        <div className={styles.infoHead}>
          <Link2 size={15} strokeWidth={2.2} />
          <span className={styles.infoTitle}>{t("peer.info.title")}</span>
        </div>
        <p className={styles.infoText}>{t("peer.info.community")}</p>
        <p className={styles.infoText}>{t("peer.info.public")}</p>
        <p className={styles.infoText}>{t("peer.info.udp")}</p>
      </IGM_LauncherV2_Card>
    </section>
  );
}

// 导出 //
export default iGM_LauncherV2_PeerLobby;
