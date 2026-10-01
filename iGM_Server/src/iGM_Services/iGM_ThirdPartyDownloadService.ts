/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ThirdPartyDownloadService.ts
 * 所属层：后端 / 业务逻辑层（可复用引擎）
 * 路由：G_ThirdParty（由 iGM_ThirdPartyService 调用）
 * 模块：iGM_ThirdPartyDownloadService
 * 作用：模块二十第三方资源下载引擎——从 Modrinth 给出的直链拉取单个资源文件，
 *       支持断点续传、SHA1 校验、暂停/取消与进度事件外发
 * 内容：目标目录安全校验、文件名净化、断点续传（.part 临时文件 + Range 请求）、
 *       流式写入与节流进度事件、429/503 指数退避重试、完成后 SHA1 校验
 * 说明：
 *   - 资源文件不落本站服务器存储：本引擎直接向第三方直链请求并把字节写入
 *     调用方指定的本地目录，仅在本机落盘，本站不做任何镜像或转存；
 *   - 引擎与 HTTP/WS 上下文完全解耦，进度经事件回调外发，
 *     事件结构沿用模块二十约定 { type, taskId, payload, timestamp }；
 *   - 事件序列：start → progress → file_done → complete，
 *     异常与取消分别以 error / canceled 收尾。
 */

// 导入依赖 //
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { isAbsolute, join, parse, resolve, sep } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import type { iGM_DownloadEvent } from "../iGM_Types/iGM_ThirdParty";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键 */
export class iGM_ThirdPartyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_ThirdPartyError";
  }
}

/**
 * 任务控制信号
 * aborted 取消（不可恢复） / paused 暂停（可恢复，恢复后继续续传）
 */
export interface iGM_ThirdPartyCancelSignal {
  aborted: boolean;
  paused: boolean;
}

/** 引擎回调：由调用方决定如何分发与落库 */
export interface iGM_ThirdPartyEngineHooks {
  onEvent: (event: iGM_DownloadEvent) => void;
  signal?: iGM_ThirdPartyCancelSignal;
}

/** 引擎执行结果 */
export interface iGM_ThirdPartyDownloadResult {
  /** 下载完成后文件的绝对路径 */
  filePath: string;
  /** 实际字节数 */
  size: number;
}

/** 单次传输入参 */
export interface iGM_ThirdPartyTransferInput {
  taskId: string;
  downloadUrl: string;
  filename: string;
  /** 上游标注的文件大小；为 0 时按响应头推断 */
  size: number;
  sha1: string | null;
  targetDir: string;
  hooks: iGM_ThirdPartyEngineHooks;
}

// 核心逻辑 //
/** 进度事件节流间隔（毫秒），避免高频事件压垮前端 */
const iGM_ProgressThrottleMs = 250;

/** 速度采样窗口（毫秒） */
const iGM_SpeedWindowMs = 2000;

/** 暂停时的轮询间隔（毫秒） */
const iGM_PausePollMs = 200;

/** 拒绝写入的系统目录（小写比较） */
const iGM_ForbiddenDirNames = [
  "windows",
  "program files",
  "program files (x86)",
  "programdata",
  "system32",
  "syswow64",
  "system volume information",
];

/** 事件时间戳（秒，与模块二十约定一致） */
function iGM_Now(): number {
  return Math.floor(Date.now() / 1000);
}

/** 休眠（提供取消信号时按 100ms 粒度响应取消与暂停） */
function iGM_Sleep(ms: number, signal?: iGM_ThirdPartyCancelSignal): Promise<void> {
  if (!signal) return new Promise((done) => setTimeout(done, ms));
  return new Promise((done) => {
    const deadline = Date.now() + ms;
    const tick = (): void => {
      if (signal.aborted || Date.now() >= deadline) {
        done();
        return;
      }
      setTimeout(tick, Math.min(100, deadline - Date.now()));
    };
    tick();
  });
}

/** 暂停等待：暂停期间阻塞，取消时立即返回 */
async function iGM_WaitResume(signal?: iGM_ThirdPartyCancelSignal): Promise<void> {
  while (signal?.paused && !signal.aborted) {
    await iGM_Sleep(iGM_PausePollMs, signal);
  }
}

/** 净化上游文件名，防止路径穿越与非法字符 */
export function iGM_SafeFilename(raw: string): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\u0000-\u001f]/g, "_")
    .trim();
  return cleaned.length > 0 && cleaned !== "." && cleaned !== ".."
    ? cleaned
    : "download.bin";
}

/**
 * 校验并解析下载目标目录：
 * 1. 必须为绝对路径；2. 拒绝盘符根目录与文件系统根；
 * 3. 拒绝 Windows 等系统目录及其子目录；4. 目录不存在则创建并写探针确认可写。
 */
