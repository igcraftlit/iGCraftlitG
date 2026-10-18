/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_ServerSync.ts
 * 所属层：桌面外壳 / 服务器同步层
 * 路由：全局
 * 模块：iGM_LauncherV2_ServerSync
 * 作用：第三方服务器「启动并同步」引擎与开服中心客户端清单生成
 * 内容：读取所选服务器条目的「客户端同步清单 URL」，由本地引擎直连外部 URL 拉取清单
 *       （绝不经过主站后端），逐文件比对本地 mods / config 的 SHA256，
 *       并发（限 4）下载缺失或不一致的文件并原子落盘（先写临时文件再 rename），
 *       完成后复用既有启动函数拼装 --server / --port 一键进服；
 *       另提供客户端清单工作室能力：按 serverId 递归扫描本地服务器目录的 mods / config
 *       （相对路径、字节大小与 SHA256），并按勾选路径生成 manifest.json 与客户端 ZIP 包
 *       （ZIP 由本模块自实现最小写入器，基于 node:zlib 的 deflateRawSync，不引入新依赖）；
 *       进度一律以多语言键 + 占位符参数回推，外壳不产生用户可见文案
 * 说明：下载地址优先取清单条目自带 url / download 字段，缺失时按「清单 URL 同目录 + 相对路径」推导
 */

// 导入依赖 //
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { IGM_LAUNCHERV2_APP_NAME, IGM_LAUNCHERV2_VERSION } from "./iGM_LauncherV2_Constants";
import { iGM_LauncherV2_Horizon_PathById } from "./iGM_LauncherV2_Horizon";
import type {
  iGM_LauncherV2_InboundMessage,
  iGM_LauncherV2_ServerSyncPhase,
} from "./iGM_LauncherV2_Ipc";
import {
  iGM_LauncherV2_LaunchStart,
  type iGM_LauncherV2_GameState,
} from "./iGM_LauncherV2_Launch";
import { iGM_LauncherV2_LocalServers_Find } from "./iGM_LauncherV2_LocalServers";
import { iGM_LauncherV2_Servers_Find } from "./iGM_LauncherV2_Servers";

// 类型定义 //

/** 清单条目（归一化后） */
interface iGM_LauncherV2_ServerManifestEntry {
  /** 相对视界游戏目录的相对路径（以 / 分隔，如 mods/xxx.jar） */
  path: string;
  /** 字节大小；未知为 0 */
  size: number;
  /** 期望 SHA256（小写十六进制）；无则为空串 */
  sha256: string;
  /** 下载直链；无则由「清单 URL 同目录 + 相对路径」推导 */
  url: string;
}

/** 清单回推回调（外壳经契约层回推，供主进程注入 webview 推送） */
type iGM_LauncherV2_ServerSyncNotify = (message: iGM_LauncherV2_InboundMessage) => void;

// 核心逻辑 //

/** 同步下载并发上限 */
const IGM_LAUNCHERV2_SERVERSYNC_CONCURRENCY = 4;

/** 清单拉取与单文件下载超时（毫秒） */
const IGM_LAUNCHERV2_SERVERSYNC_TIMEOUT_MS = 20000;

/** 请求统一使用的 User-Agent */
const IGM_LAUNCHERV2_SERVERSYNC_USER_AGENT = `${IGM_LAUNCHERV2_APP_NAME}/${IGM_LAUNCHERV2_VERSION} (+https://igcraftlit.com)`;

/** 原子落盘的临时文件后缀 */
const IGM_LAUNCHERV2_SERVERSYNC_PART_SUFFIX = ".igm-part";

/** 生成的客户端清单文件名 */
const IGM_LAUNCHERV2_SERVERSYNC_MANIFEST_FILE = "manifest.json";

/** 参与客户端同步的视界子目录（相对视界游戏目录） */
const IGM_LAUNCHERV2_SERVERSYNC_SUBDIRS = ["mods", "config"] as const;

