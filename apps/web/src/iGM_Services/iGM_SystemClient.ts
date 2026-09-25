/**
 * 文件路径：apps/web/src/iGM_Services/iGM_SystemClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Api/*
 * 模块：iGM_SystemClient
 * 作用：公共系统信息接口的唯一前端调用出口
 * 内容：客户端 IP 检测（《用户管理规定》独立页告知用）
 * 约束：只经 iGM_Request 发请求；IP 由后端自行解析，不使用任何第三方服务
 */

// 导入依赖 //
import { iGM_Get, type iGM_ApiResponse } from "./iGM_Request";

// 类型定义 //
/** 客户端 IP 检测结果 */
export interface iGM_ClientIpData {
  ip: string;
}

// 核心逻辑 //
/** 获取本次请求解析出的客户端 IP */
export function iGM_ApiGetClientIp(): Promise<iGM_ApiResponse<iGM_ClientIpData>> {
  return iGM_Get("/G_Api_ClientIp");
}

// 导出 //
export default {
  iGM_ApiGetClientIp,
};
