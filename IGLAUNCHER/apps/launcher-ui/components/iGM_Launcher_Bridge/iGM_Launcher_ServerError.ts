/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Bridge/iGM_Launcher_ServerError.ts
 * 所属层：前端 / 桥接层工具
 * 路由：全局
 * 模块：iGM_Launcher_ServerError
 * 作用：把主站返回的业务错误归一化为启动器本地文案
 * 内容：主站业务失败时 message 形如 auth.errors.unauthorized（语言包键），
 *       启动器语言包不含该命名空间，直接展示会把键名暴露给用户；
 *       这里把已知键映射到 thirdParty 命名空间下的本地文案，
 *       未知键与不可解析的文案一并回退到调用方给定的兜底键。
 */

// 导入依赖 //
/** 文案函数签名（next-intl 的 t，仅取字符串结果） */
type iGM_Launcher_MessageFn = (key: string) => string;

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
/**
 * 主站业务错误键 -> 启动器 thirdParty 命名空间下的文案键。
 * 只覆盖启动器可能触发的场景，其余一律回退兜底键。
 */
const IGM_LAUNCHER_SERVER_ERROR_MAP: Record<string, string> = {
  "auth.errors.unauthorized": "serverUnauthorized",
  "auth.errors.forbidden": "serverForbidden",
  "auth.errors.tooManyRequests": "serverTooManyRequests",
  "auth.errors.badRequest": "serverBadRequest",
  "auth.errors.accountSuspended": "serverAccountSuspended",
  "community.errors.notFound": "serverNotFound",
  "community.errors.forbidden": "serverForbidden",
  "community.errors.generic": "serverGeneric",
};

/** 是否形如「语言包键」（全串由点分隔的标识符组成，不含空格与中文） */
function iGM_Launcher_LooksLikeMessageKey(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(value);
}

/**
 * 归一化桥接层回传的错误文案。
 * @param t 文案函数（thirdParty 命名空间）
 * @param message 桥接层 response.message
 * @param fallbackKey 无法识别时使用的本地兜底文案键
 */
export function iGM_Launcher_ResolveServerMessage(
  t: iGM_Launcher_MessageFn,
  message: string | undefined,
  fallbackKey: string,
): string {
  const raw = (message ?? "").trim();
  if (!raw) return t(fallbackKey);
  if (iGM_Launcher_LooksLikeMessageKey(raw)) {
    const mapped = IGM_LAUNCHER_SERVER_ERROR_MAP[raw];
    return mapped ? t(mapped) : t(fallbackKey);
  }
  // 已经是可读文案（下载引擎的进度错误等）时原样展示
  return raw;
}

// 导出 //
export default iGM_Launcher_ResolveServerMessage;