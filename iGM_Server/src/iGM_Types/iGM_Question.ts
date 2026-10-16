/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Question.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Question（/api/question/*）
 * 模块：iGM_Question
 * 作用：题库题目的教材目录、枚举、数据行与 DTO 类型定义
 * 内容：固定教材目录（六册）、教材编码 / 题型 / 难度 / 状态类型、题目数据行、
 *       选项、题目 DTO、字段校验与选项序列化工具、难度归一等
 * 说明：教材名称一律由教材编码在服务端派生，前端传入的名称一律忽略；
 *       选项以 JSON 文本存库（[{"key":"A","text":"..."}]），对外暴露为对象数组
 */

// 导入依赖 //
import {
  iGM_JoinCommaList,
  iGM_SplitCommaList,
} from "./iGM_Examiner";

// 类型定义 //
/** 教材编码（六册固定目录） */
export type iGM_TextbookCode =
  | "Compulsory_1"
  | "Compulsory_2"
  | "Elective_1"
  | "Elective_2"
  | "Elective_3"
  | "Elective_4";

/** 固定教材目录：编码 → 中文名称（前后端必须保持一致） */
export const iGM_QuestionTextbooks: Record<iGM_TextbookCode, string> = {
  Compulsory_1: "必修一：Minecraft基础导论",
  Compulsory_2: "必修二：红石与指令基础",
  Elective_1: "选修一：社区与建筑艺术",
  Elective_2: "选修二：红石进阶与指令应用",
  Elective_3: "选修三：服务器开发与架构",
  Elective_4: "选修四：内容创作与跨界应用",
};

/** 教材编码有序列表（静态导出与筛选项按此顺序） */
export const iGM_QuestionTextbookCodes: iGM_TextbookCode[] = [
  "Compulsory_1",
  "Compulsory_2",
  "Elective_1",
  "Elective_2",
  "Elective_3",
  "Elective_4",
];

/** 题型 */
export type iGM_QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "short_answer";

/** 难度等级 */
export type iGM_QuestionDifficultyLevel = "easy" | "medium" | "hard";

/** 题目状态：草稿 / 已发布 */
export type iGM_QuestionStatus = "draft" | "published";

/** 题目选项 */
export interface iGM_QuestionOption {
  key: string;
  text: string;
}

/** 题目数据行（对应 iGM_QuestionBank） */
export interface iGM_QuestionRow {
  iGM_Id: string;
  iGM_CreatorId: string;
  iGM_Stem: string | null;
  iGM_Type: string | null;
  iGM_Options: string | null;
  iGM_Answer: string | null;
  iGM_Analysis: string | null;
  iGM_TextbookCode: string;
  iGM_TextbookName: string;
  iGM_DifficultyCoefficient: number | null;
  iGM_DifficultyLevel: string | null;
  iGM_Tags: string | null;
  iGM_Status: string;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 题目 DTO（对外） */
export interface iGM_QuestionDto {
  id: string;
  textbookCode: string;
  textbookName: string;
  stem: string;
  type: iGM_QuestionType;
  options: iGM_QuestionOption[];
  answer: string;
  analysis: string;
  difficultyCoefficient: number | null;
  difficultyLevel: iGM_QuestionDifficultyLevel | null;
  tags: string[];
  status: iGM_QuestionStatus;
  createdAt: string;
  updatedAt: string;
}

// 核心逻辑 //
/** 判断字符串是否为合法题型 */
export function iGM_IsQuestionType(value: string): value is iGM_QuestionType {
  return (
    value === "single_choice" ||
    value === "multiple_choice" ||
    value === "true_false" ||
    value === "fill_blank" ||
    value === "short_answer"
  );
}

/** 判断字符串是否为合法题目状态 */
export function iGM_IsQuestionStatus(
  value: string,
): value is iGM_QuestionStatus {
  return value === "draft" || value === "published";
}

/** 判断字符串是否为合法教材编码 */
export function iGM_IsTextbookCode(value: string): value is iGM_TextbookCode {
  return Object.prototype.hasOwnProperty.call(iGM_QuestionTextbooks, value);
}

/** 由教材编码解析教材名称（非法编码返回空串） */
export function iGM_ResolveTextbookName(code: string): string {
  return iGM_IsTextbookCode(code) ? iGM_QuestionTextbooks[code] : "";
}

/** 由难度系数归一难度等级（空值默认 medium；<0.4 easy，<0.7 medium，其余 hard） */
export function iGM_NormalizeDifficultyLevel(
  coefficient: number | null | undefined,
): iGM_QuestionDifficultyLevel {
  if (coefficient === null || coefficient === undefined) return "medium";
  if (coefficient < 0.4) return "easy";
  if (coefficient < 0.7) return "medium";
  return "hard";
}

/** 解析选项 JSON 文本为对象数组（异常一律返回空数组） */
export function iGM_ParseQuestionOptions(
  raw: string | null,
): iGM_QuestionOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
      .map((item) => ({
        key: typeof item.key === "string" ? item.key : "",
        text: typeof item.text === "string" ? item.text : "",
      }));
  } catch {
    return [];
  }
}

/** 选项对象数组序列化为 JSON 文本（空数组存空串） */
export function iGM_SerializeQuestionOptions(
  options: readonly iGM_QuestionOption[],
): string {
  const normalized = options
    .map((option) => ({
      key: String(option.key ?? "").trim(),
      text: String(option.text ?? "").trim(),
    }))
    .filter((option) => option.key.length > 0 || option.text.length > 0);
  return normalized.length > 0 ? JSON.stringify(normalized) : "";
}

// 导出 //
export { iGM_SplitCommaList, iGM_JoinCommaList };
export default iGM_QuestionTextbooks;
