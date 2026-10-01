/**
 * 文件路径：apps/shell/src/iGM_Launcher_TokenVault.ts
 * 所属层：桌面外壳 / 安全存储层
 * 路由：全局（仅供主进程调用，不对外暴露）
 * 模块：iGM_Launcher_TokenVault
 * 作用：Minecraft 正版令牌的加密落盘与读取，保证令牌绝不明文写盘
 * 内容：Windows 走 DPAPI（crypt32!CryptProtectData / CryptUnprotectData，
 *       以当前用户为保护范围并禁止任何 UI 弹窗）；
 *       其余平台回退 AES-256-GCM，密钥取自数据目录下权限收敛的设备密钥文件；
 *       对外只暴露 加密 / 解密 / 方案名 三个函数，返回带方案前缀的字符串信封
 *
 * 说明：macOS Keychain 与 Linux libsecret 的原生对接留待后续模块，
 *       当前回退方案同样满足“不明文落盘”的底线，并在方案名中如实标注。
 */

// 导入依赖 //
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { dlopen, FFIType, ptr, toArrayBuffer } from "bun:ffi";
import {
  IGM_LAUNCHER_DATA_ROOT,
  IGM_LAUNCHER_TOKEN_VAULT_KEY_FILE,
} from "@igm-launcher/shared";

// 类型定义 //

/** 加密方案名：dpapi 为 Windows 原生，aesgcm 为跨平台回退 */
export type iGM_Launcher_VaultScheme = "dpapi" | "aesgcm";

/** DPAPI 输出缓冲区结构（CRYPTOAPI_BLOB：cbData + 对齐填充 + pbData 指针） */
const IGM_LAUNCHER_BLOB_SIZE = 16;

// 核心逻辑 //

/* ---- Windows DPAPI ---- */

/** DPAPI 标志：禁止任何 UI 弹窗（第十二节“无终端弹窗”要求） */
const IGM_LAUNCHER_CRYPTPROTECT_UI_FORBIDDEN = 0x1;

/** 附加熵：固定盐值，避免同机其它进程直接解开我们的数据 */
const IGM_LAUNCHER_DPAPI_ENTROPY = Buffer.from("iGM_Launcher_MCBinding_v1\0", "utf8");

/** DPAPI 绑定（仅在 Windows 上尝试一次） */
let iGM_Launcher_DpapiChecked = false;
let iGM_Launcher_DpapiAvailable = false;
let iGM_Launcher_DpapiProtect: ((...args: unknown[]) => number) | null = null;
let iGM_Launcher_DpapiUnprotect: ((...args: unknown[]) => number) | null = null;
let iGM_Launcher_DpapiLocalFree: ((...args: unknown[]) => number) | null = null;

/**
 * 尝试加载 crypt32 / kernel32 并绑定 DPAPI 符号。
 * 任一环节失败都静默降级为 AES-256-GCM 回退方案。
 */
function iGM_Launcher_EnsureDpapi(): boolean {
  if (iGM_Launcher_DpapiChecked) return iGM_Launcher_DpapiAvailable;
  iGM_Launcher_DpapiChecked = true;

  if (process.platform !== "win32") return false;

  try {
    const crypt32 = dlopen("crypt32.dll", {
      CryptProtectData: {
        args: [
          FFIType.ptr,
          FFIType.ptr,
          FFIType.ptr,
          FFIType.ptr,
          FFIType.ptr,
          FFIType.u32,
          FFIType.ptr,
        ],
        returns: FFIType.bool,
      },
      CryptUnprotectData: {
        args: [
          FFIType.ptr,
          FFIType.ptr,
          FFIType.ptr,
          FFIType.ptr,
          FFIType.ptr,
          FFIType.u32,
          FFIType.ptr,
        ],
        returns: FFIType.bool,
      },
    });
    const kernel32 = dlopen("kernel32.dll", {
      LocalFree: { args: [FFIType.ptr], returns: FFIType.ptr },
    });

    iGM_Launcher_DpapiProtect = crypt32.symbols.CryptProtectData as unknown as (
      ...args: unknown[]
    ) => number;
    iGM_Launcher_DpapiUnprotect = crypt32.symbols.CryptUnprotectData as unknown as (
      ...args: unknown[]
    ) => number;
    iGM_Launcher_DpapiLocalFree = kernel32.symbols.LocalFree as unknown as (
      ...args: unknown[]
    ) => number;
    iGM_Launcher_DpapiAvailable = true;
    return true;
  } catch (error) {
    console.warn("[iGM_Launcher_TokenVault] DPAPI 不可用，回退 AES-256-GCM：", error);
    return false;
  }
}

/** 按 CRYPTOAPI_BLOB 布局构造输入缓冲区 */
function iGM_Launcher_BuildBlob(data: Buffer): Buffer {
  const blob = Buffer.alloc(IGM_LAUNCHER_BLOB_SIZE);
  blob.writeUInt32LE(data.length, 0);
  blob.writeBigUInt64LE(BigInt(ptr(data)), 8);
  return blob;
}

/** 读取 DPAPI 输出缓冲区并释放原生内存 */
function iGM_Launcher_ReadBlob(blob: Buffer): Buffer {
  const length = blob.readUInt32LE(0);
  const pointer = blob.readBigUInt64LE(8);
  if (pointer === BigInt(0) || length === 0) return Buffer.alloc(0);
  const pointerNumber = Number(pointer);
  const view = new Uint8Array(toArrayBuffer(pointerNumber, 0, length));
  const result = Buffer.from(view);
  iGM_Launcher_DpapiLocalFree?.(pointerNumber);
  return result;
}

