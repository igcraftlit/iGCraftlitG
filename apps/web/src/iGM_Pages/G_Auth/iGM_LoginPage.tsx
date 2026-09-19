/**
 * 文件路径：apps/web/src/iGM_Pages/G_Auth/iGM_LoginPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Auth/login
 * 模块：G_Auth
 * 作用：登录页，支持邮箱或用户名登录
 * 内容：账号密码表单、提交加载、错误本地化提示、登录成功按回跳参数跳转
 */

// 导入依赖 //
"use client";

import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { useState, type FormEvent } from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { useSearchParams } from "next/navigation";
import { iGM_StripLocalePrefix } from "../../iGM_i18n/iGM_LocalePath";
import { useTranslations } from "next-intl";
import { LogIn } from "lucide-react";
import { iGM_ApiLogin } from "../../iGM_Services/iGM_AuthClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import {
  iGM_Alert as IGM_Alert,
  iGM_AuthCard as IGM_AuthCard,
  iGM_FormField as IGM_FormField,
  iGM_ResolveErrorText,
  iGM_SubmitButton as IGM_SubmitButton,
} from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import authStyles from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI.module.css";

// 类型定义 //
// （本页无自定义属性）

// 核心逻辑 //
/** 安全回跳地址：剥离可选语言前缀后仅接受站内 /G_ 开头路径，避免开放重定向 */
function iGM_SafeRedirect(raw: string | null): string {
  if (raw) {
    const stripped = iGM_StripLocalePrefix(raw);
    if (stripped.startsWith("/G_")) return stripped;
  }
  return "/G_Settings";
}

/** 登录页 */
export function iGM_LoginPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const { setUser } = iGM_UseAuth();

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function iGM_HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);
    setLoading(true);
    try {
      const response = await iGM_ApiLogin({
        account: account.trim(),
        password,
      });
      if (!response.data) throw new Error("auth.errors.generic");
      setUser(response.data.user);
      router.replace(iGM_SafeRedirect(searchParams.get("redirect")));
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <IGM_AuthCard icon={LogIn} title={t("auth.login.title")} description={t("auth.login.description")}>
      <form className={authStyles.form} onSubmit={iGM_HandleSubmit} noValidate>
        {errorText && <IGM_Alert tone="error">{errorText}</IGM_Alert>}

        <IGM_FormField id="igm-login-account" label={t("auth.fields.account")}>
          <input
            id="igm-login-account"
            className={authStyles.fieldInput}
            type="text"
            autoComplete="username"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            placeholder={t("auth.fields.accountPlaceholder")}
            required
            maxLength={128}
          />
        </IGM_FormField>

        <IGM_FormField id="igm-login-password" label={t("auth.fields.password")}>
          <input
            id="igm-login-password"
            className={authStyles.fieldInput}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("auth.fields.passwordPlaceholder")}
            required
          />
        </IGM_FormField>

        <IGM_SubmitButton loading={loading}>{t("auth.actions.login")}</IGM_SubmitButton>
      </form>

      <footer className={authStyles.authFooter}>
        <Link href="/G_Auth/forgot-password" className={authStyles.authLink}>
          {t("auth.links.forgotPassword")}
        </Link>
        <span>
          {t("auth.login.noAccount")}{" "}
          <Link href="/G_Auth/register" className={authStyles.authLink}>
            {t("auth.links.register")}
          </Link>
        </span>
      </footer>
    </IGM_AuthCard>
  );
}

// 导出 //
export default iGM_LoginPage;
