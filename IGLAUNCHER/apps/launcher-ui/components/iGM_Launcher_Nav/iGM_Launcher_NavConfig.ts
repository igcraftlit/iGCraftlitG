/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Nav/iGM_Launcher_NavConfig.ts
 * 所属层：前端 / 导航配置层
 * 路由：全局（侧边栏）
 * 模块：iGM_Launcher_NavConfig
 * 作用：定义 AppShell 侧边栏的分组与导航项（图标、目标页面、占位标记）
 * 内容：主页区块（首页）、游戏区块（实例、Java、下载、资源库）、
 *       账户区块（账户）、设置区块（设置、关于）；
 *       模块七移除「启动」动作项与「组织认证」占位项，启动入口统一收敛到实例管理页；
 *       正版验证只保留账户页内的正式入口，不再单独占用导航项；
 *       界面为 SPA 单页，导航项只声明目标页面 id，不涉及任何 URL，
 *       理由：Electrobun 打包后以 views:// 自定义协议读取静态产物，
 *       该协议只按精确文件路径读取、不解析目录路由
 */

// 导入依赖 //
import {
  Boxes,
  Coffee,
  Download,
  Home,
  Info,
  Library,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { iGM_Launcher_NavId } from "@igm-launcher/shared";
import type { iGM_Launcher_PageId } from "@/components/iGM_Launcher_Pages/iGM_Launcher_PageRegistry";

// 类型定义 //
export interface iGM_Launcher_NavItem {
  /** 导航项唯一标识 */
  id: iGM_Launcher_NavId;
  /** next-intl nav 命名空间下的文案键，如 home -> nav.home */
  labelKey: string;
  /** lucide 图标 */
  icon: LucideIcon;
  /** 点击后切换到的 SPA 页面（模块七起全部导航项均为页面切换） */
  pageId?: iGM_Launcher_PageId;
}

export interface iGM_Launcher_NavGroup {
  /** next-intl nav 命名空间下的分组标题键 */
  labelKey: string;
  items: iGM_Launcher_NavItem[];
}

// 核心逻辑 //
export const IGM_LAUNCHER_NAV_GROUPS: readonly iGM_Launcher_NavGroup[] = [
  {
    labelKey: "groupMain",
    items: [{ id: "home", labelKey: "home", icon: Home, pageId: "home" }],
  },
  {
    labelKey: "groupGame",
    items: [
      { id: "instances", labelKey: "instances", icon: Boxes, pageId: "instances" },
      { id: "java", labelKey: "java", icon: Coffee, pageId: "java" },
      { id: "downloads", labelKey: "downloads", icon: Download, pageId: "downloads" },
      // 模块五：资源库入口落地为版本库页（与网站版本资料库同步展示）
      { id: "library", labelKey: "library", icon: Library, pageId: "versions" },
    ],
  },
  {
    labelKey: "groupAccount",
    items: [{ id: "account", labelKey: "account", icon: UserRound, pageId: "account" }],
  },
  {
    labelKey: "groupSystem",
    items: [
      { id: "settings", labelKey: "settings", icon: Settings, pageId: "settings" },
      { id: "about", labelKey: "about", icon: Info, pageId: "about" },
    ],
  },
] as const;

// 导出 //
export default IGM_LAUNCHER_NAV_GROUPS;
