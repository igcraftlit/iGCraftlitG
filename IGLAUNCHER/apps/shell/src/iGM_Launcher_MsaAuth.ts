/**
 * 文件路径：apps/shell/src/iGM_Launcher_MsaAuth.ts
 * 所属层：桌面外壳 / 认证服务层
 * 路由：全局（仅供主进程调用，经桥接层暴露）
 * 模块：iGM_Launcher_MsaAuth
 * 作用：Minecraft 正版验证链的实现——
 *       微软 OAuth 2.0 -> Xbox Live -> XSTS -> Minecraft Services -> 玩家档案 -> 拥有权校验；
 *       同时承载设备代码流程（用户码轮询）与浏览器授权流程（Authorization Code + PKCE 本地回调）
 * 内容：认证链各步骤、两条授权流程（设备代码 / 浏览器 PKCE）、令牌刷新，
 *       以及主进程内的流程注册表（flowId -> 令牌上下文）。
 *
 * 前置条件：MSA Client ID 使用 IGM_LAUNCHER_MSA_DEFAULT_CLIENT_ID 内置公开标识，
 *           可用 IGM_MSA_CLIENT_ID 环境变量覆盖；不做任何本地模拟——
 *           绑定记录只可能来自真实微软账号。
 *
 * 安全约束（第十二节）：
 *   1. 所有敏感令牌（msa / xbox / xsts / minecraft）只存在于本模块内存与加密文件，
 *      绝不出现在返回给渲染进程的结构中；渲染进程只拿 flowId 与不含令牌的绑定视图。
 *   2. 全部端点均为 HTTPS，子进程与浏览器均为隐藏/外部方式拉起，不产生终端弹窗。
 *   3. 社区账号（主身份）与 Minecraft 正版账号（子身份）完全分离，互不替代。
 */

// 导入依赖 //
import { createHash, randomBytes } from "node:crypto";
import {
  IGM_LAUNCHER_MSA_CLIENT_ID_ENV,
  IGM_LAUNCHER_MSA_DEFAULT_CLIENT_ID,
  IGM_LAUNCHER_MSA_DEFAULT_REDIRECT_URI,
  IGM_LAUNCHER_MSA_ENDPOINTS,
  IGM_LAUNCHER_MSA_REDIRECT_URI_ENV,
  IGM_LAUNCHER_MSA_SCOPE,
  IGM_LAUNCHER_MSA_TIMEOUT_MS,
  IGM_LAUNCHER_MC_CLIENT_ID_MISSING,
  IGM_LAUNCHER_MC_FLOW_EXPIRED,
  IGM_LAUNCHER_MC_NOT_OWNED,
  IGM_LAUNCHER_BRIDGE_FAILED,
  IGM_LAUNCHER_BRIDGE_INVALID,
  IGM_LAUNCHER_BRIDGE_NOT_FOUND,
  IGM_LAUNCHER_BRIDGE_OK,
  IGM_LAUNCHER_BRIDGE_UNAUTHORIZED,
  IGM_LAUNCHER_BRIDGE_UNREACHABLE,
  iGM_Launcher_FormatUuid,
  iGM_Launcher_NewId,
  type iGM_Launcher_BridgeResponse,
  type iGM_Launcher_BrowserAuthStart,
  type iGM_Launcher_MCBinding,
  type iGM_Launcher_MCBindingSecret,
  type iGM_Launcher_McAuthStage,
  type iGM_Launcher_MinecraftProfile,
  type iGM_Launcher_MinecraftTexture,
  type iGM_Launcher_MinecraftToken,
  type iGM_Launcher_MsaDeviceCode,
  type iGM_Launcher_MsaFlowResult,
  type iGM_Launcher_MsaToken,
  type iGM_Launcher_XboxToken,
  type iGM_Launcher_XstsToken,
} from "@igm-launcher/shared";

// 类型定义 //

/** 认证链完整结果（含敏感令牌，仅主进程内使用） */
export interface iGM_Launcher_MsaChainResult {
  /** 微软 OAuth 令牌；以 refresh_token 进入链路时同样会返回轮换后的新值 */
  msa: iGM_Launcher_MsaToken;
  xbox: iGM_Launcher_XboxToken;
  xsts: iGM_Launcher_XstsToken;
  minecraft: iGM_Launcher_MinecraftToken;
  profile: iGM_Launcher_MinecraftProfile;
  /** 是否通过 Minecraft Java 版拥有权校验 */
  ownsJava: boolean;
  /** Xbox XUID（取自 Xbox Live / XSTS 的 xui.xid） */
  xuid: string;
}

/** 认证链错误：携带错误码，由桥接层映射为统一响应码或界面提示键 */
export class iGM_Launcher_MsaError extends Error {
  /** 业务错误码（XSTS XErr、HTTP 状态码或自定义码） */
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "iGM_Launcher_MsaError";
    this.code = code;
  }
}

