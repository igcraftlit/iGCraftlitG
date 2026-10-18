/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_MainShell/iGM_LauncherV2_MainShell.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main
 * 模块：iGM_LauncherV2_MainShell
 * 作用：启动器主界面（极简静态渐变底 + 悬浮图标导航 + 账号中心 + 皮肤库）
 * 内容：顶部悬浮胶囊导航默认仅显示 lucide 图标，鼠标悬停时平滑横向展开文字；
 *       导航左侧应用名使用 Orbitron 艺术字体；右上角用户区点击展开下拉菜单
 *       （社区头像与「更换头像」、社区昵称与 iGMUid、退出登录回欢迎页）；
 *       首页左上角为欢迎词，右下角为「启动游戏」按钮（弹窗选择视界后启动），
 *       标题下方为快捷入口卡片与「最近更新」正式版列表，
 *       右侧独立账号栏上下展示正版账号与离线账号（离线账号最多 5 个）；
 *       账号中心包含 Java 环境管理、微软正版验证、离线账号管理三块能力，
 *       点击已绑定的正版账号进入 3D 正版档案详情页；
 *       皮肤库页签分「皮肤库 / 在线查询 / 我的皮肤」三类，中部提供「全部 / 精选」标签，
 *       支持本地导入与离线应用；设置页列出后续模块将接入的配置项占位；
 *       已接入多语言（next-intl），全部文案走 shell 命名空间
 * 说明：主界面不使用流体云背景（仅欢迎页保留），避免动态干扰；
 *       全部特权能力（进程扫描、文件选择、网络验证）均由 Bun 主进程执行，
 *       界面只展示状态并投递指令，不直接触碰本地文件与系统命令
 */

