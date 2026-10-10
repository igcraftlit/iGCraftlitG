/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamConvertService.ts
 * 所属层：后端 / 业务服务层
 * 路由：由 iGM_ExamService 后台调用（/api/exam/upload、/api/exam/reparse）
 * 模块：iGM_ExamConvertService
 * 作用：调用 pdf2htmlEX 将 PDF 高保真转换为自包含 HTML 目录
 * 内容：Docker / 本地二进制两种调用方式、超时控制、退出码与产物判定、转换日志落盘
 * 说明：转换成功时 stderr 仍可能打印图标字体告警（iconv Mac Roman），
 *       因此错误判定只看退出码与 index.html 是否生成，不看 stderr 内容
 */

// 导入依赖 //
import { access, appendFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  iGM_ExamError,
  iGM_ExamLogsDir,
  iGM_ExamTempDir,
} from "./iGM_ExamIngestService";

// 类型定义 //
/** 转换调用结果（仅内部使用） */
interface iGM_ExamConvertOutcome {
  exitCode: number;
  timedOut: boolean;
  detail: string;
}

// 核心逻辑 //
/** 默认 Docker 镜像：官方可用 tag（latest 未发布） */
const iGM_ExamDefaultImage =
  "pdf2htmlex/pdf2htmlex:0.18.8.rc2-master-20200820-alpine-3.12.0-x86_64";

/** 转换超时（毫秒），默认 5 分钟 */
const iGM_ExamConvertTimeoutMs = Number(
  process.env.PDF2HTMLEX_TIMEOUT_MS ?? 5 * 60 * 1000,
);

/** 转换产物固定输出文件名 */
const iGM_ExamOutputName = "index.html";

/** 是否启用 Docker 调用（默认启用；本机无二进制时使用） */
function iGM_ExamUseDocker(): boolean {
  return (process.env.PDF2HTMLEX_USE_DOCKER ?? "true").toLowerCase() !== "false";
}

/**
 * 组装 pdf2htmlEX 调用命令
 * - Docker：挂载临时目录与输出目录后执行官方镜像
 * - 本地二进制：直接调用 PATH 中的可执行文件
 */
function iGM_BuildConvertCommand(
  inputAbsolutePath: string,
  outputDirAbsolutePath: string,
): string[] {
  // --zoom 1.3：修正 PDF 与浏览器之间 96/72 的 DPI 缩放差异
  // --embed cfijo：嵌入字体 / CSS / JS / 图片 / OpenType 数据
  const options = ["--zoom", "1.3", "--embed", "cfijo"];
  if (iGM_ExamUseDocker()) {
    const image = process.env.PDF2HTMLEX_IMAGE ?? iGM_ExamDefaultImage;
    return [
      "docker",
      "run",
      "--rm",
      "-v",
      `${iGM_ExamTempDir()}:/pdf`,
      "-v",
      `${outputDirAbsolutePath}:/out`,
      image,
      ...options,
      "--dest-dir",
      "/out",
      `/pdf/${basename(inputAbsolutePath)}`,
      iGM_ExamOutputName,
    ];
  }
  const binary = process.env.PDF2HTMLEX_PATH ?? "pdf2htmlEX";
  return [
    binary,
    ...options,
    "--dest-dir",
    outputDirAbsolutePath,
    inputAbsolutePath,
    iGM_ExamOutputName,
  ];
}

/** 判断文件是否存在 */
async function iGM_ExamFileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** 触发子进程并等待结束；超时强制终止 */
async function iGM_RunConvertProcess(
  command: string[],
): Promise<iGM_ExamConvertOutcome> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    });
  } catch (error) {
    return { exitCode: -1, timedOut: false, detail: String(error) };
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, iGM_ExamConvertTimeoutMs);

  try {
    // Bun.spawn 的 stdout / stderr 在 "pipe" 模式下为 ReadableStream，TS 声明未收窄，此处显式收窄
    const stdout = proc.stdout as unknown as ReadableStream<Uint8Array>;
    const stderr = proc.stderr as unknown as ReadableStream<Uint8Array>;
    const [, stderrText, exitCode] = await Promise.all([
      new Response(stdout).text(),
      new Response(stderr).text(),
      proc.exited,
    ]);
    return { exitCode, timedOut, detail: stderrText };
  } catch (error) {
    return { exitCode: -1, timedOut, detail: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** 追加一行转换日志（失败仅告警，不影响主流程） */
async function iGM_WriteConvertLog(
  examId: string,
  command: string[],
  outcome: iGM_ExamConvertOutcome,
): Promise<void> {
  try {
    await mkdir(iGM_ExamLogsDir(), { recursive: true });
    const detail = outcome.timedOut
      ? "转换超时，已强制终止子进程"
      : outcome.detail.trim().slice(0, 2000) || "(none)";
    const line =
      `[${new Date().toISOString()}] examId=${examId} exit=${outcome.exitCode} timedOut=${outcome.timedOut}\n` +
      `  cmd: ${command.join(" ")}\n` +
      `  detail: ${detail}\n`;
    await appendFile(
      join(iGM_ExamLogsDir(), "iGM_ExamConvert.log"),
      line,
      "utf8",
    );
  } catch (error) {
    console.warn(`[iGM_ExamConvertService] 写入转换日志失败：${String(error)}`);
  }
}

/**
 * 调用 pdf2htmlEX 把 PDF 转换为自包含 HTML 目录
 * 产物输出到 outputDirAbsolutePath，首页固定为 index.html
 * 工具缺失、超时、非零退出或未生成首页一律抛「PDF 转换工具未就绪，请联系管理员」
 */
export async function iGM_RunPdf2HtmlEx(
  inputAbsolutePath: string,
  outputDirAbsolutePath: string,
  examId: string,
): Promise<void> {
  const command = iGM_BuildConvertCommand(
    inputAbsolutePath,
    outputDirAbsolutePath,
  );
  const outcome = await iGM_RunConvertProcess(command);
  await iGM_WriteConvertLog(examId, command, outcome);

  const produced = await iGM_ExamFileExists(
    join(outputDirAbsolutePath, iGM_ExamOutputName),
  );
  if (outcome.timedOut || outcome.exitCode !== 0 || !produced) {
    throw new iGM_ExamError("PDF 转换工具未就绪，请联系管理员", 500);
  }
}

// 导出 //
export default {
  iGM_RunPdf2HtmlEx,
};