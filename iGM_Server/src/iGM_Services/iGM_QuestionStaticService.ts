/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_QuestionStaticService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Question（发布 / 更新 / 删除已发布题目后由业务层调用）
 * 模块：iGM_QuestionStaticService
 * 作用：把已发布题目导出为静态 JSON（index.json），随前端部署到 Cloudflare Pages，
 *       使题库在后端不启动时仍可浏览
 * 内容：静态根目录解析、题库索引重建、Git 提交推送
 * 说明：不使用任何 Cloudflare 存储，仅写入前端仓库 apps/exam/public/questions/
 *       由 Pages 静态托管；失败仅告警，不阻断业务流程
 */

// 导入依赖 //
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  iGM_QuestionTextbookCodes,
  iGM_QuestionTextbooks,
} from "../iGM_Types/iGM_Question";
import { iGM_ListPublishedQuestionDtos } from "./iGM_QuestionService";

// 类型定义 //
/** 索引 JSON 中的教材项 */
interface iGM_QuestionStaticTextbook {
  code: string;
  name: string;
}

/** 索引 JSON 中的题目项 */
interface iGM_QuestionStaticItem {
  id: string;
  textbookCode: string;
  textbookName: string;
  stem: string;
  type: string;
  options: { key: string; text: string }[];
  answer: string;
  analysis: string;
  difficultyCoefficient: number | null;
  difficultyLevel: string | null;
  tags: string[];
  createdAt: string;
}

// 核心逻辑 //
/** 仓库根目录（iGM_Server 的上一级） */
function iGM_RepoRoot(): string {
  return fileURLToPath(new URL("../../../", import.meta.url));
}

/** 题库静态根目录：<仓库根>/apps/exam/public/questions（可用 IGM_QUESTION_STATIC_DIR 覆盖） */
export function iGM_QuestionStaticRoot(): string {
  const explicit = process.env.IGM_QUESTION_STATIC_DIR;
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  return join(iGM_RepoRoot(), "apps", "exam", "public", "questions");
}

/** 写入 JSON 文件（统一 2 空格缩进 + 末尾换行） */
async function iGM_WriteJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** 导出题库静态数据：重建 index.json（教材目录 + 全部已发布题目） */
export async function iGM_ExportQuestionBankStatic(): Promise<void> {
  const root = iGM_QuestionStaticRoot();
  await mkdir(root, { recursive: true });

  const dtos = await iGM_ListPublishedQuestionDtos();
  const textbooks: iGM_QuestionStaticTextbook[] = iGM_QuestionTextbookCodes.map(
    (code) => ({ code, name: iGM_QuestionTextbooks[code] }),
  );
  const questions: iGM_QuestionStaticItem[] = dtos.map((dto) => ({
    id: dto.id,
    textbookCode: dto.textbookCode,
    textbookName: dto.textbookName,
    stem: dto.stem,
    type: dto.type,
    options: dto.options,
    answer: dto.answer,
    analysis: dto.analysis,
    difficultyCoefficient: dto.difficultyCoefficient,
    difficultyLevel: dto.difficultyLevel,
    tags: dto.tags,
    createdAt: dto.createdAt,
  }));

  await iGM_WriteJson(join(root, "index.json"), {
    generatedAt: new Date().toISOString(),
    textbooks,
    questions,
  });
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
 * 把题库静态文件提交并推送到仓库，触发 Cloudflare Pages 重新构建
 * 失败仅告警，不阻断发布流程
 */
export async function iGM_CommitQuestionStaticFiles(): Promise<void> {
  const relative = "apps/exam/public/questions";
  const status = await iGM_RunGit(["status", "--porcelain", relative]);
  if (status.code !== 0 || status.output.length === 0) return;

  const add = await iGM_RunGit(["add", relative]);
  if (add.code !== 0) {
    console.warn(`[iGM_QuestionStaticService] git add 失败：${add.output}`);
    return;
  }
  const commit = await iGM_RunGit([
    "commit",
    "-m",
    "chore(exam): 导出题库静态数据",
  ]);
  if (commit.code !== 0) {
    console.warn(`[iGM_QuestionStaticService] git commit 失败：${commit.output}`);
    return;
  }
  const push = await iGM_RunGit(["push"]);
  if (push.code !== 0) {
    console.warn(`[iGM_QuestionStaticService] git push 失败：${push.output}`);
  }
}

// 导出 //
export default {
  iGM_QuestionStaticRoot,
  iGM_ExportQuestionBankStatic,
  iGM_CommitQuestionStaticFiles,
};
