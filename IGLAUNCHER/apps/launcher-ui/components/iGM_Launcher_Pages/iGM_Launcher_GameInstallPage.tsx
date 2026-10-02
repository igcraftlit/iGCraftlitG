/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_GameInstallPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_GameInstall（SPA 页 id：gameInstall）
 * 模块：iGM_Launcher_GameInstallPage
 * 作用：游戏本体真实下载页，由版本库未安装版本的「下载」入口跳转
 * 内容：版本选择（版本库条目）、加载器选择（当前仅 Vanilla 与 Fabric 可用）、
 *       Fabric 加载器版本选择、自定义下载目录（共享 .minecraft 根，遵守官方目录规则）、
 *       发起真实下载（minecraft:download-start）后跳转独立下载进度页展示进度；
 *       versions / libraries / assets 由全部实例共享，只存一份，不重复下载
 *
 * 说明：真实文件下载由主进程下载引擎完成（Mojang 官方清单 + 官方资源 CDN，
 *       Fabric 安装叠加 Fabric 官方元数据），本页只负责选择与发起，
 *       进度与取消一律在独立下载进度页（downloadProgress）完成，两页数据同源；
 *       浏览器调试环境下无文件系统权限，桥接层会如实拒绝并回传原因。
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  FolderOpen,
  HardDrive,
  Layers,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_INSTANCES_DIR_NAME,
  IGM_LAUNCHER_INSTANCE_SUBDIRS,
  IGM_LAUNCHER_LOADER_OPTIONS,
  IGM_LAUNCHER_MC_ROOT_DIR_NAME,
  IGM_LAUNCHER_SHARED_SUBDIRS,
  iGM_Launcher_FormatSize,
  iGM_Launcher_McParentOfRoot,
  iGM_Launcher_McRootOfParent,
  iGM_Launcher_VersionDirName,
  type iGM_Launcher_LoaderType,
  type iGM_Launcher_VersionLibraryEntry,
  type iGM_Launcher_VersionType,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import {
  iGM_Launcher_Field as IGM_Launcher_Field,
  iGM_Launcher_Input as IGM_Launcher_Input,
  iGM_Launcher_Select as IGM_Launcher_Select,
} from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import {
  iGM_Launcher_BridgeCall,
  iGM_Launcher_SendHostMessage,
} from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import type { iGM_Launcher_PageProps } from "./iGM_Launcher_PageRegistry";
import styles from "./iGM_Launcher_GameInstallPage.module.css";

// 类型定义 //
/** 目录结构预览行：文本 + 是否为共享目录（共享目录高亮，突出「只存一份」） */
interface iGM_Launcher_LayoutLine {
  text: string;
  shared: boolean;
}

/** 当前下载能力开放的加载器（其余加载器置灰，留待后续模块） */
const IGM_LAUNCHER_DOWNLOAD_SUPPORTED_LOADERS: ReadonlySet<iGM_Launcher_LoaderType> = new Set([
  "vanilla",
  "fabric",
]);

// 核心逻辑 //

/** 官方目录结构预览：versions / libraries / assets 共享，instances 下为各实例隔离目录 */
function iGM_Launcher_BuildLayoutLines(versionDirName: string): iGM_Launcher_LayoutLine[] {
  const lines: iGM_Launcher_LayoutLine[] = [
    { text: `${IGM_LAUNCHER_MC_ROOT_DIR_NAME}/`, shared: false },
  ];
  for (const dir of IGM_LAUNCHER_SHARED_SUBDIRS) {
    lines.push({
      text: `├─ ${dir}/${dir === "versions" ? `${versionDirName}/` : ""}`,
      shared: true,
    });
  }
  lines.push({ text: `└─ ${IGM_LAUNCHER_INSTANCES_DIR_NAME}/`, shared: false });
  lines.push({ text: `   └─ <instance-name>/`, shared: false });
  IGM_LAUNCHER_INSTANCE_SUBDIRS.forEach((dir, index) => {
    const last = index === IGM_LAUNCHER_INSTANCE_SUBDIRS.length - 1;
    lines.push({ text: `      ${last ? "└─" : "├─"} ${dir}/`, shared: false });
  });
  return lines;
}

