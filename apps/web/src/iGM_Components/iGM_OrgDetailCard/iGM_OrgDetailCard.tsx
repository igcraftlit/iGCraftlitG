/**
 * 文件路径：apps/web/src/iGM_Components/iGM_OrgDetailCard/iGM_OrgDetailCard.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_OrgVerify（认证态）、G_OrgDetails
 * 模块：iGM_OrgDetailCard
 * 作用：组织详情卡片——展示组织名称、描述、认证标识与“关于组织”内容
 * 内容：负责人可就地编辑关于组织；已认证成员可申请退出组织
 * 说明：纯客户端组件，写操作经 iGM_OrgVerifyClient 调用后端；
 *       退出后刷新登录态（顶部导航等位置的认证标识同步移除）
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  Building2,
  CircleCheck,
  Crown,
  LoaderCircle,
  LogOut,
  Pencil,
} from "lucide-react";
import {
  iGM_ApiOrgLeave,
  iGM_ApiUpdateOrgAbout,
  type iGM_Organization,
} from "../../iGM_Services/iGM_OrgVerifyClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_ResolveErrorText } from "../iGM_AuthUI/iGM_AuthUI";
import uiStyles from "../../iGM_Pages/iGM_Module4.module.css";
import styles from "./iGM_OrgDetailCard.module.css";

// 类型定义 //
export interface iGM_OrgDetailCardProps {
  /** 组织数据（aboutContent 等） */
  organization: iGM_Organization;
  /** 当前查看者是否为该组织负责人（可编辑关于组织） */
  isOwner?: boolean;
  /** 是否展示“申请退出”按钮（仅本人已认证该组织时） */
  showLeave?: boolean;
  /** 退出成功后的回调（父组件切换回申请视图等） */
  onLeft?: () => void;
}

/** 将正文中的 http(s) 链接渲染为可点击链接，其余文本原样保留 */
function iGM_LinkifyText(text: string): React.ReactNode[] {
  const matches = text.split(/(https?:\/\/[^\s]+)/g);
  return matches.map((part, index) =>
    /^https?:\/\/[^\s]+$/.test(part) ? (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.aboutLink}
      >
        {part}
      </a>
    ) : (
      <span key={`text-${index}`}>{part}</span>
    ),
  );
}