/** 单次认证流程的上下文（令牌全部留在主进程内存） */
interface iGM_Launcher_MsaFlow {
  id: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
  /** 当前推进到的阶段 */
  stage: iGM_Launcher_McAuthStage;
  /** 已完成阶段 */
  completed: iGM_Launcher_McAuthStage[];
  msa: iGM_Launcher_MsaToken | null;
  xbox: iGM_Launcher_XboxToken | null;
  xsts: iGM_Launcher_XstsToken | null;
  minecraft: iGM_Launcher_MinecraftToken | null;
  profile: iGM_Launcher_MinecraftProfile | null;
  ownsJava: boolean;
  xuid: string;
  /** 设备代码（设备代码流程） */
  deviceCode: string;
  /** 已完成轮询次数 */
  pollCount: number;
  pollInterval: number;
  /** PKCE code_verifier（浏览器授权流程） */
  codeVerifier: string;
  /** 本地回调服务器停止句柄 */
  stopServer: (() => void) | null;
  /** 授权码等待（浏览器授权流程） */
  codePromise: Promise<string> | null;
  resolveCode: ((code: string) => void) | null;
  rejectCode: ((error: Error) => void) | null;
  /** 认证完成后待绑定的记录与令牌（等待 mc:bind-to-community 落盘） */
  pendingBinding: iGM_Launcher_MCBinding | null;
  pendingSecret: iGM_Launcher_MCBindingSecret | null;
}

/** 微软 HTTP 调用结果 */
interface iGM_Launcher_MsaHttpResult {
  status: number;
  /** 解析后的 JSON，非 JSON 响应时为 null */
  json: unknown;
  /** 原始文本，用于错误兜底 */
  text: string;
}

