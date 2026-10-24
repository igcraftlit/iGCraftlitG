/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_PeerLobby/iGM_LauncherV2_PeerLobby.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main·联机大厅（P2P）
 * 模块：iGM_LauncherV2_PeerLobby
 * 作用：联机大厅页：以状态机分离「模式选择 / 房主模式 / 好友模式」三段交互流
 * 内容：顶部为连接状态条（状态点、主状态文案、当前线路标记，未连接时提供「连接联机节点」，
 *       另提供「刷新状态」）；
 *       初始状态：屏幕中央并排展示两张磨砂玻璃质感的大卡片
 *       【成为房主】（Crown）与【进入房间】（LogIn），点击后平滑切换到对应操作界面；
 *       房主模式：左上角「返回」回到模式选择；下拉框选择本地视界，
 *       「创建联机房间」后生成「6 位数字 + 1 位大写字母」的房间码并提供复制按钮；
 *       随后提供「启动游戏并开服」与开服引导，房主填写局域网端口（默认 25565）后
 *       「绑定端口并等待加入」，状态转为「等待好友加入中…」；
 *       房间内实时展示真实连接人数与成员名单（头像 + 昵称 + 房主标记），
 *       数据由外壳的联机节点回推与本地轮询同步，界面不做静态假设；
 *       好友模式：左上角「返回」回到模式选择；仅提供房间码输入框与「加入房间」按钮，
 *       严禁出现任何端口设置；连接成功后显示「已成功加入」与「启动游戏」按钮，
 *       并提示进入游戏点击【多人游戏】刷新；
 *       页面底部不再保留任何联机方案说明文字，保持界面干净；
 *       外壳提示以文案键 + 占位符参数回推，界面用 next-intl 解析并常驻展示
 * 说明：组件为纯展示层，所有联机能力与游戏拉起均由 Bun 主进程执行，
 *       界面只通过 iGM_LauncherV2_UsePeerLobby 与 iGM_LauncherV2_UseLaunch 投递指令并展示回推快照
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Crown,
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
import type {
  iGM_LauncherV2_PeerMode,
  iGM_LauncherV2_PeerPlayer,
} from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_PeerLobby.module.css";

// 类型定义 //

/** 联机大厅界面状态：模式选择 / 房主模式 / 好友模式 */
type iGM_LauncherV2_PeerScreen = "select" | "host" | "guest";

/** 房间码输入：6 位数字 + 1 位字母，统一以大写承载 */
type iGM_LauncherV2_PeerJoinInput = string;

/** 端口输入：仅承载数字字符，最长 5 位 */
type iGM_LauncherV2_PeerPortInput = string;

// 常量与文案 //

/** 房间码：6 位数字 + 1 位字母，共 7 位 */
const IGM_PEER_ROOM_CODE_DIGITS = 6;
const IGM_PEER_ROOM_CODE_LETTERS = 1;
const IGM_PEER_ROOM_CODE_LENGTH = IGM_PEER_ROOM_CODE_DIGITS + IGM_PEER_ROOM_CODE_LETTERS;

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

/**
 * 房间码过滤：仅保留数字与字母，统一转为大写并截断到 7 位。
 * 允许用户粘贴形如「123456a」的小写房间码，输入框内自动归一化为「123456A」。
 */
function iGM_NormalizeRoomCode(raw: string): iGM_LauncherV2_PeerJoinInput {
  return raw
    .replace(/[^0-9a-z]/gi, "")
    .toUpperCase()
    .slice(0, IGM_PEER_ROOM_CODE_LENGTH);
}

