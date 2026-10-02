/**
 * 文件路径：iGM_Server/src/iGM_Config/iGM_Config.ts
 * 所属层：后端 / 基础配置层
 * 路由：全局
 * 模块：iGM_Config
 * 作用：统一读取本地后端运行所需的环境配置
 * 内容：服务端口、PostgreSQL 连接串、CORS 白名单、认证会话参数、
 *       邮箱验证码与重置令牌时效、基础限流参数、163 邮箱 SMTP 邮件配置、
 *       模块四本地文件上传存储配置、模块十七 Minecraft 本体下载配置、
 *       模块二十第三方资源（Modrinth）接入配置
 */

// 导入依赖 //
import { resolve } from "node:path";
import { homedir } from "node:os";

// 类型定义 //
/** 认证与令牌相关配置 */
export interface iGM_AuthConfig {
  /** 会话 Cookie 名称 */
  cookieName: string;
  /** 登录会话有效期（毫秒），默认 7 天 */
  sessionTtlMs: number;
  /** 邮箱验证码有效期（毫秒），默认 10 分钟 */
  verifyCodeTtlMs: number;
  /** 密码重置令牌有效期（毫秒），默认 30 分钟 */
  resetTokenTtlMs: number;
  /** 单个验证码/令牌允许的最大校验尝试次数 */
  maxVerifyAttempts: number;
  /** 前端站点基础地址，用于拼接邮件内链接 */
  webBaseUrl: string;
  /** 本地开发是否仅在控制台输出邮件（不真正发送），默认 true */
  mailConsoleOnly: boolean;
}

/** 基础限流配置：固定时间窗内最大请求次数 */
export interface iGM_RateLimitRule {
  /** 时间窗长度（毫秒） */
  windowMs: number;
  /** 窗口内最大次数 */
  max: number;
}

export interface iGM_MailConfig {
  /** SMTP 主机 */
  host: string;
  /** SMTP 端口 */
  port: number;
  /** 是否使用隐式 TLS */
  secure: boolean;
  /** SMTP 登录用户 */
  user: string;
  /** SMTP 登录密码/密钥 */
  pass: string;
  /** 发件人地址 */
  from: string;
}

/** 模块四：本地文件上传与存储配置 */
export interface iGM_UploadConfig {
  /** 本地存储根目录（禁止前端直接访问磁盘路径） */
  rootDir: string;
  /** 单文件大小上限（字节），默认 20MB */
  maxFileSize: number;
  /** 图片单边像素上限，防止解压炸弹，默认 8000px */
  imageMaxDimension: number;
  /** 允许的扩展名白名单（小写，不含点） */
  allowedExtensions: string[];
  /** 允许的 MIME 类型白名单（用于交叉校验） */
  allowedMimeTypes: string[];
}

/** 模块十七：Minecraft 本体下载配置 */
export interface iGM_GameConfig {
  /** Mojang 官方版本清单地址 */
  manifestUrl: string;
  /** 默认安装目录（用户未指定时使用）；最终目录为 <该目录>/<版本目录名> */
  defaultInstallDir: string;
  /**
   * assets 资源对象的下载根地址（Mojang 官方资源 CDN）
   * 说明：版本 JSON 里的 assetIndex.url 指向 piston-meta 的索引文件本身，
   *       其目录结构与资源对象无关，不能据其拼接对象地址；对象地址固定为
   *       <assetBaseUrl>/<hash 前两位>/<hash>
   */
  assetBaseUrl: string;
  /**
   * Fabric 元数据基础地址
   * 说明：模块十八支持 Fabric 加载器，profile JSON 与依赖库均来自 Fabric 官方 meta
   */
  fabricMetaUrl: string;
  /** 默认并发下载数 */
  concurrency: number;
  /** 并发上限（任何情况下不得超过该值） */
  maxConcurrency: number;
  /**
   * 全局每秒请求数上限（滑动窗口限速）
   * 说明：Minecraft 资源以大量小文件为主（本项目版本约 5200 个，平均不足 100KB），
   *       吞吐由请求并发度而非带宽决定，故限速以「整体速率」为口径。
   *       取 0 表示不限速；官方 CDN 本身为高并发设计，该值兼顾速度与风控。
   */
  maxRequestsPerSecond: number;
  /** 429/503 指数退避的最大重试次数 */
  maxRetries: number;
  /** 连续失败达到该次数后进入冷却 */
  maxConsecutiveFailures: number;
  /** 冷却时长（毫秒） */
  cooldownMs: number;
}

