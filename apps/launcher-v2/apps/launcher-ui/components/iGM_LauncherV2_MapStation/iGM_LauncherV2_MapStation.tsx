/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_MapStation/iGM_LauncherV2_MapStation.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main（地图站页签）
 * 模块：iGM_LauncherV2_MapStation
 * 作用：地图站：输入种子并内嵌 MCSeedShare 种子查找器，全程不经过主站后端
 * 内容：顶部深色磨砂玻璃卡片控制栏（种子输入框 / 支持输入搜索过滤的版本输入框（原生 datalist）/
 *       「生成地图」主题色按钮 / 醒目的「在浏览器中打开」按钮 + 卡片内加载与兜底提示行）；
 *       主体为铺满整页剩余空间的 iframe，内嵌 https://www.mcseedshare.com/seed-finder；
 *       点击【生成地图】按 encodeURIComponent 拼接 ?seed= 与可选 &version= 后更新 iframe 的 src
 *       （种子为空时只保留基础地址），属尽力而为的参数拼接，不要求站点一定识别；
 *       采用「超时未触发 load 即判定被 X-Frame-Options 拦截」策略：加载时启动 8 秒定时器，
 *       超时前收到 load 判定可用并结束加载态，否则展示 embedFallback 兜底提示；
 *       用户点击【在浏览器中打开】同样展示兜底提示；
 *       版本目录由 iGM_LauncherV2_UseCoreVersions("vanilla") 动态拉取，界面不做硬编码版本表
 * 说明：地图数据完全直连第三方站点（iframe 的 src 直连），绝不经过
 *       api.igcraftlit.com；除既有的 link:open 出站消息外不新增任何 IPC；
 *       本组件为单页内的导航页签，非独立路由页面——启动器静态导出后仅加载单一入口，
 *       独立路由在打包架构下不可达
 */

