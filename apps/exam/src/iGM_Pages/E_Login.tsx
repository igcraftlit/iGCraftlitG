/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Login.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Login（/login）
 * 模块：iGM_Login
 * 作用：独立的全屏授权登录页（考试站 OAuth Client 登录入口）
 * 内容：居中授权卡片 —— 右上角语言切换、顶部品牌（Logo + 机构名）、
 *       主标题 / 副标题、全宽主按钮（跳转后端 /api/exam/oauth/login）、
 *       底部辅助链接（隐私政策 · 服务条款）与版权小字
 * 说明：该路由由 iGM_ExamChrome 判定为裸页，不渲染刊头 / 导航 / 页脚；
 *       已登录访问本页时直接重定向首页；纯静态导出，挂载后经
 *       iGM_ExamUseAuth 拉取 /api/exam/oauth/me（读考试站独立会话）
 */

// 导入依赖 //
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, LogIn } from "lucide-react";
import { iGM_ExamLangToggle as IGM_ExamLangToggle } from "../iGM_Components/iGM_ExamLangToggle/iGM_ExamLangToggle";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import { iGM_ExamUseAuth } from "../iGM_AuthContext";
import styles from "./E_Login.module.css";

// 类型定义 //
// （本页面无入参，登录态与文案来自 Context）

// 核心逻辑 //
/** 主站站点根地址（隐私政策 / 服务条款文档托管于主站） */
const iGM_Login_MainSiteBase = "https://igcraftlit.com";

/** 独立全屏授权登录页 */
export function E_Login() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user, loading, error, login } = iGM_ExamUseAuth();

  // 已登录（考试站会话有效）访问 /login：直接重定向首页，不再展示登录页
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  // 主站政策文档按当前语言定位（主站支持 zh-CN / en）
  const docBase = `${iGM_Login_MainSiteBase}/${lang}`;

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-label={t("authLogin")}>
        {/* 右上角语言切换（轻量） */}
        <div className={styles.langSlot}>
          <IGM_ExamLangToggle />
        </div>

        {/* 顶部品牌 */}
        <div className={styles.brand}>
          <GraduationCap size={22} strokeWidth={1.6} className={styles.brandMark} />
          <span className={`igm-serif ${styles.brandName}`}>{t("instituteName")}</span>
        </div>

        {loading || user ? (
          /* 正在校验登录态 / 已登录跳转中 */
          <p className={`igm-mono ${styles.loading}`}>{t("loginChecking")}</p>
        ) : (
          <>
            <h1 className={`igm-serif ${styles.title}`}>{t("authLogin")}</h1>
            <p className={styles.lead}>{t("loginSubtitle")}</p>

            {/* 会话读取失败：仅提示，仍可重新发起登录 */}
            {error ? <p className={styles.error}>{error}</p> : null}

            <button type="button" className={styles.primaryBtn} onClick={login}>
              <LogIn size={17} strokeWidth={1.8} />
              <span>{t("authLoginWithIGM")}</span>
            </button>

            <p className={styles.links}>
              <a href={`${docBase}/G_UserRules`} rel="noreferrer">
                {t("loginPrivacy")}
              </a>
              <span className={styles.dot}>·</span>
              <a href={`${docBase}/G_UserAgreement`} rel="noreferrer">
                {t("loginTerms")}
              </a>
            </p>
          </>
        )}

        {/* 底部版权 */}
        <p className={`igm-mono ${styles.footNote}`}>
          {t("footerCopyright", { year: new Date().getFullYear() })}
        </p>
      </section>
    </main>
  );
}

// 导出 //
export default E_Login;