/**
 * 模块二十：第三方资源（Modrinth）接入与下载配置
 * 说明：本模块仅支持 Fabric 加载器与 Modrinth 平台，资源文件不落本站服务器存储
 */
export interface iGM_ThirdPartyConfig {
  /** Modrinth API 基础地址 */
  modrinthApiUrl: string;
  /** 请求 User-Agent（Modrinth 要求标识调用方与联系方式） */
  userAgent: string;
  /** 请求间隔下限（毫秒）——两次上游请求之间的随机间隔，避免被识别为网络攻击 */
  minRequestIntervalMs: number;
  /** 请求间隔上限（毫秒） */
  maxRequestIntervalMs: number;
  /** 429/503 指数退避的最大重试次数 */
  maxRetries: number;
  /** 单次上游请求超时（毫秒） */
  timeoutMs: number;
  /** 元数据缓存有效期（毫秒），过期后重新向上游拉取 */
  cacheTtlMs: number;
  /** 默认下载目录（调用方未指定 target 时使用） */
  defaultDownloadDir: string;
  /** 单文件大小上限（字节），超过直接拒绝，防止误下超大文件 */
  maxFileSize: number;
}

/**
 * 模块二十一：OAuth 2.0 + OpenID Connect 身份提供方配置
 * 说明：第三方网站通过本站账号登录；令牌有效期遵循既定规则
 */
export interface iGM_OAuthConfig {
  /** 签发方标识（iss），同时作为 OIDC 发现文档的 issuer */
  issuer: string;
  /** 前端授权同意页路径（后端 /oauth/authorize 校验后跳转到此页） */
  consentPath: string;
  /** 授权同意页的语言前缀（前端为 URL 前缀式多语言路由，须带 /{locale}） */
  consentLocale: string;
  /** access_token 有效期（秒），默认 1 小时 */
  accessTokenTtlSeconds: number;
  /** refresh_token 最长有效期（秒），默认 180 天（两个季度） */
  refreshTokenTtlSeconds: number;
  /** 授权码有效期（秒），默认 5 分钟 */
  codeTtlSeconds: number;
  /** 授权流签名 Cookie 名称 */
  flowCookieName: string;
  /** 授权流签名 Cookie 有效期（秒），默认 10 分钟 */
  flowTtlSeconds: number;
  /** 是否允许 http 回调地址（仅本地开发放行 localhost） */
  allowHttpRedirect: boolean;
}

export interface iGM_AppConfig {
  /** 后端监听端口 */
  port: number;
  /** PostgreSQL 连接串（本地 Docker 容器） */
  databaseUrl: string;
  /** CORS 允许来源白名单 */
  corsOrigins: string[];
  /** 服务版本号 */
  version: string;
  /** 认证相关配置 */
  auth: iGM_AuthConfig;
  /** 各接口的限流规则 */
  rateLimits: Record<string, iGM_RateLimitRule>;
  /** 163 邮箱 SMTP 邮件配置 */
  mail: iGM_MailConfig;
  /** 模块四：本地文件上传存储配置 */
  upload: iGM_UploadConfig;
  /** 模块十七：Minecraft 本体下载配置 */
  game: iGM_GameConfig;
  /** 模块二十：第三方资源（Modrinth）接入与下载配置 */
  thirdParty: iGM_ThirdPartyConfig;
  /** 模块二十一：OAuth 2.0 + OIDC 身份提供方配置 */
  oauth: iGM_OAuthConfig;
}

// 核心逻辑 //
/**
 * iGM_Config 环境配置读取
 * 模块二在模块一最小配置上扩展认证、限流与邮件配置
 */
