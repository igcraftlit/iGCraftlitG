/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_SettingsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Settings（SPA 页 id：settings / about）
 * 模块：iGM_Launcher_SettingsPage
 * 作用：设置页，按通用 / 外观 / Java / 游戏目录 / 下载 / 关于分组展示配置项
 * 内容：语言与明暗模式为可用控件（真实生效并持久化）；
 *       模块五「游戏目录」分组可管理已识别的 .minecraft 目录（扫描 / 手动添加 /
 *       设为默认 / 移除记录）；其余开关、路径、下拉均为静态占位
 */

// 导入依赖 //
"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeInfo,
  Coffee,
  Cpu,
  DownloadCloud,
  FolderOpen,
  FolderSearch,
  Languages,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Settings2,
  Star,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_VERSION,
  iGM_Launcher_McParentOfRoot,
  type iGM_Launcher_GlassPreset,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_ReadGlassPreset as IGM_Launcher_ReadGlassPreset,
  iGM_Launcher_SaveGlassPreset as IGM_Launcher_SaveGlassPreset,
} from "@/components/iGM_Launcher_Providers/iGM_Launcher_Glass";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_Input as IGM_Launcher_Input } from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseLocale } from "@/components/iGM_Launcher_Providers/iGM_Launcher_LocaleProvider";
import { IGM_LAUNCHER_LOCALE_LABELS } from "@/i18n/iGM_Launcher_Locales";
import styles from "./iGM_Launcher_SettingsPage.module.css";

// 类型定义 //
interface iGM_Launcher_SettingsGroupProps {
  id: string;
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}

interface iGM_Launcher_SettingsRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

// 核心逻辑 //
/** 玻璃背景预设清单：value 与 iGM_Globals.css 中的 html[data-igm-glass] 对应 */
const IGM_LAUNCHER_GLASS_OPTIONS: { value: iGM_Launcher_GlassPreset; labelKey: string }[] = [
  { value: "none", labelKey: "glassNone" },
  { value: "ice", labelKey: "glassIce" },
  { value: "warm", labelKey: "glassWarm" },
  { value: "mint", labelKey: "glassMint" },
  { value: "violet", labelKey: "glassViolet" },
];

/** 设置分组卡片 */
function IGM_Launcher_SettingsGroup({
  id,
  title,
  icon: Icon,
  children,
}: iGM_Launcher_SettingsGroupProps) {
  return (
    <IGM_Launcher_Card className={styles.group}>
      <h3 id={id} className={styles.groupTitle}>
        <Icon size={15} strokeWidth={1.8} />
        <span>{title}</span>
      </h3>
      <div className={styles.groupBody}>{children}</div>
    </IGM_Launcher_Card>
  );
}

