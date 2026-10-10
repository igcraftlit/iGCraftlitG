/**
 * 文件路径：apps/web/src/iGM_Pages/G_DeveloperPortal/iGM_DeveloperPortalPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_DeveloperPortal
 * 模块：G_DeveloperPortal
 * 作用：开发者平台首页——开发者申请通过后凭站点登录会话直接进入，无需密钥
 * 内容：准入校验（GET /api/developer/status）、概览（iGMUid / 用户名 / 昵称）、
 *       应用管理、接入文档、SDK 下载、退出；未通过开发者申请时引导至申请页
 * 说明：纯静态 SSG；准入以站点登录会话 + 开发者申请状态为准，不依赖任何本地密钥
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Boxes,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import {
  iGM_ApiGetDeveloperStatus,
  iGM_DeveloperConsoleUrl,
  type iGM_DeveloperPortalStatus,
} from "../../iGM_Services/iGM_DeveloperClient";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "./iGM_DeveloperPortal.module.css";

// 类型定义 //
/** 平台入口卡片（外链开发者接入界面） */
interface iGM_PortalEntry {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
}

// 核心逻辑 //
/** 开发者平台页主体（在登录守卫内） */
function iGM_DeveloperPortalInner() {
  const t = useTranslations();

  const [status, setStatus] = useState<iGM_DeveloperPortalStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  /** 查询准入状态：开发者申请通过即可进入 */
  const iGM_Load = useCallback(() => {
    let cancelled = false;
    setChecking(true);
    setLoadFailed(false);
    iGM_ApiGetDeveloperStatus()
      .then((response) => {
        if (!cancelled && response.data) setStatus(response.data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => iGM_Load(), [iGM_Load]);

  if (checking) {
    return (
      <div className={uiStyles.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("community.state.loading")}
      </div>
    );
  }

  if (loadFailed || !status) {
    return (
      <div className={pageStyles.page}>
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("developer.portal.loadFailed")}
        </div>
        <div className={styles.actionRow}>
          <button type="button" className={styles.ghostButton} onClick={iGM_Load}>
            <LoaderCircle size={15} strokeWidth={1.8} aria-hidden />
            {t("developer.portal.retry")}
          </button>
        </div>
      </div>
    );
  }

  // 尚未通过开发者申请：引导至申请页
  if (!status.isDeveloper) {
    return (
      <div className={pageStyles.page}>
        <header className={pageStyles.pageHeader}>
          <h1 className={pageStyles.pageTitle}>
            <span className={pageStyles.pageTitleIcon}>
              <KeyRound size={22} strokeWidth={1.8} />
            </span>
            {t("developer.portal.title")}
          </h1>
          <p className={pageStyles.pageDescription}>
            {t("developer.portal.notDeveloper")}
          </p>
        </header>
        <div className={styles.actionRow}>
          <Link href="/G_DeveloperIntro" className={styles.ghostButton}>
            <KeyRound size={15} strokeWidth={1.8} aria-hidden />
            {t("developer.portal.becomeDeveloper")}
          </Link>
        </div>
      </div>
    );
  }

  /** 平台入口卡片：应用管理 / 接入文档 / SDK 下载（均指向开发者接入界面） */
  const entries: iGM_PortalEntry[] = [
    {
      icon: Boxes,
      title: t("developer.portal.appsTitle"),
      desc: t("developer.portal.appsDesc"),
      href: `${iGM_DeveloperConsoleUrl}/oauth/apps`,
    },
    {
      icon: BookOpen,
      title: t("developer.portal.docsTitle"),
      desc: t("developer.portal.docsDesc"),
      href: `${iGM_DeveloperConsoleUrl}/oauth/docs`,
    },
    {
      icon: LayoutDashboard,
      title: t("developer.portal.sdkTitle"),
      desc: t("developer.portal.sdkDesc"),
      href: iGM_DeveloperConsoleUrl,
    },
  ];

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <KeyRound size={22} strokeWidth={1.8} />
          </span>
          {t("developer.portal.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("developer.portal.description")}
        </p>
      </header>

      {/* 概览 */}
      <section className={styles.infoCard}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>{t("developer.portal.uid")}</span>
          <span className={styles.infoValue}>{status.uid}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>
            {t("developer.portal.username")}
          </span>
          <span className={styles.infoValue}>{status.username}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>
            {t("developer.portal.displayName")}
          </span>
          <span className={styles.infoValue}>
            {status.displayName || status.username}
          </span>
        </div>
      </section>

      {/* 平台入口 */}
      <div className={styles.grid}>
        {entries.map((entry) => {
          const EntryIcon = entry.icon;
          return (
            <a
              key={entry.href}
              href={entry.href}
              target="_blank"
              rel="noreferrer"
              className={styles.linkCard}
            >
              <span className={styles.linkIcon}>
                <EntryIcon size={20} strokeWidth={1.8} aria-hidden />
              </span>
              <span className={styles.linkBody}>
                <span className={styles.linkTitle}>{entry.title}</span>
                <span className={styles.linkDesc}>{entry.desc}</span>
              </span>
            </a>
          );
        })}
      </div>

      {/* 退出开发者平台：返回站点首页 */}
      <div className={styles.actionRow}>
        <Link href="/G_Home" className={styles.ghostButton}>
          <LogOut size={15} strokeWidth={1.8} aria-hidden />
          {t("developer.portal.logout")}
        </Link>
      </div>
    </div>
  );
}

/** 开发者平台页：登录守卫包裹 */
export function iGM_DeveloperPortalPage() {
  // JSX 要求组件标识符首字母大写，本地 iGM_ 组件以大写别名渲染
  const IGM_DeveloperPortalInner = iGM_DeveloperPortalInner;
  return (
    <IGM_RequireAuth>
      <IGM_DeveloperPortalInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_DeveloperPortalPage;
