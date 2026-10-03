/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_HomePage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Home（SPA 页 id：home）
 * 模块：iGM_Launcher_HomePage
 * 作用：首页，展示欢迎 Hero、社区头像、实例选择、开始游戏主按钮、累计使用时长、最近实例、
 *       最近更新、版本库同步状态
 * 内容：Hero 中心上方提供「启动实例」下拉框，无需进入实例管理页即可切换当前启动实例；
 *       已登录社区账号时渲染主站真实头像（account.avatar，<img> 直出，不用图标或首字母代替）；
 *       「开始游戏」启动当前选中实例，未选中时禁用并给出引导；
 *       点击后弹登录方式选择（正版 / 离线），确认后跳独立启动进度页，与实例管理页一致；
 *       累计使用时长（小时）由桥接方法 usage:get 读取；
 *       布局改为左侧主内容 + 右侧账户面板（iGM_Launcher_AccountPanel），窄窗时账户面板下移；
 *       最近实例取自状态中心的真实本地数据；版本库同步状态卡支持手动触发同步
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Clock, Clock4, CloudDownload, History, Play, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_InstanceIcon } from "@/components/iGM_Launcher_Instance/iGM_Launcher_InstanceIcons";
import { iGM_Launcher_LaunchModeDialog as IGM_Launcher_LaunchModeDialog } from "@/components/iGM_Launcher_Dialogs/iGM_Launcher_Dialogs";
import { iGM_Launcher_AccountPanel as IGM_Launcher_AccountPanel } from "@/components/iGM_Launcher_Home/iGM_Launcher_AccountPanel";
import { iGM_Launcher_BridgeCall } from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import styles from "./iGM_Launcher_HomePage.module.css";

// 类型定义 //
/** 首页最多展示的最近实例数量 */
const IGM_HOME_RECENT_LIMIT = 3;

/** 毫秒转小时（保留一位小数） */
function iGM_Launcher_FormatHours(totalMs: number): string {
  return (totalMs / 3_600_000).toFixed(1);
}

