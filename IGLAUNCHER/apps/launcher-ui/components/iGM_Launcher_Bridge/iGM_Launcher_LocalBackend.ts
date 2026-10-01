/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Bridge/iGM_Launcher_LocalBackend.ts
 * 所属层：前端 / 桥接回退层
 * 路由：全局
 * 模块：iGM_Launcher_LocalBackend
 * 作用：普通浏览器（next dev）中无桌面外壳时的本地回退实现，
 *       以 localStorage 模拟 apps/shell 桥接层的落盘行为
 * 内容：与 iGM_Launcher_Bridge.ts 同名同参的方法集合，返回同样的
 *       { success, code, message, data } 结构，保证界面在两种运行环境下行为一致；
 *       模块八 instance:launch / instance:launch-status 在浏览器内如实拒绝（无法拉起本机进程）；
 *       模块九 java:detect / java:test 同样如实拒绝（浏览器无权读取本机磁盘、无法运行 java -version）；
 *       模块二十 thirdParty:* 与 shell:open-path 一并如实拒绝（下载落盘与系统文件管理器均为原生能力）
 *
 * 说明：Electrobun 外壳内的真实读写由 apps/shell/src/iGM_Launcher_Bridge.ts 承担；
 *       本文件只在浏览器调试时启用，账户登录 / 同步同样直连主站 API，
 *       但受跨域限制通常不可达，此时提示改用离线模式，绝不伪造 iGMUid。
 */

// 导入依赖 //
import {
  IGM_LAUNCHER_API_BASE,
  IGM_LAUNCHER_API_LOGIN_PATH,
  IGM_LAUNCHER_API_ME_PATH,
  IGM_LAUNCHER_API_TIMEOUT_MS,
  IGM_LAUNCHER_BRIDGE_FAILED,
  IGM_LAUNCHER_BRIDGE_INVALID,
  IGM_LAUNCHER_BRIDGE_NOT_FOUND,
  IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
  IGM_LAUNCHER_BRIDGE_OK,
  IGM_LAUNCHER_BRIDGE_UNAUTHORIZED,
  IGM_LAUNCHER_BRIDGE_UNREACHABLE,
  IGM_LAUNCHER_API_MC_VERSIONS_PATH,
  IGM_LAUNCHER_CORE_PLACEHOLDER_VERSION,
  IGM_LAUNCHER_LOCAL_DATA_STORAGE_KEY,
  IGM_LAUNCHER_VERSION_LIBRARY_PAGE_SIZE,
  iGM_Launcher_BuildInstanceRecord,
  iGM_Launcher_CheckInstanceName,
  iGM_Launcher_CreateGuestSession,
  iGM_Launcher_EmptyVersionLibrary,
  iGM_Launcher_MapSiteUser,
  iGM_Launcher_NewId,
  iGM_Launcher_NormalizeVersionType,
  type iGM_Launcher_AccountSession,
  type iGM_Launcher_BridgeMethod,
  type iGM_Launcher_BridgeParams,
  type iGM_Launcher_BridgeResponse,
  type iGM_Launcher_JavaRuntime,
  type iGM_Launcher_LocalData,
  type iGM_Launcher_SiteEnvelope,
  type iGM_Launcher_SiteUser,
  type iGM_Launcher_VersionLibraryEntry,
} from "@igm-launcher/shared";

// 类型定义 //

/** 浏览器回退层的 Minecraft 绑定不可用提示：原生认证能力只存在于桌面外壳 */
const IGM_LAUNCHER_LOCAL_MC_UNAVAILABLE =
  "浏览器调试环境无法完成微软正版认证（跨站限制），请在 iGM 启动器应用内完成绑定";

/**
 * 浏览器回退层的文件系统能力提示：浏览器无权读取本机磁盘，
 * 目录扫描与实例导入只能由桌面外壳（主进程）完成，此处如实拒绝而非伪造结果。
 */
const IGM_LAUNCHER_LOCAL_FS_UNAVAILABLE =
  "浏览器调试环境无法读取本机文件系统，请在 iGM 启动器应用内完成目录扫描与实例导入";

/**
 * 浏览器回退层的原生能力提示：真实下载与系统目录选择器都需要主进程的文件系统与
 * 原生对话框，浏览器两者皆无，此处如实拒绝，绝不用假进度蒙混过关。
 */
