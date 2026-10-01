/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_OAuthCrypto.ts
 * 所属层：后端 / 基础服务层
 * 路由：G_OAuth
 * 模块：iGM_OAuthCrypto
 * 作用：OAuth/OIDC 相关的密码学能力（随机数、JWT 签名、JWKS、Cookie 签名）
 * 内容：密码学安全随机串、base64url 编解码、ECDSA P-256 密钥生成与持久化、
 *       ES256 JWT 签名、JWKS 公钥集、PKCE S256 校验、HMAC-SHA256 Cookie 签名
 * 说明：全部随机数来自 crypto.getRandomValues / randomUUID，禁止使用 Math.random；
 *       ID Token 签名算法固定 ES256，私钥仅存后端（SQLite iGM_OAuthKeys）
 */

// 导入依赖 //
import { iGM_RandomHex, iGM_Sha256 } from "./iGM_SecurityService";
import {
  iGM_FindActiveOAuthKey,
  iGM_InsertOAuthKey,
  iGM_ListActiveOAuthKeys,
} from "../iGM_Repositories/iGM_OAuthRepository";
import type { iGM_OAuthKeyRow } from "../iGM_Types/iGM_OAuth";

// 类型定义 //
/** JWT 头部 */
interface iGM_JwtHeader {
  alg: "ES256";
  typ: "JWT";
  kid: string;
}

/** 运行时缓存的签名密钥 */
interface iGM_SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: Record<string, unknown>;
}

/** JWKS 单体 */
export interface iGM_JwksKey {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid: string;
  use: "sig";
  alg: "ES256";
}

// 核心逻辑 //
/* ---------- 随机数与编码 ---------- */

/** 生成 32 字节（256 位）密码学安全随机十六进制串——client_secret / 授权码 / 令牌 / PKCE verifier */
export function iGM_OAuthRandomToken(): string {
  return iGM_RandomHex(32);
}

/** 生成 client_id：igmc_ 前缀 + 16 字节随机十六进制 */
export function iGM_OAuthClientId(): string {
  return `igmc_${iGM_RandomHex(16)}`;
}

/** base64url 编码（无填充） */
export function iGM_Base64Url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url 解码为 UTF-8 字符串 */
export function iGM_Base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------- ECDSA P-256 签名密钥 ---------- */

/** 模块级缓存：避免每次签发都读库与导入密钥 */
let iGM_CachedSigningKey: iGM_SigningKey | null = null;

/** 生成一对 P-256 密钥并以 JWK 形式导出 */
async function iGM_GenerateSigningKey(): Promise<{
  kid: string;
  publicJwk: Record<string, unknown>;
  privateJwk: Record<string, unknown>;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = (await crypto.subtle.exportKey(
    "jwk",
    pair.publicKey,
  )) as Record<string, unknown>;
  const privateJwk = (await crypto.subtle.exportKey(
    "jwk",
    pair.privateKey,
  )) as Record<string, unknown>;
  return { kid: iGM_RandomHex(8), publicJwk, privateJwk };
}

/** 把库中密钥行导入为可用的签名密钥 */
async function iGM_ImportSigningKey(row: iGM_OAuthKeyRow): Promise<iGM_SigningKey> {
  const privateJwk = JSON.parse(row.iGM_PrivateJwk) as JsonWebKey;
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return {
    kid: row.iGM_Kid,
    privateKey,
    publicJwk: JSON.parse(row.iGM_PublicJwk) as Record<string, unknown>,
  };
}

/** 确保存在 OIDC 签名密钥：首次调用时生成并落库 */
export async function iGM_EnsureSigningKey(): Promise<iGM_SigningKey> {
  if (iGM_CachedSigningKey) return iGM_CachedSigningKey;
  const existing = iGM_FindActiveOAuthKey("oidc");
  if (existing) {
    iGM_CachedSigningKey = await iGM_ImportSigningKey(existing);
    return iGM_CachedSigningKey;
  }
  const generated = await iGM_GenerateSigningKey();
  iGM_InsertOAuthKey({
    id: crypto.randomUUID(),
    kind: "oidc",
    kid: generated.kid,
    alg: "ES256",
    publicJwk: JSON.stringify(generated.publicJwk),
    privateJwk: JSON.stringify(generated.privateJwk),
    now: new Date().toISOString(),
  });
  const row = iGM_FindActiveOAuthKey("oidc");
  if (!row) throw new Error("iGM_EnsureSigningKey：密钥写入失败");
  iGM_CachedSigningKey = await iGM_ImportSigningKey(row);
  return iGM_CachedSigningKey;
}

