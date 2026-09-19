/**
 * 文件路径：apps/web/src/iGM_Pages/G_Auth/iGM_ForgotPasswordPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Auth/forgot-password
 * 模块：G_Auth
 * 作用：忘记密码页，提交邮箱后由后端发送一次性重置链接
 * 内容：邮箱表单、提交后统一成功提示（不泄露邮箱是否注册）
 */

// 导入依赖 //
"use client";

import { useState, type FormEvent } from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { useTranslations } from "next-intl";
import { MailQuestion } from "lucide-react";
import { iGM_ApiForgotPassword } from "../../iGM_Services/iGM_AuthClient";
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
const iGM_EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 核心逻辑 //
/** 忘记密码页 */
export function iGM_ForgotPasswordPage() {
  const t = useTranslations();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function iGM_HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);

    if (!iGM_EmailPattern.test(email.trim())) {
      setErrorText(t("auth.errors.emailInvalid"));
      return;
    }

    setLoading(true);
    try {
      await iGM_ApiForgotPassword(email.trim());
      // 无论邮箱是否存在都展示相同提示，防止账号枚举
      setSent(true);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <IGM_AuthCard
      icon={MailQuestion}
      title={t("auth.forgot.title")}
      description={t("auth.forgot.description")}
    >
      {sent ? (
        <>
          <IGM_Alert tone="success">{t("auth.forgot.sentHint")}</IGM_Alert>
          <footer className={authStyles.authFooter}>
            <Link href="/G_Auth/login" className={authStyles.authLink}>
              {t("auth.links.backToLogin")}
            </Link>
          </footer>
        </>
      ) : (
        <>
          <form className={authStyles.form} onSubmit={iGM_HandleSubmit} noValidate>
            {errorText && <IGM_Alert tone="error">{errorText}</IGM_Alert>}

            <IGM_FormField
              id="igm-forgot-email"
              label={t("auth.fields.email")}
            >
              <input
                id="igm-forgot-email"
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

            <IGM_SubmitButton loading={loading}>
              {t("auth.actions.sendResetMail")}
            </IGM_SubmitButton>
          </form>

          <footer className={authStyles.authFooter}>
            <Link href="/G_Auth/login" className={authStyles.authLink}>
              {t("auth.links.backToLogin")}
            </Link>
          </footer>
        </>
      )}
    </IGM_AuthCard>
  );
}

// 导出 //
export default iGM_ForgotPasswordPage;
