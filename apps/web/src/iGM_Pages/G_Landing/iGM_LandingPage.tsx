/**
 * 文件路径：apps/web/src/iGM_Pages/G_Landing/iGM_LandingPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/（控制台之前的门户落地页）
 * 模块：G_Landing
 * 作用：进入控制台之前的品牌门户主页，介绍社区理念、领域、活动与价值观
 * 内容：固定磨砂导航（含 LOGO 与登录头像）、双栏 Hero（WebGL 流体背景 + 站名 / 主标题 / 副标题）、
 *       WHY / FOCUS / WHAT / VALUES 区块、加入我们 CTA、极简页脚
 * 动效：Hero 阶梯拉出、区块滚动进场、卡片悬停、滚动指示（均支持 reduce-motion 降级）
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Compass,
  Cpu,
  Flame,
  Hammer,
  HelpCircle,
  LogIn,
  MessageSquareText,
  Package,
  Search,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { iGM_Reveal as IGM_Reveal } from "../../iGM_Components/iGM_Reveal/iGM_Reveal";
import { iGM_ThemeToggle as IGM_ThemeToggle } from "../../iGM_Components/iGM_ThemeToggle/iGM_ThemeToggle";
import { iGM_LanguageSwitcher as IGM_LanguageSwitcher } from "../../iGM_Components/iGM_LanguageSwitcher/iGM_LanguageSwitcher";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_FluidBackground as IGM_FluidBackground } from "../../iGM_Components/iGM_FluidBackground/iGM_FluidBackground";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import styles from "./iGM_Landing.module.css";

// 类型定义 //
interface iGM_LandingCard {
  /** 语言包内条目键（i1 / i2 ...） */
  key: string;
  icon: LucideIcon;
}

// 核心逻辑 //
/** FOCUS 关注领域条目（图标 + 文案键） */
const iGM_FocusCards: iGM_LandingCard[] = [
  { key: "i1", icon: Compass },
  { key: "i2", icon: Hammer },
  { key: "i3", icon: Cpu },
  { key: "i4", icon: Package },
];

/** WHAT 社区活动条目 */
const iGM_WhatCards: iGM_LandingCard[] = [
  { key: "i1", icon: MessageSquareText },
  { key: "i2", icon: BookOpen },
  { key: "i3", icon: CalendarDays },
  { key: "i4", icon: HelpCircle },
];

/** VALUES 价值观条目 */
const iGM_ValueCards: iGM_LandingCard[] = [
  { key: "i1", icon: Sparkles },
  { key: "i2", icon: Search },
  { key: "i3", icon: Flame },
];

/** WHY 理念标签键 */
const iGM_WhyTags = ["t1", "t2", "t3", "t4"];

