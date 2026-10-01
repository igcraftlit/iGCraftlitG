/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider.tsx
 * 所属层：前端 / 状态层
 * 路由：全局
 * 模块：iGM_Launcher_Store
 * 作用：实例、Java 运行时与账户会话的全局状态中心，承接界面操作并调用桥接层持久化
 * 内容：首帧拉取 app:load；实例增删改查、复制、重命名、离线启动；
 *       Java 检测 / 添加 / 移除 / 测试 / 设为默认；账户登录 / 退出 / 同步；
 *       Minecraft 正版绑定（mc:*：设备代码流 / 浏览器授权流 / 列出 / 绑定 / 解绑 /
 *       设为默认 / 档案 / 拥有权 / 刷新）；
 *       模块五：本机游戏目录扫描与导入、版本库缓存与定时同步（minecraft:*）；
 *       操作结果以本地化提示（notice）回馈界面
 *
 * 说明：所有持久化都经 iGM_Launcher_BridgeCall 完成，
 *       外壳内写入 D:/IGLAUNCHER/data，浏览器内写入 localStorage。
 */

// 导入依赖 //
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_BRIDGE_FORBIDDEN,
  IGM_LAUNCHER_BRIDGE_UNAUTHORIZED,
  IGM_LAUNCHER_BRIDGE_UNREACHABLE,
  IGM_LAUNCHER_INSTANCE_MEMORY_DEFAULT,
  IGM_LAUNCHER_INSTANCE_WINDOW_DEFAULT,
  IGM_LAUNCHER_INSTANCE_JVM_ARGS_DEFAULT,
  IGM_LAUNCHER_MC_NOT_OWNED,
  IGM_LAUNCHER_MC_CLIENT_ID_MISSING,
  IGM_LAUNCHER_MC_FLOW_EXPIRED,
  IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED,
  IGM_LAUNCHER_OFFLINE_DEFAULT_NAME,
  IGM_LAUNCHER_VERSION_SYNC_INTERVAL_MS,
  IGM_LAUNCHER_VERSION_SYNC_STALE_MS,
  iGM_Launcher_CheckInstanceName,
  iGM_Launcher_EmptyVersionLibrary,
  iGM_Launcher_MapXstsErrorKey,
  type iGM_Launcher_AccountSession,
  type iGM_Launcher_BrowserAuthStart,
  type iGM_Launcher_GameDir,
  type iGM_Launcher_GameDirScanResult,
  type iGM_Launcher_InstalledLoader,
  type iGM_Launcher_InstanceInput,
  type iGM_Launcher_InstanceNameCheck,
  type iGM_Launcher_InstanceRecord,
  type iGM_Launcher_RootDirInfo,
  type iGM_Launcher_ScannedVersion,
  type iGM_Launcher_JavaInput,
  type iGM_Launcher_JavaRuntime,
  type iGM_Launcher_LaunchMode,
  type iGM_Launcher_LaunchStatus,
  type iGM_Launcher_MCBinding,
  type iGM_Launcher_MinecraftProfile,
  type iGM_Launcher_MsaDeviceCode,
  type iGM_Launcher_MsaFlowResult,
  type iGM_Launcher_VersionLibrary,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_BridgeCall,
  iGM_Launcher_IsShellHost,
} from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";

// 类型定义 //
/** 界面提示（操作反馈） */
export interface iGM_Launcher_Notice {
  tone: "success" | "error";
  message: string;
}

interface iGM_Launcher_StoreValue {
  /** 首帧数据是否仍在加载 */
  loading: boolean;
  /** 是否运行在 Electrobun 桌面外壳内 */
  isShell: boolean;
  instances: iGM_Launcher_InstanceRecord[];
  javas: iGM_Launcher_JavaRuntime[];
  defaultJavaId: string | null;
  account: iGM_Launcher_AccountSession;
  /** 当前选中实例（状态栏展示） */
  selectedInstanceId: string | null;
  /** 最近一次操作提示 */
  notice: iGM_Launcher_Notice | null;

  clearNotice: () => void;
  selectInstance: (id: string | null) => void;
  /**
   * 新建实例，成功返回新记录。
   * rootDir 为共享根目录，传入后实例 gameDir 固定为 <rootDir>/instances/<实例名>；
   * 缺省时由桥接层按「优先已存在」规则解析（同步 done 后调用会带 rootDir）。
   */
  createInstance: (
    input: iGM_Launcher_InstanceInput,
    rootDir?: string,
  ) => Promise<iGM_Launcher_InstanceRecord | null>;
  updateInstance: (
    id: string,
    patch: Partial<iGM_Launcher_InstanceInput>,
  ) => Promise<boolean>;
  deleteInstance: (id: string) => Promise<boolean>;
  /** 复制实例：自动生成新名称与新目录 */
  duplicateInstance: (id: string) => Promise<boolean>;
  renameInstance: (id: string, name: string) => Promise<boolean>;
  /**
   * 启动实例：用已下载版本真实拉起 Java 进程。
   * mode 为 official 时使用已绑定的微软正版账号身份（可指定 bindingId，缺省取默认绑定）；
   * 缺省或 offline 时使用本地离线角色身份。
   * 成功返回状态快照并刷新上次游玩时间；失败返回 null 并经 notice 提示原因。
   */
  launchInstance: (
    id: string,
    options?: {
      mode?: iGM_Launcher_LaunchMode;
      bindingId?: string;
      rootDir?: string;
    },
  ) => Promise<iGM_Launcher_LaunchStatus | null>;
  /** 最近一次启动状态快照（主进程内存态，重启启动器后清空） */
  lastLaunch: iGM_Launcher_LaunchStatus | null;
  /** 最近一次启动失败原因（成功时为空串），供独立启动进度页内联展示 */
  launchError: string;
  /** 查询启动状态：不带 id 时取最近一次启动的实例，有结果时同步刷新 lastLaunch */
  launchStatus: (id?: string) => Promise<iGM_Launcher_LaunchStatus | null>;

