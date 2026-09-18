/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_RateLimitService.ts
 * 所属层：后端 / 基础服务层
 * 路由：全局（G_Auth 各接口）
 * 模块：iGM_RateLimitService
 * 作用：基于内存的基础固定窗口限流，防止暴力登录与邮件滥发
 * 内容：按 动作 + 标识（IP/IP+邮箱）统计窗口内请求次数，超限返回剩余等待秒数
 * 说明：本地单进程足够；将来迁移多实例时可替换为 SQLite/KV 实现
 */

// 导入依赖 //
// （零依赖，仅使用 Map 与 Date）

// 类型定义 //
interface iGM_RateLimitEntry {
  /** 当前窗口起始时间戳（毫秒） */
  windowStartedAt: number;
  /** 窗口内已计数请求数 */
  count: number;
}

export interface iGM_RateLimitResult {
  /** 是否允许本次请求 */
  allowed: boolean;
  /** 窗口内剩余可用次数 */
  remaining: number;
  /** 若被限流，距窗口重置的秒数 */
  retryAfterSeconds: number;
}

// 核心逻辑 //
/** 内存计数器：key = `${action}:${identifier}` */
const iGM_Store = new Map<string, iGM_RateLimitEntry>();

// 定期清理过期条目，避免内存无限增长（每 5 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of iGM_Store) {
    // 窗口超过 1 小时的条目直接清理（所有规则窗口均远小于此）
    if (now - entry.windowStartedAt > 60 * 60 * 1000) {
      iGM_Store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref?.();

/**
 * 记录一次请求并判断是否放行
 * @param action 限流动作名（login/register/sendVerification/...）
 * @param identifier 限流标识（客户端 IP，或 IP + 邮箱）
 * @param windowMs 时间窗毫秒数
 * @param max 窗口内最大次数
 */
export function iGM_CheckRateLimit(
  action: string,
  identifier: string,
  windowMs: number,
  max: number,
): iGM_RateLimitResult {
  const key = `${action}:${identifier}`;
  const now = Date.now();
  const existing = iGM_Store.get(key);

  if (!existing || now - existing.windowStartedAt >= windowMs) {
    iGM_Store.set(key, { windowStartedAt: now, count: 1 });
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > max) {
    const retryAfterSeconds = Math.ceil(
      (existing.windowStartedAt + windowMs - now) / 1000,
    );
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(retryAfterSeconds, 1),
    };
  }

  return {
    allowed: true,
    remaining: max - existing.count,
    retryAfterSeconds: 0,
  };
}

/** 登录成功后清除该 IP+邮箱的失败计数，避免正常用户被历史失败拖累 */
export function iGM_ResetRateLimit(action: string, identifier: string): void {
  iGM_Store.delete(`${action}:${identifier}`);
}

// 导出 //
export default { iGM_CheckRateLimit, iGM_ResetRateLimit };
