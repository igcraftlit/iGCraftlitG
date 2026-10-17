/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Login/iGM_LauncherV2_Login.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Login
 * 模块：iGM_LauncherV2_Login
 * 作用：社区账号授权登录页（启动器全部功能的前置步骤）
 * 内容：卡片中央仅保留一个星标入口（image/ig.png，64x64），图标本身即登录按钮；
 *       点击后由 Bun 主进程发起 PKCE 授权流程并调起默认浏览器；
 *       界面只接收不含令牌的登录状态，授权成功后自动进入主界面
 * 说明：桌面端为公开客户端，全程不传输 client_secret，仅使用 PKCE（S256）；
 *       本页为纯 OAuth 授权入口，不提供账号密码表单、注册入口或其他登录方式
 */

// 导入依赖 //
"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { iGM_LauncherV2_FluidBackground as IGM_LauncherV2_FluidBackground } from "@/components/iGM_LauncherV2_FluidBackground/iGM_LauncherV2_FluidBackground";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
  iGM_LauncherV2_WindowChrome as IGM_LauncherV2_WindowChrome,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import { iGM_LauncherV2_UseAuth as IGM_LauncherV2_UseAuth } from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import { IGM_LAUNCHERV2_APP_NAME } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_Login.module.css";

// 类型定义 //
/* （无外部入参） */

// 核心逻辑 //
export function iGM_LauncherV2_Login() {
  const router = useRouter();
  const auth = IGM_LauncherV2_UseAuth();

  // 授权成功：平滑过渡到主界面
  useEffect(() => {
    if (auth.state === "logged-in") router.replace("/G_Main");
  }, [auth.state, router]);

  const pending = auth.state === "pending" || auth.state === "logged-in";

  return (
    <div className={`igm-screen igm-page ${styles.screen}`}>
      <IGM_LauncherV2_FluidBackground />
      <IGM_LauncherV2_WindowChrome label={IGM_LAUNCHERV2_APP_NAME} version="社区授权" />

      <main className={styles.main}>
        <IGM_LauncherV2_Card className={styles.panel}>
          {/* 唯一登录入口：星标图标本身即按钮，点击直接触发社区授权 */}
          <button
            type="button"
            className={styles.entry}
            aria-label="使用 iGCraftLit 社区账号登录"
            disabled={pending}
            onClick={() => auth.login()}
          >
            <Image
              src="/ig.png"
              alt="iGCraftLit"
              width={64}
              height={64}
              className={styles.mark}
              priority
            />
          </button>

          <h1 className={styles.label}>
            {pending ? "等待浏览器授权…" : "使用 iGCraftLit 社区账号登录"}
          </h1>

          {auth.message ? <p className={styles.error}>{auth.message}</p> : null}
          {!auth.isShell ? (
            <p className={styles.hint}>当前为浏览器预览模式，授权流程需在桌面启动器内进行。</p>
          ) : null}
        </IGM_LauncherV2_Card>
      </main>
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_Login;
