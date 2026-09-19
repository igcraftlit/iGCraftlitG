/**
 * 文件路径：apps/web/src/iGM_Pages/G_AdminMails/iGM_AdminMailsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_AdminMails
 * 模块：G_AdminMails
 * 作用：邮件测试——向指定邮箱发送测试邮件以验证 SMTP 配置
 * 内容：收件地址表单、发送按钮、成功/失败提示
 * 说明：纯静态 SSG，经 iGM_AdminClient 调用本地后端 /G_Admin/mails/test；
 *       仅 admin 可用（后端限流并写操作日志）
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, LoaderCircle, Mail, Send } from "lucide-react";
import { iGM_ApiAdminSendTestMail } from "../../iGM_Services/iGM_AdminClient";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import pageStyles from "../iGM_Page.module.css";
import uiStyles from "../iGM_Module4.module.css";
import styles from "../iGM_Admin.module.css";

// 类型定义 //
// （表单状态为本地字符串）

// 核心逻辑 //
/** 邮件测试页主体（仅 admin） */
function iGM_MailsInner() {
  const t = useTranslations();

  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /** 提交测试邮件 */
  async function iGM_HandleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSending(true);
    setErrorText(null);
    setSuccess(false);
    try {
      await iGM_ApiAdminSendTestMail(to.trim());
      setSuccess(true);
      setTo("");
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Mail size={22} strokeWidth={1.8} />
          </span>
          {t("pages.adminMails.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.adminMails.description")}
        </p>
      </header>

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>{errorText}</div>
      )}
      {success && (
        <div className={`${uiStyles.alert} ${uiStyles.alertSuccess}`}>
          <CircleCheck size={15} className={uiStyles.alertIcon} />
          {t("admin.mails.success")}
        </div>
      )}

      {/* 发送表单 */}
      <section className={uiStyles.sectionCard}>
        <form className={styles.mailForm} onSubmit={iGM_HandleSubmit}>
          <div className={uiStyles.formRow}>
            <label className={uiStyles.label} htmlFor="iGM_TestMailTo">
              {t("admin.mails.to")}
            </label>
            <input
              id="iGM_TestMailTo"
              className={uiStyles.input}
              type="email"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder={t("admin.mails.toPlaceholder")}
              maxLength={254}
            />
          </div>
          <div className={uiStyles.formActions}>
            <button type="submit" className={uiStyles.primaryButton} disabled={sending}>
              {sending ? (
                <LoaderCircle size={15} className="igm-spin" />
              ) : (
                <Send size={15} strokeWidth={1.8} />
              )}
              {sending ? t("admin.mails.sending") : t("admin.mails.send")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/** 邮件测试页（仅 admin，后端同样校验） */
export function iGM_AdminMailsPage() {
  const IGM_MailsInner = iGM_MailsInner;
  return (
    <IGM_RequireAuth role="admin">
      <IGM_MailsInner />
    </IGM_RequireAuth>
  );
}

// 导出 //
export default iGM_AdminMailsPage;