/** 令牌端点原始响应形状 */
interface iGM_Launcher_MsaTokenPayload {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Xbox Live / XSTS 原始响应形状 */
interface iGM_Launcher_XboxPayload {
  Token?: string;
  NotAfter?: string;
  XErr?: number;
  DisplayClaims?: { xui?: { uhs?: string; xid?: string }[] };
}

/** Minecraft 登录原始响应形状 */
interface iGM_Launcher_McLoginPayload {
  access_token?: string;
  expires_in?: number;
}

/** Minecraft 档案原始响应形状 */
interface iGM_Launcher_McProfilePayload {
  id?: string;
  name?: string;
  skins?: iGM_Launcher_MinecraftTexture[];
  capes?: iGM_Launcher_MinecraftTexture[];
}

// 核心逻辑 //

/* ---- 通用工具 ---- */

/** 流程编号有效期：15 分钟，超时后令牌上下文一并丢弃 */
const IGM_LAUNCHER_MC_FLOW_TTL_MS = 15 * 60 * 1000;

/** 浏览器授权回调最长等待时间（毫秒） */
const IGM_LAUNCHER_MC_BROWSER_WAIT_MS = 180 * 1000;

/** 微软 refresh_token 约定有效期（约 90 天），仅用于界面展示到期时间 */
const IGM_LAUNCHER_MC_REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** 进程内流程注册表 */
const iGM_Launcher_MsaFlows = new Map<string, iGM_Launcher_MsaFlow>();

/** 当前 MSA Client ID（Azure 应用）：环境变量优先，未配置时回退到内置公开标识 */
function iGM_Launcher_MsaClientId(): string {
  const configured = process.env[IGM_LAUNCHER_MSA_CLIENT_ID_ENV]?.trim();
  return configured && configured.length > 0
    ? configured
    : IGM_LAUNCHER_MSA_DEFAULT_CLIENT_ID;
}

/** 当前重定向 URI，未配置时取默认本地回调地址 */
function iGM_Launcher_MsaRedirectUri(): string {
  const configured = process.env[IGM_LAUNCHER_MSA_REDIRECT_URI_ENV]?.trim();
  return configured && configured.length > 0 ? configured : IGM_LAUNCHER_MSA_DEFAULT_REDIRECT_URI;
}

/** 是否已解析到可用的 MSA Client ID（内置默认值保证安装版始终可用） */
export function iGM_Launcher_Msa_IsConfigured(): boolean {
  return iGM_Launcher_MsaClientId().length > 0;
}

/** 导出给启动链路使用：当前生效的 MSA Client ID（正版启动写入 --clientId） */
export function iGM_Launcher_Msa_ResolveClientId(): string {
  return iGM_Launcher_MsaClientId();
}

/** 未解析到 Client ID 时的统一拒绝响应（内置默认值使此分支实际不可达，仅作兜底） */
function iGM_Launcher_MsaMissingClientId<T = null>(): iGM_Launcher_BridgeResponse<T> {
  return iGM_Launcher_MsaFail<T>(
    IGM_LAUNCHER_MC_CLIENT_ID_MISSING,
    "正版验证服务未就绪，请更新启动器后重试",
  );
}

/** 成功响应 */
function iGM_Launcher_MsaOk<T>(data: T, message = "ok"): iGM_Launcher_BridgeResponse<T> {
  return { success: true, code: IGM_LAUNCHER_BRIDGE_OK, message, data };
}

/** 失败响应 */
function iGM_Launcher_MsaFail<T = null>(
  code: number,
  message: string,
): iGM_Launcher_BridgeResponse<T> {
  return { success: false, code, message, data: null };
}

/** 统一 HTTP 调用：带超时，网络异常归纳为 unreachable */
async function iGM_Launcher_MsaRequest(
  url: string,
  init: { method?: "GET" | "POST"; body?: unknown; accessToken?: string } = {},
): Promise<iGM_Launcher_MsaHttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IGM_LAUNCHER_MSA_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.accessToken) headers.Authorization = `Bearer ${init.accessToken}`;

    const response = await fetch(url, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let json: unknown = null;
    try {
      json = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text };
  } catch (error) {
    throw new iGM_Launcher_MsaError(
      IGM_LAUNCHER_BRIDGE_UNREACHABLE,
      error instanceof Error ? error.message : "网络请求失败",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** 表单编码调用（OAuth 令牌端点要求 application/x-www-form-urlencoded） */
async function iGM_Launcher_MsaFormRequest(
  url: string,
  form: Record<string, string>,
): Promise<iGM_Launcher_MsaHttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IGM_LAUNCHER_MSA_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text };
  } catch (error) {
    throw new iGM_Launcher_MsaError(
      IGM_LAUNCHER_BRIDGE_UNREACHABLE,
      error instanceof Error ? error.message : "网络请求失败",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** base64url 编码（PKCE 使用） */
function iGM_Launcher_Base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** 清理过期流程，避免内存中长期驻留令牌上下文 */
function iGM_Launcher_MsaSweep(): void {
  const now = Date.now();
  for (const [id, flow] of iGM_Launcher_MsaFlows) {
    if (flow.expiresAt > now) continue;
    flow.stopServer?.();
    flow.rejectCode?.(new Error("认证流程已过期"));
    iGM_Launcher_MsaFlows.delete(id);
  }
}

/** 取流程上下文，不存在或已过期时抛出明确错误 */
function iGM_Launcher_MsaRequireFlow(flowId: string): iGM_Launcher_MsaFlow {
  iGM_Launcher_MsaSweep();
  const flow = iGM_Launcher_MsaFlows.get(flowId);
  if (!flow) {
    throw new iGM_Launcher_MsaError(
      IGM_LAUNCHER_MC_FLOW_EXPIRED,
      "认证流程不存在或已过期，请重新开始绑定",
    );
  }
  return flow;
}

/* ---- 认证链各步骤 ---- */

/** 第一步：微软 OAuth 2.0 令牌（access_token + refresh_token） */
async function iGM_Launcher_MsaExchangeCode(
  clientId: string,
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<iGM_Launcher_MsaToken> {
  const result = await iGM_Launcher_MsaFormRequest(IGM_LAUNCHER_MSA_ENDPOINTS.token, {
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    scope: IGM_LAUNCHER_MSA_SCOPE,
  });
  const payload = (result.json ?? {}) as iGM_Launcher_MsaTokenPayload;
  if (result.status !== 200 || !payload.access_token) {
    throw new iGM_Launcher_MsaError(
      result.status,
      payload.error_description ?? payload.error ?? "微软授权码换取令牌失败",
    );
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? "",
    scope: payload.scope ?? IGM_LAUNCHER_MSA_SCOPE,
    expiresIn: payload.expires_in ?? 3600,
  };
}

/** 第二步：Xbox Live 用户认证（AuthMethod=RPS，RpsTicket=d=<ms_token>） */
async function iGM_Launcher_MsaXboxAuthenticate(
  msaAccessToken: string,
): Promise<iGM_Launcher_XboxToken> {
  const result = await iGM_Launcher_MsaRequest(IGM_LAUNCHER_MSA_ENDPOINTS.xboxLive, {
    body: {
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${msaAccessToken}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    },
  });
  const payload = (result.json ?? {}) as iGM_Launcher_XboxPayload;
  if (result.status !== 200 || !payload.Token) {
    throw new iGM_Launcher_MsaError(result.status, "Xbox Live 认证失败，请稍后重试");
  }
  const xui = payload.DisplayClaims?.xui?.[0];
  return {
    token: payload.Token,
    userHash: xui?.uhs ?? "",
    notAfter: payload.NotAfter ?? "",
  };
}

/** 第三步：XSTS 授权（SandboxId=RETAIL，RelyingParty=rp://api.minecraftservices.com/） */
async function iGM_Launcher_MsaXstsAuthorize(xboxToken: string): Promise<{
  xsts: iGM_Launcher_XstsToken;
  xuid: string;
}> {
  const result = await iGM_Launcher_MsaRequest(IGM_LAUNCHER_MSA_ENDPOINTS.xsts, {
    body: {
      Properties: {
        SandboxId: "RETAIL",
        UserTokens: [xboxToken],
      },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT",
    },
  });
  const payload = (result.json ?? {}) as iGM_Launcher_XboxPayload;

  if (result.status !== 200 || !payload.Token) {
    // XSTS 失败时返回 401 + XErr，交由界面按第十节映射为可读文案
    const errorCode = payload.XErr ?? result.status;
    throw new iGM_Launcher_MsaError(errorCode, "XSTS 授权失败");
  }

  const xui = payload.DisplayClaims?.xui?.[0];
  return {
    xsts: {
      token: payload.Token,
      userHash: xui?.uhs ?? "",
      notAfter: payload.NotAfter ?? "",
    },
    xuid: xui?.xid ?? "",
  };
}

/** 第四步：Minecraft 登录（identityToken = XBL3.0 x=<userHash>;<xstsToken>） */
async function iGM_Launcher_MsaMinecraftAuthenticate(
  userHash: string,
  xstsToken: string,
): Promise<iGM_Launcher_MinecraftToken> {
  const result = await iGM_Launcher_MsaRequest(IGM_LAUNCHER_MSA_ENDPOINTS.minecraftLogin, {
    body: { identityToken: `XBL3.0 x=${userHash};${xstsToken}` },
  });
  const payload = (result.json ?? {}) as iGM_Launcher_McLoginPayload;

  if (result.status === 403) {
    // 403：Azure 应用尚未获得 Minecraft 官方审批
    throw new iGM_Launcher_MsaError(403, "Azure 应用未获 Minecraft 官方授权");
  }
  if (result.status !== 200 || !payload.access_token) {
    throw new iGM_Launcher_MsaError(result.status, "Minecraft 登录失败，请稍后重试");
  }
  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in ?? 86400,
  };
}

/** 第五步：读取玩家档案（UUID / 玩家名 / 皮肤 / 披风） */
export async function iGM_Launcher_MsaFetchProfile(
  minecraftAccessToken: string,
): Promise<iGM_Launcher_MinecraftProfile> {
  const result = await iGM_Launcher_MsaRequest(IGM_LAUNCHER_MSA_ENDPOINTS.minecraftProfile, {
    accessToken: minecraftAccessToken,
  });
  const payload = (result.json ?? {}) as iGM_Launcher_McProfilePayload;
  if (result.status !== 200 || !payload.id || !payload.name) {
    throw new iGM_Launcher_MsaError(result.status, "读取 Minecraft 玩家档案失败");
  }
  return {
    uuid: iGM_Launcher_FormatUuid(payload.id),
    name: payload.name,
    skins: Array.isArray(payload.skins) ? payload.skins : [],
    capes: Array.isArray(payload.capes) ? payload.capes : [],
  };
}

/** 第六步：拥有权校验（未拥有 Java 版时抛出 4001） */
export async function iGM_Launcher_MsaCheckEntitlements(minecraftAccessToken: string): Promise<boolean> {
  const result = await iGM_Launcher_MsaRequest(IGM_LAUNCHER_MSA_ENDPOINTS.minecraftEntitlements, {
    accessToken: minecraftAccessToken,
  });
  if (result.status !== 200) {
    throw new iGM_Launcher_MsaError(result.status, "读取 Minecraft 拥有权失败");
  }
  const items = (result.json as { items?: unknown[] } | null)?.items;
  const owns = Array.isArray(items) && items.length > 0;
  if (!owns) {
    throw new iGM_Launcher_MsaError(
      IGM_LAUNCHER_MC_NOT_OWNED,
      "该账号未购买 Minecraft Java 版",
    );
  }
  return true;
}

/** 由完整认证链结果构造绑定记录（不含令牌） */
function iGM_Launcher_MsaBuildBinding(
  communityUid: string,
  chain: iGM_Launcher_MsaChainResult,
  isDefault: boolean,
): iGM_Launcher_MCBinding {
  const now = new Date().toISOString();
  const skin = chain.profile.skins.find((item) => item.state === "ACTIVE") ?? chain.profile.skins[0];
  const cape = chain.profile.capes[0];
  return {
    id: iGM_Launcher_NewId("mcb"),
    communityUid,
    uuid: chain.profile.uuid,
    name: chain.profile.name,
    xuid: chain.xuid,
    ownsJava: chain.ownsJava,
    isDefault,
    refreshExpiresAt: new Date(Date.now() + IGM_LAUNCHER_MC_REFRESH_TTL_MS).toISOString(),
    accessExpiresAt: new Date(Date.now() + chain.minecraft.expiresIn * 1000).toISOString(),
    skinUrl: skin?.url ?? "",
    capeUrl: cape?.url ?? "",
    addedAt: now,
    refreshedAt: now,
  };
}

/** 由完整认证链结果构造绑定密钥载荷 */
function iGM_Launcher_MsaBuildSecret(
  binding: iGM_Launcher_MCBinding,
  chain: iGM_Launcher_MsaChainResult,
): iGM_Launcher_MCBindingSecret {
  return {
    binding,
    msaRefreshToken: chain.msa.refreshToken,
    minecraftAccessToken: chain.minecraft.accessToken,
    xstsToken: chain.xsts.token,
    xstsUserHash: chain.xsts.userHash || chain.xbox.userHash,
  };
}

/* ---- 流程结果 ---- */

/** 记录阶段完成并推进游标 */
function iGM_Launcher_MsaMarkStage(flow: iGM_Launcher_MsaFlow, stage: iGM_Launcher_McAuthStage): void {
  if (!flow.completed.includes(stage)) flow.completed.push(stage);
  flow.stage = stage;
}

/** 构造轮询 / 分步结果 */
function iGM_Launcher_MsaResult(
  flow: iGM_Launcher_MsaFlow,
  status: iGM_Launcher_MsaFlowResult["status"],
  errorCode = 0,
  errorMessage = "",
): iGM_Launcher_MsaFlowResult {
  return {
    status,
    stage: flow.stage,
    completed: [...flow.completed],
    binding: status === "done" ? flow.pendingBinding : null,
    errorCode,
    errorMessage,
  };
}

/**
 * 依次执行认证链（已被步骤方法提前完成的阶段自动跳过）。
 * Xbox / XSTS / Minecraft / 档案 / 拥有权缺一环即抛出，绝不静默降级为“已绑定”。
 */
async function iGM_Launcher_MsaRunChain(flow: iGM_Launcher_MsaFlow): Promise<void> {
  if (!flow.msa) throw new iGM_Launcher_MsaError(IGM_LAUNCHER_MC_FLOW_EXPIRED, "缺少微软令牌");

  if (!flow.xbox) {
    flow.xbox = await iGM_Launcher_MsaXboxAuthenticate(flow.msa.accessToken);
  }
  iGM_Launcher_MsaMarkStage(flow, "xbox");

  if (!flow.xsts) {
    const authorized = await iGM_Launcher_MsaXstsAuthorize(flow.xbox.token);
    flow.xsts = authorized.xsts;
    flow.xuid = authorized.xuid || flow.xuid;
  }
  iGM_Launcher_MsaMarkStage(flow, "xsts");

  if (!flow.minecraft) {
    flow.minecraft = await iGM_Launcher_MsaMinecraftAuthenticate(
      flow.xsts.userHash || flow.xbox.userHash,
      flow.xsts.token,
    );
  }
  iGM_Launcher_MsaMarkStage(flow, "minecraft");

  if (!flow.profile) {
    flow.profile = await iGM_Launcher_MsaFetchProfile(flow.minecraft.accessToken);
  }
  iGM_Launcher_MsaMarkStage(flow, "profile");

  flow.ownsJava = await iGM_Launcher_MsaCheckEntitlements(flow.minecraft.accessToken);
  iGM_Launcher_MsaMarkStage(flow, "entitlements");
}

/* ---- 设备代码流程 ---- */

/** 申请设备代码 */
export async function iGM_Launcher_Msa_StartDeviceCode(): Promise<
  iGM_Launcher_BridgeResponse<{ deviceCode: iGM_Launcher_MsaDeviceCode }>
> {
  iGM_Launcher_MsaSweep();
  if (!iGM_Launcher_Msa_IsConfigured()) return iGM_Launcher_MsaMissingClientId();
  const flow: iGM_Launcher_MsaFlow = {
    id: iGM_Launcher_NewId("msaflow"),
    redirectUri: iGM_Launcher_MsaRedirectUri(),
    createdAt: Date.now(),
    expiresAt: Date.now() + IGM_LAUNCHER_MC_FLOW_TTL_MS,
    stage: "msa",
    completed: [],
    msa: null,
    xbox: null,
    xsts: null,
    minecraft: null,
    profile: null,
    ownsJava: false,
    xuid: "",
    deviceCode: "",
    pollCount: 0,
    pollInterval: 5,
    codeVerifier: "",
    stopServer: null,
    codePromise: null,
    resolveCode: null,
    rejectCode: null,
    pendingBinding: null,
    pendingSecret: null,
  };
  iGM_Launcher_MsaFlows.set(flow.id, flow);

  const result = await iGM_Launcher_MsaFormRequest(IGM_LAUNCHER_MSA_ENDPOINTS.deviceCode, {
    client_id: iGM_Launcher_MsaClientId(),
    scope: IGM_LAUNCHER_MSA_SCOPE,
  });
  const payload = (result.json ?? {}) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
    message?: string;
    error_description?: string;
  };

  if (result.status !== 200 || !payload.device_code || !payload.user_code) {
    iGM_Launcher_MsaFlows.delete(flow.id);
    return iGM_Launcher_MsaFail(
      result.status > 0 ? result.status : IGM_LAUNCHER_BRIDGE_FAILED,
      payload.error_description ?? "申请设备代码失败，请稍后重试",
    );
  }

  flow.deviceCode = payload.device_code;
  flow.pollInterval = payload.interval ?? 5;
  flow.expiresAt = Date.now() + (payload.expires_in ?? 900) * 1000;

  return iGM_Launcher_MsaOk({
    deviceCode: {
      flowId: flow.id,
      userCode: payload.user_code,
      verificationUri: payload.verification_uri ?? "https://microsoft.com/link",
      expiresIn: payload.expires_in ?? 900,
      interval: flow.pollInterval,
      message: payload.message ?? "",
    },
  });
}

/** 轮询设备代码：授权通过后一次性完成整条认证链 */
export async function iGM_Launcher_Msa_PollDeviceCode(
  flowId: string,
  communityUid: string,
): Promise<iGM_Launcher_BridgeResponse<{ result: iGM_Launcher_MsaFlowResult }>> {
  let flow: iGM_Launcher_MsaFlow;
  try {
    flow = iGM_Launcher_MsaRequireFlow(flowId);
  } catch (error) {
    const msaError = error as iGM_Launcher_MsaError;
    return iGM_Launcher_MsaFail(
      msaError.code ?? IGM_LAUNCHER_BRIDGE_NOT_FOUND,
      msaError.message,
    );
  }

  flow.pollCount += 1;

  if (!flow.deviceCode) {
    return iGM_Launcher_MsaOk({
      result: iGM_Launcher_MsaResult(flow, "failed", IGM_LAUNCHER_MC_FLOW_EXPIRED, "设备代码缺失"),
    });
  }

  const result = await iGM_Launcher_MsaFormRequest(IGM_LAUNCHER_MSA_ENDPOINTS.token, {
    client_id: iGM_Launcher_MsaClientId(),
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: flow.deviceCode,
  });
  const payload = (result.json ?? {}) as iGM_Launcher_MsaTokenPayload;

  if (result.status !== 200 || !payload.access_token) {
    switch (payload.error) {
      case "authorization_pending":
        return iGM_Launcher_MsaOk({ result: iGM_Launcher_MsaResult(flow, "pending") });
      case "slow_down":
        flow.pollInterval += 5;
        return iGM_Launcher_MsaOk({ result: iGM_Launcher_MsaResult(flow, "slow-down") });
      case "expired_token":
        return iGM_Launcher_MsaOk({
          result: iGM_Launcher_MsaResult(flow, "expired", IGM_LAUNCHER_MC_FLOW_EXPIRED, "设备代码已过期"),
        });
      case "authorization_declined":
        return iGM_Launcher_MsaOk({
          result: iGM_Launcher_MsaResult(flow, "failed", IGM_LAUNCHER_BRIDGE_UNAUTHORIZED, "用户拒绝了授权"),
        });
      default:
        return iGM_Launcher_MsaOk({
          result: iGM_Launcher_MsaResult(
            flow,
            "failed",
            result.status,
            payload.error_description ?? "设备代码轮询失败",
          ),
        });
    }
  }

  flow.msa = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? "",
    scope: payload.scope ?? IGM_LAUNCHER_MSA_SCOPE,
    expiresIn: payload.expires_in ?? 3600,
  };
  iGM_Launcher_MsaMarkStage(flow, "msa");

  try {
    await iGM_Launcher_MsaRunChain(flow);
  } catch (error) {
    const msaError = error as iGM_Launcher_MsaError;
    return iGM_Launcher_MsaOk({
      result: iGM_Launcher_MsaResult(flow, "failed", msaError.code, msaError.message),
    });
  }

  const chain: iGM_Launcher_MsaChainResult = {
    msa: flow.msa,
    xbox: flow.xbox!,
    xsts: flow.xsts!,
    minecraft: flow.minecraft!,
    profile: flow.profile!,
    ownsJava: flow.ownsJava,
    xuid: flow.xuid,
  };
  const binding = iGM_Launcher_MsaBuildBinding(communityUid, chain, false);
  flow.pendingBinding = binding;
  flow.pendingSecret = iGM_Launcher_MsaBuildSecret(binding, chain);

  return iGM_Launcher_MsaOk({ result: iGM_Launcher_MsaResult(flow, "done") });
}