export async function iGM_ValidateThirdPartyTarget(raw: string): Promise<string> {
  const trimmed = (raw ?? "").trim().replace(/^"(.*)"$/, "$1");
  if (!trimmed) {
    throw new iGM_ThirdPartyError("thirdParty.errors.targetRequired", 400);
  }
  if (!isAbsolute(trimmed)) {
    throw new iGM_ThirdPartyError("thirdParty.errors.targetNotAbsolute", 400);
  }

  const normalized = resolve(trimmed);
  const parsed = parse(normalized);
  if (normalized === parsed.root) {
    throw new iGM_ThirdPartyError("thirdParty.errors.targetNotAllowed", 400);
  }

  const segments = normalized
    .slice(parsed.root.length)
    .split(sep)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  if (segments.some((segment) => iGM_ForbiddenDirNames.includes(segment))) {
    throw new iGM_ThirdPartyError("thirdParty.errors.targetNotAllowed", 400);
  }

  const probe = join(normalized, ".igm-write-probe");
  try {
    await mkdir(normalized, { recursive: true });
    await writeFile(probe, "ok", "utf8");
  } catch {
    throw new iGM_ThirdPartyError("thirdParty.errors.targetNotWritable", 400);
  } finally {
    await unlink(probe).catch(() => undefined);
  }

  return normalized;
}

/** 计算磁盘文件的 SHA1（流式，避免大文件一次性读入内存） */
async function iGM_FileSha1(path: string): Promise<string> {
  const hash = createHash("sha1");
  const stream = createReadStream(path);
  await new Promise<void>((done, fail) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => done());
    stream.on("error", fail);
  });
  return hash.digest("hex");
}

/** 读取文件大小；不存在返回 0 */
async function iGM_PartSize(path: string): Promise<number> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : 0;
  } catch {
    return 0;
  }
}

/** 判断已存在的完整文件是否与目标 SHA1 一致（断点续传的跳过依据） */
async function iGM_IsAlreadyComplete(
  filePath: string,
  size: number,
  sha1: string | null,
): Promise<boolean> {
  if (!sha1) return false;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    if (size > 0 && info.size !== size) return false;
    return (await iGM_FileSha1(filePath)) === sha1;
  } catch {
    return false;
  }
}

/**
 * 单次流式传输
 * 说明：先按已有 .part 文件大小发起 Range 请求；上游支持断点续传时追加写入，
 *       否则丢弃残缺分片从头开始。
 */
