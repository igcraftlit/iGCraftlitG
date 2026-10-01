/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_TopBar/iGM_Launcher_TopBar.tsx
 * 所属层：前端 / 顶栏层
 * 路由：全局
 * 模块：iGM_Launcher_TopBar
 * 作用：窗口顶部栏，承担原生标题栏职责（自定义窗口 chrome）
 * 内容：左侧 LOGO 与名称（可拖动窗口），中间账户入口（读取状态中心显示
 *       头像、用户名与认证标识），右侧明暗切换、中英切换与窗口控制按钮
 */

// 导入依赖 //
"use client";

import Image from "next/image";
import { BadgeCheck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { IGM_LAUNCHER_APP_NAME } from "@igm-launcher/shared";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import { iGM_Launcher_ThemeToggle as IGM_Launcher_ThemeToggle } from "@/components/iGM_Launcher_ThemeToggle/iGM_Launcher_ThemeToggle";
import { iGM_Launcher_LanguageSwitcher as IGM_Launcher_LanguageSwitcher } from "@/components/iGM_Launcher_LanguageSwitcher/iGM_Launcher_LanguageSwitcher";
import { iGM_Launcher_WindowControls as IGM_Launcher_WindowControls } from "@/components/iGM_Launcher_WindowControls/iGM_Launcher_WindowControls";
import styles from "./iGM_Launcher_TopBar.module.css";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
export function iGM_Launcher_TopBar() {
  const t = useTranslations("account");
  const { account } = iGM_Launcher_UseStore();
  const { navigate } = iGM_Launcher_UseShellLayout();

  const signedIn = account.signedIn;
  const displayName = signedIn ? account.userName : t("guestName");

  return (
    <header className={styles.topbar}>
      {/* 左侧：LOGO 与名称，整个顶栏默认是窗口拖动区 */}
      <div className={styles.brand}>
        <Image
          src="/iGM_Launcher_Logo.ico"
          alt="iGM Launcher logo"
          width={22}
          height={22}
          className={styles.logo}
          priority
        />
        <span className={styles.appName}>{IGM_LAUNCHER_APP_NAME}</span>
      </div>

      {/* 右侧：账户入口与各类控件 */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.accountButton}
          title={signedIn ? `${displayName} · ${account.uid}` : t("signIn")}
          onClick={() => navigate(signedIn ? "account" : "accountLogin")}
        >
          <span className={styles.avatar}>
            <UserRound size={15} strokeWidth={1.8} />
          </span>
          <span className={styles.accountName}>{displayName}</span>
          <BadgeCheck
            size={14}
            strokeWidth={1.8}
            className={signedIn ? styles.verifyIconActive : styles.verifyIcon}
            aria-label={signedIn ? t("verified") : t("statusGuest")}
          />
        </button>

        <span className={styles.divider} aria-hidden="true" />

        <IGM_Launcher_ThemeToggle />
        <IGM_Launcher_LanguageSwitcher />

        <span className={styles.divider} aria-hidden="true" />

        <IGM_Launcher_WindowControls />
      </div>
    </header>
  );
}

// 导出 //
export default iGM_Launcher_TopBar;