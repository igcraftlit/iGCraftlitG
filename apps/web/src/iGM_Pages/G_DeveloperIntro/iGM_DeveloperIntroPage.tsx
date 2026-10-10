/**
 * 文件路径：apps/web/src/iGM_Pages/G_DeveloperIntro/iGM_DeveloperIntroPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_DeveloperIntro
 * 模块：G_DeveloperIntro
 * 作用：开发者初始界面——非开发者进入开发者平台前的统一入口
 * 内容：三标签（开发者申请 / 申请文档 / 开发者公示）与气泡标签栏；
 *       分步申请表单（身份 / 联系方式与地址 / 项目与说明，实时字数校验）；
 *       申请文档（权益 / 流程 / 名额 / 标准 / 规范 / 联系方式，右侧 ON THIS PAGE）；
 *       开发者公示（按批次分组，最新批次置顶，公开可浏览）
 * 说明：纯静态 SSG；文档与公示对未登录用户开放，仅「提交申请」需登录；
 *       申请通过后由 G_DeveloperPortal 进入开发者平台；
 *       表单规范：项目介绍 > 100 字、申请理由 > 200 字、邮箱与手机至少一项
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  FileText,
  KeyRound,
  LoaderCircle,
  Megaphone,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  iGM_ApiGetDeveloperPublicity,
  iGM_ApiGetMyDeveloper,
  iGM_ApiReapplyDeveloper,
  iGM_ApiSubmitDeveloperApply,
  iGM_DeveloperConsoleUrl,
  type iGM_DeveloperApplication,
  type iGM_DeveloperApplyPayload,
  type iGM_DeveloperPublicityBatch,
} from "../../iGM_Services/iGM_DeveloperClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { iGM_PageToc as IGM_PageToc } from "../../iGM_Components/iGM_PageToc/iGM_PageToc";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import m15 from "../iGM_Module15.module.css";
import styles from "./iGM_DeveloperIntro.module.css";

// 类型定义 //
/** 标签页键：apply 开发者申请 / docs 申请文档 / publicity 开发者公示 */
type iGM_IntroTab = "apply" | "docs" | "publicity";

/** 申请表单分步：0 身份 / 1 联系方式与地址 / 2 项目与说明 */
const iGM_ApplySteps = ["identity", "contact", "project"] as const;

/** 与后端一致的正则：域名 / 邮箱 / 手机 */
const iGM_DomainPattern = /^(?=.{1,253}$)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const iGM_EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const iGM_PhonePattern = /^[+]?[0-9\-\s()]{7,20}$/;

/** 项目介绍 / 申请理由的最低字数（须严格大于） */
const iGM_ProjectIntroMin = 100;
const iGM_ReasonMin = 200;

