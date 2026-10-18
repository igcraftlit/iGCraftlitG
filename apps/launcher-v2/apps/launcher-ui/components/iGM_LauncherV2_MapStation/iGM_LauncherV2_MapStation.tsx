/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_MapStation/iGM_LauncherV2_MapStation.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main（地图站页签）
 * 模块：iGM_LauncherV2_MapStation
 * 作用：地图站：输入种子并内嵌第三方种子地图（Chunkbase），全程不经过主站后端
 * 内容：顶部深色磨砂控制栏（种子输入框 / 游戏版本下拉 / 地图类型下拉 /
 *       「生成地图」主题色按钮 / 醒目的「在浏览器中打开」按钮 + 底部提示行）；
 *       主体为铺满整页剩余空间的 iframe 展示区，含初始占位 / 加载 / 结果三态；
 *       采用「超时未触发 load 即判定被 X-Frame-Options 拦截」策略：加载时启动
 *       IGM_LAUNCHERV2_MAP_LOAD_TIMEOUT 定时器，超时前收到 load 判定可用，
 *       否则在 iframe 之上叠加深色失败提示面板并提供浏览器打开入口；
 *       外部链接一律经 HostBridge 的 iGM_LauncherV2_OpenLink 交系统浏览器打开
 * 说明：地图数据完全直连第三方站点（iframe 的 src 直连），绝不经过
 *       api.igcraftlit.com；本组件为单页内的导航页签，非独立路由页面——
 *       启动器静态导出后仅加载单一入口，独立路由在打包架构下不可达
 */

// 导入依赖 //
"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Compass, ExternalLink, Map as MapIcon, MapPinned } from "lucide-react";
import {
  iGM_LauncherV2_OpenLink as iGM_LauncherV2_OpenLink,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  IGM_LAUNCHERV2_MAP_APP_PATHS,
  IGM_LAUNCHERV2_MAP_LOAD_TIMEOUT,
  IGM_LAUNCHERV2_MAP_SITE,
  IGM_LAUNCHERV2_MAP_TYPES,
  IGM_LAUNCHERV2_MAP_VERSIONS,
  type iGM_LauncherV2_MapType,
} from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_MapStation.module.css";

// 类型定义 //

/** 展示区三态：初始占位 / 加载中 / 已出结果（含被拦截时的失败面板） */
type iGM_LauncherV2_MapPhase = "empty" | "loading" | "result";

// 核心逻辑 //

/**
 * 拼接第三方种子地图地址：站点根 + 地图类型子应用路径 + 种子与平台散列参数。
 * 种子做 encodeURIComponent，避免特殊字符破坏地址结构。
 */
function iGM_LauncherV2_BuildMapUrl(
  seed: string,
  version: string,
  type: iGM_LauncherV2_MapType,
): string {
  const appPath = IGM_LAUNCHERV2_MAP_APP_PATHS[type];
  const platform = `java_${version}`;
  return `${IGM_LAUNCHERV2_MAP_SITE}${appPath}#seed=${encodeURIComponent(seed.trim())}&platform=${platform}`;
}

