/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_AppearancePage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Appearance（SPA 页 id：appearance）
 * 模块：iGM_Launcher_AppearancePage
 * 作用：外观与主题页：预设主题选择、自定义主色取色、背景图上传与清除、模糊强度滑块
 * 内容：全部改动实时预览（立即覆写 html 数据集与内联 CSS 变量），并持久化到
 *       IGM_LAUNCHER_DATA_ROOT/appearance/appearance.json；背景图经主进程校验
 *       （JPG/PNG/WebP，≤5MB）后拷贝到数据目录并回传 data URL
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Contrast,
  Image as ImageIcon,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_BG_IMAGE_MAX_BYTES,
  iGM_Launcher_NormalizeAppearance,
  type iGM_Launcher_AppearancePrefs,
  type iGM_Launcher_ThemePreset,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_BridgeCall as IGM_Launcher_BridgeCall } from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";
import {
  iGM_Launcher_ApplyAppearance as IGM_Launcher_ApplyAppearance,
  iGM_Launcher_LoadAppearance as IGM_Launcher_LoadAppearance,
  iGM_Launcher_PersistAppearance as IGM_Launcher_PersistAppearance,
  IGM_LAUNCHER_APPEARANCE_BLUR_MAX as IGM_LAUNCHER_APPEARANCE_BLUR_MAX,
} from "@/components/iGM_Launcher_Appearance/iGM_Launcher_AppearanceStore";
import styles from "./iGM_Launcher_AppearancePage.module.css";

// 类型定义 //
interface iGM_Launcher_PresetOption {
  value: iGM_Launcher_ThemePreset;
  labelKey: string;
}

// 核心逻辑 //
/** 预设主题清单：value 与 iGM_Launcher_Tokens.css 的 html[data-igm-theme-preset] 一一对应 */
const IGM_LAUNCHER_PRESET_OPTIONS: iGM_Launcher_PresetOption[] = [
  { value: "default", labelKey: "presetDefault" },
  { value: "minimal-white", labelKey: "presetMinimalWhite" },
  { value: "night-black", labelKey: "presetNightBlack" },
  { value: "star-blue", labelKey: "presetStarBlue" },
  { value: "aurora-green", labelKey: "presetAuroraGreen" },
  { value: "sunset-orange", labelKey: "presetSunsetOrange" },
];

/** 预设 -> 色板样式类（显式映射，避免动态拼串导致的类型与哈希不确定性） */
const IGM_LAUNCHER_PRESET_SWATCH: Record<iGM_Launcher_ThemePreset, string> = {
  default: styles.swatchDefault,
  "minimal-white": styles.swatchMinimalWhite,
  "night-black": styles.swatchNightBlack,
  "star-blue": styles.swatchStarBlue,
  "aurora-green": styles.swatchAuroraGreen,
  "sunset-orange": styles.swatchSunsetOrange,
};

