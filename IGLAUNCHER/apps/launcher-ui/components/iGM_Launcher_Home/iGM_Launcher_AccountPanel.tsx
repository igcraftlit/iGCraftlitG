/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Home/iGM_Launcher_AccountPanel.tsx
 * 所属层：前端 / 组件层
 * 路由：G_Home（SPA 页 id：home，右侧账户面板）
 * 模块：iGM_Launcher_AccountPanel
 * 作用：首页右侧账户面板，聚合社区账号、正版账户与离线账户三块信息
 * 内容：社区账号展示头像 / 用户名 / iGMUid 与认证徽标，未登录给出登录引导；
 *       正版账户取默认绑定（缺省第一条）展示用户名 / UUID / 拥有状态，未绑定给出管理入口；
 *       离线账户支持添加 / 编辑 / 删除 / 快速切换（上限 6 个，超限禁用添加入口）；
 *       头像加载失败回退 lucide 图标占位；所有文案走 home / common 语言包
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import {
  BadgeCheck,
  Gamepad2,
  LogIn,
  Pencil,
  Plus,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { IGM_LAUNCHER_OFFLINE_ACCOUNTS_MAX } from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import {
  iGM_Launcher_ConfirmDialog as IGM_Launcher_ConfirmDialog,
  iGM_Launcher_PromptDialog as IGM_Launcher_PromptDialog,
} from "@/components/iGM_Launcher_Dialogs/iGM_Launcher_Dialogs";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import styles from "./iGM_Launcher_AccountPanel.module.css";

// 类型定义 //
/* （离线账户结构由共享层 iGM_Launcher_OfflineAccount 提供） */

// 核心逻辑 //
export function iGM_Launcher_AccountPanel() {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const {
    account,
    mcBindings,
    offlineAccounts,
    offlineActiveId,
    saveOfflineAccount,
    removeOfflineAccount,
    setActiveOfflineAccount,
  } = iGM_Launcher_UseStore();

  // 社区头像加载失败（地址失效或被防盗链拦截）时回退到图标占位
  const [avatarFailed, setAvatarFailed] = useState(false);
  // 离线账户编辑对话框：editingId 为空表示新建
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorInitial, setEditorInitial] = useState("");
  // 待删除的离线账户 id
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // 正版账户：优先默认绑定，缺省取第一条
  const binding = mcBindings.find((item) => item.isDefault) ?? mcBindings[0] ?? null;
  const atLimit = offlineAccounts.length >= IGM_LAUNCHER_OFFLINE_ACCOUNTS_MAX;
  const pendingDelete =
    offlineAccounts.find((item) => item.id === pendingDeleteId) ?? null;

  const openAdd = () => {
    setEditingId(null);
    setEditorInitial("");
    setEditorOpen(true);
  };

  const openEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditorInitial(name);
    setEditorOpen(true);
  };

  return (
    <div className={styles.panel}>
      {/* 社区账号 */}
      <IGM_Launcher_Card className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("communityAccount")}</h3>
        {account.signedIn ? (
          <div className={styles.communityBody}>
            <div className={styles.avatarBlock}>
              {account.avatar && !avatarFailed ? (
                <img
                  className={styles.avatarImage}
                  src={account.avatar}
                  alt={account.userName}
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span className={styles.avatar}>
                  <UserRound size={26} strokeWidth={1.5} />
                </span>
              )}
            </div>
            <div className={styles.communityInfo}>
              <div className={styles.nameRow}>
                <span className={styles.userName}>{account.userName}</span>
                {account.role ? (
                  <IGM_Launcher_Badge tone="success">
                    <BadgeCheck size={12} strokeWidth={1.8} />
                    {t("verifiedMember")}
                  </IGM_Launcher_Badge>
                ) : (
                  <IGM_Launcher_Badge tone="muted">{t("normalMember")}</IGM_Launcher_Badge>
                )}
              </div>
              <div className={styles.uidRow}>
                <span className={styles.metaLabel}>{t("uidLabel")}</span>
                <span className={styles.uidValue}>{account.uid || "—"}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.communityBody}>
            <span className={styles.avatar}>
              <UserRound size={26} strokeWidth={1.5} />
            </span>
            <div className={styles.communityInfo}>
              <span className={styles.userName}>{t("notSignedIn")}</span>
              <IGM_Launcher_Button
                variant="primary"
                className={styles.smallButton}
                onClick={() => navigate("accountLogin")}
              >
                <LogIn size={14} strokeWidth={1.8} />
                {t("signIn")}
              </IGM_Launcher_Button>
            </div>
          </div>
        )}
      </IGM_Launcher_Card>

      {/* 正版账户 */}
      <IGM_Launcher_Card className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("genuineAccount")}</h3>
        {binding ? (
          <div className={styles.bindingBody}>
            <div className={styles.bindingNameRow}>
              <span className={styles.bindingIcon}>
                <Gamepad2 size={15} strokeWidth={1.8} />
              </span>
              <span className={styles.bindingName}>{binding.name}</span>
              <IGM_Launcher_Badge tone={binding.ownsJava ? "success" : "muted"}>
                {binding.ownsJava ? t("ownsOk") : t("ownsNo")}
              </IGM_Launcher_Badge>
            </div>
            <div className={styles.uuidLine}>{binding.uuid}</div>
          </div>
        ) : (
          <div className={styles.emptyBody}>
            <p className={styles.emptyText}>{t("genuineEmpty")}</p>
            <IGM_Launcher_Button
              variant="secondary"
              className={styles.smallButton}
              onClick={() => navigate("account")}
            >
              {t("manageAccount")}
            </IGM_Launcher_Button>
          </div>
        )}
      </IGM_Launcher_Card>

      {/* 离线账户 */}
      <IGM_Launcher_Card className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{t("offlineAccounts")}</h3>
          <IGM_Launcher_Button
            variant="ghost"
            className={styles.smallButton}
            disabled={atLimit}
            onClick={openAdd}
          >
            <Plus size={13} strokeWidth={1.8} />
            {t("offlineAdd")}
          </IGM_Launcher_Button>
        </div>
        {atLimit ? <p className={styles.limitHint}>{t("offlineLimit")}</p> : null}
        {offlineAccounts.length === 0 ? (
          <p className={styles.emptyText}>{t("offlineEmpty")}</p>
        ) : (
          <ul className={styles.offlineList}>
            {offlineAccounts.map((item) => {
              const active = item.id === offlineActiveId;
              return (
                <li key={item.id} className={styles.offlineRow}>
                  <button
                    type="button"
                    className={`${styles.offlineSelect} ${active ? styles.offlineSelectActive : ""}`}
                    title={t("offlineUse")}
                    onClick={() => {
                      if (!active) void setActiveOfflineAccount(item.id);
                    }}
                  >
                    <span className={styles.offlineName}>{item.name}</span>
                    {active ? (
                      <IGM_Launcher_Badge tone="accent">{t("offlineActive")}</IGM_Launcher_Badge>
                    ) : (
                      <Star size={13} strokeWidth={1.6} className={styles.useIcon} />
                    )}
                  </button>
                  <div className={styles.offlineActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      title={tCommon("edit")}
                      onClick={() => openEdit(item.id, item.name)}
                    >
                      <Pencil size={13} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      title={tCommon("delete")}
                      onClick={() => setPendingDeleteId(item.id)}
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </IGM_Launcher_Card>

      {/* 添加 / 编辑离线账户 */}
      <IGM_Launcher_PromptDialog
        open={editorOpen}
        title={editingId ? t("offlineEditTitle") : t("offlineAddTitle")}
        label={t("offlineNameLabel")}
        placeholder={t("offlineNamePlaceholder")}
        initialValue={editorInitial}
        confirmLabel={tCommon("save")}
        onCancel={() => setEditorOpen(false)}
        onConfirm={(value) => {
          const id = editingId;
          setEditorOpen(false);
          void saveOfflineAccount(id, value);
        }}
      />

      {/* 删除离线账户二次确认 */}
      <IGM_Launcher_ConfirmDialog
        open={pendingDelete !== null}
        danger
        title={t("offlineDeleteTitle")}
        description={t("offlineDeleteDesc", { name: pendingDelete?.name ?? "" })}
        confirmLabel={tCommon("delete")}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const id = pendingDeleteId;
          setPendingDeleteId(null);
          if (id) void removeOfflineAccount(id);
        }}
      />
    </div>
  );
}

// 导出 //
export default iGM_Launcher_AccountPanel;