/**
 * 文件路径：apps/web/src/iGM_Components/iGM_AuthUI/iGM_AuthUI.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Auth/*、G_Settings
 * 模块：iGM_AuthUI
 * 作用：认证页与账户设置页共享的极简表单原子组件
 * 内容：居中卡片、表单字段、主/次按钮（含加载态）、结果提示条、
 *       后端 i18n 错误键到本地化文案的解析工具
 */

// 导入依赖 //
"use client";

import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import type { iGM_RequestError } from "../../iGM_Services/iGM_Request";
import styles from "./iGM_AuthUI.module.css";

// 类型定义 //
interface iGM_AuthCardProps {
  /** 标题图标 */
  icon?: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  /** 账户设置等宽表单使用 */
  wide?: boolean;
}

interface iGM_FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

interface iGM_SubmitButtonProps {
  loading?: boolean;
  children: ReactNode;
}

interface iGM_AlertProps {
  tone: "error" | "success";
  children: ReactNode;
}

/** next-intl 翻译函数的最小结构 */
type iGM_Translator = (key: string) => string;

// 核心逻辑 //
/** 认证卡片：标题区 + 内容 */
export function iGM_AuthCard({
  icon: Icon,
  title,
  description,
  children,
  wide = false,
}: iGM_AuthCardProps) {
  return (
    <div className={styles.authWrap}>
      <section className={`${styles.authCard} ${wide ? styles.authCardWide : ""}`}>
        <header className={styles.authHeader}>
          <h1 className={styles.authTitle}>
            {Icon && (
              <span className={styles.authTitleIcon}>
                <Icon size={21} strokeWidth={1.8} />
              </span>
            )}
            {title}
          </h1>
          {description && (
            <p className={styles.authDescription}>{description}</p>
          )}
        </header>
        {children}
      </section>
    </div>
  );
}

/** 表单字段：标签 + 控件 + 提示/错误 */
export function iGM_FormField({
  id,
  label,
  error,
  hint,
  children,
}: iGM_FormFieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <span className={styles.fieldError}>{error}</span>
      ) : hint ? (
        <span className={styles.fieldHint}>{hint}</span>
      ) : null}
    </div>
  );
}

/** 主提交按钮：加载时显示纯 CSS 转圈并禁用 */
export function iGM_SubmitButton({ loading, children }: iGM_SubmitButtonProps) {
  return (
    <button type="submit" className={styles.submitButton} disabled={loading}>
      {loading && <span className={styles.spinner} aria-hidden />}
      {children}
    </button>
  );
}

/** 次按钮（如登出、取消） */
export function iGM_SecondaryButton({
  type = "button",
  loading,
  onClick,
  children,
}: iGM_SubmitButtonProps & { type?: "button" | "submit"; onClick?: () => void }) {
  return (
    <button
      type={type}
      className={styles.secondaryButton}
      disabled={loading}
      onClick={onClick}
    >
      {loading && <span className={styles.spinner} aria-hidden />}
      {children}
    </button>
  );
}

/** 结果提示条 */
export function iGM_Alert({ tone, children }: iGM_AlertProps) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      className={`${styles.alert} ${
        tone === "error" ? styles.alertError : styles.alertSuccess
      }`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className={styles.alertIcon}>
        <Icon size={15} strokeWidth={2} />
      </span>
      <span>{children}</span>
    </div>
  );
}

/**
 * 将后端错误归一化为当前语言文案：
 * 后端业务错误 message 形如 auth.errors.xxx，直接作为 i18n 键；
 * 网络/超时错误使用前端通用键；未知错误回退通用提示
 */
export function iGM_ResolveErrorText(
  t: iGM_Translator,
  error: iGM_RequestError | unknown,
): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    (error as iGM_RequestError).kind === "timeout"
  ) {
    return t("auth.errors.requestTimeout");
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    (error as iGM_RequestError).kind === "network"
  ) {
    return t("auth.errors.network");
  }

  const key =
    error instanceof Error ? error.message : "community.errors.generic";
  // 后端业务错误 message 即 i18n 文案键（auth.* / community.*）
  if (key.includes(".")) {
    try {
      return t(key);
    } catch {
      return t("community.errors.generic");
    }
  }
  return t("community.errors.generic");
}

// 导出 //
export default {
  iGM_AuthCard,
  iGM_FormField,
  iGM_SubmitButton,
  iGM_SecondaryButton,
  iGM_Alert,
  iGM_ResolveErrorText,
};
