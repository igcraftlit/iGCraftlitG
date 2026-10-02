/**
 * 文件路径：iGM_Server/src/iGM_Middleware/iGM_AuthGuard.ts
 * 所属层：后端 / 中间件层
 * 路由：G_Auth
 * 模块：iGM_AuthGuard
 * 作用：接口侧的登录与角色基础权限校验
 * 内容：要求登录、要求指定角色（user/moderator/admin）、客户端 IP 解析
 * 说明：这是真正的安全边界；前端角色控制仅为体验优化
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_AuthError,
  iGM_ResolveSession,
} from "../iGM_Services/iGM_AuthService";
import { iGM_ReadCookie } from "../iGM_Services/iGM_SecurityService";
import { iGM_FindOwnerOrgByEmail } from "../iGM_Types/iGM_OrgVerify";
import type {
  iGM_UserRole,
  iGM_UserRow,
} from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** Bun/Elysia 服务端的最小结构类型（仅取 requestIP，避免 Server 泛型耦合） */
export interface iGM_NetworkServer {
  requestIP(request: Request): { address: string } | null;
}

/** 角色权重：数字越大权限越高 */
const iGM_RoleWeight: Record<iGM_UserRole, number> = {
  user: 1,
  moderator: 2,
  admin: 3,
};

// 核心逻辑 //
/** 要求当前请求已登录，返回用户行；否则抛 401 */
export function iGM_RequireUser(
  user: iGM_UserRow | null,
): iGM_UserRow {
  if (!user) {
    throw new iGM_AuthError("auth.errors.unauthorized", 401);
  }
  return user;
}

/** 要求当前用户具有指定角色或更高权限；否则抛 403 */
export function iGM_RequireRole(
  user: iGM_UserRow | null,
  required: iGM_UserRole,
): iGM_UserRow {
  const current = iGM_RequireUser(user);
  if (iGM_RoleWeight[current.iGM_Role] < iGM_RoleWeight[required]) {
    throw new iGM_AuthError("auth.errors.forbidden", 403);
  }
  return current;
}

/**
 * 模块二十五：管理后台整合后的「管理人员」判定。
 * 管理员，或两个受信任组织的负责人邮箱（iGCraftLit / MuoCeon，大小写不敏感）。
 * 负责人账号为普通角色，仅获得综合 / 审核 / 系统面板的只读访问，
 * 系统核心配置写操作、测试邮件仍由 iGM_RequireRole("admin") 单独强制。
 */
export function iGM_IsStaff(user: iGM_UserRow | null): boolean {
  if (!user) return false;
  if (user.iGM_Role === "admin") return true;
  return iGM_FindOwnerOrgByEmail(user.iGM_Email) !== null;
}

/** 要求当前用户为管理人员（管理员或受信任组织负责人）；否则抛 403 */
export function iGM_RequireStaff(user: iGM_UserRow | null): iGM_UserRow {
  const current = iGM_RequireUser(user);
  if (!iGM_IsStaff(current)) {
    throw new iGM_AuthError("auth.errors.forbidden", 403);
  }
  return current;
}

/**
 * 模块二十五：面板整合后的只读入口鉴权——
 * 管理人员（管理员 / 组织负责人）或达到指定角色的协管员均可访问。
 * 写操作仍须在各 handler 内使用 iGM_RequireRole / iGM_RequireStaff 单独强制。
 */
export function iGM_RequireStaffOrRole(
  user: iGM_UserRow | null,
  required: iGM_UserRole,
): iGM_UserRow {
  if (iGM_IsStaff(user)) return iGM_RequireUser(user);
  return iGM_RequireRole(user, required);
}

/**
 * 从请求 Cookie 会话解析当前登录用户：未登录或会话失效返回 null。
 * 模块三 G_Community / G_Post 路由统一使用该助手获取登录态
 */
export async function iGM_ResolveRequestUser(
  request: Request,
): Promise<iGM_UserRow | null> {
  const rawSessionId = iGM_ReadCookie(request, iGM_Config.auth.cookieName);
  return await iGM_ResolveSession(rawSessionId);
}

/**
 * 解析客户端真实 IP：
 * 优先反向代理注入的客户端头（Cloudflare 隧道经 cloudflared 转发时，
 * 直连地址恒为 127.0.0.1，真实访客 IP 在头部），
 * 顺序：cf-connecting-ip → x-forwarded-for 首段 → x-real-ip
 * → Bun 原生连接信息 → 本地回退 127.0.0.1。
 * 纯自研解析，不调用任何第三方 IP 库
 */
export function iGM_GetClientIp(
  request: Request,
  server: iGM_NetworkServer | null,
): string {
  let ip =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    server?.requestIP(request)?.address ||
    "127.0.0.1";

  // 规范化显示：去除 IPv4-mapped IPv6 前缀，IPv6 回环统一为 IPv4 回环
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  if (ip === "::1") ip = "127.0.0.1";
  return ip;
}

// 导出 //
export default { iGM_RequireUser, iGM_RequireRole, iGM_RequireStaff, iGM_RequireStaffOrRole, iGM_IsStaff, iGM_GetClientIp };
