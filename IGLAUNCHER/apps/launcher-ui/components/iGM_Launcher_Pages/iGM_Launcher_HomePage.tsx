/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_HomePage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Home（SPA 页 id：home）
 * 模块：iGM_Launcher_HomePage
 * 作用：首页，展示欢迎 Hero、最近实例、最近更新、版本库同步状态
 * 内容：最近实例取自状态中心的真实本地数据；版本库同步状态卡支持手动触发同步；
 *       模块七移除直接启动按钮与离线启动面板，启动入口统一收敛到实例管理页，
 *       避免用户不清楚启动的是哪个版本
 */

// 导入依赖 //
"use client";

import { useMemo } from "react";
import { Boxes, Clock, CloudDownload, History, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_InstanceIcon } from "@/components/iGM_Launcher_Instance/iGM_Launcher_InstanceIcons";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import styles from "./iGM_Launcher_HomePage.module.css";

// 类型定义 //
/** 首页最多展示的最近实例数量 */
const IGM_HOME_RECENT_LIMIT = 3;

// 核心逻辑 //
export function iGM_Launcher_HomePage() {
  const t = useTranslations("home");
  const tInstances = useTranslations("instances");
  const tVersions = useTranslations("versions");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const { instances, versionLibrary, syncingLibrary, syncVersionLibrary } =
    iGM_Launcher_UseStore();

  // 最近实例：优先按上次游玩时间倒序，未游玩的按创建时间倒序补足
  const recentInstances = useMemo(() => {
    const sorted = [...instances].sort((a, b) => {
      if (!a.lastPlayedAt && !b.lastPlayedAt) return b.createdAt.localeCompare(a.createdAt);
      if (!a.lastPlayedAt) return 1;
      if (!b.lastPlayedAt) return -1;
      return b.lastPlayedAt.localeCompare(a.lastPlayedAt);
    });
    return sorted.slice(0, IGM_HOME_RECENT_LIMIT);
  }, [instances]);

  return (
    <div className={styles.page}>
      {/* Hero 区 */}
      <IGM_Launcher_Card className={styles.hero}>
        <h2 className={styles.heroTitle}>{t("welcome")}</h2>
        <p className={styles.heroDesc}>{t("welcomeDesc")}</p>
        <div className={styles.heroActions}>
          {/* SPA 切页：与侧边栏共用 AppShell 的页面状态，不产生导航请求 */}
          <IGM_Launcher_Button
            variant="primary"
            className={styles.heroSecondaryLink}
            onClick={() => navigate("instances")}
          >
            <Boxes size={15} strokeWidth={1.8} />
            {t("viewInstances")}
          </IGM_Launcher_Button>
        </div>
      </IGM_Launcher_Card>

      {/* 下方三栏 */}
      <div className={styles.grid}>
        <IGM_Launcher_Card>
          <div className={styles.cardTitle}>
            <Clock size={15} strokeWidth={1.8} />
            <h3>{t("recentInstances")}</h3>
          </div>
          {recentInstances.length === 0 ? (
            <p className={styles.emptyLine}>{t("recentInstancesEmpty")}</p>
          ) : (
            <ul className={styles.instanceList}>
              {recentInstances.map((instance) => {
                const Icon = iGM_Launcher_InstanceIcon(instance.icon);
                return (
                  <li key={instance.id}>
                    <button
                      type="button"
                      className={styles.instanceRow}
                      title={instance.name}
                      onClick={() => navigate("instancesEdit", { instanceId: instance.id })}
                    >
                      <span className={styles.instanceRowIcon}>
                        <Icon size={14} strokeWidth={1.8} />
                      </span>
                      <span className={styles.instanceRowName}>{instance.name}</span>
                      <IGM_Launcher_Badge tone="accent">
                        {instance.minecraftVersion}
                      </IGM_Launcher_Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {recentInstances.length > 0 ? (
            <IGM_Launcher_Button
              variant="ghost"
              className={styles.cardLink}
              onClick={() => navigate("instances")}
            >
              {tInstances("title")}
            </IGM_Launcher_Button>
          ) : null}
        </IGM_Launcher_Card>

        <IGM_Launcher_Card>
          <div className={styles.cardTitle}>
            <History size={15} strokeWidth={1.8} />
            <h3>{t("recentUpdates")}</h3>
          </div>
          <ul className={styles.lineList}>
            <li>{t("updatesLine1")}</li>
            <li>{t("updatesLine2")}</li>
            <li>{t("updatesLine3")}</li>
          </ul>
        </IGM_Launcher_Card>

        {/* 模块五：版本库同步状态 */}
        <IGM_Launcher_Card>
          <div className={styles.cardTitle}>
            <CloudDownload size={15} strokeWidth={1.8} />
            <h3>{t("libraryStatus")}</h3>
          </div>
          <div className={styles.libraryStatus}>
            <IGM_Launcher_Badge tone={versionLibrary.source === "empty" ? "muted" : "success"}>
              {tVersions(`source_${versionLibrary.source}`)}
            </IGM_Launcher_Badge>
            <span className={styles.libraryMeta}>
              {tVersions("counts", {
                total: versionLibrary.total || versionLibrary.entries.length,
                installed: versionLibrary.entries.filter((item) => item.installed).length,
              })}
            </span>
          </div>
          <ul className={styles.lineList}>
            <li>{t("libraryLine1")}</li>
            <li>{t("libraryLine2")}</li>
          </ul>
          <div className={styles.libraryActions}>
            <IGM_Launcher_Button
              variant="ghost"
              className={styles.cardLink}
              disabled={syncingLibrary}
              onClick={() => void syncVersionLibrary()}
            >
              <RefreshCw size={13} strokeWidth={1.8} />
              {syncingLibrary ? tVersions("syncing") : tVersions("syncNow")}
            </IGM_Launcher_Button>
            <IGM_Launcher_Button
              variant="ghost"
              className={styles.cardLink}
              onClick={() => navigate("versions")}
            >
              {t("viewLibrary")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_Card>
      </div>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_HomePage;