/* ---- 浏览器授权流程（Authorization Code + PKCE 本地回调） ---- */

/** 从重定向地址中解析本地回调端口 */
function iGM_Launcher_MsaRedirectPort(redirectUri: string): number {
  try {
    const parsed = new URL(redirectUri);
    if (parsed.port) return Number.parseInt(parsed.port, 10);
  } catch {
    // 解析失败时退回默认端口
  }
  return Number.parseInt(new URL(IGM_LAUNCHER_MSA_DEFAULT_REDIRECT_URI).port, 10);
}

/**
 * 拉起外部浏览器。
 * 优先使用 Electrobun 的 Utils.openExternal（原生调用，无终端弹窗）；
 * 在非 Electrobun 运行环境（如纯 Bun 自检）下静默返回 false，由界面自行打开授权地址。
 */
async function iGM_Launcher_MsaOpenExternal(url: string): Promise<boolean> {
  try {
    const electrobun = (await import("electrobun/main")) as {
      Utils?: { openExternal?: (target: string) => boolean };
    };
    return electrobun.Utils?.openExternal?.(url) ?? false;
  } catch {
    return false;
  }
}

/** 启动本地回调服务器，等待微软回跳的授权码 */
function iGM_Launcher_MsaListenCallback(flow: iGM_Launcher_MsaFlow): void {
  const port = iGM_Launcher_MsaRedirectPort(flow.redirectUri);
  flow.codePromise = new Promise<string>((resolve, reject) => {
    flow.resolveCode = resolve;
    flow.rejectCode = reject;
  });

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");

      if (error) {
        flow.rejectCode?.(new Error(error));
      } else if (code) {
        flow.resolveCode?.(code);
      } else {
        return new Response("等待授权码…", { status: 400 });
      }

      return new Response(
        "<!doctype html><meta charset=\"utf-8\"><title>iGM Launcher</title>" +
          "<body style=\"font-family:system-ui;background:#0f1115;color:#e8eaf0;display:flex;" +
          "align-items:center;justify-content:center;height:100vh;margin:0\">" +
          "<p>授权已完成，请返回 iGM 启动器继续操作。</p></body>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    },
  });

  flow.stopServer = () => server.stop(true);
}

