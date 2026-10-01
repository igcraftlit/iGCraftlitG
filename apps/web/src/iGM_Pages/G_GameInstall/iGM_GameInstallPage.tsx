/**
 * 文件路径：apps/web/src/iGM_Pages/G_GameInstall/iGM_GameInstallPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_GameInstall?version=xxx（静态壳，查询参数驱动加载）
 * 模块：G_GameInstall
 * 作用：原版游戏下载确认页——选择模组加载器与安装根目录并一键开始下载
 * 内容：版本摘要卡片、模组加载器选择（原版 / Fabric / Forge / NeoForge）、
 *       Fabric Loader 版本下拉、安装根目录输入（localStorage 记忆 / 后端原生
 *       文件夹选择器）、最终安装位置与版本目录预览、已安装冲突处理、开始安装按钮
 * 说明：
 *   - 纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 *   - 用户选择的是「目录」，最终位置为 <所选目录>/.minecraft/<版本目录名>：
 *     .minecraft 一级由后端自动补全，版本目录名规则与后端 iGM_ResolveVersionDir 一致
 *   - Forge / NeoForge 本模块未支持，置灰并标注「敬请期待」
 *   - 用户全程不接触 libraries / assets / natives 概念
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Calendar,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiGetGameVersion,
  iGM_ApiListFabricLoaders,
  iGM_ApiListGameLoaders,
  iGM_ApiPickFolder,
  iGM_ApiStartGameInstall,
  type iGM_FabricLoaderOptions,
  type iGM_GameLoader,
  type iGM_GameVersion,
  type iGM_ModLoader,
} from "../../iGM_Services/iGM_GameClient";
import { iGM_FormatFileSize } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import m15 from "../iGM_Module15.module.css";
import styles from "../iGM_Game.module.css";

// 类型定义 //
/** localStorage 中记住上次安装根目录的键 */
const iGM_InstallDirStorageKey = "igm.game.installDir";

/** Minecraft 规范目录名：所选目录下固定建立该级，再按版本隔离 */
const iGM_MinecraftDirName = ".minecraft";

// 核心逻辑 //
/** 把后端下发的 i18n 文案键解析为当前语言文本 */
function iGM_ResolveKey(
  t: ReturnType<typeof useTranslations>,
  key: string,
): string {
  return key.includes(".") && t.has(key) ? t(key) : key;
}

/**
 * 计算最终安装目录（仅用于界面预览）：<所选目录>/.minecraft/<版本目录名>
 * 与后端 iGM_ResolveInstallDir 同规则：末级已是 .minecraft 则仅追加版本目录，
 * 已精确选到 .minecraft/<版本目录名> 则原样保留；
 * 为空表示将使用后端默认目录
 */
function iGM_ResolveFinalDir(root: string, versionDir: string): string {
  const trimmed = root.trim().replace(/^"(.*)"$/, "$1").replace(/[\\/]+$/, "");
  if (!trimmed) return "";
  const parts = trimmed.split(/[\\/]+/);
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  const parent = (parts[parts.length - 2] ?? "").toLowerCase();
  if (last === versionDir.toLowerCase() && parent === iGM_MinecraftDirName) {
    return trimmed;
  }
  const separator = trimmed.includes("\\") ? "\\" : "/";
  if (last === iGM_MinecraftDirName) {
    return `${trimmed}${separator}${versionDir}`;
  }
  return `${trimmed}${separator}${iGM_MinecraftDirName}${separator}${versionDir}`;
}

