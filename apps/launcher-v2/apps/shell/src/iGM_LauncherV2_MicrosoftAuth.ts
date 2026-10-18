/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_MicrosoftAuth.ts
 * 所属层：桌面外壳 / 正版账号服务层
 * 路由：全局
 * 模块：iGM_LauncherV2_MicrosoftAuth
 * 作用：微软正版账号验证（OAuth 2.0 设备代码流 → Xbox Live → XSTS → Minecraft Services）
 * 内容：与 iGCraftLit 社区账号彻底解绑，游客（未登录社区账号）亦可直接发起验证；
 *       向微软申请设备代码并回推界面展示
 *       user_code 与验证链接，后台按 interval 轮询令牌端点；授权成功后依次完成
 *       Xbox Live 用户认证、XSTS 授权、Minecraft Services 登录，拉取正版档案取得
 *       UUID / 用户名并生成头像地址；绑定结果落盘 microsoft.json（0600），
 *       界面仅接收去除令牌的公开视图
 * 说明：设备代码流不使用 redirect_uri，故无需在 Azure 注册回调地址，也不占用本地端口；
 *       微软 client_id 为公开客户端标识（随包分发，非机密）；
 *       刷新令牌与 Minecraft 访问令牌属敏感凭据，只落盘本地，绝不下发界面、不写入日志正文
 */

// 导入依赖 //
import { rm } from "node:fs/promises";
import { iGM_LauncherV2_OpenExternal } from "./iGM_LauncherV2_CommunityAuth";
import {
  IGM_LAUNCHERV2_MSA_CLIENT_ID,
  IGM_LAUNCHERV2_MSA_DEVICE_CODE_URL,
  IGM_LAUNCHERV2_MSA_DEVICE_EXPIRES_SECONDS,
  IGM_LAUNCHERV2_MSA_DEVICE_GRANT,
  IGM_LAUNCHERV2_MSA_FALLBACK_VERIFICATION_URI,
  IGM_LAUNCHERV2_MSA_POLL_INTERVAL_SECONDS,
  IGM_LAUNCHERV2_MSA_SCOPE,
  IGM_LAUNCHERV2_MSA_TOKEN_URL,
} from "./iGM_LauncherV2_Constants";
import type {
  iGM_LauncherV2_InboundMessage,
  iGM_LauncherV2_MsaAccount,
  iGM_LauncherV2_MsaDeviceCode,
} from "./iGM_LauncherV2_Ipc";
import {
  iGM_LauncherV2_CurrentAccountGet,
  iGM_LauncherV2_CurrentAccountSet,
} from "./iGM_LauncherV2_Paths";
import {
  iGM_LauncherV2_JsonRead,
  iGM_LauncherV2_JsonWrite,
  iGM_LauncherV2_MicrosoftStorePath,
} from "./iGM_LauncherV2_Store";

// 类型定义 //

/** 状态回推函数（由主进程注入，绑定到主窗口） */
export type iGM_LauncherV2_MsaNotifier = (message: iGM_LauncherV2_InboundMessage) => void;

/** 进行中的设备代码授权流 */
interface iGM_LauncherV2_MsaFlow {
  /** 设备代码：轮询令牌端点时使用的凭据 */
  deviceCode: string;
  /** 用户代码：用户在验证页输入的短码 */
  userCode: string;
  /** 验证链接：浏览器打开后输入用户代码 */
  verificationUri: string;
  /** 当前轮询间隔（秒），收到 slow_down 时递增 */
  interval: number;
  /** 设备代码到期时间戳（毫秒） */
  expiresAt: number;
  /** 是否已被取消 */
  cancelled: boolean;
  /** 轮询等待计时器句柄 */
  timer: ReturnType<typeof setTimeout> | null;
  /** 等待唤醒回调（取消时立即唤醒轮询循环，避免空转等待） */
  wake: (() => void) | null;
}