  detectJava: () => Promise<void>;
  addJava: (input: iGM_Launcher_JavaInput) => Promise<boolean>;
  removeJava: (id: string) => Promise<void>;
  testJava: (id: string) => Promise<void>;
  setDefaultJava: (id: string) => Promise<void>;

  /** 账户登录：account 支持邮箱或用户名，由主站真实鉴权 */
  login: (account: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  syncAccount: () => Promise<void>;
  /** 自动恢复会话：读取本地凭证并向主站校验 */
  restoreSession: () => Promise<void>;

  /* ---- 模块五：离线游戏 / 本机游戏目录 / 版本库 ---- */

  /** 已识别的本机 Minecraft 游戏目录 */
  gameDirs: iGM_Launcher_GameDir[];
  /** 最近一次扫描的目录明细（含解析出的版本列表） */
  scanResults: iGM_Launcher_GameDirScanResult[];
  /** 版本库快照（远端同步结果或本地缓存） */
  versionLibrary: iGM_Launcher_VersionLibrary;
  /** 是否正在扫描本机游戏目录 */
  scanningGameDirs: boolean;
  /** 是否正在同步版本库 */
  syncingLibrary: boolean;

  /** 扫描本机常见游戏目录（含已登记目录），结果供实例管理页导入 */
  scanGameDirs: () => Promise<void>;
  /** 手动指定游戏目录并扫描登记 */
  addGameDir: (dirPath: string) => Promise<boolean>;
  /** 移除已登记的目录记录（不动磁盘） */
  removeGameDir: (dirId: string) => Promise<void>;
  /** 设为默认游戏目录 */
  setDefaultGameDir: (dirId: string) => Promise<void>;
  /** 把扫描到的版本导入为实例（目录指向原游戏目录，不复制文件） */
  importInstance: (jsonPath: string, importName?: string) => Promise<boolean>;
  /** 与主站版本资料库同步；silent 为 true 时不提示成功（用于后台定时同步） */
  syncVersionLibrary: (silent?: boolean) => Promise<void>;

  /* ---- 模块六：共享根目录 / 已安装版本与加载器 / 实例名校验 ---- */

  /** 生效的共享根目录（.minecraft 根）：优先已存在，可被用户更换 */
  rootDir: iGM_Launcher_RootDirInfo | null;
  /** 共享根目录 versions/ 下已安装的版本 */
  installedVersions: iGM_Launcher_ScannedVersion[];
  /** 由已安装版本聚合出的已安装加载器（原版不在此列，始终可用） */
  installedLoaders: iGM_Launcher_InstalledLoader[];
  /** 是否正在扫描共享根目录下已安装的版本与加载器 */
  scanningInstalled: boolean;

  /** 解析生效的共享根目录（不传 dirPath 时读取默认）；用户更换根目录时传新路径 */
  loadRootDir: (dirPath?: string) => Promise<void>;
  /** 重新扫描共享根目录下的已安装版本与加载器 */
  scanInstalled: (dirPath?: string) => Promise<void>;
  /**
   * 应用前置目录并重新扫描：前置目录可放在任意磁盘（不限于系统盘），
   * 游戏最终按目录规则安装在其下的 .minecraft 内。
   */
  applyRootDir: (parentDir?: string) => Promise<void>;
  /** 打开系统目录选择器挑选前置目录（浏览器内不可用，返回空串表示未选择） */
  pickDir: (startDir?: string) => Promise<string>;
  /** 实例名校验：非空 / 字符合法 / 不与既有实例重名（编辑时传入自身名称以排除） */
  validateInstanceName: (name: string, excludeName?: string) => iGM_Launcher_InstanceNameCheck;

  /** 已绑定的 Minecraft 正版账号（仅非敏感视图） */
  mcBindings: iGM_Launcher_MCBinding[];

  /** 启动设备代码流程，返回用户码与验证地址 */
  mcStartDeviceCode: () => Promise<iGM_Launcher_MsaDeviceCode | null>;
  /** 轮询设备代码流程（授权通过后自动跑完整条认证链） */
  mcPollDeviceCode: (flowId: string) => Promise<iGM_Launcher_MsaFlowResult | null>;
  /** 启动浏览器授权流程（Authorization Code + PKCE） */
  mcStartBrowserAuth: (redirectUri?: string) => Promise<iGM_Launcher_BrowserAuthStart | null>;
  /** 等待浏览器回调并完成认证链 */
  mcCompleteBrowserAuth: (flowId: string) => Promise<iGM_Launcher_MsaFlowResult | null>;
  /** 把认证结果绑定到当前社区账号并落盘 */
  mcBind: (flowId: string) => Promise<boolean>;
  mcUnbind: (bindingId: string) => Promise<void>;
  mcSetDefault: (bindingId: string) => Promise<void>;
  mcRefresh: (bindingId: string) => Promise<void>;
  /** 读取玩家档案（皮肤 / UUID），失败返回 null */
  mcLoadProfile: (bindingId: string) => Promise<iGM_Launcher_MinecraftProfile | null>;
  /** 重新校验拥有权，通过返回更新后的绑定记录 */
  mcCheckEntitlements: (bindingId: string) => Promise<iGM_Launcher_MCBinding | null>;
}

/** 新建实例表单的空值模板（默认值取自共享层常量） */
export function iGM_Launcher_NewInstanceInput(): iGM_Launcher_InstanceInput {
  return {
    name: "",
    icon: "folder",
    note: "",
    minecraftVersion: "1.21.1",
    loader: "vanilla",
    loaderVersion: "",
    directory: "",
    javaId: null,
    maxMemoryMb: IGM_LAUNCHER_INSTANCE_MEMORY_DEFAULT.max,
    minMemoryMb: IGM_LAUNCHER_INSTANCE_MEMORY_DEFAULT.min,
    windowWidth: IGM_LAUNCHER_INSTANCE_WINDOW_DEFAULT.width,
    windowHeight: IGM_LAUNCHER_INSTANCE_WINDOW_DEFAULT.height,
    jvmArgs: IGM_LAUNCHER_INSTANCE_JVM_ARGS_DEFAULT,
    gameArgs: "",
  };
}

/** 初始会话（首帧占位，挂载后由 app:load 覆盖） */
const IGM_LAUNCHER_EMPTY_ACCOUNT: iGM_Launcher_AccountSession = {
  signedIn: false,
  offline: true,
  userName: "",
  uid: "",
  email: "",
  role: "",
  registeredAt: "",
  orgs: [],
  token: "",
  // 模块五：离线角色身份，首帧先给默认值，挂载后由主进程下发的本地 UUID 覆盖
  offlineUuid: "",
  offlineName: IGM_LAUNCHER_OFFLINE_DEFAULT_NAME,
  // 社区头像：未登录与未设置时为空串，界面回退为图标占位
  avatar: "",
};

const iGM_Launcher_StoreContext = createContext<iGM_Launcher_StoreValue | null>(null);

// 核心逻辑 //
export function iGM_Launcher_StoreProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("notice");

