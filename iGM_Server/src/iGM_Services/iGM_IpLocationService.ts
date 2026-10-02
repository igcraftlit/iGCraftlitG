/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_IpLocationService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Admin
 * 模块：iGM_IpLocationService
 * 作用：管理端用户 IP 定位（国家 / 地区 / 城市）的纯自研轻量解析
 * 内容：回环 / 内网地址识别；公网地址在无离线 IP 库时返回未知（不调用任何第三方库或外部接口）
 * 说明：项目约束禁止引入第三方 IP 库；本服务仅提供可确定的本地 / 内网分类，
 *       公网定位字段返回 null，由前端统一展示为「未知」，后续可在本服务内接入离线库扩展
 */

// 导入依赖 //
// （仅使用 Node 内置能力，无外部依赖）

// 类型定义 //
/** IP 定位结果：无法确定的层级为 null */
export interface iGM_IpLocation {
  country: string | null;
  region: string | null;
  city: string | null;
  /** 地址类别：loopback 回环 / private 内网 / public 公网 */
  kind: "loopback" | "private" | "public";
}

// 核心逻辑 //
/**
 * 判断 IPv4 是否落在私有 / 保留网段：
 * 10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、169.254.0.0/16、100.64.0.0/10
 */
function iGM_IsPrivateIPv4(part0: number, part1: number): boolean {
  if (part0 === 10) return true;
  if (part0 === 172 && part1 >= 16 && part1 <= 31) return true;
  if (part0 === 192 && part1 === 168) return true;
  if (part0 === 169 && part1 === 254) return true;
  if (part0 === 100 && part1 >= 64 && part1 <= 127) return true;
  return false;
}

/**
 * 解析 IP 的可确定归属地（纯自研，不请求任何外部服务）。
 * 回环与内网可直接判定；公网暂无离线库，归属地各层返回 null（前端显示未知）。
 */
export function iGM_LookupIpLocation(ip: string | null | undefined): iGM_IpLocation {
  const unknown: iGM_IpLocation = {
    country: null,
    region: null,
    city: null,
    kind: "public",
  };
  if (!ip) return unknown;
  const value = ip.trim().toLowerCase();
  if (!value) return unknown;

  // IPv6 回环 / 链路本地 / 唯一本地地址
  if (value === "::1") {
    return { country: null, region: null, city: null, kind: "loopback" };
  }
  if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) {
    return { country: null, region: null, city: null, kind: "private" };
  }

  // 去除 IPv4-mapped IPv6 前缀后按 IPv4 判定
  const v4 = value.startsWith("::ffff:") ? value.slice("::ffff:".length) : value;
  const parts = v4.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    const [p0, p1, p2, p3] = parts.map((part) => Number(part));
    if ([p0, p1, p2, p3].some((n) => n > 255)) return unknown;
    if (p0 === 127) {
      return { country: null, region: null, city: null, kind: "loopback" };
    }
    if (
      p0 === 0 ||
      iGM_IsPrivateIPv4(p0, p1) ||
      (p0 === 192 && p1 === 0 && p2 === 0) ||
      (p0 === 198 && (p1 === 18 || p1 === 19)) ||
      p0 >= 224
    ) {
      return { country: null, region: null, city: null, kind: "private" };
    }
  }

  return unknown;
}

// 导出 //
export default { iGM_LookupIpLocation };