/** microsoft.json 文件结构 */
interface iGM_LauncherV2_MicrosoftFilePayload {
  version: number;
  account: iGM_LauncherV2_MsaAccount;
  /** 微软刷新令牌（敏感，仅落盘） */
  refreshToken: string;
  /** Minecraft 访问令牌（敏感，仅落盘，供启动正版游戏使用） */
  minecraftAccessToken: string;
  savedAt: string;
}

/** 设备代码申请响应 */
interface iGM_LauncherV2_MsaDeviceCodeResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
}

/** 微软令牌端点响应 */
interface iGM_LauncherV2_MsaTokenResponse {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

/** Xbox Live / XSTS 认证响应 */
interface iGM_LauncherV2_XblResponse {
  Token?: string;
  DisplayClaims?: { xui?: Array<{ uhs?: string }> };
  XErr?: number;
}

/** Minecraft Services 登录响应 */
interface iGM_LauncherV2_McLoginResponse {
  access_token?: string;
  error?: string;
  errorMessage?: string;
}

/** Minecraft 档案响应 */
interface iGM_LauncherV2_McProfileResponse {
  id?: string;
  name?: string;
}

// 核心逻辑 //

/** Xbox Live / XSTS / Minecraft 端点 */
const IGM_LAUNCHERV2_XBL_AUTH_URL = "https://user.auth.xboxlive.com/user/authenticate";
const IGM_LAUNCHERV2_XSTS_AUTH_URL = "https://xsts.auth.xboxlive.com/xsts/authorize";
const IGM_LAUNCHERV2_MC_LOGIN_URL =
  "https://api.minecraftservices.com/authentication/login_with_xbox";
const IGM_LAUNCHERV2_MC_PROFILE_URL = "https://api.minecraftservices.com/minecraft/profile";

/** microsoft.json 结构版本（v2 起记录 Minecraft 访问令牌） */
const IGM_LAUNCHERV2_MICROSOFT_VERSION = 2;

/** 当前授权流（同一时刻仅允许一个） */
let iGM_LauncherV2_MsaFlow: iGM_LauncherV2_MsaFlow | null = null;

/** 当前绑定的正版账号（启动时由落盘数据恢复） */
let iGM_LauncherV2_MsaCurrent: iGM_LauncherV2_MsaAccount | null = null;

/** 最近一次提示信息，供界面展示 */
let iGM_LauncherV2_MsaMessage = "";

/** 32 位十六进制 UUID 文本格式化为标准 8-4-4-4-12 */
function iGM_LauncherV2_MsaFormatUuid(raw: string): string {
  const hex = raw.replace(/-/g, "").toLowerCase();
  if (hex.length !== 32) return raw;
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** 正版头像地址（Minotar 以标准 UUID 渲染皮肤头像） */
function iGM_LauncherV2_MsaAvatar(uuid: string): string {
  return `https://minotar.net/helm/${uuid}/128.png`;
}

/** 回推微软账号状态 */
function iGM_LauncherV2_MsaPush(
  notify: iGM_LauncherV2_MsaNotifier,
  state: "logged-out" | "pending" | "logged-in",
  account: iGM_LauncherV2_MsaAccount | null,
  message = "",
): void {
  notify({ type: "msa:state", state, account, message });
}

/** 回推设备代码展示信息（device 为 null 表示清除） */
function iGM_LauncherV2_MsaPushDevice(
  notify: iGM_LauncherV2_MsaNotifier,
  device: iGM_LauncherV2_MsaDeviceCode | null,
): void {
  notify({ type: "msa:device-code", device });
}

/** 轮询等待：被取消时立即唤醒，不必等满整段间隔 */
function iGM_LauncherV2_MsaSleep(flow: iGM_LauncherV2_MsaFlow, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    flow.wake = resolve;
    flow.timer = setTimeout(() => {
      flow.timer = null;
      flow.wake = null;
      resolve();
    }, ms);
  });
}

