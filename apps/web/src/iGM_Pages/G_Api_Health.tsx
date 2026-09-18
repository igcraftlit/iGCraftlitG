/**
 * 文件路径：apps/web/src/iGM_Pages/G_Api_Health.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Api_Health（健康检查占位页）
 * 模块：G_Api_Health
 * 作用：展示前端版本与构建时间，并检测本地后端 G_Api_Health 连通性
 * 内容：前端版本、构建时间、接口地址、后端状态与后端版本、重新检测按钮
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  iGM_CheckHealth,
  type iGM_HealthResult,
} from "../iGM_Services/iGM_Request";
import { iGM_Config } from "../iGM_Services/iGM_Config";
import styles from "./iGM_Page.module.css";

// 类型定义 //
type iGM_BackendState = "checking" | "online" | "offline";

// 核心逻辑 //
/** 健康检查页 */
export function G_Api_Health() {
  const t = useTranslations();
  const [state, setState] = useState<iGM_BackendState>("checking");
  const [backend, setBackend] = useState<iGM_HealthResult | null>(null);

  const check = useCallback(async () => {
    setState("checking");
    try {
      const response = await iGM_CheckHealth();
      setBackend(response.data);
      setState("online");
    } catch {
      setBackend(null);
      setState("offline");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // 构建时间按本地时区展示
  const buildTime = iGM_Config.buildTime
    ? new Date(iGM_Config.buildTime).toLocaleString()
    : "-";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t("health.title")}</h1>
      </header>

      <section className={styles.healthPanel}>
        {/* 前端版本 */}
        <div className={styles.healthRow}>
          <span className={styles.healthLabel}>
            {t("health.frontendVersion")}
          </span>
          <span className={styles.healthValue}>{iGM_Config.version}</span>
        </div>

        {/* 构建时间 */}
        <div className={styles.healthRow}>
          <span className={styles.healthLabel}>{t("health.buildTime")}</span>
          <span className={styles.healthValue}>{buildTime}</span>
        </div>

        {/* 接口地址 */}
        <div className={styles.healthRow}>
          <span className={styles.healthLabel}>{t("health.apiAddress")}</span>
          <span className={styles.healthValue}>{iGM_Config.apiBase}</span>
        </div>

        {/* 后端状态 */}
        <div className={styles.healthRow}>
          <span className={styles.healthLabel}>
            {t("health.backendStatus")}
          </span>
          <span
            className={`${styles.statusBadge} ${
              state === "online"
                ? styles.statusOnline
                : state === "offline"
                  ? styles.statusOffline
                  : styles.statusChecking
            }`}
          >
            <span className={styles.statusDot} aria-hidden />
            {t(
              state === "online"
                ? "health.online"
                : state === "offline"
                  ? "health.offline"
                  : "health.checking",
            )}
          </span>
        </div>

        {/* 后端版本（在线时展示） */}
        {state === "online" && backend && (
          <div className={styles.healthRow}>
            <span className={styles.healthLabel}>
              {t("health.backendVersion")}
            </span>
            <span className={styles.healthValue}>{backend.version}</span>
          </div>
        )}

        {/* 重新检测 */}
        <div className={styles.healthActions}>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => void check()}
            disabled={state === "checking"}
          >
            <RefreshCw size={15} strokeWidth={1.8} />
            {t("health.retry")}
          </button>
        </div>
      </section>
    </div>
  );
}

// 导出 //
export default G_Api_Health;
