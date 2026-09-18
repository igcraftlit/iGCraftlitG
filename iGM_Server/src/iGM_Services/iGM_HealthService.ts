/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_HealthService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Api_Health
 * 模块：iGM_HealthService
 * 作用：返回后端服务健康状态数据
 * 内容：服务名、版本号、运行状态、服务器时间
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";

// 类型定义 //
export interface iGM_HealthData {
  status: "ok";
  service: string;
  version: string;
  time: string;
}

// 核心逻辑 //
/** 查询健康状态，供 G_Api_Health 路由调用 */
export function iGM_GetHealth(): iGM_HealthData {
  return {
    status: "ok",
    service: "iGCraftLit Community API",
    version: iGM_Config.version,
    time: new Date().toISOString(),
  };
}

// 导出 //
export default iGM_GetHealth;
