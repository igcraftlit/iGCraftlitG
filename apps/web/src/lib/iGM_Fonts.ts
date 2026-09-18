/**
 * 文件：apps/web/src/lib/iGM_Fonts.ts
 * 所属层：前端（基础服务层）
 * 路由：全局
 * 模块：iGM_Fonts
 * 作用：通过 next/font/local 加载并优化艺术字体 Cinzel，输出 CSS 变量 --font-iGM-cinzel
 * 内容：iGM_Cinzel 字体定义（本地可变字体，规避构建期 Google Fonts 网络依赖）
 */
// ==================== 区块：导入依赖 ====================
import localFont from 'next/font/local';

// ==================== 区块：字体定义 ====================
// Cinzel 可变字体（字重 400-900），用于网站名称展示：顶部栏、首页、页脚
export const iGM_Cinzel = localFont({
  src: '../assets/fonts/Cinzel-Variable.ttf',
  variable: '--font-iGM-cinzel',
  weight: '400 900',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

// ==================== 区块：导出 ====================
export default iGM_Cinzel;