  const [loading, setLoading] = useState(true);
  const [isShell, setIsShell] = useState(false);
  const [instances, setInstances] = useState<iGM_Launcher_InstanceRecord[]>([]);
  const [javas, setJavas] = useState<iGM_Launcher_JavaRuntime[]>([]);
  const [defaultJavaId, setDefaultJavaId] = useState<string | null>(null);
  const [account, setAccount] = useState<iGM_Launcher_AccountSession>(
    IGM_LAUNCHER_EMPTY_ACCOUNT,
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<iGM_Launcher_Notice | null>(null);
  const [mcBindings, setMcBindings] = useState<iGM_Launcher_MCBinding[]>([]);
  const [gameDirs, setGameDirs] = useState<iGM_Launcher_GameDir[]>([]);
  const [scanResults, setScanResults] = useState<iGM_Launcher_GameDirScanResult[]>([]);
  const [versionLibrary, setVersionLibrary] = useState<iGM_Launcher_VersionLibrary>(
    iGM_Launcher_EmptyVersionLibrary,
  );
  const [scanningGameDirs, setScanningGameDirs] = useState(false);
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [rootDir, setRootDir] = useState<iGM_Launcher_RootDirInfo | null>(null);
  const [installedVersions, setInstalledVersions] = useState<iGM_Launcher_ScannedVersion[]>([]);
  const [installedLoaders, setInstalledLoaders] = useState<iGM_Launcher_InstalledLoader[]>([]);
  const [scanningInstalled, setScanningInstalled] = useState(false);
  const [lastLaunch, setLastLaunch] = useState<iGM_Launcher_LaunchStatus | null>(null);
  const [launchError, setLaunchError] = useState("");

  const notify = useCallback((tone: iGM_Launcher_Notice["tone"], message: string) => {
    setNotice({ tone, message });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  // 首帧加载：外壳内读取本地文件，浏览器内读取 localStorage
  useEffect(() => {
    setIsShell(iGM_Launcher_IsShellHost());
    let cancelled = false;
    void iGM_Launcher_BridgeCall("app:load").then((response) => {
      if (cancelled) return;
      if (response.success && response.data) {
        setInstances(response.data.data.instances);
        setJavas(response.data.data.javas);
        setDefaultJavaId(response.data.data.defaultJavaId);
        setAccount(response.data.data.account);
        setMcBindings(response.data.data.mcBindings);
        setGameDirs(response.data.data.gameDirs);
        setVersionLibrary(response.data.data.versionLibrary);
        // 自动恢复会话：本地已有登录态时携带凭证向主站校验，失效则退回离线模式（静默，不打扰界面）
        if (response.data.data.account.signedIn) {
          void iGM_Launcher_BridgeCall("account:restore-session").then((restored) => {
            if (cancelled) return;
            if (restored.success && restored.data) setAccount(restored.data.account);
          });
        }
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- 实例 ---------- */

  const createInstance = useCallback(
    async (input: iGM_Launcher_InstanceInput, targetRootDir?: string) => {
      const response = await iGM_Launcher_BridgeCall("instance:create", {
        instance: input,
        // 传入用户选定的共享根目录，缺省时由桥接层按「优先已存在」规则解析
        rootDir: targetRootDir,
      });
      if (!response.success || !response.data) {
        notify("error", t("instanceCreateFailed"));
        return null;
      }
      setInstances(response.data.instances);
      setSelectedInstanceId(response.data.instance.id);
      notify("success", t("instanceCreated", { name: response.data.instance.name }));
      return response.data.instance;
    },
    [notify, t],
  );

  const updateInstance = useCallback(
    async (id: string, patch: Partial<iGM_Launcher_InstanceInput>) => {
      const response = await iGM_Launcher_BridgeCall("instance:update", { id, patch });
      if (!response.success || !response.data) {
        notify("error", t("instanceUpdateFailed"));
        return false;
      }
      setInstances(response.data.instances);
      notify("success", t("instanceUpdated", { name: response.data.instance.name }));
      return true;
    },
    [notify, t],
  );

  const deleteInstance = useCallback(
    async (id: string) => {
      const target = instances.find((item) => item.id === id);
      const response = await iGM_Launcher_BridgeCall("instance:delete", { id });
      if (!response.success || !response.data) {
        notify("error", t("instanceDeleteFailed"));
        return false;
      }
      setInstances(response.data.instances);
      setSelectedInstanceId((current) => (current === id ? null : current));
      notify("success", t("instanceDeleted", { name: target?.name ?? "" }));
      return true;
    },
    [instances, notify, t],
  );

  const duplicateInstance = useCallback(
    async (id: string) => {
      const source = instances.find((item) => item.id === id);
      if (!source) {
        notify("error", t("instanceCopyFailed"));
        return false;
      }
      const response = await iGM_Launcher_BridgeCall("instance:create", {
        instance: {
          name: t("instanceCopySuffix", { name: source.name }),
          icon: source.icon,
          note: source.note,
          minecraftVersion: source.minecraftVersion,
          loader: source.loader,
          loaderVersion: source.loaderVersion,
          // 目录留空由桥接层按新名称生成新目录，保证副本与原实例互不覆盖
          directory: "",
          javaId: source.javaId,
          maxMemoryMb: source.maxMemoryMb,
          minMemoryMb: source.minMemoryMb,
          windowWidth: source.windowWidth,
          windowHeight: source.windowHeight,
          jvmArgs: source.jvmArgs,
          gameArgs: source.gameArgs,
        },
      });
      if (!response.success || !response.data) {
        notify("error", t("instanceCopyFailed"));
        return false;
      }
      setInstances(response.data.instances);
      notify("success", t("instanceCopied", { name: response.data.instance.name }));
      return true;
    },
    [instances, notify, t],
  );

  const renameInstance = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        notify("error", t("instanceNameRequired"));
        return false;
      }
      return updateInstance(id, { name: trimmed });
    },
    [notify, t, updateInstance],
  );

  const launchInstance = useCallback(
    async (
      id: string,
      options?: { mode?: iGM_Launcher_LaunchMode; bindingId?: string; rootDir?: string },
    ) => {
      setSelectedInstanceId(id);
      const response = await iGM_Launcher_BridgeCall("instance:launch", {
        id,
        rootDir: options?.rootDir,
        mode: options?.mode,
        bindingId: options?.bindingId,
      });
      if (!response.success || !response.data) {
        // 启动失败：如实回显桥接层原因（版本未安装 / 缺依赖库 / 缺 Java / 未绑定正版等），
        // 不刷新游玩时间
        const message = response.message || t("launchFailed");
        setLaunchError(message);
        notify("error", message);
        return null;
      }
      setLaunchError("");
      setInstances(response.data.instances);
      setLastLaunch(response.data.status);
      notify("success", t("launchOk", { name: response.data.instance.name }));
      return response.data.status;
    },
    [notify, t],
  );

  const launchStatus = useCallback(async (id?: string) => {
    const response = await iGM_Launcher_BridgeCall("instance:launch-status", { id });
    const status = response.success && response.data ? response.data.status : null;
    if (status) setLastLaunch(status);
    return status;
  }, []);

  const selectInstance = useCallback((id: string | null) => {
    setSelectedInstanceId(id);
  }, []);

  /* ---------- Java ---------- */

  const detectJava = useCallback(async () => {
    const response = await iGM_Launcher_BridgeCall("java:detect");
    if (!response.success || !response.data) {
      notify("error", t("javaDetectFailed"));
      return;
    }
    setJavas(response.data.javas);
    setDefaultJavaId(response.data.defaultJavaId);
    const addedCount = response.data.added.length;
    notify(
      "success",
      addedCount > 0 ? t("javaDetected", { count: addedCount }) : t("javaNoneDetected"),
    );
  }, [notify, t]);

  const addJava = useCallback(
    async (input: iGM_Launcher_JavaInput) => {
      const response = await iGM_Launcher_BridgeCall("java:add", {
        name: input.name,
        path: input.path,
        version: input.version,
        vendor: input.vendor,
      });
      if (!response.success || !response.data) {
        notify("error", t("javaAddFailed"));
        return false;
      }
      setJavas(response.data.javas);
      setDefaultJavaId(response.data.defaultJavaId);
      notify("success", t("javaAdded", { name: input.name }));
      return true;
    },
    [notify, t],
  );

  const removeJava = useCallback(
    async (id: string) => {
      const target = javas.find((item) => item.id === id);
      const response = await iGM_Launcher_BridgeCall("java:remove", { id });
      if (!response.success || !response.data) {
        notify("error", t("javaRemoveFailed"));
        return;
      }
      setJavas(response.data.javas);
      setDefaultJavaId(response.data.defaultJavaId);
      notify("success", t("javaRemoved", { name: target?.name ?? "" }));
    },
    [javas, notify, t],
  );

  const testJava = useCallback(
    async (id: string) => {
      const response = await iGM_Launcher_BridgeCall("java:test", { id });
      if (!response.success || !response.data) {
        notify("error", t("javaTestFailed"));
        return;
      }
      setJavas(response.data.javas);
      notify(
        response.data.runtime.available ? "success" : "error",
        t("javaTestDone", { name: response.data.runtime.name }),
      );
    },
    [notify, t],
  );

  const setDefaultJava = useCallback(
    async (id: string) => {
      const target = javas.find((item) => item.id === id);
      const response = await iGM_Launcher_BridgeCall("java:set-default", { id });
      if (!response.success || !response.data) {
        notify("error", t("javaDefaultFailed"));
        return;
      }
      setJavas(response.data.javas);
      setDefaultJavaId(response.data.defaultJavaId);
      notify("success", t("javaDefaultSet", { name: target?.name ?? "" }));
    },
    [javas, notify, t],
  );

  /* ---------- 账户 ---------- */

  /** 主站响应码 -> 本地化提示键（未匹配时回退通用失败提示） */
  const accountErrorKey = useCallback(
    (code: number): "loginRejected" | "loginSuspended" | "loginUnreachable" | null => {
      if (code === IGM_LAUNCHER_BRIDGE_UNAUTHORIZED) return "loginRejected";
      if (code === IGM_LAUNCHER_BRIDGE_FORBIDDEN) return "loginSuspended";
      if (code === IGM_LAUNCHER_BRIDGE_UNREACHABLE) return "loginUnreachable";
      return null;
    },
    [],
  );

  const login = useCallback(
    async (account: string, password: string) => {
      const response = await iGM_Launcher_BridgeCall("account:login", { account, password });
      if (!response.success || !response.data) {
        const key = accountErrorKey(response.code);
        notify("error", key ? t(key) : t("loginFailed"));
        return false;
      }
      setAccount(response.data.account);
      notify("success", t("loginOk", { name: response.data.account.userName }));
      // 绑定记录归属社区账号：登录后立即拉取该账号下的正版绑定，避免残留上一账号的列表
      const bindings = await iGM_Launcher_BridgeCall("mc:list-bindings");
      if (bindings.success && bindings.data) setMcBindings(bindings.data.mcBindings);
      return true;
    },
    [accountErrorKey, notify, t],
  );

  const logout = useCallback(async () => {
    const response = await iGM_Launcher_BridgeCall("account:logout");
    if (!response.success || !response.data) {
      notify("error", t("logoutFailed"));
      return;
    }
    setAccount(response.data.account);
    // 退出后清空界面上的绑定列表，切换账号时由登录流程重新拉取
    setMcBindings([]);
    notify("success", t("logoutOk"));
  }, [notify, t]);

  const syncAccount = useCallback(async () => {
    const response = await iGM_Launcher_BridgeCall("account:sync");
    if (!response.success || !response.data) {
      const key = accountErrorKey(response.code);
      notify("error", key ? t(key) : t("syncFailed"));
      return;
    }
    setAccount(response.data.account);
    notify("success", t("syncOk"));
  }, [accountErrorKey, notify, t]);

  const restoreSession = useCallback(async () => {
    const response = await iGM_Launcher_BridgeCall("account:restore-session");
    if (!response.success || !response.data) {
      notify("error", t("syncFailed"));
      return;
    }
    setAccount(response.data.account);
    if (response.data.account.signedIn) {
      notify("success", t("sessionRestored"));
    }
  }, [notify, t]);

  /* ---------- 模块五：本机游戏目录 / 版本库 ---------- */

  const scanGameDirs = useCallback(async () => {
    setScanningGameDirs(true);
    try {
      const response = await iGM_Launcher_BridgeCall("minecraft:scan-dirs");
      if (!response.success || !response.data) {
        notify("error", t("gameDirScanFailed"));
        return;
      }
      const versionCount = response.data.results.reduce(
        (sum, item) => sum + item.versions.length,
        0,
      );
      setGameDirs(response.data.gameDirs);
      setScanResults(response.data.results);
      notify(
        response.data.gameDirs.length > 0
          ? "success"
          : "error",
        response.data.gameDirs.length > 0
          ? t("gameDirScanDone", {
              dirs: response.data.gameDirs.length,
              versions: versionCount,
            })
          : t("gameDirScanNone"),
      );
    } finally {
      setScanningGameDirs(false);
    }
  }, [notify, t]);

  const addGameDir = useCallback(
    async (dirPath: string) => {
      const trimmed = dirPath.trim();
      if (!trimmed) {
        notify("error", t("gameDirPathRequired"));
        return false;
      }
      const response = await iGM_Launcher_BridgeCall("minecraft:add-dir", { dirPath: trimmed });
      if (!response.success || !response.data) {
        notify("error", t("gameDirAddFailed"));
        return false;
      }
      setGameDirs(response.data.gameDirs);
      setScanResults((current) => [
        ...current.filter((item) => item.path !== response.data!.result.path),
        response.data!.result,
      ]);
      notify(
        "success",
        t("gameDirAdded", { versions: response.data.result.versions.length }),
      );
      return true;
    },
    [notify, t],
  );

  const removeGameDir = useCallback(
    async (dirId: string) => {
      const response = await iGM_Launcher_BridgeCall("minecraft:remove-dir", { dirId });
      if (!response.success || !response.data) {
        notify("error", t("gameDirRemoveFailed"));
        return;
      }
      setGameDirs(response.data.gameDirs);
      notify("success", t("gameDirRemoved"));
    },
    [notify, t],
  );

  const setDefaultGameDir = useCallback(
    async (dirId: string) => {
      const response = await iGM_Launcher_BridgeCall("minecraft:set-default-dir", { dirId });
      if (!response.success || !response.data) {
        notify("error", t("gameDirDefaultFailed"));
        return;
      }
      setGameDirs(response.data.gameDirs);
      notify("success", t("gameDirDefaultSet"));
    },
    [notify, t],
  );

  const importInstance = useCallback(
    async (jsonPath: string, importName?: string) => {
      const response = await iGM_Launcher_BridgeCall("minecraft:import-instance", {
        jsonPath,
        importName,
      });
      if (!response.success || !response.data) {
        notify("error", response.message || t("instanceImportFailed"));
        return false;
      }
      setInstances(response.data.instances);
      setSelectedInstanceId(response.data.instance.id);
      notify("success", t("instanceImported", { name: response.data.instance.name }));
      return true;
    },
    [notify, t],
  );

  const syncVersionLibrary = useCallback(
    async (silent = false) => {
      setSyncingLibrary(true);
      try {
        const response = await iGM_Launcher_BridgeCall("minecraft:sync-versions");
        // 同步失败时桥接层回传既有缓存，界面继续展示缓存内容并提示失败原因
        const library = response.data?.library;
        if (library) setVersionLibrary(library);
        if (!response.success) {
          notify("error", response.message || t("versionSyncFailed"));
          return;
        }
        if (!silent) {
          notify("success", t("versionSyncOk", { count: library?.total ?? 0 }));
        }
      } finally {
        setSyncingLibrary(false);
      }
    },
    [notify, t],
  );

  /* ---------- 模块六：共享根目录 / 已安装版本与加载器 ---------- */

  const loadRootDir = useCallback(async (dirPath?: string) => {
    const response = await iGM_Launcher_BridgeCall("minecraft:default-root-dir", {
      rootDir: dirPath,
    });
    if (response.success && response.data) setRootDir(response.data.rootDir);
    // 浏览器回退层无法探测本机磁盘，回报的空路径不覆盖已有状态
    else if (!response.data) setRootDir(null);
  }, []);

  const scanInstalled = useCallback(
    async (dirPath?: string) => {
      setScanningInstalled(true);
      try {
        const target = dirPath ?? rootDir?.path;
        const versionsResponse = await iGM_Launcher_BridgeCall("minecraft:installed-versions", {
          rootDir: target,
        });
        if (!versionsResponse.success || !versionsResponse.data) {
          setInstalledVersions([]);
          setInstalledLoaders([]);
          return;
        }
        setInstalledVersions(versionsResponse.data.versions);
        setRootDir((current) =>
          current
            ? { ...current, path: versionsResponse.data!.rootDir }
            : {
                path: versionsResponse.data!.rootDir,
                exists: false,
                isDefault: true,
                source: "system-default",
              },
        );

        const loadersResponse = await iGM_Launcher_BridgeCall("minecraft:installed-loaders", {
          rootDir: versionsResponse.data.rootDir,
        });
        setInstalledLoaders(
          loadersResponse.success && loadersResponse.data ? loadersResponse.data.loaders : [],
        );
      } finally {
        setScanningInstalled(false);
      }
    },
    [rootDir?.path],
  );

  /**
   * 应用前置目录并重新扫描。
   * 前置目录可放在任意磁盘，桥接层按目录规则补齐 .minecraft 段后作为共享根，
   * 因此界面只需传用户选择的目录，无需自行拼接。
   */
  const applyRootDir = useCallback(
    async (parentDir?: string) => {
      await loadRootDir(parentDir);
      await scanInstalled(parentDir);
    },
    [loadRootDir, scanInstalled],
  );

  /** 打开系统目录选择器挑选前置目录；用户取消或因环境不支持时返回空串 */
  const pickDir = useCallback(
    async (startDir?: string) => {
      const response = await iGM_Launcher_BridgeCall("minecraft:pick-dir", {
        rootDir: startDir,
      });
      if (!response.success || !response.data) {
        if (!response.success) notify("error", response.message);
        return "";
      }
      return response.data.path;
    },
    [notify],
  );

  const validateInstanceName = useCallback(
    (name: string, excludeName?: string): iGM_Launcher_InstanceNameCheck => {
      const others = instances
        .filter((item) => item.name !== excludeName)
        .map((item) => item.name);
      return iGM_Launcher_CheckInstanceName(name, others);
    },
    [instances],
  );

  // 首帧加载完成后解析共享根目录并扫描已安装版本与加载器，供实例创建页联动版本库
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void (async () => {
      const response = await iGM_Launcher_BridgeCall("minecraft:default-root-dir");
      if (cancelled || !response.success || !response.data) return;
      setRootDir(response.data.rootDir);
      const versions = await iGM_Launcher_BridgeCall("minecraft:installed-versions", {
        rootDir: response.data.rootDir.path,
      });
      if (cancelled || !versions.success || !versions.data) return;
      setInstalledVersions(versions.data.versions);
      const loaders = await iGM_Launcher_BridgeCall("minecraft:installed-loaders", {
        rootDir: versions.data.rootDir,
      });
      if (cancelled) return;
      setInstalledLoaders(loaders.success && loaders.data ? loaders.data.loaders : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading]);

  // 版本库自动同步：首帧无缓存或缓存过期时后台同步一次，此后按固定间隔定时同步
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const syncedAt = versionLibrary.syncedAt ? Date.parse(versionLibrary.syncedAt) : 0;
    const stale = !Number.isFinite(syncedAt) || Date.now() - syncedAt > IGM_LAUNCHER_VERSION_SYNC_STALE_MS;
    if (stale) {
      void iGM_Launcher_BridgeCall("minecraft:sync-versions").then((response) => {
        if (cancelled || !response.data?.library) return;
        setVersionLibrary(response.data.library);
      });
    }
    const timer = setInterval(() => {
      void iGM_Launcher_BridgeCall("minecraft:sync-versions").then((response) => {
        if (cancelled || !response.data?.library) return;
        setVersionLibrary(response.data.library);
      });
    }, IGM_LAUNCHER_VERSION_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loading, versionLibrary.syncedAt]);

  /* ---------- Minecraft 正版绑定 ---------- */

  /** 正版认证错误码 -> 本地化提示键：XSTS 错误码、未拥有、未登录、网络异常 */
  const mcErrorKey = useCallback(
    (code: number): string | null => {
      const xstsKey = iGM_Launcher_MapXstsErrorKey(code);
      if (xstsKey) return xstsKey;
      if (code === IGM_LAUNCHER_MC_NOT_OWNED) return "mcNotOwned";
      if (code === IGM_LAUNCHER_MC_CLIENT_ID_MISSING) return "mcClientIdMissing";
      if (code === IGM_LAUNCHER_MC_FLOW_EXPIRED) return "mcFlowExpired";
      if (code === IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED) return "mcBrowserUnsupported";
      if (code === IGM_LAUNCHER_BRIDGE_UNAUTHORIZED) return "mcNotSignedIn";
      if (code === IGM_LAUNCHER_BRIDGE_UNREACHABLE) return "loginUnreachable";
      return null;
    },
    [],
  );

  /** 提示认证链失败：优先使用响应携带的 XSTS / 业务错误码文案 */
  const notifyMcFailure = useCallback(
    (code: number, fallbackKey: string) => {
      const key = mcErrorKey(code);
      notify("error", key ? t(key) : t(fallbackKey));
    },
    [mcErrorKey, notify, t],
  );

  const mcStartDeviceCode = useCallback(async () => {
    const response = await iGM_Launcher_BridgeCall("mc:start-device-code");
    if (!response.success || !response.data) {
      notifyMcFailure(response.code, "mcStartFailed");
      return null;
    }
    return response.data.deviceCode;
  }, [notifyMcFailure]);

  const mcPollDeviceCode = useCallback(
    async (flowId: string) => {
      const response = await iGM_Launcher_BridgeCall("mc:poll-device-code", { flowId });
      if (!response.success || !response.data) {
        notifyMcFailure(response.code, "mcPollFailed");
        return null;
      }
      const result = response.data.result;
      if (result.status === "failed") notifyMcFailure(result.errorCode, "mcPollFailed");
      return result;
    },
    [notifyMcFailure],
  );

  const mcStartBrowserAuth = useCallback(
    async (redirectUri?: string) => {
      const response = await iGM_Launcher_BridgeCall("mc:start-browser-auth", { redirectUri });
      if (!response.success || !response.data) {
        notifyMcFailure(response.code, "mcStartFailed");
        return null;
      }
      return response.data.browserAuth;
    },
    [notifyMcFailure],
  );

  const mcCompleteBrowserAuth = useCallback(
    async (flowId: string) => {
      const response = await iGM_Launcher_BridgeCall("mc:complete-browser-auth", { flowId });
      if (!response.success || !response.data) {
        notifyMcFailure(response.code, "mcPollFailed");
        return null;
      }
      const result = response.data.result;
      if (result.status === "failed" || result.status === "expired") {
        notifyMcFailure(result.errorCode, "mcPollFailed");
      }
      return result;
    },
    [notifyMcFailure],
  );

  const mcBind = useCallback(
    async (flowId: string) => {
      const response = await iGM_Launcher_BridgeCall("mc:bind-to-community", { flowId });
      if (!response.success || !response.data) {
        notifyMcFailure(response.code, "mcBindFailed");
        return false;
      }
      const binding = response.data.binding;
      const listResponse = await iGM_Launcher_BridgeCall("mc:list-bindings");
      if (listResponse.success && listResponse.data) {
        setMcBindings(listResponse.data.mcBindings);
      } else {
        setMcBindings((current) => [...current, binding]);
      }
      notify("success", t("mcBindOk", { name: binding.name }));
      return true;
    },
    [notifyMcFailure, notify, t],
  );

  const mcUnbind = useCallback(
    async (bindingId: string) => {
      const target = mcBindings.find((item) => item.id === bindingId);
      const response = await iGM_Launcher_BridgeCall("mc:unbind", { bindingId });
      if (!response.success || !response.data) {
        notify("error", t("mcUnbindFailed"));
        return;
      }
      setMcBindings(response.data.mcBindings);
      notify("success", t("mcUnbindOk", { name: target?.name ?? "" }));
    },
    [mcBindings, notify, t],
  );

  const mcSetDefault = useCallback(
    async (bindingId: string) => {
      const target = mcBindings.find((item) => item.id === bindingId);
      const response = await iGM_Launcher_BridgeCall("mc:set-default-binding", { bindingId });
      if (!response.success || !response.data) {
        notify("error", t("mcDefaultFailed"));
        return;
      }
      setMcBindings(response.data.mcBindings);
      notify("success", t("mcDefaultOk", { name: target?.name ?? "" }));
    },
    [mcBindings, notify, t],
  );

  const mcRefresh = useCallback(
    async (bindingId: string) => {
      const target = mcBindings.find((item) => item.id === bindingId);
      const response = await iGM_Launcher_BridgeCall("mc:refresh-token", { bindingId });
      if (!response.success || !response.data) {
        notifyMcFailure(response.code, "mcRefreshFailed");
        return;
      }
      setMcBindings((current) =>
        current.map((item) => (item.id === bindingId ? response.data!.binding : item)),
      );
      notify("success", t("mcRefreshOk", { name: target?.name ?? "" }));
    },
    [mcBindings, notifyMcFailure, notify, t],
  );

  const mcLoadProfile = useCallback(
    async (bindingId: string) => {
      const response = await iGM_Launcher_BridgeCall("mc:get-profile", { bindingId });
      if (!response.success || !response.data) {
        notifyMcFailure(response.code, "mcProfileFailed");
        return null;
      }
      return response.data.profile;
    },
    [notifyMcFailure],
  );

  const mcCheckEntitlements = useCallback(
    async (bindingId: string) => {
      const response = await iGM_Launcher_BridgeCall("mc:check-entitlements", { bindingId });
      if (!response.success || !response.data) {
        notifyMcFailure(response.code, "mcEntitlementsFailed");
        return null;
      }
      const binding = response.data.binding;
      setMcBindings((current) =>
        current.map((item) => (item.id === bindingId ? binding : item)),
      );
      notify("success", t("mcEntitlementsOk", { name: binding.name }));
      return binding;
    },
    [notifyMcFailure, notify, t],
  );

  /* ---------- 模块七：正版验证由账户页与正版绑定页承载 ---------- */

  const value = useMemo<iGM_Launcher_StoreValue>(
    () => ({
      loading,
      isShell,
      instances,
      javas,
      defaultJavaId,
      account,
      selectedInstanceId,
      notice,
      clearNotice,
      selectInstance,
      createInstance,
      updateInstance,
      deleteInstance,
      duplicateInstance,
      renameInstance,
      launchInstance,
      lastLaunch,
      launchError,
      launchStatus,
      detectJava,
      addJava,
      removeJava,
      testJava,
      setDefaultJava,
      login,
      logout,
      syncAccount,
      restoreSession,
      gameDirs,
      scanResults,
      versionLibrary,
      scanningGameDirs,
      syncingLibrary,
      scanGameDirs,
      addGameDir,
      removeGameDir,
      setDefaultGameDir,
      importInstance,
      syncVersionLibrary,
      rootDir,
      installedVersions,
      installedLoaders,
      scanningInstalled,
      loadRootDir,
      scanInstalled,
      applyRootDir,
      pickDir,
      validateInstanceName,
      mcBindings,
      mcStartDeviceCode,
      mcPollDeviceCode,
      mcStartBrowserAuth,
      mcCompleteBrowserAuth,
      mcBind,
      mcUnbind,
      mcSetDefault,
      mcRefresh,
      mcLoadProfile,
      mcCheckEntitlements,
    }),
    [
      loading,
      isShell,
      instances,
      javas,
      defaultJavaId,
      account,
      selectedInstanceId,
      notice,
      clearNotice,
      selectInstance,
      createInstance,
      updateInstance,
      deleteInstance,
      duplicateInstance,
      renameInstance,
      launchInstance,
      lastLaunch,
      launchError,
      launchStatus,
      detectJava,
      addJava,
      removeJava,
      testJava,
      setDefaultJava,
      login,
      logout,
      syncAccount,
      restoreSession,
      gameDirs,
      scanResults,
      versionLibrary,
      scanningGameDirs,
      syncingLibrary,
      scanGameDirs,
      addGameDir,
      removeGameDir,
      setDefaultGameDir,
      importInstance,
      syncVersionLibrary,
      rootDir,
      installedVersions,
      installedLoaders,
      scanningInstalled,
      loadRootDir,
      scanInstalled,
      applyRootDir,
      pickDir,
      validateInstanceName,
      mcBindings,
      mcStartDeviceCode,
      mcPollDeviceCode,
      mcStartBrowserAuth,
      mcCompleteBrowserAuth,
      mcBind,
      mcUnbind,
      mcSetDefault,
      mcRefresh,
      mcLoadProfile,
      mcCheckEntitlements,
    ],
  );

  return (
    <iGM_Launcher_StoreContext.Provider value={value}>
      {children}
    </iGM_Launcher_StoreContext.Provider>
  );
}

/** 读取启动器状态中心；未挂载 Provider 时抛出明确错误 */
export function iGM_Launcher_UseStore(): iGM_Launcher_StoreValue {
  const value = useContext(iGM_Launcher_StoreContext);
  if (!value) {
    throw new Error("iGM_Launcher_UseStore 必须在 iGM_Launcher_StoreProvider 内使用");
  }
  return value;
}

// 导出 //
export default iGM_Launcher_StoreProvider;