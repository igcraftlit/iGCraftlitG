/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_OAuthApply/iGM_CLI_OAuthApply.tsx
 * 所属层：前端 / 组件层
 * 路由：/oauth/apply
 * 模块：iGM_CLI_OAuthApply
 * 作用：OAuth 2.0 / OIDC 第三方接入应用申请表单
 * 内容：应用名称与类型、描述、回调地址（HTTPS，多条）、申请 scope、用途、
 *       联系方式、接入规范勾选、提交与取消；提交成功展示待审核提示与跳转「我的应用」
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import {
  iGM_CLI_ApiSubmitOAuthApply,
  iGM_CLI_OAuthClientTypeOptions,
  iGM_CLI_OAuthScopeOptions,
  iGM_CLI_ResolveErrorText,
  type iGM_CLI_OAuthClientType,
} from "../../services/iGM_CLI_OAuthClient";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import { iGM_CLI_OAuthShell as IGM_CLI_OAuthShell } from "../iGM_CLI_OAuthShell/iGM_CLI_OAuthShell";
import { iGM_CLI_OAuthGate as IGM_CLI_OAuthGate } from "../iGM_CLI_OAuthShell/iGM_CLI_OAuthGate";
import styles from "../iGM_CLI_OAuthShell/iGM_CLI_OAuth.module.css";

