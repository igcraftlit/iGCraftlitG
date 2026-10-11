/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_ExamStaticClient.ts
 * 所属层：前端 / 服务层
 * 路由：E_ExamList（/）、E_ExamDetail（/detail?id=xxx）
 * 模块：iGM_ExamStaticClient
 * 作用：直接读取随前端部署的静态试卷数据（public/exams/），无需后端即可浏览已发布试卷
 * 内容：索引读取（index.json）、单份试卷读取（<examId>.json）、静态详情类型、错误归一化
 * 说明：静态数据由后端在发布时导出并随 Cloudflare Pages 部署；
 *       仅上传 / 解析 / 审查 / 管理端仍依赖后端 API，普通用户查看完全静态
 */

// 导入依赖 //
import { iGM_ExamRequestError, type iGM_ExamListItem } from "./iGM_ExamClient";

// 类型定义 //
/** 单份试卷静态数据（public/exams/<examId>.json） */
export interface iGM_ExamStaticDetail {
  id: string;
  code: string;
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
  notice: string;
  status: string;
  convertStatus: string;
  fileSize: number | null;
  createdAt: string;
  fileName: string;
  pageWidth: number | null;
  pageHeight: number | null;
  /** 静态正文入口（站点根相对路径，如 /exams/<id>/index.html） */
  htmlPath: string;
  /** 图片文件名列表（与正文同级，保持原始格式） */
  images: string[];
  /** 答案附件静态地址（站点根相对路径）；未上传时为空串 */
  answerPdfUrl: string;
}

/** 索引文件结构（public/exams/index.json） */
interface iGM_ExamStaticIndex {
  generatedAt: string;
  exams: iGM_ExamListItem[];
  /** 全部命题方名称（去重，供目录页筛选；缺省时为空数组） */
  issuers: string[];
}

// 核心逻辑 //
/** 静态数据根路径（随前端部署，dev 与生产一致） */
const iGM_ExamStaticBase = "/exams";

/** 线上静态数据根路径（部署状态轮询用，指向生产站点） */
const iGM_ExamStaticOnlineBase =
  process.env.NEXT_PUBLIC_IGM_EXAM_STATIC_BASE ?? "https://exam.igcraftlit.com/exams";

/** 拉取并解析 JSON，失败时抛出归一化错误 */
async function iGM_Exam_FetchStaticJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${iGM_ExamStaticBase}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new iGM_ExamRequestError(
      "Unable to load the static examination data. Please try again later.",
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
      `Invalid static examination data (HTTP ${response.status}).`,
      response.status,
    );
  }
}

/** 已发布试卷索引（静态） */
export async function iGM_Exam_FetchStaticIndex(): Promise<iGM_ExamListItem[]> {
  const data = await iGM_Exam_FetchStaticJson<iGM_ExamStaticIndex>("/index.json");
  return Array.isArray(data.exams) ? data.exams : [];
}

/** 全部命题方名称（静态索引 issuers 字段；缺省时为空数组） */
export async function iGM_Exam_FetchStaticIssuers(): Promise<string[]> {
  const data = await iGM_Exam_FetchStaticJson<iGM_ExamStaticIndex>("/index.json");
  return Array.isArray(data.issuers) ? data.issuers : [];
}

/** 单份试卷详情（静态） */
export async function iGM_Exam_FetchStaticDetail(
  examId: string,
): Promise<iGM_ExamStaticDetail> {
  return await iGM_Exam_FetchStaticJson<iGM_ExamStaticDetail>(
    `/${encodeURIComponent(examId)}.json`,
  );
}

/**
 * 读取线上（生产站点）已部署试卷的 id 集合
 * 用于管理端判断"部署中 / 已发布"：带上时间戳绕过 CDN 缓存
 */
export async function iGM_Exam_FetchOnlineIndexIds(): Promise<Set<string>> {
  const response = await fetch(
    `${iGM_ExamStaticOnlineBase}/index.json?t=${Date.now()}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  if (!response.ok) {
    throw new iGM_ExamRequestError(`HTTP ${response.status}`, response.status);
  }
  const data = (await response.json()) as iGM_ExamStaticIndex;
  const list = Array.isArray(data.exams) ? data.exams : [];
  return new Set(list.map((item) => item.id));
}

// 导出 //
export default {
  iGM_Exam_FetchStaticIndex,
  iGM_Exam_FetchStaticIssuers,
  iGM_Exam_FetchStaticDetail,
  iGM_Exam_FetchOnlineIndexIds,
};
