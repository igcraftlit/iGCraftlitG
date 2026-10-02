/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_AccountMsBindPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Account_MSBind（SPA 页 id：accountMsBind）
 * 模块：iGM_Launcher_AccountMsBindPage
 * 作用：Minecraft 正版账号绑定页，提供设备代码与浏览器授权两条微软认证流程
 * 内容：设备代码流程展示用户代码与验证地址并自动轮询（主进程取得设备代码后自动打开浏览器，
 *       界面保留「复制代码 / 打开授权页」按钮兜底）；
 *       浏览器授权流程打开含 PKCE challenge 的授权页并等待本地回调；
 *       两流程共用认证链进度列表，失败时按 XSTS 错误码与本地化原因给出可操作提示；
 *       认证进度带 TTL，过期即剔除该次流程的全部状态并提示重新开始，仅展示当前有效流程
 *
 * 安全说明：页面只持有 flowId 引用，微软 refresh_token / access_token 全程留在主进程，
 *           任何阶段都不会进入渲染进程。
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppWindow,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Copy,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
  IGM_LAUNCHER_BRIDGE_UNAUTHORIZED,
  IGM_LAUNCHER_BRIDGE_UNREACHABLE,
  IGM_LAUNCHER_MC_AUTH_STAGES,
  IGM_LAUNCHER_MC_CLIENT_ID_MISSING,
  IGM_LAUNCHER_MC_FLOW_EXPIRED,
  IGM_LAUNCHER_MC_FLOW_TTL_MS,
  IGM_LAUNCHER_MC_NOT_OWNED,
  iGM_Launcher_MapXstsErrorKey,
  type iGM_Launcher_BrowserAuthStart,
  type iGM_Launcher_McAuthStage,
  type iGM_Launcher_MsaDeviceCode,
  type iGM_Launcher_MsaFlowResult,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_Segmented as IGM_Launcher_Segmented } from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import styles from "./iGM_Launcher_AccountMsBindPage.module.css";

// 类型定义 //
type iGM_Launcher_BindMethod = "device" | "browser";

// 核心逻辑 //

/** 认证阶段 -> 语言包键 */
function iGM_Launcher_StageKey(stage: iGM_Launcher_McAuthStage): string {
  return `stage${stage.charAt(0).toUpperCase()}${stage.slice(1)}`;
}

/** 流程失败结果 -> 提示键：先映射 XSTS 错误码，再按结构化错误码回退，最后用通用文案 */
function iGM_Launcher_FlowErrorKey(result: iGM_Launcher_MsaFlowResult): string {
  const xstsKey = iGM_Launcher_MapXstsErrorKey(result.errorCode);
  if (xstsKey) return xstsKey;
  if (result.errorCode === IGM_LAUNCHER_MC_NOT_OWNED) return "mcNotOwned";
  if (result.errorCode === IGM_LAUNCHER_MC_CLIENT_ID_MISSING) return "mcClientIdMissing";
  if (result.errorCode === IGM_LAUNCHER_MC_FLOW_EXPIRED) return "mcFlowExpired";
  if (result.errorCode === IGM_LAUNCHER_BRIDGE_UNAUTHORIZED) return "mcNotSignedIn";
  if (result.errorCode === IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED) return "mcBrowserUnsupported";
  if (result.errorCode === IGM_LAUNCHER_BRIDGE_UNREACHABLE) return "loginUnreachable";
  return "mcPollFailed";
}