// 核心逻辑 //
/** 开发者初始界面 */
export function iGM_DeveloperIntroPage() {
  const t = useTranslations();
  const [tab, setTab] = useState<iGM_IntroTab>("apply");

  const tabs: Array<{ key: iGM_IntroTab; label: string; icon: typeof Send }> = [
    { key: "apply", label: t("developer.intro.tabs.apply"), icon: Send },
    { key: "docs", label: t("developer.intro.tabs.docs"), icon: FileText },
    { key: "publicity", label: t("developer.intro.tabs.publicity"), icon: Megaphone },
  ];
  const tabIndex = tabs.findIndex((item) => item.key === tab);

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <BadgeCheck size={22} strokeWidth={1.8} />
          </span>
          {t("developer.intro.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("developer.intro.description")}
        </p>
      </header>

      <div className={styles.pageInner}>
        {/* 气泡标签栏 */}
        <div className={styles.tabBar} role="tablist">
          <span
            aria-hidden
            className={styles.tabPill}
            style={{ transform: `translateX(${tabIndex * 100}%)` }}
          />
          {tabs.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : ""}`}
                onClick={() => setTab(item.key)}
              >
                <Icon size={15} strokeWidth={1.8} />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "apply" && <IGM_ApplyPanel />}
        {tab === "docs" && <IGM_DocsPanel />}
        {tab === "publicity" && <IGM_PublicityPanel />}
      </div>
    </div>
  );
}

/* ---------- 标签一：开发者申请 ---------- */

/** 开发者申请面板（登录后提交，未登录引导登录） */
function iGM_ApplyPanel() {
  const t = useTranslations();
  const { user } = iGM_UseAuth();

  const [latest, setLatest] = useState<iGM_DeveloperApplication | null>(null);
  const [checking, setChecking] = useState(false);

  const [developerName, setDeveloperName] = useState("");
  const [age, setAge] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [country, setCountry] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectIntro, setProjectIntro] = useState("");
  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  const [additional, setAdditional] = useState("");
  const [agreeRules, setAgreeRules] = useState(false);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isOrgOwner = user?.verifiedOrg?.isOwner === true;

  /** 默认开发者名称填入当前社区用户名（可修改） */
  useEffect(() => {
    if (user && developerName.trim().length === 0) {
      setDeveloperName(user.username);
    }
  }, [user, developerName]);

  /** 读取本人最新申请，判断是否可提交（待审 / 已通过时不再展示表单） */
  const iGM_Load = useCallback(() => {
    if (!user) return;
    let cancelled = false;
    setChecking(true);
    iGM_ApiGetMyDeveloper()
      .then((response) => {
        if (!cancelled && response.data) setLatest(response.data.latest);
      })
      .catch(() => {
        /* 未申请或读取失败时按可提交处理 */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => iGM_Load(), [iGM_Load]);

  /* ---------- 分步校验 ---------- */
  const monthValue = Number(birthMonth);
  const dayValue = Number(birthDay);
  const ageValue = Number(age);
  const identityValid =
    developerName.trim().length > 0 &&
    developerName.trim().length <= 60 &&
    Number.isInteger(ageValue) &&
    ageValue >= 1 &&
    ageValue <= 120 &&
    Number.isInteger(monthValue) &&
    monthValue >= 1 &&
    monthValue <= 12 &&
    Number.isInteger(dayValue) &&
    dayValue >= 1 &&
    dayValue <= 31;

  const emailTrim = contactEmail.trim();
  const phoneTrim = contactPhone.trim();
  const contactValid =
    (emailTrim.length > 0 || phoneTrim.length > 0) &&
    (emailTrim.length === 0 || iGM_EmailPattern.test(emailTrim)) &&
    (phoneTrim.length === 0 || iGM_PhonePattern.test(phoneTrim));
  const addressValid =
    country.trim().length > 0 &&
    province.trim().length > 0 &&
    city.trim().length > 0 &&
    address.trim().length > 0 &&
    address.trim().length <= 200 &&
    postalCode.trim().length > 0 &&
    postalCode.trim().length <= 20;
  const contactStepValid = contactValid && addressValid;

  const introValue = projectIntro.trim();
  const reasonValue = reason.trim();
  const domainTrim = domain.trim().toLowerCase();
  const projectStepValid =
    projectName.trim().length > 0 &&
    projectName.trim().length <= 60 &&
    introValue.length > iGM_ProjectIntroMin &&
    introValue.length <= 1000 &&
    (domainTrim.length === 0 || iGM_DomainPattern.test(domainTrim)) &&
    reasonValue.length > iGM_ReasonMin &&
    reasonValue.length <= 500 &&
    additional.trim().length <= 500 &&
    agreeRules;

  const stepValid = [identityValid, contactStepValid, projectStepValid][step];

  /** 提交申请（已拒绝 / 已撤回走重新申请） */
  function iGM_HandleSubmit() {
    setError(null);
    const payload: iGM_DeveloperApplyPayload = {
      developerName: developerName.trim(),
      age: ageValue,
      birthMonth: monthValue,
      birthDay: dayValue,
      contactEmail: emailTrim || undefined,
      contactPhone: phoneTrim || undefined,
      country: country.trim(),
      province: province.trim(),
      city: city.trim(),
      address: address.trim(),
      postalCode: postalCode.trim(),
      projectName: projectName.trim(),
      projectIntro: introValue,
      domain: domainTrim || undefined,
      reason: reasonValue,
      additional: additional.trim() || undefined,
      agreeRules,
    };
    const reapply =
      latest !== null && (latest.status === "rejected" || latest.status === "withdrawn");
    setSubmitting(true);
    const request = reapply
      ? iGM_ApiReapplyDeveloper(payload)
      : iGM_ApiSubmitDeveloperApply(payload);
    request
      .then(() => setSubmitted(true))
      .catch((submitError: unknown) => {
        setError(
          submitError instanceof Error && submitError.message.includes(".")
            ? t(submitError.message)
            : t("developer.apply.failed"),
        );
      })
      .finally(() => setSubmitting(false));
  }

  /* ---------- 未登录：引导登录 ---------- */
  if (!user) {
    return (
      <section className={m15.statusCard}>
        <p className={m15.introText}>{t("developer.intro.apply.needLogin")}</p>
        <div className={m15.actionRow}>
          <Link
            href="/G_Auth/login?redirect=/G_DeveloperIntro"
            className={m15.primaryButton}
          >
            <KeyRound size={15} strokeWidth={1.8} aria-hidden />
            {t("developer.intro.apply.login")}
          </Link>
        </div>
      </section>
    );
  }

  /* ---------- 组织所有者：免申请 ---------- */
  if (isOrgOwner) {
    return (
      <section className={m15.statusCard}>
        <p className={m15.introText}>{t("developer.intro.apply.orgOwnerNotice")}</p>
        <div className={m15.actionRow}>
          <button
            type="button"
            className={m15.primaryButton}
            onClick={() =>
              window.open(iGM_DeveloperConsoleUrl, "_blank", "noopener,noreferrer")
            }
          >
            {t("developer.intro.apply.enterConsole")}
          </button>
        </div>
      </section>
    );
  }

  if (checking) {
    return (
      <div className={uiStyles.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("community.state.loading")}
      </div>
    );
  }

  /* ---------- 已有待审 / 已通过申请：引导至状态页 ---------- */
  if (latest && (latest.status === "pending" || latest.status === "approved")) {
    return (
      <section className={m15.statusCard}>
        <p className={m15.introText}>
          {latest.status === "approved"
            ? t("developer.intro.apply.approvedNotice")
            : t("developer.intro.apply.pendingNotice")}
        </p>
        <div className={m15.actionRow}>
          {latest.status === "approved" ? (
            <Link href="/G_DeveloperPortal" className={m15.primaryButton}>
              {t("developer.intro.apply.enterConsole")}
            </Link>
          ) : (
            <Link href="/G_DeveloperStatus" className={m15.primaryButton}>
              {t("developer.intro.apply.viewStatus")}
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={m15.form}>
      <p className={m15.introText}>{t("developer.intro.apply.formDesc")}</p>

      {/* 步骤条 */}
      <div className={styles.stepBar}>
        {iGM_ApplySteps.map((key, index) => {
          const done = index < step;
          const activeStep = index === step;
          return (
            <span
              key={key}
              className={`${styles.stepItem} ${activeStep ? styles.stepItemActive : ""} ${
                done ? styles.stepItemDone : ""
              }`}
            >
              <span className={styles.stepDot}>
                {done ? <CircleCheck size={14} strokeWidth={2} /> : index + 1}
              </span>
              <span>{t(`developer.intro.apply.step_${key}`)}</span>
            </span>
          );
        })}
      </div>

      {/* 第一步：身份信息 */}
      {step === 0 && (
        <>
          <label className={m15.field}>
            <span className={m15.label}>{t("developer.intro.apply.developerName")}</span>
            <input
              className={m15.input}
              value={developerName}
              maxLength={60}
              onChange={(event) => setDeveloperName(event.target.value)}
            />
          </label>
          <p className={styles.hint}>{t("developer.intro.apply.developerNameHint")}</p>

          <div className={styles.grid3}>
            <label className={m15.field}>
              <span className={m15.label}>{t("developer.intro.apply.age")}</span>
              <input
                className={m15.input}
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                placeholder={t("developer.intro.apply.agePlaceholder")}
              />
            </label>
            <label className={m15.field}>
              <span className={m15.label}>{t("developer.intro.apply.birthMonth")}</span>
              <select
                className={m15.select}
                value={birthMonth}
                onChange={(event) => setBirthMonth(event.target.value)}
              >
                <option value="">-</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </label>
            <label className={m15.field}>
              <span className={m15.label}>{t("developer.intro.apply.birthDay")}</span>
              <select
                className={m15.select}
                value={birthDay}
                onChange={(event) => setBirthDay(event.target.value)}
              >
                <option value="">-</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

      {/* 第二步：联系方式与地址 */}
      {step === 1 && (
        <>
          <div className={styles.grid2}>
            <label className={m15.field}>
              <span className={m15.label}>{t("developer.intro.apply.email")}</span>
              <input
                className={m15.input}
                type="email"
                value={contactEmail}
                maxLength={120}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder={t("developer.intro.apply.emailPlaceholder")}
              />
            </label>
            <label className={m15.field}>
              <span className={m15.label}>{t("developer.intro.apply.phone")}</span>
              <input
                className={m15.input}
                value={contactPhone}
                maxLength={40}
                onChange={(event) => setContactPhone(event.target.value)}
                placeholder={t("developer.intro.apply.phonePlaceholder")}
              />
            </label>
          </div>
          <p className={styles.hint}>{t("developer.intro.apply.contactHint")}</p>

          <div className={styles.grid3}>
            <label className={m15.field}>
              <span className={m15.label}>{t("developer.intro.apply.country")}</span>
              <input
                className={m15.input}
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              />
            </label>
            <label className={m15.field}>
              <span className={m15.label}>{t("developer.intro.apply.province")}</span>
              <input
                className={m15.input}
                value={province}
                onChange={(event) => setProvince(event.target.value)}
              />
            </label>
            <label className={m15.field}>
              <span className={m15.label}>{t("developer.intro.apply.city")}</span>
              <input
                className={m15.input}
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </label>
          </div>

          <label className={m15.field}>
            <span className={m15.label}>{t("developer.intro.apply.address")}</span>
            <input
              className={m15.input}
              value={address}
              maxLength={200}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>

          <label className={m15.field}>
            <span className={m15.label}>{t("developer.intro.apply.postalCode")}</span>
            <input
              className={m15.input}
              value={postalCode}
              maxLength={20}
              onChange={(event) => setPostalCode(event.target.value)}
            />
          </label>
        </>
      )}

      {/* 第三步：项目与说明 */}
      {step === 2 && (
        <>
          <label className={m15.field}>
            <span className={m15.label}>{t("developer.intro.apply.projectName")}</span>
            <input
              className={m15.input}
              value={projectName}
              maxLength={60}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder={t("developer.intro.apply.projectNamePlaceholder")}
            />
          </label>

          <label className={m15.field}>
            <span className={m15.label}>{t("developer.intro.apply.projectIntro")}</span>
            <textarea
              className={m15.textarea}
              value={projectIntro}
              maxLength={1000}
              onChange={(event) => setProjectIntro(event.target.value)}
              placeholder={t("developer.intro.apply.projectIntroPlaceholder")}
            />
          </label>
          <div className={styles.counterRow}>
            <span>{t("developer.intro.apply.projectIntroHint")}</span>
            <span className={introValue.length > iGM_ProjectIntroMin ? styles.counterOk : styles.counterWarn}>
              {t("developer.intro.apply.counter", {
                count: introValue.length,
                min: iGM_ProjectIntroMin,
              })}
            </span>
          </div>

          <label className={m15.field}>
            <span className={m15.label}>
              {t("developer.intro.apply.domain")}
              <span className={m15.optional}>{t("developer.apply.optional")}</span>
            </span>
            <input
              className={m15.input}
              value={domain}
              maxLength={253}
              onChange={(event) => setDomain(event.target.value)}
              placeholder={t("developer.intro.apply.domainPlaceholder")}
            />
          </label>

          <label className={m15.field}>
            <span className={m15.label}>{t("developer.intro.apply.reason")}</span>
            <textarea
              className={m15.textarea}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("developer.intro.apply.reasonPlaceholder")}
            />
          </label>
          <div className={styles.counterRow}>
            <span>{t("developer.intro.apply.reasonHint")}</span>
            <span className={reasonValue.length > iGM_ReasonMin ? styles.counterOk : styles.counterWarn}>
              {t("developer.intro.apply.counter", {
                count: reasonValue.length,
                min: iGM_ReasonMin,
              })}
            </span>
          </div>

          <label className={m15.field}>
            <span className={m15.label}>
              {t("developer.intro.apply.additional")}
              <span className={m15.optional}>{t("developer.apply.optional")}</span>
            </span>
            <textarea
              className={m15.textarea}
              value={additional}
              maxLength={500}
              onChange={(event) => setAdditional(event.target.value)}
              placeholder={t("developer.intro.apply.additionalPlaceholder")}
            />
          </label>

          <label className={m15.checkboxRow}>
            <input
              type="checkbox"
              className={m15.checkbox}
              checked={agreeRules}
              onChange={(event) => setAgreeRules(event.target.checked)}
            />
            <span>{t("developer.intro.apply.agreeRules")}</span>
          </label>
        </>
      )}

      {error && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>{error}</div>
      )}

      {/* 操作区 */}
      <div className={m15.actionRow}>
        {step > 0 && (
          <button
            type="button"
            className={m15.ghostButton}
            disabled={submitting}
            onClick={() => setStep((current) => current - 1)}
          >
            <ChevronLeft size={15} strokeWidth={1.8} aria-hidden />
            {t("developer.intro.apply.prev")}
          </button>
        )}
        {step < iGM_ApplySteps.length - 1 ? (
          <button
            type="button"
            className={m15.primaryButton}
            disabled={!stepValid}
            onClick={() => setStep((current) => current + 1)}
          >
            {t("developer.intro.apply.next")}
            <ChevronRight size={15} strokeWidth={1.8} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className={m15.primaryButton}
            disabled={!stepValid || submitting}
            onClick={iGM_HandleSubmit}
          >
            {submitting
              ? t("developer.intro.apply.submitting")
              : t("developer.intro.apply.submit")}
          </button>
        )}
      </div>

      {/* 提交成功弹窗 */}
      {submitted && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <span className={styles.modalIcon}>
              <CircleCheck size={22} strokeWidth={1.8} />
            </span>
            <h2 className={styles.modalTitle}>
              {t("developer.intro.apply.submittedTitle")}
            </h2>
            <p className={styles.modalText}>{t("developer.intro.apply.submittedNotice")}</p>
            <div className={m15.actionRow}>
              <Link href="/G_DeveloperStatus" className={m15.primaryButton}>
                {t("developer.intro.apply.viewStatus")}
              </Link>
              <button
                type="button"
                className={m15.ghostButton}
                onClick={() => setSubmitted(false)}
              >
                <X size={15} strokeWidth={1.8} aria-hidden />
                {t("developer.intro.apply.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- 标签二：申请文档 ---------- */

/** 申请文档面板（公开，右侧 ON THIS PAGE 目录） */
function iGM_DocsPanel() {
  const t = useTranslations();

  const tocItems = useMemo(
    () =>
      (
        [
          { id: "intro-docs-benefits", key: "benefits" },
          { id: "intro-docs-process", key: "process" },
          { id: "intro-docs-quota", key: "quota" },
          { id: "intro-docs-criteria", key: "criteria" },
          { id: "intro-docs-norms", key: "norms" },
          { id: "intro-docs-contact", key: "contact" },
        ] as const
      ).map((item) => ({
        id: item.id,
        label: t(`developer.intro.docs.${item.key}.title`),
        level: 1 as const,
      })),
    [t],
  );

  return (
    <div className={m15.docLayout}>
      {/* 平板：目录折叠到顶部 */}
      <div className={m15.tocTop}>
        <IGM_PageToc
          variant="top"
          items={tocItems}
          title={t("developer.intro.docs.toc")}
        />
      </div>

      <article className={m15.docBody}>
        <p className={m15.docMeta}>{t("developer.intro.docs.lead")}</p>

        <section id="intro-docs-benefits">
          <h2 className={m15.docH2}>{t("developer.intro.docs.benefits.title")}</h2>
          <p className={m15.docP}>{t("developer.intro.docs.benefits.intro")}</p>
          <ul className={m15.docList}>
            <li>{t("developer.intro.docs.benefits.api")}</li>
            <li>{t("developer.intro.docs.benefits.sdk")}</li>
            <li>{t("developer.intro.docs.benefits.quota")}</li>
            <li>{t("developer.intro.docs.benefits.publicity")}</li>
          </ul>
        </section>

        <section id="intro-docs-process">
          <h2 className={m15.docH2}>{t("developer.intro.docs.process.title")}</h2>
          <p className={m15.docP}>{t("developer.intro.docs.process.intro")}</p>
          <ol className={m15.docList}>
            <li>{t("developer.intro.docs.process.submit")}</li>
            <li>{t("developer.intro.docs.process.review")}</li>
            <li>{t("developer.intro.docs.process.publicity")}</li>
            <li>{t("developer.intro.docs.process.result")}</li>
          </ol>
        </section>

        <section id="intro-docs-quota">
          <h2 className={m15.docH2}>{t("developer.intro.docs.quota.title")}</h2>
          <p className={m15.docP}>{t("developer.intro.docs.quota.line1")}</p>
          <p className={m15.docP}>{t("developer.intro.docs.quota.line2")}</p>
        </section>

        <section id="intro-docs-criteria">
          <h2 className={m15.docH2}>{t("developer.intro.docs.criteria.title")}</h2>
          <p className={m15.docP}>{t("developer.intro.docs.criteria.intro")}</p>
          <ul className={m15.docList}>
            <li>{t("developer.intro.docs.criteria.authenticity")}</li>
            <li>{t("developer.intro.docs.criteria.compliance")}</li>
            <li>{t("developer.intro.docs.criteria.contribution")}</li>
            <li>{t("developer.intro.docs.criteria.activity")}</li>
          </ul>
        </section>

        <section id="intro-docs-norms">
          <h2 className={m15.docH2}>{t("developer.intro.docs.norms.title")}</h2>
          <p className={m15.docP}>{t("developer.intro.docs.norms.intro")}</p>
          <ul className={m15.docList}>
            <li>{t("developer.intro.docs.norms.length")}</li>
            <li>{t("developer.intro.docs.norms.truth")}</li>
            <li>{t("developer.intro.docs.norms.agree")}</li>
            <li>{t("developer.intro.docs.norms.batch")}</li>
          </ul>
        </section>

        <section id="intro-docs-contact">
          <h2 className={m15.docH2}>{t("developer.intro.docs.contact.title")}</h2>
          <p className={m15.docP}>{t("developer.intro.docs.contact.intro")}</p>
          <ul className={m15.docList}>
            <li>{t("developer.intro.docs.contact.email")}</li>
            <li>{t("developer.intro.docs.contact.owner")}</li>
          </ul>
        </section>
      </article>

      {/* 桌面：右侧常驻目录 */}
      <aside className={m15.tocRail}>
        <IGM_PageToc items={tocItems} title={t("developer.intro.docs.toc")} />
      </aside>
    </div>
  );
}

/* ---------- 标签三：开发者公示 ---------- */

/** 开发者公示面板（公开，按批次分组，最新批次置顶） */
function iGM_PublicityPanel() {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const router = iGM_UseLocaleRouter();

  const [batches, setBatches] = useState<iGM_DeveloperPublicityBatch[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const iGM_Load = useCallback(() => {
    let cancelled = false;
    setLoadFailed(false);
    setBatches(null);
    iGM_ApiGetDeveloperPublicity()
      .then((response) => {
        if (!cancelled) setBatches(response.data?.batches ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => iGM_Load(), [iGM_Load]);

  if (loadFailed) {
    return (
      <>
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>
          {t("developer.intro.publicity.loadFailed")}
        </div>
        <div className={m15.actionRow}>
          <button type="button" className={m15.ghostButton} onClick={iGM_Load}>
            {t("developer.portal.retry")}
          </button>
        </div>
      </>
    );
  }

  if (!batches) {
    return (
      <div className={uiStyles.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("community.state.loading")}
      </div>
    );
  }

  return (
    <section>
      <p className={m15.introText}>{t("developer.intro.publicity.lead")}</p>

      {batches.length === 0 ? (
        <div className={m15.statusCard}>
          <p className={m15.introText}>{t("developer.intro.publicity.empty")}</p>
          <div className={m15.actionRow}>
            <button
              type="button"
              className={m15.primaryButton}
              onClick={() => router.push("/G_DeveloperIntro")}
            >
              {t("developer.intro.apply.viewStatus")}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.batchList}>
          {batches.map((batch, index) => (
            <div key={batch.id} className={styles.batchCard}>
              <div className={styles.batchHead}>
                <h2 className={styles.batchTitle}>
                  <Megaphone size={16} strokeWidth={1.8} aria-hidden />
                  {batch.batchName}
                  {index === 0 && (
                    <span className={`${m15.stateBadge} ${m15.stateBadgeApproved}`}>
                      {t("developer.intro.publicity.latest")}
                    </span>
                  )}
                </h2>
                <span className={styles.batchMeta}>
                  <span>{t("developer.intro.publicity.quota", { quota: batch.quota })}</span>
                  <span>
                    {t("developer.intro.publicity.count", { count: batch.items.length })}
                  </span>
                  {batch.publishedAt && (
                    <span>
                      {t("developer.intro.publicity.publishedAt")}
                      {" · "}
                      {iGM_FormatDate(locale, batch.publishedAt)}
                    </span>
                  )}
                </span>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t("developer.intro.publicity.developerName")}</th>
                      <th>{t("developer.intro.publicity.uid")}</th>
                      <th>{t("developer.intro.publicity.projectName")}</th>
                      <th>{t("developer.intro.publicity.approvedAt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.developerName}</td>
                        <td>{item.uid || "-"}</td>
                        <td>{item.projectName}</td>
                        <td>{iGM_FormatDate(locale, item.approvedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 公示说明 */}
      <div className={m15.reviewHint} style={{ marginTop: 16 }}>
        <ShieldCheck size={15} strokeWidth={1.8} aria-hidden />
        <span>
          <ul className={styles.noteList}>
            <li>{t("developer.intro.publicity.note1")}</li>
            <li>{t("developer.intro.publicity.note2")}</li>
            <li>{t("developer.intro.publicity.note3")}</li>
          </ul>
        </span>
      </div>
    </section>
  );
}

// 组件大写别名：JSX 要求组件标识符首字母大写
const IGM_ApplyPanel = iGM_ApplyPanel;
const IGM_DocsPanel = iGM_DocsPanel;
const IGM_PublicityPanel = iGM_PublicityPanel;

// 导出 //
export default iGM_DeveloperIntroPage;