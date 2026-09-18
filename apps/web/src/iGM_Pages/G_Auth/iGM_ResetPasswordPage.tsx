/**
 * 文件路径：apps/web/src/iGM_Pages/G_Auth/iGM_ResetPasswordPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Auth/reset-password?token=xxxx
 * 模块：G_Auth
 * 作用：密码重置页，校验邮件链接中的一次性令牌并设置新密码
 * 内容：进入时预检令牌有效性、新密码/确认密码表单、成功后引导重新登录
 * 说明：使用 useSearchParams，路由入口以 Suspense 包裹（纯静态导出要求）
 */

// 导入依赖 //
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, LoaderCircle } from "lucide-react";
import {
  iGM_ApiCheckResetToken,
  iGM_ApiResetPassword,
} from "../../iGM_Services/iGM_AuthClient";
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
type iGM_TokenState = "checking" | "invalid" | "valid";

// 核心逻辑 //
/** 重置密码页主体 */
function iGM_ResetPasswordInner() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [tokenState, setTokenState] = useState<iGM_TokenState>("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // 进入页面时预检一次性令牌
  useEffect(() => {
    let cancelled = false;
    async function iGM_Check() {
      if (!token) {
        setTokenState("invalid");
        return;
      }
      try {
        const response = await iGM_ApiCheckResetToken(token);
        if (!cancelled) {
          setTokenState(response.data?.valid ? "valid" : "invalid");
        }
      } catch {
        if (!cancelled) setTokenState("invalid");
      }
    }
    void iGM_Check();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function iGM_HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);

    if (newPassword.length < 8 || newPassword.length > 128) {
      setErrorText(t("auth.errors.passwordInvalid"));
      return;
    }
    if (newPassword !== confirm) {
      setErrorText(t("auth.errors.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      await iGM_ApiResetPassword({ token, newPassword });
      setDone(true);
      setTimeout(() => router.replace("/G_Auth/login"), 1500);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <IGM_AuthCard
      icon={KeyRound}
      title={t("auth.reset.title")}
      description={t("auth.reset.description")}
    >
      {tokenState === "checking" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "24px 0",
            color: "var(--igm-text-muted)",
            fontSize: 13,
          }}
        >
          <LoaderCircle size={16} className="igm-spin" />
          {t("auth.state.checkingToken")}
        </div>
      )}

      {tokenState === "invalid" && (
        <>
          <IGM_Alert tone="error">{t("auth.errors.resetTokenInvalid")}</IGM_Alert>
          <footer className={authStyles.authFooter}>
            <Link href="/G_Auth/forgot-password" className={authStyles.authLink}>
              {t("auth.links.requestNewReset")}
            </Link>
            <Link href="/G_Auth/login" className={authStyles.authLink}>
              {t("auth.links.backToLogin")}
            </Link>
          </footer>
        </>
      )}

      {tokenState === "valid" && !done && (
        <form className={authStyles.form} onSubmit={iGM_HandleSubmit} noValidate>
          {errorText && <IGM_Alert tone="error">{errorText}</IGM_Alert>}

          <IGM_FormField
            id="igm-reset-password"
            label={t("auth.fields.newPassword")}
            hint={t("auth.hints.password")}
          >
            <input
              id="igm-reset-password"
              className={authStyles.fieldInput}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={t("auth.fields.newPasswordPlaceholder")}
              required
              minLength={8}
              maxLength={128}
            />
          </IGM_FormField>

          <IGM_FormField
            id="igm-reset-confirm"
            label={t("auth.fields.confirmNewPassword")}
          >
            <input
              id="igm-reset-confirm"
              className={authStyles.fieldInput}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder={t("auth.fields.confirmNewPasswordPlaceholder")}
              required
              minLength={8}
              maxLength={128}
            />
          </IGM_FormField>

          <IGM_SubmitButton loading={loading}>
            {t("auth.actions.resetPassword")}
          </IGM_SubmitButton>
        </form>
      )}

      {tokenState === "valid" && done && (
        <>
          <IGM_Alert tone="success">{t("auth.messages.passwordReset")}</IGM_Alert>
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

/** 重置密码页 */
export function iGM_ResetPasswordPage() {
  // JSX 要求组件标识符首字母大写，本地 iGM_ 组件以大写别名渲染
  const IGM_ResetPasswordInner = iGM_ResetPasswordInner;
  return <IGM_ResetPasswordInner />;
}

// 导出 //
export default iGM_ResetPasswordPage;
