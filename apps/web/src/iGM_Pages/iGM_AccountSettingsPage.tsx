/**
 * 文件路径：apps/web/src/iGM_Pages/iGM_AccountSettingsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Settings
 * 模块：G_Settings / G_Auth
 * 作用：账户设置页，展示账户信息、邮箱验证状态、修改密码与登出
 * 内容：账户信息列表、角色/状态徽标、未验证提醒、修改密码表单、登出按钮
 * 说明：需要登录，由 iGM_RequireAuth 守卫；
 *       修改密码的当前密码为可选项——不填时需先向本人邮箱索取验证码完成身份验证
 */

// 导入依赖 //
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  KeyRound,
  LogOut,
  MailWarning,
  Settings,
  UserRound,
} from "lucide-react";
import { iGM_UseAuth } from "../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocale } from "../iGM_Providers/iGM_LocaleProvider";
import {
  iGM_ApiChangePassword,
  iGM_ApiSendPasswordChangeCode,
} from "../iGM_Services/iGM_AuthClient";
import type { iGM_UserRole } from "../iGM_Services/iGM_AuthClient";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_RequireAuth as IGM_RequireAuth } from "../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import {
  iGM_Alert as IGM_Alert,
  iGM_FormField as IGM_FormField,
  iGM_ResolveErrorText,
  iGM_SecondaryButton as IGM_SecondaryButton,
  iGM_SubmitButton as IGM_SubmitButton,
} from "../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import authStyles from "../iGM_Components/iGM_AuthUI/iGM_AuthUI.module.css";
import pageStyles from "./iGM_Page.module.css";

// 类型定义 //
/** 角色徽标样式映射 */
const iGM_RoleBadgeClass: Record<iGM_UserRole, string> = {
  user: authStyles.badge,
  moderator: authStyles.badgeAccent,
  admin: authStyles.badgeAccent,
};

/** 发送修改密码验证码的冷却秒数 */
const iGM_CodeCooldown = 60;

