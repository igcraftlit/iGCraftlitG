/**
 * 文件路径：apps/launcher-ui/components/iGM_Installer/iGM_Installer_Wizard.tsx
 * 所属层：前端 / 安装向导层
 * 路由：G_Installer
 * 模块：iGM_Installer_Wizard
 * 作用：安装程序四步向导（选择语言 → 用户管理规定 → 安装位置与进度 → 完成）
 * 内容：语言选择即写入客户端语言上下文（安装流程与启动器首启共用）；
 *       用户管理规定须滚动到底部才可勾选，未勾选时「继续安装」置灰；
 *       安装位置默认取主进程给出的默认目录并可更换；
 *       安装进度来自主进程回推的 installer:progress；
 *       完成后提供「打开启动器」与「完成」，快捷方式由主进程在安装阶段创建
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, FolderOpen, Languages, Play, RotateCw, ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_INSTALLER_VERSION,
  IGM_LAUNCHER_LOCALES,
  type iGM_Launcher_Locale,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_Input as IGM_Launcher_Input } from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import { iGM_Launcher_WindowControls as IGM_Launcher_WindowControls } from "@/components/iGM_Launcher_WindowControls/iGM_Launcher_WindowControls";
import { iGM_Launcher_UseLocale } from "@/components/iGM_Launcher_Providers/iGM_Launcher_LocaleProvider";
import {
  iGM_Installer_SendHost as iGM_Installer_SendHost,
  iGM_Installer_UseHostState as iGM_Installer_UseHostState,
} from "@/components/iGM_Installer/iGM_Installer_HostBridge";
import styles from "./iGM_Installer_Wizard.module.css";

// 类型定义 //
/** 向导步骤序号 */
type iGM_Installer_StepId = 0 | 1 | 2 | 3;

/** 管理规定各章节的文案键 */
const IGM_INSTALLER_TERM_SECTIONS: readonly { title: string; body: string }[] = [
  { title: "termsSection1Title", body: "termsSection1Body" },
  { title: "termsSection2Title", body: "termsSection2Body" },
  { title: "termsSection3Title", body: "termsSection3Body" },
  { title: "termsSection4Title", body: "termsSection4Body" },
  { title: "termsSection5Title", body: "termsSection5Body" },
];

/** 安装阶段到文案键的映射 */
const IGM_INSTALLER_PHASE_LABEL: Record<string, string> = {
  prepare: "phasePrepare",
  copy: "phaseCopy",
  shortcut: "phaseShortcut",
  done: "phaseDone",
  failed: "phaseFailed",
};

