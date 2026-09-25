/**
 * 文件路径：apps/web/src/iGM_Pages/G_RootAuth/iGM_RootAuthPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Auth/login、/G_Auth/register（独立全屏风格的认证界面）
 * 模块：G_RootAuth
 * 作用：登录/注册界面——品牌视觉区 + 登录/注册同屏卡片；注册为五框向导
 * 内容：品牌区（名称/标语/简介）、登录/注册切换页签、注册向导
 *       （第一框用户名→第二框邮箱→第三框密码→第四框阅读管理规定
 *       独立界面（滚动到底解锁同意）→第五框验证码）、步骤圆点指示、
 *       每框副标题、已登录用户欢迎回执
 * 入口：根路径落地页顶部导航"登录/注册"按钮与站内各处认证链接进入
 */

// 导入依赖 //
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BookOpenText, ShieldCheck } from "lucide-react";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_StripLocalePrefix } from "../../iGM_i18n/iGM_LocalePath";
import {
  iGM_ApiLogin,
  iGM_ApiRegister,
  iGM_ApiSendVerification,
  iGM_ApiVerifyEmail,
} from "../../iGM_Services/iGM_AuthClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import {
  iGM_Alert as IGM_Alert,
  iGM_FormField as IGM_FormField,
  iGM_ResolveErrorText,
  iGM_SecondaryButton as IGM_SecondaryButton,
  iGM_SubmitButton as IGM_SubmitButton,
} from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import authStyles from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI.module.css";
import {
  iGM_ClearRegisterDraft,
  iGM_ConsumeRulesAccepted,
  iGM_LoadRegisterDraft,
  iGM_SaveRegisterDraft,
  type iGM_RulesAcceptedData,
} from "./iGM_RegisterDraft";
import styles from "./iGM_RootAuth.module.css";

// 类型定义 //
/** 注册向导总框数 */
const iGM_TotalSteps = 5;
/** 重新发送验证码冷却秒数 */
const iGM_ResendCooldown = 60;

type iGM_AuthTab = "login" | "register";

const iGM_UsernamePattern = /^[\w一-龥]{3,20}$/;
const iGM_EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface iGM_RootAuthPageProps {
  /** 进入界面时默认页签（登录深链传 login） */
  defaultTab?: iGM_AuthTab;
}

// 核心逻辑 //
/** 安全回跳地址：剥离可选语言前缀后仅接受站内 /G_ 开头路径 */
function iGM_SafeRedirect(raw: string | null): string {
  if (raw) {
    const stripped = iGM_StripLocalePrefix(raw);
    if (stripped.startsWith("/G_")) return stripped;
  }
  return "/G_Settings";
}

/** 步骤圆点指示：已完成实心、当前放大深色（与设计稿一致）、未到为灰点 */
function iGM_StepDots({ current }: { current: number }) {
  const t = useTranslations();
  const dots = [];
  for (let index = 1; index <= iGM_TotalSteps; index += 1) {
    if (index > 1) {
      dots.push(<span key={`line-${index}`} className={styles.dotLine} aria-hidden />);
    }
    dots.push(
      <span
        key={`dot-${index}`}
        className={[
          styles.dot,
          index < current ? styles.dotDone : "",
          index === current ? styles.dotActive : "",
        ].join(" ")}
        aria-hidden
      />,
    );
  }
  return (
    <div
      className={styles.dots}
      role="img"
      aria-label={t("auth.wizard.stepLabel", {
        current,
        total: iGM_TotalSteps,
      })}
    >
      {dots}
    </div>
  );
}

/** 登录面板：账号（邮箱或用户名）+ 密码，登录成功按回跳参数跳转 */
function iGM_LoginPanel({ onSwitchTab }: { onSwitchTab: () => void }) {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
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
      // 回跳地址在提交时读取：避免 useSearchParams 触发静态导出回退为 Suspense fallback
      const raw =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("redirect")
          : null;
      router.replace(iGM_SafeRedirect(raw));
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
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

        <IGM_SubmitButton loading={loading}>
          {t("auth.actions.login")}
        </IGM_SubmitButton>
      </form>

      <footer className={authStyles.authFooter}>
        <span>
          {t("auth.login.noAccount")}{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={onSwitchTab}
          >
            {t("auth.links.register")}
          </button>
        </span>
      </footer>
    </>
  );
}

