/**
 * 文件路径：apps/web/src/iGM_Navigation/iGM_NavConfig.ts
 * 所属层：前端 / 导航配置层
 * 路由：全局
 * 模块：iGM_Navigation
 * 作用：侧边导航栏的唯一配置真源，按服务类型分区块，区块内支持树状层级
 * 内容：主页 / 社区 / 个人 / 积分 / 管理五个区块的路由、图标、文案键与父子层级
 */

// 导入依赖 //
import {
  Award,
  BadgeCheck,
  Bell,
  BellRing,
  Blocks,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  ChartLine,
  ClipboardList,
  FileText,
  Flag,
  FolderOpen,
  Home,
  Library,
  Mail,
  MessageSquare,
  MessageSquareText,
  MessagesSquare,
  Newspaper,
  NotebookPen,
  PenSquare,
  Radio,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trophy,
  Upload,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { iGM_UserRole } from "../iGM_Services/iGM_AuthClient";

// 类型定义 //
export interface iGM_NavItem {
  /** 路由地址，统一 G_Xxxxx 命名；external 为 true 时为完整外链 */
  href: `/${string}` | `https://${string}`;
  /** lucide-react 简约图标 */
  icon: LucideIcon;
  /** 语言包文案键 */
  labelKey: string;
  /** 允许看到该入口的角色；不填表示所有访客可见（仅体验层控制） */
  roles?: readonly iGM_UserRole[];
  /**
   * 模块七第三轮：仅组织负责人（verifiedOrg.isOwner）可见。
   * 与 roles 同时满足时才显示；后端仍按组织 owner 邮箱独立鉴权。
   */
  orgOwnerOnly?: boolean;
  /** 外链入口：新标签页打开，不参与站内高亮与语言前缀拼装 */
  external?: boolean;
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
      {
        // 模块九：实时在线状态（登录用户可见，页面另有 RequireAuth 校验）
        href: "/G_Realtime",
        icon: Radio,
        labelKey: "nav.realtime",
        roles: ["user", "moderator", "admin"],
      },
      {
        // iGM CLI Download API 开发者门户：独立站点（cli.igcraftlit.com），外链新标签页打开
        href: "https://cli.igcraftlit.com",
        icon: Terminal,
        labelKey: "nav.becomeDeveloper",
        external: true,
      },
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
      {
        href: "/G_Activity",
        icon: CalendarDays,
        labelKey: "nav.activities",
        children: [
          {
            href: "/G_ActivityEdit",
            icon: CalendarPlus,
            labelKey: "nav.createActivity",
          },
        ],
      },
      {
        href: "/G_Resource",
        icon: Library,
        labelKey: "nav.resources",
        children: [
          {
            href: "/G_ResourceEdit",
            icon: Upload,
            labelKey: "nav.uploadResource",
          },
          {
            // 模块十：Minecraft 资源分区，归入资源库，避免顶级重复
            href: "/G_Minecraft",
            icon: Blocks,
            labelKey: "nav.minecraft",
            children: [
              {
                href: "/G_MinecraftUpload",
                icon: Upload,
                labelKey: "nav.minecraftUpload",
              },
            ],
          },
        ],
      },
      {
        // 模块十：动态流（登录用户）
        href: "/G_Feed",
        icon: Newspaper,
        labelKey: "nav.feed",
        roles: ["user", "moderator", "admin"],
      },
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
          {
            href: "/G_NotificationSettings",
            icon: BellRing,
            labelKey: "nav.notificationSettings",
          },
        ],
      },
      {
        href: "/G_FileManager",
        icon: FolderOpen,
        labelKey: "nav.myFiles",
      },
      {
        // 模块十：好友管理（登录用户）
        href: "/G_Friends",
        icon: Users,
        labelKey: "nav.friends",
        roles: ["user", "moderator", "admin"],
        children: [
          {
            href: "/G_UserRelations",
            icon: MessageSquare,
            labelKey: "nav.userRelations",
          },
        ],
      },
      {
        // 模块十：私信（登录用户）
        href: "/G_Messages",
        icon: MessagesSquare,
        labelKey: "nav.messages",
        roles: ["user", "moderator", "admin"],
        children: [
          {
            href: "/G_MessageSettings",
            icon: BellRing,
            labelKey: "nav.messageSettings",
          },
        ],
      },
      // 模块七：组织认证（申请 + 我的申请记录）
      {
        href: "/G_OrgVerify",
        icon: BadgeCheck,
        labelKey: "nav.orgVerify",
        children: [
          {
            href: "/G_OrgVerifyStatus",
            icon: ClipboardList,
            labelKey: "nav.orgVerifyStatus",
          },
          {
            // 模块七第三轮：组织负责人的本组织认证审核入口。
            // 负责人账号角色为普通用户，管理分组不可见，故在个人区提供入口；
            // 后端按组织 owner 邮箱鉴权，仅能审核所属组织。
            href: "/G_AdminOrgVerify",
            icon: ShieldCheck,
            labelKey: "nav.adminOrgVerify",
            orgOwnerOnly: true,
          },
        ],
      },
    ],
  },
  {
    titleKey: "nav.groupPoints",
    items: [
      {
        href: "/G_Points",
        icon: Sparkles,
        labelKey: "nav.points",
        children: [
          { href: "/G_Checkin", icon: CalendarCheck, labelKey: "nav.checkin" },
          { href: "/G_Badges", icon: Award, labelKey: "nav.badges" },
          { href: "/G_Leaderboard", icon: Trophy, labelKey: "nav.leaderboard" },
        ],
      },
    ],
  },
  {
    titleKey: "nav.groupAdmin",
    items: [
      {
        href: "/G_AdminDashboard",
        icon: Shield,
        labelKey: "nav.admin",
        // 管理入口 moderator 及以上可见，页面另有 RequireAuth 与后端权限校验
        roles: ["moderator", "admin"],
        children: [
          {
            href: "/G_AdminUsers",
            icon: Users,
            labelKey: "nav.adminUsers",
          },
          {
            // 模块九：运营看板（moderator 及以上，继承父节点角色）
            href: "/G_Dashboard",
            icon: ChartColumn,
            labelKey: "nav.dashboard",
          },
          {
            // 模块九：数据详情（moderator 及以上，继承父节点角色）
            href: "/G_StatsDetail",
            icon: ChartLine,
            labelKey: "nav.statsDetail",
          },
          {
            href: "/G_AdminContents",
            icon: FileText,
            labelKey: "nav.adminContents",
          },
          {
            href: "/G_AdminReports",
            icon: Flag,
            labelKey: "nav.adminReports",
          },
          {
            // 模块七：组织认证审核（全局视图仅 admin；
            // 组织负责人入口在个人区 G_OrgVerify 下，按 isOwner 显示）
            href: "/G_AdminOrgVerify",
            icon: BadgeCheck,
            labelKey: "nav.adminOrgVerify",
            roles: ["admin"],
          },
          {
            // 以下两项仅 admin（后端接口同样限 admin）
            href: "/G_AdminSettings",
            icon: Settings,
            labelKey: "nav.adminSettings",
            roles: ["admin"],
          },
          {
            href: "/G_AdminMails",
            icon: Mail,
            labelKey: "nav.adminMails",
            roles: ["admin"],
          },
        ],
      },
    ],
  },
];

// 导出 //
export default iGM_NavGroups;
