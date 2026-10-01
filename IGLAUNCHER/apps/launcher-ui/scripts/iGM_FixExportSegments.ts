/**
 * 文件路径：apps/launcher-ui/scripts/iGM_FixExportSegments.ts
 * 所属层：前端 / 构建脚本层
 * 路由：全局（构建期）
 * 模块：iGM_FixExportSegments
 * 作用：修正 Next.js 16 在 Windows 平台 output:"export" 的 RSC 片段产物路径
 * 背景：next/dist/export/index.js 用 path.relative() 取得的片段路径在 Windows 上
 *       含反斜杠（如 G_Home\__PAGE__），而 convertSegmentPathToStaticExportFilename
 *       只将正斜杠替换为点号，导致本应为点号文件的片段被错误写成「目录 + 文件」，
 *       浏览器按点号文件名请求时 404，Electrobun WebView 内页面切换退化为整页刷新。
 * 处理：next build 之后扫描 out/，把所有 __next.* 目录下的片段文件拍平为点号
 *       文件名并删除空目录。Linux/macOS 下目录形态不存在，脚本自然为空操作。
 */

// 导入依赖 //
import { readdir, mkdir, rename, rm, stat } from "node:fs/promises";
import { join, relative, sep, dirname, basename } from "node:path";

// 类型定义 //
interface iGM_SegmentDir {
  /** __next.* 目录的绝对路径 */
  dir: string;
  /** 目录深度，深的先处理 */
  depth: number;
}

// 核心逻辑 //
const iGM_OutDir = join(process.cwd(), "out");

/** 递归收集所有名为 __next.* 的目录 */
async function iGM_CollectSegmentDirs(
  dir: string,
  depth: number,
  found: iGM_SegmentDir[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.name.startsWith("__next.")) {
      found.push({ dir: full, depth });
    }
    await iGM_CollectSegmentDirs(full, depth + 1, found);
  }
}

/** 递归列出目录下全部文件 */
async function iGM_ListFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await iGM_ListFiles(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

/** 删除处理后遗留的空目录（最深层先删）；含任意文件的目录保留 */
async function iGM_RemoveEmptyDirs(dir: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await iGM_RemoveEmptyDirs(join(dir, entry.name));
  }
  const remaining = await readdir(dir);
  if (remaining.length > 0) return false;
  await rm(dir, { recursive: true, force: true });
  return true;
}

async function iGM_Main(): Promise<void> {
  try {
    await stat(iGM_OutDir);
  } catch {
    console.warn(`[iGM_FixExportSegments] 未找到 out 目录，跳过：${iGM_OutDir}`);
    return;
  }

  const segmentDirs: iGM_SegmentDir[] = [];
  await iGM_CollectSegmentDirs(iGM_OutDir, 0, segmentDirs);

  if (segmentDirs.length === 0) {
    console.log("[iGM_FixExportSegments] 无需修正（未发现 __next.* 目录形态产物）");
    return;
  }

  segmentDirs.sort((a, b) => b.depth - a.depth);

  let fixed = 0;
  for (const { dir } of segmentDirs) {
    const files = await iGM_ListFiles(dir);
    for (const file of files) {
      const rel = relative(dir, file).split(sep).join(".");
      const targetName = `${basename(dir)}.${rel}`;
      const target = join(dirname(dir), targetName);
      await mkdir(dirname(target), { recursive: true });
      await rename(file, target);
      fixed += 1;
    }
  }

  await iGM_RemoveEmptyDirs(iGM_OutDir).catch(() => undefined);

  console.log(`[iGM_FixExportSegments] 已修正 ${fixed} 个 RSC 片段文件路径`);
}

// 导出 //
await iGM_Main();