/** 原版游戏安装确认页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_GameInstallPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const { locale } = iGM_UseLocale();
  const searchParams = useSearchParams();
  const versionName = searchParams.get("version") ?? "";

  const [version, setVersion] = useState<iGM_GameVersion | null>(null);
  const [loaders, setLoaders] = useState<iGM_ModLoader[]>([]);
  const [loader, setLoader] = useState<iGM_GameLoader>("none");
  const [fabricOptions, setFabricOptions] = useState<iGM_FabricLoaderOptions | null>(null);
  const [fabricVersion, setFabricVersion] = useState("");
  const [fabricLoading, setFabricLoading] = useState(false);
  const [installDir, setInstallDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [browsing, setBrowsing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 恢复上次选择的安装根目录 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(iGM_InstallDirStorageKey);
    if (saved) setInstallDir(saved);
  }, []);

  /** 拉取版本详情与模组加载器字典 */
  const iGM_Load = useCallback(async () => {
    if (!versionName) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const [versionRes, loaderRes] = await Promise.all([
        iGM_ApiGetGameVersion(versionName),
        iGM_ApiListGameLoaders(),
      ]);
      setVersion(versionRes.data?.version ?? null);
      setLoaders(loaderRes.data?.items ?? []);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setVersion(null);
    } finally {
      setLoading(false);
    }
  }, [versionName, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 选择 Fabric 时按需拉取 Loader 版本选项（默认最新稳定版） */
  useEffect(() => {
    if (loader !== "fabric" || fabricOptions || fabricLoading) return;
    setFabricLoading(true);
    iGM_ApiListFabricLoaders()
      .then((response) => {
        const data = response.data;
        if (!data) return;
        setFabricOptions(data);
        setFabricVersion(data.defaultVersion);
      })
      .catch((error) => {
        setErrorText(iGM_ResolveErrorText(t, error));
      })
      .finally(() => {
        setFabricLoading(false);
      });
  }, [loader, fabricOptions, fabricLoading, t]);

  /** 切换模组加载器（仅原版与 Fabric 可选） */
  function iGM_SelectLoader(slug: string): void {
    if (starting) return;
    if (slug !== "none" && slug !== "fabric") return;
    setLoader(slug);
  }

  /** 调起后端所在机器的原生文件夹选择器 */
  async function iGM_HandleBrowse(): Promise<void> {
    if (browsing || starting) return;
    setBrowsing(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiPickFolder();
      const picked = response.data?.path;
      if (picked) setInstallDir(picked);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBrowsing(false);
    }
  }

  /** 创建安装任务并跳转到进度页 */
  async function iGM_HandleStart(): Promise<void> {
    if (!version || starting) return;
    if (version.installed && !window.confirm(t("game.overwriteConfirm", { version: version.version }))) {
      return;
    }
    setStarting(true);
    setErrorText(null);
    const dir = installDir.trim();
    try {
      const response = await iGM_ApiStartGameInstall({
        version: version.version,
        loader,
        loaderVersion:
          loader === "fabric" ? fabricVersion || undefined : undefined,
        installDir: dir || undefined,
      });
      const install = response.data?.install;
      if (dir) window.localStorage.setItem(iGM_InstallDirStorageKey, dir);
      if (install) {
        router.push(`/G_GameProgress?taskId=${encodeURIComponent(install.id)}`);
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setStarting(false);
    }
  }

  // 版本目录名与最终安装位置预览
  const versionDir = version
    ? loader === "fabric"
      ? `${version.version}-fabric`
      : version.version
    : "";
  const finalDir = versionDir ? iGM_ResolveFinalDir(installDir, versionDir) : "";

  if (loading) {
    return (
      <div className={m10.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("game.stateLoading")}
      </div>
    );
  }

  if (!version) {
    return (
      <div className={pageStyles.page}>
        <IGM_EmptyState
          icon={Download}
          title={t("game.notFound")}
          description={errorText ?? undefined}
          action={
            <Link href="/G_MinecraftVersions" className={m10.primaryButton}>
              <ArrowLeft size={15} strokeWidth={1.8} />
              {t("game.backToVersions")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className={pageStyles.page}>
      <Link href="/G_MinecraftVersions" className={m10.backLink}>
        <ArrowLeft size={14} strokeWidth={2} />
        {t("game.backToVersions")}
      </Link>

      {/* 版本摘要 */}
      <section className={m10.sectionCard}>
        <span className={m15.progressTitle}>
          {t("game.installTitle", { version: version.version })}
        </span>
        <div className={styles.versionMeta}>
          {version.releaseTime && (
            <div className={styles.versionMetaRow}>
              <Calendar size={13} strokeWidth={1.8} />
              {iGM_FormatDate(locale, version.releaseTime)}
            </div>
          )}
          <div className={styles.versionMetaRow}>
            <HardDrive size={13} strokeWidth={1.8} />
            {t("game.sizeLabel")}
            {typeof version.totalSize === "number"
              ? iGM_FormatFileSize(version.totalSize)
              : t("game.sizeComputing")}
          </div>
        </div>
        <p className={m10.hint}>{t("game.installDescription")}</p>
      </section>

      {/* 已安装冲突：覆盖 / 修复 / 取消 */}
      {version.installed && (
        <div className={`${m10.alert}`}>
          {t("game.installedConflict", { version: version.version })}
        </div>
      )}

      <section className={m15.form}>
        {/* 模组加载器 */}
        <div className={m15.field}>
          <span className={m15.label}>{t("game.loaderLabel")}</span>
          <div className={styles.loaderGrid}>
            {loaders.map((item) => {
              const active = loader === item.slug;
              const nameKey = `game.loaderNames.${item.slug}`;
              return (
                <button
                  key={item.slug}
                  type="button"
                  aria-pressed={active}
                  disabled={!item.supported || starting}
                  className={`${styles.loaderOption} ${
                    active ? styles.loaderOptionActive : ""
                  } ${!item.supported ? styles.loaderOptionDisabled : ""}`}
                  onClick={() => iGM_SelectLoader(item.slug)}
                >
                  <span className={styles.loaderOptionHead}>
                    <span className={styles.loaderName}>
                      {t.has(nameKey) ? t(nameKey) : item.name}
                    </span>
                    {!item.supported && (
                      <span className={styles.loaderBadge}>
                        {t("game.comingSoon")}
                      </span>
                    )}
                  </span>
                  {item.descriptionKey && (
                    <span className={styles.loaderDescription}>
                      {iGM_ResolveKey(t, item.descriptionKey)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fabric Loader 版本：仅选择 Fabric 时显示 */}
        {loader === "fabric" && (
          <div className={m15.field}>
            <label className={m15.label} htmlFor="igm-game-loader-version">
              {t("game.loaderVersionLabel")}
            </label>
            {fabricLoading ? (
              <p className={m10.hint}>
                <LoaderCircle size={13} className="igm-spin" style={{ verticalAlign: "-2px", marginRight: 4 }} />
                {t("game.loaderLoading")}
              </p>
            ) : fabricOptions && fabricOptions.versions.length > 0 ? (
              <select
                id="igm-game-loader-version"
                className={m15.select}
                value={fabricVersion}
                disabled={starting}
                onChange={(event) => setFabricVersion(event.target.value)}
              >
                {fabricOptions.versions.map((value) => (
                  <option key={value} value={value}>
                    {value === fabricOptions.defaultVersion
                      ? t("game.loaderDefaultVersion", { version: value })
                      : value}
                  </option>
                ))}
              </select>
            ) : (
              <p className={m10.hint}>{t("game.loaderUnavailable")}</p>
            )}
          </div>
        )}

        {/* 安装根目录 */}
        <div className={m15.field}>
          <label className={m15.label} htmlFor="igm-game-install-dir">
            {t("game.installPath")}
          </label>
          <div className={styles.pathRow}>
            <input
              id="igm-game-install-dir"
              className={`${m15.input} ${styles.pathInput}`}
              type="text"
              value={installDir}
              placeholder={t("game.installPathPlaceholder")}
              onChange={(event) => setInstallDir(event.target.value)}
            />
            <button
              type="button"
              className={m10.ghostButton}
              disabled={browsing || starting}
              onClick={() => void iGM_HandleBrowse()}
            >
              {browsing ? (
                <LoaderCircle size={15} className="igm-spin" />
              ) : (
                <FolderOpen size={15} strokeWidth={1.8} />
              )}
              {t("game.browse")}
            </button>
          </div>
          <p className={styles.pathPreview}>
            <HardDrive size={13} strokeWidth={1.8} />
            {t("game.installFinalPathLabel")}
            <span className={styles.pathPreviewValue}>
              {finalDir || t("game.installFinalPathDefault")}
            </span>
          </p>
          <p className={m10.hint}>
            <Info size={13} strokeWidth={1.8} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {t("game.installPathHint")}
          </p>
          <p className={m10.hint}>
            {t("game.versionDirLabel")}
            <span className={styles.pathPreviewValue}>{versionDir}</span>
          </p>
        </div>

        {errorText && <div className={`${m10.alert} ${m10.alertError}`}>{errorText}</div>}

        <div className={m15.actionRow}>
          <button
            type="button"
            className={m15.primaryButton}
            disabled={starting}
            onClick={() => void iGM_HandleStart()}
          >
            {starting ? (
              <LoaderCircle size={15} className="igm-spin" />
            ) : (
              <Download size={15} strokeWidth={1.8} />
            )}
            {version.installed ? t("game.overwriteInstall") : t("game.startInstall")}
          </button>
          {version.installed && (
            <>
              <Link href="/G_GameInstalled" className={m10.ghostButton}>
                <Wrench size={15} strokeWidth={1.8} />
                {t("game.repair")}
              </Link>
              <Link href="/G_MinecraftVersions" className={m10.ghostButton}>
                {t("game.cancel")}
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// 导出 //
export default iGM_GameInstallPage;