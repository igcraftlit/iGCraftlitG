/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_AccountLoginPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Account_Login（SPA 页 id：accountLogin）
 * 模块：iGM_Launcher_AccountLoginPage
 * 作用：iGCraftLit 账户登录表单页
 * 内容：账号（邮箱或用户名）与密码校验后经状态中心直连主站鉴权；
 *       忘记密码跳转主站，登录成功后返回账户页，失败提示留在表单内
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { ArrowLeft, CircleAlert, ExternalLink, LogIn, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { IGM_LAUNCHER_SITE_URL } from "@igm-launcher/shared";
import {
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import {
  iGM_Launcher_Field as IGM_Launcher_Field,
  iGM_Launcher_Input as IGM_Launcher_Input,
} from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import styles from "./iGM_Launcher_AccountLoginPage.module.css";

// 类型定义 //
/* （表单校验错误按字段名存放） */

// 核心逻辑 //
export function iGM_Launcher_AccountLoginPage() {
  const t = useTranslations("accountLogin");
  const tCommon = useTranslations("common");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const { login } = iGM_Launcher_UseStore();

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<"account" | "password" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    // 账号支持邮箱或用户名，格式由主站校验，此处仅要求非空
    if (!account.trim()) {
      setError("account");
      return;
    }
    if (!password) {
      setError("password");
      return;
    }
    setError(null);
    setSubmitting(true);
    const ok = await login(account.trim(), password);
    setSubmitting(false);
    // 密码仅用于本次登录，不留在组件状态里
    setPassword("");
    if (ok) navigate("account");
  };

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
        <div className={styles.cardHead}>
          <span className={styles.cardIcon}>
            <ShieldCheck size={18} strokeWidth={1.6} />
          </span>
          <span className={styles.cardHint}>{t("offlineNote")}</span>
        </div>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <IGM_Launcher_Field label={t("email")} htmlFor="iGM_Launcher_LoginAccount">
            <IGM_Launcher_Input
              id="iGM_Launcher_LoginAccount"
              type="text"
              autoComplete="username"
              value={account}
              placeholder={t("emailPlaceholder")}
              onChange={(event) => {
                setError(null);
                setAccount(event.target.value);
              }}
            />
          </IGM_Launcher_Field>

          <IGM_Launcher_Field label={t("password")} htmlFor="iGM_Launcher_LoginPassword">
            <IGM_Launcher_Input
              id="iGM_Launcher_LoginPassword"
              type="password"
              autoComplete="current-password"
              value={password}
              placeholder={t("passwordPlaceholder")}
              onChange={(event) => {
                setError(null);
                setPassword(event.target.value);
              }}
            />
          </IGM_Launcher_Field>

          {error ? (
            <p className={styles.errorLine}>
              <CircleAlert size={14} strokeWidth={1.8} />
              {error === "account" ? t("invalidEmail") : t("invalidPassword")}
            </p>
          ) : null}

          <IGM_Launcher_Button
            variant="primary"
            type="submit"
            className={styles.submit}
            disabled={submitting}
          >
            <LogIn size={15} strokeWidth={1.8} />
            {t("submit")}
          </IGM_Launcher_Button>
        </form>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => window.open(IGM_LAUNCHER_SITE_URL, "_blank", "noopener")}
          >
            {t("forgot")}
            <ExternalLink size={13} strokeWidth={1.8} />
          </button>
          <span className={styles.footerHint}>{t("forgotHint")}</span>
        </div>

        <div className={styles.secondaryActions}>
          <IGM_Launcher_Button variant="secondary" onClick={() => navigate("account")}>
            {tCommon("back")}
          </IGM_Launcher_Button>
        </div>
      </IGM_Launcher_Card>

      <IGM_Launcher_PlaceholderNote>{t("hint")}</IGM_Launcher_PlaceholderNote>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_AccountLoginPage;