export function iGM_LauncherV2_MapStation() {
  /** 根命名空间翻译器：项目约定以完整点分键调用，常量内 label 已带 mapStation. 前缀 */
  const t = useTranslations();

  const [seed, setSeed] = useState("");
  const [version, setVersion] = useState(IGM_LAUNCHERV2_MAP_VERSIONS[0]);
  const [type, setType] = useState<iGM_LauncherV2_MapType>("biome");
  /** 当前展示阶段 */
  const [phase, setPhase] = useState<iGM_LauncherV2_MapPhase>("empty");
  /** 已提交给 iframe 的地址；为空表示尚未生成 */
  const [url, setUrl] = useState("");
  /** 是否已判定被 X-Frame-Options 拦截（显示失败提示面板） */
  const [blocked, setBlocked] = useState(false);
  /** 调用系统浏览器失败时的行内提示 */
  const [openFailed, setOpenFailed] = useState(false);
  /** 每次生成自增，用作 iframe key 以强制重载（同种子重复生成也会刷新） */
  const [attempt, setAttempt] = useState(0);
  /** 是否仍在等待 load：超时判定后置 false，避免迟到的 load 误清除失败提示 */
  const pendingRef = useRef(false);

  // 加载态计时：超时前未收到 load 即判定为被拦截，转结果态并弹出失败提示
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => {
      pendingRef.current = false;
      setBlocked(true);
      setPhase("result");
    }, IGM_LAUNCHERV2_MAP_LOAD_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [phase, attempt]);

  /** iframe 加载完成：仅在等待期内有效，收到即认为可用并隐藏失败提示 */
  const handleFrameLoad = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    setBlocked(false);
    setPhase("result");
  }, []);

  /** 提交生成：拼接地址并进入加载态，重新挂载 iframe */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!seed.trim()) return;
    setOpenFailed(false);
    setBlocked(false);
    setUrl(iGM_LauncherV2_BuildMapUrl(seed, version, type));
    pendingRef.current = true;
    setPhase("loading");
    setAttempt((value) => value + 1);
  };

  /** 交系统默认浏览器打开当前配置对应地址（同步调用，失败时行内提示） */
  const handleOpenExternal = () => {
    const target = iGM_LauncherV2_BuildMapUrl(seed, version, type);
    try {
      iGM_LauncherV2_OpenLink(target);
      setOpenFailed(false);
    } catch {
      setOpenFailed(true);
    }
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h2 className={styles.headTitle}>{t("mapStation.title")}</h2>
        <p className={styles.headDesc}>{t("mapStation.subtitle")}</p>
      </header>

      {/* 顶部深色磨砂控制栏 */}
      <div className={styles.toolbar}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("mapStation.seedLabel")}</span>
            <input
              className={styles.input}
              type="text"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder={t("mapStation.seedPlaceholder")}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("mapStation.versionLabel")}</span>
            <select
              className={styles.select}
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            >
              {IGM_LAUNCHERV2_MAP_VERSIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("mapStation.typeLabel")}</span>
            <select
              className={styles.select}
              value={type}
              onChange={(event) => setType(event.target.value as iGM_LauncherV2_MapType)}
            >
              {IGM_LAUNCHERV2_MAP_TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.label)}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.actions}>
            <button type="submit" className={styles.submit} disabled={!seed.trim()}>
              <MapIcon size={15} strokeWidth={2.2} />
              <span>{t("mapStation.generate")}</span>
            </button>
            <button type="button" className={styles.open} onClick={handleOpenExternal}>
              <ExternalLink size={15} strokeWidth={2.2} />
              <span>{t("mapStation.openExternal")}</span>
            </button>
          </div>
        </form>

        <p className={styles.tip}>{t("mapStation.tip")}</p>
        {openFailed ? (
          <p className={styles.error} role="alert">
            {t("mapStation.openFailed")}
          </p>
        ) : null}
      </div>

      {/* 主体展示区：铺满剩余空间，含初始 / 加载 / 结果三态 */}
      <div className={styles.stage}>
        {phase === "empty" ? (
          <div className={styles.placeholder}>
            <MapPinned
              className={styles.placeholderIcon}
              size={66}
              strokeWidth={1.2}
              aria-hidden="true"
            />
            <h3 className={styles.placeholderTitle}>{t("mapStation.emptyTitle")}</h3>
            <p className={styles.placeholderBody}>{t("mapStation.emptyBody")}</p>
          </div>
        ) : (
          <>
            {url ? (
              <iframe
                key={attempt}
                className={styles.frame}
                src={url}
                title={t("mapStation.frameTitle")}
                onLoad={handleFrameLoad}
              />
            ) : null}

            {phase === "loading" ? (
              <div className={styles.loading}>
                <span className={styles.spinner} aria-hidden="true" />
                <h3 className={styles.loadingTitle}>{t("mapStation.loadingTitle")}</h3>
                <p className={styles.loadingBody}>{t("mapStation.loadingBody")}</p>
              </div>
            ) : null}

            {blocked ? (
              <div className={styles.blocked}>
                <Compass
                  className={styles.blockedIcon}
                  size={44}
                  strokeWidth={1.3}
                  aria-hidden="true"
                />
                <h3 className={styles.blockedTitle}>{t("mapStation.failureTitle")}</h3>
                <p className={styles.blockedText}>{t("mapStation.failureText")}</p>
                <button type="button" className={styles.open} onClick={handleOpenExternal}>
                  <ExternalLink size={15} strokeWidth={2.2} />
                  <span>{t("mapStation.openExternal")}</span>
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// 导出 //
/* iGM_LauncherV2_MapStation 已于上方命名导出 */
