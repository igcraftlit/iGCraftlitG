/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamStaticService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/confirm 发布后由路由层调用）
 * 模块：iGM_ExamStaticService
 * 作用：把已发布试卷导出为静态 JSON 与静态 HTML 目录，随前端部署到 Cloudflare Pages，
 *       使考试站在后端不启动时仍可浏览全部已发布试卷
 * 内容：静态根目录解析、单份试卷静态导出（HTML 目录复制 + 元数据 JSON）、
 *       索引 JSON 重建、批量导出、Git 提交推送
 * 说明：不使用任何 Cloudflare 存储，仅写入前端仓库 public/exams/ 由 Pages 静态托管；
 *       图片保持原始格式（png/jpg/...），不做 WebP 转换
 */

// 导入依赖 //
import {
  cp,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  iGM_FindExamById,
  iGM_FindExamFileByExamId,
  iGM_ListExamIdCreatedPairs,
  iGM_ListExamsByStatus,
} from "../iGM_Repositories/iGM_ExamRepository";
import { iGM_ListIssuerPresetsVisibleTo } from "../iGM_Repositories/iGM_IssuerPresetRepository";
import {
  iGM_ExamAnswerAbsolutePath,
  iGM_ExamAnswerFileName,
  iGM_ExamAnswerStaticPath,
  iGM_ExamHtmlDir,
  iGM_ReadExamPageSize,
} from "./iGM_ExamIngestService";
import type { iGM_ExamRow } from "../iGM_Types/iGM_Exam";

// 类型定义 //
/** 单份试卷静态 JSON（<examId>.json） */
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

/** 索引 JSON（index.json）中的列表项 */
export interface iGM_ExamStaticIndexItem {
  id: string;
  code: string;
  title: string;
  subject: string;
  issuer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
  status: string;
  convertStatus: string;
  fileSize: number | null;
  createdAt: string;
}

/** 试卷标识白名单：uuid 主名，杜绝路径穿越 */
const iGM_ExamIdPattern = /^[A-Za-z0-9-]{1,64}$/;

/** 图片扩展名白名单（保持原始格式，不转 WebP） */
const iGM_ExamImageExt = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

// 核心逻辑 //
/** 仓库根目录（iGM_Server 的上一级） */
function iGM_RepoRoot(): string {
  return fileURLToPath(new URL("../../../", import.meta.url));
}

/** 前端试卷静态根目录：<仓库根>/apps/exam/public/exams（可用 IGM_EXAM_STATIC_DIR 覆盖） */
export function iGM_ExamStaticRoot(): string {
  const explicit = process.env.IGM_EXAM_STATIC_DIR;
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  return join(iGM_RepoRoot(), "apps", "exam", "public", "exams");
}

/** 试卷编号映射：按创建年份分组，组内按创建时间顺序编号 E-YYYY-NNN */
async function iGM_BuildExamCodeMap(): Promise<Map<string, string>> {
  const pairs = await iGM_ListExamIdCreatedPairs();
  const counters = new Map<string, number>();
  const codeMap = new Map<string, string>();
  for (const pair of pairs) {
    const year = pair.iGM_CreatedAt.slice(0, 4);
    const next = (counters.get(year) ?? 0) + 1;
    counters.set(year, next);
    codeMap.set(pair.iGM_Id, `E-${year}-${String(next).padStart(3, "0")}`);
  }
  return codeMap;
}

