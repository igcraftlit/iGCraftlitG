/**
 * 文件路径：apps/launcher-ui/app/iGM_LauncherV2_Fonts.ts
 * 所属层：前端 / 根布局资源层
 * 路由：全局
 * 模块：iGM_LauncherV2_Fonts
 * 作用：统一声明启动器内使用的本地字体，避免构建期与运行期依赖外网字体服务
 * 内容：加载器名称艺术字体 Audiowide、首页欢迎词中文艺术字体 Ma Shan Zheng、
 *       首页用户名英文签名体 Caveat，三者均为本地 woff2，经 next/font/local 自托管，
 *       分别以 CSS 变量 --igm-font-loader / --igm-font-greet-zh / --igm-font-greet-en 注入
 * 说明：字体文件随构建产物一并输出，启动器启动时不需要联网拉取字体；
 *       中文艺术字体仅收录首页欢迎词实际用到的字形，避免为少量文字引入整套中文字库
 */

// 导入依赖 //
import localFont from "next/font/local";

// 核心逻辑 //

/** 加载器名称艺术字体：用于 Fabric / Forge / NeoForge 三项展示 */
export const iGM_LauncherV2_LoaderFont = localFont({
  src: "./fonts/iGM_Audiowide-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--igm-font-loader",
  preload: true,
});

/** 首页欢迎词中文艺术字体：仅含「欢迎回来使用，游客」所需字形 */
export const iGM_LauncherV2_GreetZhFont = localFont({
  src: "./fonts/iGM_MaShanZheng-Text.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--igm-font-greet-zh",
  preload: false,
});

/** 首页用户名英文签名体：手写签名质感 */
export const iGM_LauncherV2_GreetEnFont = localFont({
  src: "./fonts/iGM_Caveat-Signature.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--igm-font-greet-en",
  preload: false,
});

// 导出 //
/* 三个字体导出均已在上方声明 */
