/**
 * 文件路径：apps/web/src/iGM_Pages/G_Home.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Home（首页）
 * 模块：G_Home
 * 作用：模块一首页，仅保留网站名称、一句话简介与四个简约入口卡片
 * 内容：社区入口、个人主页入口、管理后台入口、iGM Launcher 入口；无 3D / WebGL / 复杂视觉
 */

// 导入依赖 //
"use client";

import { Code2, Rocket, Shield, UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { iGM_NavCard as IGM_NavCard } from "../iGM_Components/iGM_NavCard/iGM_NavCard";
import styles from "./iGM_Page.module.css";

// 类型定义 //
// （首页无属性输入）

// 核心逻辑 //
/** 首页 G_Home */
export function G_Home() {
  const t = useTranslations();

  return (
    <div className={styles.homeWrap}>
      {/* 标题区：网站名称（Cinzel）+ 一句话简介 */}
      <section className={styles.hero}>
        <h1 className={`igm-font-brand ${styles.heroTitle}`}>
          {t("home.heading")}
        </h1>
        <p className={styles.heroTagline}>{t("home.tagline")}</p>
      </section>

      {/* 卡片区：社区 / 个人主页 / 管理后台 / iGM Launcher 四个入口 */}
      <section className={styles.cardGrid}>
        <IGM_NavCard
          href="/G_Community"
          icon={Users}
          title={t("home.cardCommunityTitle")}
          description={t("home.cardCommunityDesc")}
        />
        <IGM_NavCard
          href="/G_User"
          icon={UserRound}
          title={t("home.cardProfileTitle")}
          description={t("home.cardProfileDesc")}
        />
        <IGM_NavCard
          href="/G_Admin"
          icon={Shield}
          title={t("home.cardAdminTitle")}
          description={t("home.cardAdminDesc")}
        />
        {/* iGM Launcher：跳转独立下载站（子域名，外链原样跳转） */}
        <IGM_NavCard
          href="https://launcher.igcraftlit.com"
          icon={Rocket}
          title={t("home.cardLauncherTitle")}
          description={t("home.cardLauncherDesc")}
        />
        {/* 成为开发者：跳转开发者初始界面 G_DeveloperIntro */}
        <IGM_NavCard
          href="/G_DeveloperIntro"
          icon={Code2}
          title={t("home.cardDeveloperTitle")}
          description={t("home.cardDeveloperDesc")}
        />
      </section>
    </div>
  );
}

// 导出 //
export default G_Home;
