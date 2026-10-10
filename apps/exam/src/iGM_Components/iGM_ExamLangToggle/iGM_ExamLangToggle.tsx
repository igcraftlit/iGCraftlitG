/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamLangToggle/iGM_ExamLangToggle.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局
 * 模块：iGM_ExamLangToggle
 * 作用：右上角语言切换入口，点击下拉选择「中文 / English」，切换即时生效
 * 内容：Languages 图标触发按钮、下拉选项列表、选中标记、点击外部与 Esc 关闭
 * 说明：语言状态由 iGM_ExamI18nProvider 统一管理，本地持久化在 localStorage
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import {
  iGM_ExamLangLabels,
  type iGM_ExamLang,
} from "../../iGM_i18n/iGM_I18nTypes";
import styles from "./iGM_ExamLangToggle.module.css";

// 类型定义 //
/** 可选语言顺序 */
const iGM_Exam_LangOrder: readonly iGM_ExamLang[] = ["zh-CN", "en"] as const;

// 核心逻辑 //
/** 语言切换器 */
export function iGM_ExamLangToggle() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 打开时监听外部点击与 Esc
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const currentCode = lang === "zh-CN" ? "中" : "EN";

  return (
    <div ref={rootRef} className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("langButtonLabel")}
        title={t("langButtonLabel")}
      >
        <Languages size={14} strokeWidth={1.8} />
        <span className={`igm-mono ${styles.code}`}>{currentCode}</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={styles.caret}
          data-open={open}
        />
      </button>

      {open && (
        <ul className={styles.menu} role="listbox" aria-label={t("langButtonLabel")}>
          {iGM_Exam_LangOrder.map((item) => {
            const active = item === lang;
            return (
              <li key={item} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`${styles.option} ${active ? styles.optionActive : ""}`}
                  onClick={() => {
                    setLang(item);
                    setOpen(false);
                  }}
                >
                  <span className={styles.optionName}>
                    {iGM_ExamLangLabels[item]}
                  </span>
                  <span className={`igm-mono ${styles.optionCode}`}>
                    {item === "zh-CN" ? "ZH" : "EN"}
                  </span>
                  {active && (
                    <Check size={13} strokeWidth={2} className={styles.check} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// 导出 //
export default iGM_ExamLangToggle;