/** 开始浏览器授权：生成 PKCE 并返回授权地址 */
export async function iGM_Launcher_Msa_StartBrowserAuth(redirectUriOverride?: string): Promise<
  iGM_Launcher_BridgeResponse<{ browserAuth: iGM_Launcher_BrowserAuthStart }>
> {
  iGM_Launcher_MsaSweep();
  if (!iGM_Launcher_Msa_IsConfigured()) return iGM_Launcher_MsaMissingClientId();
  const redirectUri = redirectUriOverride?.trim() || iGM_Launcher_MsaRedirectUri();

  const flow: iGM_Launcher_MsaFlow = {
    id: iGM_Launcher_NewId("msaflow"),
    redirectUri,
    createdAt: Date.now(),
    expiresAt: Date.now() + IGM_LAUNCHER_MC_FLOW_TTL_MS,
    stage: "msa",
    completed: [],
    msa: null,
    xbox: null,
    xsts: null,
    minecraft: null,
    profile: null,
    ownsJava: false,
    xuid: "",
    deviceCode: "",
    pollCount: 0,
    pollInterval: 5,
    codeVerifier: "",
    stopServer: null,
    codePromise: null,
    resolveCode: null,
    rejectCode: null,
    pendingBinding: null,
    pendingSecret: null,
  };
  iGM_Launcher_MsaFlows.set(flow.id, flow);

  const verifier = iGM_Launcher_Base64Url(randomBytes(48));
  flow.codeVerifier = verifier;
  const challenge = iGM_Launcher_Base64Url(createHash("sha256").update(verifier).digest());

  const authorizeUrl = new URL(IGM_LAUNCHER_MSA_ENDPOINTS.authorize);
  authorizeUrl.searchParams.set("client_id", iGM_Launcher_MsaClientId());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", IGM_LAUNCHER_MSA_SCOPE);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "select_account");

  try {
    iGM_Launcher_MsaListenCallback(flow);
  } catch (error) {
    iGM_Launcher_MsaFlows.delete(flow.id);
    return iGM_Launcher_MsaFail(
      IGM_LAUNCHER_BRIDGE_FAILED,
      `无法监听本地回调端口：${iGM_Launcher_MsaRedirectPort(redirectUri)}`,
    );
  }

  // 拉起默认浏览器；失败时由界面提供“打开授权页”按钮兜底
  await iGM_Launcher_MsaOpenExternal(authorizeUrl.toString());

  return iGM_Launcher_MsaOk({
    browserAuth: { flowId: flow.id, authorizeUrl: authorizeUrl.toString() },
  });
}

