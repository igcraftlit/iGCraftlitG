/**
 * 文件路径：iGM_Server/scripts/iGM_GrantUPR.ts
 * 所属层：后端 / 运维脚本（非运行时依赖）
 * 路由：无（直接调用数据访问层与业务服务层）
 * 模块：iGM_GrantUPR
 * 作用：为官方账号 iGCraftLit 补充 1000 UPR（AI 赋能系统模块四，一次性执行）
 * 内容：按用户名查找账号 → 调用 iGM_GrantUPRService 增加余额并写入 reward 流水
 * 说明：运行命令（工作目录 iGM_Server）：bun run scripts/iGM_GrantUPR.ts
 *       流水 type 为 reward，detail 为「官方账号额度补充」；执行完毕自行退出
 */

// 导入依赖 //
import { iGM_FindUserByUsername } from "../src/iGM_Repositories/iGM_UserRepository";
import { iGM_GrantUPRService } from "../src/iGM_Services/iGM_QuotaService";

// 类型定义 //
// （本脚本无额外类型）

// 核心逻辑 //
/** 目标账号名（用户名查询不区分大小写） */
const iGM_TargetUsername = "iGCraftLit";
/** 补充额度 */
const iGM_GrantAmount = 1000;
/** 流水备注 */
const iGM_GrantDetail = "官方账号额度补充";

const user = await iGM_FindUserByUsername(iGM_TargetUsername);
if (!user) {
  console.error(`[iGM_GrantUPR] 未找到账号：${iGM_TargetUsername}`);
  process.exit(1);
}

const balance = await iGM_GrantUPRService(
  user.iGM_Id,
  iGM_GrantAmount,
  iGM_GrantDetail,
);
console.log(
  `[iGM_GrantUPR] ${iGM_TargetUsername}（UID ${user.iGM_Uid}）已补充 ${iGM_GrantAmount} UPR，当前余额：${balance}`,
);
process.exit(0);