async function iGM_TransferOnce(
  input: iGM_ThirdPartyTransferInput,
  filePath: string,
  partPath: string,
): Promise<iGM_ThirdPartyDownloadResult> {
  const { hooks, taskId, signal } = {
    hooks: input.hooks,
    taskId: input.taskId,
    signal: input.hooks.signal,
  };

  const partSize = await iGM_PartSize(partPath);
  const headers: Record<string, string> = {};
  if (partSize > 0) headers.Range = `bytes=${partSize}-`;

  const response = await fetch(input.downloadUrl, { headers });
  if (response.status === 429 || response.status === 503) {
    throw new iGM_ThirdPartyError("thirdParty.errors.rateLimited", 429);
  }
  if (response.status === 416) {
    // Range 失效（上游文件已变更）：丢弃分片后重试
    await unlink(partPath).catch(() => undefined);
    throw new iGM_ThirdPartyError("thirdParty.errors.downloadFailed", 400);
  }
  if (!response.ok) {
    throw new iGM_ThirdPartyError("thirdParty.errors.downloadFailed", response.status);
  }

  const resumed = response.status === 206 && partSize > 0;
  if (!resumed && partSize > 0) {
    await unlink(partPath).catch(() => undefined);
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0") || 0;
  const total =
    input.size > 0 ? input.size : (resumed ? partSize : 0) + contentLength;

  let downloaded = resumed ? partSize : 0;

  hooks.onEvent({
    type: "start",
    taskId,
    payload: {
      status: "downloading",
      total,
      filename: input.filename,
      size: total,
    },
    timestamp: iGM_Now(),
  });

  const body = response.body;
  if (!body) {
    throw new iGM_ThirdPartyError("thirdParty.errors.downloadFailed", 502);
  }

  const reader = body.getReader();
  const stream = createWriteStream(partPath, { flags: resumed ? "a" : "w" });

  let lastEmit = 0;
  let sampleAt = Date.now();
  let sampleBytes = downloaded;
  let speed = 0;

  const emit = (force = false): void => {
    const now = Date.now();
    if (!force && now - lastEmit < iGM_ProgressThrottleMs) return;
    lastEmit = now;
    const elapsed = now - sampleAt;
    if (elapsed >= iGM_SpeedWindowMs) {
      speed = ((downloaded - sampleBytes) * 1000) / elapsed;
      sampleAt = now;
      sampleBytes = downloaded;
    }
    const percent = total > 0 ? Math.min(100, (downloaded * 100) / total) : 0;
    const remaining = Math.max(0, total - downloaded);
    hooks.onEvent({
      type: "progress",
      taskId,
      payload: {
        status: "downloading",
        downloaded,
        total,
        percent: Number(percent.toFixed(2)),
        speed: Math.round(speed),
        eta: speed > 0 && remaining > 0 ? Math.round(remaining / speed) : null,
        error: null,
      },
      timestamp: iGM_Now(),
    });
  };

  emit(true);

  try {
    for (;;) {
      await iGM_WaitResume(signal);
      if (signal?.aborted) {
        throw new iGM_ThirdPartyError("thirdParty.errors.canceled", 499);
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        if (!stream.write(value)) await once(stream, "drain");
        downloaded += value.byteLength;
        emit();
      }
    }
  } finally {
    await new Promise<void>((done) => stream.end(() => done()));
  }

  if (signal?.aborted) {
    throw new iGM_ThirdPartyError("thirdParty.errors.canceled", 499);
  }

  // 完整性：字节数不足说明连接被提前中断，交给重试逻辑续传
  if (total > 0 && downloaded < total) {
    throw new iGM_ThirdPartyError("thirdParty.errors.downloadFailed", 400);
  }

  // SHA1 校验：不通过视为分片损坏，删除后由重试逻辑重新下载
  if (input.sha1) {
    const digest = await iGM_FileSha1(partPath);
    if (digest !== input.sha1) {
      await unlink(partPath).catch(() => undefined);
      throw new iGM_ThirdPartyError("thirdParty.errors.hashMismatch", 400);
    }
  }

  await rename(partPath, filePath);
  const finalSize = (await iGM_PartSize(filePath)) || downloaded;

  hooks.onEvent({
    type: "file_done",
    taskId,
    payload: { path: filePath, size: finalSize },
    timestamp: iGM_Now(),
  });
  hooks.onEvent({
    type: "complete",
    taskId,
    payload: {
      status: "completed",
      downloaded: finalSize,
      total: total > 0 ? total : finalSize,
      percent: 100,
      filePath,
    },
    timestamp: iGM_Now(),
  });

  return { filePath, size: finalSize };
}

/**
 * 执行第三方资源下载
 * 1. 已存在且 SHA1 一致的完整文件直接跳过（断点续传）；
 * 2. 流式下载到 <文件名>.part，支持 Range 续传；
 * 3. 完成后校验 SHA1 并原子重命名；
 * 4. 429/503 指数退避重试，最多 maxRetries 次。
 */
export async function iGM_RunThirdPartyDownload(
  input: iGM_ThirdPartyTransferInput,
): Promise<iGM_ThirdPartyDownloadResult> {
  const { hooks, taskId } = input;
  if (input.size > iGM_Config.thirdParty.maxFileSize) {
    throw new iGM_ThirdPartyError("thirdParty.errors.fileTooLarge", 400);
  }

  const filePath = join(input.targetDir, iGM_SafeFilename(input.filename));
  const partPath = `${filePath}.part`;

  // 断点续传：完整且校验通过则直接完成
  if (await iGM_IsAlreadyComplete(filePath, input.size, input.sha1)) {
    const size = (await iGM_PartSize(filePath)) || input.size;
    hooks.onEvent({
      type: "file_done",
      taskId,
      payload: { path: filePath, size },
      timestamp: iGM_Now(),
    });
    hooks.onEvent({
      type: "complete",
      taskId,
      payload: {
        status: "completed",
        downloaded: size,
        total: size,
        percent: 100,
        filePath,
      },
      timestamp: iGM_Now(),
    });
    return { filePath, size };
  }

  const maxRetries = Math.max(1, iGM_Config.thirdParty.maxRetries);
  let lastError: iGM_ThirdPartyError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    if (hooks.signal?.aborted) {
      throw new iGM_ThirdPartyError("thirdParty.errors.canceled", 499);
    }
    try {
      return await iGM_TransferOnce(input, filePath, partPath);
    } catch (error) {
      if (error instanceof iGM_ThirdPartyError && error.status === 499) {
        throw error;
      }
      const wrapped =
        error instanceof iGM_ThirdPartyError
          ? error
          : new iGM_ThirdPartyError("thirdParty.errors.downloadFailed", 502);
      lastError = wrapped;
      // 429/503/400（字节不完整或校验失败）可重试；其余直接失败
      const retryable =
        wrapped.status === 429 || wrapped.status === 503 || wrapped.status === 400;
      hooks.onEvent({
        type: "retry",
        taskId,
        payload: { attempt, reason: wrapped.message },
        timestamp: iGM_Now(),
      });
      if (attempt >= maxRetries || !retryable) break;
      // 指数退避：1s、2s、4s、8s…
      await iGM_Sleep(1000 * 2 ** (attempt - 1), hooks.signal);
    }
  }

  throw lastError ?? new iGM_ThirdPartyError("thirdParty.errors.downloadFailed", 502);
}

// 导出 //
export default {
  iGM_ThirdPartyError,
  iGM_SafeFilename,
  iGM_ValidateThirdPartyTarget,
  iGM_RunThirdPartyDownload,
};