// 类型定义 //
/** 回调地址逐行 / 逗号输入解析（去空行） */
function iGM_CLI_ParseRedirectUris(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 本地回环回调地址（http://localhost / 127.0.0.1 / [::1]，端口任意） */
function iGM_CLI_IsLocalRedirect(uri: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(uri);
}

// 核心逻辑 //
/** 申请表单主体（登录守卫内） */
function iGM_CLI_OAuthApplyForm() {
  const t = useTranslations();
  const { locale } = iGM_CLI_UseLocale();

  const [name, setName] = useState("");
  const [type, setType] = useState<iGM_CLI_OAuthClientType>("web");
  const [description, setDescription] = useState("");
  const [redirectRaw, setRedirectRaw] = useState("");
  const [scopes, setScopes] = useState<string[]>(["openid", "profile"]);
  const [purpose, setPurpose] = useState("");
  const [contact, setContact] = useState("");
  const [agreeRules, setAgreeRules] = useState(false);
  const [localTest, setLocalTest] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  /** 勾选 / 取消某个 scope（openid 为必选基础项，不可取消） */
  function iGM_CLI_ToggleScope(scope: string) {
    if (scope === "openid") return;
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  }

  /** 提交申请 */
  function iGM_CLI_HandleSubmit() {
    setError(null);
    const redirectUris = iGM_CLI_ParseRedirectUris(redirectRaw);
    if (
      name.trim().length === 0 ||
      description.trim().length === 0 ||
      purpose.trim().length === 0 ||
      contact.trim().length === 0
    ) {
      setError(t("oauth.apply.required"));
      return;
    }
    if (redirectUris.length === 0) {
      setError(t("oauth.apply.redirectRequired"));
      return;
    }
    // 非 HTTPS 仅允许本地回环地址（localhost / 127.0.0.1 / [::1]）
    if (
      redirectUris.some(
        (uri) => !/^https:\/\//i.test(uri) && !iGM_CLI_IsLocalRedirect(uri),
      )
    ) {
      setError(t("oauth.apply.redirectInsecure"));
      return;
    }
    // 使用本地回环回调地址时必须勾选「本地测试用途」
    if (redirectUris.some(iGM_CLI_IsLocalRedirect) && !localTest) {
      setError(t("oauth.errors.localTestRequired"));
      return;
    }
    if (!agreeRules) {
      setError(t("oauth.apply.rulesRequired"));
      return;
    }

    setSubmitting(true);
    iGM_CLI_ApiSubmitOAuthApply({
      name: name.trim(),
      type,
      description: description.trim(),
      redirectUris,
      scopes,
      purpose: purpose.trim(),
      contact: contact.trim(),
      agreeRules,
      localTest,
    })
      .then(() => setSubmitted(true))
      .catch((submitError: unknown) =>
        setError(
          iGM_CLI_ResolveErrorText(t, submitError, "oauth.apply.failed"),
        ),
      )
      .finally(() => setSubmitting(false));
  }

  if (submitted) {
    return (
      <div className={styles.statusCard}>
        <p className={styles.statusText}>{t("oauth.apply.submittedNotice")}</p>
        <div className={styles.actionRow} style={{ marginTop: 16 }}>
          <Link
            href={iGM_CLI_LocalePath("/oauth/apps", locale)}
            className={styles.primaryButton}
          >
            {t("oauth.apply.viewApps")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.note}>
        <ShieldCheck size={15} strokeWidth={1.8} className={styles.noteIcon} aria-hidden />
        <span>{t("oauth.apply.reviewHint")}</span>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>{t("oauth.apply.name")}</span>
        <input
          className={styles.input}
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("oauth.apply.namePlaceholder")}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t("oauth.apply.type")}</span>
        <select
          className={styles.select}
          value={type}
          onChange={(event) =>
            setType(event.target.value as iGM_CLI_OAuthClientType)
          }
        >
          {iGM_CLI_OAuthClientTypeOptions.map((option) => (
            <option key={option} value={option}>
              {t(`oauth.clientTypes.${option}`)}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t("oauth.apply.description")}</span>
        <textarea
          className={styles.textarea}
          value={description}
          maxLength={1000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("oauth.apply.descriptionPlaceholder")}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t("oauth.apply.redirectUris")}</span>
        <textarea
          className={styles.textarea}
          value={redirectRaw}
          onChange={(event) => setRedirectRaw(event.target.value)}
          placeholder={t("oauth.apply.redirectUrisPlaceholder")}
        />
        <span className={styles.hint}>{t("oauth.apply.redirectUrisHint")}</span>
      </label>

      {/* 本地测试用途：允许 http://localhost 等本地回环回调地址 */}
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={localTest}
          onChange={(event) => setLocalTest(event.target.checked)}
        />
        <span>
          <span className={styles.scopeName}>
            {t("oauth.apply.localTest")}
          </span>
          <span className={styles.scopeHint}>
            {t("oauth.apply.localTestHint")}
          </span>
        </span>
      </label>
      {localTest && (
        <div className={styles.note}>
          <ShieldCheck
            size={15}
            strokeWidth={1.8}
            className={styles.noteIcon}
            aria-hidden
          />
          <span>{t("oauth.apply.localTestTag")}</span>
        </div>
      )}

      {/* scope 多选：openid 为 OIDC 基础项，固定选中 */}
      <div className={styles.field}>
        <span className={styles.label}>{t("oauth.apply.scopes")}</span>
        <div className={styles.scopeGrid}>
          {iGM_CLI_OAuthScopeOptions.map((scope) => (
            <label key={scope} className={styles.checkRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={scopes.includes(scope)}
                disabled={scope === "openid"}
                onChange={() => iGM_CLI_ToggleScope(scope)}
              />
              <span>
                <span className={styles.scopeName}>
                  {t(`oauth.scopes.${scope}`)}
                </span>
                <span className={styles.scopeHint}>
                  {t(`oauth.scopeHints.${scope}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>{t("oauth.apply.purpose")}</span>
        <textarea
          className={styles.textarea}
          value={purpose}
          maxLength={500}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder={t("oauth.apply.purposePlaceholder")}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{t("oauth.apply.contact")}</span>
        <input
          className={styles.input}
          value={contact}
          maxLength={120}
          onChange={(event) => setContact(event.target.value)}
          placeholder={t("oauth.apply.contactPlaceholder")}
        />
      </label>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={agreeRules}
          onChange={(event) => setAgreeRules(event.target.checked)}
        />
        <span>{t("oauth.apply.agreeRules")}</span>
      </label>

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>
      )}

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={submitting}
          onClick={iGM_CLI_HandleSubmit}
        >
          {submitting ? t("oauth.apply.submitting") : t("oauth.apply.submit")}
        </button>
        <Link
          href={iGM_CLI_LocalePath("/oauth/apps", locale)}
          className={styles.ghostButton}
        >
          {t("oauth.apply.cancel")}
        </Link>
      </div>
    </div>
  );
}

/** OAuth 应用申请页（须登录） */
export function iGM_CLI_OAuthApply() {
  const t = useTranslations();
  const IGM_CLI_OAuthApplyForm = iGM_CLI_OAuthApplyForm;

  return (
    <IGM_CLI_OAuthShell active="apply">
      <p className={styles.pageDesc}>{t("oauth.apply.intro")}</p>
      <div className={styles.body}>
        <IGM_CLI_OAuthGate>
          <IGM_CLI_OAuthApplyForm />
        </IGM_CLI_OAuthGate>
      </div>
    </IGM_CLI_OAuthShell>
  );
}

// 导出 //
export default iGM_CLI_OAuthApply;
