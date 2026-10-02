/**
 * 文件路径：apps/shell/src/iGM_Launcher_Bridge.ts
 * 所属层：桌面外壳 / 桥接层
 * 路由：全局（不对外暴露 URL，仅经 IPC 被界面调用）
 * 模块：iGM_Launcher_Bridge
 * 作用：统一封装三类能力——Zig 核心调用（bun:ffi）、HTTP 请求、本地文件读写；
 *       对外只暴露 iGM_Launcher_Bridge_Call，统一返回 { success, code, message, data }
 * 内容：实例管理（增删改查）、Java 运行时管理（列表 / 检测 / 添加 / 移除 / 测试 / 下载占位）、
 *       账户会话（当前 / 登录 / 退出 / 同步）；数据以 JSON 落盘于 D:/IGLAUNCHER/data；
 *       模块三 mc:* 正版绑定分支（微软认证链全程：MSA → Xbox Live → XSTS →
 *       Minecraft Services → 玩家档案与拥有权校验）；
 *       模块五 minecraft:* 离线游戏分支（本机游戏目录扫描 / 版本 json 解析 / 实例导入 / 版本库同步）；
 *       模块七 minecraft:download-* 真实下载分支与 minecraft:pick-dir 系统目录选择器
 *       （前置目录可放在任意磁盘，最终目录按规则固定为其下的 .minecraft）；
 *       模块八 instance:launch / instance:launch-status 启动分支
 *       （离线模式用离线角色身份、正版模式用已绑定微软账号身份拉真实 Java 进程，
 *        并回写上次游玩时间）；
 *       模块九 Java 真实检测分支（java:detect / java:test / java:add 扫描本机
 *       文件系统并运行 -version 探测，可用性一律以真实结果为准）；
 *       模块二十 thirdParty:* 第三方资源分支（Modrinth / Fabric 资源搜索、详情与
 *       下载任务转发，全部走主站 /G_ThirdParty 接口，任务由主站后端统一管理），
 *       以及 shell:open-path 在系统文件管理器中打开下载文件所在目录
 *
 * 说明：模块二只实现“界面可用”的本地持久化与占位业务逻辑，
 *       真实版本清单、下载与游戏启动留待后续模块；
 *       模块九已把 Java 检测与探测从占位改为真实行为：不再登记硬编码的幽灵路径，
 *       并把真实扫描结果交给启动引擎，避免回退到 PATH 中的字面量 "java" 而报原生错误。
 *       账户登录与同步已接入主站真实接口（Bun 主进程直连，无跨域限制），
 *       iGMUid 等用户数据取自主站返回值，与官网保持一致。
 *       mc:* 分支走完整认证链，令牌只留在主进程，
 *       界面拿到的仅是绑定摘要与档案信息。
 *       模块五的 minecraft:* 分支：扫描与导入只读原游戏目录，实例目录直接指向原
 *       .minecraft 根目录、不复制任何文件；版本库同步失败时保留本地缓存。
 *       Zig 侧对应契约：iGM_Launcher_ScanMinecraftDirs / iGM_Launcher_ParseVersionJson /
 *       iGM_Launcher_ImportInstance / iGM_Launcher_SyncVersionLibrary。
 *       模块八的 instance:* 分支只做编排：读取实例 / Java / 账户与生效根目录后交给
 *       iGM_Launcher_Launch 启动引擎，启动失败如实透传错误码与原因，绝不伪造成功。
 */

// 导入依赖 //
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, normalize } from "node:path";
import { Utils } from "electrobun/main";
import {
  IGM_LAUNCHER_API_BASE,
  IGM_LAUNCHER_API_LOGIN_PATH,
  IGM_LAUNCHER_API_MC_VERSION_FILES_PATH,
  IGM_LAUNCHER_API_MC_VERSIONS_PATH,
  IGM_LAUNCHER_API_LOGOUT_PATH,
  IGM_LAUNCHER_API_ME_PATH,
  IGM_LAUNCHER_API_SESSION_COOKIE,
  IGM_LAUNCHER_API_THIRD_PARTY_PATH,
  IGM_LAUNCHER_API_THIRD_PARTY_TIMEOUT_MS,
  IGM_LAUNCHER_API_TIMEOUT_MS,
  IGM_LAUNCHER_BRIDGE_FAILED,
  IGM_LAUNCHER_BRIDGE_INVALID,
  IGM_LAUNCHER_BRIDGE_NOT_FOUND,
  IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
  IGM_LAUNCHER_BRIDGE_OK,
  IGM_LAUNCHER_BRIDGE_UNAUTHORIZED,
  IGM_LAUNCHER_BRIDGE_UNREACHABLE,
  IGM_LAUNCHER_DATA_ROOT,
  IGM_LAUNCHER_INSTANCE_JVM_ARGS_DEFAULT,
  IGM_LAUNCHER_INSTANCE_MEMORY_DEFAULT,
  IGM_LAUNCHER_INSTANCE_WINDOW_DEFAULT,
  IGM_LAUNCHER_INSTANCES_FILE,
  IGM_INSTALLER_CONFIG_FILE,
  IGM_LAUNCHER_JAVA_FILE,
  IGM_LAUNCHER_MC_FLOW_EXPIRED,
  IGM_LAUNCHER_OFFLINE_DEFAULT_NAME,
  IGM_LAUNCHER_SESSION_FILE,
  IGM_LAUNCHER_THIRD_PARTY_INSTANCE_SUBDIRS,
  IGM_LAUNCHER_THIRD_PARTY_PAGE_SIZE,
  IGM_LAUNCHER_VERSION_LIBRARY_PAGE_SIZE,
  iGM_Launcher_AggregateInstalledLoaders,
  iGM_Launcher_BuildGameDir,
  iGM_Launcher_BuildInstanceRecord,
  iGM_Launcher_CheckInstanceName,
  iGM_Launcher_CreateGuestSession,
  iGM_Launcher_MakeOfflineUuid,
  iGM_Launcher_MapSiteUser,
  iGM_Launcher_McRootOfParent,
  iGM_Launcher_NewId,
  iGM_Launcher_NormalizeVersionType,
  type iGM_Launcher_AccountSession,
  type iGM_Launcher_DownloadProgress,
  type iGM_Launcher_GameDir,
  type iGM_Launcher_GameDirScanResult,
  type iGM_Launcher_InstalledLoader,
  type iGM_Launcher_InstallerConfig,
  type iGM_Launcher_InstanceNameCheck,
  type iGM_Launcher_RootDirInfo,
  type iGM_Launcher_ScannedVersion,
  type iGM_Launcher_VersionLibrary,
  type iGM_Launcher_VersionLibraryEntry,
  type iGM_Launcher_BridgeMethod,
  type iGM_Launcher_BridgeParams,
  type iGM_Launcher_BridgeResponse,
  type iGM_Launcher_InstanceRecord,
  type iGM_Launcher_InstanceResourceFile,
  type iGM_Launcher_InstanceResourceGroup,
  type iGM_Launcher_JavaRuntime,
  type iGM_Launcher_LocalData,
  type iGM_Launcher_MCBinding,
  type iGM_Launcher_MCBindingSecret,
  type iGM_Launcher_LaunchMode,
  type iGM_Launcher_SiteEnvelope,
  type iGM_Launcher_SiteUser,
  type iGM_Launcher_ThirdPartyTask,
  type iGM_Launcher_VersionFilesManifest,
  type iGM_Launcher_VersionType,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_GameDir_Add,
  iGM_Launcher_GameDir_EnsureInstanceDir,
  iGM_Launcher_GameDir_InstalledVersions,
  iGM_Launcher_GameDir_InstalledVersionsOf,
  iGM_Launcher_GameDir_Load,
  iGM_Launcher_GameDir_ParseVersionJson,
  iGM_Launcher_GameDir_Remove,
  iGM_Launcher_GameDir_ResolveRootDir,
  iGM_Launcher_GameDir_ScanAll,
  iGM_Launcher_GameDir_SetDefault,
  iGM_Launcher_VersionLibrary_Load,
  iGM_Launcher_VersionLibrary_Save,
} from "./iGM_Launcher_GameDir";
import { iGM_Launcher_Core_Status } from "./iGM_Launcher_CoreBindings";
import {
  iGM_Launcher_Download_Cancel,
  iGM_Launcher_Download_LoaderVersions,
  iGM_Launcher_Download_Start,
  iGM_Launcher_Download_Status,
} from "./iGM_Launcher_Download";
import {
  iGM_Launcher_SDK_Cancel,
  iGM_Launcher_SDK_IsAvailable,
  iGM_Launcher_SDK_Pause,
  iGM_Launcher_SDK_Release,
  iGM_Launcher_SDK_Resume,
  iGM_Launcher_SDK_Retry,
  iGM_Launcher_SDK_Start,
  iGM_Launcher_SDK_StartUrl,
  iGM_Launcher_SDK_Status,
  type iGM_Launcher_SDK_TaskSnapshot,
} from "./iGM_Launcher_SDK";
import {
  IGM_LAUNCHER_JAVA_VENDOR_LABELS,
  iGM_Launcher_Java_Probe,
  iGM_Launcher_Java_Scan,
} from "./iGM_Launcher_Java";
import {
  iGM_Launcher_Launch_Start,
  iGM_Launcher_Launch_Status,
  type iGM_Launcher_LaunchOfficialIdentity,
} from "./iGM_Launcher_Launch";
import {
  iGM_Launcher_Binding_Add,
  iGM_Launcher_Binding_GetSecret,
  iGM_Launcher_Binding_List,
  iGM_Launcher_Binding_Remove,
  iGM_Launcher_Binding_SetDefault,
  iGM_Launcher_Binding_Update,
} from "./iGM_Launcher_BindingStore";
import {
  iGM_Launcher_Msa_Advance,
  iGM_Launcher_Msa_ApplyRefresh,
  iGM_Launcher_Msa_BuildRefreshedSecret,
  iGM_Launcher_MsaCheckEntitlements,
  iGM_Launcher_Msa_CompleteBrowserAuth,
  iGM_Launcher_MsaFetchProfile,
  iGM_Launcher_Msa_PollDeviceCode,
  iGM_Launcher_Msa_RefreshChain,
  iGM_Launcher_Msa_StartBrowserAuth,
  iGM_Launcher_Msa_StartDeviceCode,
  iGM_Launcher_Msa_TakeSecret,
  iGM_Launcher_Msa_ResolveClientId,
  iGM_Launcher_MsaError,
} from "./iGM_Launcher_MsaAuth";

// 类型定义 //
/** 落盘结构：实例文件 */
interface iGM_Launcher_InstancesFile {
  instances: iGM_Launcher_InstanceRecord[];
}

