/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_QuestionStaticClient.ts
 * 所属层：前端 / 服务层
 * 路由：E_QuestionBank（/bank）、E_QuestionBankDetail（/bank/detail?questionId=xxx）
 * 模块：iGM_QuestionStaticClient
 * 作用：直接读取随前端部署的静态题库数据（public/questions/），无需后端即可离线浏览已发布题目
 * 内容：题库索引读取（index.json）、单题读取、静态题目与教材类型、错误归一化
 * 说明：静态数据由后端在发布时导出并随 Cloudflare Pages 部署；
 *       索引缺失（404）时按空题库优雅降级，单题缺失抛 NOT_FOUND 供页面提示
 */

// 导入依赖 //
import { iGM_ExamRequestError } from "./iGM_ExamClient";

// 类型定义 //
/** 选项（键 + 文本） */
export interface iGM_QuestionStaticOption {
  key: string;
  text: string;
}

/** 静态题目条目 */
export interface iGM_QuestionStaticItem {
  id: string;
  textbookCode: string;
  textbookName: string;
  stem: string;
  type: string;
  options: iGM_QuestionStaticOption[];
  answer: string;
  analysis: string;
  difficultyCoefficient: number | null;
  difficultyLevel: string;
  tags: string[];
  createdAt: string;
}

/** 静态教材条目 */
export interface iGM_QuestionStaticTextbook {
  code: string;
  name: string;
}

/** 静态题库索引结构（public/questions/index.json） */
export interface iGM_QuestionStaticBank {
  generatedAt?: string;
  textbooks: iGM_QuestionStaticTextbook[];
  questions: iGM_QuestionStaticItem[];
}

// 核心逻辑 //
/** 静态数据根路径（随前端部署，dev 与生产一致） */
const iGM_QuestionStaticBase = "/questions";

/** 拉取并解析 JSON，失败时抛出归一化错误 */
async function iGM_Question_FetchStaticJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${iGM_QuestionStaticBase}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new iGM_ExamRequestError(
      "Unable to load the static question data. Please try again later.",
    );
  }
  if (!response.ok) {
    throw new iGM_ExamRequestError(
      response.status === 404 ? "NOT_FOUND" : `HTTP ${response.status}`,
      response.status,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new iGM_ExamRequestError(
      `Invalid static question data (HTTP ${response.status}).`,
      response.status,
    );
  }
}

/**
 * 静态题库索引（教材 + 题目）。
 * 索引文件缺失（404）时返回空题库，供页面优雅降级
 */
export async function iGM_Question_FetchStaticBank(): Promise<iGM_QuestionStaticBank> {
  try {
    const data = await iGM_Question_FetchStaticJson<iGM_QuestionStaticBank>(
      "/index.json",
    );
    return {
      generatedAt: data.generatedAt,
      textbooks: Array.isArray(data.textbooks) ? data.textbooks : [],
      questions: Array.isArray(data.questions) ? data.questions : [],
    };
  } catch (error) {
    if (error instanceof iGM_ExamRequestError && error.code === 404) {
      return { textbooks: [], questions: [] };
    }
    throw error;
  }
}

/** 单题详情（静态）；缺失时抛出 code 为 404 的 NOT_FOUND */
export async function iGM_Question_FetchStaticQuestion(
  id: string,
): Promise<iGM_QuestionStaticItem> {
  const bank = await iGM_Question_FetchStaticBank();
  const found = bank.questions.find((item) => item.id === id);
  if (!found) {
    throw new iGM_ExamRequestError("NOT_FOUND", 404);
  }
  return found;
}

// 导出 //
export default {
  iGM_Question_FetchStaticBank,
  iGM_Question_FetchStaticQuestion,
};
