/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_AccountPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Account（SPA 页 id：account）
 * 模块：iGM_Launcher_AccountPage
 * 作用：账户页，按登录状态分别展示登录引导或账户信息
 * 内容：模块七移除组织认证状态卡片；未登录时提供 iGCraftLit 登录、注册引导、微软登录占位与离线模式入口；
 *       模块五强化离线模式入口：展示本地离线角色名称与本地 UUID，
 *       并说明离线模式仅可用于单机与局域网、无法进入正版验证服务器；
 *       已登录时展示头像、用户名、iGMUid、邮箱、注册时间、角色与同步/切换/退出操作
 */

// 导入依赖 //
"use client";

import {
  BadgeCheck,
  Building2,
  Clock4,
  Fingerprint,
  Globe,
  HardDrive,
  KeyRound,
  LogIn,
  LogOut,
  MonitorSmartphone,
  Plus,
  Repeat,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_DATA_ROOT,
  IGM_LAUNCHER_OFFLINE_DEFAULT_NAME,
  IGM_LAUNCHER_SESSION_FILE,
  IGM_LAUNCHER_SITE_URL,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_ConfirmDialog as IGM_Launcher_ConfirmDialog } from "@/components/iGM_Launcher_Dialogs/iGM_Launcher_Dialogs";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import styles from "./iGM_Launcher_AccountPage.module.css";

// 类型定义 //
/* （账户会话结构由共享层 iGM_Launcher_AccountSession 提供） */

// 核心逻辑 //

/** ISO 时间转 YYYY-MM-DD 日期 */
function iGM_Launcher_FormatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

/** 会话凭证脱敏展示：仅保留前 4 位，避免完整凭证出现在界面上 */
function iGM_Launcher_MaskToken(value: string): string {
  if (!value) return "—";
  return `${value.slice(0, 4)}••••••`;
}

