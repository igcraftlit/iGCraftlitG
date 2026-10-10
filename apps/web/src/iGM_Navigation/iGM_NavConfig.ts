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
  ClipboardList,
  Code2,
  FolderOpen,
  HardDriveDownload,
  GraduationCap,
  Home,
  LayoutDashboard,
  Library,
  ListChecks,
  MessageSquareText,
  Newspaper,
  NotebookPen,
  PenSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
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
  /**
   * 模块二十五：仅管理人员（管理员或受信任组织负责人）可见。
   * 与 roles 同时配置时满足其一即显示（供整合面板对协管员与负责人同时可见）；
   * 仅为体验层控制，后端按 iGM_RequireStaff / iGM_RequireStaffOrRole 强制。
   */
  staffOnly?: boolean;
  /**
   * 模块二十五：已加入组织（verifiedOrg 非空，含负责人与成员）的用户隐藏。
   * 用于移除「组织认证申请记录」入口——已认证用户只保留当前组织与认证状态。
   */
  hideForOrgMember?: boolean;
  /** 外链入口：新标签页打开，不参与站内高亮与语言前缀拼装 */
  external?: boolean;
  /**
   * 模块十六：开发者入口。目标页随身份与申请状态变化——
   * 组织所有者与已通过者进入开发者接入界面（外链），待审核者进入
   * /G_DeveloperStatus，其余进入 /G_DeveloperIntro
   * （与账户设置页「成为开发者」按钮行为一致）。
   */
  developerEntry?: boolean;
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
        // 模块十六：开发者入口不再位于主区块，改置于导航栏最下边独立分区
        // （见文件末尾 groupDeveloper），此处仅保留用户管理规定
        href: "/G_UserAgreement",
        icon: ScrollText,
        labelKey: "nav.userAgreement",
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
            // 社交生态优化：活动发布权收回，仅协管员/管理员可见入口；
            // 普通用户仅可浏览与报名，后端 iGM_CreateActivityService 同步强制 403
            href: "/G_ActivityEdit",
            icon: CalendarPlus,
            labelKey: "nav.createActivity",
            roles: ["moderator", "admin"],
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
              {
                // 模块十八：原版游戏与版本资料库（按年份分组，含加载器选择下载入口）
                href: "/G_MinecraftVersions",
                icon: Blocks,
                labelKey: "nav.minecraftVersions",
              },
              {
                // 模块十七：已安装版本管理（校验/修复/删除）
                href: "/G_GameInstalled",
                icon: HardDriveDownload,
                labelKey: "nav.gameInstalled",
                roles: ["user", "moderator", "admin"],
              },
            ],
          },
          // 社交生态优化：下载中心迁移至顶部栏右侧（iGM_TopBar），侧边栏不再列入口
        ],
      },
      {
        // 教育考试系统：跳转独立子站点 exam.igcraftlit.com（外链，新标签页打开）
        href: "https://exam.igcraftlit.com",
        icon: GraduationCap,
        labelKey: "nav.exam",
        external: true,
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
          {
            // 模块二十一：用户侧已授权第三方应用（查看与撤销）
            href: "/G_AuthorizedApps",
            icon: ShieldCheck,
            labelKey: "nav.authorizedApps",
            roles: ["user", "moderator", "admin"],
          },
        ],
      },
      {
        href: "/G_FileManager",
        icon: FolderOpen,
        labelKey: "nav.myFiles",
      },
      // 社交生态优化：好友与私信合并入社区广场（G_Community 子标签），
      // 不再占用侧边一级菜单；黑名单/关注等关系管理（G_UserRelations）
      // 入口改挂用户资料页
      // 模块七：组织认证（申请 + 我的申请记录）
      {
        href: "/G_OrgVerify",
        icon: BadgeCheck,
        labelKey: "nav.orgVerify",
        children: [
          {
            // 模块二十五：已加入组织的用户不再显示「我的申请记录」，
            // 只保留当前所属组织与认证状态（页面内同步隐藏该栏）
            href: "/G_OrgVerifyStatus",
            icon: ClipboardList,
            labelKey: "nav.orgVerifyStatus",
            hideForOrgMember: true,
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
      {
        // 模块十六：开发者申请审核入口（组织负责人）。
        // 负责人账号角色为普通用户，管理分组不可见，故在个人区提供入口；
        // 后端按 owner 邮箱鉴权，管理员另有管理区入口。
        href: "/G_DeveloperReview",
        icon: Code2,
        labelKey: "nav.developerReview",
        orgOwnerOnly: true,
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
          // 模块十五：等级展示与考核
          { href: "/G_Levels", icon: GraduationCap, labelKey: "nav.levels" },
          // 模块十五：任务中心（每周 / 每季）
          { href: "/G_Tasks", icon: ListChecks, labelKey: "nav.tasks" },
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
        // 模块二十五：管理后台入口对协管员、管理员与受信任组织负责人可见
        href: "/G_AdminDashboard",
        icon: ShieldCheck,
        labelKey: "nav.admin",
        // 角色与管理人员身份满足其一即可（页面另有 RequireAuth 与后端强制校验）
        roles: ["moderator", "admin"],
        staffOnly: true,
        children: [
          {
            // 模块二十五：综合面板（实时状态 + 运营看板 + 数据详情）
            href: "/G_AdminDashboard",
            icon: LayoutDashboard,
            labelKey: "nav.adminPanel",
            roles: ["moderator", "admin"],
            staffOnly: true,
          },
          {
            // 模块二十五：审核面板（内容审核 + 举报处理 + 认证审核）
            href: "/G_AdminModeration",
            icon: ShieldCheck,
            labelKey: "nav.adminModeration",
            roles: ["moderator", "admin"],
            staffOnly: true,
          },
          {
            href: "/G_AdminUsers",
            icon: Users,
            labelKey: "nav.adminUsers",
            roles: ["moderator", "admin"],
            staffOnly: true,
          },
          {
            // 模块二十五：系统面板（系统信息 + 邮件测试）
            href: "/G_AdminSystem",
            icon: Settings,
            labelKey: "nav.adminSystem",
            staffOnly: true,
          },
          {
            // 模块二十五：开发者分区（申请审核 + 应用审核 + 账号 + 调用量）
            href: "/G_AdminDeveloper",
            icon: Code2,
            labelKey: "nav.adminDeveloper",
            staffOnly: true,
          },
        ],
      },
    ],
  },
  {
    // 模块十六：开发者入口——置于导航栏最下边；登录用户可见，
    // 目标由 iGM_Sidebar 解析：组织所有者与已通过者进接入界面（外链），
    // 待审核进状态页，其余进申请页
    // 模块二十一：OAuth 应用接入（申请 / 我的应用 / 接入文档）已迁至开发者平台
    //（CLI 站 cli.igcraftlit.com 的「OAuth 接入」分区），主站不再单独列出
    titleKey: "nav.developer",
    items: [
      {
        href: "/G_DeveloperIntro",
        icon: Code2,
        labelKey: "nav.becomeDeveloper",
        roles: ["user", "moderator", "admin"],
        developerEntry: true,
      },
    ],
  },
];

// 导出 //
export default iGM_NavGroups;