/** 终止进行中的授权流：清计时器并唤醒轮询循环；返回是否有流程被终止 */
function iGM_LauncherV2_MsaAbortFlow(): boolean {
  const flow = iGM_LauncherV2_MsaFlow;
  if (!flow) return false;
  flow.cancelled = true;
  if (flow.timer) {
    clearTimeout(flow.timer);
    flow.timer = null;
  }
  const wake = flow.wake;
  flow.wake = null;
  iGM_LauncherV2_MsaFlow = null;
  wake?.();
  return true;
}

/** 申请设备代码（表单编码 POST，公开客户端仅带 client_id + scope） */
async function iGM_LauncherV2_MsaRequestDeviceCode(): Promise<iGM_LauncherV2_MsaDeviceCodeResponse> {
  const response = await fetch(IGM_LAUNCHERV2_MSA_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: IGM_LAUNCHERV2_MSA_CLIENT_ID,
      scope: IGM_LAUNCHERV2_MSA_SCOPE,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as iGM_LauncherV2_MsaDeviceCodeResponse;
  if (!response.ok || !payload.device_code || !payload.user_code) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `微软设备代码申请失败（HTTP ${response.status}）`,
    );
  }
  return payload;
}

/** 令牌端点表单请求（成功或失败均返回解析结果，由调用方判定错误码） */
async function iGM_LauncherV2_MsaPostToken(
  form: Record<string, string>,
): Promise<iGM_LauncherV2_MsaTokenResponse> {
  const response = await fetch(IGM_LAUNCHERV2_MSA_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(form),
  });
  return (await response.json().catch(() => ({}))) as iGM_LauncherV2_MsaTokenResponse;
}

/**
 * 轮询令牌端点直至授权完成。
 * 约定错误码：authorization_pending 继续轮询；
 * slow_down 将间隔加 5 秒；expired_token / authorization_declined 直接失败。
 */
async function iGM_LauncherV2_MsaPoll(
  flow: iGM_LauncherV2_MsaFlow,
): Promise<iGM_LauncherV2_MsaTokenResponse> {
  while (!flow.cancelled) {
    if (Date.now() >= flow.expiresAt) throw new Error("设备代码已过期，请重新发起验证");
    await iGM_LauncherV2_MsaSleep(flow, flow.interval * 1000);
    if (flow.cancelled) break;

    const payload = await iGM_LauncherV2_MsaPostToken({
      client_id: IGM_LAUNCHERV2_MSA_CLIENT_ID,
      grant_type: IGM_LAUNCHERV2_MSA_DEVICE_GRANT,
      device_code: flow.deviceCode,
    });

    if (payload.access_token) return payload;

    const error = payload.error ?? "";
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      flow.interval += 5;
      continue;
    }
    if (error === "expired_token") throw new Error("设备代码已过期，请重新发起验证");
    if (error === "authorization_declined") throw new Error("微软账号授权已被拒绝");
    throw new Error(payload.error_description || error || "微软授权失败");
  }
  throw new Error("已取消验证");
}