export function iGM_Launcher_AccountPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const {
    account,
    instances,
    logout,
    syncAccount,
    mcBindings,
    mcUnbind,
    mcSetDefault,
  } = iGM_Launcher_UseStore();

  // 待解绑的绑定记录 id，非空时弹出确认对话框
  const [pendingUnbindId, setPendingUnbindId] = useState<string | null>(null);
  // 社区头像加载失败（地址失效或被防盗链拦截）时回退到图标占位
  const [avatarFailed, setAvatarFailed] = useState(false);

  const signedIn = account.signedIn;
  const pendingUnbind = mcBindings.find((item) => item.id === pendingUnbindId) ?? null;

  /* ---------- 未登录：登录引导 ---------- */
  if (!signedIn) {
    return (
      <div className={styles.page}>
        <IGM_Launcher_PageHeader title={t("title")} description={t("subtitle")} />

        <IGM_Launcher_Card className={styles.profileCard}>
          <div className={styles.avatarBlock}>
            <span className={styles.avatar}>
              <UserRound size={30} strokeWidth={1.5} />
            </span>
          </div>
          <div className={styles.profileBody}>
            <div className={styles.nameRow}>
              <h2 className={styles.userName}>{t("guestName")}</h2>
              <IGM_Launcher_Badge tone="muted">
                <BadgeCheck size={12} strokeWidth={1.8} />
                {t("statusGuest")}
              </IGM_Launcher_Badge>
              <IGM_Launcher_Badge tone="success">{t("offlineBadge")}</IGM_Launcher_Badge>
            </div>
            <p className={styles.signInDesc}>{t("signInDesc")}</p>
            <div className={styles.actions}>
              <IGM_Launcher_Button variant="primary" onClick={() => navigate("accountLogin")}>
                <LogIn size={15} strokeWidth={1.8} />
                {t("signIn")}
              </IGM_Launcher_Button>
              <IGM_Launcher_Button
                variant="secondary"
                onClick={() => window.open(IGM_LAUNCHER_SITE_URL, "_blank", "noopener")}
              >
                <Globe size={15} strokeWidth={1.8} />
                {t("register")}
              </IGM_Launcher_Button>
              <IGM_Launcher_Button variant="secondary" onClick={() => navigate("instances")}>
                <MonitorSmartphone size={15} strokeWidth={1.8} />
                {t("offlineEnter")}
              </IGM_Launcher_Button>
            </div>
            <p className={styles.verifiedHint}>{t("registerDesc")}</p>
          </div>
        </IGM_Launcher_Card>

        {/* 登录方式 */}
        <div className={styles.methodGrid}>
          <IGM_Launcher_Card className={styles.methodCard}>
            <span className={styles.methodIcon}>
              <ShieldCheck size={18} strokeWidth={1.6} />
            </span>
            <h3 className={styles.methodTitle}>{t("signInTitle")}</h3>
            <p className={styles.methodDesc}>{t("signInDesc")}</p>
            <IGM_Launcher_Button variant="secondary" onClick={() => navigate("accountLogin")}>
              {tCommon("confirm")}
            </IGM_Launcher_Button>
          </IGM_Launcher_Card>

          <IGM_Launcher_Card className={styles.methodCard}>
            <span className={styles.methodIcon}>
              <Building2 size={18} strokeWidth={1.6} />
            </span>
            <h3 className={styles.methodTitle}>{t("microsoftTitle")}</h3>
            <p className={styles.methodDesc}>{t("microsoftDesc")}</p>
            <IGM_Launcher_Badge tone="muted">{t("msNeedLogin")}</IGM_Launcher_Badge>
          </IGM_Launcher_Card>

          <IGM_Launcher_Card className={styles.methodCard}>
            <span className={styles.methodIcon}>
              <MonitorSmartphone size={18} strokeWidth={1.6} />
            </span>
            <h3 className={styles.methodTitle}>{t("offlineTitle")}</h3>
            <p className={styles.methodDesc}>{t("offlineDesc")}</p>
            {/* 离线角色身份：本机生成，与正版绑定 UUID 区分 */}
            <dl className={styles.offlineIdentity}>
              <div className={styles.offlineRow}>
                <dt>{t("offlineNameLabel")}</dt>
                <dd>{account.offlineName || IGM_LAUNCHER_OFFLINE_DEFAULT_NAME}</dd>
              </div>
              <div className={styles.offlineRow}>
                <dt>{t("offlineUuidLabel")}</dt>
                <dd className={styles.offlineUuid}>{account.offlineUuid || "—"}</dd>
              </div>
            </dl>
            <IGM_Launcher_Badge tone="muted">{t("offlineLimited")}</IGM_Launcher_Badge>
            <IGM_Launcher_Button variant="primary" onClick={() => navigate("instances")}>
              {t("offlineEnter")}
            </IGM_Launcher_Button>
          </IGM_Launcher_Card>
        </div>

        <IGM_Launcher_PlaceholderNote>{t("placeholderHint")}</IGM_Launcher_PlaceholderNote>
      </div>
    );
  }

  /* ---------- 已登录：账户信息 ---------- */
  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader title={t("title")} description={t("subtitle")} />

      <IGM_Launcher_Card className={styles.profileCard}>
        <div className={styles.avatarBlock}>
          {/* 社区头像：登录后由主站同步（account.avatar），为空或加载失败时回退到图标占位 */}
          {account.avatar && !avatarFailed ? (
            <img
              className={styles.avatarImage}
              src={account.avatar}
              alt={account.userName}
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <span className={styles.avatar}>
              <UserRound size={30} strokeWidth={1.5} />
            </span>
          )}
        </div>

        <div className={styles.profileBody}>
          <div className={styles.nameRow}>
            <h2 className={styles.userName}>{account.userName}</h2>
            <IGM_Launcher_Badge tone="success">
              <BadgeCheck size={12} strokeWidth={1.8} />
              {t("verified")}
            </IGM_Launcher_Badge>
          </div>

          <dl className={styles.uidRow}>
            <dt className={styles.uidLabel}>{t("uidLabel")}</dt>
            <dd className={styles.uidValue}>{account.uid}</dd>
          </dl>

          <div className={styles.statGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>
                <Globe size={13} strokeWidth={1.8} />
                {t("emailLabel")}
              </span>
              <span className={styles.statValue}>{account.email}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>
                <Clock4 size={13} strokeWidth={1.8} />
                {t("registeredLabel")}
              </span>
              <span className={styles.statValue}>
                {iGM_Launcher_FormatDate(account.registeredAt)}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>
                <Fingerprint size={13} strokeWidth={1.8} />
                {t("roleLabel")}
              </span>
              <span className={styles.statValue}>
                {account.role || t("roleMember")}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>
                <HardDrive size={13} strokeWidth={1.8} />
                {t("instanceCount")}
              </span>
              <span className={styles.statValue}>{instances.length}</span>
            </div>
          </div>

          <div className={styles.actions}>
            <IGM_Launcher_Button variant="secondary" onClick={() => void syncAccount()}>
              <Repeat size={15} strokeWidth={1.8} />
              {t("syncAction")}
            </IGM_Launcher_Button>
            <IGM_Launcher_Button
              variant="secondary"
              onClick={() => {
                void logout().then(() => navigate("accountLogin"));
              }}
            >
              <UserRound size={15} strokeWidth={1.8} />
              {t("switchAccount")}
            </IGM_Launcher_Button>
            <IGM_Launcher_Button
              variant="ghost"
              onClick={() => {
                void logout();
              }}
            >
              <LogOut size={15} strokeWidth={1.8} />
              {t("signOut")}
            </IGM_Launcher_Button>
          </div>
          <p className={styles.verifiedHint}>{t("syncHint")}</p>
        </div>
      </IGM_Launcher_Card>

      {/* Minecraft 正版账号绑定 */}
      <IGM_Launcher_Card className={styles.mcCard}>
        <div className={styles.mcHead}>
          <h3 className={styles.orgTitle}>
            <KeyRound size={15} strokeWidth={1.8} />
            {t("mcTitle")}
          </h3>
          <IGM_Launcher_Button variant="secondary" onClick={() => navigate("accountMsBind")}>
            <Plus size={15} strokeWidth={1.8} />
            {t("mcAdd")}
          </IGM_Launcher_Button>
        </div>
        <p className={styles.localDesc}>{t("mcDesc")}</p>

        {mcBindings.length === 0 ? (
          <p className={styles.orgEmpty}>{t("mcEmpty")}</p>
        ) : (
          <>
            <div className={styles.mcList}>
              {mcBindings.map((binding) => (
                <div key={binding.id} className={styles.mcItem}>
                  <div className={styles.mcItemMain}>
                    <div className={styles.mcItemNameRow}>
                      <span className={styles.mcItemName}>{binding.name}</span>
                      {binding.isDefault ? (
                        <IGM_Launcher_Badge tone="success">
                          <Star size={11} strokeWidth={1.8} />
                          {t("mcDefault")}
                        </IGM_Launcher_Badge>
                      ) : null}
                      <IGM_Launcher_Badge tone={binding.ownsJava ? "success" : "muted"}>
                        {binding.ownsJava ? t("mcOwnsOk") : t("mcOwnsNo")}
                      </IGM_Launcher_Badge>
                    </div>
                    <p className={styles.mcItemMeta}>
                      {t("mcUuid")}：{binding.uuid}
                    </p>
                    <p className={styles.mcItemMeta}>
                      {t("mcBoundAt")}：{iGM_Launcher_FormatDate(binding.addedAt)}
                    </p>
                  </div>
                  <div className={styles.mcItemActions}>
                    <IGM_Launcher_Button
                      variant="secondary"
                      onClick={() => navigate("accountProfile", { bindingId: binding.id })}
                    >
                      <UserRound size={14} strokeWidth={1.8} />
                      {t("mcViewProfile")}
                    </IGM_Launcher_Button>
                    {binding.isDefault ? null : (
                      <IGM_Launcher_Button
                        variant="secondary"
                        onClick={() => void mcSetDefault(binding.id)}
                      >
                        <Star size={14} strokeWidth={1.8} />
                        {t("mcSetDefault")}
                      </IGM_Launcher_Button>
                    )}
                    <IGM_Launcher_Button
                      variant="ghost"
                      onClick={() => setPendingUnbindId(binding.id)}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                      {t("mcUnbind")}
                    </IGM_Launcher_Button>
                  </div>
                </div>
              ))}
            </div>
            <p className={styles.mcCount}>{t("mcCount", { count: mcBindings.length })}</p>
          </>
        )}
      </IGM_Launcher_Card>

      {/* 本地数据位置 */}
      <IGM_Launcher_Card className={styles.localCard}>
        <h3 className={styles.orgTitle}>
          <HardDrive size={15} strokeWidth={1.8} />
          {t("localTitle")}
        </h3>
        <p className={styles.localDesc}>{t("localDesc")}</p>
        <p className={styles.localPath}>
          {t("sessionFile")}：{IGM_LAUNCHER_DATA_ROOT}/{IGM_LAUNCHER_SESSION_FILE}
        </p>
        <p className={styles.localPath}>
          {t("placeholderToken")}：{iGM_Launcher_MaskToken(account.token)}
        </p>
      </IGM_Launcher_Card>

      <IGM_Launcher_PlaceholderNote>{t("placeholderHint")}</IGM_Launcher_PlaceholderNote>

      {/* 解绑确认：同时删除本地令牌与服务端绑定记录 */}
      <IGM_Launcher_ConfirmDialog
        open={pendingUnbind !== null}
        danger
        title={t("mcUnbindConfirmTitle")}
        description={t("mcUnbindConfirmDesc", { name: pendingUnbind?.name ?? "" })}
        confirmLabel={t("mcUnbind")}
        onCancel={() => setPendingUnbindId(null)}
        onConfirm={() => {
          const id = pendingUnbindId;
          setPendingUnbindId(null);
          if (id) void mcUnbind(id);
        }}
      />
    </div>
  );
}

// 导出 //
export default iGM_Launcher_AccountPage;