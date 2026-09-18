/**
 * 文件：apps/web/src/proxy.ts
 * 所属层：前端（边缘代理，Next.js 16 proxy 约定，替代已弃用的 middleware）
 * 路由：全站 G_Xxxxx 路由（排除静态资源与 API）
 * 模块：iGM_I18nProxy
 * 作用：next-intl 语言协商代理，处理语言前缀、Accept-Language 检测与 NEXT_LOCALE cookie 持久化
 * 内容：createMiddleware 实例与 matcher 配置
 */
// ==================== 区块：导入依赖 ====================
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/iGM_Routing';

// ==================== 区块：代理实例 ====================
// localeDetection 默认开启：读取 NEXT_LOCALE cookie，其次 Accept-Language；
// 用户通过语言切换器改变语言后，响应会回写 NEXT_LOCALE cookie 完成持久化
const iGM_I18nProxy = createIntlMiddleware(routing);

// ==================== 区块：导出 ====================
export default iGM_I18nProxy;

export const config = {
  // 匹配所有路由，排除：API、Next 内部资源、常见静态资源后缀；
  // 其余带后缀的未知路径（如 .html）仍进入语言协商，最终由全捕获路由渲染本地化 404
  matcher:
    '/((?!api|_next|_vercel|insights|.*\\.(?:txt|ico|png|jpg|jpeg|gif|webp|svg|avif|woff2?|ttf|otf|eot|css|js|mjs|json|xml|webmanifest|map|csv|pdf|zip)$).*)',
};
