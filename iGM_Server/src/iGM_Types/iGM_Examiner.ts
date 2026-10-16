/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Examiner.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Examiner（/api/exam/creator/profile、/G_Examiner/revoke）
 * 模块：iGM_Examiner
 * 作用：命题创作者数据行、编号 DTO 与辅助函数类型
 * 说明：命题创作者申请与命题方预设模块已于 047 迁移移除
 */

// 导入依赖 //
// （纯类型模块，无运行时依赖）

// 类型定义 //
/** 命题创作者账号状态：正常 / 已撤销 */
export type iGM_ExaminerStatus = "active" | "suspended";

/** 命题创作者数据行（对应 iGM_Examiners） */
export interface iGM_ExaminerRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Status: string;
  /** 命题创作者专属编号（10 位零填充，形如 0000000001；未编号时为 null） */
  iGM_CreatorNumber: string | null;
  iGM_ApprovedAt: string;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 命题者编号 DTO（对外，考试站右上角徽标使用） */
export interface iGM_CreatorProfileDto {
  /** 是否具备命题创作者资格 */
  isExaminer: boolean;
  /** 命题创作者专属编号（10 位零填充，前端补 # 前缀） */
  creatorNumber: string;
  /** 准入状态（仅在册命题创作者会返回，固定为 approved） */
  status: iGM_ExaminerStatus | "approved";
}

// 核心逻辑 //
/** 逗号分隔文本 → 去重去空数组 */
export function iGM_SplitCommaList(value: string): string[] {
  const seen = new Set<string>();
  for (const part of value.split(/[,，]/)) {
    const trimmed = part.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen];
}

/** 数组 → 逗号分隔文本 */
export function iGM_JoinCommaList(values: readonly string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(",");
}

// 导出 //
