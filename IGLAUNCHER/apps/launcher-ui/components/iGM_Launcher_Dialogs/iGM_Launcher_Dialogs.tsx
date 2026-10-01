/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Dialogs/iGM_Launcher_Dialogs.tsx
 * 所属层：前端 / 交互层
 * 路由：全局（实例删除确认、实例重命名、Java 移除确认、启动登录方式选择）
 * 模块：iGM_Launcher_Dialogs
 * 作用：极简模态层：二次确认对话框、单行输入对话框与启动登录方式选择对话框
 * 内容：遮罩 + 居中卡片，支持 Esc 取消与点击遮罩关闭；
 *       不使用原生 window.confirm / prompt，避免桌面外壳内的系统弹窗；
 *       启动登录方式对话框让用户在启动前明确选择正版或离线，并在多绑定时选择账号
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { Check, MonitorSmartphone, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { iGM_Launcher_LaunchMode, iGM_Launcher_MCBinding } from "@igm-launcher/shared";
import { iGM_Launcher_Button as IGM_Launcher_Button } from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import {
  iGM_Launcher_Input as IGM_Launcher_Input,
  iGM_Launcher_Select as IGM_Launcher_Select,
} from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import styles from "./iGM_Launcher_Dialogs.module.css";

// 类型定义 //
export interface iGM_Launcher_ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** true 时确认按钮使用危险色（删除类操作） */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface iGM_Launcher_PromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  initialValue: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export interface iGM_Launcher_LaunchModeDialogProps {
  open: boolean;
  /** 待启动实例名称（确认信息展示） */
  instanceName: string;
  /** 已绑定的正版账号列表（为空时正版选项置灰并提示先绑定） */
  bindings: iGM_Launcher_MCBinding[];
  /** 默认选中的绑定记录 id */
  defaultBindingId: string;
  confirmLabel: string;
  onConfirm: (mode: iGM_Launcher_LaunchMode, bindingId: string) => void;
  onCancel: () => void;
}

// 核心逻辑 //
/** Esc 关闭：两个对话框共用 */
function iGM_Launcher_UseEscape(open: boolean, onCancel: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);
}

export function iGM_Launcher_ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: iGM_Launcher_ConfirmDialogProps) {
  const tCommon = useTranslations("common");
  iGM_Launcher_UseEscape(open, onCancel);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dialogHead}>
          {danger ? <TriangleAlert size={16} strokeWidth={1.8} className={styles.dangerIcon} /> : null}
          <h2 className={styles.dialogTitle}>{title}</h2>
        </div>
        <p className={styles.dialogDesc}>{description}</p>
        <div className={styles.dialogActions}>
          <IGM_Launcher_Button variant="secondary" onClick={onCancel}>
            {tCommon("cancel")}
          </IGM_Launcher_Button>
          <IGM_Launcher_Button
            variant="primary"
            className={danger ? styles.dangerButton : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </IGM_Launcher_Button>
        </div>
      </div>
    </div>
  );
}

export function iGM_Launcher_PromptDialog({
  open,
  title,
  label,
  placeholder,
  initialValue,
  confirmLabel,
  onConfirm,
  onCancel,
}: iGM_Launcher_PromptDialogProps) {
  const tCommon = useTranslations("common");
  const [value, setValue] = useState(initialValue);

  iGM_Launcher_UseEscape(open, onCancel);

  // 打开时同步初值
  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dialogHead}>
          <h2 className={styles.dialogTitle}>{title}</h2>
        </div>
        <label className={styles.dialogLabel} htmlFor="iGM_Launcher_PromptInput">
          {label}
        </label>
        <IGM_Launcher_Input
          id="iGM_Launcher_PromptInput"
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onConfirm(value);
          }}
        />
        <div className={styles.dialogActions}>
          <IGM_Launcher_Button variant="secondary" onClick={onCancel}>
            {tCommon("cancel")}
          </IGM_Launcher_Button>
          <IGM_Launcher_Button variant="primary" onClick={() => onConfirm(value)}>
            {confirmLabel}
          </IGM_Launcher_Button>
        </div>
      </div>
    </div>
  );
}

// 导出 //
/* 以上具名导出即为本模块对外接口 */

/**
 * 启动登录方式选择对话框。
 * 每次启动都要求用户显式选择正版或离线：正版需已绑定微软账号（未绑定时置灰并提供绑定入口），
 * 多绑定时可切换具体账号；离线使用本地离线角色身份（仅单机与局域网）。
 */
