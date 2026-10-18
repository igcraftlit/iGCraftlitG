/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Settings/iGM_LauncherV2_Settings.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main（设置页签）
 * 模块：iGM_LauncherV2_Settings
 * 作用：设置页：分「通用 / 外观 / 关于」三个独立页签
 * 内容：已接入多语言，通用页签新增界面语言切换；
 *       通用——界面语言切换、专属总目录选择、标准结构展示、本地游戏目录自动检测与下载通道自选；
 *       外观——背景模式单选（动态云背景 / 纯色背景）、动态云配色三选（经典深紫 /
 *       梦幻冷蓝 / 极光幻粉）、纯色方案四选（深邃暗黑 / 明亮浅色 / 古典深咖 / 极光幽绿）、
 *       毛玻璃模糊度滑动条（0-30px，实时生效）、5 种预设主题色切换；
 *       关于——展示当前版本与「检查更新」按钮，发现新版本时可后台下载并「立即重启并更新」
 * 说明：全部特权操作（目录选择、递归删除、结构创建）均由 Bun 主进程执行，
 *       界面只投递指令并展示外壳回推的结果；配色只改背景色调，不改界面主题色；
 *       界面文案统一经 next-intl 的 useTranslations 以 "settings" 命名空间解析
 */

// 导入依赖 //
"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FolderOpen,
  FolderSearch,
  Info,
  Palette,
  Plus,
  Power,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_UseAppearance as IGM_LauncherV2_UseAppearance,
  iGM_LauncherV2_UseGameScan as IGM_LauncherV2_UseGameScan,
  iGM_LauncherV2_UseSettings as IGM_LauncherV2_UseSettings,
  iGM_LauncherV2_UseUpdate as IGM_LauncherV2_UseUpdate,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  IGM_LAUNCHERV2_APPEARANCE_BLUR_MAX,
  IGM_LAUNCHERV2_APPEARANCE_BLUR_MIN,
  IGM_LAUNCHERV2_APP_NAME,
  IGM_LAUNCHERV2_BACKGROUND_MODES,
  IGM_LAUNCHERV2_CLOUD_PALETTES,
  IGM_LAUNCHERV2_SOLID_PALETTES,
  IGM_LAUNCHERV2_THEMES,
  IGM_LAUNCHERV2_VERSION,
} from "@/lib/iGM_LauncherV2_Constants";
import type {
  iGM_LauncherV2_GameCandidate,
  iGM_LauncherV2_UpdateStatus,
} from "@/lib/iGM_LauncherV2_Constants";
import { iGM_LauncherV2_UseLocale } from "@/components/iGM_LauncherV2_Providers/iGM_LauncherV2_LocaleProvider";
import {
  IGM_LAUNCHERV2_LOCALE_LABELS,
  type iGM_LauncherV2_Locale,
} from "@/i18n/iGM_LauncherV2_Locales";
import styles from "./iGM_LauncherV2_Settings.module.css";

// 类型定义 //

/** 设置页独立页签 */
type iGM_LauncherV2_SettingsTab = "general" | "appearance" | "about";

/** 候选目录来源展示文案（值为 i18n 键，渲染处以 useTranslations 解析） */
const IGM_SOURCE_LABEL: Record<iGM_LauncherV2_GameCandidate["source"], string> = {
  matrix: "settings.source.matrix",
  system: "settings.source.system",
  custom: "settings.source.custom",
};

/** 设置页签清单（label 为 i18n 键） */
const IGM_SETTINGS_TABS: {
  id: iGM_LauncherV2_SettingsTab;
  label: string;
  icon: typeof Info;
}[] = [
  { id: "general", label: "settings.tabs.general", icon: SlidersHorizontal },
  { id: "appearance", label: "settings.tabs.appearance", icon: Palette },
  { id: "about", label: "settings.tabs.about", icon: Info },
];

/** 更新状态展示文案（值为 i18n 键） */
const IGM_UPDATE_STATUS_LABEL: Record<iGM_LauncherV2_UpdateStatus, string> = {
  idle: "settings.update.idle",
  checking: "settings.update.checking",
  available: "settings.update.available",
  downloading: "settings.update.downloading",
  downloaded: "settings.update.downloaded",
  latest: "settings.update.latest",
  error: "settings.update.error",
};