/** 等待回调并完成整条认证链 */
export async function iGM_Launcher_Msa_CompleteBrowserAuth(
  flowId: string,
  communityUid: string,
): Promise<iGM_Launcher_BridgeResponse<{ result: iGM_Launcher_MsaFlowResult }>> {
  let flow: iGM_Launcher_MsaFlow;
  try {
    flow = iGM_Launcher_MsaRequireFlow(flowId);
  } catch (error) {
    const msaError = error as iGM_Launcher_MsaError;
    return iGM_Launcher_MsaFail(msaError.code ?? IGM_LAUNCHER_BRIDGE_NOT_FOUND, msaError.message);
  }

  if (!flow.codePromise) {
    return iGM_Launcher_MsaOk({
      result: iGM_Launcher_MsaResult(flow, "failed", IGM_LAUNCHER_BRIDGE_INVALID, "授权流程未启动"),
    });
  }

  let code = "";
  try {
    code = await Promise.race([
      flow.codePromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("等待浏览器授权超时")), IGM_LAUNCHER_MC_BROWSER_WAIT_MS),
      ),
    ]);
  } catch (error) {
    flow.stopServer?.();
    return iGM_Launcher_MsaOk({
      result: iGM_Launcher_MsaResult(
        flow,
        "expired",
        IGM_LAUNCHER_MC_FLOW_EXPIRED,
        error instanceof Error ? error.message : "等待浏览器授权失败",
      ),
    });
  } finally {
    flow.stopServer?.();
    flow.stopServer = null;
  }

  try {
    flow.msa = await iGM_Launcher_MsaExchangeCode(
      iGM_Launcher_MsaClientId(),
      code,
      flow.redirectUri,
      flow.codeVerifier,
    );
    iGM_Launcher_MsaMarkStage(flow, "msa");
    await iGM_Launcher_MsaRunChain(flow);
  } catch (error) {
    const msaError = error as iGM_Launcher_MsaError;
    return iGM_Launcher_MsaOk({
      result: iGM_Launcher_MsaResult(flow, "failed", msaError.code, msaError.message),
    });
  }

  const chain: iGM_Launcher_MsaChainResult = {
    msa: flow.msa,
    xbox: flow.xbox!,
    xsts: flow.xsts!,
    minecraft: flow.minecraft!,
    profile: flow.profile!,
    ownsJava: flow.ownsJava,
    xuid: flow.xuid,
  };
  const binding = iGM_Launcher_MsaBuildBinding(communityUid, chain, false);
  flow.pendingBinding = binding;
  flow.pendingSecret = iGM_Launcher_MsaBuildSecret(binding, chain);

  return iGM_Launcher_MsaOk({ result: iGM_Launcher_MsaResult(flow, "done") });
}

