/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Login/iGM_LauncherV2_Login.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Login
 * 模块：iGM_LauncherV2_Login
 * 作用：启动器登录页（社区账号授权 或 游客模式）
 * 内容：卡片中央保留星标入口（image/ig.png，64x64），图标本身即社区授权按钮；
 *       本地存在历史社区账号记录时，额外展示该账号头像与昵称，并提供
 *       【一键登录社区账号】按钮，直接复用长效令牌恢复登录态而无需重新授权；
 *       另提供【游客登录（跳过社区账号）】入口，点击后先弹出二次确认，
 *       明确告知游客数据仅存本机、无法云同步，用户确认后才进入主界面；
 *       已接入多语言（next-intl，命名空间 login）
 * 说明：桌面端为公开客户端，全程不传输 client_secret，仅使用 PKCE（S256）；
 *       本页不提供账号密码表单与注册入口
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { iGM_LauncherV2_AppearanceHost as IGM_LauncherV2_AppearanceHost } from "@/components/iGM_LauncherV2_AppearanceHost/iGM_LauncherV2_AppearanceHost";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
  iGM_LauncherV2_WindowChrome as IGM_LauncherV2_WindowChrome,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_Navigate,
  iGM_LauncherV2_UseAuth as IGM_LauncherV2_UseAuth,
  iGM_LauncherV2_UseRememberedAccount as IGM_LauncherV2_UseRememberedAccount,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import { IGM_LAUNCHERV2_APP_NAME } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_Login.module.css";

// 类型定义 //
/* （无外部入参） */

// 核心逻辑 //

/** 历史账号头像：地址为空或加载失败时回退到 lucide 默认头像，避免出现破损图片 */
function IGM_LauncherV2_RememberedAvatar({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <UserRound size={22} strokeWidth={2.2} className={styles.rememberedAvatar} aria-label={alt} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={48}
      height={48}
      className={styles.rememberedAvatar}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

export function iGM_LauncherV2_Login() {
  const t = useTranslations();
  const auth = IGM_LauncherV2_UseAuth();
  const remembered = IGM_LauncherV2_UseRememberedAccount();
  const [guestPrompt, setGuestPrompt] = useState(false);

  // 授权成功：平滑过渡到主界面（含历史账号一键登录成功的场景）
  useEffect(() => {
    if (auth.state === "logged-in") iGM_LauncherV2_Navigate("/G_Main");
  }, [auth.state]);

  const pending = auth.state === "pending" || auth.state === "logged-in";

  return (
    <div className={`igm-screen igm-page ${styles.screen}`}>
      <IGM_LauncherV2_AppearanceHost />
      <IGM_LauncherV2_WindowChrome label={IGM_LAUNCHERV2_APP_NAME} version={t("login.windowVersion")} />

      <main className={styles.main}>
        <IGM_LauncherV2_Card className={styles.panel}>
          {/* 社区授权入口：星标图标本身即按钮，点击直接触发社区授权 */}
          <button
            type="button"
            className={styles.entry}
            aria-label={t("login.signIn")}
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
            {pending ? t("login.pending") : t("login.signIn")}
          </h1>

          {/* 历史社区账号：本地存在长效令牌记录时展示头像与昵称，支持一键恢复登录态 */}
          {remembered.user ? (
            <div className={styles.remembered}>
              <IGM_LauncherV2_RememberedAvatar
                src={remembered.user.avatar}
                alt={t("login.avatarAlt", { name: remembered.user.nickname })}
              />
              <div className={styles.rememberedText}>
                <span className={styles.rememberedName}>{remembered.user.nickname}</span>
                <span className={styles.rememberedId}>{t("login.rememberedLast")}</span>
              </div>
              <button
                type="button"
                className={styles.quickLogin}
                disabled={pending}
                onClick={() => remembered.quickLogin()}
              >
                {t("login.quickLogin")}
              </button>
            </div>
          ) : null}

          {/* 游客入口：点击先弹二次确认，明确告知游客数据仅存本机 */}
          <button
            type="button"
            className={styles.guest}
            disabled={pending}
            onClick={() => setGuestPrompt(true)}
          >
            {t("login.guest")}
          </button>

          {auth.state === "logged-out" && auth.message ? (
            <p className={styles.error}>{auth.message}</p>
          ) : null}
          {!auth.isShell ? (
            <p className={styles.hint}>{t("login.browserPreviewHint")}</p>
          ) : null}
        </IGM_LauncherV2_Card>
      </main>

      {/* 游客登录二次确认：确认后才进入主界面，避免用户误以为游客数据可云同步 */}
      {guestPrompt ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setGuestPrompt(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={t("login.guestModal.aria")}
            onClick={(event) => event.stopPropagation()}
          >
            <p className={styles.modalTitle}>{t("login.guestModal.title")}</p>
            <p className={styles.modalText}>{t("login.guestModal.text")}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setGuestPrompt(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() => {
                  setGuestPrompt(false);
                  iGM_LauncherV2_Navigate("/G_Main");
                }}
              >
                {t("login.continue")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_Login;
