/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Welcome/iGM_LauncherV2_Welcome.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Welcome（/）
 * 模块：iGM_LauncherV2_Welcome
 * 作用：启动器欢迎首页：全屏流体云背景 + 草方块 Logo + 艺术字体标题 + 进入按钮
 * 内容：点击「开始探索之旅」后按登录状态分流——已登录进入主界面，
 *       未登录先进入社区授权登录页（社区登录为后续所有功能的前置条件）
 */

// 导入依赖 //
"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { iGM_LauncherV2_AppearanceHost as IGM_LauncherV2_AppearanceHost } from "@/components/iGM_LauncherV2_AppearanceHost/iGM_LauncherV2_AppearanceHost";
import {
  iGM_LauncherV2_Button as IGM_LauncherV2_Button,
  iGM_LauncherV2_StatusDot as IGM_LauncherV2_StatusDot,
  iGM_LauncherV2_WindowChrome as IGM_LauncherV2_WindowChrome,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_Navigate,
  iGM_LauncherV2_UseAuth as IGM_LauncherV2_UseAuth,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  IGM_LAUNCHERV2_APP_NAME,
  IGM_LAUNCHERV2_VERSION,
} from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_Welcome.module.css";

// 类型定义 //
/* （无外部入参） */

// 核心逻辑 //
export function iGM_LauncherV2_Welcome() {
  const auth = IGM_LauncherV2_UseAuth();

  /** 开始探索：未登录先完成社区授权，已登录直接进入主界面 */
  const handleStart = () => {
    iGM_LauncherV2_Navigate(auth.state === "logged-in" ? "/G_Main" : "/G_Login");
  };

  const authTone = auth.state === "logged-in" ? "ok" : "idle";
  const authLabel =
    auth.state === "logged-in"
      ? auth.user?.nickname || "已登录"
      : auth.state === "pending"
        ? "等待授权"
        : "未登录社区账号";

  return (
    <div className={`igm-screen igm-page ${styles.screen}`}>
      <IGM_LauncherV2_AppearanceHost />
      <IGM_LauncherV2_WindowChrome label={IGM_LAUNCHERV2_APP_NAME} version={`v${IGM_LAUNCHERV2_VERSION}`} />

      <main className={styles.main}>
        <div className={styles.logoWrap}>
          <Image
            src="/igml.jpg"
            alt="iGM CraftCeon Launcher 标志"
            width={104}
            height={104}
            className={styles.logo}
            priority
          />
        </div>

        <h1 className={styles.title}>iGM CraftCeon Launcher</h1>
        <p className={styles.subtitle}>为 iGCraftLit 社区打造的轻量、简约 Minecraft 启动器</p>

        <div className={styles.actions}>
          <IGM_LauncherV2_Button
            variant="primary"
            icon={<ArrowRight size={16} strokeWidth={2.2} />}
            onClick={handleStart}
          >
            开始探索之旅
          </IGM_LauncherV2_Button>
        </div>
      </main>

      <footer className={styles.foot}>
        <IGM_LauncherV2_StatusDot tone={authTone}>{authLabel}</IGM_LauncherV2_StatusDot>
        <span className={styles.footNote}>iGCraftLit Community 团队</span>
      </footer>
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_Welcome;
