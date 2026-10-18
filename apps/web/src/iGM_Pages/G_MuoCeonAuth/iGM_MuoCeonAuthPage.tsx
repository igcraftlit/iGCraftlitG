/**
 * 文件路径：apps/web/src/iGM_Pages/G_MuoCeonAuth/iGM_MuoCeonAuthPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/auth/muoceon（独立全屏授权中转页，豁免控制台外壳）
 * 模块：G_MuoCeonAuth
 * 作用：MuoCeon 账号授权入口页——全屏居中卡片承载品牌图标、标题、授权按钮与返回链接
 * 内容：MuoCeon 图标、标题「使用 MuoCeon 账号登录」、
 *       主按钮「前往 MuoCeon 授权」（跳转后端 /api/auth/muoceon 发起 PKCE 授权，
 *       并上报站点源 origin 与来源路径 returnTo）、
 *       辅助链接「返回 iGCraftLit 登录」、授权失败回跳提示（?error=<错误码>）
 * 说明：本页由 iGM_IsShellExemptPath 豁免，不渲染主站侧边导航/顶部栏/页脚；
 *       授权跳转使用 window.location 而非客户端路由：后端接口以 302 重定向到 MuoCeon
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_GetApiBase } from "../../iGM_Services/iGM_Config";
import { iGM_MuoCeonLogo as IGM_MuoCeonLogo } from "../../iGM_Components/iGM_MuoCeonLogo/iGM_MuoCeonLogo";
import styles from "./iGM_MuoCeonAuth.module.css";

// 核心逻辑 //
/** MuoCeon 独立授权中转页 */
export function iGM_MuoCeonAuthPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = iGM_UseLocaleRouter();
  /** 后端回调失败回跳携带的错误码（null 表示本次非失败回跳） */
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // 后端回调失败会以 ?error=<错误码> 回跳本页，用于提示用户重新发起授权
  useEffect(() => {
    setErrorCode(new URLSearchParams(window.location.search).get("error"));
  }, []);

  /**
   * 前往后端发起授权：后端生成 PKCE 参数后 302 到 MuoCeon 授权端点。
   * 同时上报站点源（origin）与来源路径（returnTo），
   * 由后端按白名单校验后决定授权结束的回跳目标，避免线上被送回 localhost。
   */
  function iGM_GoAuthorize() {
    const params = new URLSearchParams(window.location.search);
    const query = new URLSearchParams({ locale });
    query.set("origin", window.location.origin);
    const returnTo = params.get("returnTo");
    if (returnTo) query.set("returnTo", returnTo);
    window.location.assign(
      `${iGM_GetApiBase()}/api/auth/muoceon?${query.toString()}`,
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <IGM_MuoCeonLogo size={72} />
        <h1 className={styles.title}>{t("auth.muoceon.pageTitle")}</h1>
        {errorCode && (
          <p className={styles.error}>
            {t(
              errorCode === "state_invalid"
                ? "auth.muoceon.failedExpired"
                : "auth.muoceon.failed",
            )}
          </p>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          onClick={iGM_GoAuthorize}
        >
          {t("auth.muoceon.authorize")}
        </button>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => router.push("/G_Auth/login")}
        >
          {t("auth.muoceon.backToLogin")}
        </button>
      </section>
    </div>
  );
}

// 导出 //
export default iGM_MuoCeonAuthPage;