/* ---- 分步推进（界面按阶段展示进度时使用） ---- */

/**
 * 单步推进认证链。
 * 说明：设备代码轮询与浏览器回调都会一次性跑完整条链，
 * 这三个分步方法因此设计为幂等——已完成的阶段直接返回当前进度，
 * 供界面在“分步授权”交互中按阶段打勾。
 */
export async function iGM_Launcher_Msa_Advance(
  flowId: string,
  stage: iGM_Launcher_McAuthStage,
): Promise<iGM_Launcher_BridgeResponse<{ flow: iGM_Launcher_MsaFlowResult }>> {
  let flow: iGM_Launcher_MsaFlow;
  try {
    flow = iGM_Launcher_MsaRequireFlow(flowId);
  } catch (error) {
    const msaError = error as iGM_Launcher_MsaError;
    return iGM_Launcher_MsaFail(msaError.code ?? IGM_LAUNCHER_BRIDGE_NOT_FOUND, msaError.message);
  }

  try {
    if (stage === "xbox") {
      if (!flow.msa) throw new iGM_Launcher_MsaError(IGM_LAUNCHER_MC_FLOW_EXPIRED, "微软令牌尚未就绪");
      flow.xbox ??= await iGM_Launcher_MsaXboxAuthenticate(flow.msa.accessToken);
      iGM_Launcher_MsaMarkStage(flow, "xbox");
    } else if (stage === "xsts") {
      if (!flow.xbox) throw new iGM_Launcher_MsaError(IGM_LAUNCHER_MC_FLOW_EXPIRED, "Xbox 令牌尚未就绪");
      if (!flow.xsts) {
        const authorized = await iGM_Launcher_MsaXstsAuthorize(flow.xbox.token);
        flow.xsts = authorized.xsts;
        flow.xuid = authorized.xuid || flow.xuid;
      }
      iGM_Launcher_MsaMarkStage(flow, "xsts");
    } else if (stage === "minecraft") {
      if (!flow.xsts || !flow.xbox) {
        throw new iGM_Launcher_MsaError(IGM_LAUNCHER_MC_FLOW_EXPIRED, "XSTS 令牌尚未就绪");
      }
      flow.minecraft ??= await iGM_Launcher_MsaMinecraftAuthenticate(
        flow.xsts.userHash || flow.xbox.userHash,
        flow.xsts.token,
      );
      iGM_Launcher_MsaMarkStage(flow, "minecraft");
    } else {
      throw new iGM_Launcher_MsaError(IGM_LAUNCHER_BRIDGE_INVALID, "该阶段不支持单独推进");
    }
  } catch (error) {
    const msaError = error as iGM_Launcher_MsaError;
    return iGM_Launcher_MsaOk({
      flow: iGM_Launcher_MsaResult(flow, "failed", msaError.code, msaError.message),
    });
  }

  return iGM_Launcher_MsaOk({ flow: iGM_Launcher_MsaResult(flow, "pending") });
}