const IGM_LAUNCHER_LOCAL_DOWNLOAD_UNAVAILABLE =
  "浏览器调试环境无法写入本机磁盘，也无法打开系统目录选择器，请手动输入路径并在 iGM 启动器应用内执行下载";

/**
 * 浏览器回退层的离线启动提示：离线启动需要读取游戏文件、解压 natives 并拉起
 * 本机 Java 进程，浏览器两者皆无，此处如实拒绝，绝不伪造「已启动」状态。
 */
const IGM_LAUNCHER_LOCAL_LAUNCH_UNAVAILABLE =
  "浏览器调试环境无法拉起本机 Java 进程，请在 iGM 启动器应用内启动游戏";

/**
 * 浏览器回退层的 Java 检测提示：检测需要遍历本机安装目录并运行 java -version，
 * 浏览器两者皆无，此处如实拒绝，绝不登记或伪造任何 Java 运行时。
 */
const IGM_LAUNCHER_LOCAL_JAVA_UNAVAILABLE =
  "浏览器调试环境无法读取本机文件系统，检测与测试 Java 请在 iGM 启动器应用内执行";

/**
 * 浏览器回退层的第三方资源提示：资源搜索、详情与下载任务均由主站后端统一管理，
 * 但下载文件必须落到本机磁盘（浏览器无权写入），也依赖桌面外壳原生能力，
 * 因此 thirdParty:* 一律如实拒绝，绝不用假列表或假进度蒙混过关。
 */
const IGM_LAUNCHER_LOCAL_THIRD_PARTY_UNAVAILABLE =
  "浏览器调试环境无法写入本机磁盘，第三方资源下载请在 iGM 启动器应用内进行";

/** 浏览器回退层必须拒绝的模块七原生方法（依赖主进程的文件系统与原生对话框） */
const IGM_LAUNCHER_LOCAL_MC_NATIVE: ReadonlySet<string> = new Set([
  "minecraft:download-loader-versions",
  "minecraft:download-start",
  "minecraft:download-status",
  "minecraft:download-cancel",
  "minecraft:pick-dir",
]);

/** 浏览器回退层可读不可写的 minecraft:* 方法集合 */
const IGM_LAUNCHER_LOCAL_MC_READONLY: ReadonlySet<string> = new Set([
  "minecraft:scan-dirs",
  "minecraft:library",
  "minecraft:sync-versions",
]);

// 核心逻辑 //

/** 读取本地数据快照，缺失或解析失败时返回初始快照 */
function iGM_Launcher_LocalRead(): iGM_Launcher_LocalData {
  const empty: iGM_Launcher_LocalData = {
    instances: [],
    javas: [],
    defaultJavaId: null,
    account: iGM_Launcher_CreateGuestSession(),
    mcBindings: [],
    gameDirs: [],
    versionLibrary: iGM_Launcher_EmptyVersionLibrary(),
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(IGM_LAUNCHER_LOCAL_DATA_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<iGM_Launcher_LocalData>;
    return {
      instances: Array.isArray(parsed.instances) ? parsed.instances : [],
      javas: Array.isArray(parsed.javas) ? parsed.javas : [],
      defaultJavaId: parsed.defaultJavaId ?? null,
      account: parsed.account ?? empty.account,
      mcBindings: Array.isArray(parsed.mcBindings) ? parsed.mcBindings : [],
      gameDirs: Array.isArray(parsed.gameDirs) ? parsed.gameDirs : [],
      versionLibrary: parsed.versionLibrary ?? empty.versionLibrary,
    };
  } catch {
    return empty;
  }
}

/** 写入本地数据快照 */
function iGM_Launcher_LocalWrite(data: iGM_Launcher_LocalData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IGM_LAUNCHER_LOCAL_DATA_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 忽略写入失败（隐私模式等），界面仍以内存状态工作
  }
}

/** 成功响应 */
function iGM_Launcher_Ok<T>(data: T, message = "ok"): iGM_Launcher_BridgeResponse<T> {
  return { success: true, code: IGM_LAUNCHER_BRIDGE_OK, message, data };
}

/** 失败响应 */
function iGM_Launcher_Fail(code: number, message: string): iGM_Launcher_BridgeResponse {
  return { success: false, code, message, data: null };
}

/**
 * 浏览器直连主站 API 的请求封装。
 * 与桌面外壳不同，浏览器受同源策略约束：主站 CORS 白名单未包含启动器调试端口，
 * 因此本机浏览器调试环境下请求通常会被拦截，此处统一返回 reached=false，
 * 由调用方提示改用离线模式——绝不伪造 iGMUid。
 */
