/**
 * 文件路径：apps/web/src/iGM_Pages/G_Landing/iGM_LandingPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/（控制台之前的门户落地页）
 * 模块：G_Landing
 * 作用：进入控制台之前的品牌门户主页，介绍社区理念、领域、活动与价值观
 * 内容：悬浮导航、Hero 首屏、WHY / FOCUS / WHAT / VALUES 区块、加入我们 CTA、页脚
 * 动效：Hero 阶梯拉出、区块滚动进场、卡片悬停、滚动指示（均支持 reduce-motion 降级）
 */

// 导入依赖 //
"use client";

import Link from "next/link";
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

  return (
    <div className={styles.landing} id="top">
      {/* ===== 悬浮导航 ===== */}
      <header className={styles.topnav}>
        <div className={styles.topnavInner}>
          <a href="#top" className={`igm-font-brand ${styles.brand}`}>
            {t("landing.brand")}
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

          <div className={styles.navActions}>
            <Link href="/G_Home" className={styles.consoleButton}>
              {t("landing.nav.console")}
            </Link>
            <IGM_LanguageSwitcher />
            <IGM_ThemeToggle />
          </div>
        </div>
      </header>

      {/* ===== Hero 首屏 ===== */}
      <section className={styles.hero} id="hero">
        <div className={styles.heroGlow} aria-hidden />
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <IGM_Reveal direction="right" duration={800}>
              <h1 className={`igm-font-brand ${styles.heroTitle}`}>
                {t("landing.brand")}
              </h1>
            </IGM_Reveal>
            <IGM_Reveal direction="right" duration={800} delay={110}>
              <p className={styles.heroSlogan}>
                {t("landing.hero.slogan")}
              </p>
            </IGM_Reveal>
            <IGM_Reveal direction="right" duration={800} delay={220}>
              <p className={styles.heroDescription}>
                {t("landing.hero.description")}
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
        <span className={`igm-font-brand ${styles.footerBrand}`}>
          {t("landing.brand")}
        </span>
        <span className={styles.footerCopyright}>
          {t("landing.footer.rights", { year })}
        </span>
        <Link href="/G_Home" className={styles.footerConsole}>
          {t("landing.footer.console")}
        </Link>
      </footer>
    </div>
  );
}

// 导出 //
export default iGM_LandingPage;
