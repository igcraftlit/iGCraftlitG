/**
 * 文件路径：apps/exam/scripts/iGM_CopyPdfWorker.ts
 * 所属层：前端 / 构建脚本层
 * 路由：全局（构建期）
 * 模块：iGM_Exam_CopyPdfWorker
 * 作用：把 pdfjs-dist 的 Worker 脚本复制到 public 目录，供静态站点浏览器端加载
 * 背景：PDF.js 必须通过独立的 worker 文件解析，纯静态站点无法经打包器内联；
 *       在 next build / next dev 前执行本脚本，保证 /pdf.worker.min.mjs 可访问
 */

// 导入依赖 //
import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

// 类型定义 //
// （本脚本无对外类型）

// 核心逻辑 //
/** 可选的 worker 源文件（不同 pdfjs-dist 版本命名略有差异） */
const iGM_Exam_WorkerCandidates = [
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
];

const iGM_Exam_Target = join(process.cwd(), "public", "pdf.worker.min.mjs");

async function iGM_Exam_Main(): Promise<void> {
  await mkdir(join(process.cwd(), "public"), { recursive: true });

  for (const candidate of iGM_Exam_WorkerCandidates) {
    const source = join(process.cwd(), candidate);
    try {
      await stat(source);
      await copyFile(source, iGM_Exam_Target);
      console.log(`[iGM_Exam_CopyPdfWorker] 已复制 PDF Worker：${candidate}`);
      return;
    } catch {
      // 尝试下一个候选路径
    }
  }

  console.warn(
    "[iGM_Exam_CopyPdfWorker] 未找到 pdfjs-dist worker 文件，PDF 阅读器将回退到主线程解析",
  );
}

// 导出 //
await iGM_Exam_Main();