async function iGM_Launcher_ApiFetch<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<{ reached: boolean; status: number; envelope: iGM_Launcher_SiteEnvelope<T> | null }> {
  const { method = "POST", body } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IGM_LAUNCHER_API_TIMEOUT_MS);
  try {
    const response = await fetch(`${IGM_LAUNCHER_API_BASE}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: method === "POST" && body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let envelope: iGM_Launcher_SiteEnvelope<T> | null = null;
    try {
      envelope = (await response.json()) as iGM_Launcher_SiteEnvelope<T>;
    } catch {
      envelope = null;
    }
    return { reached: true, status: response.status, envelope };
  } catch {
    return { reached: false, status: 0, envelope: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 归一化主站认证响应并写入本地快照：
 * 不可达（含跨域被拦截）返回 503，提示改用离线模式，不伪造 uid；
 * 主站业务错误透传其状态码与文案键。
 */
function iGM_Launcher_ResolveSiteAccount(
  result: { reached: boolean; status: number; envelope: iGM_Launcher_SiteEnvelope<{ user: iGM_Launcher_SiteUser }> | null },
  data: iGM_Launcher_LocalData,
): iGM_Launcher_BridgeResponse {
  if (!result.reached) {
    return iGM_Launcher_Fail(
      IGM_LAUNCHER_BRIDGE_UNREACHABLE,
      "浏览器调试环境无法直连主站 API（跨域限制）",
    );
  }
  const user = result.envelope?.data?.user;
  if (!result.envelope?.success || !user) {
    const code = result.envelope?.code ?? result.status;
    return iGM_Launcher_Fail(
      code > 0 ? code : IGM_LAUNCHER_BRIDGE_FAILED,
      result.envelope?.message ?? "主站返回了无法解析的响应",
    );
  }
  // 浏览器无法读取跨域 Set-Cookie，token 留空，同步时依赖同源会话
  const account: iGM_Launcher_AccountSession = iGM_Launcher_MapSiteUser(user, "");
  iGM_Launcher_LocalWrite({ ...data, account });
  return iGM_Launcher_Ok({ account }, result.envelope.message || "ok");
}

/* ---------- 模块三：Minecraft 正版绑定的浏览器回退实现 ---------- */

/**
 * 浏览器回退层的模块三分支。
 * 正版绑定依赖主进程的加密存储与完整微软认证链，而 Xbox Live / XSTS /
 * Minecraft Services 均不返回 CORS 头，浏览器环境无法完成认证，
 * 因此除只读的绑定列表外一律明确拒绝，绝不生成本地占位绑定。
 */
function iGM_Launcher_LocalMc(
  method: iGM_Launcher_BridgeMethod,
  data: iGM_Launcher_LocalData,
): iGM_Launcher_BridgeResponse {
  if (!data.account.signedIn) {
    return iGM_Launcher_Fail(
      IGM_LAUNCHER_BRIDGE_UNAUTHORIZED,
      "请先登录社区账号后再绑定 Minecraft 正版账号",
    );
  }
  const uid = data.account.uid;

  // 只读列表：浏览器内不会产生绑定，如实反映本地快照即可
  if (method === "mc:list-bindings") {
    return iGM_Launcher_Ok({
      mcBindings: data.mcBindings.filter((item) => item.communityUid === uid),
    });
  }

  return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED, IGM_LAUNCHER_LOCAL_MC_UNAVAILABLE);
}

/* ---------- 模块五：离线游戏 / 目录扫描 / 版本库同步的浏览器回退实现 ---------- */

/** 主站版本列表单条数据（与 iGM_MinecraftVersionDto 一致的镜像） */
interface iGM_Launcher_LocalApiVersionItem {
  id?: unknown;
  version?: unknown;
  type?: unknown;
  releaseTime?: unknown;
  totalSize?: unknown;
  installed?: unknown;
}

/** 主站版本列表分页数据 */
interface iGM_Launcher_LocalApiVersionListData {
  items: iGM_Launcher_LocalApiVersionItem[];
  total: number;
}

/**
 * 浏览器回退层的模块五分支。
 * 目录扫描与实例导入依赖主进程的文件系统访问，浏览器无权读取本机磁盘，
 * 因此写操作与真实扫描一律明确拒绝；版本库缓存与远端同步尽力而为。
 */
async function iGM_Launcher_LocalMinecraft(
  method: iGM_Launcher_BridgeMethod,
  data: iGM_Launcher_LocalData,
  params: iGM_Launcher_BridgeParams = {},
): Promise<iGM_Launcher_BridgeResponse> {
  // 模块六：实例名校验只比对本地实例名，不依赖文件系统，可如实执行
  if (method === "minecraft:validate-instance-name") {
    return iGM_Launcher_Ok({
      check: iGM_Launcher_CheckInstanceName(
        params.instanceName ?? "",
        data.instances.map((item) => item.name),
      ),
    });
  }

  // 模块六：浏览器无法探测本机磁盘，默认根目录如实返回「待创建」空路径
  if (method === "minecraft:default-root-dir") {
    return iGM_Launcher_Ok(
      { rootDir: { path: "", exists: false, isDefault: true, source: "system-default" } },
      IGM_LAUNCHER_LOCAL_FS_UNAVAILABLE,
    );
  }

  // 模块七：真实下载与系统目录选择器依赖主进程的文件系统与原生对话框，浏览器内一律如实拒绝
  if (IGM_LAUNCHER_LOCAL_MC_NATIVE.has(method)) {
    return iGM_Launcher_Fail(
      IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
      IGM_LAUNCHER_LOCAL_DOWNLOAD_UNAVAILABLE,
    );
  }

  if (!IGM_LAUNCHER_LOCAL_MC_READONLY.has(method)) {
    return iGM_Launcher_Fail(
      IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
      IGM_LAUNCHER_LOCAL_FS_UNAVAILABLE,
    );
  }

  // 只读：扫描结果无法在浏览器内产生，如实回传已落盘的目录登记（结果为空）
  if (method === "minecraft:scan-dirs") {
    return iGM_Launcher_Ok({ gameDirs: data.gameDirs, results: [] }, IGM_LAUNCHER_LOCAL_FS_UNAVAILABLE);
  }

  // 只读：版本库缓存快照（不联网）
  if (method === "minecraft:library") {
    return iGM_Launcher_Ok({ library: data.versionLibrary });
  }

  // 同步：浏览器通常受跨域限制不可达，失败时保留本地缓存
  const entries: iGM_Launcher_VersionLibraryEntry[] = [];
  let total = 0;
  for (let page = 1; page <= 10; page += 1) {
    const result = await iGM_Launcher_ApiFetch<iGM_Launcher_LocalApiVersionListData>(
      `${IGM_LAUNCHER_API_MC_VERSIONS_PATH}?page=${page}&pageSize=${IGM_LAUNCHER_VERSION_LIBRARY_PAGE_SIZE}`,
      { method: "GET" },
    );
    const payload = result.envelope?.data;
    if (!result.reached || !result.envelope?.success || !payload?.items) {
      return {
        success: false,
        code: result.reached
          ? (result.envelope?.code ?? result.status ?? IGM_LAUNCHER_BRIDGE_FAILED)
          : IGM_LAUNCHER_BRIDGE_UNREACHABLE,
        message: result.envelope?.message ?? "版本库同步失败，已保留本地缓存",
        data: { library: data.versionLibrary },
      };
    }
    total = typeof payload.total === "number" ? payload.total : payload.items.length;
    for (const item of payload.items) {
      const versionId = typeof item.id === "string" ? item.id : "";
      const version = typeof item.version === "string" ? item.version : "";
      if (!versionId || !version) continue;
      const installed = data.instances.some(
        (record) => record.minecraftVersion.toLowerCase() === version.toLowerCase(),
      );
      entries.push({
        id: versionId,
        version,
        type: iGM_Launcher_NormalizeVersionType(item.type),
        releaseTime: typeof item.releaseTime === "string" ? item.releaseTime : null,
        totalSize: typeof item.totalSize === "number" ? item.totalSize : null,
        installed: installed || item.installed === true,
      });
    }
    if (entries.length >= total || payload.items.length === 0) break;
  }

  const library = {
    entries,
    syncedAt: new Date().toISOString(),
    source: "remote" as const,
    total,
  };
  iGM_Launcher_LocalWrite({ ...data, versionLibrary: library });
  return iGM_Launcher_Ok({ library });
}

/**
 * 本地回退调用入口：方法名与 apps/shell/src/iGM_Launcher_Bridge.ts 完全一致。
 */
export async function iGM_Launcher_LocalBackend_Call(
  method: iGM_Launcher_BridgeMethod,
  params: iGM_Launcher_BridgeParams = {},
): Promise<iGM_Launcher_BridgeResponse> {
  try {
    const data = iGM_Launcher_LocalRead();

    // 模块三：浏览器内正版绑定不可用，统一前置分流为明确拒绝
    if (String(method).startsWith("mc:")) {
      return iGM_Launcher_LocalMc(method, data);
    }

    // 模块五 / 模块六：离线游戏分支（目录扫描、版本解析、实例导入、版本库同步、
    // 已安装版本与加载器、默认根目录、实例名校验）
    if (String(method).startsWith("minecraft:")) {
      return await iGM_Launcher_LocalMinecraft(method, data, params);
    }

    // 模块二十：第三方资源（Modrinth / Fabric）需要本机磁盘与原生能力，浏览器内一律如实拒绝
    if (String(method).startsWith("thirdParty:")) {
      return iGM_Launcher_Fail(
        IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
        IGM_LAUNCHER_LOCAL_THIRD_PARTY_UNAVAILABLE,
      );
    }

    switch (method) {
      case "app:load":
        return iGM_Launcher_Ok({ data });

      // 模块七：浏览器回退层无安装程序落盘的配置，语言一律交回界面自行收敛
      case "app:locale":
        return iGM_Launcher_Ok({ locale: null });

      case "core:status":
        return iGM_Launcher_Ok({
          core: {
            loaded: false,
            version: IGM_LAUNCHER_CORE_PLACEHOLDER_VERSION,
            initResult: 0,
          },
        });

      /* ---------- 实例管理 ---------- */
      case "instance:list":
        return iGM_Launcher_Ok({ instances: data.instances });

      case "instance:get": {
        const instance = data.instances.find((item) => item.id === params.id);
        if (!instance) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "实例不存在");
        return iGM_Launcher_Ok({ instance });
      }

      case "instance:create": {
        if (!params.instance) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少实例数据");
        }
        // 与桌面外壳一致：实例名重名直接拒绝
        const check = iGM_Launcher_CheckInstanceName(
          params.instance.name ?? "",
          data.instances.map((item) => item.name),
        );
        if (!check.valid) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "实例名不可用");
        }
        const record = iGM_Launcher_BuildInstanceRecord(params.instance);
        const instances = [...data.instances, record];
        iGM_Launcher_LocalWrite({ ...data, instances });
        return iGM_Launcher_Ok({ instance: record, instances });
      }

      case "instance:update": {
        if (!params.id || !params.patch) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少实例 id 或更新字段");
        }
        const index = data.instances.findIndex((item) => item.id === params.id);
        if (index < 0) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "实例不存在");
        const updated = {
          ...data.instances[index],
          ...params.patch,
          updatedAt: new Date().toISOString(),
        };
        const instances = [...data.instances];
        instances[index] = updated;
        iGM_Launcher_LocalWrite({ ...data, instances });
        return iGM_Launcher_Ok({ instance: updated, instances });
      }

      case "instance:delete": {
        if (!params.id) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少实例 id");
        }
        const instances = data.instances.filter((item) => item.id !== params.id);
        if (instances.length === data.instances.length) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "实例不存在");
        }
        iGM_Launcher_LocalWrite({ ...data, instances });
        return iGM_Launcher_Ok({ instances });
      }

      /* ---------- 模块八：离线启动（浏览器内如实拒绝） ---------- */
      case "instance:launch":
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
          IGM_LAUNCHER_LOCAL_LAUNCH_UNAVAILABLE,
        );

      /* 浏览器内不存在真实进程，启动状态如实返回 null */
      case "instance:launch-status":
        return iGM_Launcher_Ok({ status: null });

      /* 扫描实例资源需要读取本机磁盘，浏览器内如实拒绝 */
      case "instance:resources":
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
          IGM_LAUNCHER_LOCAL_FS_UNAVAILABLE,
        );

      /* ---------- Java 运行时 ---------- */
      case "java:list":
        return iGM_Launcher_Ok({
          javas: data.javas,
          defaultJavaId: data.defaultJavaId,
        });

      case "java:detect": {
        // 浏览器无权读取本机磁盘、也无法运行 java -version，如实拒绝而非登记假路径
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
          IGM_LAUNCHER_LOCAL_JAVA_UNAVAILABLE,
        );
      }

      case "java:add": {
        if (!params.path || !params.name) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少 Java 名称或路径");
        }
        const runtime: iGM_Launcher_JavaRuntime = {
          id: iGM_Launcher_NewId("java"),
          name: params.name,
          path: params.path,
          version: params.version ?? "unknown",
          vendor: params.vendor ?? "unknown",
          arch: "x64",
          source: "manual",
          addedAt: new Date().toISOString(),
          // 浏览器无法校验路径、更无法运行二进制，可用性如实标为 false
          available: false,
        };
        const javas = [...data.javas, runtime];
        const defaultJavaId = data.defaultJavaId ?? runtime.id;
        iGM_Launcher_LocalWrite({ ...data, javas, defaultJavaId });
        return iGM_Launcher_Ok({ javas, defaultJavaId });
      }

      case "java:remove": {
        if (!params.id) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少 Java id");
        }
        const javas = data.javas.filter((item) => item.id !== params.id);
        const defaultJavaId =
          data.defaultJavaId === params.id ? (javas[0]?.id ?? null) : data.defaultJavaId;
        iGM_Launcher_LocalWrite({ ...data, javas, defaultJavaId });
        return iGM_Launcher_Ok({ javas, defaultJavaId });
      }

      case "java:test": {
        if (!params.id) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少 Java id");
        }
        const index = data.javas.findIndex((item) => item.id === params.id);
        if (index < 0) return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "Java 不存在");
        // 浏览器无法运行 java -version，如实拒绝，绝不伪造「测试通过」
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
          IGM_LAUNCHER_LOCAL_JAVA_UNAVAILABLE,
        );
      }

      case "java:set-default": {
        if (!params.id) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "缺少 Java id");
        }
        if (!data.javas.some((item) => item.id === params.id)) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_NOT_FOUND, "Java 不存在");
        }
        iGM_Launcher_LocalWrite({ ...data, defaultJavaId: params.id });
        return iGM_Launcher_Ok({ javas: data.javas, defaultJavaId: params.id });
      }

      case "java:download":
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
          "Java 下载为占位能力，真实下载留待后续模块",
        );

      /* ---------- 账户 ---------- */
      case "account:get-current":
        return iGM_Launcher_Ok({ account: data.account });

      case "account:login": {
        const accountField = params.account?.trim() ?? "";
        if (!accountField || !params.password) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "请输入账号与密码");
        }
        // 与桌面外壳一致：真实调用主站登录接口，iGMUid 取自主站返回值
        const result = await iGM_Launcher_ApiFetch<{ user: iGM_Launcher_SiteUser }>(
          IGM_LAUNCHER_API_LOGIN_PATH,
          { body: { account: accountField, password: params.password } },
        );
        return iGM_Launcher_ResolveSiteAccount(result, data);
      }

      case "account:logout": {
        const account = iGM_Launcher_CreateGuestSession();
        iGM_Launcher_LocalWrite({ ...data, account });
        return iGM_Launcher_Ok({ account });
      }

      case "account:sync": {
        if (!data.account.signedIn) {
          return iGM_Launcher_Fail(IGM_LAUNCHER_BRIDGE_INVALID, "未登录，无法同步");
        }
        // 浏览器以同源会话 Cookie 调主站 /G_Auth/me 刷新资料与 iGMUid
        const result = await iGM_Launcher_ApiFetch<{ user: iGM_Launcher_SiteUser }>(
          IGM_LAUNCHER_API_ME_PATH,
          { method: "GET" },
        );
        return iGM_Launcher_ResolveSiteAccount(result, data);
      }

      case "account:restore-session": {
        // 浏览器回退层无本地凭证文件，直接返回已落盘的会话：
        // 未登录保持游客，已登录保留本地会话（不联网校验，避免跨域拦截导致误登出）
        return iGM_Launcher_Ok({ account: data.account }, "已恢复本地会话");
      }

      /* 模块二十补充：浏览器无法调起系统文件管理器，如实拒绝（界面回退展示路径文本） */
      case "shell:open-path":
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
          IGM_LAUNCHER_LOCAL_FS_UNAVAILABLE,
        );

      default:
        return iGM_Launcher_Fail(
          IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
          `未实现的桥接方法：${String(method)}`,
        );
    }
  } catch (error) {
    return iGM_Launcher_Fail(
      IGM_LAUNCHER_BRIDGE_FAILED,
      error instanceof Error ? error.message : "本地回退层内部错误",
    );
  }
}

// 导出 //
export default iGM_Launcher_LocalBackend_Call;