/** 文本字段归一化 */
function iGM_ServerSyncText(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

/**
 * 计算文件的 SHA256（流式读取，避免大文件占用内存）。
 * 文件缺失或读取失败返回 null。
 */
async function iGM_ServerSyncSha256(absPath: string): Promise<string | null> {
  try {
    const hasher = createHash("sha256");
    const stream = createReadStream(absPath);
    for await (const chunk of stream) hasher.update(chunk as Buffer);
    return hasher.digest("hex").toLowerCase();
  } catch {
    return null;
  }
}

/** 文件字节数；缺失返回 -1 */
async function iGM_ServerSyncFileSize(absPath: string): Promise<number> {
  try {
    return (await stat(absPath)).size;
  } catch {
    return -1;
  }
}

/** 归一化相对路径：拒绝绝对路径与 .. 越界，返回以 / 分隔的相对路径 */
function iGM_ServerSyncRelative(raw: unknown): string | null {
  const text = iGM_ServerSyncText(raw).replace(/\\/g, "/");
  if (!text || text.startsWith("/")) return null;
  const segments = text.split("/");
  if (segments.some((segment) => segment === "" || segment === "..")) return null;
  return segments.join("/");
}

/** 下载地址推导：取「清单 URL 同目录 + 相对路径」，并对相对路径各段做编码 */
function iGM_ServerSyncDeriveUrl(manifestUrl: string, relativePath: string): string {
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  return `${base}${encoded}`;
}

/**
 * 解析外部清单为归一化条目数组。
 * 兼容两种形态：
 * (a) 结构化清单 { files: [{ path, size?, sha256?, url? / download? }] }；
 * (b) 映射清单 { "<path>": { sha256, size } }。
 */
function iGM_ServerSyncParseManifest(raw: unknown): iGM_LauncherV2_ServerManifestEntry[] {
  const out: iGM_LauncherV2_ServerManifestEntry[] = [];
  if (!raw || typeof raw !== "object") return out;

  const record = raw as { files?: unknown };

  // 形态 a：files 为数组
  if (Array.isArray(record.files)) {
    for (const item of record.files) {
      if (!item || typeof item !== "object") continue;
      const entry = item as { path?: unknown; size?: unknown; sha256?: unknown; url?: unknown; download?: unknown };
      const path = iGM_ServerSyncRelative(entry.path);
      if (!path) continue;
      out.push({
        path,
        size: typeof entry.size === "number" && entry.size > 0 ? Math.floor(entry.size) : 0,
        sha256: iGM_ServerSyncText(entry.sha256),
        url: iGM_ServerSyncText(entry.url) || iGM_ServerSyncText(entry.download),
      });
    }
    return out;
  }

  // 形态 a 变体：files 为映射对象
  const collectMapping = (mapping: unknown): void => {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return;
    for (const [key, value] of Object.entries(mapping as Record<string, unknown>)) {
      const path = iGM_ServerSyncRelative(key);
      if (!path || !value || typeof value !== "object") continue;
      const field = value as { size?: unknown; sha256?: unknown; url?: unknown; download?: unknown };
      out.push({
        path,
        size: typeof field.size === "number" && field.size > 0 ? Math.floor(field.size) : 0,
        sha256: iGM_ServerSyncText(field.sha256),
        url: iGM_ServerSyncText(field.url) || iGM_ServerSyncText(field.download),
      });
    }
  };

  if (record.files && typeof record.files === "object") {
    collectMapping(record.files);
    return out;
  }

  // 形态 b：顶层即「相对路径 -> { sha256, size }」映射
  collectMapping(raw);
  return out;
}

/** 带超时地直连拉取并解析清单 JSON；失败返回 null */
async function iGM_ServerSyncFetchManifest(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IGM_LAUNCHERV2_SERVERSYNC_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": IGM_LAUNCHERV2_SERVERSYNC_USER_AGENT },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 直连下载单个文件并以原子方式落盘。
 * 先写入目标路径同目录的临时文件，校验 SHA256 一致后再 rename 覆盖目标，
 * 避免半成品污染本地 mods / config；任一步失败清理临时文件并返回 false。
 */
async function iGM_ServerSyncDownloadFile(
  url: string,
  targetPath: string,
  expectedSha256: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IGM_LAUNCHERV2_SERVERSYNC_TIMEOUT_MS);
  const tempPath = `${targetPath}${IGM_LAUNCHERV2_SERVERSYNC_PART_SUFFIX}`;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": IGM_LAUNCHERV2_SERVERSYNC_USER_AGENT },
    });
    if (!response.ok || !response.body) return false;

    await mkdir(dirname(targetPath), { recursive: true });
    const hasher = createHash("sha256");
    const sink = await open(tempPath, "w");
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        hasher.update(value);
        await sink.write(value);
      }
    } finally {
      await sink.close();
    }

    const digest = hasher.digest("hex").toLowerCase();
    if (expectedSha256 && digest !== expectedSha256.toLowerCase()) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      return false;
    }

    await rm(targetPath, { force: true }).catch(() => undefined);
    await rename(tempPath, targetPath);
    return true;
  } catch {
    await rm(tempPath, { force: true }).catch(() => undefined);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 启动并同步：拉取外部清单 -> 比对哈希 -> 补齐缺失文件 -> 一键进服。
 * 全流程以 server:sync 消息回推进度；同步失败返回 null，成功则返回游戏启动状态。
 */
export async function iGM_LauncherV2_ServerSync_Start(
  id: string,
  horizonId: string,
  notify: iGM_LauncherV2_ServerSyncNotify,
): Promise<iGM_LauncherV2_GameState | null> {
  const emit = (
    phase: iGM_LauncherV2_ServerSyncPhase,
    percent: number,
    messageKey: string,
    messageParams: Record<string, string> = {},
  ): void => {
    notify({ type: "server:sync", state: { id, phase, percent, messageKey, messageParams } });
  };

  try {
    // 1) 定位条目并取其外部清单 URL
    emit("fetch", 0, "server.syncPhase.fetch");
    const entry = await iGM_LauncherV2_Servers_Find(id);
    if (!entry) {
      emit("error", 0, "server.syncPhase.error", { reason: "server-not-found" });
      return null;
    }
    const manifestUrl = (entry.manifest || "").trim();
    if (!manifestUrl) {
      emit("error", 0, "server.manifestMissing");
      return null;
    }

    const horizonDir = iGM_LauncherV2_Horizon_PathById(horizonId);
    if (!horizonDir) {
      emit("error", 0, "server.syncPhase.error", { reason: "horizon-not-found" });
      return null;
    }

    const raw = await iGM_ServerSyncFetchManifest(manifestUrl);
    if (raw === null) {
      emit("error", 0, "server.syncPhase.error", { reason: "manifest-unreachable" });
      return null;
    }
    const entries = iGM_ServerSyncParseManifest(raw);
    if (entries.length === 0) {
      emit("error", 0, "server.syncPhase.error", { reason: "manifest-empty" });
      return null;
    }

    // 2) 逐文件比对本地 SHA256（或大小），缺失与不一致者列为待下载
    emit("compare", 0, "server.syncPhase.compare");
    const pending: iGM_LauncherV2_ServerManifestEntry[] = [];
    for (const item of entries) {
      const targetPath = join(horizonDir, ...item.path.split("/"));
      const localHash = await iGM_ServerSyncSha256(targetPath);
      let need = false;
      if (localHash === null) {
        need = true;
      } else if (item.sha256) {
        need = localHash !== item.sha256.toLowerCase();
      } else if (item.size > 0) {
        need = (await iGM_ServerSyncFileSize(targetPath)) !== item.size;
      } else {
        need = true;
      }
      if (need) pending.push(item);
    }

    // 3) 并发下载缺失文件（限 4 并发），逐条回推进度
    const total = pending.length;
    let done = 0;
    let failed = 0;
    const emitDownload = (): void => {
      emit("download", total > 0 ? Math.round((done / total) * 100) : 100, "server.syncPhase.download", {
        done: String(done),
        total: String(total),
      });
    };
    emitDownload();

    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= total) return;
        const item = pending[index];
        const url = item.url || iGM_ServerSyncDeriveUrl(manifestUrl, item.path);
        const targetPath = join(horizonDir, ...item.path.split("/"));
        const ok = await iGM_ServerSyncDownloadFile(url, targetPath, item.sha256);
        if (!ok) failed += 1;
        done += 1;
        emitDownload();
      }
    };
    const workerCount = Math.min(IGM_LAUNCHERV2_SERVERSYNC_CONCURRENCY, Math.max(total, 1));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    if (failed > 0) {
      emit("error", 0, "server.syncPhase.error", { reason: "download-failed" });
      return null;
    }

    // 4) 完成后一键进服（追加 --server / --port）
    emit("done", 100, "server.syncPhase.done");
    return await iGM_LauncherV2_LaunchStart(horizonId, { server: entry.ip, port: entry.port });
  } catch (error) {
    emit("error", 0, "server.syncPhase.error", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/** 递归收集目录下全部文件（跳过符号链接），路径以 relPrefix 为前缀的相对路径记录 */
async function iGM_ServerManifestWalk(
  dir: string,
  relPrefix: string,
  out: iGM_LauncherV2_ServerManifestEntry[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const item of entries) {
    if (item.isSymbolicLink()) continue;
    const abs = join(dir, item.name);
    const rel = `${relPrefix}/${item.name}`;
    if (item.isDirectory()) {
      await iGM_ServerManifestWalk(abs, rel, out);
    } else if (item.isFile()) {
      const size = await iGM_ServerSyncFileSize(abs);
      if (size < 0) continue;
      const sha256 = await iGM_ServerSyncSha256(abs);
      if (sha256 === null) continue;
      // url 预留为空串，由服主自行填写或按清单 URL 同目录推导
      out.push({ path: rel, size, sha256, url: "" });
    }
  }
}

/** ZIP 写入条目（相对路径 + 原始字节） */
interface iGM_LauncherV2_ServerManifestZipEntry {
  name: string;
  data: Buffer;
}

/** 文件名安全化：剔除 Windows 非法字符、折叠空白并限长，空则回退 server */
function iGM_ServerManifestSafeName(name: string): string {
  const cleaned = (name || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 64);
  return cleaned || "server";
}

/** CRC32 查表（标准多项式 0xEDB88320，ZIP 校验用） */
const IGM_LAUNCHERV2_SERVERSYNC_CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/** 计算字节流的 CRC32 */
function iGM_ServerManifestCrc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = IGM_LAUNCHERV2_SERVERSYNC_CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 最小 ZIP 写入器：逐条写入本地文件头（含 CRC32 与压缩尺寸），
 * 随后写中央目录与结尾记录（EOCD）。条目采用 deflate 压缩，压缩后反而更大时退回存储；
 * 文件名统一置 UTF-8 标志位（0x0800）。
 * 说明：Bun 1.3 未提供稳定 Bun.zip，故以 node:zlib 的 deflateRawSync 自行实现，不引入新依赖。
 * 限制：不支持 ZIP64，单文件与总包均需小于 4GB（模组/配置包场景足够）。
 */
function iGM_ServerManifestZipBuild(entries: iGM_LauncherV2_ServerManifestZipEntry[]): Buffer {
  const now = new Date();
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const parts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const crc = iGM_ServerManifestCrc32(entry.data);
    const compressed = deflateRawSync(entry.data);
    const store = compressed.length >= entry.data.length;
    const method = store ? 0 : 8;
    const payload = store ? entry.data : compressed;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuffer, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + payload.length;
  }

  const centralBuffer = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuffer, end]);
}

