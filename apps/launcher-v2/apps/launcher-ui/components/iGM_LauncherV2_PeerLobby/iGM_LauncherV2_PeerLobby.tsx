/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_PeerLobby/iGM_LauncherV2_PeerLobby.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main·联机大厅（P2P）
 * 模块：iGM_LauncherV2_PeerLobby
 * 作用：联机大厅页：展示联机节点连接状态，并支持创建 / 加入 / 退出房间
 * 内容：顶部为连接状态区（按 mode 展示绿 / 黄 / 中性 / 灰状态点与主状态文案），
 *       mode 为 idle 时提供「连接联机节点」按钮，另提供「刷新状态」；
 *       中部为房间操作区：创建房间（进入房间后展示房间码、复制房间码、房主标记、当前人数与退出房间）
 *       与加入房间（6 位数字房间码输入 + 加入按钮，非 6 位时禁用并给出提示）；
 *       底部为必需可见的「双方案说明」区块；
 *       外壳提示 message 以次级提示行常驻展示
 * 说明：组件为纯展示层，所有联机能力均由 Bun 主进程执行，
 *       界面只通过 iGM_LauncherV2_UsePeerLobby 投递指令并展示回推快照
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Info,
  Link2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Users,
  Wifi,
} from "lucide-react";
import { iGM_LauncherV2_Card as IGM_LauncherV2_Card } from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import { iGM_LauncherV2_UsePeerLobby as IGM_LauncherV2_UsePeerLobby } from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import type { iGM_LauncherV2_PeerMode } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_PeerLobby.module.css";

// 类型定义 //

/** 房间码输入：仅承载数字字符，最长 6 位 */
type iGM_LauncherV2_PeerJoinInput = string;

// 常量与文案 //

/** 房间码固定长度 */
const IGM_PEER_ROOM_CODE_LENGTH = 6;

/** 复制房间码后的反馈停留时长（毫秒） */
const IGM_PEER_COPIED_DURATION = 1600;

/** 主状态文案：按连接模式给出确定性文案，避免依赖外壳回推顺序 */
const IGM_PEER_STATUS_TEXT: Record<iGM_LauncherV2_PeerMode, string> = {
  community: "已连接主站高速联机节点",
  public: "已连接公共联机节点（可能稍有延迟）",
  connecting: "正在连接联机节点…",
  idle: "尚未连接联机节点",
};

/** 状态点样式：按连接模式映射到对应的圆点类名 */
const IGM_PEER_DOT_CLASS: Record<iGM_LauncherV2_PeerMode, string> = {
  community: styles.dotCommunity,
  public: styles.dotPublic,
  connecting: styles.dotConnecting,
  idle: styles.dotIdle,
};

// 核心逻辑 //

/** 房间码过滤：剔除所有非数字字符并截断到 6 位 */
function iGM_NormalizeRoomCode(raw: string): iGM_LauncherV2_PeerJoinInput {
  return raw.replace(/\D/g, "").slice(0, IGM_PEER_ROOM_CODE_LENGTH);
}