/** 注册五框向导：用户名 → 邮箱 → 密码 → 跳转独立页阅读管理规定 → 验证码 */
function iGM_RegisterWizard({ onSwitchTab }: { onSwitchTab: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = iGM_UseLocaleRouter();
  const { setUser } = iGM_UseAuth();

  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [registering, setRegistering] = useState(false);
  /** 独立规定页带回的同意凭证（时间 + 检测 IP），未阅读同意前为 null */
  const [accepted, setAccepted] = useState<iGM_RulesAcceptedData | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verifiedDone, setVerifiedDone] = useState(false);

  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);

  // 重发冷却倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /* 挂载时恢复跳转规定页期间暂存的草稿与阅读同意凭证（第四框返回场景） */
  useEffect(() => {
    const draft = iGM_LoadRegisterDraft();
    if (draft) {
      setUsername(draft.username);
      setEmail(draft.email);
      setPassword(draft.password);
      setConfirm(draft.password);
      setStep(4);
    }
    const acceptedDraft = iGM_ConsumeRulesAccepted();
    if (acceptedDraft) setAccepted(acceptedDraft);
  }, []);

  /** 逐框校验，通过则前进；第四框由"同意并继续"触发注册 */
  function iGM_GoNext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);

    if (step === 1) {
      if (!iGM_UsernamePattern.test(username.trim())) {
        setErrorText(t("auth.errors.usernameInvalid"));
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!iGM_EmailPattern.test(email.trim())) {
        setErrorText(t("auth.errors.emailInvalid"));
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (password.length < 8 || password.length > 128) {
        setErrorText(t("auth.errors.passwordInvalid"));
        return;
      }
      if (password !== confirm) {
        setErrorText(t("auth.errors.passwordMismatch"));
        return;
      }
      setStep(4);
    }
  }

  /** 第四框：暂存草稿并跳转独立规定页（右侧目录阅读 + 底部同意后返回） */
  function iGM_GoViewRules() {
    iGM_SaveRegisterDraft({
      username: username.trim(),
      email: email.trim(),
      password,
    });
    router.push("/G_UserRules?from=register");
  }

  /** 第四框：已在独立页阅读同意后提交注册，成功自动登录并进入第五框验证码 */
  async function iGM_HandleAgree() {
    if (!accepted) return;
    setErrorText(null);
    setRegistering(true);
    try {
      const response = await iGM_ApiRegister({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      if (!response.data) throw new Error("auth.errors.generic");
      setUser(response.data.user);
      // 注册已完成，立即清除暂存草稿（含明文密码）
      iGM_ClearRegisterDraft();
      setNoticeText(t("auth.messages.registered"));
      setCooldown(iGM_ResendCooldown);
      setStep(5);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setRegistering(false);
    }
  }

  /** 第五框：校验 6 位验证码并完成邮箱验证，成功后进入社区 */
  async function iGM_HandleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setErrorText(t("auth.errors.codeInvalid"));
      return;
    }
    setVerifying(true);
    try {
      const response = await iGM_ApiVerifyEmail(code.trim());
      if (!response.data) throw new Error("auth.errors.generic");
      setUser(response.data.user);
      setVerifiedDone(true);
      setNoticeText(t("auth.messages.emailVerified"));
      setTimeout(() => router.replace("/G_Home"), 1200);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setVerifying(false);
    }
  }

  /** 第五框：重新发送验证码（60 秒冷却） */
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

  /** 每框副标题文案键 */
  function iGM_StepSubtitle(): string {
    return t(`auth.wizard.stepSubtitle${step}`);
  }

  return (
    <div>
      <IGM_StepDots current={step} />

      {/* 当前框副标题：与设计稿一致，圆点下居中一行（如"验证你的邮箱"） */}
      <p className={styles.stepSubtitle}>{iGM_StepSubtitle()}</p>

      <form
        className={authStyles.form}
        onSubmit={iGM_GoNext}
        noValidate
      >
        {errorText && step <= 3 && <IGM_Alert tone="error">{errorText}</IGM_Alert>}
        {noticeText && step <= 3 && (
          <IGM_Alert tone="success">{noticeText}</IGM_Alert>
        )}

        {/* 第一框：用户名 */}
        {step === 1 && (
          <>
            <IGM_FormField
              id="igm-wizard-username"
              label={t("auth.fields.username")}
              hint={t("auth.hints.username")}
            >
              <input
                id="igm-wizard-username"
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
            <IGM_SubmitButton>{t("auth.wizard.next")}</IGM_SubmitButton>
          </>
        )}

        {/* 第二框：邮箱 */}
        {step === 2 && (
          <>
            <IGM_FormField id="igm-wizard-email" label={t("auth.fields.email")}>
              <input
                id="igm-wizard-email"
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
            <IGM_SecondaryButton onClick={() => setStep(1)}>
              {t("auth.wizard.back")}
            </IGM_SecondaryButton>
            <IGM_SubmitButton>{t("auth.wizard.next")}</IGM_SubmitButton>
          </>
        )}

        {/* 第三框：密码 + 确认密码 */}
        {step === 3 && (
          <>
            <IGM_FormField
              id="igm-wizard-password"
              label={t("auth.fields.password")}
              hint={t("auth.hints.password")}
            >
              <input
                id="igm-wizard-password"
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
              id="igm-wizard-confirm"
              label={t("auth.fields.confirmPassword")}
            >
              <input
                id="igm-wizard-confirm"
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
            <IGM_SecondaryButton onClick={() => setStep(2)}>
              {t("auth.wizard.back")}
            </IGM_SecondaryButton>
            <IGM_SubmitButton>{t("auth.wizard.next")}</IGM_SubmitButton>
          </>
        )}
      </form>

      {/* 第四框：跳转独立规定页阅读（右侧目录），同意后返回本框继续注册 */}
      {step === 4 && (
        <div className={styles.step4Frame}>
          {errorText && <IGM_Alert tone="error">{errorText}</IGM_Alert>}

          <p className={styles.step4Intro}>{t("auth.wizard.step4Intro")}</p>

          <button
            type="button"
            className={styles.viewRulesButton}
            onClick={iGM_GoViewRules}
          >
            <BookOpenText size={15} strokeWidth={1.9} aria-hidden />
            {t("auth.wizard.viewRules")}
          </button>

          {accepted && (
            <IGM_Alert tone="success">
              {t("auth.wizard.acceptedInfo", {
                ip: accepted.ip || "-",
                time: new Date(accepted.at).toLocaleString(locale, {
                  hour12: false,
                }),
              })}
            </IGM_Alert>
          )}

          <div className={styles.rulesActions}>
            <IGM_SecondaryButton onClick={() => setStep(3)}>
              {t("auth.wizard.back")}
            </IGM_SecondaryButton>
            <button
              type="button"
              className={styles.agreeButton}
              disabled={!accepted || registering}
              onClick={() => void iGM_HandleAgree()}
            >
              {registering && <span className={authStyles.spinner} aria-hidden />}
              {t("auth.wizard.agreeAndContinue")}
            </button>
          </div>
        </div>
      )}

      {/* 第五框：验证码 */}
      {step === 5 && (
        <form
          className={authStyles.form}
          onSubmit={iGM_HandleVerify}
          noValidate
        >
          {errorText && <IGM_Alert tone="error">{errorText}</IGM_Alert>}

          {/* 已向该邮箱发送验证码提示横幅（注册成功提示并入此条，不重复展示） */}
          <p className={styles.sentBanner}>
            <ShieldCheck size={15} strokeWidth={1.8} aria-hidden />
            <span>
              {t("auth.wizard.codeSentTo", { email: email.trim() })}
            </span>
          </p>

          {verifiedDone ? (
            <IGM_Alert tone="success">
              {t("auth.messages.emailVerified")}
            </IGM_Alert>
          ) : (
            <>
              <IGM_FormField id="igm-wizard-code" label={t("auth.fields.code")}>
                <input
                  id="igm-wizard-code"
                  className={`${authStyles.fieldInput} ${authStyles.codeInput}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder={t("auth.wizard.codePlaceholder")}
                  required
                  maxLength={6}
                />
              </IGM_FormField>

              <IGM_SubmitButton loading={verifying}>
                {t("auth.wizard.verify")}
              </IGM_SubmitButton>
            </>
          )}

          <footer className={styles.wizardFooter}>
            {!verifiedDone && (
              <span className={styles.footerRow}>
                <button
                  type="button"
                  className={styles.linkButton}
                  disabled={resending || cooldown > 0}
                  onClick={() => void iGM_HandleResend()}
                >
                  {resending && (
                    <span className={authStyles.spinner} aria-hidden />
                  )}
                  {cooldown > 0
                    ? t("auth.actions.resendCountdown", { seconds: cooldown })
                    : t("auth.actions.resend")}
                </button>
                <span className={styles.footerDivider} aria-hidden>
                  ←
                </span>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setNoticeText(null);
                    setErrorText(null);
                    setStep(1);
                  }}
                >
                  {t("auth.wizard.backToEdit")}
                </button>
              </span>
            )}
            <span className={styles.footerRow}>
              {t("auth.register.hasAccount")}{" "}
              <button
                type="button"
                className={styles.linkButton}
                onClick={onSwitchTab}
              >
                {t("auth.links.login")}
              </button>
            </span>
          </footer>
        </form>
      )}
    </div>
  );
}

/** 路由首界面：品牌区 + 登录/注册同屏卡片 */
// JSX 要求组件标识符首字母大写，本文件内部 iGM_ 组件以大写别名渲染
const IGM_StepDots = iGM_StepDots;
const IGM_RegisterWizard = iGM_RegisterWizard;
const IGM_LoginPanel = iGM_LoginPanel;

export function iGM_RootAuthPage({
  defaultTab = "register",
}: iGM_RootAuthPageProps) {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const { user } = iGM_UseAuth();
  const [tab, setTab] = useState<iGM_AuthTab>(defaultTab);

  return (
    <div className={styles.page}>
      {/* 品牌区：名称 / 标语 / 简介 */}
      <header className={styles.brand}>
        <p className={`${styles.brandName} igm-font-brand`}>
          {t("landing.brand")}
        </p>
        <p className={styles.slogan}>{t("landing.hero.slogan")}</p>
        <p className={styles.description}>{t("landing.hero.description")}</p>
      </header>

      {/* 登录/注册卡片 */}
      <section className={styles.card}>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            className={`${styles.tab} ${tab === "register" ? styles.tabActive : ""}`}
            onClick={() => setTab("register")}
          >
            {t("auth.register.title")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            className={`${styles.tab} ${tab === "login" ? styles.tabActive : ""}`}
            onClick={() => setTab("login")}
          >
            {t("auth.login.title")}
          </button>
        </div>

        {/* 已登录提示：可直接进入社区 */}
        {user && (
          <p className={styles.welcomeBack}>
            {t("auth.wizard.welcomeBack", { name: user.username })}{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => router.replace("/G_Home")}
            >
              {t("home.cardCommunityTitle")}
            </button>
          </p>
        )}

        {tab === "register" ? (
          <IGM_RegisterWizard onSwitchTab={() => setTab("login")} />
        ) : (
          <IGM_LoginPanel onSwitchTab={() => setTab("register")} />
        )}
      </section>
    </div>
  );
}

// 导出 //
export default iGM_RootAuthPage;
