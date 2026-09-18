/**
 * 文件路径：apps/web/src/iGM_Navigation/iGM_NavConfig.ts
 * 所属层：前端 / 导航配置层
 * 路由：全局
 * 模块：iGM_Navigation
 * 作用：侧边导航栏的唯一配置真源，按服务类型分区块，区块内支持树状层级
 * 内容：主页 / 社区 / 个人 / 管理四个区块的路由、图标、文案键与父子层级
 */

// 导入依赖 //
import {
  Bell,
  CalendarDays,
  Home,
  Library,
  MessageSquareText,
  NotebookPen,
  PenSquare,
  Settings,
  Shield,
  SlidersHorizontal,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { iGM_UserRole } from "../iGM_Services/iGM_AuthClient";

// 类型定义 //
export interface iGM_NavItem {
  /** 路由地址，统一 G_Xxxxx 命名 */
  href: `/${string}`;
  /** lucide-react 简约图标 */
  icon: LucideIcon;
  /** 语言包文案键 */
  labelKey: string;
  /** 允许看到该入口的角色；不填表示所有访客可见（仅体验层控制） */
  roles?: readonly iGM_UserRole[];
  /** 子导航项：存在时该节点为树状父节点，可展开折叠；父节点本身仍可点击跳转 */
  children?: iGM_NavItem[];
}

export interface iGM_NavGroup {
  /** 分区标题语言包键，小号次要文本样式 */
  titleKey: string;
  items: iGM_NavItem[];
}

// 核心逻辑 //
/** 侧边导航分区块配置 */
export const iGM_NavGroups: iGM_NavGroup[] = [
  {
    titleKey: "nav.groupMain",
    items: [
      { href: "/G_Home", icon: Home, labelKey: "nav.home" },
      { href: "/G_Notification", icon: Bell, labelKey: "nav.notifications" },
    ],
  },
  {
    titleKey: "nav.groupCommunity",
    items: [
      {
        href: "/G_Community",
        icon: Users,
        labelKey: "nav.community",
        children: [
          { href: "/G_PostEdit", icon: PenSquare, labelKey: "nav.createPost" },
        ],
      },
      { href: "/G_Activity", icon: CalendarDays, labelKey: "nav.activities" },
      { href: "/G_Resources", icon: Library, labelKey: "nav.resources" },
    ],
  },
  {
    titleKey: "nav.groupPersonal",
    items: [
      {
        href: "/G_User",
        icon: UserRound,
        labelKey: "nav.profile",
        children: [
          {
            href: "/G_UserPosts",
            icon: NotebookPen,
            labelKey: "nav.myPosts",
          },
          {
            href: "/G_UserComments",
            icon: MessageSquareText,
            labelKey: "nav.myComments",
          },
        ],
      },
      {
        href: "/G_Settings",
        icon: Settings,
        labelKey: "nav.settings",
        children: [
          {
            href: "/G_UserSettings",
            icon: SlidersHorizontal,
            labelKey: "nav.userSettings",
          },
        ],
      },
    ],
  },
  {
    titleKey: "nav.groupAdmin",
    items: [
      {
        href: "/G_Admin",
        icon: Shield,
        labelKey: "nav.admin",
        // 管理入口仅管理员可见，页面本身另有 RequireAuth 与后端权限校验
        roles: ["admin"],
      },
    ],
  },
];

// 导出 //
export default iGM_NavGroups;