/** 落盘结构：Java 文件 */
interface iGM_Launcher_JavaFile {
  javas: iGM_Launcher_JavaRuntime[];
  defaultJavaId: string | null;
}

// 核心逻辑 //

/* ---- 通用工具 ---- */

/** 成功响应 */
function iGM_Launcher_Ok<T>(data: T, message = "ok"): iGM_Launcher_BridgeResponse<T> {
  return { success: true, code: IGM_LAUNCHER_BRIDGE_OK, message, data };
}

/** 失败响应 */
function iGM_Launcher_Fail<T = null>(
  code: number,
  message: string,
): iGM_Launcher_BridgeResponse<T> {
  return { success: false, code, message, data: null };
}

/* ---- 本地文件读写 ---- */

/** 读取 JSON 文件，缺失或解析失败时回退默认值 */
async function iGM_Launcher_ReadJson<T>(relativePath: string, fallback: T): Promise<T> {
  const absolutePath = join(IGM_LAUNCHER_DATA_ROOT, relativePath);
  if (!existsSync(absolutePath)) return fallback;
  try {
    const raw = await readFile(absolutePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[iGM_Launcher_Bridge] 读取失败，使用默认值：${absolutePath}`, error);
    return fallback;
  }
}

/** 写入 JSON 文件，目录不存在时自动创建 */
async function iGM_Launcher_WriteJson(relativePath: string, value: unknown): Promise<void> {
  const absolutePath = join(IGM_LAUNCHER_DATA_ROOT, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/* ---- 初始数据 ---- */

/** 读取实例列表 */
async function iGM_Launcher_LoadInstances(): Promise<iGM_Launcher_InstanceRecord[]> {
  const file = await iGM_Launcher_ReadJson<iGM_Launcher_InstancesFile>(
    IGM_LAUNCHER_INSTANCES_FILE,
    { instances: [] },
  );
  return Array.isArray(file.instances) ? file.instances : [];
}

/** 读取 Java 列表与默认 Java */
async function iGM_Launcher_LoadJava(): Promise<iGM_Launcher_JavaFile> {
  const file = await iGM_Launcher_ReadJson<iGM_Launcher_JavaFile>(IGM_LAUNCHER_JAVA_FILE, {
    javas: [],
    defaultJavaId: null,
  });
  return {
    javas: Array.isArray(file.javas) ? file.javas : [],
    defaultJavaId: file.defaultJavaId ?? null,
  };
}

/** 读取账户会话 */
async function iGM_Launcher_LoadAccount(): Promise<iGM_Launcher_AccountSession> {
  const account = await iGM_Launcher_ReadJson<iGM_Launcher_AccountSession>(
    IGM_LAUNCHER_SESSION_FILE,
    iGM_Launcher_CreateGuestSession(),
  );
  // 离线角色 UUID 首次生成后立即落盘，保证同一台机器重启后离线身份不变
  if (!account.offlineUuid) {
    account.offlineUuid = iGM_Launcher_MakeOfflineUuid();
    account.offlineName = account.offlineName || IGM_LAUNCHER_OFFLINE_DEFAULT_NAME;
    await iGM_Launcher_SaveAccount(account);
  }
  return account;
}

/** 保存账户会话 */
async function iGM_Launcher_SaveAccount(account: iGM_Launcher_AccountSession): Promise<void> {
  await iGM_Launcher_WriteJson(IGM_LAUNCHER_SESSION_FILE, account);
}

/* ---- 主站 API 请求（登录 / 账户同步） ---- */

/** 主站认证响应数据形状（登录与 /me 均返回 { user }） */
type iGM_Launcher_SiteUserData = { user: iGM_Launcher_SiteUser };

/** 主站 API 调用结果 */
interface iGM_Launcher_ApiResult<T> {
  /** 是否拿到 HTTP 响应，false 表示网络异常或超时 */
  reached: boolean;
  /** HTTP 状态码，未拿到响应时为 0 */
  status: number;
  /** 解析出的统一响应包，非 JSON 响应时为 null */
  envelope: iGM_Launcher_SiteEnvelope<T> | null;
  /** Set-Cookie 中提取的会话 Cookie 值，无则为空字符串 */
  cookie: string;
}

/** 主站 API 基址：环境变量可覆盖，便于本机联调（如 http://localhost:3001） */
function iGM_Launcher_ResolveApiBase(): string {
  const override = process.env.IGM_LAUNCHER_API_BASE?.trim();
  return override && override.length > 0
    ? override.replace(/\/+$/, "")
    : IGM_LAUNCHER_API_BASE;
}

/** 从 Set-Cookie 响应头中提取会话 Cookie 值 */
function iGM_Launcher_ReadSessionCookie(rawSetCookie: string | null): string {
  if (!rawSetCookie) return "";
  const matched = rawSetCookie.match(
    new RegExp(`${IGM_LAUNCHER_API_SESSION_COOKIE}=([^;,\\s]+)`),
  );
  return matched ? matched[1] : "";
}

/**
 * 归一化系统目录选择器的返回值。
 * Electrobun 正常回传 string[]；为兼容不同版本可能出现的
 * 单字符串（多路径以换行分隔）或空值形态，统一取首个非空路径。
 * 用户取消选择时返回空串，界面据此保持原值不变。
 */
function iGM_Launcher_NormalizeDialogPaths(picked: unknown): string {
  const first = (value: string): string =>
    value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.length > 0) ?? "";

  if (Array.isArray(picked)) {
    for (const item of picked) {
      if (typeof item !== "string") continue;
      const path = first(item);
      if (path) return path;
    }
    return "";
  }
  if (typeof picked === "string") return first(picked);
  return "";
}

/**
 * 统一主站 API 请求封装。
 * Bun 主进程直接发起请求，不经过浏览器渲染进程，因此不受 CORS 限制；
 * 带超时控制，网络异常与超时统一归纳为 reached=false。
 */
async function iGM_Launcher_ApiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    sessionCookie?: string;
    /** 单次请求超时覆盖（毫秒），缺省用 IGM_LAUNCHER_API_TIMEOUT_MS */
    timeoutMs?: number;
  } = {},
): Promise<iGM_Launcher_ApiResult<T>> {
  const { method = "POST", body, sessionCookie = "", timeoutMs } = options;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs && timeoutMs > 0 ? timeoutMs : IGM_LAUNCHER_API_TIMEOUT_MS,
  );
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (sessionCookie) {
      headers.Cookie = `${IGM_LAUNCHER_API_SESSION_COOKIE}=${sessionCookie}`;
    }
    const response = await fetch(`${iGM_Launcher_ResolveApiBase()}${path}`, {
      method,
      headers,
      body: method === "POST" && body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let envelope: iGM_Launcher_SiteEnvelope<T> | null = null;
    try {
      envelope = (await response.json()) as iGM_Launcher_SiteEnvelope<T>;
    } catch {
      envelope = null;
    }

    return {
      reached: true,
      status: response.status,
      envelope,
      cookie: iGM_Launcher_ReadSessionCookie(response.headers.get("set-cookie")),
    };
  } catch (error) {
    console.warn(`[iGM_Launcher_Bridge] 主站 API 请求失败：${path}`, error);
    return { reached: false, status: 0, envelope: null, cookie: "" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 归一化主站认证响应并落盘会话：
 * - 不可达 / 超时 -> 503，交由界面提示改用离线模式（绝不伪造 uid）
 * - 主站业务错误 -> 透传其状态码与 i18n 文案键
 * - 成功但缺少用户数据 -> 500
 * @param previousToken 已有会话凭证：/G_Auth/me 不重发 Set-Cookie，
 *        同步时需沿用旧凭证，否则会话会被空值覆盖
 */
async function iGM_Launcher_ResolveAccount(
  result: iGM_Launcher_ApiResult<iGM_Launcher_SiteUserData>,
  previousToken = "",
): Promise<iGM_Launcher_BridgeResponse<{ account: iGM_Launcher_AccountSession }>> {
  if (!result.reached) {
    return iGM_Launcher_Fail<{ account: iGM_Launcher_AccountSession }>(
      IGM_LAUNCHER_BRIDGE_UNREACHABLE,
      "主站 API 不可达",
    );
  }
  const user = result.envelope?.data?.user;
  if (!result.envelope?.success || !user) {
    const code = result.envelope?.code ?? result.status;
    return iGM_Launcher_Fail<{ account: iGM_Launcher_AccountSession }>(
      code > 0 ? code : IGM_LAUNCHER_BRIDGE_FAILED,
      result.envelope?.message ?? "主站返回了无法解析的响应",
    );
  }

  const account = iGM_Launcher_MapSiteUser(user, result.cookie || previousToken);
  await iGM_Launcher_SaveAccount(account);
  return iGM_Launcher_Ok({ account }, result.envelope.message || "ok");
}

/* ---- Minecraft 正版绑定（模块三） ---- */

/** 把认证链错误统一转换为桥接失败响应 */
function iGM_Launcher_McFailure(error: unknown): iGM_Launcher_BridgeResponse {
  if (error instanceof iGM_Launcher_MsaError) {
    return iGM_Launcher_Fail(error.code, error.message);
  }
  console.error("[iGM_Launcher_Bridge] 正版绑定调用失败：", error);
  return iGM_Launcher_Fail(
    IGM_LAUNCHER_BRIDGE_FAILED,
    error instanceof Error ? error.message : "正版绑定内部错误",
  );
}

/** 取当前社区账号 iGMUid；未登录时抛 401（未登录无法绑定正版账号） */
async function iGM_Launcher_RequireCommunityUid(): Promise<string> {
  const account = await iGM_Launcher_LoadAccount();
  if (!account.signedIn || !account.uid) {
    throw new iGM_Launcher_MsaError(
      IGM_LAUNCHER_BRIDGE_UNAUTHORIZED,
      "请先登录社区账号后再绑定 Minecraft 正版账号",
    );
  }
  return account.uid;
}

/** 取绑定密钥载荷，缺失时抛 404 */
async function iGM_Launcher_RequireSecret(
  bindingId: string | undefined,
): Promise<iGM_Launcher_MCBindingSecret> {
  if (!bindingId) throw new iGM_Launcher_MsaError(400, "缺少绑定记录 id");
  const secret = await iGM_Launcher_Binding_GetSecret(bindingId);
  if (!secret) throw new iGM_Launcher_MsaError(404, "绑定记录不存在或已解绑");
  return secret;
}

/**
 * 确保 Minecraft 访问令牌可用：临近过期或已过期时用 refresh_token 自动重建整条认证链。
 * 刷新令牌全程只在主进程内流转，不会出现在任何返回值中。
 */
async function iGM_Launcher_EnsureFreshSecret(
  secret: iGM_Launcher_MCBindingSecret,
): Promise<iGM_Launcher_MCBindingSecret> {
  const expiresAt = Date.parse(secret.binding.accessExpiresAt);
  const stillValid =
    Boolean(secret.minecraftAccessToken) &&
    Number.isFinite(expiresAt) &&
    expiresAt - Date.now() > 60_000;
  if (stillValid) return secret;

  const chain = await iGM_Launcher_Msa_RefreshChain(secret.msaRefreshToken);
  const binding = iGM_Launcher_Msa_ApplyRefresh(secret.binding, chain);
  const next = iGM_Launcher_Msa_BuildRefreshedSecret(binding, chain);
  await iGM_Launcher_Binding_Update(binding, next);
  return next;
}

/**
 * 解析正版启动所需的身份快照。
 * 优先使用界面指定的绑定记录，缺省取当前社区账号的默认绑定（无默认则取第一条）；
 * 令牌临近过期时自动刷新整条认证链；返回的访问令牌只在主进程内传给启动引擎，绝不回传渲染进程。
 */
async function iGM_Launcher_ResolveLaunchIdentity(
  bindingId: string | undefined,
): Promise<iGM_Launcher_LaunchOfficialIdentity> {
  const secret = bindingId
    ? await iGM_Launcher_RequireSecret(bindingId)
    : await iGM_Launcher_RequireDefaultSecret();
  const fresh = await iGM_Launcher_EnsureFreshSecret(secret);
  if (!fresh.binding.ownsJava) {
    throw new iGM_Launcher_MsaError(
      4001,
      "该微软账号未拥有 Minecraft Java 版，无法用于正版启动",
    );
  }
  return {
    uuid: fresh.binding.uuid,
    name: fresh.binding.name,
    accessToken: fresh.minecraftAccessToken,
    xuid: fresh.binding.xuid,
  };
}

/** 取当前社区账号的默认绑定密钥，无任何绑定时抛可读错误 */
async function iGM_Launcher_RequireDefaultSecret(): Promise<iGM_Launcher_MCBindingSecret> {
  const account = await iGM_Launcher_LoadAccount();
  const bindings = await iGM_Launcher_Binding_List(account.uid);
  const preferred = bindings.find((item) => item.isDefault) ?? bindings[0];
  if (!preferred) {
    throw new iGM_Launcher_MsaError(
      4001,
      "尚未绑定微软正版账号，请先在账户页完成正版验证后再选择正版登录",
    );
  }
  return iGM_Launcher_RequireSecret(preferred.id);
}

/**
 * Minecraft 正版绑定的全部桥接分支。
 * 统一入口由 iGM_Launcher_Bridge_Call 前置分流，异常在此之上统一映射为响应码。
 */
async function iGM_Launcher_HandleMc(
  method: iGM_Launcher_BridgeMethod,
  params: iGM_Launcher_BridgeParams,
): Promise<iGM_Launcher_BridgeResponse> {
  switch (method) {
    /* ---------- 认证流程 ---------- */
    case "mc:start-device-code":
      return iGM_Launcher_Msa_StartDeviceCode();

    case "mc:poll-device-code": {
      if (!params.flowId) return iGM_Launcher_Fail(400, "缺少认证流程编号");
      return iGM_Launcher_Msa_PollDeviceCode(params.flowId, await iGM_Launcher_RequireCommunityUid());
    }

    case "mc:start-browser-auth":
      return iGM_Launcher_Msa_StartBrowserAuth(params.redirectUri);

    case "mc:complete-browser-auth": {
      if (!params.flowId) return iGM_Launcher_Fail(400, "缺少认证流程编号");
      return iGM_Launcher_Msa_CompleteBrowserAuth(
        params.flowId,
        await iGM_Launcher_RequireCommunityUid(),
      );
    }

    /* ---------- 分步推进（界面按阶段展示进度时使用） ---------- */
    case "mc:authenticate-xbox":
    case "mc:authorize-xsts":
    case "mc:authenticate-minecraft": {
      if (!params.flowId) return iGM_Launcher_Fail(400, "缺少认证流程编号");
      const stage =
        method === "mc:authenticate-xbox"
          ? "xbox"
          : method === "mc:authorize-xsts"
            ? "xsts"
            : "minecraft";
      return iGM_Launcher_Msa_Advance(params.flowId, stage);
    }

    /* ---------- 绑定关系 ---------- */
    case "mc:bind-to-community": {
      if (!params.flowId) return iGM_Launcher_Fail(400, "缺少认证流程编号");
      const uid = await iGM_Launcher_RequireCommunityUid();
      const taken = iGM_Launcher_Msa_TakeSecret(params.flowId);
      if (!taken) {
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_MC_FLOW_EXPIRED,
          "认证流程已结束或已过期，请重新开始绑定",
        );
      }
      if (taken.binding.communityUid && taken.binding.communityUid !== uid) {
        // 流程期间切换过账号：拒绝把该正版账号绑到新的社区账号上
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_UNAUTHORIZED,
          "认证期间社区账号已变更，请重新开始绑定",
        );
      }
      const result = await iGM_Launcher_Binding_Add({
        ...taken.secret,
        binding: { ...taken.binding, communityUid: uid },
      });
      return iGM_Launcher_Ok({ binding: result.binding });
    }

    case "mc:list-bindings": {
      const account = await iGM_Launcher_LoadAccount();
      return iGM_Launcher_Ok({ mcBindings: await iGM_Launcher_Binding_List(account.uid) });
    }

    case "mc:unbind": {
      const removed = await iGM_Launcher_Binding_Remove(params.bindingId ?? "");
      if (!removed.communityUid) return iGM_Launcher_Fail(404, "绑定记录不存在或已解绑");
      return iGM_Launcher_Ok({ mcBindings: removed.bindings });
    }

    case "mc:set-default-binding": {
      const updated = await iGM_Launcher_Binding_SetDefault(params.bindingId ?? "");
      if (!updated.communityUid) return iGM_Launcher_Fail(404, "绑定记录不存在或已解绑");
      return iGM_Launcher_Ok({ mcBindings: updated.bindings });
    }

    /* ---------- 档案 / 拥有权 / 令牌刷新 ---------- */
    case "mc:get-profile": {
      const secret = await iGM_Launcher_RequireSecret(params.bindingId);
      const fresh = await iGM_Launcher_EnsureFreshSecret(secret);
      const profile = await iGM_Launcher_MsaFetchProfile(fresh.minecraftAccessToken);
      const skin =
        profile.skins.find((item) => item.state === "ACTIVE") ?? profile.skins[0] ?? null;
      const binding: iGM_Launcher_MCBinding = {
        ...fresh.binding,
        uuid: profile.uuid,
        name: profile.name,
        skinUrl: skin?.url ?? "",
        capeUrl: profile.capes[0]?.url ?? "",
        refreshedAt: new Date().toISOString(),
      };
      await iGM_Launcher_Binding_Update(binding, { binding });
      return iGM_Launcher_Ok({ profile });
    }

    case "mc:check-entitlements": {
      const secret = await iGM_Launcher_RequireSecret(params.bindingId);
      const fresh = await iGM_Launcher_EnsureFreshSecret(secret);
      // 未拥有 Java 版时此处抛 4001，界面提示“该账号未购买 Minecraft Java 版”
      await iGM_Launcher_MsaCheckEntitlements(fresh.minecraftAccessToken);
      const binding: iGM_Launcher_MCBinding = {
        ...fresh.binding,
        ownsJava: true,
        refreshedAt: new Date().toISOString(),
      };
      await iGM_Launcher_Binding_Update(binding, { binding });
      return iGM_Launcher_Ok({ binding });
    }

    case "mc:refresh-token": {
      const secret = await iGM_Launcher_RequireSecret(params.bindingId);
      const chain = await iGM_Launcher_Msa_RefreshChain(secret.msaRefreshToken);
      const binding = iGM_Launcher_Msa_ApplyRefresh(secret.binding, chain);
      await iGM_Launcher_Binding_Update(
        binding,
        iGM_Launcher_Msa_BuildRefreshedSecret(binding, chain),
      );
      return iGM_Launcher_Ok({ binding });
    }

    default:
      return iGM_Launcher_Fail(
        IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
        `未实现的正版绑定方法：${String(method)}`,
      );
  }
}

/* ---- 模块五：离线游戏 / 游戏目录扫描 / 版本库同步 ---- */

/** 主站版本列表单条数据（与 iGM_MinecraftVersionDto 保持一致的镜像） */
interface iGM_Launcher_ApiVersionItem {
  id?: unknown;
  version?: unknown;
  type?: unknown;
  releaseTime?: unknown;
  totalSize?: unknown;
  installed?: unknown;
}

/** 主站版本列表分页数据 */
interface iGM_Launcher_ApiVersionListData {
  items: iGM_Launcher_ApiVersionItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 版本库同步一次最多翻页数，避免远端分页异常导致长时间循环 */
const IGM_LAUNCHER_VERSION_SYNC_MAX_PAGES = 10;

/** 取本地已安装版本集合：始终重新扫描磁盘，保证删除文件后立刻反映为「未下载」 */
async function iGM_Launcher_InstalledVersions(): Promise<Set<string>> {
  const scans = (await iGM_Launcher_GameDir_ScanAll()).results;
  const instances = await iGM_Launcher_LoadInstances();
  return iGM_Launcher_GameDir_InstalledVersions(
    scans,
    instances.map((item) => item.minecraftVersion),
  );
}

/**
 * 按本地实际文件回填版本库条目的 installed 标记。
 * 规则：以磁盘上 versions/<目录>/<目录>.json 是否真实存在为准；
 * 目录不存在或 versions 为空时全部为 false（强制显示「未下载」，允许用户重新下载），
 * 绝不沿用上一次同步或后端返回的缓存状态。
 */
function iGM_Launcher_ApplyInstalledState(
  library: iGM_Launcher_VersionLibrary,
  installed: Set<string>,
): iGM_Launcher_VersionLibrary {
  return {
    ...library,
    entries: library.entries.map((entry) => ({
      ...entry,
      installed: installed.has(entry.version.trim().toLowerCase()),
    })),
  };
}

/**
 * 导入实例：版本 json 所在的 .minecraft 根目录直接作为实例目录，不复制任何文件。
 * 同一目录下相同版本与加载器重复导入时拒绝，避免实例列表出现重复项。
 * Zig 侧对应契约：iGM_Launcher_ImportInstance。
 */
async function iGM_Launcher_HandleImportInstance(
  jsonPath: string | undefined,
  importName: string | undefined,
): Promise<iGM_Launcher_BridgeResponse> {
  if (!jsonPath) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少版本 json 路径");
  const version = await iGM_Launcher_GameDir_ParseVersionJson(jsonPath);
  if (!version) {
    return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "版本 json 无法解析，可能文件缺失");
  }

  // versions/<版本目录>/<版本目录>.json -> 上溯两级得到 .minecraft 根目录
  const versionDir = dirname(version.jsonPath);
  const versionsDir = dirname(versionDir);
  const gameRoot =
    basename(versionsDir).toLowerCase() === "versions" ? dirname(versionsDir) : versionDir;

  const instances = await iGM_Launcher_LoadInstances();
  const duplicated = instances.some(
    (item) =>
      normalize(item.directory) === normalize(gameRoot) &&
      item.minecraftVersion === version.version &&
      item.loader === version.loader,
  );
  if (duplicated) {
    return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "该版本已导入为实例，无需重复导入");
  }

  const fallbackName =
    version.loader === "fabric" && version.loaderVersion
      ? `${version.version}-fabric`
      : version.version;
  const record = iGM_Launcher_BuildInstanceRecord({
    name: importName?.trim() || fallbackName,
    icon: "cube",
    note: "",
    minecraftVersion: version.version,
    loader: version.loader,
    loaderVersion: version.loaderVersion,
    // 指向原游戏目录：导入只登记路径，不复制、不修改磁盘内容
    directory: gameRoot,
    javaId: null,
    maxMemoryMb: IGM_LAUNCHER_INSTANCE_MEMORY_DEFAULT.max,
    minMemoryMb: IGM_LAUNCHER_INSTANCE_MEMORY_DEFAULT.min,
    windowWidth: IGM_LAUNCHER_INSTANCE_WINDOW_DEFAULT.width,
    windowHeight: IGM_LAUNCHER_INSTANCE_WINDOW_DEFAULT.height,
    jvmArgs: IGM_LAUNCHER_INSTANCE_JVM_ARGS_DEFAULT,
    gameArgs: "",
  });

  const next = [...instances, record];
  await iGM_Launcher_WriteJson(IGM_LAUNCHER_INSTANCES_FILE, { instances: next });
  return iGM_Launcher_Ok({ instance: record, instances: next });
}

/**
 * 从主站版本资料库同步版本列表。
 * 成功时写入缓存并返回 remote 快照；失败时保留既有缓存，
 * 以 data.library 回填缓存内容，界面据此提示「已保留本地缓存」。
 * Zig 侧对应契约：iGM_Launcher_SyncVersionLibrary。
 */
async function iGM_Launcher_SyncVersionLibrary(): Promise<iGM_Launcher_BridgeResponse> {
  const cached = await iGM_Launcher_VersionLibrary_Load();
  const installed = await iGM_Launcher_InstalledVersions();

  const entries: iGM_Launcher_VersionLibraryEntry[] = [];
  let total = 0;
  for (let page = 1; page <= IGM_LAUNCHER_VERSION_SYNC_MAX_PAGES; page += 1) {
    const result = await iGM_Launcher_ApiRequest<iGM_Launcher_ApiVersionListData>(
      `${IGM_LAUNCHER_API_MC_VERSIONS_PATH}?page=${page}&pageSize=${IGM_LAUNCHER_VERSION_LIBRARY_PAGE_SIZE}`,
      { method: "GET" },
    );
    const data = result.envelope?.data;
    if (!result.reached || !result.envelope?.success || !data?.items) {
      // 同步失败：保留本地缓存，返回缓存快照供界面继续展示
      return {
        success: false,
        code: result.reached
          ? (result.envelope?.code ?? result.status ?? IGM_LAUNCHER_BRIDGE_FAILED)
          : IGM_LAUNCHER_BRIDGE_UNREACHABLE,
        message: result.envelope?.message ?? "版本库同步失败，已保留本地缓存",
        data: { library: cached },
      };
    }

    total = typeof data.total === "number" ? data.total : data.items.length;
    for (const item of data.items) {
      const versionId = typeof item.id === "string" ? item.id : "";
      const version = typeof item.version === "string" ? item.version : "";
      if (!versionId || !version) continue;
      entries.push({
        id: versionId,
        version,
        type: iGM_Launcher_NormalizeVersionType(item.type) as iGM_Launcher_VersionType,
        releaseTime: typeof item.releaseTime === "string" ? item.releaseTime : null,
        totalSize: typeof item.totalSize === "number" ? item.totalSize : null,
        // 只认本地实际文件：不采用主站按登录用户返回的 installed 标记，避免删文件后仍显示已下载
        installed: installed.has(version.toLowerCase()),
      });
    }

    if (entries.length >= total || data.items.length === 0) break;
  }

  const library: iGM_Launcher_VersionLibrary = {
    entries,
    syncedAt: new Date().toISOString(),
    source: "remote",
    total,
  };
  await iGM_Launcher_VersionLibrary_Save(library);
  return iGM_Launcher_Ok({ library });
}

/**
 * 模块六补充：把界面传入的「前置目录」按目录规则解析为共享 .minecraft 根目录。
 * 用户可把前置目录放在任意磁盘（不限于系统盘），目录规则要求最终目录固定为
 * <前置目录>/.minecraft；已以 .minecraft 结尾的路径原样保留，
 * 因此对已解析过的根目录重复调用同样安全（幂等）。
 */
function iGM_Launcher_ResolvePreferredRoot(preferred?: string): string | undefined {
  const trimmed = preferred?.trim() ?? "";
  return trimmed ? iGM_Launcher_McRootOfParent(trimmed) : undefined;
}

/**
 * 模块五的全部桥接分支（离线游戏入口）。
 * 扫描与导入只读本机游戏目录；版本库同步失败不破坏缓存。
 */
async function iGM_Launcher_HandleMinecraft(
  method: iGM_Launcher_BridgeMethod,
  params: iGM_Launcher_BridgeParams,
): Promise<iGM_Launcher_BridgeResponse> {
  switch (method) {
    /* 扫描本机常见游戏目录（含已登记目录），结果落盘供界面展示与导入 */
    case "minecraft:scan-dirs": {
      const scan = await iGM_Launcher_GameDir_ScanAll();
      return iGM_Launcher_Ok({
        gameDirs: scan.gameDirs as iGM_Launcher_GameDir[],
        results: scan.results as iGM_Launcher_GameDirScanResult[],
      });
    }

    /* 解析单个版本 json（手动指定目录时界面逐个解析用） */
    case "minecraft:parse-version": {
      const version = await iGM_Launcher_GameDir_ParseVersionJson(params.jsonPath ?? "");
      if (!version) {
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_INVALID,
          "版本 json 无法解析，可能文件缺失",
        );
      }
      return iGM_Launcher_Ok({ version: version as iGM_Launcher_ScannedVersion });
    }

    /* 导入实例：目录指向原游戏目录，不复制文件 */
    case "minecraft:import-instance":
      return iGM_Launcher_HandleImportInstance(params.jsonPath, params.importName);

    /* 手动指定游戏目录：扫描并登记 */
    case "minecraft:add-dir": {
      const added = await iGM_Launcher_GameDir_Add(params.dirPath ?? "");
      if (!added) {
        return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "目录不存在或无法访问");
      }
      return iGM_Launcher_Ok({
        gameDirs: added.gameDirs as iGM_Launcher_GameDir[],
        result: added.result as iGM_Launcher_GameDirScanResult,
      });
    }

    /* 移除已登记目录（仅移除记录，不动磁盘） */
    case "minecraft:remove-dir": {
      const gameDirs = await iGM_Launcher_GameDir_Remove(params.dirId ?? "");
      if (!gameDirs) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "目录记录不存在");
      return iGM_Launcher_Ok({ gameDirs: gameDirs as iGM_Launcher_GameDir[] });
    }

    /* 设为默认游戏目录 */
    case "minecraft:set-default-dir": {
      const gameDirs = await iGM_Launcher_GameDir_SetDefault(params.dirId ?? "");
      if (!gameDirs) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "目录记录不存在");
      return iGM_Launcher_Ok({ gameDirs: gameDirs as iGM_Launcher_GameDir[] });
    }

    /* 读取版本库缓存并按本地实际文件重算安装状态（不联网、不沿用缓存状态） */
    case "minecraft:library": {
      const library = await iGM_Launcher_VersionLibrary_Load();
      const installed = await iGM_Launcher_InstalledVersions();
      return iGM_Launcher_Ok({ library: iGM_Launcher_ApplyInstalledState(library, installed) });
    }

    /* 与主站版本资料库同步 */
    case "minecraft:sync-versions":
      return iGM_Launcher_SyncVersionLibrary();

    /* ---- 模块六：下载安装位置与实例创建联动 ---- */

    /*
     * 扫描共享根目录下已安装的版本（.minecraft/versions）。
     * 入参 rootDir 为界面传入的前置目录（可位于任意磁盘），
     * 未指定时按「优先已存在」规则解析生效根目录。
     */
    case "minecraft:installed-versions": {
      const rootDir = await iGM_Launcher_GameDir_ResolveRootDir(
        iGM_Launcher_ResolvePreferredRoot(params.rootDir),
      );
      const versions = await iGM_Launcher_GameDir_InstalledVersionsOf(rootDir.path);
      return iGM_Launcher_Ok({
        rootDir: rootDir.path,
        versions: versions as iGM_Launcher_ScannedVersion[],
      });
    }

    /*
     * 汇总共享根目录下已安装的加载器（由已安装版本推断）。
     * 原版始终可用，其余加载器仅在存在对应版本时视为已安装。
     */
    case "minecraft:installed-loaders": {
      const rootDir = await iGM_Launcher_GameDir_ResolveRootDir(
        iGM_Launcher_ResolvePreferredRoot(params.rootDir),
      );
      const versions = await iGM_Launcher_GameDir_InstalledVersionsOf(rootDir.path);
      return iGM_Launcher_Ok({
        loaders: iGM_Launcher_AggregateInstalledLoaders(versions) as iGM_Launcher_InstalledLoader[],
      });
    }

    /*
     * 解析生效的共享根目录：显式指定的前置目录（任意磁盘）优先，
     * 其次已登记默认目录，最后系统默认候选中已存在者。
     */
    case "minecraft:default-root-dir": {
      const rootDir = await iGM_Launcher_GameDir_ResolveRootDir(
        iGM_Launcher_ResolvePreferredRoot(params.rootDir),
      );
      return iGM_Launcher_Ok({ rootDir: rootDir as iGM_Launcher_RootDirInfo });
    }

    /*
     * 创建实例隔离目录 <根目录>/instances/<实例名> 并补齐实例子目录。
     * 创建前先做实例名唯一性校验，重名直接拒绝，避免覆盖既有实例。
     */
    case "minecraft:create-instance-dir": {
      const instances = await iGM_Launcher_LoadInstances();
      const check = iGM_Launcher_CheckInstanceName(
        params.instanceName ?? "",
        instances.map((item) => item.name),
      );
      if (!check.valid) {
        return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "实例名不可用");
      }
      const rootDir = await iGM_Launcher_GameDir_ResolveRootDir(
        iGM_Launcher_ResolvePreferredRoot(params.rootDir),
      );
      const created = await iGM_Launcher_GameDir_EnsureInstanceDir(
        rootDir.path,
        (params.instanceName ?? "").trim(),
      );
      return iGM_Launcher_Ok({ gameDir: created.gameDir, created: created.created });
    }

    /* 只读校验实例名（空 / 非法字符 / 重名），供界面即时提示 */
    case "minecraft:validate-instance-name": {
      const instances = await iGM_Launcher_LoadInstances();
      const check = iGM_Launcher_CheckInstanceName(
        params.instanceName ?? "",
        instances.map((item) => item.name),
      );
      return iGM_Launcher_Ok({ check: check as iGM_Launcher_InstanceNameCheck });
    }

    /* ---- 模块七：真实下载安装 ---- */

    /* 查询加载器可选版本（Fabric 官方元数据；原版无加载器版本，返回空数组） */
    case "minecraft:download-loader-versions": {
      const version = params.version?.trim() ?? "";
      if (!version) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少目标版本号");
      const loaderVersions = await iGM_Launcher_Download_LoaderVersions(
        version,
        params.loader ?? "vanilla",
      );
      return iGM_Launcher_Ok({ loaderVersions });
    }

    /* 启动真实下载：前置目录（任意磁盘）按目录规则解析为 .minecraft 根后交给下载引擎 */
    case "minecraft:download-start": {
      const rootDir = await iGM_Launcher_GameDir_ResolveRootDir(
        iGM_Launcher_ResolvePreferredRoot(params.rootDir),
      );
      if (!rootDir.path) {
        return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "尚未确定下载目录");
      }
      try {
        /*
         * 记忆下载根目录：把本次解析出的根目录真实建出并登记到本地配置，
         * 下次启动 / 再次下载即可自动沿用（无需重复询问），
         * 同时保证下载完成后本地扫描能立即识别到该目录，状态显示为「已下载」。
         */
        await mkdir(rootDir.path, { recursive: true });
        const registeredRoot = await iGM_Launcher_GameDir_Add(rootDir.path);
        const rootRecord = registeredRoot?.gameDirs.find(
          (item) => normalize(item.path) === normalize(rootDir.path),
        );
        if (rootRecord) await iGM_Launcher_GameDir_SetDefault(rootRecord.id);

        /*
         * 先向自己网站拉取版本文件清单（文件 URL / 相对路径 / 大小 / sha1 与文本文件）；
         * 拿到后交给下载引擎按清单逐文件走 Zig 引擎直连下载。
         * 清单接口不可达或失败时不阻断安装，降级为启动器自解析 Mojang 清单的兜底流程。
         */
        const account = await iGM_Launcher_LoadAccount();
        const query = new URLSearchParams({
          version: params.version ?? "",
          loader: params.loader ?? "vanilla",
        });
        if (params.loader === "fabric" && params.loaderVersion) {
          query.set("loaderVersion", params.loaderVersion);
        }
        const manifestResult = await iGM_Launcher_ApiRequest<iGM_Launcher_VersionFilesManifest>(
          `${IGM_LAUNCHER_API_MC_VERSION_FILES_PATH}?${query.toString()}`,
          { method: "GET", sessionCookie: account.token?.trim() ?? "" },
        );
        let manifest: iGM_Launcher_VersionFilesManifest | undefined;
        if (
          manifestResult.reached &&
          manifestResult.envelope?.success &&
          manifestResult.envelope.data
        ) {
          manifest = manifestResult.envelope.data;
        } else {
          console.warn(
            "[iGM_Launcher_Bridge] 版本文件清单接口不可用，已降级为自解析 Mojang 清单下载：",
            manifestResult.reached ? manifestResult.status : "网络不可达",
            manifestResult.envelope?.message ?? "",
          );
        }

        const progress = iGM_Launcher_Download_Start({
          version: params.version ?? "",
          loader: params.loader ?? "vanilla",
          loaderVersion: params.loaderVersion,
          rootDir: rootDir.path,
          manifest,
        });
        return iGM_Launcher_Ok({ progress });
      } catch (error) {
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_INVALID,
          error instanceof Error ? error.message : "无法开始下载",
        );
      }
    }

    /* 查询下载进度（不带 taskId 时取最近一次任务） */
    case "minecraft:download-status":
      return iGM_Launcher_Ok({
        progress: iGM_Launcher_Download_Status(params.taskId) as iGM_Launcher_DownloadProgress | null,
      });

    /* 取消下载任务 */
    case "minecraft:download-cancel":
      return iGM_Launcher_Ok({
        progress: iGM_Launcher_Download_Cancel(params.taskId) as iGM_Launcher_DownloadProgress | null,
      });

    /*
     * 打开系统目录选择器，让用户把前置目录放到任意磁盘（不限于系统盘）。
     * 用户取消选择时返回空路径，界面据此保持原值不变。
     */
    case "minecraft:pick-dir": {
      try {
        /*
         * Electrobun 的 openFileDialog 用对象展开合并默认值，显式传入 undefined 会把
         * 默认的起始目录覆盖成 undefined，进而在 FFI 转 C 字符串时抛出
         * "undefined is not an object (evaluating 'jsString.endsWith')"。
         * 因此起始目录一律给成确定字符串：优先界面传入的目录，否则回退到用户主目录。
         */
        const startingFolder = params.rootDir?.trim() || homedir();
        const picked = await Utils.openFileDialog({
          startingFolder,
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false,
        });
        /*
         * 兼容不同 Electrobun 版本的回传形态：
         * 正常为 string[]，异常时可能是单个字符串（多路径以换行分隔）或 undefined。
         * 一律归一化为首个非空路径，避免界面拿到空串而无法回填输入框。
         */
        const normalized = iGM_Launcher_NormalizeDialogPaths(picked);
        return iGM_Launcher_Ok({ path: normalized });
      } catch (error) {
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_FAILED,
          error instanceof Error ? error.message : "无法打开系统目录选择器",
        );
      }
    }

    default:
      return iGM_Launcher_Fail(
        IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
        `未实现的离线游戏方法：${String(method)}`,
      );
  }
}

/* ---- 模块二十：第三方资源（Modrinth / Fabric） ---- */

/**
 * 第三方资源统一请求封装。
 * 全部走主站 /G_ThirdParty 前缀，由 Bun 主进程直连（不经浏览器，无跨域限制）；
 * 不可达映射为 IGM_LAUNCHER_BRIDGE_UNREACHABLE，业务失败透传 code 与 message，
 * 成功用 iGM_Launcher_Ok 包装 data，与其余分支的错误处理口径保持一致。
 */
async function iGM_Launcher_ThirdPartyRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<iGM_Launcher_BridgeResponse<T>> {
  /*
   * 下载任务由主站后端统一下发与管理，创建 / 取消 / 重试都要求社区账号登录态。
   * 这里取出启动器已保存的会话 Cookie 一并携带，否则后端会返回 401
   * （业务错误键 auth.errors.unauthorized）。
   */
  const account = await iGM_Launcher_LoadAccount();
  /* 第三方接口单独放宽超时：首次回源 Modrinth 与建单耗时高于普通接口 */
  const result = await iGM_Launcher_ApiRequest<T>(path, {
    ...options,
    sessionCookie: account.token?.trim() ?? "",
    timeoutMs: IGM_LAUNCHER_API_THIRD_PARTY_TIMEOUT_MS,
  });
  if (!result.reached) {
    return iGM_Launcher_Fail<T>(IGM_LAUNCHER_BRIDGE_UNREACHABLE, "第三方资源接口不可达");
  }
  /*
   * 非 JSON 响应：主站被网关/隧道拦截时（如 Cloudflare 502/530）返回的是 HTML 错误页，
   * 此处不再笼统提示「无法解析的响应」，而是带上 HTTP 状态码，便于定位隧道或后端问题。
   */
  if (!result.envelope) {
    console.error(
      `[iGM_Launcher_Bridge] 第三方资源接口返回非 JSON 响应：${path} HTTP ${result.status}`,
    );
    return iGM_Launcher_Fail<T>(
      IGM_LAUNCHER_BRIDGE_FAILED,
      `第三方资源服务返回了非 JSON 响应（HTTP ${result.status}），请检查 api.igcraftlit.com 隧道或本地后端状态`,
    );
  }
  if (!result.envelope.success) {
    const code = result.envelope.code ?? result.status;
    // 后端已把上游失败收敛为友好文案；此处仅透传，不再暴露原始错误
    return iGM_Launcher_Fail<T>(
      typeof code === "number" && code > 0 ? code : IGM_LAUNCHER_BRIDGE_FAILED,
      result.envelope.message ?? "第三方平台连接失败，请稍后重试",
    );
  }
  return iGM_Launcher_Ok((result.envelope.data ?? null) as T);
}

/* ---- 模块二十三：原生 SDK 优先的第三方下载 ---- */

/** SDK 任务编号前缀（与 iGM_Launcher_SDK 内生成规则一致） */
const IGM_LAUNCHER_SDK_TASK_PREFIX = "sdk-";

/**
 * 把 SDK 任务快照映射为界面使用的第三方任务结构。
 * SDK 直连下载源，创建阶段拿不到文件名 / 直链 / 校验值等元数据，
 * 这里按可用字段尽力回填；界面进度条只依赖 downloaded / total / percent / speed / eta。
 */
export function iGM_Launcher_SDK_ToThirdPartyTask(
  snapshot: iGM_Launcher_SDK_TaskSnapshot,
): iGM_Launcher_ThirdPartyTask {
  const now = new Date().toISOString();
  return {
    id: snapshot.taskId,
    resourceId: snapshot.resourceId,
    versionId: snapshot.version,
    source: "modrinth",
    name: snapshot.resourceId,
    type: "mod",
    version: snapshot.version,
    downloadUrl: "",
    filename: snapshot.sdkTaskId,
    size: snapshot.total,
    sha1: "",
    status: snapshot.status,
    downloaded: snapshot.downloaded,
    progress: snapshot.percent,
    speed: snapshot.speed,
    eta: snapshot.eta,
    error: snapshot.error,
    targetDir: snapshot.targetDir,
    filePath: "",
    createdAt: snapshot.createdAt,
    updatedAt: now,
  };
}

/** 若任务编号属于 SDK 任务则返回映射后的任务，否则返回 null（交由后端路径处理） */
function iGM_Launcher_SDK_LookupTask(taskId: string): iGM_Launcher_ThirdPartyTask | null {
  if (!taskId.startsWith(IGM_LAUNCHER_SDK_TASK_PREFIX)) return null;
  const snapshot = iGM_Launcher_SDK_Status(taskId);
  return snapshot ? iGM_Launcher_SDK_ToThirdPartyTask(snapshot) : null;
}

/**
 * 模块二十的全部桥接分支（第三方资源浏览与下载任务）。
 *
 * 下载路径（模块二十三调整）：
 *   1) 优先走原生 SDK——bun:ffi 直连 Modrinth，省去 HTTP/WebSocket 往返，进度回调直达主进程；
 *   2) SDK 动态库不存在或加载失败时，回退到主站后端统一下发的任务（网站下载中心同一套任务）；
 *   3) 后端代理路径保留为兜底（服务网页端与第三方工具），启动器内该分支已标记 @deprecated，
 *      待 SDK 在多种资源上验证稳定后再物理删除。
 */
async function iGM_Launcher_HandleThirdParty(
  method: iGM_Launcher_BridgeMethod,
  params: iGM_Launcher_BridgeParams,
): Promise<iGM_Launcher_BridgeResponse> {
  switch (method) {
    /* 搜索资源：q / type / page / pageSize 全部按契约拼进查询串 */
    case "thirdParty:search": {
      const query = new URLSearchParams();
      const keyword = params.query?.trim() ?? "";
      if (keyword) query.set("q", keyword);
      if (params.resourceType) query.set("type", params.resourceType);
      query.set("page", String(params.page && params.page > 0 ? params.page : 1));
      query.set(
        "pageSize",
        String(
          params.pageSize && params.pageSize > 0
            ? params.pageSize
            : IGM_LAUNCHER_THIRD_PARTY_PAGE_SIZE,
        ),
      );
      return iGM_Launcher_ThirdPartyRequest(
        `${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/search?${query.toString()}`,
        { method: "GET" },
      );
    }

    /* 资源详情：返回资源本身与其全部可下载版本 */
    case "thirdParty:resource": {
      const resourceId = params.resourceId?.trim() ?? "";
      if (!resourceId) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少资源 id");
      return iGM_Launcher_ThirdPartyRequest(
        `${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/resource/${encodeURIComponent(resourceId)}`,
        { method: "GET" },
      );
    }

    /* 发起下载：优先走原生 SDK 直链（完整 downloadUrl + 文件名），不可用时回退主站后端统一下发 */
    case "thirdParty:download-start": {
      const resourceId = params.resourceId?.trim() ?? "";
      const versionId = params.versionId?.trim() ?? "";
      const downloadUrl = params.downloadUrl?.trim() ?? "";
      const target = params.target?.trim() ?? "";
      if (!versionId) {
        return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少版本 id");
      }
      if (!target) {
        return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少下载目标目录");
      }
      console.log(`[SDK] 准备创建任务，目标路径: ${target}`);

      /*
       * 主路径（直链）：界面已从资源详情拿到后端下发的完整 downloadUrl 与文件名，
       * 直接交给引擎按 URL 下载。引擎不再把「本地版本 id」当成 Modrinth version id 二次解析，
       * 从根上消除 project/{id}/version/{本地id} 造成的 404。
       */
      if (iGM_Launcher_SDK_IsAvailable() && downloadUrl) {
        try {
          const filename =
            params.filename?.trim() || basename(new URL(downloadUrl).pathname) || "download.bin";
          const snapshot = iGM_Launcher_SDK_StartUrl({
            url: downloadUrl,
            destPath: join(target, filename),
            sha1: params.sha1 ?? "",
            size: params.size ?? 0,
            resourceId,
            version: versionId,
            loader: params.loader ?? "fabric",
            targetDir: target,
          });
          return iGM_Launcher_Ok({
            task: iGM_Launcher_SDK_ToThirdPartyTask(snapshot),
            engine: "sdk" as const,
            engineError: "",
          });
        } catch (error) {
          /*
           * Zig 核心建单 / 启动失败：不再静默吞掉，而是把具体错误回传给界面，
           * 由独立进度窗口展示红字「Zig 引擎调用失败：<详情>」，彻底消除静默失败。
           */
          const detail = error instanceof Error ? error.message : String(error);
          console.error(`[SDK] Zig 引擎调用失败：${detail}`);
          return iGM_Launcher_Ok({
            task: null,
            engine: "sdk" as const,
            engineError: `Zig 引擎调用失败：${detail}`,
          });
        }
      }

      // 兜底：界面未提供直链时，仍按资源 id + 版本 id 走 Modrinth 解析（老路径）
      if (iGM_Launcher_SDK_IsAvailable() && resourceId) {
        try {
          const snapshot = iGM_Launcher_SDK_Start({
            resourceId,
            version: versionId,
            loader: params.loader ?? "fabric",
            targetDir: target,
          });
          return iGM_Launcher_Ok({
            task: iGM_Launcher_SDK_ToThirdPartyTask(snapshot),
            engine: "sdk" as const,
            engineError: "",
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          console.error(`[SDK] Zig 引擎调用失败：${detail}`);
          return iGM_Launcher_Ok({
            task: null,
            engine: "sdk" as const,
            engineError: `Zig 引擎调用失败：${detail}`,
          });
        }
      }

      // 动态库缺失 / 加载失败：回退主站后端统一下发的 HTTP 任务，并明确告知已降级
      console.warn("[SDK] Zig 引擎不可用，已降级为 HTTP 下载");
      const fallback = await iGM_Launcher_ThirdPartyRequest<{
        task: iGM_Launcher_ThirdPartyTask;
      }>(`${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/download`, {
        body: { resourceId, versionId, downloadUrl, filename: params.filename, sha1: params.sha1, target },
      });
      if (!fallback.success || !fallback.data) {
        return iGM_Launcher_Fail(
          typeof fallback.code === "number" && fallback.code > 0
            ? fallback.code
            : IGM_LAUNCHER_BRIDGE_FAILED,
          fallback.message || "创建下载任务失败",
        );
      }
      return iGM_Launcher_Ok({
        task: fallback.data.task,
        engine: "http" as const,
        engineError: "Zig 引擎不可用，已降级为 HTTP 下载",
      });
    }

    /* 查询单个任务（不含任务编号时拒绝，避免误取其它任务） */
    case "thirdParty:download-status": {
      const taskId = params.taskId?.trim() ?? "";
      if (!taskId) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少下载任务编号");
      const sdkTask = iGM_Launcher_SDK_LookupTask(taskId);
      if (sdkTask) return iGM_Launcher_Ok({ task: sdkTask });
      return iGM_Launcher_ThirdPartyRequest<{ task: iGM_Launcher_ThirdPartyTask | null }>(
        `${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/download/${encodeURIComponent(taskId)}`,
        { method: "GET" },
      );
    }

    /* 任务列表：可按 status 过滤 */
    case "thirdParty:download-list": {
      const suffix = params.status ? `?status=${encodeURIComponent(params.status)}` : "";
      return iGM_Launcher_ThirdPartyRequest(
        `${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/downloads${suffix}`,
        { method: "GET" },
      );
    }

    /* 取消任务：purge 为真时同时删除已下载文件 */
    case "thirdParty:download-cancel": {
      const taskId = params.taskId?.trim() ?? "";
      if (!taskId) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少下载任务编号");
      const sdkTask = iGM_Launcher_SDK_LookupTask(taskId);
      if (sdkTask) {
        const snapshot = iGM_Launcher_SDK_Cancel(taskId);
        if (params.purge === true) iGM_Launcher_SDK_Release(taskId);
        return iGM_Launcher_Ok({
          task: snapshot ? iGM_Launcher_SDK_ToThirdPartyTask(snapshot) : sdkTask,
        });
      }
      return iGM_Launcher_ThirdPartyRequest(
        `${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/download/${encodeURIComponent(taskId)}/cancel`,
        { body: { purge: params.purge === true } },
      );
    }

    /* 暂停 / 继续：paused 缺省按暂停处理 */
    case "thirdParty:download-pause": {
      const taskId = params.taskId?.trim() ?? "";
      if (!taskId) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少下载任务编号");
      const sdkTask = iGM_Launcher_SDK_LookupTask(taskId);
      if (sdkTask) {
        const snapshot =
          params.paused !== false
            ? iGM_Launcher_SDK_Pause(taskId)
            : iGM_Launcher_SDK_Resume(taskId);
        return iGM_Launcher_Ok({
          task: snapshot ? iGM_Launcher_SDK_ToThirdPartyTask(snapshot) : sdkTask,
        });
      }
      return iGM_Launcher_ThirdPartyRequest(
        `${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/download/${encodeURIComponent(taskId)}/pause`,
        { body: { paused: params.paused !== false } },
      );
    }

    /* 重试失败 / 已取消的任务：SDK 任务从头重启，后端任务保留 .part 断点续传 */
    case "thirdParty:download-retry": {
      const taskId = params.taskId?.trim() ?? "";
      if (!taskId) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少下载任务编号");
      const sdkTask = iGM_Launcher_SDK_LookupTask(taskId);
      if (sdkTask) {
        const snapshot = iGM_Launcher_SDK_Retry(taskId);
        return iGM_Launcher_Ok({
          task: snapshot ? iGM_Launcher_SDK_ToThirdPartyTask(snapshot) : sdkTask,
        });
      }
      return iGM_Launcher_ThirdPartyRequest(
        `${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/download/${encodeURIComponent(taskId)}/retry`,
        { body: {} },
      );
    }

    /* 移除任务记录 */
    case "thirdParty:download-remove": {
      const taskId = params.taskId?.trim() ?? "";
      if (!taskId) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少下载任务编号");
      const sdkTask = iGM_Launcher_SDK_LookupTask(taskId);
      if (sdkTask) {
        iGM_Launcher_SDK_Release(taskId);
        return iGM_Launcher_Ok({ removed: true });
      }
      return iGM_Launcher_ThirdPartyRequest(
        `${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/download/${encodeURIComponent(taskId)}`,
        { method: "DELETE" },
      );
    }

    /* 清空已完成任务 */
    case "thirdParty:download-clear-completed":
      return iGM_Launcher_ThirdPartyRequest(
        `${IGM_LAUNCHER_API_THIRD_PARTY_PATH}/downloads/completed`,
        { method: "DELETE" },
      );

    default:
      return iGM_Launcher_Fail(
        IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
        `未实现的第三方资源方法：${String(method)}`,
      );
  }
}

/* ---- 桥接层入口 ---- */

/**
 * 桥接层统一调用入口。
 * 所有分支都返回 iGM_Launcher_BridgeResponse，调用方无需再处理异常。
 */
export async function iGM_Launcher_Bridge_Call(
  method: iGM_Launcher_BridgeMethod,
  params: iGM_Launcher_BridgeParams = {},
): Promise<iGM_Launcher_BridgeResponse> {
  try {
    // 模块三的 Minecraft 正版绑定分支集中处理，异常统一映射为响应码
    if (method.startsWith("mc:")) {
      return await iGM_Launcher_HandleMc(method, params);
    }

    // 模块五的离线游戏分支（游戏目录扫描 / 版本解析 / 实例导入 / 版本库同步）
    if (method.startsWith("minecraft:")) {
      return await iGM_Launcher_HandleMinecraft(method, params);
    }

    // 模块二十：第三方资源（Modrinth / Fabric）分支
    if (method.startsWith("thirdParty:")) {
      return await iGM_Launcher_HandleThirdParty(method, params);
    }

    switch (method) {
      /* ---------- 应用数据 ---------- */
      case "app:load": {
        const [instances, java, account, gameDirs, versionLibrary] = await Promise.all([
          iGM_Launcher_LoadInstances(),
          iGM_Launcher_LoadJava(),
          iGM_Launcher_LoadAccount(),
          iGM_Launcher_GameDir_Load(),
          // 首帧只读缓存，不联网；远端同步由界面按需触发或定时触发
          iGM_Launcher_VersionLibrary_Load(),
        ]);
        const data: iGM_Launcher_LocalData = {
          instances,
          javas: java.javas,
          defaultJavaId: java.defaultJavaId,
          account,
          mcBindings: await iGM_Launcher_Binding_List(account.uid),
          gameDirs,
          versionLibrary,
        };
        return iGM_Launcher_Ok({ data });
      }

      /*
        模块七：读取安装程序写入的语言选择。
        安装程序落盘 installer.json，启动器首启（本地尚无语言持久化时）
        读取该值，使安装向导与启动器语言保持一致；未安装过则返回 null。
      */
      case "app:locale": {
        const config = await iGM_Launcher_ReadJson<iGM_Launcher_InstallerConfig | null>(
          IGM_INSTALLER_CONFIG_FILE,
          null,
        );
        const locale =
          config && (config.locale === "zh-CN" || config.locale === "en")
            ? config.locale
            : null;
        return iGM_Launcher_Ok({ locale });
      }

      case "core:status":
        return iGM_Launcher_Ok({ core: iGM_Launcher_Core_Status() });

      /* ---------- 实例管理 ---------- */
      case "instance:list":
        return iGM_Launcher_Ok({ instances: await iGM_Launcher_LoadInstances() });

      case "instance:get": {
        const instances = await iGM_Launcher_LoadInstances();
        const instance = instances.find((item) => item.id === params.id);
        if (!instance) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "实例不存在");
        return iGM_Launcher_Ok({ instance });
      }

      case "instance:create": {
        if (!params.instance) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少实例数据");
        }
        const instances = await iGM_Launcher_LoadInstances();
        // 实例名唯一性：重名直接拒绝，避免覆盖既有实例
        const check = iGM_Launcher_CheckInstanceName(
          params.instance.name ?? "",
          instances.map((item) => item.name),
        );
        if (!check.valid) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "实例名不可用");
        }
        // 模块六：实例 gameDir 统一由共享根目录自动生成并创建隔离目录，
        // 根目录优先使用已存在者，扫描导入的实例另走 minecraft:import-instance 不受影响；
        // 界面传入的 rootDir 是「前置目录」（可位于任意磁盘），按目录规则补齐 .minecraft 段
        const rootDir = await iGM_Launcher_GameDir_ResolveRootDir(
          iGM_Launcher_ResolvePreferredRoot(params.rootDir),
        );
        let directory = params.instance.directory ?? "";
        if (rootDir.path) {
          const ensured = await iGM_Launcher_GameDir_EnsureInstanceDir(
            rootDir.path,
            (params.instance.name ?? "").trim(),
          );
          directory = ensured.gameDir;
        }
        const record = iGM_Launcher_BuildInstanceRecord({ ...params.instance, directory });
        const next = [...instances, record];
        await iGM_Launcher_WriteJson(IGM_LAUNCHER_INSTANCES_FILE, { instances: next });
        return iGM_Launcher_Ok({ instance: record, instances: next });
      }

      case "instance:update": {
        if (!params.id || !params.patch) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少实例 id 或更新字段");
        }
        const instances = await iGM_Launcher_LoadInstances();
        const index = instances.findIndex((item) => item.id === params.id);
        if (index < 0) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "实例不存在");
        const updated: iGM_Launcher_InstanceRecord = {
          ...instances[index],
          ...params.patch,
          updatedAt: new Date().toISOString(),
        };
        const next = [...instances];
        next[index] = updated;
        await iGM_Launcher_WriteJson(IGM_LAUNCHER_INSTANCES_FILE, { instances: next });
        return iGM_Launcher_Ok({ instance: updated, instances: next });
      }

      case "instance:delete": {
        if (!params.id) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少实例 id");
        }
        const instances = await iGM_Launcher_LoadInstances();
        const next = instances.filter((item) => item.id !== params.id);
        if (next.length === instances.length) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "实例不存在");
        }
        await iGM_Launcher_WriteJson(IGM_LAUNCHER_INSTANCES_FILE, { instances: next });
        return iGM_Launcher_Ok({ instances: next });
      }

      /* ---------- 模块八：启动（离线 / 正版） ---------- */

      /*
       * 启动实例：编排实例 / Java / 账户 / 生效根目录后交给启动引擎，
       * 由引擎真实拉起 Java 进程；成功时回写上次游玩时间并回传最新实例列表。
       * mode 为 official 时先解析正版身份（复用绑定密钥与自动刷新），
       * 令牌只在主进程内传给启动引擎，绝不回传渲染进程。
       * 启动失败如实透传错误码与原因，不写 lastPlayedAt，不伪造运行状态。
       */
      case "instance:launch": {
        if (!params.id) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少实例 id");
        }
        const instances = await iGM_Launcher_LoadInstances();
        const instance = instances.find((item) => item.id === params.id);
        if (!instance) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "实例不存在");

        const mode: iGM_Launcher_LaunchMode =
          params.mode === "official" ? "official" : "offline";
        let official: iGM_Launcher_LaunchOfficialIdentity | null = null;
        if (mode === "official") {
          try {
            official = await iGM_Launcher_ResolveLaunchIdentity(params.bindingId);
          } catch (error) {
            const code =
              error instanceof iGM_Launcher_MsaError
                ? error.code
                : IGM_LAUNCHER_BRIDGE_FAILED;
            const message = error instanceof Error ? error.message : "正版账号解析失败";
            return iGM_Launcher_Fail(code, message);
          }
        }

        const java = await iGM_Launcher_LoadJava();
        const account = await iGM_Launcher_LoadAccount();
        const rootDir = await iGM_Launcher_GameDir_ResolveRootDir(
          iGM_Launcher_ResolvePreferredRoot(params.rootDir),
        );

        const result = await iGM_Launcher_Launch_Start({
          instance,
          account,
          javas: java.javas,
          defaultJavaId: java.defaultJavaId,
          rootDir: rootDir.path || undefined,
          mode,
          official,
          clientId: mode === "official" ? iGM_Launcher_Msa_ResolveClientId() : undefined,
        });
        if (!result.success) return iGM_Launcher_Fail(result.code, result.message);

        const now = new Date().toISOString();
        const next = instances.map((item) =>
          item.id === instance.id ? { ...item, lastPlayedAt: now, updatedAt: now } : item,
        );
        await iGM_Launcher_WriteJson(IGM_LAUNCHER_INSTANCES_FILE, { instances: next });
        const updated = next.find((item) => item.id === instance.id) ?? instance;
        return iGM_Launcher_Ok({ status: result.status, instance: updated, instances: next });
      }

      /* 查询启动状态：不带实例 id 时取最近一次启动的实例；无记录返回 null */
      case "instance:launch-status":
        return iGM_Launcher_Ok({ status: iGM_Launcher_Launch_Status(params.id) });

      /*
        模块二十补充：扫描实例目录，列出已安装的模组 / 光影 / 材质包 / 数据包。
        仅启动器端可用（网站端不暴露该能力）；只读取文件元数据
        （名称 / 大小 / 修改时间），不改动、不复制任何文件；
        目录不存在或不可读时如实返回 exists=false，绝不虚构文件列表。
      */
      case "instance:resources": {
        const dir = params.instanceDir?.trim() ?? "";
        if (!dir) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少实例目录");
        }
        const groups: iGM_Launcher_InstanceResourceGroup[] = [];
        let total = 0;
        for (const sub of Object.values(IGM_LAUNCHER_THIRD_PARTY_INSTANCE_SUBDIRS)) {
          const target = join(dir, sub);
          const group: iGM_Launcher_InstanceResourceGroup = {
            key: sub,
            dir: target,
            exists: false,
            files: [],
          };
          try {
            const entries = await readdir(target, { withFileTypes: true });
            group.exists = true;
            const files: iGM_Launcher_InstanceResourceFile[] = [];
            for (const entry of entries) {
              if (!entry.isFile()) continue;
              const absolute = join(target, entry.name);
              try {
                const info = await stat(absolute);
                files.push({
                  name: entry.name,
                  path: absolute,
                  size: info.size,
                  modifiedAt: info.mtime.toISOString(),
                });
              } catch {
                /* 单个文件不可读时跳过，不影响其余条目 */
              }
            }
            // 最近修改的排在前面，便于用户确认刚放进去的资源
            files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
            group.files = files;
            total += files.length;
          } catch {
            /* 目录不存在或不可读：如实标记 exists=false */
          }
          groups.push(group);
        }
        return iGM_Launcher_Ok({ resources: { dir, groups, total } });
      }

      /* ---------- Java 运行时 ---------- */
      case "java:list": {
        const file = await iGM_Launcher_LoadJava();
        return iGM_Launcher_Ok({ javas: file.javas, defaultJavaId: file.defaultJavaId });
      }

      case "java:detect": {
        const file = await iGM_Launcher_LoadJava();
        // 按规范化路径去重（大小写不敏感），避免同一条运行时被登记两次
        const key = (value: string) => normalize(value).toLowerCase();
        const known = new Map(file.javas.map((item) => [key(item.path), item]));
        const added: iGM_Launcher_JavaRuntime[] = [];

        // 真实扫描本机文件系统并逐个运行 -version 探测，只登记真实存在的可执行文件
        for (const probe of iGM_Launcher_Java_Scan()) {
          const existed = known.get(key(probe.path));
          if (existed) {
            // 已登记：用真实探测结果刷新版本 / 发行版 / 架构与可用性，
            // 占位时期登记的幽灵路径会因此被如实标记为不可用
            existed.version = probe.ok ? probe.version : existed.version;
            existed.vendor = probe.ok ? probe.vendor : existed.vendor;
            existed.arch = probe.ok ? probe.arch : existed.arch;
            existed.available = probe.ok;
            continue;
          }
          added.push({
            id: iGM_Launcher_NewId("java"),
            name: `${IGM_LAUNCHER_JAVA_VENDOR_LABELS[probe.vendor]} Java ${probe.version}`,
            path: probe.path,
            version: probe.version,
            vendor: probe.vendor,
            arch: probe.arch,
            source: "system",
            addedAt: new Date().toISOString(),
            available: probe.ok,
          });
        }

        // 已登记但文件已消失（卸载或换机）：如实标记为不可用，不擅自删除记录
        for (const runtime of file.javas) {
          if (!existsSync(normalize(runtime.path))) runtime.available = false;
        }

        const javas = [...file.javas, ...added];
        const defaultJavaId = file.defaultJavaId ?? javas[0]?.id ?? null;
        await iGM_Launcher_WriteJson(IGM_LAUNCHER_JAVA_FILE, { javas, defaultJavaId });
        return iGM_Launcher_Ok({
          javas,
          defaultJavaId,
          added,
        });
      }

      case "java:add": {
        if (!params.path || !params.name) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少 Java 名称或路径");
        }
        // 添加前真实校验路径：不存在的可执行文件不予登记，避免留下无法启动的幽灵记录
        const addedPath = normalize(params.path);
        if (!existsSync(addedPath)) {
          return iGM_Launcher_Fail(
            IGM_LAUNCHER_BRIDGE_INVALID,
            `该路径不存在：${params.path}（请填写 java.exe 的完整路径）`,
          );
        }
        const addedProbe = iGM_Launcher_Java_Probe(addedPath);
        const file = await iGM_Launcher_LoadJava();
        const runtime: iGM_Launcher_JavaRuntime = {
          id: iGM_Launcher_NewId("java"),
          name: params.name,
          path: addedPath,
          version: addedProbe.ok ? addedProbe.version : (params.version ?? "unknown"),
          vendor: addedProbe.ok ? addedProbe.vendor : (params.vendor ?? "unknown"),
          arch: addedProbe.arch,
          source: "manual",
          addedAt: new Date().toISOString(),
          available: addedProbe.ok,
        };
        const javas = [...file.javas, runtime];
        const defaultJavaId = file.defaultJavaId ?? runtime.id;
        await iGM_Launcher_WriteJson(IGM_LAUNCHER_JAVA_FILE, { javas, defaultJavaId });
        return iGM_Launcher_Ok({ javas, defaultJavaId });
      }

      case "java:remove": {
        if (!params.id) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少 Java id");
        }
        const file = await iGM_Launcher_LoadJava();
        const javas = file.javas.filter((item) => item.id !== params.id);
        const defaultJavaId =
          file.defaultJavaId === params.id ? (javas[0]?.id ?? null) : file.defaultJavaId;
        await iGM_Launcher_WriteJson(IGM_LAUNCHER_JAVA_FILE, { javas, defaultJavaId });
        return iGM_Launcher_Ok({ javas, defaultJavaId });
      }

      case "java:test": {
        if (!params.id) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少 Java id");
        }
        const file = await iGM_Launcher_LoadJava();
        const index = file.javas.findIndex((item) => item.id === params.id);
        if (index < 0) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "Java 不存在");
        // 真实探测：运行 <java> -version，可用性、版本、发行版与架构一律以实际结果为准
        const probe = iGM_Launcher_Java_Probe(file.javas[index].path);
        const runtime: iGM_Launcher_JavaRuntime = {
          ...file.javas[index],
          version: probe.ok ? probe.version : file.javas[index].version,
          vendor: probe.ok ? probe.vendor : file.javas[index].vendor,
          arch: probe.ok ? probe.arch : file.javas[index].arch,
          available: probe.ok,
        };
        const javas = [...file.javas];
        javas[index] = runtime;
        await iGM_Launcher_WriteJson(IGM_LAUNCHER_JAVA_FILE, {
          javas,
          defaultJavaId: file.defaultJavaId,
        });
        return iGM_Launcher_Ok({ javas, runtime });
      }

      case "java:set-default": {
        if (!params.id) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少 Java id");
        }
        const file = await iGM_Launcher_LoadJava();
        if (!file.javas.some((item) => item.id === params.id)) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "Java 不存在");
        }
        await iGM_Launcher_WriteJson(IGM_LAUNCHER_JAVA_FILE, {
          javas: file.javas,
          defaultJavaId: params.id,
        });
        return iGM_Launcher_Ok({ javas: file.javas, defaultJavaId: params.id });
      }

      case "java:download":
        // 下载能力占位：界面侧自行演示进度，桥接层不落盘、不联网
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
          "Java 下载为占位能力，真实下载留待后续模块",
        );

      /* ---------- 账户 ---------- */
      case "account:get-current":
        return iGM_Launcher_Ok({ account: await iGM_Launcher_LoadAccount() });

      case "account:login": {
        const accountField = params.account?.trim() ?? "";
        const password = params.password ?? "";
        if (!accountField || !password) {
          return iGM_Launcher_Fail(
            IGM_LAUNCHER_BRIDGE_INVALID,
            "请输入账号与密码",
          );
        }
        // 真实调用主站登录接口：account 支持邮箱或用户名，
        // 返回的 iGMUid 等用户数据与官网完全一致
        const result = await iGM_Launcher_ApiRequest<iGM_Launcher_SiteUserData>(
          IGM_LAUNCHER_API_LOGIN_PATH,
          { body: { account: accountField, password } },
        );
        return iGM_Launcher_ResolveAccount(result);
      }

      case "account:logout": {
        const previous = await iGM_Launcher_LoadAccount();
        // 尽力通知主站销毁会话；失败不影响本地退出
        if (previous.token) {
          await iGM_Launcher_ApiRequest(IGM_LAUNCHER_API_LOGOUT_PATH, {
            sessionCookie: previous.token,
          });
        }
        const account = iGM_Launcher_CreateGuestSession();
        await iGM_Launcher_SaveAccount(account);
        return iGM_Launcher_Ok({ account });
      }

      case "account:sync": {
        const account = await iGM_Launcher_LoadAccount();
        if (!account.signedIn) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "未登录，无法同步");
        }
        // 携带本地会话 Cookie 调主站 /G_Auth/me，刷新资料与 iGMUid
        const result = await iGM_Launcher_ApiRequest<iGM_Launcher_SiteUserData>(
          IGM_LAUNCHER_API_ME_PATH,
          { method: "GET", sessionCookie: account.token },
        );
        if (result.reached && result.status === 401) {
          // 主站会话已失效：退回游客态，提示重新登录
          await iGM_Launcher_SaveAccount(iGM_Launcher_CreateGuestSession());
        }
        return iGM_Launcher_ResolveAccount(result, account.token);
      }

      case "account:restore-session": {
        const local = await iGM_Launcher_LoadAccount();
        if (!local.signedIn || !local.token) {
          return iGM_Launcher_Ok({ account: local }, "本地无有效会话，按离线模式启动");
        }
        // 携带本地凭证调主站 /G_Auth/me 校验并刷新资料
        const result = await iGM_Launcher_ApiRequest<iGM_Launcher_SiteUserData>(
          IGM_LAUNCHER_API_ME_PATH,
          { method: "GET", sessionCookie: local.token },
        );
        if (result.reached && result.status === 401) {
          const guest = iGM_Launcher_CreateGuestSession();
          await iGM_Launcher_SaveAccount(guest);
          return iGM_Launcher_Ok({ account: guest }, "社区账号会话已失效，已退回离线模式");
        }
        if (!result.reached) {
          // 主站不可达：保留本地会话（离线可用），并如实提示
          return iGM_Launcher_Ok({ account: local }, "主站不可达，已恢复本地会话");
        }
        return iGM_Launcher_ResolveAccount(result, local.token);
      }

      /*
        模块二十补充：在系统文件管理器中打开下载文件所在目录。
        用 Electrobun 的 Utils.openExternal 交给系统默认程序处理（原生调用）；
        系统未接管时如实返回 opened=false，界面回退为展示路径文本。
      */
      case "shell:open-path": {
        const target = params.openPath?.trim() ?? "";
        if (!target) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少要打开的路径");
        }
        try {
          const electrobun = (await import("electrobun/main")) as {
            Utils?: { openExternal?: (value: string) => boolean };
          };
          const opened = electrobun.Utils?.openExternal?.(target) ?? false;
          return iGM_Launcher_Ok({ opened });
        } catch (error) {
          return iGM_Launcher_Fail(
            IGM_LAUNCHER_BRIDGE_FAILED,
            error instanceof Error ? error.message : "无法打开该路径",
          );
        }
      }

      default:
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
          `未实现的桥接方法：${String(method)}`,
        );
    }
  } catch (error) {
    console.error("[iGM_Launcher_Bridge] 调用失败：", method, error);
    // 认证链的业务错误码必须原样透传：未登录（401）、未拥有 Java 版（4001）、
    // 流程过期（4002）、XSTS XErr（2148916xxx）等，界面据此给出可操作提示；
    // 统一压成 500 会让所有正版验证失败都退化成同一句无信息量的通用提示。
    if (error instanceof iGM_Launcher_MsaError) {
      return iGM_Launcher_Fail(error.code, error.message);
    }
    return iGM_Launcher_Fail(
      IGM_LAUNCHER_BRIDGE_FAILED,
      error instanceof Error ? error.message : "桥接层内部错误",
    );
  }
}

/** 数据根目录常量再导出，便于主进程日志提示 */
export const IGM_LAUNCHER_BRIDGE_DATA_ROOT = IGM_LAUNCHER_DATA_ROOT;

// 导出 //
export default iGM_Launcher_Bridge_Call;