export const iGM_Config: iGM_AppConfig = {
  port: Number(process.env.IGM_PORT ?? 3001),
  // 本地 Docker 中的 PostgreSQL；生产/其他环境通过 DATABASE_URL 覆盖
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://iguser:igpassword@localhost:5432/igcraftlit",
  corsOrigins: [
    "https://igcraftlit.com",
    "https://www.igcraftlit.com",
    // 模块二十一：开发者平台（iGM CLI / OAuth 接入）独立站点，需携带会话 Cookie 调用本站接口
    "https://cli.igcraftlit.com",
    "http://localhost:3000",
  ],
  version: "0.5.0",
  auth: {
    cookieName: "iGM_SID",
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    verifyCodeTtlMs: 10 * 60 * 1000,
    resetTokenTtlMs: 30 * 60 * 1000,
    maxVerifyAttempts: 5,
    webBaseUrl: process.env.IGM_WEB_BASE_URL ?? "http://localhost:3000",
    // 默认真实发信；本地调试时可设 IGM_MAIL_CONSOLE_ONLY=true
    // 退回到控制台输出（不实际发信）
    mailConsoleOnly: (process.env.IGM_MAIL_CONSOLE_ONLY ?? "false") === "true",
  },
  rateLimits: {
    // 登录：15 分钟内最多 10 次尝试，防止暴力破解
    login: { windowMs: 15 * 60 * 1000, max: 10 },
    // 注册：10 分钟内最多 5 次
    register: { windowMs: 10 * 60 * 1000, max: 5 },
    // 发送验证码：10 分钟内最多 3 次
    sendVerification: { windowMs: 10 * 60 * 1000, max: 3 },
    // 发送重置密码邮件：15 分钟内最多 3 次
    forgotPassword: { windowMs: 15 * 60 * 1000, max: 3 },
    // 重置密码/验证邮箱：15 分钟内最多 10 次提交
    verify: { windowMs: 15 * 60 * 1000, max: 10 },
    // 模块三：发帖——10 分钟内最多 10 篇
    createPost: { windowMs: 10 * 60 * 1000, max: 10 },
    // 模块三：评论/回复——1 分钟内最多 10 条
    createComment: { windowMs: 60 * 1000, max: 10 },
    // 模块三：点赞/收藏——1 分钟内最多 60 次
    interact: { windowMs: 60 * 1000, max: 60 },
    // 模块三：资料编辑——10 分钟内最多 10 次
    profileUpdate: { windowMs: 10 * 60 * 1000, max: 10 },
    // 模块四：文件上传——10 分钟内最多 30 次
    upload: { windowMs: 10 * 60 * 1000, max: 30 },
    // 模块四：活动创建/编辑——10 分钟内最多 20 次
    activityWrite: { windowMs: 10 * 60 * 1000, max: 20 },
    // 模块四：活动报名/取消报名——1 分钟内最多 20 次
    activityRegister: { windowMs: 60 * 1000, max: 20 },
    // 模块四：资源创建/编辑——10 分钟内最多 20 次
    resourceWrite: { windowMs: 10 * 60 * 1000, max: 20 },
    // 模块四：资源下载——1 分钟内最多 60 次
    resourceDownload: { windowMs: 60 * 1000, max: 60 },
    // 模块四：通知偏好更新——10 分钟内最多 20 次
    notificationWrite: { windowMs: 10 * 60 * 1000, max: 20 },
    // 模块五：管理后台写操作——1 分钟内最多 20 次
    adminWrite: { windowMs: 60 * 1000, max: 20 },
    // 模块五：每日签到——1 分钟内最多 5 次（防连点，业务层另有当日唯一约束）
    checkin: { windowMs: 60 * 1000, max: 5 },
    // 模块五：管理后台测试邮件——10 分钟内最多 3 次
    mailTest: { windowMs: 10 * 60 * 1000, max: 3 },
    // 模块七：组织认证申请提交/取消——10 分钟内最多 5 次
    orgVerifyWrite: { windowMs: 10 * 60 * 1000, max: 5 },
    // 模块九：WebSocket 连接——60 秒内最多 10 次（按客户端 IP）
    wsConnect: { windowMs: 60 * 1000, max: 10 },
    // 模块九：统计查询——60 秒内最多 60 次（按用户 ID）
    statsQuery: { windowMs: 60 * 1000, max: 60 },
    // 模块十：社交写操作（关注/好友/黑名单）——1 分钟内最多 30 次
    socialWrite: { windowMs: 60 * 1000, max: 30 },
    // 模块十：私信发送/撤回——1 分钟内最多 30 条
    messageWrite: { windowMs: 60 * 1000, max: 30 },
    // 模块十：Minecraft 资源写操作——10 分钟内最多 20 次
    mcWrite: { windowMs: 10 * 60 * 1000, max: 20 },
    // 模块十五：等级考核申请提交——10 分钟内最多 5 次
    examWrite: { windowMs: 10 * 60 * 1000, max: 5 },
    // 模块十五：任务奖励领取——1 分钟内最多 10 次（业务层另有周期内唯一领取约束）
    taskClaim: { windowMs: 60 * 1000, max: 10 },
    // 模块十五：开发者申请提交——10 分钟内最多 5 次
    developerApply: { windowMs: 10 * 60 * 1000, max: 5 },
    // 模块十七：游戏本体下载任务创建——10 分钟内最多 5 次
    gameInstall: { windowMs: 10 * 60 * 1000, max: 5 },
    // 模块十七：已安装版本管理写操作（校验/修复/删除）——1 分钟内最多 30 次
    gameWrite: { windowMs: 60 * 1000, max: 30 },
    // 模块十七：原生文件夹选择器——1 分钟内最多 10 次
    gameFolderPick: { windowMs: 60 * 1000, max: 10 },
    // 模块二十：第三方资源搜索/详情（会触发上游请求）——1 分钟内最多 60 次
    thirdPartySearch: { windowMs: 60 * 1000, max: 60 },
    // 模块二十：第三方资源下载任务创建——10 分钟内最多 20 次
    thirdPartyDownload: { windowMs: 10 * 60 * 1000, max: 20 },
    // 模块二十：下载任务控制（暂停/取消/重试/删除）——1 分钟内最多 60 次
    thirdPartyTask: { windowMs: 60 * 1000, max: 60 },
    // 模块二十一：OAuth 令牌端点（授权码换令牌 / 刷新）——1 分钟内最多 60 次
    oauthToken: { windowMs: 60 * 1000, max: 60 },
    // 模块二十一：授权端点与授权决策——1 分钟内最多 30 次
    oauthAuthorize: { windowMs: 60 * 1000, max: 30 },
    // 模块二十一：应用申请 / 重新申请——10 分钟内最多 5 次
    oauthAppWrite: { windowMs: 10 * 60 * 1000, max: 5 },
    // 模块二十一：用户信息 / 撤销端点——1 分钟内最多 60 次
    oauthUserinfo: { windowMs: 60 * 1000, max: 60 },
  },
  mail: {
    // 163 邮箱 SMTP：465 端口隐式 SSL；密码使用客户端授权码（非登录密码），
    // 授权码仅从环境变量读取，禁止写入代码或提交到仓库
    host: process.env.SMTP_HOST ?? "smtp.163.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : true,
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    // 163 要求发件人与认证账号一致
    from: process.env.MAIL_FROM ?? "",
  },
  upload: {
    // 本地存储根目录：D:/IGWEB/uploads，按 用户/年月 分目录存放
    rootDir:
      process.env.IGM_UPLOAD_DIR ??
      resolve(import.meta.dir, "../../../uploads"),
    // 单文件上限 20MB（可通过 IGM_UPLOAD_MAX_SIZE 覆盖）
    maxFileSize: Number(process.env.IGM_UPLOAD_MAX_SIZE ?? 20 * 1024 * 1024),
    // 图片单边像素上限 8000px（可通过 IGM_UPLOAD_IMAGE_MAX_DIM 覆盖）
    imageMaxDimension: Number(process.env.IGM_UPLOAD_IMAGE_MAX_DIM ?? 8000),
    // 允许扩展名：图片、文档、压缩包等常见格式
    allowedExtensions: [
      "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp",
      "pdf", "txt", "md", "csv",
      "doc", "docx", "xls", "xlsx", "ppt", "pptx",
      "zip", "rar", "7z", "gz", "tar",
      "json", "xml", "yml", "yaml",
      "jar", "mcpack", "mcaddon", "mcworld",
    ],
    // 允许 MIME：与扩展名交叉校验，防止伪装扩展名上传可执行文件
    allowedMimeTypes: [
      "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
      "image/bmp", "image/x-icon",
      "application/pdf", "text/plain", "text/markdown", "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip", "application/x-zip-compressed", "application/x-rar-compressed",
      "application/x-7z-compressed", "application/gzip", "application/x-tar",
      "application/json", "application/xml", "text/xml", "text/yaml",
      "application/java-archive",
    ],
  },
  game: {
    // Mojang 官方版本清单（同步脚本与下载引擎共用）
    manifestUrl:
      process.env.IGM_GAME_MANIFEST_URL ??
      "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
    // 默认安装目录：系统用户目录下的 .minecraft（各版本在其下独立成目录）
    defaultInstallDir:
      process.env.IGM_GAME_INSTALL_DIR ?? resolve(homedir(), ".minecraft"),
    // assets 资源对象根地址（Mojang 官方资源 CDN，与索引所在站点不同）
    assetBaseUrl:
      process.env.IGM_GAME_ASSET_BASE_URL ??
      "https://resources.download.minecraft.net",
    // Fabric 官方 meta：/versions/loader、/versions/loader/{game}/{loader}/profile/json
    fabricMetaUrl:
      process.env.IGM_GAME_FABRIC_META_URL ?? "https://meta.fabricmc.net/v2",
    concurrency: Number(process.env.IGM_GAME_CONCURRENCY ?? 32),
    maxConcurrency: 64,
    maxRequestsPerSecond: Number(process.env.IGM_GAME_MAX_RPS ?? 80),
    maxRetries: 5,
    maxConsecutiveFailures: 10,
    cooldownMs: 60 * 1000,
  },
  thirdParty: {
    // Modrinth 公开 API（无需 API Key）
    modrinthApiUrl:
      process.env.IGM_MODRINTH_API_URL ?? "https://api.modrinth.com/v2",
    // Modrinth 要求携带可识别调用方的 User-Agent
    userAgent:
      process.env.IGM_MODRINTH_USER_AGENT ??
      "iGM-CraftCeon/1.0 (contact: igcraftlit@outlook.com)",
    // 请求间隔 100~300 毫秒随机，避免被识别为网络攻击
    minRequestIntervalMs: Number(process.env.IGM_MODRINTH_MIN_INTERVAL_MS ?? 100),
    maxRequestIntervalMs: Number(process.env.IGM_MODRINTH_MAX_INTERVAL_MS ?? 300),
    maxRetries: Number(process.env.IGM_MODRINTH_MAX_RETRIES ?? 5),
    timeoutMs: Number(process.env.IGM_MODRINTH_TIMEOUT_MS ?? 15000),
    // 元数据缓存 10 分钟，减少对上游的重复请求
    cacheTtlMs: Number(process.env.IGM_MODRINTH_CACHE_TTL_MS ?? 10 * 60 * 1000),
    // 默认下载目录：仓库根目录下的 downloads（调用方可指定 target 覆盖）
    defaultDownloadDir:
      process.env.IGM_THIRD_PARTY_DOWNLOAD_DIR ??
      resolve(import.meta.dir, "../../../downloads"),
    // 单文件上限 2GB，超过直接拒绝
    maxFileSize: Number(process.env.IGM_THIRD_PARTY_MAX_FILE_SIZE ?? 2 * 1024 * 1024 * 1024),
  },
  oauth: {
    // 签发方：线路上后端位于 api.igcraftlit.com；本地开发回退 localhost:3001
    issuer: process.env.IGM_OAUTH_ISSUER ?? "https://api.igcraftlit.com",
    // 后端 /oauth/authorize 校验通过后跳转的前端授权同意页
    consentPath: "/G_OAuthAuthorize",
    // 同意页语言前缀（前端路由为 /{locale}/G_OAuthAuthorize，缺前缀会 404）
    consentLocale: process.env.IGM_OAUTH_CONSENT_LOCALE ?? "zh-CN",
    // access_token 短有效期：1 小时
    accessTokenTtlSeconds: Number(process.env.IGM_OAUTH_ACCESS_TTL ?? 60 * 60),
    // refresh_token 最长两个季度（约 180 天），到期必须重新授权
    refreshTokenTtlSeconds: Number(
      process.env.IGM_OAUTH_REFRESH_TTL ?? 180 * 24 * 60 * 60,
    ),
    // 授权码一次性、5 分钟有效
    codeTtlSeconds: Number(process.env.IGM_OAUTH_CODE_TTL ?? 5 * 60),
    flowCookieName: "iGM_OAuthFlow",
    flowTtlSeconds: Number(process.env.IGM_OAUTH_FLOW_TTL ?? 10 * 60),
    // 仅本地开发允许 http 回调（限 localhost / 127.0.0.1）
    allowHttpRedirect:
      (process.env.IGM_OAUTH_ALLOW_HTTP ?? "true") === "true",
  },
};

// 导出 //
export default iGM_Config;