/** Xbox Live 用户认证：RpsTicket 为 d=<微软访问令牌> */
async function iGM_LauncherV2_MsaXboxLive(accessToken: string): Promise<iGM_LauncherV2_XblResponse> {
  const response = await fetch(IGM_LAUNCHERV2_XBL_AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${accessToken}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as iGM_LauncherV2_XblResponse;
  if (!response.ok || !payload.Token) {
    throw new Error(`Xbox Live 认证失败（HTTP ${response.status}）`);
  }
  return payload;
}

/** XSTS 授权：取得可用于 Minecraft 的服务令牌 */
async function iGM_LauncherV2_MsaXsts(userToken: string): Promise<iGM_LauncherV2_XblResponse> {
  const response = await fetch(IGM_LAUNCHERV2_XSTS_AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      Properties: { SandboxId: "RETAIL", UserTokens: [userToken] },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT",
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as iGM_LauncherV2_XblResponse;

  if (!response.ok || !payload.Token) {
    // XErr 为 Xbox 侧的语义化错误码，转换为可读提示
    const hints: Record<number, string> = {
      2148916233: "该微软账号尚未创建 Xbox 档案，请先登录 Xbox 完成创建",
      2148916235: "该微软账号所在地区不支持 Xbox Live",
      2148916236: "该微软账号需要完成成人验证",
      2148916237: "该微软账号受家庭安全限制",
      2148916238: "该账号为未成年人账号，需由家庭组织者添加到家庭组",
    };
    const hint = payload.XErr ? hints[payload.XErr] : undefined;
    throw new Error(hint ?? `XSTS 授权失败（HTTP ${response.status}）`);
  }
  return payload;
}

/** Minecraft Services 登录：identityToken 形如 XBL3.0 x=<uhs>;<xsts> */
async function iGM_LauncherV2_MsaMinecraftLogin(
  uhs: string,
  xstsToken: string,
): Promise<string> {
  const response = await fetch(IGM_LAUNCHERV2_MC_LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` }),
  });
  const payload = (await response.json().catch(() => ({}))) as iGM_LauncherV2_McLoginResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.errorMessage || payload.error || `Minecraft 登录失败（HTTP ${response.status}）`,
    );
  }
  return payload.access_token;
}

/** 拉取正版档案：UUID 与游戏名 */
async function iGM_LauncherV2_MsaProfile(
  minecraftToken: string,
): Promise<iGM_LauncherV2_MsaAccount> {
  const response = await fetch(IGM_LAUNCHERV2_MC_PROFILE_URL, {
    headers: { authorization: `Bearer ${minecraftToken}`, accept: "application/json" },
  });
  if (response.status === 404) {
    throw new Error("该微软账号未拥有 Minecraft Java 版");
  }
  const payload = (await response.json().catch(() => ({}))) as iGM_LauncherV2_McProfileResponse;
  if (!response.ok || !payload.id || !payload.name) {
    throw new Error(`正版档案获取失败（HTTP ${response.status}）`);
  }
  const uuid = iGM_LauncherV2_MsaFormatUuid(payload.id);
  return { uuid, name: payload.name, avatar: iGM_LauncherV2_MsaAvatar(uuid) };
}

/** 读取落盘的正版账号 */
async function iGM_LauncherV2_MsaLoad(): Promise<iGM_LauncherV2_MicrosoftFilePayload | null> {
  return iGM_LauncherV2_JsonRead<iGM_LauncherV2_MicrosoftFilePayload>(
    iGM_LauncherV2_MicrosoftStorePath(),
  );
}

/** 启动时恢复已绑定的正版账号 */
export async function iGM_LauncherV2_MsaRestore(): Promise<iGM_LauncherV2_MsaAccount | null> {
  const payload = await iGM_LauncherV2_MsaLoad().catch(() => null);
  if (!payload?.account?.uuid) return null;
  iGM_LauncherV2_MsaCurrent = payload.account;
  return payload.account;
}

/** 当前已绑定的正版账号（未绑定时返回 null）；供皮肤库取正版档案纹理前判断前置条件 */
export function iGM_LauncherV2_MsaCurrentAccount(): iGM_LauncherV2_MsaAccount | null {
  return iGM_LauncherV2_MsaCurrent;
}

/** 当前状态快照（供界面主动查询） */
export async function iGM_LauncherV2_MsaSnapshot(): Promise<iGM_LauncherV2_InboundMessage> {
  if (!iGM_LauncherV2_MsaCurrent) await iGM_LauncherV2_MsaRestore();
  if (iGM_LauncherV2_MsaCurrent) {
    return { type: "msa:state", state: "logged-in", account: iGM_LauncherV2_MsaCurrent, message: "" };
  }
  return {
    type: "msa:state",
    state: "logged-out",
    account: null,
    message: iGM_LauncherV2_MsaMessage,
  };
}

/**
 * 验证并绑定微软正版账号。
 * 无前置条件：游客（未登录社区账号）同样可发起验证，凭据独立落盘本地；
 * 全流程：申请设备代码并回推界面 → 后台轮询令牌 →
 * 拿到微软令牌后走 Xbox Live → XSTS → Minecraft 登录 → 拉取档案 → 落盘。
 */
export async function iGM_LauncherV2_MsaLogin(
  notify: iGM_LauncherV2_MsaNotifier,
): Promise<void> {
  if (iGM_LauncherV2_MsaFlow) {
    iGM_LauncherV2_MsaPush(
      notify,
      "pending",
      iGM_LauncherV2_MsaCurrent,
      "已有一个微软验证流程进行中，请在浏览器中完成授权",
    );
    return;
  }

  const flow: iGM_LauncherV2_MsaFlow = {
    deviceCode: "",
    userCode: "",
    verificationUri: "",
    interval: IGM_LAUNCHERV2_MSA_POLL_INTERVAL_SECONDS,
    expiresAt: 0,
    cancelled: false,
    timer: null,
    wake: null,
  };
  iGM_LauncherV2_MsaFlow = flow;
  iGM_LauncherV2_MsaMessage = "";
  iGM_LauncherV2_MsaPush(notify, "pending", iGM_LauncherV2_MsaCurrent);

  let tokens: iGM_LauncherV2_MsaTokenResponse;
  try {
    const device = await iGM_LauncherV2_MsaRequestDeviceCode();
    if (flow.cancelled) return;

    flow.deviceCode = device.device_code ?? "";
    flow.userCode = device.user_code ?? "";
    flow.verificationUri = device.verification_uri || IGM_LAUNCHERV2_MSA_FALLBACK_VERIFICATION_URI;
    flow.interval =
      device.interval && device.interval > 0
        ? device.interval
        : IGM_LAUNCHERV2_MSA_POLL_INTERVAL_SECONDS;
    flow.expiresAt =
      Date.now() +
      (device.expires_in && device.expires_in > 0
        ? device.expires_in
        : IGM_LAUNCHERV2_MSA_DEVICE_EXPIRES_SECONDS) *
        1000;

    iGM_LauncherV2_MsaPushDevice(notify, {
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      expiresIn: Math.round((flow.expiresAt - Date.now()) / 1000),
      interval: flow.interval,
    });

    tokens = await iGM_LauncherV2_MsaPoll(flow);
  } catch (error) {
    // 取消分支：状态已由 MsaCancel 回推，此处不再重复提示
    if (flow.cancelled) return;
    iGM_LauncherV2_MsaFlow = null;
    iGM_LauncherV2_MsaPushDevice(notify, null);
    iGM_LauncherV2_MsaMessage = error instanceof Error ? error.message : "微软授权失败";
    iGM_LauncherV2_MsaPush(
      notify,
      iGM_LauncherV2_MsaCurrent ? "logged-in" : "logged-out",
      iGM_LauncherV2_MsaCurrent,
      iGM_LauncherV2_MsaMessage,
    );
    return;
  }

  try {
    const xbox = await iGM_LauncherV2_MsaXboxLive(tokens.access_token ?? "");
    const xsts = await iGM_LauncherV2_MsaXsts(xbox.Token ?? "");
    const uhs = xsts.DisplayClaims?.xui?.[0]?.uhs ?? "";
    if (!uhs) throw new Error("XSTS 授权未返回用户标识");

    const minecraftToken = await iGM_LauncherV2_MsaMinecraftLogin(uhs, xsts.Token ?? "");
    const account = await iGM_LauncherV2_MsaProfile(minecraftToken);

    const payload: iGM_LauncherV2_MicrosoftFilePayload = {
      version: IGM_LAUNCHERV2_MICROSOFT_VERSION,
      account,
      refreshToken: tokens.refresh_token ?? "",
      minecraftAccessToken: minecraftToken,
      savedAt: new Date().toISOString(),
    };
    await iGM_LauncherV2_JsonWrite(iGM_LauncherV2_MicrosoftStorePath(), payload);

    iGM_LauncherV2_MsaCurrent = account;
    iGM_LauncherV2_MsaMessage = "";
    // 绑定成功即把全局当前账号切到该正版账号，用户可直接点启动游戏
    await iGM_LauncherV2_CurrentAccountSet("msa", account.uuid);
    console.log(`[iGM CraftCeon Launcher] 微软正版验证成功：${account.name}（${account.uuid}）`);
    iGM_LauncherV2_MsaPush(notify, "logged-in", account);
  } catch (error) {
    iGM_LauncherV2_MsaMessage = error instanceof Error ? error.message : "微软正版验证失败";
    console.warn("[iGM CraftCeon Launcher] 微软正版验证失败：", iGM_LauncherV2_MsaMessage);
    // 若此前已绑定账号，则维持已登录状态并保留该账号，否则按未登录回推失败原因；
    // 状态与账号字段必须一致，界面才能既显示既有账号又提示本次失败
    iGM_LauncherV2_MsaPush(
      notify,
      iGM_LauncherV2_MsaCurrent ? "logged-in" : "logged-out",
      iGM_LauncherV2_MsaCurrent,
      iGM_LauncherV2_MsaMessage,
    );
  } finally {
    iGM_LauncherV2_MsaFlow = null;
    iGM_LauncherV2_MsaPushDevice(notify, null);
  }
}

/** 取消进行中的验证：清计时器、清除界面设备代码展示并回推当前状态 */
export function iGM_LauncherV2_MsaCancel(notify: iGM_LauncherV2_MsaNotifier): void {
  iGM_LauncherV2_MsaAbortFlow();
  iGM_LauncherV2_MsaMessage = "";
  iGM_LauncherV2_MsaPushDevice(notify, null);
  iGM_LauncherV2_MsaPush(
    notify,
    iGM_LauncherV2_MsaCurrent ? "logged-in" : "logged-out",
    iGM_LauncherV2_MsaCurrent,
  );
}

/** 用系统默认浏览器打开当前验证链接（无进行中流程时回退到微软通用验证页） */
export async function iGM_LauncherV2_MsaOpenVerification(): Promise<boolean> {
  const uri =
    iGM_LauncherV2_MsaFlow?.verificationUri || IGM_LAUNCHERV2_MSA_FALLBACK_VERIFICATION_URI;
  return iGM_LauncherV2_OpenExternal(uri);
}

/** 解除绑定：终止进行中的流程，清除落盘文件与内存视图 */
export async function iGM_LauncherV2_MsaLogout(
  notify: iGM_LauncherV2_MsaNotifier,
): Promise<void> {
  iGM_LauncherV2_MsaAbortFlow();

  // 解绑前记录该正版账号的 UUID：若它正是全局当前账号，需回落为离线账号
  const removedUuid = iGM_LauncherV2_MsaCurrent?.uuid ?? "";
  iGM_LauncherV2_MsaCurrent = null;
  iGM_LauncherV2_MsaMessage = "";
  await rm(iGM_LauncherV2_MicrosoftStorePath(), { force: true }).catch(() => undefined);

  const active = iGM_LauncherV2_CurrentAccountGet();
  if (active.kind === "msa" && (!removedUuid || active.id === removedUuid)) {
    await iGM_LauncherV2_CurrentAccountSet("", "");
  }

  iGM_LauncherV2_MsaPushDevice(notify, null);
  iGM_LauncherV2_MsaPush(notify, "logged-out", null);
}

// 导出 //
export default iGM_LauncherV2_MsaLogin;