export function iGM_Launcher_AccountMsBindPage() {
  const t = useTranslations("accountMsBind");
  const tNotice = useTranslations("notice");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const {
    account,
    mcStartDeviceCode,
    mcPollDeviceCode,
    mcStartBrowserAuth,
    mcCompleteBrowserAuth,
    mcBind,
  } = iGM_Launcher_UseStore();

  const [method, setMethod] = useState<iGM_Launcher_BindMethod>("device");
  const [deviceCode, setDeviceCode] = useState<iGM_Launcher_MsaDeviceCode | null>(null);
  const [browserAuth, setBrowserAuth] = useState<iGM_Launcher_BrowserAuthStart | null>(null);
  const [stageResult, setStageResult] = useState<iGM_Launcher_MsaFlowResult | null>(null);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // 认证失败的数字错误码（result.errorCode 或桥接响应码），与本地化原因一并展示
  const [errorCode, setErrorCode] = useState<number | null>(null);
  // 当前认证流程的截止时间戳：设备代码取 expiresIn，浏览器授权取共享流程 TTL
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  // 是否因超过 TTL 被剔除（用于回初始界面后展示本地化提示）
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);

  // 轮询上下文放进 ref：避免把令牌相关状态或流程对象塞进组件状态
  const pollRef = useRef<{ flowId: string; interval: number } | null>(null);

  /* 重置流程：清空该次认证的全部进度状态，回到「尚未开始」初始界面 */
  const reset = useCallback(() => {
    pollRef.current = null;
    setPolling(false);
    setDeviceCode(null);
    setBrowserAuth(null);
    setStageResult(null);
    setErrorKey(null);
    setErrorCode(null);
    setExpiresAt(null);
    setExpired(false);
    setCopied(false);
  }, []);

  /** 认证失败：清除已废弃流程的残留进度，仅保留错误码与本地化原因 */
  const failWith = useCallback((code: number | null, key: string) => {
    pollRef.current = null;
    setPolling(false);
    setDeviceCode(null);
    setBrowserAuth(null);
    setStageResult(null);
    setExpiresAt(null);
    setExpired(false);
    setErrorCode(code);
    setErrorKey(key);
  }, []);

  /** 完成绑定后先清除认证进度，再跳转到正版档案页（跳转行为保持不变） */
  const finishBind = useCallback(
    async (flowId: string) => {
      const ok = await mcBind(flowId);
      if (ok) {
        reset();
        navigate("account");
      }
      return ok;
    },
    [mcBind, navigate, reset],
  );

  /* 认证进度 TTL：到点即剔除该次认证的全部进度并提示重新开始 */
  useEffect(() => {
    if (expiresAt === null) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      reset();
      setExpired(true);
      return;
    }
    const timer = setTimeout(() => {
      reset();
      setExpired(true);
    }, remaining);
    return () => clearTimeout(timer);
  }, [expiresAt, reset]);

  /* 设备代码自动轮询：polling 置真即启动，脚本自行按 interval 续排 */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const tick = async () => {
      const current = pollRef.current;
      if (!current || stopped) return;
      const result = await mcPollDeviceCode(current.flowId);
      if (stopped) return;
      if (!result) {
        failWith(null, "mcPollFailed");
        return;
      }
      if (result.status === "done") {
        await finishBind(current.flowId);
        return;
      }
      if (result.status === "failed" || result.status === "expired") {
        failWith(result.errorCode, iGM_Launcher_FlowErrorKey(result));
        return;
      }
      // pending / slow-down：更新进度并继续等待
      setStageResult(result);
      timer = setTimeout(() => void tick(), current.interval * 1000);
    };

    if (polling) {
      timer = setTimeout(() => void tick(), (pollRef.current?.interval ?? 2) * 1000);
    }
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [polling, mcPollDeviceCode, finishBind, failWith]);

  const handleStartDeviceCode = async () => {
    reset();
    setBusy(true);
    const code = await mcStartDeviceCode();
    setBusy(false);
    if (!code) {
      failWith(null, "mcStartFailed");
      return;
    }
    setDeviceCode(code);
    setExpiresAt(Date.now() + code.expiresIn * 1000);
    pollRef.current = { flowId: code.flowId, interval: code.interval };
    setPolling(true);
  };

  const handleStartBrowserAuth = async () => {
    reset();
    setBusy(true);
    const auth = await mcStartBrowserAuth();
    setBusy(false);
    if (!auth) {
      failWith(null, "mcStartFailed");
      return;
    }
    setBrowserAuth(auth);
    setExpiresAt(Date.now() + IGM_LAUNCHER_MC_FLOW_TTL_MS);
    // 外壳内主进程会自行拉起浏览器；此处兜底再开一次，确保用户总能看到授权页
    window.open(auth.authorizeUrl, "_blank", "noopener");
  };

  const handleCompleteBrowserAuth = async () => {
    if (!browserAuth) return;
    setBusy(true);
    const result = await mcCompleteBrowserAuth(browserAuth.flowId);
    setBusy(false);
    if (!result) {
      failWith(null, "mcPollFailed");
      return;
    }
    if (result.status === "done") {
      await finishBind(browserAuth.flowId);
      return;
    }
    if (result.status === "pending") {
      setStageResult(result);
      return;
    }
    failWith(result.errorCode, iGM_Launcher_FlowErrorKey(result));
  };

  const handleCopyCode = async () => {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.userCode);
      setCopied(true);
    } catch {
      // 剪贴板不可用时保持原文，用户可手动选中复制
      setCopied(false);
    }
  };

  /* ---------- 未登录：需先登录社区账号 ---------- */
  if (!account.signedIn) {
    return (
      <div className={styles.page}>
        <IGM_Launcher_PageHeader
          title={t("title")}
          description={t("subtitle")}
          actions={
            <IGM_Launcher_Button variant="ghost" onClick={() => navigate("account")}>
              <ArrowLeft size={15} strokeWidth={1.8} />
              {t("back")}
            </IGM_Launcher_Button>
          }
        />

        <IGM_Launcher_Card className={styles.card}>
          <h3 className={styles.cardTitle}>
            <ShieldCheck size={15} strokeWidth={1.8} />
            {t("guestTitle")}
          </h3>
          <p className={styles.cardDesc}>{t("guestDesc")}</p>
          <div className={styles.actions}>
            <IGM_Launcher_Button variant="primary" onClick={() => navigate("accountLogin")}>
              {t("guestAction")}
            </IGM_Launcher_Button>
            <IGM_Launcher_Button variant="secondary" onClick={() => navigate("account")}>
              {t("back")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_Card>
      </div>
    );
  }

  /* ---------- 已登录：选择绑定方式 ---------- */
  const completed = new Set(stageResult?.completed ?? []);
  const activeStage = stageResult?.stage ?? "msa";
  const flowDone = stageResult?.status === "done";

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <IGM_Launcher_Button variant="ghost" onClick={() => navigate("account")}>
            <ArrowLeft size={15} strokeWidth={1.8} />
            {t("back")}
          </IGM_Launcher_Button>
        }
      />

      <IGM_Launcher_Card className={styles.card}>
        <div className={styles.methodRow}>
          <span className={styles.fieldLabel}>{t("methodLabel")}</span>
          <IGM_Launcher_Segmented
            ariaLabel={t("methodLabel")}
            value={method}
            onChange={(value) => {
              reset();
              setMethod(value as iGM_Launcher_BindMethod);
            }}
            options={[
              { value: "device", label: t("methodDevice"), icon: Smartphone },
              { value: "browser", label: t("methodBrowser"), icon: AppWindow },
            ]}
          />
          {method === "browser" ? (
            <IGM_Launcher_Badge tone="success">{t("methodRecommended")}</IGM_Launcher_Badge>
          ) : null}
        </div>

        {method === "device" ? (
          <div className={styles.methodBody}>
            <h3 className={styles.cardTitle}>
              <Smartphone size={15} strokeWidth={1.8} />
              {t("deviceTitle")}
            </h3>
            <p className={styles.cardDesc}>{t("deviceDesc")}</p>

            {deviceCode ? (
              <div className={styles.codeBlock}>
                <div className={styles.codeItem}>
                  <span className={styles.codeLabel}>{t("deviceCodeLabel")}</span>
                  <span className={styles.codeValue}>{deviceCode.userCode}</span>
                </div>
                <div className={styles.codeItem}>
                  <span className={styles.codeLabel}>{t("deviceUriLabel")}</span>
                  <span className={styles.codeLink}>{deviceCode.verificationUri}</span>
                </div>
              </div>
            ) : null}

            <div className={styles.actions}>
              {!deviceCode ? (
                <IGM_Launcher_Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void handleStartDeviceCode()}
                >
                  <Smartphone size={15} strokeWidth={1.8} />
                  {t("deviceStart")}
                </IGM_Launcher_Button>
              ) : (
                <>
                  <IGM_Launcher_Button variant="secondary" onClick={() => void handleCopyCode()}>
                    <Copy size={15} strokeWidth={1.8} />
                    {copied ? t("deviceCopied") : t("deviceCopy")}
                  </IGM_Launcher_Button>
                  <IGM_Launcher_Button
                    variant="secondary"
                    onClick={() =>
                      window.open(deviceCode.verificationUri, "_blank", "noopener")
                    }
                  >
                    <ExternalLink size={15} strokeWidth={1.8} />
                    {t("deviceOpen")}
                  </IGM_Launcher_Button>
                  <IGM_Launcher_Button variant="ghost" onClick={reset}>
                    {t("retry")}
                  </IGM_Launcher_Button>
                </>
              )}
            </div>

            {polling ? (
              <p className={styles.waitingLine}>
                <LoaderCircle size={14} strokeWidth={1.8} className={styles.spin} />
                {t("deviceWaiting")}
                <span className={styles.waitingHint}>
                  {t("devicePollHint", { seconds: deviceCode?.interval ?? 2 })}
                </span>
              </p>
            ) : null}
          </div>
        ) : (
          <div className={styles.methodBody}>
            <h3 className={styles.cardTitle}>
              <AppWindow size={15} strokeWidth={1.8} />
              {t("browserTitle")}
            </h3>
            <p className={styles.cardDesc}>{t("browserDesc")}</p>

            <div className={styles.actions}>
              {!browserAuth ? (
                <IGM_Launcher_Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void handleStartBrowserAuth()}
                >
                  <AppWindow size={15} strokeWidth={1.8} />
                  {t("browserStart")}
                </IGM_Launcher_Button>
              ) : (
                <>
                  <IGM_Launcher_Button
                    variant="secondary"
                    onClick={() =>
                      window.open(browserAuth.authorizeUrl, "_blank", "noopener")
                    }
                  >
                    <ExternalLink size={15} strokeWidth={1.8} />
                    {t("browserOpen")}
                  </IGM_Launcher_Button>
                  <IGM_Launcher_Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => void handleCompleteBrowserAuth()}
                  >
                    <ShieldCheck size={15} strokeWidth={1.8} />
                    {t("browserConfirm")}
                  </IGM_Launcher_Button>
                  <IGM_Launcher_Button variant="ghost" onClick={reset}>
                    {t("retry")}
                  </IGM_Launcher_Button>
                </>
              )}
            </div>
          </div>
        )}

        {expired ? (
          <p className={styles.errorLine}>
            <CircleAlert size={14} strokeWidth={1.8} />
            {t("expiredNotice")}
          </p>
        ) : null}
        {errorKey ? (
          <p className={styles.errorLine}>
            <CircleAlert size={14} strokeWidth={1.8} />
            {tNotice(errorKey)}
            {errorCode !== null ? (
              <span className={styles.errorCode}>{t("errorCodeLabel", { code: errorCode })}</span>
            ) : null}
          </p>
        ) : null}
        {stageResult?.status === "done" ? (
          <p className={styles.successLine}>
            <CheckCircle2 size={14} strokeWidth={1.8} />
            {t("resultDone")}
          </p>
        ) : null}
      </IGM_Launcher_Card>

      {/* 认证链进度：仅在存在进行中的有效流程时渲染，已过期 / 已废弃流程不留残留步骤 */}
      {polling || deviceCode || browserAuth || stageResult ? (
        <IGM_Launcher_Card className={styles.card}>
          <h3 className={styles.cardTitle}>
            <ShieldCheck size={15} strokeWidth={1.8} />
            {t("stageTitle")}
          </h3>
          <ol className={styles.stageList}>
          {IGM_LAUNCHER_MC_AUTH_STAGES.map((stage) => {
            const done = flowDone || completed.has(stage);
            const active = !done && stage === activeStage;
            return (
              <li
                key={stage}
                className={`${styles.stageItem} ${active ? styles.stageItemActive : ""}`}
              >
                <span className={styles.stageIcon}>
                  {done ? (
                    <CheckCircle2 size={15} strokeWidth={1.8} />
                  ) : active ? (
                    <LoaderCircle size={15} strokeWidth={1.8} className={styles.spin} />
                  ) : (
                    <CircleDashed size={15} strokeWidth={1.8} />
                  )}
                </span>
                <span className={styles.stageName}>{t(iGM_Launcher_StageKey(stage))}</span>
                <span className={styles.stageState}>
                  {done ? t("stageDone") : active ? t("stageActive") : t("stagePending")}
                </span>
              </li>
            );
          })}
          </ol>
        </IGM_Launcher_Card>
      ) : null}

      <IGM_Launcher_PlaceholderNote>{t("hint")}</IGM_Launcher_PlaceholderNote>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_AccountMsBindPage;