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
import { iGM_AuthError } from "../iGM_Services/iGM_AuthService";
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
 * 解析客户端 IP：优先 Elysia/Bun 原生连接信息，
 * 其次反向代理 x-forwarded-for，本地直连回退 127.0.0.1
 */
export function iGM_GetClientIp(
  request: Request,
  server: iGM_NetworkServer | null,
): string {
  const direct = server?.requestIP(request)?.address;
  if (direct) return direct;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return "127.0.0.1";
}

// 导出 //
export default { iGM_RequireUser, iGM_RequireRole, iGM_GetClientIp };