/** 设置行：左标签说明 + 右控件 */
function IGM_Launcher_SettingsRow({
  label,
  description,
  children,
}: iGM_Launcher_SettingsRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {description ? <span className={styles.rowDescription}>{description}</span> : null}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

/** 开关占位控件：仅本地视觉状态，不持久化 */
function IGM_Launcher_Switch({ label }: { label: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.switch} ${checked ? styles.switchOn : ""}`}
      onClick={() => setChecked((value) => !value)}
    >
      <span className={styles.switchKnob} />
    </button>
  );
}

export function iGM_Launcher_SettingsPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = iGM_Launcher_UseLocale();
  const {
    gameDirs,
    scanningGameDirs,
    scanGameDirs,
    addGameDir,
    removeGameDir,
    setDefaultGameDir,
    rootDir,
    scanningInstalled,
    applyRootDir,
    pickDir,
    javas,
    defaultJavaId,
    setDefaultJava,
  } = iGM_Launcher_UseStore();
  // next-themes 的主题值在挂载后才可用，挂载前不渲染选中态，避免水合不一致
  const [mounted, setMounted] = useState(false);
  // 模块五：手动添加游戏目录的输入值
  const [newDirPath, setNewDirPath] = useState("");
  // 模块七：下载前置目录的输入草稿（其下自动创建 .minecraft，可放在任意磁盘）
  const [draftRoot, setDraftRoot] = useState("");
  // 个性化：透明玻璃色背景预设（挂载后从 localStorage 恢复，避免水合不一致）
  const [glass, setGlass] = useState<iGM_Launcher_GlassPreset>("none");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setGlass(IGM_Launcher_ReadGlassPreset());
  }, []);

  // 生效根目录（含 .minecraft）反推为前置目录回填，保持输入框与磁盘一致
  useEffect(() => {
    setDraftRoot(iGM_Launcher_McParentOfRoot(rootDir?.path ?? ""));
  }, [rootDir?.path]);

  const themeOptions: { key: string; label: string; icon: LucideIcon }[] = [
    { key: "light", label: tCommon("light"), icon: Sun },
    { key: "dark", label: tCommon("dark"), icon: Moon },
    { key: "system", label: tCommon("system"), icon: Monitor },
  ];

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader title={t("title")} description={t("subtitle")} />

      {/* 通用 */}
      <IGM_Launcher_SettingsGroup id="general" title={t("groupGeneral")} icon={Settings2}>
        <IGM_Launcher_SettingsRow label={t("language")} description={t("languageDesc")}>
          <div className={styles.segmented}>
            {(["zh-CN", "en"] as const).map((code) => (
              <button
                type="button"
                key={code}
                className={`${styles.segment} ${
                  locale === code ? styles.segmentActive : ""
                }`}
                onClick={() => setLocale(code)}
              >
                <Languages size={13} strokeWidth={1.8} />
                {IGM_LAUNCHER_LOCALE_LABELS[code]}
              </button>
            ))}
          </div>
        </IGM_Launcher_SettingsRow>
        <IGM_Launcher_SettingsRow label={t("autoStart")} description={t("autoStartDesc")}>
          <IGM_Launcher_Switch label={t("autoStart")} />
        </IGM_Launcher_SettingsRow>
        <IGM_Launcher_SettingsRow label={t("minimizeToTray")}>
          <IGM_Launcher_Switch label={t("minimizeToTray")} />
        </IGM_Launcher_SettingsRow>
      </IGM_Launcher_SettingsGroup>

      {/* 外观 */}
      <IGM_Launcher_SettingsGroup id="appearance" title={t("groupAppearance")} icon={Palette}>
        <IGM_Launcher_SettingsRow label={t("themeMode")}>
          <div className={styles.segmented}>
            {themeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  type="button"
                  key={option.key}
                  className={`${styles.segment} ${
                    mounted && theme === option.key ? styles.segmentActive : ""
                  }`}
                  onClick={() => setTheme(option.key)}
                >
                  <Icon size={13} strokeWidth={1.8} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </IGM_Launcher_SettingsRow>
        <IGM_Launcher_SettingsRow
          label={t("reduceMotion")}
          description={t("reduceMotionDesc")}
        >
          <IGM_Launcher_Switch label={t("reduceMotion")} />
        </IGM_Launcher_SettingsRow>
        {/* 个性化：透明玻璃色背景，仅启动器端生效 */}
        <IGM_Launcher_SettingsRow label={t("glassTitle")} description={t("glassDesc")}>
          <div className={styles.glassSwatches}>
            {IGM_LAUNCHER_GLASS_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                title={t(option.labelKey)}
                aria-label={t(option.labelKey)}
                aria-pressed={glass === option.value}
                className={`${styles.glassSwatch} ${styles[`glassSwatch_${option.value}`]} ${
                  glass === option.value ? styles.glassSwatchActive : ""
                }`}
                onClick={() => setGlass(IGM_Launcher_SaveGlassPreset(option.value))}
              />
            ))}
          </div>
        </IGM_Launcher_SettingsRow>
      </IGM_Launcher_SettingsGroup>

      {/*
        Java：模块七仅保留「默认 Java」选择。
        Java 的检测、新增、测试与移除已移入独立的 Java 管理入口，设置页不再重复提供，
        这里只决定实例未单独指定运行时时所使用的全局默认。
      */}
      <IGM_Launcher_SettingsGroup id="java" title={t("groupJava")} icon={Coffee}>
        <IGM_Launcher_SettingsRow label={t("defaultJava")} description={t("defaultJavaDesc")}>
          <select
            className={styles.field}
            value={defaultJavaId ?? ""}
            disabled={javas.length === 0}
            onChange={(event) => void setDefaultJava(event.target.value)}
          >
            <option value="" disabled={javas.length > 0}>
              {t("defaultJavaNone")}
            </option>
            {javas.map((runtime) => (
              <option key={runtime.id} value={runtime.id}>
                {runtime.name} · Java {runtime.version}
              </option>
            ))}
          </select>
        </IGM_Launcher_SettingsRow>
      </IGM_Launcher_SettingsGroup>

      {/* 模块五：游戏目录 */}
      <IGM_Launcher_SettingsGroup id="gameDirs" title={t("groupGameDirs")} icon={FolderSearch}>
        <IGM_Launcher_SettingsRow label={t("gameDirScan")} description={t("gameDirScanDesc")}>
          <IGM_Launcher_Button
            variant="secondary"
            disabled={scanningGameDirs}
            onClick={() => void scanGameDirs()}
          >
            <FolderSearch size={14} strokeWidth={1.8} />
            {scanningGameDirs ? t("gameDirScanning") : t("gameDirScanAction")}
          </IGM_Launcher_Button>
        </IGM_Launcher_SettingsRow>

        <div className={styles.dirList}>
          {gameDirs.length === 0 ? (
            <p className={styles.dirEmpty}>{t("gameDirEmpty")}</p>
          ) : (
            gameDirs.map((dir) => (
              <div key={dir.id} className={styles.dirItem}>
                <span className={styles.dirPath} title={dir.path}>
                  {dir.path}
                </span>
                {dir.isDefault ? (
                  <IGM_Launcher_Badge tone="accent">{t("gameDirDefault")}</IGM_Launcher_Badge>
                ) : null}
                <IGM_Launcher_Badge tone="muted">
                  {t("gameDirVersions", { count: dir.versionCount })}
                </IGM_Launcher_Badge>
                {dir.isDefault ? null : (
                  <IGM_Launcher_Button
                    variant="ghost"
                    className={styles.dirAction}
                    onClick={() => void setDefaultGameDir(dir.id)}
                  >
                    <Star size={13} strokeWidth={1.8} />
                    {t("gameDirSetDefault")}
                  </IGM_Launcher_Button>
                )}
                <IGM_Launcher_Button
                  variant="ghost"
                  className={styles.dirAction}
                  onClick={() => void removeGameDir(dir.id)}
                >
                  <Trash2 size={13} strokeWidth={1.8} />
                  {tCommon("remove")}
                </IGM_Launcher_Button>
              </div>
            ))
          )}
        </div>

        <IGM_Launcher_SettingsRow label={t("gameDirAdd")} description={t("gameDirAddDesc")}>
          <div className={styles.fieldRow}>
            <IGM_Launcher_Input
              className={styles.field}
              value={newDirPath}
              placeholder={t("gameDirAddPlaceholder")}
              aria-label={t("gameDirAddPlaceholder")}
              onChange={(event) => setNewDirPath(event.target.value)}
            />
            <IGM_Launcher_Button
              variant="secondary"
              onClick={() => {
                void addGameDir(newDirPath).then((ok) => {
                  if (ok) setNewDirPath("");
                });
              }}
            >
              {tCommon("add")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_SettingsRow>

        <p className={styles.dirHint}>{t("gameDirHint")}</p>
      </IGM_Launcher_SettingsGroup>

      {/* 下载 */}
      <IGM_Launcher_SettingsGroup
        id="downloads"
        title={t("groupDownloads")}
        icon={DownloadCloud}
      >
        {/*
          模块七：下载目录（即共享 .minecraft 根）。
          这里填写的是「前置目录」，可放在 D 盘等任意磁盘，游戏最终安装在
          所选目录下的 .minecraft 内（符合 Minecraft 目录规范），全部实例共用一份。
        */}
        <IGM_Launcher_SettingsRow label={t("downloadDir")} description={t("downloadDirDesc")}>
          <div className={styles.fieldRow}>
            <IGM_Launcher_Input
              className={styles.field}
              value={draftRoot}
              placeholder={t("downloadDirPlaceholder")}
              aria-label={t("downloadDir")}
              onChange={(event) => setDraftRoot(event.target.value)}
            />
            <IGM_Launcher_Button
              variant="secondary"
              onClick={() => {
                void pickDir(draftRoot.trim() || undefined).then((path) => {
                  if (path) setDraftRoot(path);
                });
              }}
            >
              <FolderOpen size={14} strokeWidth={1.8} />
              {tCommon("browse")}
            </IGM_Launcher_Button>
            <IGM_Launcher_Button
              variant="secondary"
              disabled={scanningInstalled}
              onClick={() => void applyRootDir(draftRoot.trim() || undefined)}
            >
              {scanningInstalled ? t("gameDirScanning") : tCommon("save")}
            </IGM_Launcher_Button>
            <IGM_Launcher_Button
              variant="ghost"
              disabled={scanningInstalled}
              onClick={() => void applyRootDir()}
            >
              {t("downloadDirReset")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_SettingsRow>

        {rootDir ? (
          <div className={styles.dirItem}>
            <span className={styles.dirPath} title={rootDir.path}>
              {t("downloadDirFinal")}：{rootDir.path || t("rootDirUnknown")}
            </span>
            <IGM_Launcher_Badge tone={rootDir.exists ? "success" : "muted"}>
              {rootDir.exists ? t("rootDirExists") : t("rootDirMissing")}
            </IGM_Launcher_Badge>
            {rootDir.isDefault ? (
              <IGM_Launcher_Badge tone="accent">{t("gameDirDefault")}</IGM_Launcher_Badge>
            ) : null}
          </div>
        ) : null}

        <p className={styles.dirHint}>{t("downloadDirHint")}</p>

        <IGM_Launcher_SettingsRow label={t("concurrency")}>
          <select className={styles.field} defaultValue="4" disabled>
            <option value="2">2</option>
            <option value="4">4</option>
            <option value="6">6</option>
          </select>
        </IGM_Launcher_SettingsRow>
      </IGM_Launcher_SettingsGroup>

      {/* 关于 */}
      <IGM_Launcher_SettingsGroup id="about" title={t("groupAbout")} icon={BadgeInfo}>
        <IGM_Launcher_SettingsRow label={t("aboutVersion")}>
          {/* 版本号以 IGM_LAUNCHER_VERSION 为准（当前 26.3.1 official version），不再叠加 v 前缀 */}
          <IGM_Launcher_Badge tone="accent">{IGM_LAUNCHER_VERSION}</IGM_Launcher_Badge>
        </IGM_Launcher_SettingsRow>
        <IGM_Launcher_SettingsRow label={t("aboutCore")}>
          <span className={styles.coreValue}>
            <Cpu size={13} strokeWidth={1.8} />
            <IGM_Launcher_Badge tone="muted">{t("aboutCoreValue")}</IGM_Launcher_Badge>
          </span>
        </IGM_Launcher_SettingsRow>
        <IGM_Launcher_SettingsRow label={t("aboutDownloadEngine")}>
          <span className={styles.coreValue}>
            <DownloadCloud size={13} strokeWidth={1.8} />
            <IGM_Launcher_Badge tone="muted">{t("aboutDownloadEngineValue")}</IGM_Launcher_Badge>
          </span>
        </IGM_Launcher_SettingsRow>
        <IGM_Launcher_SettingsRow label={t("aboutArch")}>
          <span className={styles.coreValue}>
            <Monitor size={13} strokeWidth={1.8} />
            <IGM_Launcher_Badge tone="muted">{t("aboutArchValue")}</IGM_Launcher_Badge>
          </span>
        </IGM_Launcher_SettingsRow>
        <IGM_Launcher_SettingsRow label={t("checkUpdates")}>
          <IGM_Launcher_Button variant="secondary">
            <RefreshCw size={14} strokeWidth={1.8} />
            {t("checkUpdates")}
          </IGM_Launcher_Button>
        </IGM_Launcher_SettingsRow>
        <p className={styles.aboutFooter}>
          {t("aboutTeam")}
          <br />
          {t("aboutContact")}
        </p>
      </IGM_Launcher_SettingsGroup>

      <IGM_Launcher_PlaceholderNote>{tCommon("comingSoon")}</IGM_Launcher_PlaceholderNote>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_SettingsPage;