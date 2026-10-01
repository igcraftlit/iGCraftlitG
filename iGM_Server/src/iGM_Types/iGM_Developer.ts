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
  iGM_ProjectDesc: string;
  iGM_ProjectUrl: string | null;
  iGM_Contact: string;
  iGM_ExpectedQuota: string | null;
  iGM_Reason: string;
  /** pending 待审核 / approved 已通过 / rejected 已拒绝 / withdrawn 已撤回 */
  iGM_Status: string;
  /** 审核人（组织所有者或管理员）用户 id */
  iGM_ReviewerId: string | null;
  /** 审核意见（通过或拒绝时填写） */
  iGM_ReviewComment: string | null;
  /** 模块十六起不发放，恒为 null，暂保留以对应数据库列 */
  iGM_ApiKey: string | null;
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
  createdAt: string;
  updatedAt: string;
}

/** 开发者申请入参（来自 G_Developer/apply 请求体） */
export interface iGM_DeveloperApplyInput {
  projectName: string;
  projectType: string;
  projectDesc: string;
  projectUrl: string | null;
  contact: string;
  expectedQuota: string | null;
  reason: string;
  /** 是否同意开发者规范（必须勾选） */
  agreeRules: boolean;
}

/** 管理端申请列表行（连申请人用户名与昵称） */
export interface iGM_DeveloperApplicationAdminRow
  extends iGM_DeveloperApplicationRow {
  iGM_Username: string;
  iGM_DisplayName: string | null;
}