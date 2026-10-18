/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Installer/iGM_LauncherV2_Installer.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Installer
 * 模块：iGM_LauncherV2_Installer
 * 作用：安装程序纯静态 UI 方案（Windows 版）
 * 内容：流体云背景 + 居中艺术字体标题；四步向导
 *       选择路径 -> 同意协议 -> 安装进度 -> 完成；
 *       进度以缓动函数平滑推进，仅作界面方案演示，真实安装逻辑留待后续模块接入
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, FolderOpen, Laptop } from "lucide-react";
import { iGM_LauncherV2_AppearanceHost as IGM_LauncherV2_AppearanceHost } from "@/components/iGM_LauncherV2_AppearanceHost/iGM_LauncherV2_AppearanceHost";
import {
  iGM_LauncherV2_BrowseFolder,
  iGM_LauncherV2_CompleteInstall,
  iGM_LauncherV2_Navigate,
  iGM_LauncherV2_OnFolderPicked,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  iGM_LauncherV2_Button as IGM_LauncherV2_Button,
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import { IGM_LAUNCHERV2_VERSION } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_Installer.module.css";

// 类型定义 //

/** 向导步骤索引：0 选择路径 / 1 同意协议 / 2 安装进度 / 3 完成 */
type iGM_InstallerStep = 0 | 1 | 2 | 3;

/** 步骤展示信息 */
interface iGM_InstallerStepMeta {
  index: iGM_InstallerStep;
  label: string;
}

// 常量与文案 //

const IGM_INSTALLER_STEPS: iGM_InstallerStepMeta[] = [
  { index: 0, label: "选择路径" },
  { index: 1, label: "同意协议" },
  { index: 2, label: "安装进度" },
  { index: 3, label: "完成" },
];

/** 默认安装路径（Windows 版本） */
const IGM_DEFAULT_INSTALL_PATH = "C:\\Program Files\\iGM CraftCeon Launcher";

/** 安装占用空间提示（界面方案演示数值） */
const IGM_REQUIRED_SPACE = "约 180 MB";

/** 许可协议正文（Windows 版本，界面方案演示文案） */
const IGM_LICENSE_TEXT = [
  "iGM CraftCeon Launcher 最终用户许可协议（Windows 版本）",
  "",
  "一、本软件由 iGCraftLit Community 团队开发并向社区免费提供，用于启动与管理 Minecraft 游戏与视界。",
  "二、使用本软件需遵守 iGCraftLit 社区用户管理规定。请勿将本软件用于任何违反当地法律法规的用途。",
  "三、本软件按「现状」提供，不附带任何形式的明示或默示担保。因使用本软件造成的游戏存档、资源文件损失，团队不承担赔偿责任。",
  "四、本软件会读取本机游戏目录与日志文件，用于视界管理与故障排查；所有数据仅保存在本地，不会自动上传至服务器。",
  "五、社区账号授权采用 OAuth 2.0 + PKCE 公开客户端流程，启动器不存储您的社区账号密码。",
  "六、团队保留在不另行通知的情况下更新本协议与软件功能的权利。继续使用即视为接受更新后的条款。",
  "",
  "如有问题请联系：igcraftlit@outlook.com",
].join("\n");

// 核心逻辑 //
export function iGM_LauncherV2_Installer() {
  const [step, setStep] = useState<iGM_InstallerStep>(0);
  const [installPath, setInstallPath] = useState(IGM_DEFAULT_INSTALL_PATH);
  const [licenseScrolled, setLicenseScrolled] = useState(false);
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [progress, setProgress] = useState(0);
  const licenseBoxRef = useRef<HTMLDivElement | null>(null);

  // 安装进度：进入安装步骤后以缓动方式平滑推进，接近完成时收尾
  useEffect(() => {
    if (step !== 2) return;

    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = current + (100 - current) * 0.055 + 0.35;
        return next >= 99.5 ? 100 : next;
      });
    }, 90);

    return () => window.clearInterval(timer);
  }, [step]);

  // 进度抵达 100% 后短暂停留，再切换到完成步骤
  useEffect(() => {
    if (step !== 2 || progress < 100) return;
    const timer = window.setTimeout(() => setStep(3), 480);
    return () => window.clearTimeout(timer);
  }, [step, progress]);

  // 订阅外壳回推的目录选择结果，选中后写入安装路径
  useEffect(
    () => iGM_LauncherV2_OnFolderPicked((path) => setInstallPath(path)),
    [],
  );

  /** 打开原生目录选择器；浏览器预览下无原生对话框，保留手动输入 */
  const handleBrowse = () => {
    iGM_LauncherV2_BrowseFolder(installPath);
  };

  /** 完成安装：外壳内写入标记并进入主界面；浏览器预览下跳转到欢迎页 */
  const handleFinish = () => {
    if (!iGM_LauncherV2_CompleteInstall()) iGM_LauncherV2_Navigate("/");
  };

  /** 协议正文滚动到底部后才允许勾选 */
  const handleLicenseScroll = () => {
    const box = licenseBoxRef.current;
    if (!box) return;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 8) setLicenseScrolled(true);
  };

  const percent = Math.min(100, Math.round(progress));

  return (
    <div className={`igm-screen igm-page ${styles.screen}`}>
      <IGM_LauncherV2_AppearanceHost />

      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>iGM CraftCeon Launcher</h1>
          <p className={styles.subtitle}>
            安装向导 · Windows 版本 · v{IGM_LAUNCHERV2_VERSION}
          </p>
        </header>

        <IGM_LauncherV2_Card className={styles.panel}>
          {/* 步骤指示：已完成步骤显示对勾，当前步骤高亮 */}
          <ol className={styles.steps}>
            {IGM_INSTALLER_STEPS.map((item) => {
              const done = step > item.index;
              const active = step === item.index;
              return (
                <li
                  key={item.index}
                  className={`${styles.stepItem} ${active ? styles.stepActive : ""} ${
                    done ? styles.stepDone : ""
                  }`}
                >
                  <span className={styles.stepIndex}>
                    {done ? <Check size={13} strokeWidth={2.6} /> : item.index + 1}
                  </span>
                  <span className={styles.stepLabel}>{item.label}</span>
                  {item.index < IGM_INSTALLER_STEPS.length - 1 ? (
                    <ChevronRight size={14} strokeWidth={2} className={styles.stepArrow} />
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className={styles.body}>
            {step === 0 ? (
              <div className={styles.block}>
                <label className={styles.fieldLabel} htmlFor="igm-install-path">
                  安装位置
                </label>
                <div className={styles.pathRow}>
                  <input
                    id="igm-install-path"
                    className={styles.input}
                    value={installPath}
                    spellCheck={false}
                    onChange={(event) => setInstallPath(event.target.value)}
                  />
                  <IGM_LauncherV2_Button
                    variant="secondary"
                    icon={<FolderOpen size={15} strokeWidth={2.1} />}
                    onClick={handleBrowse}
                  >
                    浏览
                  </IGM_LauncherV2_Button>
                </div>
                <p className={styles.meta}>
                  需要空间 {IGM_REQUIRED_SPACE} · 安装后可随时在启动器设置中变更资源目录
                </p>
                <p className={styles.notice}>
                  <Laptop size={13} strokeWidth={1.9} />
                  <span>当前方案仅提供 Windows 版本安装向导。</span>
                </p>
              </div>
            ) : null}

            {step === 1 ? (
              <div className={styles.block}>
                <div
                  ref={licenseBoxRef}
                  className={`${styles.license} igm-scroll`}
                  onScroll={handleLicenseScroll}
                >
                  {IGM_LICENSE_TEXT}
                </div>
                <label className={styles.agreeRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    disabled={!licenseScrolled}
                    checked={licenseAccepted}
                    onChange={(event) => setLicenseAccepted(event.target.checked)}
                  />
                  <span>
                    {licenseScrolled
                      ? "我已阅读并同意上述许可协议"
                      : "请先将协议内容滚动到底部后再勾选"}
                  </span>
                </label>
              </div>
            ) : null}

            {step === 2 ? (
              <div className={styles.block}>
                <p className={styles.progressTitle}>正在写入启动器文件…</p>
                <div className={styles.progressTrack}>
                  <div className={styles.progressBar} style={{ width: `${percent}%` }} />
                </div>
                <div className={styles.progressMeta}>
                  <span>{percent}%</span>
                  <span className={styles.progressPath}>{installPath}</span>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className={`${styles.block} ${styles.doneBlock}`}>
                <span className={styles.doneBadge}>
                  <Check size={22} strokeWidth={2.4} />
                </span>
                <p className={styles.progressTitle}>安装完成</p>
                <p className={styles.meta}>
                  iGM CraftCeon Launcher 已安装至 {installPath}，可从桌面快捷方式启动。
                </p>
              </div>
            ) : null}
          </div>

          <footer className={styles.footer}>
            <span className={styles.footerNote}>iGCraftLit Community 团队</span>
            <div className={styles.footerActions}>
              {step === 0 ? (
                <IGM_LauncherV2_Button variant="primary" onClick={() => setStep(1)}>
                  下一步
                </IGM_LauncherV2_Button>
              ) : null}
              {step === 1 ? (
                <>
                  <IGM_LauncherV2_Button variant="ghost" onClick={() => setStep(0)}>
                    上一步
                  </IGM_LauncherV2_Button>
                  <IGM_LauncherV2_Button
                    variant="primary"
                    disabled={!licenseAccepted}
                    onClick={() => setStep(2)}
                  >
                    开始安装
                  </IGM_LauncherV2_Button>
                </>
              ) : null}
              {step === 2 ? (
                <IGM_LauncherV2_Button variant="secondary" disabled>
                  安装中…
                </IGM_LauncherV2_Button>
              ) : null}
              {step === 3 ? (
                <IGM_LauncherV2_Button variant="primary" onClick={handleFinish}>
                  完成并进入启动器
                </IGM_LauncherV2_Button>
              ) : null}
            </div>
          </footer>
        </IGM_LauncherV2_Card>
      </main>
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_Installer;
