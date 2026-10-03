/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_OrgVerify.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_OrgVerify、G_Admin
 * 模块：iGM_OrgVerify
 * 作用：定义模块七组织认证领域共享类型
 * 内容：组织与认证申请数据库行、对外 DTO、认证徽标 DTO、申请状态
 */

// 导入依赖 //
// （本文件仅包含类型定义与常量，无运行时依赖）

// 类型定义 //
/** 申请状态：pending 待审核 / approved 已通过 / rejected 已拒绝 / cancelled 已取消 / left 已退出 */
export type iGM_OrgVerifyStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "left";

/** iGM_Organizations 表数据行 */
export interface iGM_OrganizationRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_Slug: string;
  iGM_Description: string;
  /** 模块七增强：关于组织内容（负责人可编辑） */
  iGM_AboutContent: string;
  iGM_Logo: string | null;
  iGM_IsTrusted: number;
  /** 模块七增强：负责人邮箱（仅后端权限判定与详情本人态使用，不公开下发） */
  iGM_OwnerEmail: string | null;
  iGM_CreatedAt: string;
}

/** iGM_OrgVerifications 表数据行 */
export interface iGM_OrgVerificationRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_OrgId: string;
  iGM_Reason: string;
  iGM_Proof: string | null;
  iGM_Status: iGM_OrgVerifyStatus;
  iGM_ReviewerId: string | null;
  iGM_ReviewComment: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 认证徽标 DTO：内嵌到作者/用户资料等 DTO 中展示 */
export interface iGM_OrgBadgeDto {
  id: string;
  name: string;
  slug: string;
  /**
   * 模块七第三轮：该用户是否为该组织负责人（所有者金标）。
   * 仅在按用户解析徽标时出现；组织自身等非用户场景不带此字段。
   */
  isOwner?: boolean;
}

/** 受信任组织 DTO（申请页卡片） */
export interface iGM_OrganizationDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** 模块七增强：关于组织内容（组织详情页展示） */
  aboutContent: string;
  logo: string | null;
  /**
   * 社交生态优化：组织登记的负责人账号是否已入驻（邮箱匹配的站内用户存在）。
   * 仅受信任组织列表填充；无负责人组织的认证申请将长期挂起，申请页据此提示。
   */
  hasOwner?: boolean;
}

/** 我的组织详情 DTO：组织信息 + 当前用户是否为该组织负责人 */
export interface iGM_MyOrgDetailDto {
  organization: iGM_OrganizationDto;
  /** 当前登录用户是否为该组织负责人（可编辑关于组织） */
  isOwner: boolean;
}

/** 我的申请记录 DTO（用户视角） */
export interface iGM_OrgVerificationDto {
  id: string;
  org: iGM_OrgBadgeDto;
  reason: string;
  /** 证明材料：文本说明或站内文件 ID */
  proof: string | null;
  status: iGM_OrgVerifyStatus;
  reviewComment: string | null;
  reviewerName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 管理端申请条目 DTO：附带申请人信息 */
export interface iGM_AdminOrgVerificationDto extends iGM_OrgVerificationDto {
  userId: string;
  username: string;
  userDisplayName: string | null;
  userAvatar: string | null;
  userEmail: string;
  /**
   * 当前查看者是否有权审核该条申请。
   * 社交生态优化后仅对应组织负责人为 true；admin/moderator 只读恒为 false。
   */
  canReview: boolean;
}

/** 管理端申请分页数据 */
export interface iGM_AdminOrgVerificationListData {
  items: iGM_AdminOrgVerificationDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 当前查看者视角：true=负责人可操作视图；false=管理只读视图 */
  canReview: boolean;
}

/** 组织成员条目 DTO（组织详情页成员列表） */
export interface iGM_OrgMemberDto {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  /** 11 位全局唯一 UID */
  uid: string;
  /** 加入组织时间（approved 申请的 UpdatedAt）；历史数据缺失时为 null */
  joinedAt: string | null;
  /** 是否为该组织负责人（按组织登记负责人邮箱比对） */
  isOwner: boolean;
}

/** 组织成员列表数据（公开只读） */
export interface iGM_OrgMemberListData {
  organization: iGM_OrgBadgeDto;
  items: iGM_OrgMemberDto[];
}

// 核心逻辑 //
/** 全部申请状态常量 */
export const iGM_OrgVerifyStatuses: iGM_OrgVerifyStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "left",
];

/** 判断未知字符串是否为合法申请状态 */
export function iGM_IsOrgVerifyStatus(
  value: unknown,
): value is iGM_OrgVerifyStatus {
  return (
    typeof value === "string" &&
    iGM_OrgVerifyStatuses.includes(value as iGM_OrgVerifyStatus)
  );
}

/** 组织行转徽标 DTO */
export function iGM_ToOrgBadge(row: iGM_OrganizationRow): iGM_OrgBadgeDto {
  return { id: row.iGM_Id, name: row.iGM_Name, slug: row.iGM_Slug };
}

/**
 * 模块七增强：受信任组织负责人账号表（与迁移种子的 iGM_OwnerEmail 一致）。
 * 这些邮箱注册时自动获得对应组织认证，无需申请。
 * 模块七第三轮起：负责人账号不再授予全局 admin 角色，仅为普通用户，
 * 只能管理自己所属组织的认证审核内容（见 iGM_AssertCanReview）。
 */
export const iGM_OrgOwnerAccounts: ReadonlyArray<{
  email: string;
  orgId: string;
}> = [
  { email: "igcraftlit@outlook.com", orgId: "org-igcraftlit" },
  { email: "cayihuo@outlook.com", orgId: "org-muoceon" },
];

/**
 * 查询邮箱对应的负责人组织：返回 orgId 表示该邮箱为组织负责人账号
 * （大小写不敏感，邮箱注册时已统一小写存储）
 */
export function iGM_FindOwnerOrgByEmail(
  email: string,
): { email: string; orgId: string } | null {
  const lower = email.trim().toLowerCase();
  return iGM_OrgOwnerAccounts.find((item) => item.email === lower) ?? null;
}

/** 组织行转组织 DTO */
export function iGM_ToOrganizationDto(
  row: iGM_OrganizationRow,
): iGM_OrganizationDto {
  return {
    id: row.iGM_Id,
    name: row.iGM_Name,
    slug: row.iGM_Slug,
    description: row.iGM_Description,
    aboutContent: row.iGM_AboutContent ?? "",
    logo: row.iGM_Logo,
  };
}

// 导出 //
export default iGM_OrgVerifyStatuses;