/**
 * 客户端清单工作室：按 serverId 递归扫描本地服务器的 mods / config 目录。
 * 对每个文件计算字节大小与 SHA256，路径为相对服务器目录的相对路径（以 / 分隔）；
 * 结果经 server:tree 回推；服务器不存在或目录不可读时回推 ok 为 false 且只给多语言键。
 */
export async function iGM_LauncherV2_ServerScanTree(
  serverId: string,
  notify: iGM_LauncherV2_ServerSyncNotify,
): Promise<void> {
  try {
    const server = await iGM_LauncherV2_LocalServers_Find(serverId);
    if (!server) {
      notify({
        type: "server:tree",
        ok: false,
        serverId,
        serverName: "",
        root: "",
        files: [],
        scannedAt: 0,
        messageKey: "server.studio.scanFailed",
        messageParams: { reason: "server-not-found" },
      });
      return;
    }

    const collected: iGM_LauncherV2_ServerManifestEntry[] = [];
    for (const sub of IGM_LAUNCHERV2_SERVERSYNC_SUBDIRS) {
      await iGM_ServerManifestWalk(join(server.dir, sub), sub, collected);
    }
    collected.sort((a, b) => a.path.localeCompare(b.path));

    notify({
      type: "server:tree",
      ok: true,
      serverId: server.id,
      serverName: server.name,
      root: server.dir,
      files: collected.map((item) => ({
        path: item.path,
        size: item.size,
        sha256: item.sha256,
      })),
      scannedAt: Date.now(),
      messageKey: "",
      messageParams: {},
    });
  } catch (error) {
    notify({
      type: "server:tree",
      ok: false,
      serverId,
      serverName: "",
      root: "",
      files: [],
      scannedAt: 0,
      messageKey: "server.studio.scanFailed",
      messageParams: { reason: error instanceof Error ? error.message : "unknown" },
    });
  }
}