/** 房间码完整性：前 6 位为数字、末位为字母 */
function iGM_RoomCodeReady(code: string): boolean {
  return new RegExp(`^\\d{${IGM_PEER_ROOM_CODE_DIGITS}}[A-Z]$`).test(code);
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

/**
 * 成员头像：有头像地址时显示图片，缺失或加载失败时回退为首字母圆形底衬，
 * 避免出现破损图片或纯白块。
 */
function IGM_LauncherV2_PeerAvatar({
  player,
  label,
}: {
  player: iGM_LauncherV2_PeerPlayer;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = player.avatar.length > 0 && !failed;
  const initial = player.name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <span className={styles.avatar} aria-hidden>
      {showImage ? (
        <img
          className={styles.avatarImage}
          src={player.avatar}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.avatarFallback} title={label}>
          {initial}
        </span>
      )}
    </span>
  );
}

export function iGM_LauncherV2_PeerLobby() {
  const t = useTranslations();
  const lobby = IGM_LauncherV2_UsePeerLobby();
  const horizons = IGM_LauncherV2_UseHorizons();
  const launch = IGM_LauncherV2_UseLaunch();

  const [screen, setScreen] = useState<iGM_LauncherV2_PeerScreen>("select");
  const [horizonId, setHorizonId] = useState("");
  const [joinInput, setJoinInput] = useState<iGM_LauncherV2_PeerJoinInput>("");
  const [portInput, setPortInput] = useState<iGM_LauncherV2_PeerPortInput>(
    String(IGM_PEER_PORT_DEFAULT),
  );
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  /** 自动路由只执行一次：已存在房间时直接落到对应模式界面，之后不再打断用户操作 */
  const autoRouted = useRef(false);

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
  const joinReady = iGM_RoomCodeReady(joinInput);
  const portValue = Math.trunc(Number(portInput || "0"));
  const portReady = portInput.length > 0 && portValue > 0 && portValue <= 65535;

  // 房间已存在（例如从其它界面返回）时，直接进入对应模式界面
  useEffect(() => {
    if (autoRouted.current || !roomCode) return;
    autoRouted.current = true;
    setScreen(lobby.host ? "host" : "guest");
  }, [roomCode, lobby.host]);

  const lineKey = IGM_PEER_LINE_KEY[lobby.mode];
  const notice = lobby.messageKey ? t(lobby.messageKey, lobby.messageParams) : "";
  /** 实时人数文案：以节点回推的真实连接数为准，不做静态推演 */
  const peersText = t("peer.peers", { count: lobby.peers });

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

  /** 退出房间：外壳清理联机状态，界面回到模式选择 */
  const leaveRoom = () => {
    lobby.leave();
    setScreen("select");
    setJoinInput("");
  };

  return (
    <section className={styles.lobby}>
      {/* 连接状态条：所有界面共用，未连接时可直接发起连接 */}
      <div className={styles.statusBar}>
        <span className={`${styles.dot} ${IGM_PEER_DOT_CLASS[lobby.mode]}`} aria-hidden />
        <span className={styles.statusText}>{t(lobby.statusKey)}</span>
        {lineKey ? <span className={styles.lineChip}>{t(lineKey)}</span> : null}
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
      </div>

      {/* 外壳提示：非空时常驻展示为次级提示行 */}
      {notice ? (
        <p className={styles.notice}>
          <Info size={13} strokeWidth={2.2} />
          <span>{notice}</span>
        </p>
      ) : null}

      {/* 初始状态：模式选择 */}
      {screen === "select" ? (
        <div className={styles.modeScreen}>
          <div className={styles.modeGrid}>
            <button type="button" className={styles.modeCard} onClick={() => setScreen("host")}>
              <span className={styles.modeIcon} aria-hidden>
                <Crown size={22} strokeWidth={2.1} />
              </span>
              <span className={styles.modeTitle}>{t("peer.mode.hostTitle")}</span>
              <span className={styles.modeDesc}>{t("peer.mode.hostDesc")}</span>
              <span className={styles.modeArrow} aria-hidden>
                <ChevronRight size={16} strokeWidth={2.2} />
              </span>
            </button>

            <button type="button" className={styles.modeCard} onClick={() => setScreen("guest")}>
              <span className={styles.modeIcon} aria-hidden>
                <LogIn size={22} strokeWidth={2.1} />
              </span>
              <span className={styles.modeTitle}>{t("peer.mode.guestTitle")}</span>
              <span className={styles.modeDesc}>{t("peer.mode.guestDesc")}</span>
              <span className={styles.modeArrow} aria-hidden>
                <ChevronRight size={16} strokeWidth={2.2} />
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {/* 房主模式 */}
      {screen === "host" ? (
        <>
          <div className={styles.screenHead}>
            <button type="button" className={styles.actionButton} onClick={() => setScreen("select")}>
              <ArrowLeft size={14} strokeWidth={2.2} />
              <span>{t("peer.mode.back")}</span>
            </button>
            <span className={styles.screenTitle}>{t("peer.mode.hostTitle")}</span>
          </div>

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
                  <>
                    <p className={styles.successLine}>
                      <CheckCircle2 size={14} strokeWidth={2.2} className={styles.iconOk} />
                      <span>{t("peer.host.bound", { port: lobby.boundPort || portValue })}</span>
                    </p>
                    <p className={styles.waitingLine}>
                      <span className={styles.dotWaiting} aria-hidden />
                      <span>{t("peer.host.waiting")}</span>
                    </p>
                  </>
                ) : null}

                {/* 实时人数与成员名单：头像 + 昵称 + 房主标记，由外壳回推的真实连接状态驱动 */}
                <div className={styles.rosterBox}>
                  <div className={styles.rosterHead}>
                    <span className={styles.rosterTitle}>{t("peer.members.title")}</span>
                    <span className={styles.rosterCount}>
                      <Users size={13} strokeWidth={2.2} />
                      <span>{peersText}</span>
                    </span>
                  </div>
                  {lobby.players.length > 0 ? (
                    <ul className={styles.rosterList}>
                      {lobby.players.map((player) => (
                        <li key={`${player.id}-${player.name}`} className={styles.rosterItem}>
                          <IGM_LauncherV2_PeerAvatar
                            player={player}
                            label={t("peer.members.avatarAlt", { name: player.name })}
                          />
                          <span className={styles.rosterName}>{player.name}</span>
                          {player.host ? (
                            <span className={styles.rosterTag}>{t("peer.members.host")}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.rosterEmpty}>{t("peer.members.empty")}</p>
                  )}
                </div>

                <button type="button" className={styles.actionButton} onClick={leaveRoom}>
                  <LogOut size={14} strokeWidth={2.2} />
                  <span>{t("peer.host.leave")}</span>
                </button>
              </>
            )}
          </IGM_LauncherV2_Card>
        </>
      ) : null}

      {/* 好友模式：不含任何端口设置 */}
      {screen === "guest" ? (
        <>
          <div className={styles.screenHead}>
            <button type="button" className={styles.actionButton} onClick={() => setScreen("select")}>
              <ArrowLeft size={14} strokeWidth={2.2} />
              <span>{t("peer.mode.back")}</span>
            </button>
            <span className={styles.screenTitle}>{t("peer.mode.guestTitle")}</span>
          </div>

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
                <button type="button" className={styles.actionButton} onClick={leaveRoom}>
                  <LogOut size={14} strokeWidth={2.2} />
                  <span>{t("peer.guest.leave")}</span>
                </button>
              </>
            ) : inRoom ? (
              <>
                {/* 已提交房间码、正在建立连接 */}
                <p className={styles.panelDesc}>{t(lobby.statusKey)}</p>
                <div className={styles.roomMeta}>
                  <span className={styles.roomPeers}>
                    <Users size={13} strokeWidth={2.2} />
                    <span>{t("peer.guest.codeTag", { code: roomCode })}</span>
                  </span>
                </div>
                <button type="button" className={styles.actionButton} onClick={leaveRoom}>
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
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
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
        </>
      ) : null}
    </section>
  );
}

// 导出 //
export default iGM_LauncherV2_PeerLobby;
