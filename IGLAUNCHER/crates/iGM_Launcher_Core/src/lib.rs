// 文件路径：crates/iGM_Launcher_Core/src/lib.rs
// 所属层：Rust 原生核心
// 模块：iGM_Launcher_Core
// 作用：声明基础结构体与 C ABI 函数签名，编译为动态库（cdylib）供 bun:ffi 加载
// 内容：状态码常量、下载任务结构体、三个导出占位函数（Init / GetVersion / DownloadTask）；
//       模块二追加实例 / Java / 账户三组占位签名；
//       模块三追加 Minecraft 正版认证链（MSA → Xbox Live → XSTS → Minecraft → 档案 / 拥有权）
//       的 5 个数据结构与 8 个函数签名；
// 模块四把认证链前三步的符号迁出到子模块 iGM_Launcher_MSAuth；
// 模块五追加离线游戏支撑（本机游戏目录扫描 / 版本 json 解析 / 实例导入 / 版本库同步）
//       的 3 个数据结构与 4 个函数签名
// 模块六追加下载安装位置与实例创建联动支撑（已安装版本 / 加载器扫描、默认根目录解析、
//       实例目录创建、实例名校验）的 2 个数据结构与 5 个函数签名
//
// 说明：本模块只保证可编译，不实现任何下载或启动逻辑；
//       Bun 侧通过 apps/shell/src/iGM_Launcher_CoreBindings.ts 占位加载。
//       模块三的认证链签名与数据结构在此登记为原生契约，
//       实际调用（https 请求）由 apps/shell/src/iGM_Launcher_MsaAuth.ts 在 Bun 侧完成，
//       待原生实现落地后可由 Rust 接管而不改动上层协议。
//       模块四（微软认证骨架，测试到 XSTS）的契约见 src/iGM_Launcher_MSAuth.rs。

// 命名规则 //
// 项目约定原生导出类型与函数统一使用 iGM_Launcher_ 前缀，
// 与 Rust 的 snake_case / CamelCase 命名规范冲突，此处显式放行相关 lint。
// 说明：内部属性必须位于本文件所有条目之前，故置于 use 声明之前。
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]

// 导入依赖 //
use std::os::raw::c_char;

// 子模块 //
// 模块四：微软正版认证骨架（Microsoft OAuth 2.0 → Xbox Live → XSTS）的契约登记，
// 该模块同时导出与模块三同名的认证符号，故模块三的对应占位声明已随之移除。
pub mod iGM_Launcher_MSAuth;

// 类型定义 //

/// 核心状态码：0 表示成功，负值表示未实现或错误
pub type iGM_Launcher_Core_Status = i32;

/// 调用成功
pub const IGM_LAUNCHER_CORE_OK: iGM_Launcher_Core_Status = 0;

/// 能力尚未实现（模块一全部返回该值）
pub const IGM_LAUNCHER_CORE_NOT_IMPLEMENTED: iGM_Launcher_Core_Status = -1;

/// 下载任务状态占位枚举值与 Rust 侧保持一致
pub const IGM_LAUNCHER_CORE_TASK_IDLE: i32 = 0;
pub const IGM_LAUNCHER_CORE_TASK_RUNNING: i32 = 1;
pub const IGM_LAUNCHER_CORE_TASK_DONE: i32 = 2;
pub const IGM_LAUNCHER_CORE_TASK_ERROR: i32 = -1;

/// 下载任务信息结构体占位，字段布局与 TS 侧镜像保持一致
#[repr(C)]
pub struct iGM_Launcher_Core_DownloadTaskInfo {
    /// 任务编号，-1 表示未启用
    pub id: i32,
    /// 资源来源 URL（C 字符串，生命周期由调用方保证）
    pub url: *const c_char,
    /// 任务状态，取值见 IGM_LAUNCHER_CORE_TASK_*
    pub state: i32,
}

// 核心逻辑 //

/// 版本号静态字符串（以 NUL 结尾，供 C 侧直接读取）
static IGM_LAUNCHER_CORE_VERSION: &[u8] = b"0.1.0\0";

