/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_AccountProfilePage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Account_Profile（SPA 页 id：accountProfile）
 * 模块：iGM_Launcher_AccountProfilePage
 * 作用：单个 Minecraft 正版账号的档案页
 * 内容：皮肤头部预览（CSS 像素化裁剪，无皮肤时以首字母头像兜底）、
 *       UUID / 玩家名 / XUID、Java 版拥有权、访问与刷新令牌有效期，以及刷新与重校验操作
 *
 * 安全说明：页面只能看到到期时间等非敏感字段，refresh_token 与 access_token 始终留在主进程。
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CircleAlert,
  Fingerprint,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { iGM_Launcher_MinecraftProfile } from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import type { iGM_Launcher_PageProps } from "./iGM_Launcher_PageRegistry";
import styles from "./iGM_Launcher_AccountProfilePage.module.css";

// 类型定义 //
/* （页面入参沿用 PageRegistry 的 iGM_Launcher_PageProps，传入 bindingId） */

// 核心逻辑 //

/** ISO 时间转本地可读时间，空值或非法值返回占位符 */
function iGM_Launcher_FormatTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/** 到期时间是否已过（空值视为未知，不判定为过期） */
function iGM_Launcher_IsExpired(value: string): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now();
}

export function iGM_Launcher_AccountProfilePage({ params }: iGM_Launcher_PageProps) {
  const t = useTranslations("accountProfile");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const { mcBindings, mcLoadProfile, mcRefresh, mcCheckEntitlements } = iGM_Launcher_UseStore();

  const bindingId = params?.bindingId ?? "";
  const binding = mcBindings.find((item) => item.id === bindingId) ?? null;

  const [profile, setProfile] = useState<iGM_Launcher_MinecraftProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // 进入页面即按绑定读取档案（账号无自定义皮肤时，界面自动兜底为首字母头像）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      if (!bindingId) {
        if (!cancelled) setLoading(false);
        return;
      }
      const result = await mcLoadProfile(bindingId);
      if (cancelled) return;
      setProfile(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // mcLoadProfile 为稳定引用，仅在绑定变化时重新拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindingId]);

  const backButton = (
    <IGM_Launcher_Button variant="ghost" onClick={() => navigate("account")}>
      <ArrowLeft size={15} strokeWidth={1.8} />
      {t("back")}
    </IGM_Launcher_Button>
  );

  /* ---------- 绑定不存在 ---------- */
  if (!binding) {
    return (
      <div className={styles.page}>
        <IGM_Launcher_PageHeader title={t("title")} description={t("subtitle")} actions={backButton} />
        <IGM_Launcher_Card className={styles.card}>
          <p className={styles.notFoundLine}>
            <CircleAlert size={14} strokeWidth={1.8} />
            {t("notFound")}
          </p>
          <div className={styles.actions}>
            <IGM_Launcher_Button variant="primary" onClick={() => navigate("account")}>
              {t("back")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_Card>
      </div>
    );
  }

  const skin = profile?.skins.find((item) => item.state === "ACTIVE") ?? profile?.skins[0] ?? null;
  const playerName = profile?.name || binding.name;
  const uuid = profile?.uuid || binding.uuid;
  const accessExpired = iGM_Launcher_IsExpired(binding.accessExpiresAt);
  const refreshExpired = iGM_Launcher_IsExpired(binding.refreshExpiresAt);

  const handleRefresh = async () => {
    setBusy(true);
    await mcRefresh(binding.id);
    // 刷新后重新读取档案，令牌到期时间随之更新
    const result = await mcLoadProfile(binding.id);
    if (result) setProfile(result);
    setBusy(false);
  };

  const handleEntitlements = async () => {
    setBusy(true);
    await mcCheckEntitlements(binding.id);
    setBusy(false);
  };

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader title={t("title")} description={t("subtitle")} actions={backButton} />

      {/* 皮肤与身份 */}
      <IGM_Launcher_Card className={styles.card}>
        <div className={styles.skinRow}>
          {skin ? (
            <div
              className={styles.skinHead}
              style={{ backgroundImage: `url(${skin.url})` }}
              role="img"
              aria-label={playerName}
            />
          ) : (
            <span className={styles.skinFallback}>
              <UserRound size={40} strokeWidth={1.4} />
            </span>
          )}

          <div className={styles.skinBody}>
            <div className={styles.nameRow}>
              <h2 className={styles.playerName}>{playerName}</h2>
              {binding.isDefault ? (
                <IGM_Launcher_Badge tone="success">{t("defaultBadge")}</IGM_Launcher_Badge>
              ) : null}
            </div>

            <dl className={styles.metaList}>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>
                  <Fingerprint size={13} strokeWidth={1.8} />
                  {t("uuidLabel")}
                </dt>
                <dd className={styles.metaValue}>{uuid}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>
                  <KeyRound size={13} strokeWidth={1.8} />
                  {t("xuidLabel")}
                </dt>
                <dd className={styles.metaValue}>
                  {binding.xuid || t("xuidEmpty")}
                </dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>
                  <BadgeCheck size={13} strokeWidth={1.8} />
                  {t("skinVariant")}
                </dt>
                <dd className={styles.metaValue}>
                  {skin
                    ? skin.variant === "slim"
                      ? t("skinVariantSlim")
                      : t("skinVariantClassic")
                    : "—"}
                </dd>
              </div>
            </dl>

            {!skin && !loading ? <p className={styles.hint}>{t("skinEmpty")}</p> : null}
          </div>
        </div>
      </IGM_Launcher_Card>

      {/* 拥有权 */}
      <IGM_Launcher_Card className={styles.card}>
        <h3 className={styles.cardTitle}>
          <ShieldCheck size={15} strokeWidth={1.8} />
          {t("ownsTitle")}
        </h3>
        <div className={styles.statusRow}>
          <IGM_Launcher_Badge tone={binding.ownsJava ? "success" : "muted"}>
            {binding.ownsJava ? t("ownsOk") : t("ownsNo")}
          </IGM_Launcher_Badge>
          <IGM_Launcher_Button
            variant="secondary"
            disabled={busy}
            onClick={() => void handleEntitlements()}
          >
            <ShieldCheck size={15} strokeWidth={1.8} />
            {t("entitlementsAction")}
          </IGM_Launcher_Button>
        </div>
      </IGM_Launcher_Card>

      {/* 令牌状态 */}
      <IGM_Launcher_Card className={styles.card}>
        <h3 className={styles.cardTitle}>
          <KeyRound size={15} strokeWidth={1.8} />
          {t("tokenTitle")}
        </h3>

        <dl className={styles.metaList}>
          <div className={styles.metaItem}>
            <dt className={styles.metaLabel}>{t("accessLabel")}</dt>
            <dd className={styles.metaValue}>
              {iGM_Launcher_FormatTime(binding.accessExpiresAt)}
              <IGM_Launcher_Badge tone={accessExpired ? "muted" : "success"}>
                {accessExpired ? t("tokenExpired") : t("tokenValid")}
              </IGM_Launcher_Badge>
            </dd>
          </div>
          <div className={styles.metaItem}>
            <dt className={styles.metaLabel}>{t("refreshLabel")}</dt>
            <dd className={styles.metaValue}>
              {iGM_Launcher_FormatTime(binding.refreshExpiresAt)}
              <IGM_Launcher_Badge tone={refreshExpired ? "muted" : "success"}>
                {refreshExpired ? t("tokenExpired") : t("tokenValid")}
              </IGM_Launcher_Badge>
            </dd>
          </div>
        </dl>

        <p className={styles.hint}>
          {t("refreshedAt")}：{iGM_Launcher_FormatTime(binding.refreshedAt)}
        </p>

        <div className={styles.actions}>
          <IGM_Launcher_Button variant="secondary" disabled={busy} onClick={() => void handleRefresh()}>
            <RefreshCw size={15} strokeWidth={1.8} />
            {t("refreshAction")}
          </IGM_Launcher_Button>
          <IGM_Launcher_Button variant="ghost" onClick={() => navigate("account")}>
            {t("back")}
          </IGM_Launcher_Button>
        </div>
      </IGM_Launcher_Card>

      <IGM_Launcher_PlaceholderNote>{t("hint")}</IGM_Launcher_PlaceholderNote>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_AccountProfilePage;