// 导入依赖 //
"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Map as MapIcon, MapPinned } from "lucide-react";
import {
  iGM_LauncherV2_OpenLink as IGM_LauncherV2_OpenLink,
  iGM_LauncherV2_UseCoreVersions as IGM_LauncherV2_UseCoreVersions,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import styles from "./iGM_LauncherV2_MapStation.module.css";

// 类型定义 //

/** 内嵌阶段：加载中 / 加载完成 / 超时判定被拦截 */
type iGM_LauncherV2_MapEmbedPhase = "loading" | "ready" | "blocked";

// 常量与文案 //

/** MCSeedShare 种子查找器基础地址（直连外部，不经过 api.igcraftlit.com） */
const IGM_MAPSTATION_BASE_URL = "https://www.mcseedshare.com/seed-finder";

/** 内嵌加载超时（毫秒）：超时未触发 load 即判定站点不允许内嵌 */
const IGM_MAPSTATION_EMBED_TIMEOUT = 8000;

/** 版本 datalist 元素 id（原生可搜索下拉的唯一标识） */
const IGM_MAPSTATION_DATALIST_ID = "igm-mapstation-versions";

// 核心逻辑 //

/**
 * 拼接 MCSeedShare 种子查找器地址：
 * 种子做 encodeURIComponent 后作为 ?seed=，已选版本再追加 &version=。
 * 种子为空时只保留基础地址。
 */
function iGM_LauncherV2_BuildSeedShareUrl(seed: string, version: string): string {
  const trimmedSeed = seed.trim();
  if (!trimmedSeed) return IGM_MAPSTATION_BASE_URL;
  let url = `${IGM_MAPSTATION_BASE_URL}?seed=${encodeURIComponent(trimmedSeed)}`;
  const trimmedVersion = version.trim();
  if (trimmedVersion) url += `&version=${encodeURIComponent(trimmedVersion)}`;
  return url;
}

export function iGM_LauncherV2_MapStation() {
  const t = useTranslations();

  /** 版本目录：原版核心全量版本（含 release 与 snapshot，最新在前），供输入框搜索过滤 */
  const versionCatalog = IGM_LauncherV2_UseCoreVersions("vanilla");

  const [seed, setSeed] = useState("");
  const [version, setVersion] = useState("");
  /** 已提交给 iframe 的地址；初始即基础地址，进入页签立即开始内嵌 */
  const [src, setSrc] = useState(IGM_MAPSTATION_BASE_URL);
  /** 内嵌阶段 */
  const [phase, setPhase] = useState<iGM_LauncherV2_MapEmbedPhase>("loading");
  /** 是否展示「站点不支持内嵌预览」兜底提示（超时判定或被拦截，或用户点击打开时置位） */
  const [showFallback, setShowFallback] = useState(false);
  /** 每次生成自增，用作 iframe key 以强制重载（同地址重复生成也会刷新） */
  const [attempt, setAttempt] = useState(0);
  /** 是否仍在等待 load：超时判定后置 false，避免迟到的 load 误清除加载态 */
  const pendingRef = useRef(true);

  // 加载态计时：超时前未收到 load 即判定为被拦截，转失败态并展示兜底提示
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => {
      pendingRef.current = false;
      setPhase("blocked");
      setShowFallback(true);
    }, IGM_MAPSTATION_EMBED_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [phase, attempt]);

  /** iframe 加载完成：仅在等待期内有效，收到即认为可用并结束加载态 */
  const handleFrameLoad = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    setPhase("ready");
  }, []);

  /** 生成地图：拼接地址并交 iframe，转入加载态并重新挂载 */
  const handleGenerate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSrc(iGM_LauncherV2_BuildSeedShareUrl(seed, version));
    pendingRef.current = true;
    setPhase("loading");
    setAttempt((value) => value + 1);
  };

  /** 在系统默认浏览器中打开当前 iframe 地址，并展示兜底提示 */
  const handleOpenExternal = () => {
    IGM_LauncherV2_OpenLink(src);
    setShowFallback(true);
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h2 className={styles.headTitle}>{t("mapStation.title")}</h2>
        <p className={styles.headDesc}>{t("mapStation.subtitle")}</p>
      </header>

      {/* 顶部深色磨砂控制卡片 */}
      <div className={styles.toolbar}>
        <form className={styles.form} onSubmit={handleGenerate}>
          <label className={styles.field}>
            <input
              className={styles.input}
              type="text"
              value={seed}
              aria-label={t("mapStation.seedPlaceholder")}
              placeholder={t("mapStation.seedPlaceholder")}
              onChange={(event) => setSeed(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            {/* 原生 input + datalist：输入即按版本号前缀 / 子串实时过滤，无需自建下拉控件 */}
            <input
              className={styles.input}
              type="text"
              list={IGM_MAPSTATION_DATALIST_ID}
              value={version}
              aria-label={t("mapStation.versionPlaceholder")}
              placeholder={t("mapStation.versionPlaceholder")}
              onChange={(event) => setVersion(event.target.value)}
            />
            <datalist id={IGM_MAPSTATION_DATALIST_ID}>
              {versionCatalog.versions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>

          <div className={styles.actions}>
            <button type="submit" className={styles.submit}>
              <MapIcon size={15} strokeWidth={2.2} />
              <span>{t("mapStation.generate")}</span>
            </button>
            <button type="button" className={styles.open} onClick={handleOpenExternal}>
              <ExternalLink size={15} strokeWidth={2.2} />
              <span>{t("mapStation.openExternal")}</span>
            </button>
          </div>
        </form>

        {/* 加载态提示：等待 iframe 触发 load 期间展示 */}
        {phase === "loading" ? (
          <p className={styles.status}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>{t("mapStation.embedLoading")}</span>
          </p>
        ) : null}

        {/* 兜底提示：站点不支持内嵌预览，请点击「在浏览器中打开」 */}
        {showFallback ? (
          <p className={styles.fallback} role="alert">
            <MapPinned size={13} strokeWidth={2.2} />
            <span>{t("mapStation.embedFallback")}</span>
          </p>
        ) : null}
      </div>

      {/* 主体展示区：内嵌 iframe 铺满剩余空间 */}
      <div className={styles.stage}>
        <iframe
          key={attempt}
          className={styles.frame}
          src={src}
          title={t("mapStation.title")}
          onLoad={handleFrameLoad}
        />
      </div>
    </div>
  );
}

// 导出 //
/* iGM_LauncherV2_MapStation 已于上方命名导出 */