export function iGM_LauncherV2_PeerLobby() {
  const lobby = IGM_LauncherV2_UsePeerLobby();
  const [joinInput, setJoinInput] = useState<iGM_LauncherV2_PeerJoinInput>("");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  // 卸载时清理复制反馈定时器，避免在已卸载组件上触发 setState
  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const roomCode = lobby.roomCode.trim();
  const inRoom = roomCode.length > 0;
  const joinReady = joinInput.length === IGM_PEER_ROOM_CODE_LENGTH;

  const primaryStatus = IGM_PEER_STATUS_TEXT[lobby.mode];
  const shellStatus = lobby.status.trim();
  // 主状态文案已确定，仅在外壳给出不同的补充文案时展示为次级信息
  const extraStatus = shellStatus.length > 0 && shellStatus !== primaryStatus ? shellStatus : "";

  const peersText = lobby.peers > 0 ? `当前人数：${lobby.peers}` : "当前人数：未知";

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
          <span className={styles.statusText}>{primaryStatus}</span>
          {extraStatus ? <span className={styles.statusExtra}>{extraStatus}</span> : null}
        </div>
        <div className={styles.statusActions}>
          {lobby.mode === "idle" ? (
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
              onClick={() => lobby.connect()}
            >
              <Wifi size={14} strokeWidth={2.2} />
              <span>连接联机节点</span>
            </button>
          ) : null}
          <button type="button" className={styles.actionButton} onClick={() => lobby.refresh()}>
            <RefreshCw size={14} strokeWidth={2.2} />
            <span>刷新状态</span>
          </button>
        </div>
      </IGM_LauncherV2_Card>

      {/* 外壳提示：非空时常驻展示为次级提示行 */}
      {lobby.message.trim() ? (
        <p className={styles.notice}>
          <Info size={13} strokeWidth={2.2} />
          <span>{lobby.message}</span>
        </p>
      ) : null}

      {/* 房间操作区 */}
      <div className={styles.panels}>
        {/* 创建房间 / 房间信息 */}
        <IGM_LauncherV2_Card className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.sectionLabel}>创建房间</span>
            {inRoom && lobby.host ? <span className={styles.hostBadge}>房主</span> : null}
          </div>

          {inRoom ? (
            <>
              <p className={styles.panelDesc}>把房间码发给好友，即可加入同一房间。</p>
              <div className={styles.codeRow}>
                <span className={styles.codeBlock}>{roomCode}</span>
                <button type="button" className={styles.actionButton} onClick={copyRoomCode}>
                  {copied ? (
                    <Check size={14} strokeWidth={2.2} />
                  ) : (
                    <Copy size={14} strokeWidth={2.2} />
                  )}
                  <span>{copied ? "已复制" : "复制房间码"}</span>
                </button>
              </div>
              <div className={styles.roomMeta}>
                <span className={styles.roomPeers}>
                  <Users size={13} strokeWidth={2.2} />
                  <span>{peersText}</span>
                </span>
              </div>
              <button type="button" className={styles.actionButton} onClick={() => lobby.leave()}>
                <LogOut size={14} strokeWidth={2.2} />
                <span>退出房间</span>
              </button>
            </>
          ) : (
            <>
              <p className={styles.panelDesc}>创建一个房间并生成 6 位房间码，等待好友加入。</p>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                onClick={() => lobby.create()}
              >
                <Plus size={14} strokeWidth={2.2} />
                <span>创建房间</span>
              </button>
            </>
          )}
        </IGM_LauncherV2_Card>

        {/* 加入房间 */}
        <IGM_LauncherV2_Card className={styles.panel}>
          <span className={styles.sectionLabel}>加入房间</span>
          <p className={styles.panelDesc}>输入好友提供的 6 位房间码即可加入房间。</p>
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
              placeholder="输入 6 位房间码"
              aria-label="房间码"
              onChange={(event) => setJoinInput(iGM_NormalizeRoomCode(event.target.value))}
            />
            <button
              type="submit"
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
              disabled={!joinReady}
            >
              <LogIn size={14} strokeWidth={2.2} />
              <span>加入房间</span>
            </button>
          </form>
          {joinInput.length > 0 && !joinReady ? (
            <p className={styles.joinHint}>房间码需为 6 位数字。</p>
          ) : null}
        </IGM_LauncherV2_Card>
      </div>

      {/* 双方案说明：主站高速节点优先，不可用时自动降级到公共节点 */}
      <IGM_LauncherV2_Card className={styles.infoCard}>
        <div className={styles.infoHead}>
          <Link2 size={15} strokeWidth={2.2} />
          <span className={styles.infoTitle}>双方案说明</span>
        </div>
        <p className={styles.infoText}>
          联机优先使用主站高速联机节点（api.igcraftlit.com WebSocket），延迟更低、连接更稳定。
        </p>
        <p className={styles.infoText}>
          当主站高速联机节点不可用时，启动器会自动回退到公共联机节点（EasyTier
          社区公共节点 + 公共 STUN/TURN，延迟可能略高）。
        </p>
      </IGM_LauncherV2_Card>
    </section>
  );
}

// 导出 //
export default iGM_LauncherV2_PeerLobby;