/// 初始化核心：模块一为空实现，仅返回成功
#[no_mangle]
pub extern "C" fn iGM_Launcher_Core_Init() -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_OK
}

/// 读取核心版本号，返回指向静态 C 字符串的指针
#[no_mangle]
pub extern "C" fn iGM_Launcher_Core_GetVersion() -> *const c_char {
    IGM_LAUNCHER_CORE_VERSION.as_ptr() as *const c_char
}

/// 创建下载任务：模块一仅占位，始终返回未实现
#[no_mangle]
pub extern "C" fn iGM_Launcher_Core_DownloadTask(_url: *const c_char) -> i32 {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

// 类型定义（模块二：实例 / Java / 账户） //

/// 实例信息占位结构体，字段与 TS 侧 iGM_Launcher_InstanceRecord 保持镜像
#[repr(C)]
pub struct iGM_Launcher_Core_InstanceInfo {
    /// 实例唯一标识
    pub id: *const c_char,
    /// 实例名称
    pub name: *const c_char,
    /// Minecraft 版本
    pub minecraft_version: *const c_char,
    /// 加载器类型，取值见 IGM_LAUNCHER_CORE_LOADER_*
    pub loader: i32,
    /// 加载器版本
    pub loader_version: *const c_char,
    /// 实例目录
    pub directory: *const c_char,
    /// 最大内存（MB）
    pub max_memory_mb: u32,
    /// 最小内存（MB）
    pub min_memory_mb: u32,
}

/// 加载器类型取值（vanilla / forge / fabric / neoforge / quilt）
pub const IGM_LAUNCHER_CORE_LOADER_VANILLA: i32 = 0;
pub const IGM_LAUNCHER_CORE_LOADER_FORGE: i32 = 1;
pub const IGM_LAUNCHER_CORE_LOADER_FABRIC: i32 = 2;
pub const IGM_LAUNCHER_CORE_LOADER_NEOFORGE: i32 = 3;
pub const IGM_LAUNCHER_CORE_LOADER_QUILT: i32 = 4;

/// Java 运行时信息占位结构体，字段与 TS 侧 iGM_Launcher_JavaRuntime 保持镜像
#[repr(C)]
pub struct iGM_Launcher_Core_JavaRuntimeInfo {
    /// 运行时唯一标识
    pub id: *const c_char,
    /// 自定义名称
    pub name: *const c_char,
    /// 可执行文件路径
    pub path: *const c_char,
    /// 主版本号，如 17
    pub version: i32,
    /// 发行版，取值见 IGM_LAUNCHER_CORE_VENDOR_*
    pub vendor: i32,
    /// 是否可用，1 可用 / 0 不可用
    pub available: i32,
}

/// Java 发行版取值（adoptium / zulu / liberica / oracle / unknown）
pub const IGM_LAUNCHER_CORE_VENDOR_ADOPTIUM: i32 = 0;
pub const IGM_LAUNCHER_CORE_VENDOR_ZULU: i32 = 1;
pub const IGM_LAUNCHER_CORE_VENDOR_LIBERICA: i32 = 2;
pub const IGM_LAUNCHER_CORE_VENDOR_ORACLE: i32 = 3;
pub const IGM_LAUNCHER_CORE_VENDOR_UNKNOWN: i32 = 4;

/// 账户会话占位结构体，字段与 TS 侧 iGM_Launcher_AccountSession 保持镜像
/// （uid 取自 iGCraftLit 主站返回值，与官网一致）
#[repr(C)]
pub struct iGM_Launcher_Core_AccountSessionInfo {
    /// 是否已登录，1 已登录 / 0 未登录
    pub signed_in: i32,
    /// 是否离线模式，1 离线 / 0 在线
    pub offline: i32,
    /// 用户名
    pub user_name: *const c_char,
    /// iGMUid
    pub uid: *const c_char,
    /// 邮箱
    pub email: *const c_char,
    /// 主站会话凭证
    pub token: *const c_char,
}

// 核心逻辑（模块二接口签名，全部占位） //
//
// 以下函数只声明签名与数据结构，保证可编译；
// 真实落盘、检测、下载与鉴权逻辑留待后续模块实现，
// 模块二由 apps/shell/src/iGM_Launcher_Bridge.ts 在 Bun 侧完成占位实现。

/// 实例管理：新建实例
#[no_mangle]
pub extern "C" fn iGM_Launcher_Instance_Create(
    _name: *const c_char,
    _out: *mut iGM_Launcher_Core_InstanceInfo,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 实例管理：更新实例
#[no_mangle]
pub extern "C" fn iGM_Launcher_Instance_Update(
    _id: *const c_char,
    _out: *mut iGM_Launcher_Core_InstanceInfo,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 实例管理：删除实例
#[no_mangle]
pub extern "C" fn iGM_Launcher_Instance_Delete(_id: *const c_char) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 实例管理：列出全部实例，返回写入条数或负值状态
#[no_mangle]
pub extern "C" fn iGM_Launcher_Instance_List(
    _out: *mut iGM_Launcher_Core_InstanceInfo,
    _capacity: u32,
) -> i32 {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 实例管理：读取单个实例
#[no_mangle]
pub extern "C" fn iGM_Launcher_Instance_Get(
    _id: *const c_char,
    _out: *mut iGM_Launcher_Core_InstanceInfo,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// Java 管理：扫描本机常见 Java 路径
#[no_mangle]
pub extern "C" fn iGM_Launcher_Java_Detect(
    _out: *mut iGM_Launcher_Core_JavaRuntimeInfo,
    _capacity: u32,
) -> i32 {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// Java 管理：列出已登记 Java
#[no_mangle]
pub extern "C" fn iGM_Launcher_Java_List(
    _out: *mut iGM_Launcher_Core_JavaRuntimeInfo,
    _capacity: u32,
) -> i32 {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// Java 管理：手动添加 Java
#[no_mangle]
pub extern "C" fn iGM_Launcher_Java_Add(
    _path: *const c_char,
    _out: *mut iGM_Launcher_Core_JavaRuntimeInfo,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// Java 管理：移除 Java
#[no_mangle]
pub extern "C" fn iGM_Launcher_Java_Remove(_id: *const c_char) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// Java 管理：下载 Java（预留，返回任务编号或负值）
#[no_mangle]
pub extern "C" fn iGM_Launcher_Java_Download(_major: i32, _vendor: i32) -> i32 {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// Java 管理：测试 Java 可用性
#[no_mangle]
pub extern "C" fn iGM_Launcher_Java_Test(_id: *const c_char, _available: *mut i32) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 账户：登录（经 HTTP 调用 iGCraftLit 主站后端）
#[no_mangle]
pub extern "C" fn iGM_Launcher_Account_Login(
    _email: *const c_char,
    _password: *const c_char,
    _out: *mut iGM_Launcher_Core_AccountSessionInfo,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 账户：退出登录
#[no_mangle]
pub extern "C" fn iGM_Launcher_Account_Logout() -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 账户：读取当前会话
#[no_mangle]
pub extern "C" fn iGM_Launcher_Account_GetCurrent(
    _out: *mut iGM_Launcher_Core_AccountSessionInfo,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 账户：同步账户数据
#[no_mangle]
pub extern "C" fn iGM_Launcher_Account_Sync(
    _out: *mut iGM_Launcher_Core_AccountSessionInfo,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

// 类型定义（模块三：Minecraft 正版认证链） //
//
// 以下五个结构体与 TS 侧 packages/shared 中的镜像类型字段一一对应：
//   MSA_Token        <-> iGM_Launcher_MsaToken
//   Xbox_Token       <-> iGM_Launcher_XboxToken
//   XSTS_Token       <-> iGM_Launcher_XstsToken
//   Minecraft_Token  <-> iGM_Launcher_MinecraftToken
//   Minecraft_Profile<-> iGM_Launcher_MinecraftProfile
// 字符串字段均为 C 字符串指针，生命周期由调用方保证；
// 敏感字段（refresh_token 等）只在原生侧与 Bun 主进程之间流转，不进入渲染进程。

/// MSA 认证链固定阶段系数（与 TS 侧 IGM_LAUNCHER_MC_AUTH_STAGES 顺序一致）
pub const IGM_LAUNCHER_CORE_MC_STAGE_MSA: i32 = 0;
pub const IGM_LAUNCHER_CORE_MC_STAGE_XBOX: i32 = 1;
pub const IGM_LAUNCHER_CORE_MC_STAGE_XSTS: i32 = 2;
pub const IGM_LAUNCHER_CORE_MC_STAGE_MINECRAFT: i32 = 3;
pub const IGM_LAUNCHER_CORE_MC_STAGE_PROFILE: i32 = 4;
pub const IGM_LAUNCHER_CORE_MC_STAGE_ENTITLEMENTS: i32 = 5;

/// 微软 OAuth 令牌
#[repr(C)]
pub struct iGM_Launcher_Core_MSA_Token {
    /// access_token
    pub access_token: *const c_char,
    /// refresh_token（仅原生侧与主进程可见）
    pub refresh_token: *const c_char,
    /// 授权范围，如 "XboxLive.signin offline_access"
    pub scope: *const c_char,
    /// access_token 有效期（秒）
    pub expires_in: u32,
}

/// Xbox Live 用户令牌
#[repr(C)]
pub struct iGM_Launcher_Core_Xbox_Token {
    /// Xbox Live 令牌
    pub token: *const c_char,
    /// 用户哈希（构造 XSTS identity 使用）
    pub user_hash: *const c_char,
    /// 到期时间（ISO 8601 字符串）
    pub not_after: *const c_char,
}

/// XSTS 授权令牌
#[repr(C)]
pub struct iGM_Launcher_Core_XSTS_Token {
    /// XSTS 令牌
    pub token: *const c_char,
    /// 用户哈希
    pub user_hash: *const c_char,
    /// 到期时间（ISO 8601 字符串）
    pub not_after: *const c_char,
}

/// Minecraft 服务令牌
#[repr(C)]
pub struct iGM_Launcher_Core_Minecraft_Token {
    /// Minecraft access_token（启动游戏时注入）
    pub access_token: *const c_char,
    /// 有效期（秒）
    pub expires_in: u32,
}

/// Minecraft 玩家档案
#[repr(C)]
pub struct iGM_Launcher_Core_Minecraft_Profile {
    /// 玩家 UUID（标准带连字符格式）
    pub uuid: *const c_char,
    /// 玩家名
    pub name: *const c_char,
    /// 皮肤纹理地址
    pub skin_url: *const c_char,
    /// 皮肤变体：classic / slim
    pub skin_variant: *const c_char,
    /// 披风纹理地址，无则为空字符串
    pub cape_url: *const c_char,
}

// 核心逻辑（模块三接口签名，全部占位） //
//
// 与模块二一致：以下函数只登记签名与数据结构，保证可编译；
// 真实 https 调用由 apps/shell/src/iGM_Launcher_MsaAuth.ts 在 Bun 侧实现，
// 并在 apps/shell/src/iGM_Launcher_CoreBindings.ts 中按同名符号做可用性探测。
//
// 模块四变更：认证链前三步（申请设备代码 / 轮询令牌 / Xbox Live 认证 / XSTS 授权）
// 的符号已迁移至子模块 iGM_Launcher_MSAuth，并改用「返回结构体指针」的契约，
// 此处不再重复声明，避免同名符号冲突。

/// MSA：以 refresh_token 刷新完整认证链
#[no_mangle]
pub extern "C" fn iGM_Launcher_MSA_RefreshToken(
    _client_id: *const c_char,
    _refresh_token: *const c_char,
    _out: *mut iGM_Launcher_Core_MSA_Token,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// Minecraft：以 XBL3.0 identityToken 换取 Minecraft 访问令牌
#[no_mangle]
pub extern "C" fn iGM_Launcher_Minecraft_Authenticate(
    _xsts_user_hash: *const c_char,
    _xsts_token: *const c_char,
    _out: *mut iGM_Launcher_Core_Minecraft_Token,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// Minecraft：获取玩家档案
#[no_mangle]
pub extern "C" fn iGM_Launcher_Minecraft_GetProfile(
    _minecraft_access_token: *const c_char,
    _out: *mut iGM_Launcher_Core_Minecraft_Profile,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// Minecraft：校验 Java 版拥有权，owns 写出 1 拥有 / 0 未拥有
#[no_mangle]
pub extern "C" fn iGM_Launcher_Minecraft_CheckEntitlements(
    _minecraft_access_token: *const c_char,
    _owns: *mut i32,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

// 类型定义（模块五：离线游戏 / 游戏目录扫描 / 版本库同步） //
//
// 三个结构体与 TS 侧 packages/shared 中的镜像类型字段一一对应：
//   ScannedVersion     <-> iGM_Launcher_ScannedVersion
//   GameDirScanResult  <-> iGM_Launcher_GameDirScanResult
//   VersionLibraryItem <-> iGM_Launcher_VersionLibraryEntry
// 字符串字段均为 C 字符串指针，生命周期由调用方保证。

/// 版本类型取值（与 TS 侧 iGM_Launcher_VersionType 一致）
pub const IGM_LAUNCHER_CORE_VERSION_TYPE_RELEASE: i32 = 0;
pub const IGM_LAUNCHER_CORE_VERSION_TYPE_SNAPSHOT: i32 = 1;
pub const IGM_LAUNCHER_CORE_VERSION_TYPE_OLD_BETA: i32 = 2;
pub const IGM_LAUNCHER_CORE_VERSION_TYPE_OLD_ALPHA: i32 = 3;
pub const IGM_LAUNCHER_CORE_VERSION_TYPE_UNKNOWN: i32 = 4;

/// 本机扫描出的已安装版本
#[repr(C)]
pub struct iGM_Launcher_Core_ScannedVersion {
    /// 版本目录名
    pub id: *const c_char,
    /// 版本号，如 1.20.1
    pub version: *const c_char,
    /// 版本类型，取值见 IGM_LAUNCHER_CORE_VERSION_TYPE_*
    pub version_type: i32,
    /// 加载器类型，取值见 IGM_LAUNCHER_CORE_LOADER_*
    pub loader: i32,
    /// 加载器版本，无法识别时为空字符串
    pub loader_version: *const c_char,
    /// 版本 json 绝对路径
    pub json_path: *const c_char,
}

/// 单个游戏目录的扫描结果
#[repr(C)]
pub struct iGM_Launcher_Core_GameDirScanResult {
    /// 目录绝对路径
    pub path: *const c_char,
    /// 目录是否存在，1 存在 / 0 不存在
    pub exists: i32,
    /// 是否存在 versions/ 目录
    pub has_versions: i32,
    /// 是否存在 libraries/ 目录
    pub has_libraries: i32,
    /// 是否存在 assets/ 目录
    pub has_assets: i32,
    /// 识别到的版本数量
    pub version_count: u32,
}

/// 版本库条目（无本地磁盘路径）
#[repr(C)]
pub struct iGM_Launcher_Core_VersionLibraryItem {
    /// 版本记录 id
    pub id: *const c_char,
    /// 版本号
    pub version: *const c_char,
    /// 版本类型，取值见 IGM_LAUNCHER_CORE_VERSION_TYPE_*
    pub version_type: i32,
    /// 发布时间（ISO 8601 字符串），未知为空字符串
    pub release_time: *const c_char,
    /// 完整大小（字节），尚未计算为 0
    pub total_size: i64,
    /// 本地是否已安装，1 已安装 / 0 未安装
    pub installed: i32,
}

// 核心逻辑（模块五接口签名，全部占位） //
//
// 与模块二 / 模块三一致：以下函数只登记签名与数据结构，保证可编译；
// 真实的目录遍历、版本 json 解析、实例落盘与版本库同步
// 由 apps/shell/src/iGM_Launcher_Bridge.ts 在 Bun 侧实现。

/// 游戏目录：扫描本机常见 Minecraft 目录，返回识别到的目录数或负值状态
#[no_mangle]
pub extern "C" fn iGM_Launcher_ScanMinecraftDirs(
    _out: *mut iGM_Launcher_Core_GameDirScanResult,
    _capacity: u32,
) -> i32 {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 游戏目录：解析单个版本 json，成功时写出 ScannedVersion
#[no_mangle]
pub extern "C" fn iGM_Launcher_ParseVersionJson(
    _json_path: *const c_char,
    _out: *mut iGM_Launcher_Core_ScannedVersion,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 实例：把本机游戏目录导入为实例，成功时写出 InstanceInfo
#[no_mangle]
pub extern "C" fn iGM_Launcher_ImportInstance(
    _dir_path: *const c_char,
    _out: *mut iGM_Launcher_Core_InstanceInfo,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 版本库：与主站版本资料库同步，返回条目数或负值状态
#[no_mangle]
pub extern "C" fn iGM_Launcher_SyncVersionLibrary(
    _out: *mut iGM_Launcher_Core_VersionLibraryItem,
    _capacity: u32,
) -> i32 {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

// 类型定义（模块六：下载安装位置与实例创建联动） //
//
// 两个结构体与 TS 侧 packages/shared 中的镜像类型字段一一对应：
//   RootDirInfo       <-> iGM_Launcher_RootDirInfo
//   InstanceNameCheck <-> iGM_Launcher_InstanceNameCheck
// 字符串字段均为 C 字符串指针，生命周期由调用方保证。

/// 共享根目录来源取值（与 TS 侧 iGM_Launcher_RootDirInfo.source 一致）
pub const IGM_LAUNCHER_CORE_ROOT_SOURCE_REGISTERED: i32 = 0;
pub const IGM_LAUNCHER_CORE_ROOT_SOURCE_EXISTING_DEFAULT: i32 = 1;
pub const IGM_LAUNCHER_CORE_ROOT_SOURCE_SYSTEM_DEFAULT: i32 = 2;

/// 实例名校验原因取值（与 TS 侧 iGM_Launcher_InstanceNameCheck.reason 一致）
pub const IGM_LAUNCHER_CORE_NAME_OK: i32 = 0;
pub const IGM_LAUNCHER_CORE_NAME_EMPTY: i32 = 1;
pub const IGM_LAUNCHER_CORE_NAME_INVALID: i32 = 2;
pub const IGM_LAUNCHER_CORE_NAME_DUPLICATE: i32 = 3;

/// 共享根目录（.minecraft 根）解析结果
#[repr(C)]
pub struct iGM_Launcher_Core_RootDirInfo {
    /// 根目录绝对路径
    pub path: *const c_char,
    /// 目录是否已存在，1 存在 / 0 待创建
    pub exists: i32,
    /// 是否为当前默认根目录，1 是 / 0 否
    pub is_default: i32,
    /// 来源，取值见 IGM_LAUNCHER_CORE_ROOT_SOURCE_*
    pub source: i32,
}

/// 已安装加载器（由已安装版本聚合）
#[repr(C)]
pub struct iGM_Launcher_Core_InstalledLoader {
    /// 加载器类型，取值见 IGM_LAUNCHER_CORE_LOADER_*
    pub loader: i32,
    /// 该加载器下已安装的版本数量
    pub count: u32,
}

/// 实例名校验结果
#[repr(C)]
pub struct iGM_Launcher_Core_InstanceNameCheck {
    /// 是否可用，1 可用 / 0 不可用
    pub valid: i32,
    /// 判定原因，取值见 IGM_LAUNCHER_CORE_NAME_*
    pub reason: i32,
}

// 核心逻辑（模块六接口签名，全部占位） //
//
// 与模块二 / 模块五一致：以下函数只登记签名与数据结构，保证可编译；
// 真实的目录扫描、根目录解析、实例目录创建与实例名校验
// 由 apps/shell/src/iGM_Launcher_Bridge.ts 在 Bun 侧实现。

/// 游戏目录：扫描指定根目录 versions/ 下的已安装版本，返回版本数或负值状态
#[no_mangle]
pub extern "C" fn iGM_Launcher_ScanInstalledVersions(
    _root_dir: *const c_char,
    _out: *mut iGM_Launcher_Core_ScannedVersion,
    _capacity: u32,
) -> i32 {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 游戏目录：聚合指定根目录下已安装的加载器，返回加载器数或负值状态
#[no_mangle]
pub extern "C" fn iGM_Launcher_ScanInstalledLoaders(
    _root_dir: *const c_char,
    _out: *mut iGM_Launcher_Core_InstalledLoader,
    _capacity: u32,
) -> i32 {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 游戏目录：解析本机默认共享根目录（优先已存在的 .minecraft）
#[no_mangle]
pub extern "C" fn iGM_Launcher_GetDefaultRootDir(
    _out: *mut iGM_Launcher_Core_RootDirInfo,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 实例：在根目录下创建 instances/<实例名> 隔离目录（含 mods / config / saves 等子目录）
#[no_mangle]
pub extern "C" fn iGM_Launcher_CreateInstanceDir(
    _root_dir: *const c_char,
    _instance_name: *const c_char,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

/// 实例：校验实例名（非空 / 字符合法 / 不重名），结果写出到 out
#[no_mangle]
pub extern "C" fn iGM_Launcher_ValidateInstanceName(
    _instance_name: *const c_char,
    _out: *mut iGM_Launcher_Core_InstanceNameCheck,
) -> iGM_Launcher_Core_Status {
    IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
}

// 导出 //

#[cfg(test)]
mod iGM_Launcher_Core_Tests {
    use super::*;

    #[test]
    fn iGM_Launcher_Core_Init_Returns_Ok() {
        assert_eq!(iGM_Launcher_Core_Init(), IGM_LAUNCHER_CORE_OK);
    }

    #[test]
    fn iGM_Launcher_Core_Version_Is_Readable() {
        let version = unsafe { std::ffi::CStr::from_ptr(iGM_Launcher_Core_GetVersion()) };
        assert_eq!(version.to_str().unwrap(), "0.1.0");
    }

    /// 模块二接口在 Rust 侧一律返回未实现，真实逻辑由 Bun 桥接层占位承载
    #[test]
    fn iGM_Launcher_Module2_Interfaces_Return_Not_Implemented() {
        let name = b"test\0".as_ptr() as *const std::os::raw::c_char;
        assert_eq!(
            iGM_Launcher_Instance_Create(name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Instance_Delete(name),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Instance_List(std::ptr::null_mut(), 0),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Java_Detect(std::ptr::null_mut(), 0),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(iGM_Launcher_Java_Download(17, 0), IGM_LAUNCHER_CORE_NOT_IMPLEMENTED);
        assert_eq!(
            iGM_Launcher_Java_Test(name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Account_Login(name, name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Account_GetCurrent(std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Account_Logout(),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Account_Sync(std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
    }

    /// 模块三认证链接口在 Rust 侧同样一律返回未实现，真实 https 调用由 Bun 桥接层承载；
    /// 其中前三步已迁移至子模块 iGM_Launcher_MSAuth（契约测试见该模块内部测试）
    #[test]
    fn iGM_Launcher_Module3_Auth_Chain_Returns_Not_Implemented() {
        let name = b"test\0".as_ptr() as *const std::os::raw::c_char;
        assert_eq!(
            iGM_Launcher_MSA_RefreshToken(name, name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Minecraft_Authenticate(name, name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Minecraft_GetProfile(name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_Minecraft_CheckEntitlements(name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
    }

    /// 模块五离线游戏接口在 Rust 侧同样一律返回未实现，
    /// 真实的目录扫描、版本解析、实例导入与版本库同步由 Bun 桥接层承载
    #[test]
    fn iGM_Launcher_Module5_Offline_Interfaces_Return_Not_Implemented() {
        let name = b"test\0".as_ptr() as *const std::os::raw::c_char;
        assert_eq!(
            iGM_Launcher_ScanMinecraftDirs(std::ptr::null_mut(), 0),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_ParseVersionJson(name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_ImportInstance(name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_SyncVersionLibrary(std::ptr::null_mut(), 0),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
    }

    /// 模块五版本类型系数与 TS 侧 iGM_Launcher_VersionType 取值保持一致
    #[test]
    fn iGM_Launcher_Module5_Version_Type_Codes_Are_Ordered() {
        assert_eq!(IGM_LAUNCHER_CORE_VERSION_TYPE_RELEASE, 0);
        assert_eq!(IGM_LAUNCHER_CORE_VERSION_TYPE_SNAPSHOT, 1);
        assert_eq!(IGM_LAUNCHER_CORE_VERSION_TYPE_OLD_BETA, 2);
        assert_eq!(IGM_LAUNCHER_CORE_VERSION_TYPE_OLD_ALPHA, 3);
        assert_eq!(IGM_LAUNCHER_CORE_VERSION_TYPE_UNKNOWN, 4);
    }

    /// 模块六下载安装位置与实例创建接口在 Rust 侧同样一律返回未实现，
    /// 真实的已安装版本扫描、根目录解析、实例目录创建与实例名校验由 Bun 桥接层承载
    #[test]
    fn iGM_Launcher_Module6_Install_Layout_Interfaces_Return_Not_Implemented() {
        let name = b"test\0".as_ptr() as *const std::os::raw::c_char;
        assert_eq!(
            iGM_Launcher_ScanInstalledVersions(name, std::ptr::null_mut(), 0),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_ScanInstalledLoaders(name, std::ptr::null_mut(), 0),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_GetDefaultRootDir(std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_CreateInstanceDir(name, name),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
        assert_eq!(
            iGM_Launcher_ValidateInstanceName(name, std::ptr::null_mut()),
            IGM_LAUNCHER_CORE_NOT_IMPLEMENTED
        );
    }

    /// 模块六根目录来源与实例名校验原因系数与 TS 侧取值保持一致
    #[test]
    fn iGM_Launcher_Module6_Codes_Are_Ordered() {
        assert_eq!(IGM_LAUNCHER_CORE_ROOT_SOURCE_REGISTERED, 0);
        assert_eq!(IGM_LAUNCHER_CORE_ROOT_SOURCE_EXISTING_DEFAULT, 1);
        assert_eq!(IGM_LAUNCHER_CORE_ROOT_SOURCE_SYSTEM_DEFAULT, 2);
        assert_eq!(IGM_LAUNCHER_CORE_NAME_OK, 0);
        assert_eq!(IGM_LAUNCHER_CORE_NAME_EMPTY, 1);
        assert_eq!(IGM_LAUNCHER_CORE_NAME_INVALID, 2);
        assert_eq!(IGM_LAUNCHER_CORE_NAME_DUPLICATE, 3);
    }

    /// 模块三阶段系数与 TS 侧 IGM_LAUNCHER_MC_AUTH_STAGES 顺序保持一致
    #[test]
    fn iGM_Launcher_Module3_Stage_Codes_Are_Ordered() {
        assert_eq!(IGM_LAUNCHER_CORE_MC_STAGE_MSA, 0);
        assert_eq!(IGM_LAUNCHER_CORE_MC_STAGE_XBOX, 1);
        assert_eq!(IGM_LAUNCHER_CORE_MC_STAGE_XSTS, 2);
        assert_eq!(IGM_LAUNCHER_CORE_MC_STAGE_MINECRAFT, 3);
        assert_eq!(IGM_LAUNCHER_CORE_MC_STAGE_PROFILE, 4);
        assert_eq!(IGM_LAUNCHER_CORE_MC_STAGE_ENTITLEMENTS, 5);
    }
}