/** 格式化文件大小 */
function iGM_Launcher_FormatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function iGM_Launcher_AppearancePage() {
  const t = useTranslations("appearance");
  const [prefs, setPrefs] = useState<iGM_Launcher_AppearancePrefs>(() =>
    iGM_Launcher_NormalizeAppearance(null),
  );
  const [backgroundDataUrl, setBackgroundDataUrl] = useState<string | null>(null);
  const [backgroundSize, setBackgroundSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 挂载后从桥接（或 localStorage 回退）读取偏好并应用，避免水合不一致
  useEffect(() => {
    let active = true;
    void (async () => {
      const state = await IGM_Launcher_LoadAppearance();
      if (!active) return;
      setPrefs(state.prefs);
      setBackgroundDataUrl(state.backgroundDataUrl);
      IGM_Launcher_ApplyAppearance(state.prefs, state.backgroundDataUrl);
    })();
    return () => {
      active = false;
    };
  }, []);

  /** 应用 + 持久化：先即时预览，再落盘 */
  const commit = useCallback(
    (next: iGM_Launcher_AppearancePrefs, dataUrl: string | null = backgroundDataUrl) => {
      setPrefs(next);
      IGM_Launcher_ApplyAppearance(next, dataUrl);
      void IGM_Launcher_PersistAppearance(next);
    },
    [backgroundDataUrl],
  );

  const handlePickBackground = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await IGM_Launcher_BridgeCall("appearance:pick-background");
      if (!response.success || !response.data) {
        setMessage(response.message || t("pickFailed"));
        return;
      }
      // backgroundPath 为空串表示用户取消选择，保持原状
      if (!response.data.backgroundPath) return;
      if (response.data.size > IGM_LAUNCHER_BG_IMAGE_MAX_BYTES) {
        setMessage(t("tooLarge"));
        return;
      }
      setBackgroundDataUrl(response.data.backgroundDataUrl);
      setBackgroundSize(response.data.size);
      commit({ ...prefs, backgroundPath: response.data.backgroundPath }, response.data.backgroundDataUrl);
    } finally {
      setBusy(false);
    }
  };

  const handleClearBackground = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await IGM_Launcher_BridgeCall("appearance:clear-background");
      const next =
        response.success && response.data
          ? iGM_Launcher_NormalizeAppearance(response.data.appearance)
          : { ...prefs, backgroundPath: null };
      setBackgroundDataUrl(null);
      setBackgroundSize(null);
      commit(next, null);
    } finally {
      setBusy(false);
    }
  };

  const backgroundName = prefs.backgroundPath
    ? prefs.backgroundPath.split("/").pop() ?? prefs.backgroundPath
    : "";

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader title={t("title")} description={t("subtitle")} />

      {/* 预设主题 */}
      <IGM_Launcher_Card className={styles.group}>
        <h3 className={styles.groupTitle}>
          <Palette size={15} strokeWidth={1.8} />
          <span>{t("groupPreset")}</span>
        </h3>
        <p className={styles.groupDesc}>{t("groupPresetDesc")}</p>
        <div className={styles.presetGrid}>
          {IGM_LAUNCHER_PRESET_OPTIONS.map((option) => {
            const active = prefs.themePreset === option.value;
            return (
              <button
                type="button"
                key={option.value}
                aria-pressed={active}
                className={`${styles.presetCard} ${active ? styles.presetCardActive : ""}`}
                onClick={() => commit({ ...prefs, themePreset: option.value })}
              >
                <span
                  className={`${styles.presetSwatch} ${IGM_LAUNCHER_PRESET_SWATCH[option.value]}`}
                  aria-hidden="true"
                />
                <span className={styles.presetLabel}>
                  {active ? <Check size={13} strokeWidth={2} /> : null}
                  {t(option.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </IGM_Launcher_Card>

      {/* 自定义主色 */}
      <IGM_Launcher_Card className={styles.group}>
        <h3 className={styles.groupTitle}>
          <Contrast size={15} strokeWidth={1.8} />
          <span>{t("groupAccent")}</span>
        </h3>
        <p className={styles.groupDesc}>{t("groupAccentDesc")}</p>
        <div className={styles.accentRow}>
          <input
            type="color"
            className={styles.colorInput}
            aria-label={t("accentCustom")}
            value={prefs.accentColor ?? "#2563eb"}
            onChange={(event) => commit({ ...prefs, accentColor: event.target.value })}
          />
          <span className={styles.accentValue}>{prefs.accentColor ?? t("accentDefault")}</span>
          <IGM_Launcher_Button
            variant="ghost"
            disabled={!prefs.accentColor}
            onClick={() => commit({ ...prefs, accentColor: null })}
          >
            <RotateCcw size={14} strokeWidth={1.8} />
            {t("accentReset")}
          </IGM_Launcher_Button>
        </div>
        <p className={styles.hint}>{t("accentHint")}</p>
      </IGM_Launcher_Card>

      {/* 背景图 */}
      <IGM_Launcher_Card className={styles.group}>
        <h3 className={styles.groupTitle}>
          <ImageIcon size={15} strokeWidth={1.8} />
          <span>{t("groupBackground")}</span>
        </h3>
        <p className={styles.groupDesc}>{t("groupBackgroundDesc")}</p>
        <div className={styles.backgroundRow}>
          <IGM_Launcher_Button
            variant="secondary"
            disabled={busy}
            onClick={() => void handlePickBackground()}
          >
            <Upload size={14} strokeWidth={1.8} />
            {busy ? t("busy") : t("backgroundChoose")}
          </IGM_Launcher_Button>
          <IGM_Launcher_Button
            variant="ghost"
            disabled={busy || !prefs.backgroundPath}
            onClick={() => void handleClearBackground()}
          >
            <Trash2 size={14} strokeWidth={1.8} />
            {t("backgroundClear")}
          </IGM_Launcher_Button>
          {prefs.backgroundPath ? (
            <IGM_Launcher_Badge tone="accent">
              {backgroundName}
              {backgroundSize ? ` · ${iGM_Launcher_FormatSize(backgroundSize)}` : ""}
            </IGM_Launcher_Badge>
          ) : (
            <IGM_Launcher_Badge tone="muted">{t("backgroundNone")}</IGM_Launcher_Badge>
          )}
        </div>
        {message ? <p className={styles.error}>{message}</p> : null}
        <p className={styles.hint}>{t("backgroundHint")}</p>
      </IGM_Launcher_Card>

      {/* 模糊强度 */}
      <IGM_Launcher_Card className={styles.group}>
        <h3 className={styles.groupTitle}>
          <SlidersHorizontal size={15} strokeWidth={1.8} />
          <span>{t("groupBlur")}</span>
        </h3>
        <p className={styles.groupDesc}>{t("groupBlurDesc")}</p>
        <div className={styles.blurRow}>
          <input
            type="range"
            min={0}
            max={IGM_LAUNCHER_APPEARANCE_BLUR_MAX}
            step={1}
            aria-label={t("groupBlur")}
            className={styles.blurRange}
            value={prefs.backgroundBlur}
            onChange={(event) =>
              commit({ ...prefs, backgroundBlur: Number(event.target.value) })
            }
          />
          <span className={styles.blurValue}>
            {t("blurValue", { value: prefs.backgroundBlur })}
          </span>
        </div>
      </IGM_Launcher_Card>

      <IGM_Launcher_PlaceholderNote>
        {backgroundDataUrl ? t("previewActive") : t("previewIdle")}
      </IGM_Launcher_PlaceholderNote>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_AppearancePage;