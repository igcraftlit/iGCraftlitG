/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_VersionBadge/iGM_CLI_VersionBadge.tsx
 * 所属层：前端 / 组件层
 * 路由：/{locale}/api
 * 模块：iGM_CLI_Downloader
 * 作用：在客户端从 npm registry 获取 igm-cli 最新版本号并展示
 * 内容：useEffect + fetch https://registry.npmjs.org/igm-cli/latest，
 *       解析 version 字段；加载中显示省略号，失败显示横杠
 */

"use client";

// 导入依赖 //
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import styles from "./iGM_CLI_VersionBadge.module.css";

// 类型定义 //
interface iGM_CLI_VersionBadgeProps {
  /** 标签文案，如「最新版本」 */
  label: string;
}

// 核心逻辑 //
/**
 * 从 npm registry 获取 igm-cli 最新版本号。
 * 纯客户端请求，SSG 构建时不执行，避免静态化时锁定版本。
 */
export function iGM_CLI_VersionBadge({ label }: iGM_CLI_VersionBadgeProps) {
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("https://registry.npmjs.org/igm-cli/latest")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled && typeof data.version === "string") {
          setVersion(data.version);
        }
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.badge}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        {loading ? (
          <RefreshCw className={styles.spin} size={14} aria-hidden="true" />
        ) : version ? (
          `v${version}`
        ) : (
          "—"
        )}
      </span>
    </div>
  );
}

// 导出 //
export default iGM_CLI_VersionBadge;