/** 列出 HTML 目录内的图片文件名（与正文同级，保持原始格式） */
async function iGM_ListExamImages(examId: string): Promise<string[]> {
  try {
    const entries = await readdir(iGM_ExamHtmlDir(examId), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile() && iGM_ExamImageExt.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/** 写入 JSON 文件（统一 2 空格缩进 + 末尾换行） */
async function iGM_WriteJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * 导出单份试卷的静态 JSON 与静态 HTML 目录
 * 前置：试卷已完成转换（存在 HTML 产物）；调用方保证已发布
 * 返回：是否实际写出静态文件（未完成转换时为 false）
 */
export async function iGM_GenerateExamStaticFile(examId: string): Promise<boolean> {
  if (!iGM_ExamIdPattern.test(examId)) return false;
  const row: iGM_ExamRow | null = await iGM_FindExamById(examId);
  if (!row || row.iGM_ParseStatus !== "completed" || !row.iGM_HtmlPath) return false;

  const root = iGM_ExamStaticRoot();
  const examDir = join(root, examId);
  // 重建 HTML 静态目录（清空旧产物后整目录复制，图片与正文同级，保持原始格式）
  await rm(examDir, { recursive: true, force: true });
  await mkdir(examDir, { recursive: true });
  await cp(iGM_ExamHtmlDir(examId), examDir, { recursive: true });

  // 复制答案附件（若有）到静态目录，使详情页在后端不启动时仍可查看
  let answerPdfUrl = "";
  if (row.iGM_AnswerPdfPath) {
    const answerName = iGM_ExamAnswerFileName(row.iGM_AnswerPdfPath);
    try {
      const answerDestDir = join(examDir, "answer");
      await mkdir(answerDestDir, { recursive: true });
      await cp(
        iGM_ExamAnswerAbsolutePath(row.iGM_AnswerPdfPath),
        join(answerDestDir, answerName),
      );
      answerPdfUrl = iGM_ExamAnswerStaticPath(examId, answerName);
    } catch (error) {
      console.warn(
        `[iGM_ExamStaticService] 复制答案附件失败：${examId}：${String(error)}`,
      );
    }
  }

  const [codeMap, fileRow, pageSize, images] = await Promise.all([
    iGM_BuildExamCodeMap(),
    iGM_FindExamFileByExamId(examId),
    iGM_ReadExamPageSize(examId),
    iGM_ListExamImages(examId),
  ]);

  const detail: iGM_ExamStaticDetail = {
    id: row.iGM_Id,
    code: codeMap.get(row.iGM_Id) ?? "",
    title: row.iGM_Title ?? "",
    subject: row.iGM_Subject ?? "",
    issuer: row.iGM_Issuer ?? "",
    reviewer: row.iGM_Reviewer ?? "",
    duration: row.iGM_Duration,
    totalScore: row.iGM_TotalScore,
    questionCount: row.iGM_QuestionCount,
    notice: row.iGM_Notice ?? "",
    status: row.iGM_Status,
    convertStatus: row.iGM_ParseStatus,
    fileSize: row.iGM_FileSize,
    createdAt: row.iGM_CreatedAt,
    fileName: fileRow?.iGM_FileName ?? "",
    pageWidth: pageSize?.width ?? null,
    pageHeight: pageSize?.height ?? null,
    htmlPath: `/exams/${examId}/index.html`,
    images,
    answerPdfUrl,
  };
  await iGM_WriteJson(join(root, `${examId}.json`), detail);
  return true;
}

/** 由已发布试卷列表重建索引 JSON（index.json） */
export async function iGM_RebuildExamStaticIndex(): Promise<void> {
  const root = iGM_ExamStaticRoot();
  await mkdir(root, { recursive: true });
  const [rows, codeMap, presetRows] = await Promise.all([
    iGM_ListExamsByStatus("published"),
    iGM_BuildExamCodeMap(),
    iGM_ListIssuerPresetsVisibleTo(null),
  ]);
  const exams: iGM_ExamStaticIndexItem[] = rows.map((row) => ({
    id: row.iGM_Id,
    code: codeMap.get(row.iGM_Id) ?? "",
    title: row.iGM_Title ?? "",
    subject: row.iGM_Subject ?? "",
    issuer: row.iGM_Issuer ?? "",
    duration: row.iGM_Duration,
    totalScore: row.iGM_TotalScore,
    questionCount: row.iGM_QuestionCount,
    status: row.iGM_Status,
    convertStatus: row.iGM_ParseStatus,
    fileSize: row.iGM_FileSize,
    createdAt: row.iGM_CreatedAt,
  }));
  // 命题方筛选项：已发布试卷的命题方 ∪ 全站公开预设名称
  const issuerSet = new Set<string>();
  for (const row of rows) {
    const value = (row.iGM_Issuer ?? "").trim();
    if (value) issuerSet.add(value);
  }
  for (const preset of presetRows) {
    const value = preset.iGM_Name.trim();
    if (value) issuerSet.add(value);
  }
  const issuers = [...issuerSet].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  await iGM_WriteJson(join(root, "index.json"), {
    generatedAt: new Date().toISOString(),
    issuers,
    exams,
  });
}

/** 批量导出全部已发布试卷并重建索引（首次启用或历史数据回填时使用） */
export async function iGM_GenerateAllExamStaticFiles(): Promise<number> {
  const rows = await iGM_ListExamsByStatus("published");
  let count = 0;
  for (const row of rows) {
    if (row.iGM_ParseStatus !== "completed" || !row.iGM_HtmlPath) continue;
    await iGM_GenerateExamStaticFile(row.iGM_Id);
    count += 1;
  }
  await iGM_RebuildExamStaticIndex();
  return count;
}

/** 执行一次 git 命令（仓库根目录），返回退出码与输出 */
async function iGM_RunGit(
  args: string[],
): Promise<{ code: number; output: string }> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd: iGM_RepoRoot(),
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    });
    const stdout = proc.stdout as unknown as ReadableStream<Uint8Array>;
    const stderr = proc.stderr as unknown as ReadableStream<Uint8Array>;
    const [out, err, code] = await Promise.all([
      new Response(stdout).text(),
      new Response(stderr).text(),
      proc.exited,
    ]);
    return { code, output: `${out}${err}`.trim() };
  } catch (error) {
    return { code: -1, output: String(error) };
  }
}

/**
 * 把静态文件提交并推送到仓库，触发 Cloudflare Pages 重新构建
 * 失败仅告警，不阻断发布流程
 */
export async function iGM_CommitExamStaticFiles(): Promise<void> {
  const relative = "apps/exam/public/exams";
  const status = await iGM_RunGit(["status", "--porcelain", relative]);
  if (status.code !== 0 || status.output.length === 0) return;

  const add = await iGM_RunGit(["add", relative]);
  if (add.code !== 0) {
    console.warn(`[iGM_ExamStaticService] git add 失败：${add.output}`);
    return;
  }
  const commit = await iGM_RunGit([
    "commit",
    "-m",
    "chore(exam): 导出已发布试卷静态数据",
  ]);
  if (commit.code !== 0) {
    console.warn(`[iGM_ExamStaticService] git commit 失败：${commit.output}`);
    return;
  }
  const push = await iGM_RunGit(["push"]);
  if (push.code !== 0) {
    console.warn(`[iGM_ExamStaticService] git push 失败：${push.output}`);
  }
}

// 导出 //
export default {
  iGM_ExamStaticRoot,
  iGM_GenerateExamStaticFile,
  iGM_RebuildExamStaticIndex,
  iGM_GenerateAllExamStaticFiles,
  iGM_CommitExamStaticFiles,
};
