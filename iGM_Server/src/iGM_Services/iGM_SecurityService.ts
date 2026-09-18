/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_SecurityService.ts
 * 所属层：后端 / 基础服务层
 * 路由：G_Auth
 * 模块：iGM_SecurityService
 * 作用：认证相关的密码学与 Cookie 工具
 * 内容：Bun 内置 bcrypt 密码哈希/校验、随机 UUID/会话 ID/验证码/重置令牌、
 *       SHA-256 哈希、Cookie 读取与 Set-Cookie 构造
 */

// 导入依赖 //
import type { iGM_Config } from "../iGM_Config/iGM_Config";

// 类型定义 //
// （本文件仅导出工具函数）

// 核心逻辑 //
/**
 * 密码哈希：使用 Bun 内置 bcrypt 加盐算法
 * 数据库中永不存储明文密码
 */
export async function iGM_HashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, { algorithm: "bcrypt", cost: 10 });
}

/** 校验明文密码与存储哈希是否匹配 */
export async function iGM_VerifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    return false;
  }
}

/** 生成随机 UUID（用户主键、令牌行主键） */
export function iGM_RandomUuid(): string {
  return crypto.randomUUID();
}

/** 生成随机会话 ID（32 字节 = 64 位十六进制字符） */
export function iGM_GenerateSessionId(): string {
  return iGM_RandomHex(32);
}

/** 生成一次性密码重置令牌（32 字节十六进制） */
export function iGM_GenerateResetToken(): string {
  return iGM_RandomHex(32);
}

/** 生成 6 位数字邮箱验证码（前导零保留） */
export function iGM_GenerateVerifyCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return String(buffer[0] % 1_000_000).padStart(6, "0");
}

/** 生成指定字节数的随机十六进制字符串 */
export function iGM_RandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 计算字符串的 SHA-256 十六进制哈希（会话 ID、重置令牌入库前哈希） */
export function iGM_Sha256(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

/** 从请求头 Cookie 中读取指定名称的值 */
export function iGM_ReadCookie(
  request: Request,
  name: string,
): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}

/**
 * 构造 Set-Cookie 头值
 * @param maxAge 秒；传 0 表示立即过期（登出清除）
 */
export function iGM_BuildSetCookie(
  name: string,
  value: string,
  maxAge: number,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  // 生产域名 HTTPS 下追加 Secure；本地 http 不追加，否则 Cookie 不会写入
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** 写入会话 Cookie 的便捷方法 */
export function iGM_BuildSessionCookie(
  config: typeof iGM_Config,
  sessionId: string,
): string {
  return iGM_BuildSetCookie(
    config.auth.cookieName,
    sessionId,
    Math.floor(config.auth.sessionTtlMs / 1000),
  );
}

/** 清除会话 Cookie 的便捷方法 */
export function iGM_ClearSessionCookie(config: typeof iGM_Config): string {
  return iGM_BuildSetCookie(config.auth.cookieName, "", 0);
}

// 导出 //
export default {
  iGM_HashPassword,
  iGM_VerifyPassword,
  iGM_RandomUuid,
  iGM_GenerateSessionId,
  iGM_GenerateResetToken,
  iGM_GenerateVerifyCode,
  iGM_RandomHex,
  iGM_Sha256,
  iGM_ReadCookie,
  iGM_BuildSetCookie,
  iGM_BuildSessionCookie,
  iGM_ClearSessionCookie,
};
