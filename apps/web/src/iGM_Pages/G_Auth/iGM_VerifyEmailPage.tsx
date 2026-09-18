/**
 * 文件路径：apps/web/src/iGM_Pages/G_Auth/iGM_VerifyEmailPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Auth/verify-email
 * 模块：G_Auth
 * 作用：邮箱验证码输入与校验页
 * 内容：6 位验证码输入、重新发送（60 秒冷却）、校验成功更新用户状态、
 *       需要登录，未登录自动跳转登录页
 */

// 导入依赖 //
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import {
  iGM_ApiSendVerification,
  iGM_ApiVerifyEmail,
} from "../../iGM_Services/iGM_AuthClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import {
  iGM_Alert as IGM_Alert,
  iGM_AuthCard as IGM_AuthCard,
  iGM_FormField as IGM_FormField,
  iGM_ResolveErrorText,
  iGM_SecondaryButton as IGM_SecondaryButton,
  iGM_SubmitButton as IGM_SubmitButton,
} from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import authStyles from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI.module.css";

// 类型定义 //
/** 重新发送冷却秒数 */
const iGM_ResendCooldown = 60;

// 核心逻辑 //
/** 邮箱验证页主体（需在 RequireAuth 内使用） */
function iGM_VerifyEmailInner() {
  const t = useTranslations();
  const router = useRouter();
  const { user, setUser } = iGM_UseAuth();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(user?.emailVerified ?? false);

  // 冷却倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function iGM_HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setErrorText(t("auth.errors.codeInvalid"));
      return;
    }
    setLoading(true);
    try {
      const response = await iGM_ApiVerifyEmail(code.trim());
      if (!response.data) throw new Error("auth.errors.generic");
      setUser(response.data.user);
      setVerified(true);
      setNoticeText(t("auth.messages.emailVerified"));
      setTimeout(() => router.replace("/G_Settings"), 1200);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }

  async function iGM_HandleResend() {
    setErrorText(null);
    setResending(true);
    try {
      await iGM_ApiSendVerification();
      setNoticeText(t("auth.messages.verificationSent"));
      setCooldown(iGM_ResendCooldown);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setResending(false);
    }
  }

  return (
    <IGM_AuthCard
      icon={MailCheck}
      title={t("auth.verify.title")}
      description={t("auth.verify.description")}
    >
      {verified ? (
        <>
          <IGM_Alert tone="success">{t("auth.verify.alreadyVerified")}</IGM_Alert>
          <footer className={authStyles.authFooter}>
            <Link href="/G_Settings" className={authStyles.authLink}>
              {t("auth.links.accountSettings")}
            </Link>
          </footer>
        </>
      ) : (
        <>
          {errorText && <IGM_Alert tone="error">{errorText}</IGM_Alert>}
          {noticeText && <IGM_Alert tone="success">{noticeText}</IGM_Alert>}

          <p className={authStyles.authDescription}>
            {t("auth.verify.sentTo", { email: user?.email ?? "" })}
          </p>

          <form className={authStyles.form} onSubmit={iGM_HandleSubmit} noValidate>
            <IGM_FormField id="igm-verify-code" label={t("auth.fields.code")}>
              <input
                id="igm-verify-code"
                className={`${authStyles.fieldInput} ${authStyles.codeInput}`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                required
                maxLength={6}
              />
            </IGM_FormField>

            <IGM_SubmitButton loading={loading}>
              {t("auth.actions.verify")}
            </IGM_SubmitButton>
          </form>

          <IGM_SecondaryButton onClick={iGM_HandleResend} loading={resending}>
            {cooldown > 0
              ? t("auth.actions.resendCountdown", { seconds: cooldown })
              : t("auth.actions.resend")}
          </IGM_SecondaryButton>
        </>
      )}
    </IGM_AuthCard>
  );
}

/** 邮箱验证页：登录守卫包裹 */
export function iGM_VerifyEmailPage() {
  // JSX 要求组件标识符首字母大写，本地 iGM_ 组件以大写别名渲染
  const IGM_VerifyEmailInner = iGM_VerifyEmailInner;
  return (
    <IGM_RequireAuth>
      <IGM_VerifyEmailInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_VerifyEmailPage;
