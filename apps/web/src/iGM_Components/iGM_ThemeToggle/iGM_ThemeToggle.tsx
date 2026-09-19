/**
 * 文件路径：apps/web/src/iGM_Components/iGM_ThemeToggle/iGM_ThemeToggle.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（TopBar）
 * 模块：iGM_ThemeToggle
 * 作用：明暗模式切换，支持浅色 / 深色 / 跟随系统
 * 内容：Sun / Moon 触发图标，弹出菜单选择三种模式，iGM_ThemeProvider 持久化
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { iGM_UseTheme } from "../../iGM_Providers/iGM_ThemeProvider";
import { useTranslations } from "next-intl";
import { iGM_Popover as IGM_Popover } from "../iGM_Popover/iGM_Popover";
import styles from "../iGM_Popover/iGM_Popover.module.css";

// 类型定义 //
type iGM_ThemeOption = "light" | "dark" | "system";

// 核心逻辑 //
/** 主题切换按钮与三选菜单 */
export function iGM_ThemeToggle() {
  const t = useTranslations();
  const { theme, resolvedTheme, setTheme } = iGM_UseTheme();
  const [mounted, setMounted] = useState(false);

  // 避免首屏 hydration 不一致：挂载后再读取真实主题
  useEffect(() => setMounted(true), []);

  const current = (theme ?? "system") as iGM_ThemeOption;
  const options: { value: iGM_ThemeOption; icon: typeof Sun }[] = [
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
    { value: "system", icon: Monitor },
  ];

  // 未挂载时显示系统图标占位，避免图标闪烁
  const TriggerIcon = !mounted
    ? Monitor
    : resolvedTheme === "dark"
      ? Sun
      : Moon;

  return (
    <IGM_Popover icon={TriggerIcon} ariaLabel={t("topbar.theme")}>
      {(close) => (
        <>
          {options.map(({ value, icon: OptionIcon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={mounted && current === value}
              className={styles.item}
              onClick={() => {
                setTheme(value);
                close();
              }}
            >
              <span className={styles.itemIcon}>
                <OptionIcon size={16} strokeWidth={1.8} />
              </span>
              <span className={styles.itemLabel}>{t(`theme.${value}`)}</span>
              {mounted && current === value && (
                <span className={styles.itemCheck}>
                  <Check size={15} strokeWidth={2.2} />
                </span>
              )}
            </button>
          ))}
        </>
      )}
    </IGM_Popover>
  );
}

// 导出 //
export default iGM_ThemeToggle;
