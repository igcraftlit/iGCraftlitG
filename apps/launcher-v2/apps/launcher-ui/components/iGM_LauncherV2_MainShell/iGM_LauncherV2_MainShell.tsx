/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_MainShell/iGM_LauncherV2_MainShell.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main
 * 模块：iGM_LauncherV2_MainShell
 * 作用：启动器主界面骨架（模块一仅占位）
 * 内容：显示「主界面加载中」占位视图，并暴露模块一需要验证的两项运行时信息——
 *       社区账号登录状态与 Rust 核心连通性；提供退出登录与返回欢迎页入口
 * 说明：实例管理、资源中心等真实功能留待后续模块实现
 */

// 导入依赖 //
"use client";

import { LogOut, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { iGM_LauncherV2_FluidBackground as IGM_LauncherV2_FluidBackground } from "@/components/iGM_LauncherV2_FluidBackground/iGM_LauncherV2_FluidBackground";
import {
  iGM_LauncherV2_Button as IGM_LauncherV2_Button,
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
  iGM_LauncherV2_StatusDot as IGM_LauncherV2_StatusDot,
  iGM_LauncherV2_WindowChrome as IGM_LauncherV2_WindowChrome,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_UseAuth as IGM_LauncherV2_UseAuth,
  iGM_LauncherV2_UseCoreStatus as IGM_LauncherV2_UseCoreStatus,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import { IGM_LAUNCHERV2_APP_NAME, IGM_LAUNCHERV2_VERSION } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_MainShell.module.css";

// 类型定义 //
/* （无外部入参） */

// 核心逻辑 //
export function iGM_LauncherV2_MainShell() {
  const router = useRouter();
  const auth = IGM_LauncherV2_UseAuth();
  const core = IGM_LauncherV2_UseCoreStatus();

  const coreTone = core.state === "ok" ? "ok" : core.state === "unavailable" ? "warn" : "idle";
  const coreLabel =
    core.state === "ok"
      ? `Rust 核心已连通${core.version ? `（v${core.version}）` : ""}`
      : core.state === "unavailable"
        ? `Rust 核心未就绪：${core.detail || "未找到 igm_core 可执行文件"}`
        : "正在探测 Rust 核心…";

  return (
    <div className={`igm-screen igm-page ${styles.screen}`}>
      <IGM_LauncherV2_FluidBackground />
      <IGM_LauncherV2_WindowChrome label={IGM_LAUNCHERV2_APP_NAME} version={`v${IGM_LAUNCHERV2_VERSION}`} />

      <main className={styles.main}>
        <IGM_LauncherV2_Card className={styles.panel}>
          <div className={styles.loader} aria-hidden>
            <span className={`${styles.ring} ${styles.ringOn}`} />
          </div>

          <h1 className={styles.title}>主界面加载中</h1>
          <p className={styles.desc}>模块一仅搭建框架，实例管理、资源中心等功能将在后续模块实现。</p>

          <div className={styles.statusList}>
            <IGM_LauncherV2_StatusDot tone={auth.state === "logged-in" ? "ok" : "idle"}>
              {auth.state === "logged-in"
                ? `社区账号：${auth.user?.nickname || auth.user?.uid || "已登录"}`
                : "社区账号未登录"}
            </IGM_LauncherV2_StatusDot>
            <IGM_LauncherV2_StatusDot tone={coreTone}>{coreLabel}</IGM_LauncherV2_StatusDot>
          </div>

          <div className={styles.actions}>
            <IGM_LauncherV2_Button
              variant="secondary"
              icon={<Undo2 size={15} strokeWidth={2.1} />}
              onClick={() => router.push("/")}
            >
              返回欢迎页
            </IGM_LauncherV2_Button>
            <IGM_LauncherV2_Button
              variant="ghost"
              icon={<LogOut size={15} strokeWidth={2.1} />}
              onClick={() => {
                auth.logout();
                router.push("/G_Login");
              }}
            >
              退出登录
            </IGM_LauncherV2_Button>
          </div>
        </IGM_LauncherV2_Card>
      </main>
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_MainShell;
