/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Response.ts
 * 所属层：后端 / 类型定义层
 * 路由：全局
 * 模块：iGM_Response
 * 作用：定义后端统一响应结构
 * 内容：{ success, code, message, data } 标准响应体类型
 */

// 导入依赖 //
// （本文件仅包含类型定义，无运行时依赖）

// 类型定义 //
/** 统一响应体：所有 G_Xxxxx 路由必须返回此结构 */
export interface iGM_ApiResponse<T = unknown> {
  /** 业务是否成功 */
  success: boolean;
  /** 业务状态码 */
  code: number;
  /** 提示信息 */
  message: string;
  /** 业务数据 */
  data: T | null;
}

// 核心逻辑 //
/** 构造成功响应 */
export function iGM_Ok<T>(data: T, message = "ok"): iGM_ApiResponse<T> {
  return { success: true, code: 200, message, data };
}

/** 构造失败响应 */
export function iGM_Fail(
  code: number,
  message: string,
): iGM_ApiResponse<null> {
  return { success: false, code, message, data: null };
}

// 导出 //
export type { iGM_ApiResponse as iGM_ResponseType };
