/**
 * 文件路径：apps/web/src/iGM_Pages/G_UserSettings/iGM_UserSettingsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_UserSettings
 * 模块：G_UserSettings
 * 作用：个人资料编辑（昵称、头像 URL、简介、网站），扩展模块二账户设置
 * 内容：资料表单、当前头像预览、保存后刷新全局登录用户、与账户设置互通链接
 * 说明：头像上传留待后续文件上传模块，本页仅接受头像 URL
 */

// 导入依赖 //
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Check,
  KeyRound,
  LoaderCircle,
  Settings2,
  UserRound,
} from "lucide-react";
import {
  iGM_ApiUpdateProfile,
} from "../../iGM_Services/iGM_CommunityClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Community.module.css";

// 类型定义 //
/** 与后端一致的资料长度上限 */
const iGM_DisplayNameMax = 30;
const iGM_BioMax = 200;
const iGM_WebsiteMax = 200;
const iGM_AvatarMax = 500;

// 核心逻辑 //
/** 个人资料编辑页（在 iGM_RequireAuth 内渲染） */
export function iGM_UserSettingsPage() {
  const t = useTranslations();
  const { user, refresh } = iGM_UseAuth();

  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** 用当前登录用户资料回填 */
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? "");
    setAvatar(user.avatar ?? "");
    setBio(user.bio ?? "");
    setWebsite(user.website ?? "");
    setReady(true);
  }, [user]);

  /** 保存资料：成功后刷新全局用户并展示成功提示 */
  async function iGM_HandleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrorText(null);
    setSaved(false);
    try {
      await iGM_ApiUpdateProfile({
        displayName: displayName.trim(),
        avatar: avatar.trim(),
        bio: bio.trim(),
        website: website.trim(),
      });
      await refresh();
      setSaved(true);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !user) {
    return (
      <div className={styles.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("community.state.loading")}
      </div>
    );
  }

  const previewName = displayName.trim() || user.username;

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Settings2 size={22} strokeWidth={1.8} />
          </span>
          {t("community.settings.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("community.settings.description")}
        </p>
      </header>

      {/* 与模块二账户设置互通 */}
      <div className={styles.activeFilterRow}>
        <Link href="/G_Settings" className={styles.clearFilter}>
          <KeyRound size={13} strokeWidth={1.8} />
          {t("community.settings.accountLink")}
        </Link>
        <Link href={`/G_User?userId=${encodeURIComponent(user.id)}`} className={styles.clearFilter}>
          <UserRound size={13} strokeWidth={1.8} />
          {t("community.settings.profileLink")}
        </Link>
      </div>

      <form className={`${styles.sectionCard} ${styles.form}`} onSubmit={iGM_HandleSave} noValidate>
        {errorText && (
          <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
        )}
        {saved && (
          <div className={`${styles.alert} ${styles.alertSuccess}`}>
            <Check size={14} strokeWidth={2} />
            {t("community.settings.saved")}
          </div>
        )}

        {/* 头像预览 + URL */}
        <div className={styles.formRow}>
          <label className={styles.label}>{t("community.settings.avatarLabel")}</label>
          <div className={styles.activeFilterRow}>
            <IGM_Avatar size="lg" src={avatar.trim() || null} name={previewName} />
            <span className={styles.hint}>{t("community.settings.avatarHint")}</span>
          </div>
          <input
            className={styles.input}
            type="url"
            value={avatar}
            maxLength={iGM_AvatarMax}
            placeholder={t("community.settings.avatarPlaceholder")}
            onChange={(event) => setAvatar(event.target.value)}
          />
        </div>

        {/* 昵称 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-display-name">
            {t("community.settings.displayNameLabel")}
          </label>
          <input
            id="igm-display-name"
            className={styles.input}
            type="text"
            value={displayName}
            maxLength={iGM_DisplayNameMax}
            placeholder={t("community.settings.displayNamePlaceholder")}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <span className={styles.hint}>
            {t("community.settings.displayNameHint", { max: iGM_DisplayNameMax })}
          </span>
        </div>

        {/* 简介 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-bio">
            {t("community.settings.bioLabel")}
          </label>
          <textarea
            id="igm-bio"
            className={`${styles.textarea} ${styles.textareaShort}`}
            value={bio}
            maxLength={iGM_BioMax}
            placeholder={t("community.settings.bioPlaceholder")}
            onChange={(event) => setBio(event.target.value)}
          />
          <span className={styles.counter}>
            {bio.length} / {iGM_BioMax}
          </span>
        </div>

        {/* 网站 */}
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="igm-website">
            {t("community.settings.websiteLabel")}
          </label>
          <input
            id="igm-website"
            className={styles.input}
            type="url"
            value={website}
            maxLength={iGM_WebsiteMax}
            placeholder={t("community.settings.websitePlaceholder")}
            onChange={(event) => setWebsite(event.target.value)}
          />
          <span className={styles.hint}>{t("community.settings.websiteHint")}</span>
        </div>

        {/* 操作按钮 */}
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving && <LoaderCircle size={14} className="igm-spin" />}
            {t("community.settings.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

// 导出 //
export default iGM_UserSettingsPage;