// 核心逻辑 //
/** 组织详情卡片（关于组织 + 负责人编辑 + 申请退出） */
export function iGM_OrgDetailCard({
  organization: initialOrg,
  isOwner = false,
  showLeave = false,
  onLeft,
}: iGM_OrgDetailCardProps) {
  const t = useTranslations();
  const { refresh: iGM_RefreshAuth } = iGM_UseAuth();

  const [org, setOrg] = useState<iGM_Organization>(initialOrg);
  const [editing, setEditing] = useState(false);
  const [aboutDraft, setAboutDraft] = useState(initialOrg.aboutContent);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  /** 进入编辑态 */
  function iGM_StartEdit(): void {
    setErrorText(null);
    setSuccessText(null);
    setAboutDraft(org.aboutContent);
    setEditing(true);
  }

  /** 保存关于组织（仅负责人，后端二次鉴权） */
  async function iGM_HandleSave(): Promise<void> {
    if (saving) return;
    setErrorText(null);
    setSuccessText(null);
    setSaving(true);
    try {
      const response = await iGM_ApiUpdateOrgAbout({
        orgId: org.id,
        aboutContent: aboutDraft,
      });
      if (response.data?.organization) {
        setOrg(response.data.organization);
        setAboutDraft(response.data.organization.aboutContent);
      }
      setEditing(false);
      setSuccessText(t("orgVerify.messages.aboutUpdated"));
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setSaving(false);
    }
  }

  /** 申请退出组织：二次确认后清除认证标识并留痕 */
  async function iGM_HandleLeave(): Promise<void> {
    if (leaving) return;
    // 浏览器原生确认，极简实现，不引入弹窗组件
    if (!window.confirm(t("orgVerify.details.leaveConfirm"))) return;
    setErrorText(null);
    setSuccessText(null);
    setLeaving(true);
    try {
      await iGM_ApiOrgLeave(null);
      // 刷新登录态：顶部导航/帖子/评论中的认证标识同步移除
      await iGM_RefreshAuth();
      setSuccessText(t("orgVerify.messages.left"));
      onLeft?.();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLeaving(false);
    }
  }

  return (
    <section className={uiStyles.sectionCard}>
      {/* 组织标题行：图标 + 名称 + 认证标识 + 负责人标记 */}
      <header className={styles.detailHeader}>
        <span className={styles.orgIcon}>
          <Building2 size={18} strokeWidth={1.8} />
        </span>
        <div className={styles.titleBlock}>
          <span className={styles.orgTitleRow}>
            <span className={styles.orgTitle}>{org.name}</span>
            <BadgeCheck size={15} strokeWidth={2} className={styles.verifiedIcon} />
          </span>
          {isOwner && (
            <span className={styles.ownerChip}>
              <Crown size={11} strokeWidth={2} className={styles.ownerChipIcon} />
              {t("orgVerify.details.ownerTag")}
            </span>
          )}
        </div>
        {isOwner && !editing && (
          <button
            type="button"
            className={uiStyles.ghostButton}
            onClick={iGM_StartEdit}
          >
            <Pencil size={13} strokeWidth={1.8} />
            {t("orgVerify.details.editAbout")}
          </button>
        )}
      </header>

      {org.description && <p className={styles.orgDescription}>{org.description}</p>}

      {/* 关于组织 */}
      <div className={styles.aboutBlock}>
        <span className={uiStyles.label}>{t("orgVerify.details.about")}</span>
        {editing ? (
          <div className={styles.aboutEdit}>
            <textarea
              className={uiStyles.textarea}
              value={aboutDraft}
              onChange={(event) => setAboutDraft(event.target.value)}
              placeholder={t("orgVerify.details.aboutPlaceholder")}
              maxLength={5000}
              rows={8}
            />
            <div className={uiStyles.formActions}>
              <button
                type="button"
                className={uiStyles.primaryButton}
                disabled={saving}
                onClick={() => void iGM_HandleSave()}
              >
                {saving ? (
                  <LoaderCircle size={14} className="igm-spin" />
                ) : (
                  <CircleCheck size={14} strokeWidth={1.8} />
                )}
                {saving ? t("orgVerify.details.saving") : t("orgVerify.details.save")}
              </button>
              <button
                type="button"
                className={uiStyles.ghostButton}
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                {t("orgVerify.details.cancel")}
              </button>
            </div>
          </div>
        ) : org.aboutContent.trim() ? (
          <p className={styles.aboutBody}>{iGM_LinkifyText(org.aboutContent)}</p>
        ) : (
          <p className={styles.aboutEmpty}>{t("orgVerify.details.aboutEmpty")}</p>
        )}
      </div>

      {errorText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertError}`}>{errorText}</div>
      )}
      {successText && (
        <div className={`${uiStyles.alert} ${uiStyles.alertSuccess}`}>
          <CircleCheck size={15} strokeWidth={1.8} className={uiStyles.alertIcon} />
          {successText}
        </div>
      )}

      {/* 已认证成员：申请退出；组织所有者不可退出（模块七第三轮） */}
      {showLeave && !isOwner && !editing && (
        <div className={styles.leaveBar}>
          <button
            type="button"
            className={uiStyles.ghostButton}
            disabled={leaving}
            onClick={() => void iGM_HandleLeave()}
          >
            {leaving ? (
              <LoaderCircle size={14} className="igm-spin" />
            ) : (
              <LogOut size={14} strokeWidth={1.8} />
            )}
            {t("orgVerify.details.leave")}
          </button>
        </div>
      )}
      {showLeave && isOwner && !editing && (
        <div className={styles.leaveBar}>
          <span className={styles.ownerNotice}>
            <Crown size={13} strokeWidth={1.8} />
            {t("orgVerify.details.ownerCannotLeave")}
          </span>
        </div>
      )}
    </section>
  );
}

// 导出 //
export default iGM_OrgDetailCard;