// 核心逻辑 //
export function iGM_Launcher_HomePage() {
  const t = useTranslations("home");
  const tInstances = useTranslations("instances");
  const tVersions = useTranslations("versions");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const {
    instances,
    versionLibrary,
    syncingLibrary,
    syncVersionLibrary,
    selectedInstanceId,
    selectInstance,
    account,
    mcBindings,
  } = iGM_Launcher_UseStore();

  // 启动登录方式选择对话框
  const [launchOpen, setLaunchOpen] = useState(false);
  // 累计使用时长（毫秒），首帧为 null
  const [usageMs, setUsageMs] = useState<number | null>(null);
  // 社区头像加载失败时隐藏图片（不以图标或首字母代替）
  const [avatarFailed, setAvatarFailed] = useState(false);

  // 当前选中实例（未选中或已被删除时为空）
  const selectedInstance = useMemo(
    () => instances.find((item) => item.id === selectedInstanceId) ?? null,
    [instances, selectedInstanceId],
  );

  /** 默认选中的正版绑定：优先标记为默认的绑定，否则取第一条 */
  const defaultBindingId = useMemo(
    () => mcBindings.find((item) => item.isDefault)?.id ?? mcBindings[0]?.id ?? "",
    [mcBindings],
  );

  // 累计使用时长：主进程写入 usage.json，此处读取一次展示
  useEffect(() => {
    let cancelled = false;
    void iGM_Launcher_BridgeCall("usage:get").then((response) => {
      if (cancelled) return;
      if (response.success && response.data) setUsageMs(response.data.usage.totalMs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      <div className={styles.layout}>
        {/* 左侧主内容 */}
        <div className={styles.main}>
          {/* Hero 区：中心为开始游戏主按钮 */}
          <IGM_Launcher_Card className={styles.hero}>
            <div className={styles.heroBody}>
              <div className={styles.heroText}>
                <div className={styles.heroHeading}>
                  {/* 已登录社区账号：直出主站真实头像，加载失败时隐藏（不以图标或首字母代替） */}
                  {account.signedIn && account.avatar && !avatarFailed ? (
                    <img
                      className={styles.heroAvatar}
                      src={account.avatar}
                      alt={t("avatarAlt")}
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : null}
                  <h2 className={styles.heroTitle}>{t("welcome")}</h2>
                </div>
                <p className={styles.heroDesc}>{t("welcomeDesc")}</p>
                <div className={styles.heroActions}>
                  {/* SPA 切页：与侧边栏共用 AppShell 的页面状态，不产生导航请求 */}
                  <IGM_Launcher_Button
                    variant="secondary"
                    className={styles.heroSecondaryLink}
                    onClick={() => navigate("instances")}
                  >
                    <Boxes size={15} strokeWidth={1.8} />
                    {t("viewInstances")}
                  </IGM_Launcher_Button>
                  <span className={styles.usageMeta}>
                    <Clock4 size={13} strokeWidth={1.8} />
                    {t("usageHours", { hours: iGM_Launcher_FormatHours(usageMs ?? 0) })}
                  </span>
                </div>
              </div>

              <div className={styles.heroStart}>
                {/* 首页直接选择启动实例，无需进入实例管理页 */}
                <label className={styles.instancePick}>
                  <span className={styles.instancePickLabel}>{t("selectInstanceLabel")}</span>
                  <select
                    className={styles.instanceSelect}
                    value={selectedInstanceId ?? ""}
                    onChange={(event) => selectInstance(event.target.value || null)}
                  >
                    <option value="">{t("selectInstanceNone")}</option>
                    {instances.map((instance) => (
                      <option key={instance.id} value={instance.id}>
                        {instance.name} · {instance.minecraftVersion}
                      </option>
                    ))}
                  </select>
                </label>
                <IGM_Launcher_Button
                  variant="primary"
                  className={styles.startButton}
                  disabled={selectedInstance === null}
                  onClick={() => setLaunchOpen(true)}
                >
                  <Play size={20} strokeWidth={1.8} />
                  {t("startGame")}
                </IGM_Launcher_Button>
                {selectedInstance ? (
                  <p className={styles.startTarget}>{selectedInstance.name}</p>
                ) : (
                  <div className={styles.startHint}>
                    <p>{t("startNoInstance")}</p>
                    <IGM_Launcher_Button
                      variant="ghost"
                      className={styles.startHintLink}
                      onClick={() => navigate("instances")}
                    >
                      {t("goInstances")}
                    </IGM_Launcher_Button>
                  </div>
                )}
              </div>
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
                <IGM_Launcher_Badge
                  tone={versionLibrary.source === "empty" ? "muted" : "success"}
                >
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
                  onClick={() => navigate("resourceCenter")}
                >
                  {t("viewLibrary")}
                </IGM_Launcher_Button>
              </div>
            </IGM_Launcher_Card>
          </div>
        </div>

        {/* 右侧账户面板 */}
        <aside className={styles.side}>
          <IGM_Launcher_AccountPanel />
        </aside>
      </div>

      {/* 启动前必须由用户显式选择登录方式（正版 / 离线），不记忆上一次选择 */}
      <IGM_Launcher_LaunchModeDialog
        open={launchOpen && selectedInstance !== null}
        instanceName={selectedInstance?.name ?? ""}
        bindings={mcBindings}
        defaultBindingId={defaultBindingId}
        confirmLabel={tInstances("launch")}
        onCancel={() => setLaunchOpen(false)}
        onConfirm={(mode, bindingId) => {
          const target = selectedInstance;
          setLaunchOpen(false);
          if (target) navigate("launchProgress", { instanceId: target.id, mode, bindingId });
        }}
      />
    </div>
  );
}

// 导出 //
export default iGM_Launcher_HomePage;