/** 门户落地页 */
export function iGM_LandingPage() {
  const t = useTranslations();
  const year = new Date().getFullYear();
  // 顶部导航主按钮：未登录显示"登录/注册"（进入五框向导），已登录显示头像 + 进入控制台
  const { user } = iGM_UseAuth();
  /** 是否已滚过阈值：为真时导航固定在顶部，便于紧凑条悬浮跟随滚动 */
  const [iGM_NavPinned, iGM_SetNavPinned] = useState(false);
  /** 是否处于紧凑搜索条形态（向下滚动进入，向上滚动退出） */
  const [iGM_NavCompact, iGM_SetNavCompact] = useState(false);

  /**
   * 导航滚动逻辑：监听 window.scrollY 与滚动方向。
   * - 顶部（未超过阈值）：导航留在文档流中随页面自然滚走；
   * - 向下滚过阈值：固定于顶部并切换为紧凑搜索条，跟随滚动一直可见；
   * - 向上滚：恢复完整导航（Logo / 主导航 / 语言 / 主题 / 头像）。
   */
  useEffect(() => {
    /** 触发固定与紧凑形态的滚动阈值 */
    const iGM_Threshold = 100;
    /** 方向判定死区：过滤微小抖动 */
    const iGM_DeadZone = 4;

    let iGM_LastY = window.scrollY;
    let iGM_Ticking = false;

    function iGM_Update(): void {
      const y = window.scrollY;
      const delta = y - iGM_LastY;

      iGM_SetNavPinned(y > iGM_Threshold);

      if (y <= iGM_Threshold) {
        // 回到顶部：恢复完整导航，随页面自然滚动
        iGM_SetNavCompact(false);
      } else if (delta > iGM_DeadZone) {
        // 向下滚动：切换为紧凑搜索条
        iGM_SetNavCompact(true);
      } else if (delta < -iGM_DeadZone) {
        // 向上滚动：恢复原样
        iGM_SetNavCompact(false);
      }

      iGM_LastY = y;
      iGM_Ticking = false;
    }

    function iGM_HandleScroll(): void {
      if (iGM_Ticking) return;
      iGM_Ticking = true;
      window.requestAnimationFrame(iGM_Update);
    }

    window.addEventListener("scroll", iGM_HandleScroll, { passive: true });
    return () => window.removeEventListener("scroll", iGM_HandleScroll);
  }, []);

  return (
    <div className={styles.landing} id="top">
      {/* ===== 磨砂导航：顶部随页面自然滚动，滚动后固定并切换为紧凑搜索条 ===== */}
      <header
        className={`${styles.topnav} ${iGM_NavPinned ? styles.isPinned : ""} ${iGM_NavCompact ? styles.isCompact : ""}`}
      >
        <div className={styles.topnavInner}>
          <a href="#top" className={`igm-font-brand ${styles.brand}`}>
            {/* 站点 LOGO：静态资源位于 public 根目录 */}
            <img
              src="/iGM_save1.ico"
              alt=""
              aria-hidden
              className={styles.brandLogo}
            />
            <span className={styles.brandText}>{t("landing.brand")}</span>
          </a>

          <nav className={styles.navLinks} aria-label={t("nav.groupMain")}>
            <a href="#top" className={styles.navAnchor}>
              {t("landing.nav.home")}
            </a>
            <Link href="/G_Community" className={styles.navAnchor}>
              {t("landing.nav.community")}
            </Link>
            <a href="#cta" className={styles.navAnchor}>
              {t("landing.nav.join")}
            </a>
          </nav>

          {/* 紧凑形态专用的搜索 / 命令入口 */}
          <Link
            href="/G_Search"
            className={styles.navSearch}
            aria-label={t("topbar.search")}
          >
            <Search size={15} strokeWidth={2} aria-hidden />
            <span className={styles.navSearchLabel}>{t("topbar.search")}</span>
          </Link>

          <div className={styles.navActions}>
            {user ? (
              <Link href="/G_Home" className={styles.consoleButton}>
                {/* 已登录：显示头像 + 进入控制台 */}
                <IGM_Avatar
                  src={user.avatar}
                  name={user.displayName || user.username}
                  size="sm"
                />
                {t("landing.nav.console")}
              </Link>
            ) : (
              <Link href="/G_Auth/login" className={styles.consoleButton}>
                <LogIn size={15} strokeWidth={2} />
                {t("landing.nav.auth")}
              </Link>
            )}
            <IGM_LanguageSwitcher />
            <IGM_ThemeToggle />
          </div>
        </div>
      </header>

      {/* ===== Hero 首屏 ===== */}
      <section className={styles.hero} id="hero">
        {/* WebGL 流体渐变背景：品牌色带缓慢流动，鼠标移动产生轻微扰动与跟随 */}
        <IGM_FluidBackground className={styles.heroCanvas} />
        <div className={styles.heroGlow} aria-hidden />
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <IGM_Reveal direction="right" duration={800}>
              {/* 真正的主标题：网站名称，页面最大字号 */}
              <h1 className={`igm-font-brand ${styles.heroTitle}`}>
                {t("home.heading")}
              </h1>
            </IGM_Reveal>
            <IGM_Reveal direction="right" duration={800} delay={110}>
              {/* 副标题：次要字号 */}
              <p className={styles.heroSubtitle}>
                {t("landing.hero.title")}
              </p>
            </IGM_Reveal>
            <IGM_Reveal direction="right" duration={800} delay={220}>
              <p className={styles.heroDescription}>
                {t("landing.hero.subtitle")}
              </p>
            </IGM_Reveal>
            <IGM_Reveal direction="right" duration={800} delay={330}>
              <div className={styles.heroActions}>
                <Link href="/G_Community" className={styles.buttonPrimary}>
                  {t("landing.hero.primary")}
                  <ArrowRight size={17} strokeWidth={2} />
                </Link>
                <a href="#why" className={styles.buttonGhost}>
                  {t("landing.hero.secondary")}
                </a>
              </div>
            </IGM_Reveal>
          </div>
        </div>

        <a href="#why" className={styles.scrollHint} aria-label={t("landing.hero.scrollHint")}>
          <ChevronDown size={18} strokeWidth={2} />
        </a>
      </section>

      {/* ===== WHY 理念 ===== */}
      <section className={styles.section} id="why">
        <div className={styles.sectionInner}>
          <IGM_Reveal direction="left">
            <h2 className={styles.sectionLabel}>{t("landing.why.label")}</h2>
          </IGM_Reveal>
          <div className={styles.sectionBody}>
            <IGM_Reveal direction="up">
              <p className={styles.sectionParagraph}>
                {t("landing.why.p1")}
              </p>
            </IGM_Reveal>
            <IGM_Reveal direction="up" delay={90}>
              <p className={styles.sectionParagraphMuted}>
                {t("landing.why.p2")}
              </p>
            </IGM_Reveal>
            <IGM_Reveal direction="up" delay={180}>
              <div className={styles.chipRow}>
                {iGM_WhyTags.map((tag) => (
                  <span key={tag} className={styles.chip}>
                    {t(`landing.why.${tag}`)}
                  </span>
                ))}
              </div>
            </IGM_Reveal>
          </div>
        </div>
      </section>

      {/* ===== FOCUS 领域 ===== */}
      <section className={styles.sectionMuted} id="focus">
        <div className={styles.sectionInner}>
          <IGM_Reveal direction="left">
            <h2 className={styles.sectionLabel}>{t("landing.focus.label")}</h2>
          </IGM_Reveal>
          <div className={styles.sectionBody}>
            <IGM_Reveal direction="up">
              <p className={styles.sectionParagraphMuted}>
                {t("landing.focus.lead")}
              </p>
            </IGM_Reveal>
            <div className={styles.cardGrid}>
              {iGM_FocusCards.map((card, index) => (
                <IGM_Reveal key={card.key} direction="up" delay={index * 90}>
                  <article className={styles.card}>
                    <span className={styles.cardIcon}>
                      <card.icon size={20} strokeWidth={1.8} />
                    </span>
                    <h3 className={styles.cardTitle}>
                      {t(`landing.focus.${card.key}.title`)}
                    </h3>
                    <p className={styles.cardDescription}>
                      {t(`landing.focus.${card.key}.desc`)}
                    </p>
                  </article>
                </IGM_Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHAT 活动 ===== */}
      <section className={styles.section} id="what">
        <div className={styles.sectionInner}>
          <IGM_Reveal direction="left">
            <h2 className={styles.sectionLabel}>{t("landing.what.label")}</h2>
          </IGM_Reveal>
          <div className={styles.sectionBody}>
            <IGM_Reveal direction="up">
              <p className={styles.sectionParagraphMuted}>
                {t("landing.what.lead")}
              </p>
            </IGM_Reveal>
            <div className={styles.cardGrid}>
              {iGM_WhatCards.map((card, index) => (
                <IGM_Reveal key={card.key} direction="up" delay={index * 90}>
                  <article className={styles.card}>
                    <span className={styles.cardIcon}>
                      <card.icon size={20} strokeWidth={1.8} />
                    </span>
                    <h3 className={styles.cardTitle}>
                      {t(`landing.what.${card.key}.title`)}
                    </h3>
                    <p className={styles.cardDescription}>
                      {t(`landing.what.${card.key}.desc`)}
                    </p>
                  </article>
                </IGM_Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== VALUES 价值观 ===== */}
      <section className={styles.sectionMuted} id="values">
        <div className={styles.sectionInner}>
          <IGM_Reveal direction="left">
            <h2 className={styles.sectionLabel}>
              {t("landing.values.label")}
            </h2>
          </IGM_Reveal>
          <div className={styles.sectionBody}>
            <IGM_Reveal direction="up">
              <p className={styles.sectionParagraphMuted}>
                {t("landing.values.lead")}
              </p>
            </IGM_Reveal>
            <div className={styles.cardGridThree}>
              {iGM_ValueCards.map((card, index) => (
                <IGM_Reveal key={card.key} direction="up" delay={index * 90}>
                  <article className={styles.card}>
                    <span className={styles.cardIcon}>
                      <card.icon size={20} strokeWidth={1.8} />
                    </span>
                    <h3 className={styles.cardTitle}>
                      {t(`landing.values.${card.key}.title`)}
                    </h3>
                    <p className={styles.cardDescription}>
                      {t(`landing.values.${card.key}.desc`)}
                    </p>
                  </article>
                </IGM_Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA 加入我们 ===== */}
      <section className={styles.cta} id="cta">
        <div className={styles.ctaInner}>
          <div className={styles.ctaText}>
            <IGM_Reveal direction="left">
              <span className={styles.ctaLabel}>
                {t("landing.cta.label")}
              </span>
              <h2 className={styles.ctaTitle}>{t("landing.cta.title")}</h2>
            </IGM_Reveal>
            <IGM_Reveal direction="left" delay={100}>
              <p className={styles.ctaDescription}>
                {t("landing.cta.description")}
              </p>
            </IGM_Reveal>
          </div>
          <IGM_Reveal direction="right" delay={180}>
            <div className={styles.ctaActions}>
              <Link href="/G_Community" className={styles.buttonPrimary}>
                {t("landing.cta.primary")}
                <ArrowRight size={17} strokeWidth={2} />
              </Link>
              <Link href="/G_Auth/login" className={styles.buttonGhost}>
                <LogIn size={16} strokeWidth={2} />
                {t("landing.cta.secondary")}
              </Link>
            </div>
          </IGM_Reveal>
        </div>
      </section>

      {/* ===== 页脚 ===== */}
      <footer className={styles.landingFooter}>
        <span className={styles.footerCopyright}>
          {t("landing.footer.rights", { year })}
        </span>
      </footer>
    </div>
  );
}

// 导出 //
export default iGM_LandingPage;