export function iGM_Launcher_LaunchModeDialog({
  open,
  instanceName,
  bindings,
  defaultBindingId,
  confirmLabel,
  onConfirm,
  onCancel,
}: iGM_Launcher_LaunchModeDialogProps) {
  const t = useTranslations("instances");
  const tCommon = useTranslations("common");
  const hasBinding = bindings.length > 0;
  // 有正版绑定时默认走正版，否则默认离线
  const [mode, setMode] = useState<iGM_Launcher_LaunchMode>(hasBinding ? "official" : "offline");
  const [bindingId, setBindingId] = useState(defaultBindingId);

  iGM_Launcher_UseEscape(open, onCancel);

  // 每次打开时按当前绑定情况重置选择
  useEffect(() => {
    if (!open) return;
    setMode(hasBinding ? "official" : "offline");
    setBindingId(defaultBindingId || bindings[0]?.id || "");
  }, [open, hasBinding, defaultBindingId, bindings]);

  if (!open) return null;

  const effectiveMode: iGM_Launcher_LaunchMode = hasBinding ? mode : "offline";

  return (
    <div className={styles.overlay} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t("launchModeTitle")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dialogHead}>
          <h2 className={styles.dialogTitle}>{t("launchModeTitle")}</h2>
        </div>
        <p className={styles.dialogDesc}>
          {t("launchModeDesc", { name: instanceName })}
        </p>

        {/* 登录方式单选：正版 / 离线 */}
        <div className={styles.modeList} role="radiogroup" aria-label={t("launchModeTitle")}>
          <button
            type="button"
            role="radio"
            aria-checked={effectiveMode === "official"}
            disabled={!hasBinding}
            className={`${styles.modeOption} ${
              effectiveMode === "official" ? styles.modeOptionActive : ""
            }`}
            onClick={() => setMode("official")}
          >
            <span className={styles.modeIcon}>
              <ShieldCheck size={16} strokeWidth={1.7} />
            </span>
            <span className={styles.modeBody}>
              <span className={styles.modeName}>
                {t("launchModeOfficial")}
                {effectiveMode === "official" ? (
                  <Check size={13} strokeWidth={2} className={styles.modeCheck} />
                ) : null}
              </span>
              <span className={styles.modeDesc}>
                {hasBinding ? t("launchModeOfficialDesc") : t("launchModeOfficialUnbound")}
              </span>
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={effectiveMode === "offline"}
            className={`${styles.modeOption} ${
              effectiveMode === "offline" ? styles.modeOptionActive : ""
            }`}
            onClick={() => setMode("offline")}
          >
            <span className={styles.modeIcon}>
              <MonitorSmartphone size={16} strokeWidth={1.7} />
            </span>
            <span className={styles.modeBody}>
              <span className={styles.modeName}>
                {t("launchModeOffline")}
                {effectiveMode === "offline" ? (
                  <Check size={13} strokeWidth={2} className={styles.modeCheck} />
                ) : null}
              </span>
              <span className={styles.modeDesc}>{t("launchModeOfflineDesc")}</span>
            </span>
          </button>
        </div>

        {/* 正版账号选择：仅在已绑定多个账号时出现 */}
        {effectiveMode === "official" && bindings.length > 1 ? (
          <label className={styles.dialogLabel} htmlFor="iGM_Launcher_LaunchBindingSelect">
            {t("launchModeAccount")}
            <IGM_Launcher_Select
              id="iGM_Launcher_LaunchBindingSelect"
              value={bindingId}
              onChange={(event) => setBindingId(event.target.value)}
            >
              {bindings.map((binding) => (
                <option key={binding.id} value={binding.id}>
                  {binding.name} · {binding.uuid.slice(0, 8)}
                </option>
              ))}
            </IGM_Launcher_Select>
          </label>
        ) : null}

        <div className={styles.dialogActions}>
          <IGM_Launcher_Button variant="secondary" onClick={onCancel}>
            {tCommon("cancel")}
          </IGM_Launcher_Button>
          <IGM_Launcher_Button
            variant="primary"
            disabled={effectiveMode === "official" && !bindingId}
            onClick={() =>
              onConfirm(effectiveMode, effectiveMode === "official" ? bindingId : "")
            }
          >
            {confirmLabel}
          </IGM_Launcher_Button>
        </div>
      </div>
    </div>
  );
}