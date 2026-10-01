/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives.tsx
 * 所属层：前端 / 基础 UI 原语层
 * 路由：全局
 * 模块：iGM_Launcher_Primitives
 * 作用：五个页面共用的极简原语（页面标题、卡片、徽章、按钮、占位说明）
 * 内容：统一表面色、圆角、描边与间距，保证各页面视觉一致
 *
 * 命名说明：导出名沿用 iGM_ 前缀；JSX 中大小写敏感，使用方统一按
 *           `import { iGM_Launcher_Card as IGM_Launcher_Card }` 别名后再渲染，
 *           与主站 iGM_AppShell 的写法保持一致。
 */

// 导入依赖 //
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./iGM_Launcher_Primitives.module.css";

// 类型定义 //
interface iGM_Launcher_PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

interface iGM_Launcher_CardProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}

interface iGM_Launcher_BadgeProps {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "muted";
}

interface iGM_Launcher_ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

// 核心逻辑 //
export function iGM_Launcher_PageHeader({
  title,
  description,
  actions,
}: iGM_Launcher_PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeadingText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}

export function iGM_Launcher_Card({
  children,
  className,
  as: Tag = "section",
}: iGM_Launcher_CardProps) {
  const classNames = [styles.card, className].filter(Boolean).join(" ");
  return <Tag className={classNames}>{children}</Tag>;
}

export function iGM_Launcher_Badge({
  children,
  tone = "neutral",
}: iGM_Launcher_BadgeProps) {
  const toneClass =
    tone === "accent"
      ? styles.badgeAccent
      : tone === "success"
        ? styles.badgeSuccess
        : tone === "muted"
          ? styles.badgeMuted
          : styles.badgeNeutral;
  return <span className={`${styles.badge} ${toneClass}`}>{children}</span>;
}

export function iGM_Launcher_Button({
  variant = "secondary",
  className,
  type = "button",
  ...rest
}: iGM_Launcher_ButtonProps) {
  const variantClass =
    variant === "primary"
      ? styles.buttonPrimary
      : variant === "ghost"
        ? styles.buttonGhost
        : styles.buttonSecondary;
  const classNames = [styles.button, variantClass, className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classNames} {...rest} />;
}

export function iGM_Launcher_PlaceholderNote({ children }: { children: ReactNode }) {
  return <p className={styles.placeholderNote}>{children}</p>;
}

// 导出 //
/* 以上具名导出即为本模块对外接口，多组件模块不再提供默认导出 */