/** DPAPI 加密：失败时抛错，由调用方决定是否回退 */
function iGM_Launcher_DpapiEncrypt(plaintext: string): Buffer {
  if (!iGM_Launcher_DpapiProtect) throw new Error("DPAPI 未就绪");
  const input = iGM_Launcher_BuildBlob(Buffer.from(plaintext, "utf8"));
  const entropy = iGM_Launcher_BuildBlob(IGM_LAUNCHER_DPAPI_ENTROPY);
  const output = Buffer.alloc(IGM_LAUNCHER_BLOB_SIZE);

  const ok = iGM_Launcher_DpapiProtect(
    input,
    0,
    entropy,
    0,
    0,
    IGM_LAUNCHER_CRYPTPROTECT_UI_FORBIDDEN,
    output,
  );
  if (!ok) throw new Error("CryptProtectData 调用失败");
  return iGM_Launcher_ReadBlob(output);
}

/** DPAPI 解密：失败时抛错 */
function iGM_Launcher_DpapiDecrypt(ciphertext: Buffer): string {
  if (!iGM_Launcher_DpapiUnprotect) throw new Error("DPAPI 未就绪");
  const input = iGM_Launcher_BuildBlob(ciphertext);
  const entropy = iGM_Launcher_BuildBlob(IGM_LAUNCHER_DPAPI_ENTROPY);
  const output = Buffer.alloc(IGM_LAUNCHER_BLOB_SIZE);

  const ok = iGM_Launcher_DpapiUnprotect(
    input,
    0,
    entropy,
    0,
    0,
    IGM_LAUNCHER_CRYPTPROTECT_UI_FORBIDDEN,
    output,
  );
  if (!ok) throw new Error("CryptUnprotectData 调用失败");
  return iGM_Launcher_ReadBlob(output).toString("utf8");
}

/* ---- AES-256-GCM 回退 ---- */

/** 设备密钥路径 */
function iGM_Launcher_VaultKeyPath(): string {
  return join(IGM_LAUNCHER_DATA_ROOT, IGM_LAUNCHER_TOKEN_VAULT_KEY_FILE);
}

/**
 * 读取设备密钥，缺失时生成 32 字节随机密钥并尽力收敛文件权限。
 * 说明：密钥与数据同处本机，安全性低于 DPAPI / Keychain，仅作跨平台回退。
 */
async function iGM_Launcher_LoadDeviceKey(): Promise<Buffer> {
  const keyPath = iGM_Launcher_VaultKeyPath();
  if (existsSync(keyPath)) {
    const raw = (await readFile(keyPath, "utf8")).trim();
    const key = Buffer.from(raw, "base64");
    if (key.length === 32) return key;
  }
  const key = randomBytes(32);
  await mkdir(dirname(keyPath), { recursive: true });
  await writeFile(keyPath, `${key.toString("base64")}\n`, "utf8");
  try {
    await chmod(keyPath, 0o600);
  } catch {
    // Windows 下 chmod 语义有限，忽略失败
  }
  return key;
}

/** 由设备密钥派生出 AES-256-GCM 密钥 */
async function iGM_Launcher_AesKey(): Promise<Buffer> {
  const deviceKey = await iGM_Launcher_LoadDeviceKey();
  return createHash("sha256").update(deviceKey).digest();
}

/** AES-256-GCM 加密，信封为 iv:tag:data（base64） */
async function iGM_Launcher_AesEncrypt(plaintext: string): Promise<string> {
  const key = await iGM_Launcher_AesKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

/** AES-256-GCM 解密 */
async function iGM_Launcher_AesDecrypt(payload: string): Promise<string> {
  const [ivRaw, tagRaw, dataRaw] = payload.split(":");
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error("加密信封格式不正确");
  const key = await iGM_Launcher_AesKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/* ---- 对外接口 ---- */

/** 当前生效的加密方案名，供日志与状态提示使用 */
export function iGM_Launcher_Vault_Scheme(): iGM_Launcher_VaultScheme {
  return iGM_Launcher_EnsureDpapi() ? "dpapi" : "aesgcm";
}

/**
 * 加密明文。
 * 输出带方案前缀，便于将来更换方案时仍可读回旧数据。
 */
export async function iGM_Launcher_Vault_Encrypt(plaintext: string): Promise<string> {
  if (iGM_Launcher_EnsureDpapi()) {
    try {
      return `dpapi:${iGM_Launcher_DpapiEncrypt(plaintext).toString("base64")}`;
    } catch (error) {
      console.warn("[iGM_Launcher_TokenVault] DPAPI 加密失败，回退 AES-256-GCM：", error);
    }
  }
  return `aesgcm:${await iGM_Launcher_AesEncrypt(plaintext)}`;
}

/**
 * 解密信封。
 * 按前缀选择方案；DPAPI 解密失败（如换了用户账户）时抛出明确错误，
 * 由调用方按“绑定令牌不可用，请重新绑定”处理，绝不静默返回空令牌。
 */
export async function iGM_Launcher_Vault_Decrypt(envelope: string): Promise<string> {
  const separator = envelope.indexOf(":");
  if (separator <= 0) throw new Error("加密信封缺少方案前缀");
  const scheme = envelope.slice(0, separator) as iGM_Launcher_VaultScheme;
  const payload = envelope.slice(separator + 1);

  if (scheme === "dpapi") {
    if (!iGM_Launcher_EnsureDpapi()) throw new Error("DPAPI 不可用，无法解密既有绑定");
    return iGM_Launcher_DpapiDecrypt(Buffer.from(payload, "base64"));
  }
  if (scheme === "aesgcm") return iGM_Launcher_AesDecrypt(payload);
  throw new Error(`未知的加密方案：${scheme}`);
}

// 导出 //
export default iGM_Launcher_Vault_Scheme;