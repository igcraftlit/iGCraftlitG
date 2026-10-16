/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Login.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Login（/login）
 * 模块：iGM_Login
 * 作用：微软式授权登录页（考试站 OAuth Client 登录入口）
 * 内容：居中授权卡片 —— 顶部品牌、标题/副标题、主按钮（跳转后端
 *       /api/exam/oauth/login）、底部辅助链接与版权；
 *       已登录时展示头像 / 昵称 / GUID 编号，提供“进入考试站”与“退出登录”
 * 说明：纯静态导出，挂载后经 iGM_ExamUseAuth 拉取 /api/exam/oauth/me；
 *       不修改任何 OAuth 后端逻辑，仅重写前端 UI
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  GraduationCap,
  LogIn,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import { iGM_ExamUseAuth } from "../iGM_AuthContext";
import { iGM_Exam_ResolveMediaUrl } from "../iGM_Services/iGM_ExamConfig";
import styles from "./E_Login.module.css";

// 类型定义 //
// （本页面无入参，登录态与文案来自 Context）

// 核心逻辑 //
/** 主站站点根地址（隐私政策 / 服务条款文档托管于主站） */
const iGM_Login_MainSiteBase = "https://igcraftlit.com";

/** 微软式授权登录页 */
export function E_Login() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user, loading, error, login, logout } = iGM_ExamUseAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  // 主站头像引用为站内相对路径（/G_File/preview?fileId=...），按运行时 API 域名补全后使用
  const avatarUrl = iGM_Exam_ResolveMediaUrl(user?.picture);
  const showAvatar = Boolean(avatarUrl) && !avatarFailed;

  // 用户切换（或头像变更）时重置头像加载失败标记
  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  // 主站政策文档按当前语言定位（主站支持 zh-CN / en）
  const docBase = `${iGM_Login_MainSiteBase}/${lang}`;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-label={t("authLogin")}>
        {/* 顶部品牌 */}
        <div className={styles.brand}>
          <GraduationCap size={22} strokeWidth={1.6} className={styles.brandMark} />
          <span className={`igm-serif ${styles.brandName}`}>{t("instituteName")}</span>
        </div>

        {loading ? (
          /* 正在校验登录态 */
          <p className={`igm-mono ${styles.loading}`}>{t("loginChecking")}</p>
        ) : error ? (
          /* 登录态读取失败：提供重新登录入口 */
          <>
            <h1 className={`igm-serif ${styles.title}`}>{t("authFailed")}</h1>
            <p className={styles.lead}>{error}</p>
            <button type="button" className={styles.primaryBtn} onClick={login}>
              <LogIn size={17} strokeWidth={1.8} />
              <span>{t("authLoginWithIGM")}</span>
            </button>
          </>
        ) : user ? (
          /* 已登录：展示账户信息 */
          <>
            <h1 className={`igm-serif ${styles.title}`}>{t("authGreeting")}</h1>
            <p className={styles.lead}>{t("loginSignedInLead")}</p>

            <div className={styles.account}>
              <span className={styles.avatarWrap}>
                {showAvatar ? (
                  <img
                    src={avatarUrl as string}
                    alt=""
                    className={styles.avatarImg}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <UserIcon size={20} strokeWidth={1.6} />
                )}
              </span>
              <span className={styles.accountText}>
                <span className={styles.accountName} title={user.displayName}>
                  {user.displayName}
                </span>
                <span className={`igm-mono ${styles.accountUid}`}>
                  {t("loginUidLabel")} · {user.uid}
                </span>
              </span>
            </div>

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => router.push("/")}
            >
              <ArrowRight size={17} strokeWidth={1.8} />
              <span>{t("loginEnter")}</span>
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <LogOut size={16} strokeWidth={1.8} />
              <span>{loggingOut ? t("authLoggingOut") : t("authLogout")}</span>
            </button>
          </>
        ) : (
          /* 未登录：使用 iGCraftLit 账号登录 */
          <>
            <h1 className={`igm-serif ${styles.title}`}>{t("authLogin")}</h1>
            <p className={styles.lead}>{t("loginSubtitle")}</p>
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