export function iGM_Launcher_GameInstallPage({ params }: iGM_Launcher_PageProps) {
  const t = useTranslations("gameInstall");
  const tVersions = useTranslations("versions");
  const tCommon = useTranslations("common");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const {
    versionLibrary,
    syncingLibrary,
    syncVersionLibrary,
    rootDir,
    installedVersions,
    applyRootDir,
    pickDir,
    scanningInstalled,
  } = iGM_Launcher_UseStore();

  /* ---------- 版本选择 ---------- */

  const [version, setVersion] = useState(params?.version ?? "");

  // 版本下拉：按发布时间倒序；来自版本库之外的目标版本（如深链接）补在首位
  const versionOptions = useMemo<iGM_Launcher_VersionLibraryEntry[]>(() => {
    const list = [...versionLibrary.entries];
    list.sort((a, b) => (b.releaseTime ?? "").localeCompare(a.releaseTime ?? ""));
    if (version && !list.some((item) => item.version === version)) {
      list.unshift({
        id: version,
        version,
        type: "unknown",
        releaseTime: null,
        totalSize: null,
        installed: false,
      });
    }
    return list;
  }, [versionLibrary.entries, version]);

  const entry = useMemo(
    () => versionOptions.find((item) => item.version === version),
    [versionOptions, version],
  );

  const typeLabel = (type: iGM_Launcher_VersionType | undefined): string =>
    tVersions(`type_${type ?? "unknown"}`);

  /* ---------- 加载器选择 ---------- */

  const [loader, setLoader] = useState<iGM_Launcher_LoaderType>("vanilla");
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loaderVersion, setLoaderVersion] = useState("");
  const [loadingLoaderVersions, setLoadingLoaderVersions] = useState(false);
  const [loaderError, setLoaderError] = useState("");

  // 切换版本或加载器后重新读取加载器可选版本（仅 Fabric 有加载器版本）
  useEffect(() => {
    setLoaderError("");
    if (loader !== "fabric" || !version) {
      setLoaderVersions([]);
      setLoaderVersion("");
      return;
    }
    let cancelled = false;
    setLoadingLoaderVersions(true);
    void iGM_Launcher_BridgeCall("minecraft:download-loader-versions", {
      version,
      loader: "fabric",
    })
      .then((response) => {
        if (cancelled) return;
        if (!response.success || !response.data) {
          setLoaderVersions([]);
          setLoaderVersion("");
          setLoaderError(response.message || t("loaderVersionError"));
          return;
        }
        const list = response.data.loaderVersions;
        setLoaderVersions(list);
        setLoaderVersion(list[0] ?? "");
      })
      .finally(() => {
        if (!cancelled) setLoadingLoaderVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loader, version, t]);

  /** 版本目录名：原版 <version>，加载器 <version>-<loader> */
  const versionDirName = useMemo(
    () => (version ? iGM_Launcher_VersionDirName(version, loader) : ""),
    [version, loader],
  );
  const alreadyInstalled = useMemo(
    () => installedVersions.some((item) => item.id === versionDirName),
    [installedVersions, versionDirName],
  );

  /* ---------- 自定义下载目录（前置目录） ---------- */

  // 前置目录输入草稿：由生效根目录反推上层目录回填，可改到任意磁盘
  const [draftRoot, setDraftRoot] = useState("");
  useEffect(() => {
    setDraftRoot(iGM_Launcher_McParentOfRoot(rootDir?.path ?? ""));
  }, [rootDir?.path]);

  const draftTrimmed = draftRoot.trim();
  // 输入的是前置目录，按目录规则解析后的 .minecraft 根即最终安装位置
  const previewRoot = draftTrimmed ? iGM_Launcher_McRootOfParent(draftTrimmed) : "";
  const changed = previewRoot.length > 0 && previewRoot !== (rootDir?.path ?? "");
  const finalRoot = previewRoot || (rootDir?.path ?? "");
  const layoutLines = useMemo(
    () => iGM_Launcher_BuildLayoutLines(versionDirName || "<version>"),
    [versionDirName],
  );

  /* ---------- 真实下载 ---------- */

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  /**
   * 开始下载：先落定下载目录，再交由主进程下载引擎执行，
   * 任务编号拿到后立刻跳转独立下载进度页（进度与取消均在该页完成）。
   */
  const handleStart = async () => {
    setStartError("");
    if (!version) {
      setStartError(t("versionRequired"));
      return;
    }
    if (!IGM_LAUNCHER_DOWNLOAD_SUPPORTED_LOADERS.has(loader)) {
      setStartError(t("loaderUnsupportedError"));
      return;
    }
    const dir = finalRoot;
    if (!dir) {
      setStartError(t("rootDirRequired"));
      return;
    }
    setStarting(true);
    try {
      // 目录变更时先应用，保证下载位置与界面展示完全一致
      if (changed) await applyRootDir(draftTrimmed || undefined);
      const response = await iGM_Launcher_BridgeCall("minecraft:download-start", {
        version,
        loader,
        loaderVersion: loader === "fabric" ? loaderVersion : undefined,
        rootDir: dir,
      });
      if (!response.success || !response.data) {
        setStartError(response.message || t("startFailed"));
        return;
      }
      const progress = response.data.progress;
      navigate("downloadProgress", { taskId: progress.taskId, version, engine: "sdk" });
      /*
       * 游戏本体下载与模组下载一致，额外弹出独立进度窗口：
       * 宿主据此创建窄窗，并把清单驱动的 SDK 下载进度实时推送过去。
       */
      iGM_Launcher_SendHostMessage({
        type: "window:open-download-progress",
        taskId: progress.taskId,
        resourceName: progress.versionId || version,
        version: progress.versionId,
        targetDir: progress.rootDir,
        engine: "sdk",
        engineError: "",
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <IGM_Launcher_Button variant="ghost" onClick={() => navigate("versions")}>
            <ArrowLeft size={15} strokeWidth={1.8} />
            {t("back")}
          </IGM_Launcher_Button>
        }
      />

      {/* 版本选择 */}
      <IGM_Launcher_Card className={styles.card}>
        <h2 className={styles.cardTitle}>
          <HardDrive size={15} strokeWidth={1.8} />
          {t("versionTitle")}
        </h2>

        <IGM_Launcher_Field label={t("versionSelectLabel")} htmlFor="iGM_Launcher_Version">
          <IGM_Launcher_Select
            id="iGM_Launcher_Version"
            value={version}
            disabled={starting || versionOptions.length === 0}
            onChange={(event) => setVersion(event.target.value)}
          >
            <option value="">{t("versionSelectPlaceholder")}</option>
            {versionOptions.map((item) => (
              <option key={item.id} value={item.version}>
                {item.version} · {typeLabel(item.type)}
              </option>
            ))}
          </IGM_Launcher_Select>
        </IGM_Launcher_Field>

        {versionOptions.length === 0 ? (
          <div className={styles.actions}>
            <span className={styles.metaText}>{t("versionLibraryEmpty")}</span>
            <IGM_Launcher_Button
              variant="secondary"
              disabled={syncingLibrary}
              onClick={() => void syncVersionLibrary()}
            >
              <RefreshCw size={15} strokeWidth={1.8} />
              {tVersions("syncNow")}
            </IGM_Launcher_Button>
          </div>
        ) : null}

        <div className={styles.metaRow}>
          <IGM_Launcher_Badge tone="accent">{version || t("versionUnknown")}</IGM_Launcher_Badge>
          <IGM_Launcher_Badge tone="neutral">{typeLabel(entry?.type)}</IGM_Launcher_Badge>
          {alreadyInstalled ? (
            <IGM_Launcher_Badge tone="success">{tVersions("installed")}</IGM_Launcher_Badge>
          ) : null}
          {entry?.releaseTime ? (
            <span className={styles.metaText}>{entry.releaseTime.slice(0, 10)}</span>
          ) : null}
          <span className={styles.metaText}>
            {tVersions("totalSize")}：
            {iGM_Launcher_FormatSize(entry?.totalSize ?? null) || tVersions("sizePending")}
          </span>
        </div>
        {alreadyInstalled ? <p className={styles.note}>{t("installedNote")}</p> : null}
      </IGM_Launcher_Card>

      {/* 加载器选择 */}
      <IGM_Launcher_Card className={styles.card}>
        <h2 className={styles.cardTitle}>
          <Layers size={15} strokeWidth={1.8} />
          {t("loaderTitle")}
        </h2>

        <div className={styles.grid}>
          <IGM_Launcher_Field
            label={t("loaderLabel")}
            hint={t("loaderHint")}
            htmlFor="iGM_Launcher_Loader"
          >
            <IGM_Launcher_Select
              id="iGM_Launcher_Loader"
              value={loader}
              disabled={starting}
              onChange={(event) => setLoader(event.target.value as iGM_Launcher_LoaderType)}
            >
              {IGM_LAUNCHER_LOADER_OPTIONS.map((option) => {
                const supported = IGM_LAUNCHER_DOWNLOAD_SUPPORTED_LOADERS.has(option.value);
                return (
                  <option key={option.value} value={option.value} disabled={!supported}>
                    {supported ? option.label : `${option.label} · ${t("loaderUnsupported")}`}
                  </option>
                );
              })}
            </IGM_Launcher_Select>
          </IGM_Launcher_Field>

          {/* Fabric 加载器版本：由 Fabric 官方元数据提供，缺省取最新稳定版 */}
          {loader === "fabric" ? (
            <IGM_Launcher_Field
              label={t("loaderVersionLabel")}
              hint={loaderError || t("loaderVersionHint")}
              htmlFor="iGM_Launcher_LoaderVersion"
            >
              <IGM_Launcher_Select
                id="iGM_Launcher_LoaderVersion"
                value={loaderVersion}
                disabled={starting || loadingLoaderVersions || loaderVersions.length === 0}
                onChange={(event) => setLoaderVersion(event.target.value)}
              >
                {loaderVersions.length === 0 ? (
                  <option value="">
                    {loadingLoaderVersions ? t("loaderVersionLoading") : t("loaderVersionEmpty")}
                  </option>
                ) : (
                  loaderVersions.map((item, index) => (
                    <option key={item} value={item}>
                      {index === 0 ? `${item} · ${t("loaderVersionLatest")}` : item}
                    </option>
                  ))
                )}
              </IGM_Launcher_Select>
            </IGM_Launcher_Field>
          ) : null}
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>{t("versionDirLabel")}</span>
          <span className={styles.pathText}>{versionDirName || t("versionUnknown")}</span>
        </div>
      </IGM_Launcher_Card>

      {/* 自定义下载目录 */}
      <IGM_Launcher_Card className={styles.card}>
        <h2 className={styles.cardTitle}>
          <FolderOpen size={15} strokeWidth={1.8} />
          {t("targetTitle")}
        </h2>

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>{t("currentRoot")}</span>
          <span className={styles.pathText} title={rootDir?.path ?? ""}>
            {rootDir?.path || t("rootDirUnknown")}
          </span>
          {rootDir ? (
            <>
              <IGM_Launcher_Badge tone={rootDir.exists ? "success" : "muted"}>
                {rootDir.exists ? t("existsBadge") : t("missingBadge")}
              </IGM_Launcher_Badge>
              <IGM_Launcher_Badge tone="neutral">{t(`source_${rootDir.source}`)}</IGM_Launcher_Badge>
              {rootDir.isDefault ? (
                <IGM_Launcher_Badge tone="accent">{t("defaultBadge")}</IGM_Launcher_Badge>
              ) : null}
            </>
          ) : null}
        </div>

        <IGM_Launcher_Field
          label={t("rootDirLabel")}
          hint={t("changeHint")}
          htmlFor="iGM_Launcher_RootDir"
        >
          <div className={styles.dirRow}>
            <IGM_Launcher_Input
              id="iGM_Launcher_RootDir"
              value={draftRoot}
              placeholder={t("rootDirPlaceholder")}
              disabled={starting}
              onChange={(event) => setDraftRoot(event.target.value)}
            />
            <IGM_Launcher_Button
              variant="secondary"
              disabled={starting}
              onClick={() => {
                void pickDir(draftRoot.trim() || undefined).then((path) => {
                  if (path) setDraftRoot(path);
                });
              }}
            >
              <FolderOpen size={15} strokeWidth={1.8} />
              {tCommon("browse")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_Field>

        {/* 解析后的最终安装位置：始终展示，明确「前置目录 / .minecraft」的目录规则 */}
        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>{t("finalRoot")}</span>
          <span className={styles.pathText} title={finalRoot}>
            {finalRoot || t("rootDirUnknown")}
          </span>
        </div>

        <div className={styles.actions}>
          <IGM_Launcher_Button
            variant="secondary"
            disabled={starting || scanningInstalled}
            onClick={() => void applyRootDir(draftTrimmed || undefined)}
          >
            <Check size={15} strokeWidth={1.8} />
            {t("apply")}
          </IGM_Launcher_Button>
          <IGM_Launcher_Button
            variant="ghost"
            disabled={starting || scanningInstalled}
            onClick={() => void applyRootDir()}
          >
            <RefreshCw size={15} strokeWidth={1.8} />
            {t("useDefault")}
          </IGM_Launcher_Button>
          {changed ? <span className={styles.metaText}>{t("changedHint")}</span> : null}
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>{t("layoutTitle")}</span>
        </div>
        <pre className={styles.tree}>
          {layoutLines.map((line, index) => (
            <span
              key={`${index}-${line.text}`}
              className={line.shared ? styles.treeShared : styles.treeLine}
            >
              {line.text}
              {"\n"}
            </span>
          ))}
        </pre>
        <p className={styles.note}>{t("sharedNote")}</p>
        <p className={styles.note}>{t("instanceNote")}</p>
      </IGM_Launcher_Card>

      {startError ? (
        <p className={styles.errorText}>
          <AlertCircle size={13} strokeWidth={1.8} />
          {startError}
        </p>
      ) : null}

      <div className={styles.footer}>
        <IGM_Launcher_Button variant="secondary" onClick={() => navigate("versions")}>
          {tCommon("back")}
        </IGM_Launcher_Button>
        <IGM_Launcher_Button
          variant="primary"
          disabled={starting || !version}
          onClick={() => void handleStart()}
        >
          <Download size={15} strokeWidth={2} />
          {starting ? t("starting") : t("startDownload")}
        </IGM_Launcher_Button>
      </div>

      <p className={styles.note}>{t("sourceNote")}</p>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_GameInstallPage;