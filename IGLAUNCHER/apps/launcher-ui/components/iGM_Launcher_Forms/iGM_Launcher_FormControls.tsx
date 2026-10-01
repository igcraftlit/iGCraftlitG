/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Forms/iGM_Launcher_FormControls.tsx
 * 所属层：前端 / 表单原语层
 * 路由：全局（实例编辑、Java 管理、账户登录共用）
 * 模块：iGM_Launcher_FormControls
 * 作用：极简表单控件集合：字段容器、输入框、下拉、多行文本、分段切换
 * 内容：统一高度、描边与聚焦态，全部为受控组件，不内置任何业务逻辑
 *
 * 命名说明：导出名沿用 iGM_ 前缀；JSX 中大小写敏感，使用方统一按
 *           `import { iGM_Launcher_Input as IGM_Launcher_Input }` 别名后渲染。
 */

// 导入依赖 //
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./iGM_Launcher_FormControls.module.css";

// 类型定义 //
interface iGM_Launcher_FieldProps {
  label: string;
  hint?: string;
  /** 与控件 id 关联的 htmlFor */
  htmlFor?: string;
  children: ReactNode;
}

interface iGM_Launcher_SegmentOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

interface iGM_Launcher_SegmentedProps {
  options: readonly iGM_Launcher_SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

// 核心逻辑 //
/** 字段容器：标签 + 控件 + 说明 */
export function iGM_Launcher_Field({
  label,
  hint,
  htmlFor,
  children,
}: iGM_Launcher_FieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

export function iGM_Launcher_Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  const classNames = [styles.control, className].filter(Boolean).join(" ");
  return <input className={classNames} {...rest} />;
}

export function iGM_Launcher_Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const classNames = [styles.control, styles.select, className].filter(Boolean).join(" ");
  return (
    <select className={classNames} {...rest}>
      {children}
    </select>
  );
}

export function iGM_Launcher_Textarea({
  className,
  rows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const classNames = [styles.control, styles.textarea, className].filter(Boolean).join(" ");
  return <textarea rows={rows} className={classNames} {...rest} />;
}

/** 分段切换：语言、视图、加载器等少量互斥选项 */
export function iGM_Launcher_Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: iGM_Launcher_SegmentedProps) {
  return (
    <div className={styles.segmented} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            type="button"
            key={option.value}
            className={`${styles.segment} ${value === option.value ? styles.segmentActive : ""}`}
            aria-pressed={value === option.value}
            title={option.label}
            onClick={() => onChange(option.value)}
          >
            {Icon ? <Icon size={13} strokeWidth={1.8} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// 导出 //
/* 以上具名导出即为本模块对外接口 */