/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_JavaPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Java（SPA 页 id：java）
 * 模块：iGM_Launcher_JavaPage
 * 作用：Java 运行时管理页：检测、添加、测试、移除、设为默认与下载占位
 * 内容：检测按共享层占位候选路径执行，下载为纯界面占位（不发起真实请求）；
 *       Java 记录落在 D:/IGLAUNCHER/data/java/java.json，实例可单独绑定运行时；
 *       模块二十六修正后本页既是独立页，也作为设置页「Java」子标签的内嵌内容，
 *       内嵌时（embedded=true）不渲染页头，由设置页统一提供标题与子标签
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useState } from "react";
import { Coffee, Download, FolderOpen, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_JAVA_MAJORS,
  IGM_LAUNCHER_JAVA_VENDORS,
  type iGM_Launcher_JavaVendor,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import {
  iGM_Launcher_Field as IGM_Launcher_Field,
  iGM_Launcher_Input as IGM_Launcher_Input,
  iGM_Launcher_Select as IGM_Launcher_Select,
} from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import { iGM_Launcher_ConfirmDialog as IGM_Launcher_ConfirmDialog } from "@/components/iGM_Launcher_Dialogs/iGM_Launcher_Dialogs";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import type { iGM_Launcher_PageProps } from "./iGM_Launcher_PageRegistry";
import styles from "./iGM_Launcher_JavaPage.module.css";

// 类型定义 //
/* （Java 记录结构由共享层 iGM_Launcher_JavaRuntime 提供） */

/** 页面入参：embedded 为真时作为设置页子标签内容渲染，不输出页头 */
type iGM_Launcher_JavaPageProps = iGM_Launcher_PageProps & { embedded?: boolean };

// 核心逻辑 //
export function iGM_Launcher_JavaPage({ embedded = false }: iGM_Launcher_JavaPageProps) {
  const t = useTranslations("java");
  const tCommon = useTranslations("common");
  const {
    javas,
    defaultJavaId,
    detectJava,
    addJava,
    removeJava,
    testJava,
    setDefaultJava,
  } = iGM_Launcher_UseStore();

  // 手动添加表单
  const [addName, setAddName] = useState("");
  const [addPath, setAddPath] = useState("");
  const [addVersion, setAddVersion] = useState("21");
  const [addVendor, setAddVendor] = useState<iGM_Launcher_JavaVendor>("adoptium");
  // 下载占位
  const [downloadMajor, setDownloadMajor] = useState(String(IGM_LAUNCHER_JAVA_MAJORS[2]));
  const [downloadVendor, setDownloadVendor] = useState<iGM_Launcher_JavaVendor>("adoptium");
  const [progress, setProgress] = useState<number | null>(null);
  // 移除确认
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const defaultRuntime = useMemo(
    () => javas.find((item) => item.id === defaultJavaId),
    [javas, defaultJavaId],
  );

  // 下载占位进度：仅演示进度条与状态文字，不发起任何真实请求
  useEffect(() => {
    if (progress === null) return;
    if (progress >= 100) return;
    const timer = window.setTimeout(() => setProgress((value) => (value ?? 0) + 5), 120);
    return () => window.clearTimeout(timer);
  }, [progress]);

  const handleAdd = async () => {
    if (!addName.trim() || !addPath.trim()) return;
    const ok = await addJava({
      name: addName.trim(),
      path: addPath.trim(),
      version: addVersion.trim() || undefined,
      vendor: addVendor,
    });
    if (ok) {
      setAddName("");
      setAddPath("");
    }
  };

  const pendingRemove = javas.find((item) => item.id === pendingRemoveId) ?? null;

  return (
    <div className={styles.page}>
      {embedded ? null : (
        <IGM_Launcher_PageHeader
          title={t("title")}
          description={t("subtitle")}
          actions={
            <IGM_Launcher_Button variant="primary" onClick={() => void detectJava()}>
              <RefreshCw size={15} strokeWidth={1.8} />
              {t("detect")}
            </IGM_Launcher_Button>
          }
        />
      )}
      {embedded ? (
        <IGM_Launcher_Button variant="primary" onClick={() => void detectJava()}>
          <RefreshCw size={15} strokeWidth={1.8} />
          {t("detect")}
        </IGM_Launcher_Button>
      ) : null}

      {/* 全局默认 Java */}
      <IGM_Launcher_Card className={styles.defaultCard}>
        <div className={styles.defaultText}>
          <span className={styles.defaultLabel}>
            <ShieldCheck size={14} strokeWidth={1.8} />
            {t("defaultGlobal")}
          </span>
          <span className={styles.defaultDesc}>{t("defaultGlobalDesc")}</span>
        </div>
        <IGM_Launcher_Badge tone={defaultRuntime ? "accent" : "muted"}>
          {defaultRuntime
            ? `${defaultRuntime.name} · Java ${defaultRuntime.version}`
            : t("defaultNone")}
        </IGM_Launcher_Badge>
      </IGM_Launcher_Card>

      {/* 已检测到的 Java */}
      <IGM_Launcher_Card className={styles.listCard}>
        <h2 className={styles.cardTitle}>{t("detectedTitle")}</h2>

        {javas.length === 0 ? (
          <div className={styles.emptyBlock}>
            <h3 className={styles.emptyTitle}>{t("emptyTitle")}</h3>
            <p className={styles.emptyDesc}>{t("emptyDesc")}</p>
          </div>
        ) : (
          <ul className={styles.runtimeList}>
            {javas.map((runtime) => {
              const isDefault = runtime.id === defaultJavaId;
              return (
                <li key={runtime.id} className={styles.runtimeItem}>
                  <span className={styles.runtimeIcon}>
                    <Coffee size={16} strokeWidth={1.6} />
                  </span>

                  <div className={styles.runtimeBody}>
                    <div className={styles.runtimeNameRow}>
                      <span className={styles.runtimeName}>{runtime.name}</span>
                      <IGM_Launcher_Badge tone="accent">Java {runtime.version}</IGM_Launcher_Badge>
                      <IGM_Launcher_Badge>{runtime.arch}</IGM_Launcher_Badge>
                      <IGM_Launcher_Badge tone="muted">
                        {runtime.source === "system" ? t("sourceSystem") : t("sourceManual")}
                      </IGM_Launcher_Badge>
                      <IGM_Launcher_Badge tone={runtime.available ? "success" : "muted"}>
                        {runtime.available ? t("available") : t("unavailable")}
                      </IGM_Launcher_Badge>
                      {isDefault ? (
                        <IGM_Launcher_Badge tone="success">{t("defaultBadge")}</IGM_Launcher_Badge>
                      ) : null}
                    </div>
                    <p className={styles.runtimePath} title={runtime.path}>
                      <FolderOpen size={12} strokeWidth={1.8} />
                      {runtime.path}
                    </p>
                  </div>

                  <div className={styles.runtimeActions}>
                    <IGM_Launcher_Button
                      variant="secondary"
                      disabled={isDefault}
                      onClick={() => void setDefaultJava(runtime.id)}
                    >
                      {t("setDefault")}
                    </IGM_Launcher_Button>
                    <IGM_Launcher_Button variant="secondary" onClick={() => void testJava(runtime.id)}>
                      {t("test")}
                    </IGM_Launcher_Button>
                    <IGM_Launcher_Button
                      variant="ghost"
                      className={styles.removeButton}
                      aria-label={t("remove")}
                      title={t("remove")}
                      onClick={() => setPendingRemoveId(runtime.id)}
                    >
                      <Trash2 size={15} strokeWidth={1.8} />
                    </IGM_Launcher_Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className={styles.listNote}>
          <IGM_Launcher_PlaceholderNote>{t("detectHint")}</IGM_Launcher_PlaceholderNote>
        </div>
      </IGM_Launcher_Card>

      <div className={styles.twoColumn}>
        {/* 手动添加 */}
        <IGM_Launcher_Card className={styles.panel}>
          <h2 className={styles.cardTitle}>{t("addTitle")}</h2>
          <p className={styles.panelDesc}>{t("addDesc")}</p>
          <div className={styles.panelBody}>
            <IGM_Launcher_Field label={t("addName")} htmlFor="iGM_Launcher_JavaName">
              <IGM_Launcher_Input
                id="iGM_Launcher_JavaName"
                value={addName}
                placeholder={t("addNamePlaceholder")}
                onChange={(event) => setAddName(event.target.value)}
              />
            </IGM_Launcher_Field>

            <IGM_Launcher_Field label={t("addPath")} htmlFor="iGM_Launcher_JavaPath">
              <IGM_Launcher_Input
                id="iGM_Launcher_JavaPath"
                value={addPath}
                placeholder={t("addPathPlaceholder")}
                onChange={(event) => setAddPath(event.target.value)}
              />
            </IGM_Launcher_Field>

            <div className={styles.panelRow}>
              <IGM_Launcher_Field label={t("addVersion")} htmlFor="iGM_Launcher_JavaVersion">
                <IGM_Launcher_Input
                  id="iGM_Launcher_JavaVersion"
                  value={addVersion}
                  onChange={(event) => setAddVersion(event.target.value)}
                />
              </IGM_Launcher_Field>

              <IGM_Launcher_Field label={t("downloadVendor")}>
                <IGM_Launcher_Select
                  value={addVendor}
                  onChange={(event) =>
                    setAddVendor(event.target.value as iGM_Launcher_JavaVendor)
                  }
                >
                  {IGM_LAUNCHER_JAVA_VENDORS.map((vendor) => (
                    <option key={vendor.value} value={vendor.value}>
                      {vendor.label}
                    </option>
                  ))}
                  <option value="unknown">{tCommon("unknown")}</option>
                </IGM_Launcher_Select>
              </IGM_Launcher_Field>
            </div>

            <IGM_Launcher_Button
              variant="primary"
              className={styles.panelAction}
              disabled={!addName.trim() || !addPath.trim()}
              onClick={() => void handleAdd()}
            >
              <Plus size={15} strokeWidth={1.8} />
              {t("addConfirm")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_Card>

        {/* 下载占位 */}
        <IGM_Launcher_Card className={styles.panel}>
          <h2 className={styles.cardTitle}>{t("downloadTitle")}</h2>
          <p className={styles.panelDesc}>{t("downloadDesc")}</p>
          <div className={styles.panelBody}>
            <div className={styles.panelRow}>
              <IGM_Launcher_Field label={t("downloadMajor")}>
                <IGM_Launcher_Select
                  value={downloadMajor}
                  onChange={(event) => setDownloadMajor(event.target.value)}
                >
                  {IGM_LAUNCHER_JAVA_MAJORS.map((major) => (
                    <option key={major} value={String(major)}>
                      Java {major}
                    </option>
                  ))}
                </IGM_Launcher_Select>
              </IGM_Launcher_Field>

              <IGM_Launcher_Field label={t("downloadVendor")}>
                <IGM_Launcher_Select
                  value={downloadVendor}
                  onChange={(event) =>
                    setDownloadVendor(event.target.value as iGM_Launcher_JavaVendor)
                  }
                >
                  {IGM_LAUNCHER_JAVA_VENDORS.map((vendor) => (
                    <option key={vendor.value} value={vendor.value}>
                      {vendor.label}
                    </option>
                  ))}
                </IGM_Launcher_Select>
              </IGM_Launcher_Field>
            </div>

            <div className={styles.progressBlock}>
              <div className={styles.progressHead}>
                <span>{t("downloadProgress")}</span>
                <span className={styles.progressValue}>
                  {progress === null ? t("downloadStatus") : `${progress}%`}
                </span>
              </div>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${progress ?? 0}%` }}
                  aria-hidden="true"
                />
              </div>
              <p className={styles.progressStatus}>
                {progress === null
                  ? t("downloadHint")
                  : progress >= 100
                    ? t("downloadHint")
                    : t("downloadRunning")}
              </p>
            </div>

            <IGM_Launcher_Button
              variant="secondary"
              className={styles.panelAction}
              onClick={() => setProgress(0)}
            >
              <Download size={15} strokeWidth={1.8} />
              {t("downloadButton")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_Card>
      </div>

      <IGM_Launcher_PlaceholderNote>
        {t("bindHint")}
        {" · "}
        {t("hint")}
      </IGM_Launcher_PlaceholderNote>

      <IGM_Launcher_ConfirmDialog
        open={pendingRemove !== null}
        danger
        title={t("removeConfirm")}
        description={t("removeConfirmDesc", { name: pendingRemove?.name ?? "" })}
        confirmLabel={tCommon("remove")}
        onCancel={() => setPendingRemoveId(null)}
        onConfirm={() => {
          const target = pendingRemoveId;
          setPendingRemoveId(null);
          if (target) void removeJava(target);
        }}
      />
    </div>
  );
}

// 导出 //
export default iGM_Launcher_JavaPage;