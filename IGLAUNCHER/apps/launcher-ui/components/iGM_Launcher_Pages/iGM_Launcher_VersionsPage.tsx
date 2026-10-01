/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_VersionsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Versions（SPA 页 id：versions）
 * 模块：iGM_Launcher_VersionsPage
 * 作用：版本库页面，展示与网站版本资料库同步的 Minecraft 版本列表
 * 内容：版本类型筛选（全部 / 正式版 / 快照版 / 远古 Beta / 远古 Alpha，与网站一致），
 *       筛选后按年份分组（年份倒序、组内版本号倒序，与网站排版一致）；
 *       已安装版本标记「已安装」，未安装版本提供「下载」入口；
 *       顶部展示同步状态与最近同步时间，支持手动触发同步
 *
 * 说明：本页只展示版本元数据与安装状态，不下载任何文件；
 *       同步失败时保留本地缓存，界面继续展示缓存内容并提示失败原因。
 */

// 导入依赖 //
"use client";

import { useMemo, useState } from "react";
import { Boxes, CloudDownload, Download, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  iGM_Launcher_FormatSize,
  iGM_Launcher_GroupVersionsByYear,
  type iGM_Launcher_VersionType,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import styles from "./iGM_Launcher_VersionsPage.module.css";

// 类型定义 //
/** 版本类型筛选值：空串表示全部，其余与网站版本资料库的类型选项一致 */
type iGM_Launcher_TypeFilter = iGM_Launcher_VersionType | "";

/** 版本类型筛选选项（与网站 G_MinecraftVersions 的筛选项保持一致） */
const IGM_VERSION_TYPE_FILTERS: iGM_Launcher_VersionType[] = [
  "release",
  "snapshot",
  "old_beta",
  "old_alpha",
];

/** 版本类型到徽章色调 */
const IGM_VERSION_TYPE_TONE: Record<
  iGM_Launcher_VersionType,
  "neutral" | "accent" | "success" | "muted"
> = {
  release: "accent",
  snapshot: "neutral",
  old_beta: "muted",
  old_alpha: "muted",
  unknown: "muted",
};

// 核心逻辑 //

/** ISO 时间格式化为 YYYY-MM-DD HH:mm，空值回退占位符 */
function iGM_Launcher_FormatSyncedAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function iGM_Launcher_VersionsPage() {
  const t = useTranslations("versions");
  const tCommon = useTranslations("common");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const { versionLibrary, syncingLibrary, syncVersionLibrary } = iGM_Launcher_UseStore();

  // 当前选中的版本类型筛选（空串为全部），默认展示全部类型
  const [typeFilter, setTypeFilter] = useState<iGM_Launcher_TypeFilter>("");

  // 先按版本类型筛选，再按年份分组：与网站「类型筛选 + 年份分组」的浏览方式一致
  const filteredEntries = useMemo(
    () =>
      typeFilter
        ? versionLibrary.entries.filter((item) => item.type === typeFilter)
        : versionLibrary.entries,
    [versionLibrary.entries, typeFilter],
  );

  const groups = useMemo(
    () => iGM_Launcher_GroupVersionsByYear(filteredEntries),
    [filteredEntries],
  );

  const installedCount = useMemo(
    () => versionLibrary.entries.filter((item) => item.installed).length,
    [versionLibrary.entries],
  );

  /** 各版本类型的版本数量，筛选胶囊上直接展示，便于区分正式版 / 快照版 / 远古版 */
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of versionLibrary.entries) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    }
    return counts;
  }, [versionLibrary.entries]);

  const typeLabel = (type: iGM_Launcher_VersionType): string => t(`type_${type}`);

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <IGM_Launcher_Button
            variant="secondary"
            disabled={syncingLibrary}
            onClick={() => void syncVersionLibrary()}
          >
            <RefreshCw size={15} strokeWidth={1.8} />
            {syncingLibrary ? t("syncing") : t("syncNow")}
          </IGM_Launcher_Button>
        }
      />

      {/* 同步状态 */}
      <IGM_Launcher_Card className={styles.statusCard}>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>
            <CloudDownload size={15} strokeWidth={1.8} />
            {t("syncStatus")}
          </span>
          <IGM_Launcher_Badge tone={versionLibrary.source === "empty" ? "muted" : "success"}>
            {t(`source_${versionLibrary.source}`)}
          </IGM_Launcher_Badge>
          <span className={styles.statusMeta}>
            {t("lastSynced", { time: iGM_Launcher_FormatSyncedAt(versionLibrary.syncedAt) })}
          </span>
          <span className={styles.statusMeta}>
            {t("counts", {
              total: versionLibrary.total || versionLibrary.entries.length,
              installed: installedCount,
            })}
          </span>
        </div>
      </IGM_Launcher_Card>

      {/* 版本类型筛选：与网站版本资料库一致，先按类型区分再按年份分组 */}
      <IGM_Launcher_Card className={styles.filterCard}>
        <span className={styles.filterLabel}>{t("filterType")}</span>
        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chip} ${typeFilter === "" ? styles.chipActive : ""}`}
            onClick={() => setTypeFilter("")}
          >
            {t("typeAll")}
          </button>
          {IGM_VERSION_TYPE_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.chip} ${typeFilter === value ? styles.chipActive : ""}`}
              onClick={() => setTypeFilter(value)}
            >
              {typeLabel(value)}
              <span className={styles.chipCount}>{typeCounts[value] ?? 0}</span>
            </button>
          ))}
        </div>
      </IGM_Launcher_Card>

      {groups.length === 0 ? (
        versionLibrary.entries.length > 0 ? (
          /* 类型筛选后为空：与本库为空区分，可一键恢复全部 */
          <IGM_Launcher_Card className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>{t("filteredEmptyTitle")}</h2>
            <p className={styles.emptyDesc}>{t("filteredEmptyDesc")}</p>
            <IGM_Launcher_Button variant="secondary" onClick={() => setTypeFilter("")}>
              {t("showAll")}
            </IGM_Launcher_Button>
          </IGM_Launcher_Card>
        ) : (
          <IGM_Launcher_Card className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>{t("emptyTitle")}</h2>
            <p className={styles.emptyDesc}>{t("emptyDesc")}</p>
            <IGM_Launcher_Button
              variant="primary"
              disabled={syncingLibrary}
              onClick={() => void syncVersionLibrary()}
            >
              <RefreshCw size={15} strokeWidth={1.8} />
              {t("syncNow")}
            </IGM_Launcher_Button>
          </IGM_Launcher_Card>
        )
      ) : (
        groups.map((group) => (
          <section key={group.year} className={styles.yearGroup}>
            <h2 className={styles.yearTitle}>{group.year === "—" ? t("yearUnknown") : group.year}</h2>
            <div className={styles.grid}>
              {group.entries.map((entry) => (
                <IGM_Launcher_Card key={entry.id} className={styles.versionCard}>
                  <div className={styles.versionHead}>
                    <span className={styles.versionName}>{entry.version}</span>
                    <IGM_Launcher_Badge tone={IGM_VERSION_TYPE_TONE[entry.type]}>
                      {typeLabel(entry.type)}
                    </IGM_Launcher_Badge>
                  </div>
                  <dl className={styles.versionMeta}>
                    <div className={styles.metaItem}>
                      <dt>{t("releaseTime")}</dt>
                      <dd>{entry.releaseTime ? entry.releaseTime.slice(0, 10) : "—"}</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>{t("totalSize")}</dt>
                      <dd>{iGM_Launcher_FormatSize(entry.totalSize) || t("sizePending")}</dd>
                    </div>
                  </dl>
                  <div className={styles.versionActions}>
                    {entry.installed ? (
                      <IGM_Launcher_Badge tone="success">{t("installed")}</IGM_Launcher_Badge>
                    ) : (
                      <IGM_Launcher_Button
                        variant="secondary"
                        onClick={() => navigate("gameInstall", { version: entry.version })}
                      >
                        <Download size={14} strokeWidth={1.8} />
                        {tCommon("download")}
                      </IGM_Launcher_Button>
                    )}
                  </div>
                </IGM_Launcher_Card>
              ))}
            </div>
          </section>
        ))
      )}

      {installedCount > 0 ? (
        <IGM_Launcher_Button variant="ghost" onClick={() => navigate("instances")}>
          <Boxes size={15} strokeWidth={1.8} />
          {t("viewInstances")}
        </IGM_Launcher_Button>
      ) : null}

      <IGM_Launcher_PlaceholderNote>{t("hint")}</IGM_Launcher_PlaceholderNote>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_VersionsPage;