/**
 * 客户端清单工作室：按勾选的相对路径收集文件、重新计算 SHA256 / 大小，
 * 在服务器目录内写出 manifest.json（url 预留空串，供服主回填网盘 / GitHub 直链），
 * 并把勾选文件以相对路径为条目名原样打包为客户端 ZIP 包（<name>-client.zip）。
 * 结果经 server:manifest 回推；失败时同样回推（ok 为 false）并携带多语言键与原因。
 */
export async function iGM_LauncherV2_ServerManifest_Generate(
  serverId: string,
  name: string,
  paths: string[],
  notify: iGM_LauncherV2_ServerSyncNotify,
): Promise<void> {
  const fail = (reason: string): void => {
    notify({
      type: "server:manifest",
      ok: false,
      path: "",
      zipPath: "",
      count: 0,
      totalSize: 0,
      messageKey: "server.studio.manifestFailed",
      messageParams: { reason },
    });
  };

  try {
    const server = await iGM_LauncherV2_LocalServers_Find(serverId);
    if (!server) {
      fail("server-not-found");
      return;
    }

    const files: iGM_LauncherV2_ServerManifestEntry[] = [];
    const dataByPath = new Map<string, Buffer>();
    for (const raw of Array.isArray(paths) ? paths : []) {
      const relative = iGM_ServerSyncRelative(raw);
      if (!relative || dataByPath.has(relative)) continue;
      const absPath = join(server.dir, ...relative.split("/"));
      let data: Buffer;
      try {
        data = await readFile(absPath);
      } catch {
        continue;
      }
      const sha256 = createHash("sha256").update(data).digest("hex").toLowerCase();
      files.push({ path: relative, size: data.length, sha256, url: "" });
      dataByPath.set(relative, data);
    }
    files.sort((a, b) => a.path.localeCompare(b.path));

    if (files.length === 0) {
      fail("empty-selection");
      return;
    }

    const totalSize = files.reduce((sum, item) => sum + item.size, 0);
    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      server: (name || server.name).trim(),
      files: files.map((item) => ({
        path: item.path,
        size: item.size,
        sha256: item.sha256,
        url: item.url,
      })),
    };
    const manifestPath = join(server.dir, IGM_LAUNCHERV2_SERVERSYNC_MANIFEST_FILE);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const zipPath = join(
      server.dir,
      `${iGM_ServerManifestSafeName(name || server.name)}-client.zip`,
    );
    await writeFile(
      zipPath,
      iGM_ServerManifestZipBuild(
        files.map((item) => ({ name: item.path, data: dataByPath.get(item.path) ?? Buffer.alloc(0) })),
      ),
    );

    notify({
      type: "server:manifest",
      ok: true,
      path: manifestPath,
      zipPath,
      count: files.length,
      totalSize,
      messageKey: "server.manifestResultCount",
      messageParams: { count: String(files.length), path: manifestPath },
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "unknown");
  }
}

// 导出 //
export default iGM_LauncherV2_ServerSync_Start;