/** 鸣谢成员：头像、姓名与角色称谓（role 为 i18n 键） */
const IGM_ABOUT_CREDITS: {
  key: string;
  avatar: string;
  name: string;
  role: string;
}[] = [
  { key: "founder", avatar: "/image/1.jpg", name: "ᝰ𝒪𝓇𝒷𝒾𝓉 ℳℯᝰ", role: "settings.about.roles.founder" },
  { key: "developer", avatar: "/image/2.jpg", name: "CaYiHuo", role: "settings.about.roles.developer" },
  { key: "promotion", avatar: "/image/3.jpg", name: "南風", role: "settings.about.roles.promotion" },
];

/** 版权声明固定文案：版权句恒为英文全文，不随语言切换 */
const IGM_ABOUT_COPYRIGHT =
  "© 2026 iGCraftLit Team. All Rights Reserved. Including but not limited to: launcher core architecture (code), UI design and art assets, iGC&M original question banks, and community management regulations.";

// 核心逻辑 //

/** 界面语言面板：实时无刷新切换，由 LocaleProvider 持久化到本地配置 */
function IGM_LauncherV2_LanguagePanel() {
  const t = useTranslations();
  const { locale, setLocale } = iGM_LauncherV2_UseLocale();

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("language.title")}</h2>
          <p className={styles.panelDesc}>{t("language.desc")}</p>
        </div>
      </div>

      <div className={styles.langOptions}>
        {(["zh-CN", "en"] as iGM_LauncherV2_Locale[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`${styles.langOption} ${locale === id ? styles.langOptionOn : ""}`}
            aria-pressed={locale === id}
            onClick={() => setLocale(id)}
          >
            <span className={styles.rowTitle}>{IGM_LAUNCHERV2_LOCALE_LABELS[id]}</span>
            {locale === id ? <Check size={15} strokeWidth={2.6} aria-hidden /> : null}
          </button>
        ))}
      </div>
    </IGM_LauncherV2_Card>
  );
}

/** 专属总目录与结构面板 */
function IGM_LauncherV2_PathsPanel() {
  const t = useTranslations();
  const settings = IGM_LauncherV2_UseSettings();
  const paths = settings.paths;

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("settings.paths.title")}</h2>
          <p className={styles.panelDesc}>{t("settings.paths.desc")}</p>
        </div>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => settings.browseRoot()}
        >
          <FolderOpen size={14} strokeWidth={2.2} />
          <span>{t("settings.paths.browseRoot")}</span>
        </button>
      </div>

      <div className={styles.treeBox}>
        <span className={styles.treeLine}>
          {`${paths?.userRoot ?? t("common.notFetched")}/`}
        </span>
        <span className={styles.treeLine}>
          {`└── ${paths?.matrixDirName ?? "iGML_Matrix"}/　# ${t("settings.paths.treeMatrix")}`}
        </span>
        <span className={styles.treeLine}>
          {`　　├── launcher_data/　# ${t("settings.paths.treeLauncherData")}`}
        </span>
        <span className={styles.treeLine}>
          {`　　└── .minecraft/　# ${t("settings.paths.treeMinecraft")}`}
        </span>
        <span className={styles.treeLine}>
          {`　　　　├── assets/ libraries/ versions/　# ${t("settings.paths.treeShared")}`}
        </span>
        <span className={styles.treeLine}>
          {`　　　　└── horizons/　# ${t("settings.paths.treeHorizons")}`}
        </span>
      </div>

      <div className={styles.pathGrid}>
        <div className={styles.pathRow}>
          <span className={styles.pathLabel}>{t("settings.paths.platform")}</span>
          <span className={styles.pathValue}>{paths?.platform ?? "-"}</span>
        </div>
        <div className={styles.pathRow}>
          <span className={styles.pathLabel}>{t("settings.paths.matrixRoot")}</span>
          <span className={styles.pathValue}>{paths?.matrixRoot ?? "-"}</span>
        </div>
        <div className={styles.pathRow}>
          <span className={styles.pathLabel}>{t("settings.paths.gameRoot")}</span>
          <span className={styles.pathValue}>{paths?.gameRoot ?? "-"}</span>
        </div>
        <div className={styles.pathRow}>
          <span className={styles.pathLabel}>{t("settings.paths.launcherData")}</span>
          <span className={styles.pathValue}>{paths?.launcherData ?? "-"}</span>
        </div>
        <div className={styles.pathRow}>
          <span className={styles.pathLabel}>{t("settings.paths.horizons")}</span>
          <span className={styles.pathValue}>{paths?.horizons ?? "-"}</span>
        </div>
      </div>
    </IGM_LauncherV2_Card>
  );
}

