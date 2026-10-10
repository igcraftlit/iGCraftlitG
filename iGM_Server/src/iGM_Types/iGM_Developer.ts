/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Developer.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Developer
 * 模块：iGM_Developer
 * 作用：定义开发者资格申请（SDK / 适配器协议）领域共享类型
 * 内容：iGM_DeveloperApplications 表数据行、对外 DTO、申请入参与管理端列表行
 * 说明：审核只变更状态与审核意见，通过即授予开发者接入资格（不发放 API Key），
 *       表内 iGM_ApiKey 列保留但暂不使用
 */

// 导入依赖 //
// （本文件仅包含类型定义，无运行时依赖）

// 类型定义 //
/** 申请状态：pending 待审核 / approved 已通过 / rejected 已拒绝 / withdrawn 已撤回 */
export type iGM_DeveloperStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn";

/** 项目类型取值：launcher 启动器 / tool 工具 / website 网站 / plugin 插件 / other 其他 */
export type iGM_DeveloperProjectType =
  | "launcher"
  | "tool"
  | "website"
  | "plugin"
  | "other";

/** 预期调用量取值：low 低 / medium 中 / high 高 */
export type iGM_DeveloperQuota = "low" | "medium" | "high";

/** iGM_DeveloperApplications 表数据行 */
export interface iGM_DeveloperApplicationRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_ProjectName: string;
  iGM_ProjectType: string;
  /** 项目介绍（规范要求 > 100 字） */
  iGM_ProjectDesc: string;
  iGM_ProjectUrl: string | null;
  /** 联系方式展示文本（由邮箱 / 手机合并写入） */
  iGM_Contact: string;
  iGM_ExpectedQuota: string | null;
  /** 申请理由（规范要求 > 200 字） */
  iGM_Reason: string;
  /** pending 待审核 / approved 已通过 / rejected 已拒绝 / withdrawn 已撤回 */
  iGM_Status: string;
  /** 审核人（组织所有者或管理员）用户 id */
  iGM_ReviewerId: string | null;
  /** 审核意见（通过或拒绝时填写） */
  iGM_ReviewComment: string | null;
  /** 模块十六起不发放，恒为 null，暂保留以对应数据库列 */
  iGM_ApiKey: string | null;
  /* ---------- 模块二十六：开发者申请规范化新增字段 ---------- */
  /** 开发者名称（默认社区用户名，可修改） */
  iGM_DeveloperName: string | null;
  /** 年龄（1-120） */
  iGM_Age: number | null;
  /** 生日-月（1-12） */
  iGM_BirthMonth: number | null;
  /** 生日-日（1-31） */
  iGM_BirthDay: number | null;
  iGM_ContactEmail: string | null;
  iGM_ContactPhone: string | null;
  iGM_Country: string | null;
  iGM_Province: string | null;
  iGM_City: string | null;
  iGM_Address: string | null;
  iGM_PostalCode: string | null;
  /** 申请人域名（可选） */
  iGM_Domain: string | null;
  /** 附加说明（可选） */
  iGM_Additional: string | null;
  /** 所属公示批次 id */
  iGM_BatchId: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 开发者申请 DTO（对外结构） */
export interface iGM_DeveloperApplicationDto {
  id: string;
  userId: string;
  projectName: string;
  projectType: string;
  projectDesc: string;
  projectUrl: string | null;
  contact: string;
  expectedQuota: string | null;
  reason: string;
  status: string;
  reviewerId: string | null;
  /** 审核人显示名（用户名或昵称），未审核时为 null */
  reviewerName: string | null;
  reviewComment: string | null;
  /* ---------- 模块二十六：规范化新增字段 ---------- */
  developerName: string | null;
  age: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  country: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  domain: string | null;
  additional: string | null;
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 开发者申请入参（来自 G_Developer/apply 请求体，规范化后结构） */
export interface iGM_DeveloperApplyInput {
  /** 开发者名称（默认社区用户名） */
  developerName: string;
  /** 年龄（1-120） */
  age: number;
  /** 生日-月（1-12） */
  birthMonth: number;
  /** 生日-日（1-31） */
  birthDay: number;
  contactEmail: string | null;
  contactPhone: string | null;
  country: string;
  province: string;
  city: string;
  address: string;
  postalCode: string;
  /** 项目名称 */
  projectName: string;
  /** 项目介绍（> 100 字） */
  projectIntro: string;
  /** 申请人域名（可选） */
  domain: string | null;
  /** 申请理由（> 200 字） */
  reason: string;
  /** 附加说明（可选） */
  additional: string | null;
  /** 是否同意开发者规范（必须勾选） */
  agreeRules: boolean;
}

/** iGM_DeveloperBatches 表数据行（公示批次） */
export interface iGM_DeveloperBatchRow {
  iGM_Id: string;
  iGM_BatchName: string;
  /** 本批次名额（默认 30） */
  iGM_Quota: number;
  iGM_PublishedAt: string | null;
  /** pending 待公示 / active 公示中 / closed 已结束 */
  iGM_Status: string;
  iGM_CreatedAt: string;
}

/** iGM_DeveloperPublicity 表数据行（公示条目，连表带出社区 iGMUid） */
export interface iGM_DeveloperPublicityRow {
  iGM_Id: string;
  iGM_BatchId: string;
  iGM_ApplicationId: string;
  iGM_UserId: string;
  iGM_DeveloperName: string;
  iGM_ProjectName: string;
  iGM_ApprovedAt: string;
  /** 连表带出的社区 iGMUid */
  iGM_Uid: string | null;
}

/** 管理端申请列表行（连申请人用户名与昵称） */
export interface iGM_DeveloperApplicationAdminRow
  extends iGM_DeveloperApplicationRow {
  iGM_Username: string;
  iGM_DisplayName: string | null;
}