/** 读取 JWKS 公钥集（含历史启用密钥，便于密钥轮换平滑过渡；首次访问即生成签名密钥） */
export async function iGM_GetJwks(): Promise<{ keys: iGM_JwksKey[] }> {
  await iGM_EnsureSigningKey();
  const rows = iGM_ListActiveOAuthKeys("oidc");
  const keys = rows.map((row) => {
    const jwk = JSON.parse(row.iGM_PublicJwk) as Record<string, string>;
    return {
      kty: jwk.kty ?? "EC",
      crv: jwk.crv ?? "P-256",
      x: jwk.x ?? "",
      y: jwk.y ?? "",
      kid: row.iGM_Kid,
      use: "sig" as const,
      alg: "ES256" as const,
    };
  });
  return { keys };
}

/* ---------- JWT（ES256） ---------- */

/**
 * 签发 ES256 JWT。
 * WebCrypto 的 ECDSA 签名结果即 JWS 要求的 r||s 定长拼接（P-256 为 64 字节），
 * 无需再做 DER 转换，可直接 base64url 作为签名段。
 */
export async function iGM_SignJwt(
  claims: Record<string, unknown>,
): Promise<string> {
  const key = await iGM_EnsureSigningKey();
  const header: iGM_JwtHeader = { alg: "ES256", typ: "JWT", kid: key.kid };
  const encodedHeader = iGM_Base64Url(JSON.stringify(header));
  const encodedPayload = iGM_Base64Url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${iGM_Base64Url(signature)}`;
}

/* ---------- PKCE ---------- */

/** 计算 PKCE S256 挑战值：base64url(sha256(verifier)) */
export function iGM_PkceChallenge(verifier: string): string {
  const digest = new Bun.CryptoHasher("sha256").update(verifier).digest();
  return iGM_Base64Url(new Uint8Array(digest));
}

/** 校验 PKCE：优先 S256，plain 仅兼容显式声明（本项目仅允许 S256） */
export function iGM_VerifyPkce(
  verifier: string,
  challenge: string,
  method: string | null,
): boolean {
  if (!verifier || !challenge) return false;
  const normalized = (method ?? "S256").toUpperCase();
  if (normalized === "S256") {
    return iGM_PkceChallenge(verifier) === challenge;
  }
  return false;
}

/* ---------- 会话 Cookie 签名（HMAC-SHA256） ---------- */

/** 模块级缓存的 Cookie 签名密钥（32 字节十六进制 = 256 位） */
let iGM_CachedCookieSecret: string | null = null;

/** 读取（必要时生成）256 位 Cookie 签名密钥 */
function iGM_GetCookieSecret(): string {
  if (iGM_CachedCookieSecret) return iGM_CachedCookieSecret;
  const existing = iGM_FindActiveOAuthKey("cookie");
  if (existing) {
    iGM_CachedCookieSecret = existing.iGM_PrivateJwk;
    return iGM_CachedCookieSecret;
  }
  const secret = iGM_RandomHex(32);
  iGM_InsertOAuthKey({
    id: crypto.randomUUID(),
    kind: "cookie",
    kid: iGM_RandomHex(8),
    alg: "HS256",
    publicJwk: "{}",
    privateJwk: secret,
    now: new Date().toISOString(),
  });
  iGM_CachedCookieSecret = secret;
  return secret;
}

/** HMAC-SHA256 签名，返回 base64url */
function iGM_Hmac(payload: string): string {
  const hasher = new Bun.CryptoHasher("sha256", iGM_GetCookieSecret());
  hasher.update(payload);
  return iGM_Base64Url(new Uint8Array(hasher.digest()));
}

/** 对载荷签名，返回 `base64url(json).base64url(hmac)` */
export function iGM_SignCookiePayload(payload: Record<string, unknown>): string {
  const encoded = iGM_Base64Url(JSON.stringify(payload));
  return `${encoded}.${iGM_Hmac(encoded)}`;
}

/** 校验并解析签名载荷；签名不合法或已过期返回 null */
export function iGM_VerifyCookiePayload<T extends { exp?: number }>(
  token: string | null,
): T | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (iGM_Hmac(encoded) !== signature) return null;
  try {
    const payload = JSON.parse(iGM_Base64UrlDecode(encoded)) as T;
    if (typeof payload.exp === "number" && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 令牌入库前哈希（access_token / refresh_token 均只在库中保留哈希） */
export function iGM_HashOAuthToken(token: string): string {
  return iGM_Sha256(token);
}

// 导出 //
export default {
  iGM_OAuthRandomToken,
  iGM_OAuthClientId,
  iGM_Base64Url,
  iGM_Base64UrlDecode,
  iGM_EnsureSigningKey,
  iGM_GetJwks,
  iGM_SignJwt,
  iGM_PkceChallenge,
  iGM_VerifyPkce,
  iGM_SignCookiePayload,
  iGM_VerifyCookiePayload,
  iGM_HashOAuthToken,
};
