/**
 * 文件路径：apps/web/src/iGM_Components/iGM_VerifiedBadge/iGM_VerifiedBadge.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Community、G_Post、G_User、G_AdminUsers、G_AdminOrgVerify
 * 模块：iGM_VerifiedBadge
 * 作用：模块七组织认证标识——在用户名旁展示认证组织徽标（普通为蓝 V；
 *       模块七第三轮：组织负责人显示金色 Crown 所有者金标）
 * 内容：BadgeCheck / Crown 图标 + 组织名称 + 所有者标签，悬停显示完整提示
 * 说明：极简风格，仅 lucide 图标与文本，无 emoji；徽标数据来自后端 DTO
 */

// 导入依赖 //
import { BadgeCheck, Crown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { iGM_OrgBadge } from "../../iGM_Services/iGM_OrgVerifyClient";
import styles from "./iGM_VerifiedBadge.module.css";

// 类型定义 //
export interface iGM_VerifiedBadgeProps {
  /** 认证组织徽标；为 null 时不渲染任何内容 */
  org: iGM_OrgBadge | null | undefined;
  /** 是否展示组织名称（默认展示；紧凑场景可仅显示图标） */
  showName?: boolean;
}

// 核心逻辑 //
/** 认证组织徽标：普通成员蓝色认证标；负责人金色所有者金标 */
export function iGM_VerifiedBadge({ org, showName = true }: iGM_VerifiedBadgeProps) {
  const t = useTranslations();
  if (!org) return null;

  const isOwner = org.isOwner === true;
  const title = isOwner
    ? t("orgVerify.badgeOwner", { name: org.name })
    : t("orgVerify.badge", { name: org.name });

  return (
    <span
      className={`${styles.badge} ${isOwner ? styles.badgeOwner : ""}`}
      title={title}
      aria-label={title}
    >
      {isOwner ? (
        <Crown size={13} strokeWidth={2} className={styles.icon} />
      ) : (
        <BadgeCheck size={13} strokeWidth={2} className={styles.icon} />
      )}
      {showName && (
        <>
          <span className={styles.name}>{org.name}</span>
          {isOwner && (
            <span className={styles.ownerTag}>{t("orgVerify.ownerBadge")}</span>
          )}
        </>
      )}
    </span>
  );
}

// 导出 //
export default iGM_VerifiedBadge;
