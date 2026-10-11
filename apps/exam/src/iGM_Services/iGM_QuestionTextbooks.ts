/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_QuestionTextbooks.ts
 * 所属层：前端 / 服务层
 * 路由：E_QuestionBank（/bank）、E_QuestionBankDetail（/bank/detail）、E_QuestionEditor（/editor）
 * 模块：iGM_QuestionTextbooks
 * 作用：固定教材目录（6 本），题库与命题管理共用的教材枚举
 * 内容：教材代码 / 名称有序数组、按代码取名称的辅助函数
 * 说明：代码须与后端严格一致，前端不得增删或改写；未匹配时原样返回代码
 */

// 类型定义 //
/** 教材条目：代码 + 展示名称 */
export interface iGM_QuestionTextbook {
  code: string;
  name: string;
}

// 核心逻辑 //
/** 固定教材目录（顺序即展示顺序） */
export const iGM_QuestionTextbooks: iGM_QuestionTextbook[] = [
  { code: "Compulsory_1", name: "必修一：Minecraft基础导论" },
  { code: "Compulsory_2", name: "必修二：红石与指令基础" },
  { code: "Elective_1", name: "选修一：社区与建筑艺术" },
  { code: "Elective_2", name: "选修二：红石进阶与指令应用" },
  { code: "Elective_3", name: "选修三：服务器开发与架构" },
  { code: "Elective_4", name: "选修四：内容创作与跨界应用" },
];

/** 按教材代码取名称；未匹配时原样返回代码 */
export function iGM_QuestionTextbookName(code: string): string {
  const found = iGM_QuestionTextbooks.find((item) => item.code === code);
  return found ? found.name : code;
}

// 导出 //
export default {
  iGM_QuestionTextbooks,
  iGM_QuestionTextbookName,
};
