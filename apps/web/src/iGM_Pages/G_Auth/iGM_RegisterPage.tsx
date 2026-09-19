/**
 * 文件路径：apps/web/src/iGM_Pages/G_Auth/iGM_RegisterPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Auth/register
 * 模块：G_Auth
 * 作用：注册页，创建普通用户账号
 * 内容：用户名/邮箱/密码/确认密码表单、前端格式校验、
 *       注册成功自动登录并跳转邮箱验证页
 */

// 导入依赖 //
"use client";

import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { useState, type FormEvent } from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";

import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { iGM_ApiRegister } from "../../iGM_Services/iGM_AuthClient";
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
const iGM_UsernamePattern = /^[\w一-龥]{3,20}$/;
const iGM_EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 核心逻辑 //
/** 注册页 */
export function iGM_RegisterPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const { setUser } = iGM_UseAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 提交前的前端格式校验，返回首个错误文案键 */
  function iGM_Validate(): string | null {
    if (!iGM_UsernamePattern.test(username.trim())) {
      return "auth.errors.usernameInvalid";
    }
    if (!iGM_EmailPattern.test(email.trim())) {
      return "auth.errors.emailInvalid";
    }
    if (password.length < 8 || password.length > 128) {
      return "auth.errors.passwordInvalid";
    }
    if (password !== confirm) {
      return "auth.errors.passwordMismatch";
    }
    return null;
  }

  async function iGM_HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);

    const validationError = iGM_Validate();
    if (validationError) {
      setErrorText(t(validationError));
      return;
    }

    setLoading(true);
    try {
      const response = await iGM_ApiRegister({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      if (!response.data) throw new Error("auth.errors.generic");
      setUser(response.data.user);
      // 注册后进入邮箱验证页；若邮件发送失败页面会提示重发
      router.replace("/G_Auth/verify-email");
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <IGM_AuthCard
      icon={UserPlus}
      title={t("auth.register.title")}
      description={t("auth.register.description")}
    >
      <form className={authStyles.form} onSubmit={iGM_HandleSubmit} noValidate>
        {errorText && <IGM_Alert tone="error">{errorText}</IGM_Alert>}

        <IGM_FormField
          id="igm-register-username"
          label={t("auth.fields.username")}
          hint={t("auth.hints.username")}
        >
          <input
            id="igm-register-username"
            className={authStyles.fieldInput}
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={t("auth.fields.usernamePlaceholder")}
            required
            maxLength={20}
          />
        </IGM_FormField>

        <IGM_FormField id="igm-register-email" label={t("auth.fields.email")}>
          <input
            id="igm-register-email"
            className={authStyles.fieldInput}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("auth.fields.emailPlaceholder")}
            required
            maxLength={128}
          />
        </IGM_FormField>

        <IGM_FormField
          id="igm-register-password"
          label={t("auth.fields.password")}
          hint={t("auth.hints.password")}
        >
          <input
            id="igm-register-password"
            className={authStyles.fieldInput}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("auth.fields.passwordPlaceholder")}
            required
            minLength={8}
            maxLength={128}
          />
        </IGM_FormField>

        <IGM_FormField
          id="igm-register-confirm"
          label={t("auth.fields.confirmPassword")}
        >
          <input
            id="igm-register-confirm"
            className={authStyles.fieldInput}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={t("auth.fields.confirmPasswordPlaceholder")}
            required
            minLength={8}
            maxLength={128}
          />
        </IGM_FormField>

        <IGM_SubmitButton loading={loading}>
          {t("auth.actions.register")}
        </IGM_SubmitButton>
      </form>

      <footer className={authStyles.authFooter}>
        <span>
          {t("auth.register.hasAccount")}{" "}
          <Link href="/G_Auth/login" className={authStyles.authLink}>
            {t("auth.links.login")}
          </Link>
        </span>
      </footer>
    </IGM_AuthCard>
  );
}

// 导出 //
export default iGM_RegisterPage;