// 导入依赖 //
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  FolderOpen,
  Gamepad2,
  Home,
  Info,
  Layers,
  LogOut,
  Package,
  Play,
  Plus,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Shirt,
  Terminal,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
  iGM_LauncherV2_StatusDot as IGM_LauncherV2_StatusDot,
  iGM_LauncherV2_WindowChrome as IGM_LauncherV2_WindowChrome,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_AppearanceHost as IGM_LauncherV2_AppearanceHost,
} from "@/components/iGM_LauncherV2_AppearanceHost/iGM_LauncherV2_AppearanceHost";
import {
  iGM_LauncherV2_SkinLibrary as IGM_LauncherV2_SkinLibrary,
} from "@/components/iGM_LauncherV2_SkinLibrary/iGM_LauncherV2_SkinLibrary";
import {
  iGM_LauncherV2_SkinProfile as IGM_LauncherV2_SkinProfile,
} from "@/components/iGM_LauncherV2_SkinProfile/iGM_LauncherV2_SkinProfile";
import {
  iGM_LauncherV2_Settings as IGM_LauncherV2_Settings,
} from "@/components/iGM_LauncherV2_Settings/iGM_LauncherV2_Settings";
import {
  iGM_LauncherV2_Horizon as IGM_LauncherV2_Horizon,
} from "@/components/iGM_LauncherV2_Horizon/iGM_LauncherV2_Horizon";
import {
  iGM_LauncherV2_ResourceCenter as IGM_LauncherV2_ResourceCenter,
} from "@/components/iGM_LauncherV2_ResourceCenter/iGM_LauncherV2_ResourceCenter";
import {
  iGM_LauncherV2_ServerLobby as IGM_LauncherV2_ServerLobby,
} from "@/components/iGM_LauncherV2_ServerLobby/iGM_LauncherV2_ServerLobby";
import {
  iGM_LauncherV2_PeerLobby as IGM_LauncherV2_PeerLobby,
} from "@/components/iGM_LauncherV2_PeerLobby/iGM_LauncherV2_PeerLobby";
import {
  iGM_LauncherV2_DownloadCenter as IGM_LauncherV2_DownloadCenter,
} from "@/components/iGM_LauncherV2_DownloadCenter/iGM_LauncherV2_DownloadCenter";
import {
  iGM_LauncherV2_UpdatePrompt as IGM_LauncherV2_UpdatePrompt,
} from "@/components/iGM_LauncherV2_UpdatePrompt/iGM_LauncherV2_UpdatePrompt";
import {
  iGM_LauncherV2_ChangeCommunityAvatar as IGM_LauncherV2_ChangeCommunityAvatar,
  iGM_LauncherV2_Navigate as IGM_LauncherV2_Navigate,
  iGM_LauncherV2_RefreshCommunityProfile as IGM_LauncherV2_RefreshCommunityProfile,
  iGM_LauncherV2_SelectAccount as IGM_LauncherV2_SelectAccount,
  iGM_LauncherV2_UseAuth as IGM_LauncherV2_UseAuth,
  iGM_LauncherV2_UseCoreStatus as IGM_LauncherV2_UseCoreStatus,
  iGM_LauncherV2_UseHorizons as IGM_LauncherV2_UseHorizons,
  iGM_LauncherV2_UseJava as IGM_LauncherV2_UseJava,
  iGM_LauncherV2_UseLaunch as IGM_LauncherV2_UseLaunch,
  iGM_LauncherV2_UseLaunchLogs as IGM_LauncherV2_UseLaunchLogs,
  iGM_LauncherV2_UseLaunchProgress as IGM_LauncherV2_UseLaunchProgress,
  iGM_LauncherV2_UseMsa as IGM_LauncherV2_UseMsa,
  iGM_LauncherV2_UseOffline as IGM_LauncherV2_UseOffline,
  iGM_LauncherV2_UseSettings as IGM_LauncherV2_UseSettings,
  iGM_LauncherV2_UseVersions as IGM_LauncherV2_UseVersions,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import { IGM_LAUNCHERV2_APP_NAME, IGM_LAUNCHERV2_VERSION } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_MainShell.module.css";

// 类型定义 //

/** 主导航页签 */
type iGM_LauncherV2_MainTab =
  | "home"
  | "horizon"
  | "resources"
  | "servers"
  | "peer"
  | "account"
  | "skins"
  | "settings";

/** 页签展示信息 */
interface iGM_LauncherV2_MainTabMeta {
  id: iGM_LauncherV2_MainTab;
  /** i18n 键（渲染处用 t 解析） */
  label: string;
  icon: typeof Home;
}

/** 首页快捷入口卡片（点击跳转对应页签） */
interface iGM_LauncherV2_MainTile {
  id: string;
  /** i18n 键（渲染处用 t 解析） */
  title: string;
  /** i18n 键（渲染处用 t 解析） */
  desc: string;
  icon: typeof Home;
  /** 点击后跳转的页签 */
  tab: iGM_LauncherV2_MainTab;
}

// 常量与文案 //

const IGM_MAIN_TABS: iGM_LauncherV2_MainTabMeta[] = [
  { id: "home", label: "nav.home", icon: Home },
  { id: "horizon", label: "nav.horizon", icon: Layers },
  { id: "resources", label: "nav.resources", icon: Package },
  { id: "servers", label: "nav.servers", icon: Server },
  { id: "peer", label: "nav.peer", icon: Users },
  { id: "account", label: "nav.account", icon: UserRound },
  { id: "skins", label: "nav.skins", icon: Shirt },
  { id: "settings", label: "nav.settings", icon: Settings },
];

const IGM_MAIN_TILES: iGM_LauncherV2_MainTile[] = [
  {
    id: "community",
    title: "shell.tiles.community.title",
    desc: "shell.tiles.community.desc",
    icon: Shirt,
    tab: "skins",
  },
  {
    id: "resources",
    title: "shell.tiles.resources.title",
    desc: "shell.tiles.resources.desc",
    icon: Package,
    tab: "resources",
  },
  {
    id: "settings",
    title: "shell.tiles.settings.title",
    desc: "shell.tiles.settings.desc",
    icon: Settings,
    tab: "settings",
  },
];

/** 离线账号数量上限（超过后不再允许新增，与外壳约束保持一致） */
const IGM_OFFLINE_LIMIT = 5;

/** 首页「最近更新」展示的正式版条数 */
const IGM_RECENT_RELEASE_COUNT = 6;

/** 启动日志来源标签（错误控制台每行前缀，值为 i18n 键） */
const IGM_LAUNCHERV2_LOG_STREAM_LABEL = {
  system: "shell.logStream.system",
  stdout: "shell.logStream.stdout",
  stderr: "shell.logStream.stderr",
} as const;

/**
 * 启动进度阶段清单。
 * 与外壳 iGM_LauncherV2_Launch 中的推进节点一一对应，
 * 用于遮罩内直观呈现各阶段是否已达成（label 为 i18n 键）。
 */
const IGM_LAUNCHERV2_LAUNCH_STEPS: { percent: number; label: string }[] = [
  { percent: 10, label: "shell.launchSteps.verify" },
  { percent: 30, label: "shell.launchSteps.jvm" },
  { percent: 50, label: "shell.launchSteps.spawn" },
  { percent: 70, label: "shell.launchSteps.initMark" },
  { percent: 100, label: "shell.launchSteps.success" },
];

/** 启动日志时间格式化（时:分:秒） */
function iGM_LauncherV2_FormatLogTime(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 核心逻辑 //

/**
 * 头像：加载失败或地址为空时回退到 lucide 默认图标，
 * 避免网络异常或资源缺失时界面出现破损图片。
 */
function IGM_LauncherV2_AvatarImage({
  src,
  alt,
  size,
  iconSize,
  className,
}: {
  src: string;
  alt: string;
  size: number;
  iconSize: number;
  className: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <UserRound size={iconSize} strokeWidth={2.2} className={className} aria-label={alt} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

/** 悬浮导航项：默认仅图标，悬停平滑展开文字 */
function IGM_LauncherV2_NavItem({
  item,
  active,
  onSelect,
}: {
  item: iGM_LauncherV2_MainTabMeta;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`${styles.navItem} ${active ? styles.navItemOn : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
    >
      <Icon size={17} strokeWidth={2.1} />
      <span className={styles.navItemLabel}>{t(item.label)}</span>
    </button>
  );
}

/** Java 环境管理面板：进入账号中心自动扫描一次，支持手动选择与设默认 */
function IGM_LauncherV2_JavaPanel() {
  const t = useTranslations();
  const java = IGM_LauncherV2_UseJava();
  const requested = useRef(false);

  // 自动扫描：首次进入账号中心即触发一次系统扫描
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    java.scan();
  }, [java]);

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("shell.java.title")}</h2>
          <p className={styles.panelDesc}>{t("shell.java.desc")}</p>
        </div>
        <div className={styles.panelActions}>
          <button
            type="button"
            className={styles.actionButton}
            disabled={java.scanning}
            onClick={() => java.scan()}
          >
            <RefreshCw size={14} strokeWidth={2.2} />
            <span>{java.scanning ? t("common.scanning") : t("shell.java.rescan")}</span>
          </button>
          <button type="button" className={styles.actionButton} onClick={() => java.browse()}>
            <Plus size={14} strokeWidth={2.2} />
            <span>{t("shell.java.addPath")}</span>
          </button>
        </div>
      </div>

      {/* 扫描结论：无论是否扫到 Java 都给出明确结果，避免「点了没反应」 */}
      {java.scanning ? (
        <p className={styles.notice}>
          <RefreshCw size={13} strokeWidth={2.2} />
          <span>{t("shell.java.scanningNotice")}</span>
        </p>
      ) : java.message ? (
        <p className={styles.notice}>
          <Info size={13} strokeWidth={2.2} />
          <span>{java.message}</span>
        </p>
      ) : null}

      {java.items.length === 0 ? (
        <div className={styles.emptyAction}>
          <p className={styles.empty}>{t("shell.java.empty")}</p>
          <button type="button" className={styles.actionButton} onClick={() => java.browse()}>
            <FolderOpen size={14} strokeWidth={2.2} />
            <span>{t("shell.java.addPath")}</span>
          </button>
        </div>
      ) : (
        <ul className={styles.list}>
          {java.items.map((item) => {
            const isDefault = item.id === java.defaultId;
            return (
              <li key={item.id} className={styles.listRow}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitleLine}>
                    <span className={styles.rowTitle}>
                      {item.version
                        ? t("shell.java.versionLabel", { version: item.version })
                        : t("shell.java.versionUnknown")}
                    </span>
                    <span className={styles.rowTag}>{item.vendor}</span>
                    {isDefault ? (
                      <span className={styles.rowTagOn}>{t("shell.java.globalDefault")}</span>
                    ) : null}
                  </div>
                  <span className={styles.rowSub}>{item.path}</span>
                </div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={isDefault}
                    aria-label={t("shell.java.setDefaultAria")}
                    onClick={() => java.setDefault(item.id)}
                  >
                    <Check size={15} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                    aria-label={t("shell.java.removeAria")}
                    onClick={() => java.remove(item.id)}
                  >
                    <Trash2 size={15} strokeWidth={2.2} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </IGM_LauncherV2_Card>
  );
}

/** 微软正版验证面板：与社区账号解绑，游客（未登录社区账号）同样可发起设备代码流授权 */
function IGM_LauncherV2_MsaPanel({ onOpenProfile }: { onOpenProfile: () => void }) {
  const t = useTranslations();
  const msa = IGM_LauncherV2_UseMsa();
  const device = msa.device;
  const [copied, setCopied] = useState(false);

  // 设备代码变化即视为新一轮授权，重置复制提示
  useEffect(() => {
    setCopied(false);
  }, [device?.userCode]);

  /** 复制用户代码并打开系统默认浏览器进入微软验证页 */
  const handleDeviceAuth = async () => {
    if (!device) return;
    try {
      await navigator.clipboard.writeText(device.userCode);
    } catch {
      // 剪贴板 API 不可用（权限受限）时用临时文本域兜底
      const fallback = document.createElement("textarea");
      fallback.value = device.userCode;
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
    }
    setCopied(true);
    msa.openVerification();
  };

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("shell.msa.title")}</h2>
          <p className={styles.panelDesc}>{t("shell.msa.desc")}</p>
        </div>
        {msa.state === "logged-in" && msa.account ? (
          <button
            type="button"
            className={`${styles.actionButton} ${styles.actionButtonDanger}`}
            onClick={() => msa.logout()}
          >
            <LogOut size={14} strokeWidth={2.2} />
            <span>{t("shell.msa.unbind")}</span>
          </button>
        ) : (
          <button
            type="button"
            className={styles.actionButton}
            disabled={msa.state === "pending"}
            onClick={() => msa.login()}
          >
            <ShieldCheck size={14} strokeWidth={2.2} />
            <span>{msa.state === "pending" ? t("shell.msa.pending") : t("shell.msa.bind")}</span>
          </button>
        )}
      </div>

      {msa.account ? (
        <>
          {/* 点击已绑定的正版账号进入 3D 档案详情页 */}
          <button
            type="button"
            className={`${styles.identity} ${styles.identityClickable}`}
            onClick={onOpenProfile}
          >
            <IGM_LauncherV2_AvatarImage
              src={msa.account.avatar}
              alt={t("shell.msa.avatarAlt", { name: msa.account.name })}
              size={56}
              iconSize={22}
              className={styles.identityAvatar}
            />
            <div className={styles.identityText}>
              <span className={styles.rowTitle}>{msa.account.name}</span>
              <span className={styles.rowSub}>{msa.account.uuid}</span>
            </div>
            <span className={styles.identityHint}>
              <span>{t("shell.msa.viewProfile")}</span>
              <ChevronRight size={14} strokeWidth={2.2} />
            </span>
          </button>
          {msa.message ? <p className={styles.notice}>{msa.message}</p> : null}
        </>
      ) : device ? (
        <div className={styles.deviceBox}>
          <p className={styles.deviceHint}>{t("shell.msa.deviceHint")}</p>
          <div className={styles.deviceCodeRow}>
            <code className={styles.deviceCode}>{device.userCode}</code>
            <span className={styles.deviceUri}>{device.verificationUri}</span>
          </div>
          <div className={styles.deviceActions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void handleDeviceAuth()}
            >
              <Copy size={14} strokeWidth={2.2} />
              <span>{copied ? t("shell.msa.copiedPaste") : t("shell.msa.copyAndOpen")}</span>
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonDanger}`}
              onClick={() => msa.cancel()}
            >
              <X size={14} strokeWidth={2.2} />
              <span>{t("shell.msa.cancelVerify")}</span>
            </button>
          </div>
          <p className={styles.deviceMeta}>
            {t("shell.msa.deviceMeta", { minutes: Math.max(1, Math.round(device.expiresIn / 60)) })}
          </p>
        </div>
      ) : (
        <p className={styles.empty}>
          {msa.message ||
            (msa.state === "pending" ? t("shell.msa.requesting") : t("shell.msa.notBound"))}
        </p>
      )}
    </IGM_LauncherV2_Card>
  );
}

/** 离线账号面板：昵称推导标准 UUID，多账号可一键切换 */
function IGM_LauncherV2_OfflinePanel() {
  const t = useTranslations();
  const offline = IGM_LauncherV2_UseOffline();
  const [name, setName] = useState("");

  const submit = () => {
    const value = name.trim();
    if (!value) return;
    // 兜底：每位用户最多只能创建 5 个离线账号
    if (offline.items.length >= IGM_OFFLINE_LIMIT) return;
    // 已存在的昵称不再提交，也不清空输入框，避免用户输入被无提示地丢弃
    if (offline.items.some((item) => item.id === value.toLowerCase())) return;
    offline.add(value);
    setName("");
  };

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("shell.offline.title")}</h2>
          <p className={styles.panelDesc}>{t("shell.offline.desc")}</p>
        </div>
      </div>

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          value={name}
          maxLength={16}
          placeholder={t("shell.offline.placeholder")}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <button type="button" className={styles.actionButton} onClick={submit}>
          <Plus size={14} strokeWidth={2.2} />
          <span>{t("common.add")}</span>
        </button>
      </div>

      {offline.items.length === 0 ? (
        <p className={styles.empty}>{t("shell.offline.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {offline.items.map((item) => {
            const current = item.id === offline.currentId;
            return (
              <li key={item.id} className={styles.listRow}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitleLine}>
                    <span className={styles.rowTitle}>{item.name}</span>
                    {current ? (
                      <span className={styles.rowTagOn}>{t("shell.offline.current")}</span>
                    ) : null}
                  </div>
                  <span className={styles.rowSub}>{item.uuid}</span>
                </div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    disabled={current}
                    onClick={() => offline.select(item.id)}
                  >
                    <Check size={14} strokeWidth={2.2} />
                    <span>{t("shell.offline.switch")}</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                    aria-label={t("shell.offline.removeAria")}
                    onClick={() => offline.remove(item.id)}
                  >
                    <Trash2 size={15} strokeWidth={2.2} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </IGM_LauncherV2_Card>
  );
}

/** 将 ISO 发布时间格式化为 YYYY-MM-DD HH:mm，逐位取整规避区域差异 */
function IGM_LauncherV2_FormatReleaseTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** 首页账号栏·正版账号：展示已绑定账号，点击卡片即设为当前启动账号 */
function IGM_LauncherV2_HomeMsaBlock() {
  const t = useTranslations();
  const msa = IGM_LauncherV2_UseMsa();
  const settings = IGM_LauncherV2_UseSettings();
  const account = msa.account;
  const activeId = settings.settings?.currentAccount;
  // 选中判定以全局 currentAccount 为准，而非各模块自己的「当前项」，保证与启动参数完全一致
  const active = Boolean(account) && activeId?.kind === "msa" && activeId.id === account?.uuid;

  return (
    <div className={styles.accountBlock}>
      <div className={styles.accountHead}>
        <ShieldCheck size={15} strokeWidth={2.2} />
        <span className={styles.accountTitle}>{t("shell.home.msaTitle")}</span>
        {active ? (
          <span className={styles.accountActiveTag}>{t("shell.home.currentAccountTag")}</span>
        ) : null}
      </div>

      {account ? (
        <button
          type="button"
          className={`${styles.identity} ${styles.identityClickable} ${
            active ? styles.identityActive : ""
          }`}
          aria-pressed={active}
          onClick={() => IGM_LauncherV2_SelectAccount("msa", account.uuid)}
        >
          <IGM_LauncherV2_AvatarImage
            src={account.avatar}
            alt={t("shell.msa.avatarAlt", { name: account.name })}
            size={52}
            iconSize={20}
            className={styles.identityAvatar}
          />
          <div className={styles.identityText}>
            <span className={styles.rowTitle}>{account.name}</span>
            <span className={styles.rowSub}>{account.uuid}</span>
          </div>
          <span className={styles.identityCheck} aria-hidden>
            {active ? <Check size={16} strokeWidth={2.6} /> : null}
          </span>
        </button>
      ) : (
        <p className={styles.accountEmpty}>{t("shell.home.msaEmpty")}</p>
      )}
    </div>
  );
}

/** 首页账号栏·离线账号：每位用户最多 5 个，点击卡片即设为当前启动账号 */
function IGM_LauncherV2_HomeOfflineBlock() {
  const t = useTranslations();
  const offline = IGM_LauncherV2_UseOffline();
  const settings = IGM_LauncherV2_UseSettings();
  const current = settings.settings?.currentAccount;
  const [name, setName] = useState("");
  const reached = offline.items.length >= IGM_OFFLINE_LIMIT;

  const submit = () => {
    const value = name.trim();
    if (!value) return;
    // 兜底：每位用户最多只能创建 5 个离线账号
    if (offline.items.length >= IGM_OFFLINE_LIMIT) return;
    if (offline.items.some((item) => item.id === value.toLowerCase())) return;
    offline.add(value);
    setName("");
  };

  return (
    <div className={styles.accountBlock}>
      <div className={styles.accountHead}>
        <UserRound size={15} strokeWidth={2.2} />
        <span className={styles.accountTitle}>{t("shell.offline.title")}</span>
        <span className={styles.accountCount}>
          {offline.items.length}/{IGM_OFFLINE_LIMIT}
        </span>
      </div>

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          value={name}
          maxLength={16}
          placeholder={t("shell.home.offlinePlaceholder")}
          disabled={reached}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <button type="button" className={styles.actionButton} disabled={reached} onClick={submit}>
          <Plus size={14} strokeWidth={2.2} />
          <span>{t("common.add")}</span>
        </button>
      </div>
      {reached ? (
        <p className={styles.accountHint}>
          {t("shell.home.offlineLimitHint", { limit: IGM_OFFLINE_LIMIT })}
        </p>
      ) : null}

      {offline.items.length === 0 ? (
        <p className={styles.accountEmpty}>{t("shell.home.offlineEmpty")}</p>
      ) : (
        <ul className={styles.list}>
          {offline.items.map((item) => {
            const active = current?.kind === "offline" && current.id === item.id;
            return (
              <li
                key={item.id}
                className={`${styles.listRow} ${active ? styles.listRowActive : ""}`}
              >
                <button
                  type="button"
                  className={styles.rowSelect}
                  aria-pressed={active}
                  onClick={() => IGM_LauncherV2_SelectAccount("offline", item.id)}
                >
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitleLine}>
                      <span className={styles.rowTitle}>{item.name}</span>
                      {active ? (
                        <span className={styles.rowTagOn}>
                          {t("shell.home.currentAccountTag")}
                        </span>
                      ) : null}
                    </div>
                    <span className={styles.rowSub}>{item.uuid}</span>
                  </div>
                  <span className={styles.rowCheck} aria-hidden>
                    {active ? <Check size={15} strokeWidth={2.6} /> : null}
                  </span>
                </button>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                    aria-label={t("shell.offline.removeAria")}
                    onClick={() => offline.remove(item.id)}
                  >
                    <Trash2 size={15} strokeWidth={2.2} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 首页「最近更新」：取最新正式版若干条，数据行数由 UseVersions 统一收口 */
function IGM_LauncherV2_RecentUpdates() {
  const t = useTranslations();
  const versions = IGM_LauncherV2_UseVersions();
  const releases = versions.versions
    .filter((item) => item.type === "release")
    .sort(
      (left, right) =>
        new Date(right.releaseTime).getTime() - new Date(left.releaseTime).getTime(),
    )
    .slice(0, IGM_RECENT_RELEASE_COUNT);

  return (
    <IGM_LauncherV2_Card className={styles.recentCard}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("shell.recent.title")}</h2>
          <p className={styles.panelDesc}>{t("shell.recent.desc")}</p>
        </div>
        <Clock size={16} strokeWidth={2.2} className={styles.recentIcon} />
      </div>

      {versions.loading ? (
        <p className={styles.empty}>{t("shell.recent.loading")}</p>
      ) : releases.length === 0 ? (
        <p className={styles.empty}>{versions.message || t("shell.recent.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {releases.map((item) => (
            <li key={item.id} className={styles.listRow}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitleLine}>
                  <span className={styles.rowTitle}>{item.id}</span>
                  <span className={styles.rowTag}>{t("shell.recent.releaseTag")}</span>
                </div>
                <span className={styles.rowSub}>{IGM_LauncherV2_FormatReleaseTime(item.releaseTime)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </IGM_LauncherV2_Card>
  );
}

/**
 * 启动日志（错误控制台）。
 * 逐行展示游戏进程的 stdout / stderr 与启动器自身提示，错误级别标红；
 * 有新日志时自动滚到底部，便于直接看到最后一条报错。
 */
function IGM_LauncherV2_LaunchConsole() {
  const t = useTranslations();
  const logs = IGM_LauncherV2_UseLaunchLogs();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // 新日志到达后滚到底部，用户无需手动翻找最新报错
  useEffect(() => {
    const node = bodyRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [logs.entries]);

  return (
    <IGM_LauncherV2_Card className={styles.consoleCard}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("shell.console.title")}</h2>
          <p className={styles.panelDesc}>{t("shell.console.desc")}</p>
        </div>
        <div className={styles.consoleActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("shell.console.reloadAria")}
            onClick={() => logs.reload()}
          >
            <RefreshCw size={15} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("shell.console.clearAria")}
            onClick={() => logs.clear()}
          >
            <Trash2 size={15} strokeWidth={2.2} />
          </button>
          <Terminal size={16} strokeWidth={2.2} className={styles.consoleIcon} />
        </div>
      </div>

      <div className={styles.consoleBody} ref={bodyRef}>
        {logs.entries.length === 0 ? (
          <p className={styles.consoleEmpty}>{t("shell.console.empty")}</p>
        ) : (
          logs.entries.map((entry, index) => (
            <p
              key={`${entry.time}-${index}`}
              className={`${styles.consoleLine} ${
                entry.level === "error" ? styles.consoleLineError : ""
              }`}
            >
              <span className={styles.consoleTime}>{iGM_LauncherV2_FormatLogTime(entry.time)}</span>
              <span className={styles.consoleStream}>
                {t(IGM_LAUNCHERV2_LOG_STREAM_LABEL[entry.stream])}
              </span>
              <span className={styles.consoleText}>{entry.line}</span>
            </p>
          ))
        )}
      </div>
    </IGM_LauncherV2_Card>
  );
}

/**
 * 启动进度遮罩：全屏居中展示游戏启动的五个阶段。
 * 内容：10% 验证 Java 与依赖库 / 30% 构建 JVM 参数 / 50% 拉起 Java 进程 /
 *       70% 捕获到 Setting user 或 Loading Minecraft / 100% 启动成功；
 *       达到 100% 后短暂停留随即自动关闭，用户无需手动处理；
 *       若外壳在 stderr 中捕获到严重报错，则中止进度推进并转为红色错误面板，
 *       面板内直接列出最近若干条错误日志，用户确认后遮罩关闭。
 * 说明：进度与日志均来自外壳回推（launch:progress / launch:log），界面不做任何本地推断
 */
function IGM_LauncherV2_LaunchProgressOverlay() {
  const t = useTranslations();
  const progress = IGM_LauncherV2_UseLaunchProgress();
  const logs = IGM_LauncherV2_UseLaunchLogs();
  /** 遮罩可见性：进度推进期间自动显示，100% 后自动隐藏，失败时保持显示直至用户确认 */
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!progress.loaded) return;
    // 失败态交由下方渲染条件直接展示，无需额外开启计时
    if (progress.failed) {
      setVisible(true);
      return;
    }
    if (progress.percent > 0 && progress.percent < 100) {
      setVisible(true);
      return;
    }
    if (progress.percent >= 100) {
      // 成功后留出 900ms 让用户看到完成态，再淡出遮罩
      const timer = setTimeout(() => setVisible(false), 900);
      return () => clearTimeout(timer);
    }
    return;
  }, [progress.loaded, progress.percent, progress.failed]);

  if (!visible) return null;

  /** 最近若干条错误日志（失败面板展示用） */
  const errorLines = logs.entries.filter((entry) => entry.level === "error").slice(-8);

  const close = () => {
    setVisible(false);
    progress.reset();
  };

  return (
    <div className={styles.progressOverlay} role="dialog" aria-modal="true">
      <div className={`${styles.progressCard} ${progress.failed ? styles.progressCardFailed : ""}`}>
        <h2 className={styles.progressTitle}>
          {progress.failed
            ? t("shell.progress.failed")
            : progress.percent >= 100
              ? t("shell.launchSteps.success")
              : t("shell.progress.starting")}
        </h2>
        <p className={styles.progressStage}>
          {progress.stage || (progress.failed ? t("shell.progress.aborted") : t("shell.progress.preparing"))}
        </p>

        <div className={styles.progressTrack}>
          <div
            className={`${styles.progressFill} ${progress.failed ? styles.progressFillFailed : ""}`}
            style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
          />
        </div>
        <p className={styles.progressPercent}>
          {Math.max(0, Math.min(100, progress.percent))}%
        </p>

        {/* 阶段清单：已达成的阶段高亮，未达成置灰 */}
        <ul className={styles.progressSteps}>
          {IGM_LAUNCHERV2_LAUNCH_STEPS.map((step) => (
            <li
              key={step.percent}
              className={`${styles.progressStep} ${
                progress.percent >= step.percent ? styles.progressStepOn : ""
              } ${progress.failed && progress.percent < step.percent ? styles.progressStepFail : ""}`}
            >
              <span className={styles.progressStepDot} />
              <span>
                {step.percent}% · {t(step.label)}
              </span>
            </li>
          ))}
        </ul>

        {/* 失败态：直接列出最近错误日志，说明具体崩溃位置 */}
        {progress.failed ? (
          <div className={styles.progressErrors}>
            <p className={styles.progressErrorsHead}>
              {t("shell.progress.errorHead", { count: errorLines.length })}
            </p>
            {errorLines.length === 0 ? (
              <p className={styles.progressErrorLine}>{t("shell.progress.noErrors")}</p>
            ) : (
              errorLines.map((entry, index) => (
                <p key={`${entry.time}-${index}`} className={styles.progressErrorLine}>
                  {entry.line}
                </p>
              ))
            )}
          </div>
        ) : null}

        <div className={styles.progressFoot}>
          {progress.failed || progress.percent >= 100 ? (
            <button type="button" className={styles.actionButton} onClick={close}>
              <span>{t("common.close")}</span>
            </button>
          ) : (
            <p className={styles.progressHint}>{t("shell.progress.hint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 启动游戏小窗：列出全部视界，选中即投递启动指令并关闭；
 * 未选择当前账号时先行拦截并提示「请先选择要启动的账号」；
 * 无视界时给出引导并可直接切到「视界」页签。支持右上角关闭、点击遮罩关闭、Esc 关闭。
 */
function IGM_LauncherV2_LaunchDialog({
  onClose,
  onGoHorizon,
  onGoAccount,
}: {
  onClose: () => void;
  onGoHorizon: () => void;
  onGoAccount: () => void;
}) {
  const t = useTranslations();
  const horizons = IGM_LauncherV2_UseHorizons();
  const launch = IGM_LauncherV2_UseLaunch();
  const settings = IGM_LauncherV2_UseSettings();
  const current = settings.settings?.currentAccount;
  const accountChosen = Boolean(current && current.kind);
  // 设置尚未取回时不拦截，避免首帧误报；取回后确实未选账号才提示
  const blocked = settings.loaded && !accountChosen;

  // Esc 关闭小窗
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  /** 选中视界即启动并关闭小窗；未选账号时直接拦截 */
  const handleLaunch = (horizonId: string) => {
    if (blocked) return;
    launch.launch(horizonId);
    onClose();
  };

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t("shell.launchDialog.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{t("shell.launchDialog.title")}</h2>
            <p className={styles.modalDesc}>{t("shell.launchDialog.desc")}</p>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("shell.launchDialog.closeAria")}
            onClick={onClose}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {blocked ? (
          <div className={styles.modalWarn}>
            <Info size={16} strokeWidth={2.2} />
            <div className={styles.modalWarnBody}>
              <p className={styles.modalWarnTitle}>{t("shell.launchDialog.needAccountTitle")}</p>
              <p className={styles.modalWarnDesc}>{t("shell.launchDialog.needAccountDesc")}</p>
              <button type="button" className={styles.actionButton} onClick={onGoAccount}>
                <UserRound size={14} strokeWidth={2.2} />
                <span>{t("shell.launchDialog.goAccount")}</span>
              </button>
            </div>
          </div>
        ) : null}

        {horizons.items.length === 0 ? (
          <div className={styles.modalEmpty}>
            <p className={styles.empty}>{t("shell.launchDialog.empty")}</p>
            <button type="button" className={styles.actionButton} onClick={onGoHorizon}>
              <Layers size={14} strokeWidth={2.2} />
              <span>{t("shell.launchDialog.goHorizon")}</span>
            </button>
          </div>
        ) : (
          <ul className={styles.list}>
            {horizons.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.horizonOption}
                  disabled={blocked}
                  onClick={() => handleLaunch(item.id)}
                >
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitleLine}>
                      <span className={styles.rowTitle}>{item.name}</span>
                      {item.current ? (
                        <span className={styles.rowTagOn}>
                          {t("shell.launchDialog.currentHorizon")}
                        </span>
                      ) : null}
                      <span className={styles.rowTag}>
                        {t("shell.launchDialog.modCount", { count: item.modCount })}
                      </span>
                    </div>
                    <span className={styles.rowSub}>{item.path}</span>
                  </div>
                  <span className={styles.horizonPlay} aria-hidden>
                    <Play size={15} strokeWidth={2.4} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {launch.state?.message ? <p className={styles.notice}>{launch.state.message}</p> : null}
      </div>
    </div>
  );
}

export function iGM_LauncherV2_MainShell() {
  const t = useTranslations();
  const auth = IGM_LauncherV2_UseAuth();
  const core = IGM_LauncherV2_UseCoreStatus();
  const launch = IGM_LauncherV2_UseLaunch();
  const settings = IGM_LauncherV2_UseSettings();
  const [tab, setTab] = useState<iGM_LauncherV2_MainTab>("home");
  const [launchOpen, setLaunchOpen] = useState(false);
  /** 账号中心内是否处于正版档案详情视图 */
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement | null>(null);

  // 设置取回后仍未选账号才提示，避免首帧误报
  const needAccount = settings.loaded && !settings.settings?.currentAccount.kind;

  const coreTone = core.state === "ok" ? "ok" : core.state === "unavailable" ? "warn" : "idle";
  const coreLabel =
    core.state === "ok"
      ? core.version
        ? t("shell.core.okVersion", { version: core.version })
        : t("shell.core.okPlain")
      : core.state === "unavailable"
        ? t("shell.core.unavailable", { detail: core.detail || t("shell.core.missingCore") })
        : t("shell.core.probing");

  const isLoggedIn = auth.state === "logged-in" && Boolean(auth.user);
  // 未登录（游客）时右上角展示「游客」，点击引导前往登录页
  const userLabel = isLoggedIn
    ? auth.user?.nickname || auth.user?.uid || t("shell.user.loggedOut")
    : t("shell.user.guest");
  const avatar = auth.user?.avatar ?? "";

  // 菜单展开时重新同步社区资料（社区侧更换头像后回到启动器即可生效）
  useEffect(() => {
    if (menuOpen) IGM_LauncherV2_RefreshCommunityProfile();
  }, [menuOpen]);

  // 点击菜单外部区域关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (userRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  /** 退出登录：清除本地会话并返回欢迎页 */
  const handleLogout = () => {
    setMenuOpen(false);
    auth.logout();
    IGM_LauncherV2_Navigate("/");
  };

  return (
    <div className={`igm-screen igm-page ${styles.screen}`}>
      {/* 外观背景层：按「设置 · 外观」的配置渲染动态云（按配色）或纯色背景 */}
      <IGM_LauncherV2_AppearanceHost />
      <IGM_LauncherV2_WindowChrome label={IGM_LAUNCHERV2_APP_NAME} version={`v${IGM_LAUNCHERV2_VERSION}`} />

      {/* 悬浮式导航栏：胶囊玻璃拟态，整条可拖动窗口 */}
      <header className={`${styles.nav} igm-drag`}>
        <div className={styles.navBrand}>
          <Image
            src="/igml.jpg"
            alt={t("shell.brandLogoAlt")}
            width={26}
            height={26}
            className={styles.navLogo}
            priority
          />
          <span className={styles.navBrandText}>{IGM_LAUNCHERV2_APP_NAME}</span>
        </div>

        <nav className={`${styles.navItems} igm-no-drag`}>
          {IGM_MAIN_TABS.map((item) => (
            <IGM_LauncherV2_NavItem
              key={item.id}
              item={item}
              active={tab === item.id}
              onSelect={() => {
                setTab(item.id);
                // 离开账号中心即退出档案详情视图，避免下次进入时停留在子页面
                setProfileOpen(false);
              }}
            />
          ))}
        </nav>

        <div className={`${styles.navUser} igm-no-drag`} ref={userRef}>
          <button
            type="button"
            className={styles.userButton}
            aria-expanded={isLoggedIn ? menuOpen : undefined}
            aria-haspopup={isLoggedIn ? "menu" : undefined}
            onClick={() => {
              // 游客：点击直接引导登录，不展开社区专属菜单
              if (!isLoggedIn) {
                IGM_LauncherV2_Navigate("/G_Login");
                return;
              }
              setMenuOpen((open) => !open);
            }}
          >
            <span className={styles.userAvatar}>
              <IGM_LauncherV2_AvatarImage
                src={avatar}
                alt={t("shell.communityAvatarAlt")}
                size={26}
                iconSize={15}
                className={styles.userAvatarImage}
              />
            </span>
            <span className={styles.userName}>{userLabel}</span>
            {isLoggedIn ? <ChevronDown size={14} strokeWidth={2.2} /> : null}
          </button>

          {isLoggedIn && menuOpen ? (
            <div className={styles.menu} role="menu">
              <div className={styles.menuIdentity}>
                <span className={styles.menuAvatar}>
                  <IGM_LauncherV2_AvatarImage
                    src={avatar}
                    alt={t("shell.communityAvatarAlt")}
                    size={52}
                    iconSize={22}
                    className={styles.userAvatarImage}
                  />
                </span>
                <div className={styles.menuIdentityText}>
                  <span className={styles.menuName}>{userLabel}</span>
                  <span className={styles.menuUid}>
                    {auth.user?.uid
                      ? t("shell.user.uidLabel", { uid: auth.user.uid })
                      : t("shell.user.notBoundCommunity")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className={styles.menuItem}
                disabled={!isLoggedIn}
                onClick={() => IGM_LauncherV2_ChangeCommunityAvatar()}
              >
                <Camera size={15} strokeWidth={2.2} />
                <span>{t("shell.user.changeAvatar")}</span>
              </button>

              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={handleLogout}
              >
                <LogOut size={15} strokeWidth={2.2} />
                <span>{t("shell.user.logout")}</span>
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className={styles.main}>
        {tab === "home" ? (
          <section className={styles.home}>
            {/* 左上角欢迎词 */}
            <header className={styles.homeHead}>
              <p className={styles.heroKicker}>iGCraftLit Community</p>
              <h1 className={styles.heroTitle}>
                <span className={styles.heroGreet}>{t("shell.hero.greet")}</span>
                <span className={styles.heroSign}>{userLabel}</span>
              </h1>
            </header>

            <div className={styles.homeBody}>
              {/* 左侧主区：快捷入口 + 最近更新 */}
              <div className={styles.homeMain}>
                <div className={styles.tileGrid}>
                  {IGM_MAIN_TILES.map((tile) => (
                    <button
                      key={tile.id}
                      type="button"
                      className={styles.tile}
                      onClick={() => setTab(tile.tab)}
                    >
                      <span className={styles.tileIcon} aria-hidden>
                        <tile.icon size={17} strokeWidth={2.1} />
                      </span>
                      <h2 className={styles.tileTitle}>{t(tile.title)}</h2>
                      <p className={styles.tileDesc}>{t(tile.desc)}</p>
                    </button>
                  ))}
                </div>

                <IGM_LauncherV2_RecentUpdates />
              </div>

              {/* 右侧账号栏：上半正版账号，下半离线账号 */}
              <aside className={styles.homeAside}>
                <IGM_LauncherV2_Card className={styles.accountCard}>
                  <IGM_LauncherV2_HomeMsaBlock />
                  <div className={styles.accountDivider} />
                  <IGM_LauncherV2_HomeOfflineBlock />
                </IGM_LauncherV2_Card>
              </aside>
            </div>

            {/* 错误控制台：启动后实时展示游戏进程输出，启动失败时给出具体原因 */}
            <IGM_LauncherV2_LaunchConsole />

            {/* 右下角启动入口：尺寸收小并固定于页面右下角，点击仍弹出选择视界小窗；
                与下载中心悬浮球纵向错开，互不遮挡 */}
            <div className={styles.launchDock}>
              {needAccount ? (
                <span className={styles.launchStatus}>
                  <Info size={12} strokeWidth={2.2} />
                  <span>{t("shell.launchDock.needAccount")}</span>
                </span>
              ) : null}
              {launch.state?.running ? (
                <span className={styles.launchStatus}>
                  <Gamepad2 size={12} strokeWidth={2.2} />
                  <span>
                    {launch.state.pid
                      ? t("shell.launchDock.runningPid", { pid: launch.state.pid })
                      : t("shell.launchDock.running")}
                  </span>
                </span>
              ) : launch.state?.message ? (
                <span className={styles.launchStatus}>
                  <Info size={12} strokeWidth={2.2} />
                  <span>{launch.state.message}</span>
                </span>
              ) : null}
              <button
                type="button"
                className={styles.launchButton}
                onClick={() => setLaunchOpen(true)}
              >
                <Play size={16} strokeWidth={2.2} />
                <span>{t("common.launchGame")}</span>
              </button>
            </div>
          </section>
        ) : null}

        {tab === "account" ? (
          <section className={styles.section}>
            {profileOpen ? (
              <IGM_LauncherV2_SkinProfile onBack={() => setProfileOpen(false)} />
            ) : (
              <>
                <h1 className={styles.sectionTitle}>{t("nav.account")}</h1>
                <p className={styles.sectionDesc}>{t("shell.section.accountDesc")}</p>

                <IGM_LauncherV2_Card className={styles.summaryCard}>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>{t("shell.section.communityNickname")}</span>
                    <span className={styles.fieldValue}>
                      {isLoggedIn ? userLabel : t("shell.user.loggedOut")}
                    </span>
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>{t("shell.section.uidLabel")}</span>
                    <span className={styles.fieldValue}>{auth.user?.uid || "-"}</span>
                  </div>
                  <div className={styles.statusList}>
                    <IGM_LauncherV2_StatusDot tone={isLoggedIn ? "ok" : "idle"}>
                      {isLoggedIn
                        ? t("shell.section.communityLoggedIn")
                        : t("shell.section.communityLoggedOut")}
                    </IGM_LauncherV2_StatusDot>
                    <IGM_LauncherV2_StatusDot tone={coreTone}>{coreLabel}</IGM_LauncherV2_StatusDot>
                  </div>
                </IGM_LauncherV2_Card>

                <IGM_LauncherV2_JavaPanel />
                <IGM_LauncherV2_MsaPanel onOpenProfile={() => setProfileOpen(true)} />
                <IGM_LauncherV2_OfflinePanel />
              </>
            )}
          </section>
        ) : null}

        {tab === "skins" ? (
          <section className={`${styles.section} ${styles.sectionWide}`}>
            <IGM_LauncherV2_SkinLibrary />
          </section>
        ) : null}

        {tab === "horizon" ? (
          <section className={styles.section}>
            <h1 className={styles.sectionTitle}>{t("nav.horizon")}</h1>
            <p className={styles.sectionDesc}>{t("shell.section.horizonDesc")}</p>

            <IGM_LauncherV2_Horizon />
          </section>
        ) : null}

        {tab === "resources" ? (
          <section className={`${styles.section} ${styles.sectionFull}`}>
            <h1 className={styles.sectionTitle}>{t("nav.resources")}</h1>
            <p className={styles.sectionDesc}>{t("shell.section.resourcesDesc")}</p>

            <IGM_LauncherV2_ResourceCenter />
          </section>
        ) : null}

        {tab === "servers" ? (
          <section className={`${styles.section} ${styles.sectionFull}`}>
            <IGM_LauncherV2_ServerLobby />
          </section>
        ) : null}

        {tab === "peer" ? (
          <section className={`${styles.section} ${styles.sectionFull}`}>
            <IGM_LauncherV2_PeerLobby />
          </section>
        ) : null}

        {tab === "settings" ? (
          <section className={styles.section}>
            <h1 className={styles.sectionTitle}>{t("nav.settings")}</h1>
            <p className={styles.sectionDesc}>{t("shell.section.settingsDesc")}</p>

            <IGM_LauncherV2_Settings />
          </section>
        ) : null}
      </main>

      {/* 启动进度遮罩：全屏居中展示 10 / 30 / 50 / 70 / 100 阶段；严重报错时转红色错误面板 */}
      <IGM_LauncherV2_LaunchProgressOverlay />

      {/* 启动游戏小窗：选中视界后投递启动指令 */}
      {launchOpen ? (
        <IGM_LauncherV2_LaunchDialog
          onClose={() => setLaunchOpen(false)}
          onGoHorizon={() => {
            setLaunchOpen(false);
            setTab("horizon");
          }}
          onGoAccount={() => {
            setLaunchOpen(false);
            setTab("account");
          }}
        />
      ) : null}

      {/* 全局悬浮下载中心：默认隐藏，存在任务时于右下角浮现圆形按钮 */}
      <IGM_LauncherV2_DownloadCenter />

      {/* 右下角自动更新提示：发现新版本 / 下载中 / 待重启三态 */}
      <IGM_LauncherV2_UpdatePrompt />
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_MainShell;
