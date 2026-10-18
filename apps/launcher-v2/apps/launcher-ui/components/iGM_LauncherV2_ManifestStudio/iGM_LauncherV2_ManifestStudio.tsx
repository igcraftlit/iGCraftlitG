/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_ManifestStudio/iGM_LauncherV2_ManifestStudio.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main·方块广场·客户端同步大厅
 * 模块：iGM_LauncherV2_ManifestStudio
 * 作用：客户端清单工作室：选择本地服务器，扫描 mods / config 目录并勾选要同步给玩家的文件
 * 内容：顶部为目标服务器下拉框与横向信息栏（服务器名称 + 目录绝对路径）；
 *       左侧为操作栏（重新扫描目录大按钮、上次扫描时间、生成清单、全选 / 全不选）；
 *       右侧为按目录分组的文件列表（定制复选框 + 相对路径 + 文件大小，默认全部勾选）；
 *       生成成功后展示产物卡片（manifest.json 与客户端 ZIP 包的绝对路径与复制按钮）并给出后续引导；
 *       扫描失败与生成失败均以回推的 messageKey 解析出可读原因后内联展示；
 *       界面文案全部走多语言（next-intl，键为 server.studio 与 common）
 * 说明：组件为纯展示层，目录扫描与清单打包均由外壳执行；
 *       界面只通过 iGM_LauncherV2_UseServerCenter 投递指令并展示回推结果
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  CheckSquare,
  Copy,
  FileArchive,
  FolderSearch,
  Square,
} from "lucide-react";
import {
  iGM_LauncherV2_UseLocalServers as IGM_LauncherV2_UseLocalServers,
  iGM_LauncherV2_UseServerCenter as IGM_LauncherV2_UseServerCenter,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import type { iGM_LauncherV2_ServerFileNode } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_ManifestStudio.module.css";

// 类型定义 //

/** 文件分组：按父目录（相对服务器目录）聚合的可勾选文件集合 */
interface iGM_LauncherV2_FileGroup {
  /** 父目录相对路径（如 mods / config / config/sub） */
  dir: string;
  /** 分组缩进层级：0 为 mods 或 config，1 为 config 下的子目录 */
  depth: number;
  /** 该目录下的文件 */
  files: iGM_LauncherV2_ServerFileNode[];
}

// 核心逻辑 //

/** 字节数格式化：按 B / KB / MB 输出，附一位小数，供文件大小与摘要展示 */
function iGM_LauncherV2_FormatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 时间格式化：年-月-日 时:分，用于上次扫描时间与创建时间展示 */
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
 * 客户端清单工作室。
 * 选中本地服务器后扫描 mods / config 目录，按需剔除文件并生成 manifest.json 与客户端 ZIP 包。
 */
export function iGM_LauncherV2_ManifestStudio({ className = "" }: { className?: string }) {
  const t = useTranslations();
  const center = IGM_LauncherV2_UseServerCenter();
  const local = IGM_LauncherV2_UseLocalServers();

  const [serverId, setServerId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState("");
  const copyTimer = useRef<number | null>(null);

  // 默认选中：用户选择，其次本地服务器列表首项
  const effectiveId = serverId || local.items[0]?.id || "";
  // 扫描结果仅在属于当前所选服务器时展示，避免切换服务器后出现旧服务器的文件
  const tree = center.tree && center.tree.serverId === effectiveId ? center.tree : null;
  const files = tree?.files ?? [];

  const activeServer = local.items.find((item) => item.id === effectiveId) ?? null;
  const serverName = tree?.serverName || activeServer?.name || "";
  const rootPath = tree?.root || activeServer?.dir || "";

  // 扫描结果更新后默认全部勾选，用户再按需剔除
  useEffect(() => {
    if (tree && tree.ok) setSelected(new Set(tree.files.map((file) => file.path)));
  }, [tree]);

  // 卸载时清理复制反馈定时器，避免在已卸载组件上触发 setState
  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  // 按父目录聚合文件：mods 与 config 各成一组，config 下的子目录自然形成更深的分组
  const groups = useMemo<iGM_LauncherV2_FileGroup[]>(() => {
    const map = new Map<string, iGM_LauncherV2_ServerFileNode[]>();
    for (const file of files) {
      const index = file.path.lastIndexOf("/");
      const dir = index >= 0 ? file.path.slice(0, index) : "";
      const list = map.get(dir);
      if (list) list.push(file);
      else map.set(dir, [file]);
    }
    return Array.from(map, ([dir, list]) => ({
      dir: dir || "/",
      depth: dir ? dir.split("/").length - 1 : 0,
      files: list,
    })).sort((left, right) => left.dir.localeCompare(right.dir));
  }, [files]);

  const selectedFiles = files.filter((file) => selected.has(file.path));
  const selectedSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(files.map((file) => file.path)));
  const clearAll = () => setSelected(new Set());

  /** 重新扫描：投递扫描指令，由外壳回推文件树 */
  const rescan = () => {
    if (effectiveId) center.scanTree(effectiveId);
  };

  /** 生成清单：按勾选文件生成 manifest.json 与客户端 ZIP 包 */
  const generate = () => {
    if (!effectiveId || selectedFiles.length === 0) return;
    center.generateManifest(
      effectiveId,
      serverName,
      selectedFiles.map((file) => file.path),
    );
  };

  /** 复制产物路径：剪贴板不可用时不阻断交互，仅给出本地反馈 */
  const copyPath = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 剪贴板不可用时不阻断交互
    }
    setCopiedKey(key);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedKey(""), 1600);
  };

  const result = center.manifest;

  return (
    <section className={styles.studio + (className ? ` ${className}` : "")}>
      <header className={styles.studioHead}>
        <h2 className={styles.studioTitle}>{t("server.studio.title")}</h2>
        <p className={styles.studioDesc}>{t("server.studio.desc")}</p>
      </header>

      {/* 无视界 / 无本地服务器时给出引导，不展示下拉与分栏面板 */}
      {local.items.length === 0 ? (
        <p className={styles.studioHint}>{t("server.studio.noServer")}</p>
      ) : (
        <>
          {/* 服务器下拉选择：切换目标服务器 */}
          <label className={styles.serverRow}>
            <span className={styles.fieldLabel}>{t("server.studio.serverLabel")}</span>
            <select
              className={styles.select}
              value={effectiveId}
              aria-label={t("server.studio.serverLabel")}
              disabled={center.treeBusy}
              onChange={(event) => setServerId(event.target.value)}
            >
              {local.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          {/* 顶部信息栏：左侧服务器名称，右侧目录绝对路径 */}
          <div className={styles.topBar}>
            <span className={styles.topName}>{serverName || t("common.none")}</span>
            <code className={styles.topPath}>{rootPath || t("common.none")}</code>
          </div>

          <div className={styles.columns}>
            {/* 左侧操作区 */}
            <div className={styles.ops}>
              <button
                type="button"
                className={`${styles.rescanButton} ${
                  center.treeBusy ? styles.rescanButtonBusy : ""
                }`}
                disabled={center.treeBusy || !effectiveId}
                onClick={rescan}
              >
                <FolderSearch
                  size={22}
                  strokeWidth={2}
                  className={center.treeBusy ? styles.spin : ""}
                />
                <span>
                  {center.treeBusy ? t("server.studio.rescanning") : t("server.studio.rescan")}
                </span>
              </button>
              <span className={styles.lastScan}>
                {tree && tree.ok && tree.scannedAt > 0
                  ? t("server.studio.lastScan", {
                      time: iGM_LauncherV2_FormatTime(tree.scannedAt),
                    })
                  : t("server.studio.neverScanned")}
              </span>

              <button
                type="button"
                className={styles.generateButton}
                disabled={center.manifestBusy || center.treeBusy || selectedFiles.length === 0}
                onClick={generate}
              >
                <FileArchive size={14} strokeWidth={2.2} />
                <span>
                  {center.manifestBusy
                    ? t("server.studio.generating")
                    : t("server.studio.generate")}
                </span>
              </button>

              <div className={styles.selectActions}>
                <button type="button" className={styles.actionButton} onClick={selectAll}>
                  <CheckSquare size={14} strokeWidth={2.2} />
                  <span>{t("server.studio.selectAll")}</span>
                </button>
                <button type="button" className={styles.actionButton} onClick={clearAll}>
                  <Square size={14} strokeWidth={2.2} />
                  <span>{t("server.studio.clearAll")}</span>
                </button>
              </div>
            </div>

            {/* 右侧文件列表区 */}
            <div className={styles.filePanel}>
              <div className={styles.summary}>
                {t("server.studio.summary", {
                  count: files.length,
                  selected: selectedFiles.length,
                  size: iGM_LauncherV2_FormatSize(selectedSize),
                })}
              </div>

              {tree && tree.ok === false ? (
                <p className={styles.fileNotice}>
                  {t("server.studio.scanFailed", {
                    reason: t(tree.messageKey, tree.messageParams),
                  })}
                </p>
              ) : null}

              <div className={styles.fileList}>
                {!tree ? (
                  <p className={styles.fileEmpty}>{t("server.studio.scanHint")}</p>
                ) : files.length === 0 ? (
                  <p className={styles.fileEmpty}>{t("server.studio.emptyFiles")}</p>
                ) : (
                  groups.map((group) => (
                    <div key={group.dir} className={styles.fileGroup}>
                      <div
                        className={styles.fileGroupHead}
                        style={{ paddingLeft: `${group.depth * 16}px` }}
                      >
                        {group.dir}
                      </div>
                      <ul className={styles.fileRows}>
                        {group.files.map((file) => (
                          <li key={file.path} className={styles.fileRow}>
                            <label className={styles.fileLabel}>
                              <input
                                type="checkbox"
                                className={styles.fileCheck}
                                checked={selected.has(file.path)}
                                onChange={() => toggle(file.path)}
                              />
                              <code className={styles.filePath}>{file.path}</code>
                            </label>
                            <span className={styles.fileSize}>
                              {iGM_LauncherV2_FormatSize(file.size)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 生成结果卡片：成功展示产物路径与引导，失败展示外壳回推的错误文案 */}
          {result ? (
            <div className={styles.resultCard}>
              {result.ok ? (
                <>
                  <div className={styles.resultHead}>
                    <h3 className={styles.resultTitle}>{t("server.studio.resultTitle")}</h3>
                    <p className={styles.resultDesc}>
                      {t("server.studio.resultDesc", {
                        count: result.count,
                        size: iGM_LauncherV2_FormatSize(result.totalSize),
                      })}
                    </p>
                  </div>
                  <div className={styles.resultRow}>
                    <span className={styles.resultLabel}>
                      {t("server.studio.resultManifest")}
                    </span>
                    <code className={styles.resultPath}>{result.path}</code>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => void copyPath("manifest", result.path)}
                    >
                      {copiedKey === "manifest" ? (
                        <Check size={14} strokeWidth={2.2} />
                      ) : (
                        <Copy size={14} strokeWidth={2.2} />
                      )}
                      <span>{t("server.studio.copyPath")}</span>
                    </button>
                  </div>
                  <div className={styles.resultRow}>
                    <span className={styles.resultLabel}>{t("server.studio.resultZip")}</span>
                    <code className={styles.resultPath}>{result.zipPath}</code>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => void copyPath("zip", result.zipPath)}
                    >
                      {copiedKey === "zip" ? (
                        <Check size={14} strokeWidth={2.2} />
                      ) : (
                        <Copy size={14} strokeWidth={2.2} />
                      )}
                      <span>{t("server.studio.copyPath")}</span>
                    </button>
                  </div>
                  <div className={styles.guideBox}>
                    <span className={styles.guideTitle}>{t("server.studio.guideTitle")}</span>
                    <p className={styles.guideText}>{t("server.studio.guideText")}</p>
                  </div>
                </>
              ) : (
                <p className={styles.fileNotice}>
                  {t("server.studio.manifestFailed", {
                    reason: t(result.messageKey, result.messageParams),
                  })}
                </p>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

// 导出 //
export default iGM_LauncherV2_ManifestStudio;
