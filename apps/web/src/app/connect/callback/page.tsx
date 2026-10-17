/**
 * 文件路径：apps/web/src/app/connect/callback/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/connect/callback（MuoCeon 已登记的生产回调地址，独立于语言前缀）
 * 模块：G_MuoCeonCallback
 * 作用：MuoCeon 授权回跳中转页——把 code 与 state 转交后端换取主站会话
 * 内容：读取地址栏 code/state 后整页跳转后端 /api/auth/muoceon/callback；
 *       缺少参数时回退站内首页；跳转期间显示极简品牌过渡界面
 * 说明：主站前端为 Cloudflare Pages 静态站点（igcraftlit.com），
 *       后端位于 api 子域（隧道映射本机 3001），故回调须由本页转交后端；
 *       采用整页跳转而非 fetch：后端以 302 重定向 + Set-Cookie 写入登录态；
 *       本页不属于语言路由段，无 next-intl Provider，文案取自语言 Cookie
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { iGM_GetApiBase } from "../../../iGM_Services/iGM_Config";
import { iGM_ReadLocaleCookieValue } from "../../../iGM_i18n/iGM_LocalePath";
import { iGM_MuoCeonLogo as IGM_MuoCeonLogo } from "../../../iGM_Components/iGM_MuoCeonLogo/iGM_MuoCeonLogo";
import styles from "./iGM_MuoCeonCallback.module.css";

// 类型定义 //
/** 过渡提示文案：按语言 Cookie 轻量切换，缺省回退简体中文 */
const iGM_CallbackText: Record<string, string> = {
  "zh-CN": "正在完成 MuoCeon 授权…",
  "zh-TW": "正在完成 MuoCeon 授權…",
  en: "Completing MuoCeon authorization…",
  ja: "MuoCeon の認可を完了しています…",
  ru: "Завершение авторизации MuoCeon…",
};

// 核心逻辑 //
/** MuoCeon 授权回跳中转页 */
export default function G_MuoCeonCallbackPage() {
  const [text, setText] = useState("");

  useEffect(() => {
    const locale = iGM_ReadLocaleCookieValue();
    setText(iGM_CallbackText[locale ?? ""] ?? iGM_CallbackText["zh-CN"]);

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    // 缺少 code/state：直接回退站内首页，避免停留在空白中转页
    if (!code || !state) {
      window.location.replace("/");
      return;
    }
    const target =
      `${iGM_GetApiBase()}/api/auth/muoceon/callback` +
      `?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    window.location.replace(target);
  }, []);

  return (
    <main className={styles.page}>
      <IGM_MuoCeonLogo size={56} />
      <p className={styles.text}>{text}</p>
    </main>
  );
}
