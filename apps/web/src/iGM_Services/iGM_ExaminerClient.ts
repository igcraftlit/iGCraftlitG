/**
 * 文件路径：apps/web/src/iGM_Services/iGM_ExaminerClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Examiner/*
 * 模块：iGM_ExaminerClient
 * 作用：命题创作者申请审核相关后端接口的唯一前端调用出口
 * 内容：待审 / 历史申请列表（按状态分页），审核（通过 / 拒绝 + 审核意见）
 * 约束：只经 iGM_Request（iGM_Get / iGM_Post）发请求，Cookie 自动携带；
 *       仅管理员 / 信任组织负责人可审核，普通用户后端返回 403
 */

// 导入依赖 //
import {
  iGM_Get,
  iGM_Post,
  type iGM_ApiResponse,
} from "./iGM_Request";

// 类型定义 //
/** 命题创作者申请状态：pending 待审核 / approved 已通过 / rejected 已拒绝 */
export type iGM_ExaminerStatus = "pending" | "approved" | "rejected";

/** 命题创作者申请 */
export interface iGM_ExaminerApplication {
  id: string;
  userId: string;
  /** 真实姓名 */
  realName: string;
  /** 联系方式 */
  contact: string;
  /** 个人简介 */
  bio: string;
  /** 命题方向 */
  directions: string[];
  /** 作品链接 */
  portfolioUrl: string;
  /** 申请理由 */
  reason: string;
  /** 申请状态 */
  status: string;
  /** 审核意见 */
  reviewComment: string;
  createdAt: string;
  updatedAt: string;
  /** 申请人展示名（后端列表接口附加） */
  applicantName?: string;
  /** 申请人社区 iGMUid（后端列表接口附加） */
  applicantUid?: string;
  /** 申请人邮箱（后端列表接口附加） */
  applicantEmail?: string;
}

/** 命题创作者申请列表（按状态分页） */
export interface iGM_ExaminerApplicationList {
  applications: iGM_ExaminerApplication[];
  total: number;
  page: number;
  pageSize: number;
}

// 核心逻辑 //
/** 命题创作者申请列表（仅管理员 / 信任组织负责人） */
export function iGM_ApiListExaminerApplications(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<iGM_ApiResponse<iGM_ExaminerApplicationList>> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return iGM_Get(`/G_Examiner/review${query ? `?${query}` : ""}`);
}

/** 审核命题创作者申请（仅管理员 / 信任组织负责人） */
export function iGM_ApiReviewExaminer(input: {
  applicationId: string;
  action: "approve" | "reject";
  comment?: string;
}): Promise<iGM_ApiResponse<{ applicationId: string; action: string }>> {
  return iGM_Post("/G_Examiner/review", input);
}

// 导出 //
export default {
  iGM_ApiListExaminerApplications,
  iGM_ApiReviewExaminer,
};
