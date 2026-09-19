/**
 * 文件路径：iGM_Server/src/iGM_Config/iGM_Config.ts
 * 所属层：后端 / 基础配置层
 * 路由：全局
 * 模块：iGM_Config
 * 作用：统一读取本地后端运行所需的环境配置
 * 内容：服务端口、SQLite 文件路径、CORS 白名单、认证会话参数、
 *       邮箱验证码与重置令牌时效、基础限流参数、163 邮箱 SMTP 邮件配置、
 *       模块四本地文件上传存储配置
 */

// 导入依赖 //
import { resolve } from "node:path";

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

export interface iGM_AppConfig {
  /** 后端监听端口 */
  port: number;
  /** 本地原生 SQLite 数据库文件路径 */
  databasePath: string;
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
}

// 核心逻辑 //
/**
 * iGM_Config 环境配置读取
 * 模块二在模块一最小配置上扩展认证、限流与邮件配置
 */
export const iGM_Config: iGM_AppConfig = {
  port: Number(process.env.IGM_PORT ?? 3001),
  databasePath:
    process.env.IGM_DATABASE_PATH ??
    resolve(import.meta.dir, "../../../database/igcraftlit.sqlite"),
  corsOrigins: [
    "https://igcraftlit.com",
    "https://www.igcraftlit.com",
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
};

// 导出 //
export default iGM_Config;
