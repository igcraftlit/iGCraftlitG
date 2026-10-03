/**
 * 文件路径：apps/web/src/iGM_Components/iGM_UserCard/iGM_UserCard.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Community（好友/用户搜索）、G_AdminOrgVerify（组织成员）等用户列表场景
 * 模块：iGM_UserCard
 * 作用：统一的用户行卡片——头像、名称（链接资料页）、认证组织徽标、
 *       UID/副标题与可插拔操作区
 * 内容：纯展示组件，数据与操作由调用方提供；头像使用 iGM_Avatar，
 *       组织标识使用 iGM_VerifiedBadge，不含任何业务请求
 */

// 导入依赖 //
import type { ReactNode } from "react";
import { iGM_Link as Link } from "../iGM_Link/iGM_Link";
import { iGM_Avatar as IGM_Avatar } from "../iGM_Avatar/iGM_Avatar";
import { iGM_VerifiedBadge as IGM_VerifiedBadge } from "../iGM_VerifiedBadge/iGM_VerifiedBadge";
import type { iGM_OrgBadge } from "../../iGM_Services/iGM_OrgVerifyClient";
import styles from "./iGM_UserCard.module.css";

// 类型定义 //
/** 用户卡片所需的最小公开资料结构（兼容 iGM_Author 与用户搜索 DTO） */
export interface iGM_UserCardProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  /** 11 位 UID；旧列表 DTO 无此字段时不展示 */
  uid?: string;
  /** 认证组织徽标（未认证为 null） */
  verifiedOrg?: iGM_OrgBadge | null;
}

export interface iGM_UserCardProps {
  /** 用户公开资料 */
  user: iGM_UserCardProfile;
  /** 副标题（UID、简介、成为好友时间等） */
  subtitle?: ReactNode;
  /** 头像尺寸，默认 default */
  avatarSize?: "default" | "lg";
  /** 右侧操作区（加好友、发私信等按钮） */
  children?: ReactNode;
}

// 核心逻辑 //
/** 用户行卡片：头像 + 可点击名称 + 组织徽标 + 副标题 + 操作区 */
export function iGM_UserCard({
  user,
  subtitle,
  avatarSize = "default",
  children,
}: iGM_UserCardProps) {
  const name = user.displayName ?? user.username;

  return (
    <div className={styles.userCard}>
      <IGM_Avatar size={avatarSize} src={user.avatar} name={name} />
      <div className={styles.userMain}>
        <span className={styles.nameRow}>
          <Link
            href={`/G_User?userId=${encodeURIComponent(user.id)}`}
            className={styles.userName}
          >
            {name}
          </Link>
          {user.verifiedOrg && <IGM_VerifiedBadge org={user.verifiedOrg} />}
        </span>
        {subtitle !== undefined && <span className={styles.userSub}>{subtitle}</span>}
      </div>
      {children !== undefined && <div className={styles.rowActions}>{children}</div>}
    </div>
  );
}

// 导出 //
export default iGM_UserCard;