/** 取出流程中待绑定的记录与令牌（由绑定存储层消费），取出后清空该流程 */
export function iGM_Launcher_Msa_TakeSecret(flowId: string): {
  binding: iGM_Launcher_MCBinding;
  secret: iGM_Launcher_MCBindingSecret;
} | null {
  const flow = iGM_Launcher_MsaFlows.get(flowId);
  if (!flow || !flow.pendingBinding || !flow.pendingSecret) return null;
  const payload = { binding: flow.pendingBinding, secret: flow.pendingSecret };
  iGM_Launcher_MsaFlows.delete(flowId);
  return payload;
}

/** 丢弃流程（界面取消绑定或绑定失败回滚时调用） */
export function iGM_Launcher_Msa_DiscardFlow(flowId: string): void {
  const flow = iGM_Launcher_MsaFlows.get(flowId);
  if (!flow) return;
  flow.stopServer?.();
  flow.rejectCode?.(new Error("认证流程已被取消"));
  iGM_Launcher_MsaFlows.delete(flowId);
}

/* ---- 令牌刷新（过期时自动重建整条认证链） ---- */

/**
 * 用 refresh_token 换取新令牌并重建完整认证链。
 * 刷新令牌只在主进程内使用，返回值仅供绑定存储层落盘，绝不回传渲染进程。
 */
export async function iGM_Launcher_Msa_RefreshChain(
  refreshToken: string,
): Promise<iGM_Launcher_MsaChainResult> {
  if (!refreshToken) {
    throw new iGM_Launcher_MsaError(IGM_LAUNCHER_BRIDGE_UNAUTHORIZED, "缺少刷新令牌，请重新绑定");
  }

  const result = await iGM_Launcher_MsaFormRequest(IGM_LAUNCHER_MSA_ENDPOINTS.token, {
    client_id: iGM_Launcher_MsaClientId(),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: IGM_LAUNCHER_MSA_SCOPE,
  });
  const payload = (result.json ?? {}) as iGM_Launcher_MsaTokenPayload;
  if (result.status !== 200 || !payload.access_token) {
    throw new iGM_Launcher_MsaError(
      result.status > 0 ? result.status : IGM_LAUNCHER_BRIDGE_FAILED,
      payload.error_description ?? "刷新令牌失败，请重新绑定",
    );
  }

  const msa: iGM_Launcher_MsaToken = {
    accessToken: payload.access_token,
    // 微软会轮换 refresh_token，未返回时沿用旧值
    refreshToken: payload.refresh_token ?? refreshToken,
    scope: payload.scope ?? IGM_LAUNCHER_MSA_SCOPE,
    expiresIn: payload.expires_in ?? 3600,
  };

  const xbox = await iGM_Launcher_MsaXboxAuthenticate(msa.accessToken);
  const authorized = await iGM_Launcher_MsaXstsAuthorize(xbox.token);
  const minecraft = await iGM_Launcher_MsaMinecraftAuthenticate(
    authorized.xsts.userHash || xbox.userHash,
    authorized.xsts.token,
  );
  const profile = await iGM_Launcher_MsaFetchProfile(minecraft.accessToken);
  const ownsJava = await iGM_Launcher_MsaCheckEntitlements(minecraft.accessToken);

  return {
    msa,
    xbox,
    xsts: authorized.xsts,
    minecraft,
    profile,
    ownsJava,
    xuid: authorized.xuid,
  };
}

/** 由刷新结果重建绑定记录的非敏感字段（保留 id / communityUid / addedAt） */
export function iGM_Launcher_Msa_ApplyRefresh(
  previous: iGM_Launcher_MCBinding,
  chain: iGM_Launcher_MsaChainResult,
): iGM_Launcher_MCBinding {
  const skin = chain.profile.skins.find((item) => item.state === "ACTIVE") ?? chain.profile.skins[0];
  const cape = chain.profile.capes[0];
  return {
    ...previous,
    uuid: chain.profile.uuid,
    name: chain.profile.name,
    xuid: chain.xuid || previous.xuid,
    ownsJava: chain.ownsJava,
    refreshExpiresAt: new Date(Date.now() + IGM_LAUNCHER_MC_REFRESH_TTL_MS).toISOString(),
    accessExpiresAt: new Date(Date.now() + chain.minecraft.expiresIn * 1000).toISOString(),
    skinUrl: skin?.url ?? "",
    capeUrl: cape?.url ?? "",
    refreshedAt: new Date().toISOString(),
  };
}

/** 由刷新结果构造新的密钥载荷 */
export function iGM_Launcher_Msa_BuildRefreshedSecret(
  binding: iGM_Launcher_MCBinding,
  chain: iGM_Launcher_MsaChainResult,
): iGM_Launcher_MCBindingSecret {
  return iGM_Launcher_MsaBuildSecret(binding, chain);
}

// 导出 //
export default iGM_Launcher_Msa_IsConfigured;