// 核心逻辑 //
/** 账户设置页主体（在登录守卫内） */
function iGM_AccountSettingsInner() {
  const t = useTranslations();
  const router = useRouter();
  const { locale } = iGM_UseLocale();
  const { user, logout, refresh } = iGM_UseAuth();

  const [oldPassword, setOldPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [codeNotice, setCodeNotice] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  // 验证码发送冷却倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!user) return null;

  /** 发送修改密码验证码至本人邮箱（60 秒冷却内忽略重复点击） */
  async function iGM_HandleSendCode() {
    if (sendingCode || cooldown > 0) return;
    setErrorText(null);
    setCodeNotice(null);
    setSendingCode(true);
    try {
      await iGM_ApiSendPasswordChangeCode();
      setCodeNotice(
        t("auth.settings.changeCodeSent", { email: user?.email ?? "" }),
      );
      setCooldown(iGM_CodeCooldown);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSendingCode(false);
    }
  }

  async function iGM_HandleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);
    setSuccessText(null);

    if (newPassword.length < 8 || newPassword.length > 128) {
      setErrorText(t("auth.errors.passwordInvalid"));
      return;
    }
    if (newPassword !== confirm) {
      setErrorText(t("auth.errors.passwordMismatch"));
      return;
    }
    // 当前密码缺省时必须携带邮箱验证码
    const trimmedCode = emailCode.trim();
    if (!oldPassword && !/^\d{6}$/.test(trimmedCode)) {
      setErrorText(t("auth.errors.emailCodeRequired"));
      return;
    }

    setLoading(true);
    try {
      await iGM_ApiChangePassword({
        oldPassword: oldPassword || undefined,
        newPassword,
        emailCode: oldPassword ? undefined : trimmedCode,
      });
      setSuccessText(t("auth.messages.passwordChanged"));
      setOldPassword("");
      setEmailCode("");
      setNewPassword("");
      setConfirm("");
      setCodeNotice(null);
      setCooldown(0);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }

  async function iGM_HandleLogout() {
    setLoggingOut(true);
    await logout();
    router.replace("/G_Auth/login");
  }

  const createdAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(user.createdAt));

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Settings size={22} strokeWidth={1.8} />
          </span>
          {t("auth.settings.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("auth.settings.description")}
        </p>
      </header>

      <div className={authStyles.authWrap} style={{ padding: 0, display: "block" }}>
        <section className={`${authStyles.authCard} ${authStyles.authCardWide}`}>
          {/* 账户信息 */}
          <div className={authStyles.settingsSection}>
            <h2 className={authStyles.settingsSectionTitle}>
              <span className={authStyles.settingsSectionIcon}>
                <UserRound size={16} strokeWidth={1.8} />
              </span>
              {t("auth.settings.accountInfo")}
            </h2>

            {!user.emailVerified && (
              <IGM_Alert tone="error">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <MailWarning size={15} strokeWidth={2} />
                  {t("auth.settings.unverifiedHint")}{" "}
                  <Link href="/G_Auth/verify-email" className={authStyles.authLink}>
                    {t("auth.links.verifyNow")}
                  </Link>
                </span>
              </IGM_Alert>
            )}

            <div className={authStyles.infoList}>
              <div className={authStyles.infoRow}>
                <span className={authStyles.infoLabel}>{t("auth.fields.username")}</span>
                <span className={authStyles.infoValue}>{user.username}</span>
              </div>
              <div className={authStyles.infoRow}>
                <span className={authStyles.infoLabel}>{t("auth.fields.email")}</span>
                <span className={authStyles.infoValue}>
                  {user.email}
                  {user.emailVerified && (
                    <BadgeCheck
                      size={14}
                      strokeWidth={2}
                      color="var(--igm-success)"
                      style={{ marginLeft: 6, verticalAlign: "-2px" }}
                      aria-label={t("auth.settings.verified")}
                    />
                  )}
                </span>
              </div>
              <div className={authStyles.infoRow}>
                <span className={authStyles.infoLabel}>{t("auth.settings.role")}</span>
                <span className={`${authStyles.badge} ${iGM_RoleBadgeClass[user.role]}`}>
                  {t(`auth.roles.${user.role}`)}
                </span>
              </div>
              <div className={authStyles.infoRow}>
                <span className={authStyles.infoLabel}>{t("auth.settings.status")}</span>
                <span
                  className={`${authStyles.badge} ${
                    user.status === "active" ? authStyles.badgeSuccess : authStyles.badgeDanger
                  }`}
                >
                  {t(`auth.status.${user.status}`)}
                </span>
              </div>
              <div className={authStyles.infoRow}>
                <span className={authStyles.infoLabel}>
                  {t("auth.settings.emailVerified")}
                </span>
                <span
                  className={`${authStyles.badge} ${
                    user.emailVerified ? authStyles.badgeSuccess : authStyles.badge
                  }`}
                >
                  {user.emailVerified
                    ? t("auth.settings.verified")
                    : t("auth.settings.unverified")}
                </span>
              </div>
              <div className={authStyles.infoRow}>
                <span className={authStyles.infoLabel}>{t("auth.settings.joinedAt")}</span>
                <span className={authStyles.infoValue}>{createdAt}</span>
              </div>
            </div>
          </div>

          <hr className={authStyles.divider} />

          {/* 修改密码 */}
          <div className={authStyles.settingsSection}>
            <h2 className={authStyles.settingsSectionTitle}>
              <span className={authStyles.settingsSectionIcon}>
                <KeyRound size={16} strokeWidth={1.8} />
              </span>
              {t("auth.settings.changePassword")}
            </h2>

            <form
              className={authStyles.form}
              onSubmit={iGM_HandleChangePassword}
              noValidate
            >
              {errorText && <IGM_Alert tone="error">{errorText}</IGM_Alert>}
              {successText && <IGM_Alert tone="success">{successText}</IGM_Alert>}
              {codeNotice && <IGM_Alert tone="success">{codeNotice}</IGM_Alert>}

              <IGM_FormField
                id="igm-settings-old-password"
                label={t("auth.fields.oldPassword")}
                hint={t("auth.settings.oldPasswordHint")}
              >
                <input
                  id="igm-settings-old-password"
                  className={authStyles.fieldInput}
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  maxLength={128}
                />
              </IGM_FormField>

              <IGM_FormField
                id="igm-settings-email-code"
                label={t("auth.fields.code")}
                hint={t("auth.settings.emailCodeHint")}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "stretch",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    id="igm-settings-email-code"
                    className={`${authStyles.fieldInput} ${authStyles.codeInput}`}
                    style={{ flex: "1 1 140px" }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={emailCode}
                    onChange={(event) =>
                      setEmailCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    placeholder="000000"
                    maxLength={6}
                  />
                  <IGM_SecondaryButton
                    onClick={() => void iGM_HandleSendCode()}
                    loading={sendingCode}
                  >
                    {cooldown > 0
                      ? t("auth.actions.resendCountdown", { seconds: cooldown })
                      : t("auth.settings.sendChangeCode")}
                  </IGM_SecondaryButton>
                </div>
              </IGM_FormField>

              <IGM_FormField
                id="igm-settings-new-password"
                label={t("auth.fields.newPassword")}
                hint={t("auth.hints.password")}
              >
                <input
                  id="igm-settings-new-password"
                  className={authStyles.fieldInput}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                />
              </IGM_FormField>

              <IGM_FormField
                id="igm-settings-confirm-password"
                label={t("auth.fields.confirmNewPassword")}
              >
                <input
                  id="igm-settings-confirm-password"
                  className={authStyles.fieldInput}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                />
              </IGM_FormField>

              <IGM_SubmitButton loading={loading}>
                {t("auth.actions.changePassword")}
              </IGM_SubmitButton>
            </form>
          </div>

          <hr className={authStyles.divider} />

          {/* 登出 */}
          <div className={authStyles.settingsSection}>
            <IGM_SecondaryButton onClick={iGM_HandleLogout} loading={loggingOut}>
              <LogOut size={15} strokeWidth={1.8} />
              {t("auth.actions.logout")}
            </IGM_SecondaryButton>
            <button
              type="button"
              onClick={() => void refresh()}
              className={authStyles.authLink}
              style={{ background: "none", padding: 0, alignSelf: "flex-start" }}
            >
              {t("auth.settings.refreshSession")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** 账户设置页：登录守卫包裹 */
export function iGM_AccountSettingsPage() {
  // JSX 要求组件标识符首字母大写，本地 iGM_ 组件以大写别名渲染
  const IGM_AccountSettingsInner = iGM_AccountSettingsInner;
  return (
    <IGM_RequireAuth>
      <IGM_AccountSettingsInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AccountSettingsPage;