// 核心逻辑 //
export function iGM_Installer_Wizard() {
  const t = useTranslations("installer");
  const { locale, setLocale } = iGM_Launcher_UseLocale();
  const host = iGM_Installer_UseHostState();

  const [step, setStep] = useState<iGM_Installer_StepId>(0);
  // 管理规定：滚动到底部才允许勾选
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const termsRef = useRef<HTMLDivElement>(null);
  // 安装位置：默认取主进程给出的默认目录
  const [installDir, setInstallDir] = useState("");
  // 安装已启动（进入进度视图，禁止重复点击）
  const [started, setStarted] = useState(false);

  // 向导挂载后向主进程索取默认安装目录与安装程序记录的语言
  useEffect(() => {
    iGM_Installer_SendHost({ type: "installer:init" });
  }, []);

  // 主进程回推默认目录后回填（用户已手动填写则不覆盖）
  useEffect(() => {
    if (!host.defaultDir) return;
    setInstallDir((current) => (current.trim() ? current : host.defaultDir ?? ""));
  }, [host.defaultDir]);

  // 用户经系统目录选择器挑中的目录直接覆盖当前值（取消选择时为 null，保持原值）
  useEffect(() => {
    if (!host.pickedDir) return;
    setInstallDir(host.pickedDir);
  }, [host.pickedDir]);

  // 管理规定内容短于一屏时视为已读，避免无法勾选
  useEffect(() => {
    if (step !== 1 || scrolledToEnd) return;
    const node = termsRef.current;
    if (!node) return;
    if (node.scrollHeight <= node.clientHeight + 8) setScrolledToEnd(true);
  }, [step, scrolledToEnd]);

  // 安装完成：主进程回推 done 后停留在完成页
  useEffect(() => {
    if (host.progress?.phase === "done") setStep(3);
  }, [host.progress?.phase]);

  const progress = host.progress;
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0));
  const phaseLabel = progress ? t(IGM_INSTALLER_PHASE_LABEL[progress.phase] ?? "phasePrepare") : t("phasePrepare");
  const failed = progress?.phase === "failed";

  /** 读取管理规定滚动位置，贴底则解锁勾选 */
  const handleTermsScroll = () => {
    const node = termsRef.current;
    if (!node) return;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 8) setScrolledToEnd(true);
  };

  /** 选择安装语言：同时写入安装配置（安装时上报主进程）与客户端语言上下文 */
  const chooseLocale = (code: iGM_Launcher_Locale) => setLocale(code);

  /** 开始安装：把语言与目录交给主进程，由主进程复制文件并创建快捷方式 */
  const startInstall = () => {
    if (!installDir.trim()) return;
    setStarted(true);
    iGM_Installer_SendHost({ type: "installer:begin", locale, dir: installDir.trim() });
  };

  const stepLabels = [t("stepLanguage"), t("stepTerms"), t("stepInstall"), t("stepDone")];

  return (
    <div className={styles.window}>
      {/* 标题栏：拖动区 + 窗口控制（安装程序窗口无原生边框） */}
      <header className={styles.titlebar}>
        <div className={styles.brand}>
          <Image
            src="/iGM_Launcher_Logo.ico"
            alt="iGM Launcher logo"
            width={20}
            height={20}
            className={styles.logo}
            priority
          />
          <span className={styles.brandName}>{t("appName")}</span>
        </div>
        <div className={styles.titlebarRight}>
          <span className={styles.version}>{t("version", { version: IGM_INSTALLER_VERSION })}</span>
          <IGM_Launcher_WindowControls />
        </div>
      </header>

      {/* 步骤指示 */}
      <ol className={styles.steps}>
        {stepLabels.map((label, index) => (
          <li
            key={label}
            className={[
              styles.stepItem,
              index === step ? styles.stepItemActive : "",
              index < step ? styles.stepItemDone : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className={styles.stepIndex}>{index < step ? <Check size={12} strokeWidth={2.2} /> : index + 1}</span>
            <span className={styles.stepLabel}>{label}</span>
          </li>
        ))}
      </ol>

      <main className={styles.body}>
        {/* 步骤一：选择语言 */}
        {step === 0 ? (
          <section className={styles.panel}>
            <h1 className={styles.panelTitle}>
              <Languages size={16} strokeWidth={1.8} />
              {t("languageTitle")}
            </h1>
            <p className={styles.panelDesc}>{t("languageDesc")}</p>
            <div className={styles.localeList}>
              {IGM_LAUNCHER_LOCALES.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={[
                    styles.localeCard,
                    locale === option.value ? styles.localeCardActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => chooseLocale(option.value)}
                >
                  <Languages size={15} strokeWidth={1.8} />
                  <span className={styles.localeLabel}>{option.label}</span>
                  <span className={styles.localeCode}>{option.value}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* 步骤二：用户管理规定（滚动到底部才可勾选） */}
        {step === 1 ? (
          <section className={styles.panel}>
            <h1 className={styles.panelTitle}>
              <ScrollText size={16} strokeWidth={1.8} />
              {t("termsTitle")}
            </h1>
            <p className={styles.panelDesc}>{t("termsDesc")}</p>
            <div
              ref={termsRef}
              className={`${styles.terms} igm-scroll`}
              onScroll={handleTermsScroll}
              tabIndex={0}
            >
              {IGM_INSTALLER_TERM_SECTIONS.map((section) => (
                <div key={section.title} className={styles.termSection}>
                  <h2 className={styles.termTitle}>{t(section.title)}</h2>
                  <p className={styles.termBody}>{t(section.body)}</p>
                </div>
              ))}
              <p className={styles.termContact}>{t("termsContact")}</p>
            </div>
            <label className={[styles.agreeRow, scrolledToEnd ? "" : styles.agreeRowLocked].filter(Boolean).join(" ")}>
              <input
                type="checkbox"
                className={styles.agreeInput}
                checked={agreed}
                disabled={!scrolledToEnd}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              <span>{t("termsAgree")}</span>
            </label>
            {scrolledToEnd ? null : <p className={styles.scrollHint}>{t("termsScrollHint")}</p>}
          </section>
        ) : null}

        {/* 步骤三：安装位置与进度 */}
        {step === 2 ? (
          <section className={styles.panel}>
            <h1 className={styles.panelTitle}>
              <FolderOpen size={16} strokeWidth={1.8} />
              {started ? t("progressTitle") : t("installTitle")}
            </h1>

            <label className={styles.fieldLabel} htmlFor="igm-installer-dir">
              {t("installDirLabel")}
            </label>
            <div className={styles.fieldRow}>
              <IGM_Launcher_Input
                id="igm-installer-dir"
                className={styles.field}
                value={installDir}
                disabled={started}
                placeholder={t("installDirDefault")}
                aria-label={t("installDirLabel")}
                onChange={(event) => setInstallDir(event.target.value)}
              />
              <IGM_Launcher_Button
                variant="secondary"
                disabled={started || !host.isHost}
                onClick={() => iGM_Installer_SendHost({ type: "installer:pick-dir", current: installDir })}
              >
                <FolderOpen size={14} strokeWidth={1.8} />
                {t("browse")}
              </IGM_Launcher_Button>
              <IGM_Launcher_Button
                variant="ghost"
                disabled={started}
                onClick={() => setInstallDir(host.defaultDir ?? "")}
              >
                {t("installDirDefault")}
              </IGM_Launcher_Button>
            </div>
            <p className={styles.panelDesc}>{t("installDirDesc")}</p>

            {started ? (
              <IGM_Launcher_Card className={styles.progressCard}>
                <div className={styles.progressHead}>
                  <span className={failed ? styles.progressFailed : styles.progressPhase}>
                    {phaseLabel}
                  </span>
                  <span className={styles.progressPercent}>{percent}%</span>
                </div>
                <div className={styles.progressTrack}>
                  <div
                    className={[styles.progressBar, failed ? styles.progressBarFailed : ""]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                {progress?.totalFiles ? (
                  <p className={styles.progressMeta}>
                    {t("progressFiles", {
                      copied: progress.copiedFiles ?? 0,
                      total: progress.totalFiles,
                    })}
                  </p>
                ) : null}
                {progress?.currentFile ? (
                  <p className={styles.progressFile} title={progress.currentFile}>
                    {t("progressCurrent", { file: progress.currentFile })}
                  </p>
                ) : null}
                {failed && progress?.message ? (
                  <p className={styles.progressFailed}>{progress.message}</p>
                ) : null}
              </IGM_Launcher_Card>
            ) : null}
          </section>
        ) : null}

        {/* 步骤四：完成 */}
        {step === 3 ? (
          <section className={styles.panel}>
            <h1 className={styles.panelTitle}>
              <Check size={16} strokeWidth={2} />
              {t("doneTitle")}
            </h1>
            <p className={styles.panelDesc}>{t("doneDesc")}</p>
            <p className={styles.doneDir} title={installDir}>
              {installDir}
            </p>
            <p className={styles.panelDesc}>{t("shortcutNote")}</p>
          </section>
        ) : null}
      </main>

      {/* 底部操作区 */}
      <footer className={styles.footer}>
        {step === 0 ? (
          <IGM_Launcher_Button variant="primary" onClick={() => setStep(1)}>
            {t("next")}
          </IGM_Launcher_Button>
        ) : null}

        {step === 1 ? (
          <>
            <IGM_Launcher_Button variant="ghost" onClick={() => setStep(0)}>
              {t("back")}
            </IGM_Launcher_Button>
            <IGM_Launcher_Button variant="primary" disabled={!agreed} onClick={() => setStep(2)}>
              {t("continueInstall")}
            </IGM_Launcher_Button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <IGM_Launcher_Button variant="ghost" disabled={started} onClick={() => setStep(1)}>
              {t("back")}
            </IGM_Launcher_Button>
            {failed ? (
              <IGM_Launcher_Button variant="primary" onClick={startInstall}>
                <RotateCw size={14} strokeWidth={1.8} />
                {t("installStart")}
              </IGM_Launcher_Button>
            ) : (
              <IGM_Launcher_Button
                variant="primary"
                disabled={started || !installDir.trim()}
                onClick={startInstall}
              >
                {t("installStart")}
              </IGM_Launcher_Button>
            )}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <IGM_Launcher_Button
              variant="secondary"
              onClick={() => iGM_Installer_SendHost({ type: "installer:open-launcher", dir: installDir })}
            >
              <Play size={14} strokeWidth={1.8} />
              {t("openLauncher")}
            </IGM_Launcher_Button>
            <IGM_Launcher_Button
              variant="primary"
              onClick={() => iGM_Installer_SendHost({ type: "installer:finish" })}
            >
              {t("finish")}
            </IGM_Launcher_Button>
          </>
        ) : null}
      </footer>
    </div>
  );
}

// 导出 //
export default iGM_Installer_Wizard;