/** 自动检测游戏目录面板 */
function IGM_LauncherV2_GameDetectPanel() {
  const t = useTranslations();
  const scan = IGM_LauncherV2_UseGameScan();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("settings.detect.title")}</h2>
          <p className={styles.panelDesc}>{t("settings.detect.desc")}</p>
        </div>
        <div className={styles.panelActions}>
          <button type="button" className={styles.actionButton} onClick={() => scan.scan()}>
            <RefreshCw size={14} strokeWidth={2.2} />
            <span>{t("settings.detect.rescan")}</span>
          </button>
          <button type="button" className={styles.actionButton} onClick={() => scan.browse()}>
            <FolderSearch size={14} strokeWidth={2.2} />
            <span>{t("settings.detect.addScanDir")}</span>
          </button>
          <button type="button" className={styles.actionButton} onClick={() => scan.generate()}>
            <Plus size={14} strokeWidth={2.2} />
            <span>{t("settings.detect.generate")}</span>
          </button>
        </div>
      </div>

      {scan.message ? <p className={styles.notice}>{scan.message}</p> : null}

      {!scan.loaded ? (
        <p className={styles.empty}>{t("settings.detect.scanning")}</p>
      ) : scan.candidates.length === 0 ? (
        <p className={styles.empty}>{t("settings.detect.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {scan.candidates.map((item) => {
            const complete = item.status === "complete";
            return (
              <li key={item.path} className={styles.listRow}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitleLine}>
                    {complete ? (
                      <CheckCircle2 size={15} strokeWidth={2.2} className={styles.iconOk} />
                    ) : (
                      <AlertTriangle size={15} strokeWidth={2.2} className={styles.iconWarn} />
                    )}
                    <span className={styles.rowTitle}>
                      {complete
                        ? t("settings.detect.complete")
                        : t("settings.detect.incomplete")}
                    </span>
                    <span className={styles.rowTag}>{t(IGM_SOURCE_LABEL[item.source])}</span>
                    {item.current ? (
                      <span className={styles.rowTagOn}>{t("common.currentUse")}</span>
                    ) : null}
                  </div>
                  <span className={styles.rowSub}>{item.path}</span>
                  <span className={styles.rowMeta}>
                    {`assets ${item.shared.assets ? t("common.yes") : t("common.no")}　libraries ${item.shared.libraries ? t("common.yes") : t("common.no")}　versions ${item.shared.versions ? t("common.yes") : t("common.no")}　${t("nav.horizon")} ${item.horizonCount}`}
                  </span>
                </div>

                <div className={styles.rowActions}>
                  {pendingDelete === item.path ? (
                    <>
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                        onClick={() => {
                          scan.remove(item.path);
                          setPendingDelete(null);
                        }}
                      >
                        <span>{t("common.confirm")}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => setPendingDelete(null)}
                      >
                        <span>{t("common.cancel")}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={item.current}
                        onClick={() => scan.use(item.path)}
                      >
                        <span>
                          {complete
                            ? t("settings.detect.useComplete")
                            : t("settings.detect.use")}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                        aria-label={t("settings.detect.deleteFolder")}
                        disabled={item.current}
                        onClick={() => setPendingDelete(item.path)}
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </IGM_LauncherV2_Card>
  );
}

/** 下载通道自选面板：完全由用户决定，不做优先级与降级 */
function IGM_LauncherV2_ChannelPanel() {
  const t = useTranslations();
  const settings = IGM_LauncherV2_UseSettings();
  const channel = settings.settings?.downloadChannel ?? "direct";

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("settings.channel.title")}</h2>
          <p className={styles.panelDesc}>{t("settings.channel.desc")}</p>
        </div>
      </div>

      <div className={styles.channelList}>
        {[
          {
            id: "sdk" as const,
            title: t("settings.channel.sdkTitle"),
            desc: t("settings.channel.sdkDesc"),
          },
          {
            id: "direct" as const,
            title: t("settings.channel.directTitle"),
            desc: t("settings.channel.directDesc"),
          },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.channelItem} ${channel === item.id ? styles.channelItemOn : ""}`}
            onClick={() => settings.setChannel(item.id)}
          >
            <span className={styles.channelIcon} aria-hidden>
              <Download size={15} strokeWidth={2.2} />
            </span>
            <span className={styles.channelText}>
              <span className={styles.rowTitle}>{item.title}</span>
              <span className={styles.rowSub}>{item.desc}</span>
            </span>
            <span className={styles.channelMark}>
              {channel === item.id
                ? t("settings.channel.selected")
                : t("settings.channel.select")}
            </span>
          </button>
        ))}
      </div>
    </IGM_LauncherV2_Card>
  );
}

/** 外观面板：背景模式、配色方案、毛玻璃模糊度与主题色，改动即时生效 */
function IGM_LauncherV2_AppearancePanel() {
  const t = useTranslations();
  const appearance = IGM_LauncherV2_UseAppearance();
  const view = appearance.appearance;
  const blur = Math.min(
    IGM_LAUNCHERV2_APPEARANCE_BLUR_MAX,
    Math.max(IGM_LAUNCHERV2_APPEARANCE_BLUR_MIN, view.blur),
  );
  const cloudOn = view.background === "cloud";
  const solidOn = view.background === "solid";

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("settings.appearance.title")}</h2>
          <p className={styles.panelDesc}>{t("settings.appearance.desc")}</p>
        </div>
      </div>

      {/* 背景模式：动态云 / 纯色 二选一 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("settings.appearance.modes")}</span>
        <div className={styles.optionRow}>
          {IGM_LAUNCHERV2_BACKGROUND_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.optionCard} ${
                view.background === item.id ? styles.optionCardOn : ""
              }`}
              onClick={() => appearance.set({ background: item.id })}
            >
              <span className={styles.rowTitle}>{t(item.label)}</span>
              <span className={styles.rowSub}>{t(item.hint)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 动态云配色：只改背景色调，不改 UI 主题色 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("settings.appearance.cloud")}</span>
        <div className={styles.swatchRow}>
          {IGM_LAUNCHERV2_CLOUD_PALETTES.map((item) => {
            const active = cloudOn && view.cloud === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.swatch} ${active ? styles.swatchOn : ""}`}
                aria-pressed={active}
                // 点击配色即切到动态云模式，避免「选了配色但背景没变」的困惑
                onClick={() => appearance.set({ background: "cloud", cloud: item.id })}
              >
                <span
                  className={styles.swatchThumb}
                  style={{ background: item.preview }}
                  aria-hidden
                />
                <span className={styles.swatchText}>
                  <span className={styles.rowTitle}>{t(item.label)}</span>
                  <span className={styles.rowSub}>{t(item.hint)}</span>
                </span>
                {active ? <Check size={14} strokeWidth={2.6} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* 纯色背景方案：浅色方案会自动把界面文字切换为深色 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("settings.appearance.solid")}</span>
        <div className={styles.swatchRow}>
          {IGM_LAUNCHERV2_SOLID_PALETTES.map((item) => {
            const active = solidOn && view.solid === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.swatch} ${active ? styles.swatchOn : ""}`}
                aria-pressed={active}
                onClick={() => appearance.set({ background: "solid", solid: item.id })}
              >
                <span
                  className={`${styles.swatchThumb} ${item.light ? styles.swatchThumbLight : ""}`}
                  style={{ background: item.preview }}
                  aria-hidden
                />
                <span className={styles.swatchText}>
                  <span className={styles.rowTitle}>{t(item.label)}</span>
                  <span className={styles.rowSub}>{t(item.hint)}</span>
                </span>
                {active ? <Check size={14} strokeWidth={2.6} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("settings.appearance.blur")}</span>
        <div className={styles.sliderRow}>
          <input
            type="range"
            className={styles.slider}
            min={IGM_LAUNCHERV2_APPEARANCE_BLUR_MIN}
            max={IGM_LAUNCHERV2_APPEARANCE_BLUR_MAX}
            step={1}
            value={blur}
            aria-label={t("settings.appearance.blur")}
            onChange={(event) => appearance.set({ blur: Number(event.target.value) })}
          />
          <span className={styles.sliderValue}>{blur}px</span>
        </div>
        <span className={styles.rowSub}>{t("settings.appearance.blurHint")}</span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("settings.appearance.theme")}</span>
        <div className={styles.themeRow}>
          {IGM_LAUNCHERV2_THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.theme} ${view.theme === item.id ? styles.themeOn : ""}`}
              onClick={() => appearance.set({ theme: item.id })}
            >
              <span
                className={styles.themeSwatch}
                style={{ background: `linear-gradient(135deg, ${item.accent}, ${item.accentSoft})` }}
                aria-hidden
              />
              <span className={styles.themeLabel}>{t(item.label)}</span>
              {view.theme === item.id ? <Check size={13} strokeWidth={2.6} /> : null}
            </button>
          ))}
        </div>
      </div>
    </IGM_LauncherV2_Card>
  );
}

/** 鸣谢头像：地址为空或加载失败时回退到 lucide 默认头像，避免出现破损图片 */
function IGM_LauncherV2_AboutAvatar({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={styles.creditAvatarFallback}>
        <UserRound size={22} strokeWidth={2.2} aria-label={alt} />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={46}
      height={46}
      unoptimized
      className={styles.creditAvatar}
      onError={() => setFailed(true)}
    />
  );
}

/** MuoCeon 团队标识：内联 SVG（非外链文件），保留原始渐变与路径 */
function IGM_LauncherV2_MuoCeonLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={56}
      height={56}
      role="img"
      aria-label="MuoCeon"
      className={styles.teamLogoMuo}
    >
      <defs>
        <linearGradient id="mcRing" x1="60" y1="60" x2="452" y2="452" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#06B6D4" />
          <stop offset="1" stopColor="#0E7490" />
        </linearGradient>
      </defs>
      <path
        d="M158.5 100 L175 32 L230.4 73.8 Z"
        fill="url(#mcRing)"
        stroke="url(#mcRing)"
        strokeWidth={12}
        strokeLinejoin="round"
      />
      <path
        d="M353.5 100 L337 32 L281.6 73.8 Z"
        fill="url(#mcRing)"
        stroke="url(#mcRing)"
        strokeWidth={12}
        strokeLinejoin="round"
      />
      <path
        d="M386.1 125.9 A184 184 0 1 0 386.1 386.1"
        fill="none"
        stroke="url(#mcRing)"
        strokeWidth={38}
        strokeLinecap="round"
      />
      <path
        d="M386.1 386.1 C 436 406, 470 362, 452 306 C 435 252, 392 282, 330 346 C 278 390, 196 388, 182 322"
        fill="none"
        stroke="url(#mcRing)"
        strokeWidth={30}
        strokeLinecap="round"
      />
      <circle cx={256} cy={256} r={20} fill="#FFB020" />
    </svg>
  );
}

/** 关于面板：版本与更新 + 鸣谢 / 开发团队 / 版权声明，语言随全局界面语言切换 */
function IGM_LauncherV2_AboutPanel() {
  const t = useTranslations();
  const { locale, setLocale } = iGM_LauncherV2_UseLocale();
  const update = IGM_LauncherV2_UseUpdate();
  const state = update.state;
  const busy = state.status === "checking" || state.status === "downloading";

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t("settings.about.title")}</h2>
          <p className={styles.panelDesc}>
            {IGM_LAUNCHERV2_APP_NAME} v{IGM_LAUNCHERV2_VERSION}
          </p>
        </div>
        <div className={styles.panelActions}>
          {/* 语言切换：直接写入全局语言（即时切换并本地持久化） */}
          <div className={styles.langToggle} role="group" aria-label={t("settings.about.langToggle")}>
            <button
              type="button"
              className={`${styles.langButton} ${locale === "zh-CN" ? styles.langButtonOn : ""}`}
              aria-pressed={locale === "zh-CN"}
              onClick={() => setLocale("zh-CN")}
            >
              {t("settings.about.toggleZh")}
            </button>
            <button
              type="button"
              className={`${styles.langButton} ${locale === "en" ? styles.langButtonOn : ""}`}
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              {t("settings.about.toggleEn")}
            </button>
          </div>
          <button
            type="button"
            className={styles.actionButton}
            disabled={busy}
            onClick={() => update.check()}
          >
            <RefreshCw size={14} strokeWidth={2.2} />
            <span>
              {state.status === "checking"
                ? t("settings.about.checking")
                : t("settings.about.checkUpdate")}
            </span>
          </button>
        </div>
      </div>

      <div className={styles.pathGrid}>
        <div className={styles.pathRow}>
          <span className={styles.pathLabel}>{t("settings.about.currentVersion")}</span>
          <span className={styles.pathValue}>V{IGM_LAUNCHERV2_VERSION}</span>
        </div>
        <div className={styles.pathRow}>
          <span className={styles.pathLabel}>{t("settings.about.latestVersion")}</span>
          <span className={styles.pathValue}>
            {state.latestVersion ? `V${state.latestVersion}` : "—"}
          </span>
        </div>
        <div className={styles.pathRow}>
          <span className={styles.pathLabel}>{t("settings.about.updateStatus")}</span>
          <span className={styles.pathValue}>
            {t(IGM_UPDATE_STATUS_LABEL[state.status])}
          </span>
        </div>
      </div>

      {state.message ? <p className={styles.notice}>{state.message}</p> : null}
      {state.notes ? <p className={styles.panelDesc}>{state.notes}</p> : null}

      {state.status === "available" ||
      state.status === "downloading" ||
      state.status === "downloaded" ? (
        <div className={styles.aboutActions}>
          {state.status === "downloaded" ? (
            <button type="button" className={styles.actionButton} onClick={() => update.install()}>
              <Power size={14} strokeWidth={2.2} />
              <span>{t("settings.about.installNow")}</span>
            </button>
          ) : (
            <button
              type="button"
              className={styles.actionButton}
              disabled={state.status === "downloading"}
              onClick={() => update.download()}
            >
              <Download size={14} strokeWidth={2.2} />
              <span>
                {state.status === "downloading"
                  ? t("settings.about.downloading", { percent: state.progress.toFixed(0) })
                  : t("settings.about.downloadUpdate")}
              </span>
            </button>
          )}
        </div>
      ) : null}

      {/* 一、鸣谢：头像 + 姓名 + 角色 */}
      <section className={styles.aboutSection}>
        <h3 className={styles.aboutSectionTitle}>{t("settings.about.acknowledgements")}</h3>
        <ul className={styles.creditList}>
          {IGM_ABOUT_CREDITS.map((item) => (
            <li key={item.key} className={styles.creditRow}>
              <IGM_LauncherV2_AboutAvatar
                src={item.avatar}
                alt={t("settings.about.avatarAlt", { name: item.name })}
              />
              <div className={styles.creditText}>
                <span className={styles.creditName}>{item.name}</span>
                <span className={styles.creditRole}>{t(item.role)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 二、开发团队：方形徽标卡片 */}
      <section className={styles.aboutSection}>
        <h3 className={styles.aboutSectionTitle}>{t("settings.about.teams")}</h3>
        <div className={styles.teamRow}>
          <div className={styles.teamCard}>
            <span className={styles.teamLogo}>
              <Image
                src="/image/ig.png"
                alt={t("settings.about.igcTeamAlt")}
                width={56}
                height={56}
                unoptimized
                className={styles.teamLogoImage}
              />
            </span>
            <span className={styles.teamName}>{t("settings.about.igcTeam")}</span>
          </div>
          <div className={styles.teamCard}>
            <IGM_LauncherV2_MuoCeonLogo />
            <span className={styles.teamName}>{t("settings.about.muoTeam")}</span>
          </div>
        </div>
      </section>

      {/* 三、版权声明：许可协议标签随语言，版权句恒为英文全文 */}
      <section className={styles.aboutSection}>
        <h3 className={styles.aboutSectionTitle}>{t("settings.about.copyright")}</h3>
        <div className={styles.copyrightBox}>
          <p className={styles.copyrightLine}>
            <span className={styles.copyrightLabel}>{t("settings.about.licenseLabel")}：</span>
            <span className={styles.copyrightValue}>iGM Limited Distribution License</span>
          </p>
          <p className={styles.copyrightText}>{IGM_ABOUT_COPYRIGHT}</p>
        </div>
      </section>
    </IGM_LauncherV2_Card>
  );
}

export function iGM_LauncherV2_Settings() {
  const t = useTranslations();
  const [tab, setTab] = useState<iGM_LauncherV2_SettingsTab>("general");

  return (
    <div className={styles.wrap}>
      <nav className={styles.tabs}>
        {IGM_SETTINGS_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.tab} ${tab === item.id ? styles.tabOn : ""}`}
              onClick={() => setTab(item.id)}
            >
              <Icon size={15} strokeWidth={2.2} />
              <span>{t(item.label)}</span>
            </button>
          );
        })}
      </nav>

      {tab === "general" ? (
        <>
          <IGM_LauncherV2_LanguagePanel />
          <IGM_LauncherV2_PathsPanel />
          <IGM_LauncherV2_GameDetectPanel />
          <IGM_LauncherV2_ChannelPanel />
        </>
      ) : tab === "appearance" ? (
        <IGM_LauncherV2_AppearancePanel />
      ) : (
        <IGM_LauncherV2_AboutPanel />
      )}
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_Settings;
