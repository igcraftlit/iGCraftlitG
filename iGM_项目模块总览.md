# iGM 项目模块总览

> 仓库：`D:/IGWEB`（GitHub：iGCraftLitG）
> 生成日期：2026-10-10
> 说明：本文按「项目 → 模块 → 归属文件」三级分门别类，作为全仓库的模块索引。
> 命名约定：组件 / 服务 / 模块 / 表用 `iGM_` 前缀，页面 / API 路由用 `G_` 前缀。

---

## 一、项目总览（7 个可交付项目）

| # | 项目 | 目录 | 技术栈 | 对外入口 | 部署方式 |
|---|------|------|--------|----------|----------|
| 1 | 主站前端 | `apps/web` | Next.js 16 + next-intl，纯静态 SSG | https://igcraftlit.com | Cloudflare Pages 项目 `iGCraftlitG`（CI：deploy-main-web.yml） |
| 2 | 后端 API | `iGM_Server` | Bun + Elysia 1.4，PostgreSQL | https://api.igcraftlit.com（cloudflared 隧道 → localhost:3001） | 本机 CMD 常驻 / 隧道自启 |
| 3 | CLI 开发者平台 | `apps/cli-download` | Next.js 16 纯静态 SSG | https://cli.igcraftlit.com | Cloudflare Pages 项目 `iGM-CLI-Download`（CI：deploy-cli-web.yml） |
| 4 | 启动器下载站 | `apps/launcher-download` | Next.js 16 纯静态 SSG | https://launcher.igcraftlit.com | Cloudflare Pages 项目 `iGM-Launcher-Download`（CI：deploy-launcher-download.yml） |
| 5 | iGM CLI 命令行工具 | `apps/iGM_CLI` | Node ≥18 单文件 CLI | npm 包 `igm-cli` v0.1.4（命令 `igm`） | npm publish |
| 6 | 桌面启动器 | `IGLAUNCHER/`（独立 monorepo，无独立 .git） | Electrobun + Bun + Zig + Next.js | Windows 安装包 v26.3.3 | GitHub Releases（CI：release-launcher.yml，推 `v*` tag 触发） |
| 7 | 基础设施 | `database` / `scripts` / `.github` | SQL 迁移 / Bun 脚本 / GitHub Actions | — | 随仓库 |

**根工作区**（`package.json`）：Bun workspaces = `apps/*` + `iGM_Server`。
命令：`bun run dev`（前后端并行）、`build`、`db:init`、`db:migrate`、`db:seed`。

---

## 二、主站前端模块（apps/web）

### 2.1 页面模块（`src/app/[locale]/G_*` → `src/iGM_Pages/`）

| 业务分区 | 页面路由 | 归属模块 |
|----------|----------|----------|
| 主页 / 通知 / 协议 | `G_Home`、`G_Notification`、`G_NotificationSettings`、`G_UserAgreement`、`G_UserRules`、`G_Api_Health` | 模块一 / 四 / 十五 |
| 认证 | `G_Auth/login`、`register`、`forgot-password`、`reset-password`、`verify-email` | 模块二 / 八 |
| 社区 | `G_Community`、`G_Post`、`G_PostEdit`、`G_Feed` | 模块三 / 十 |
| 资源 | `G_Resource`、`G_ResourceDetail`、`G_ResourceEdit`、`G_Resources`、`G_DownloadCenter` | 模块四 / 十 |
| Minecraft | `G_Minecraft`、`G_MinecraftUpload`、`G_MinecraftDetail`、`G_MinecraftVersions`、`G_MinecraftVersionDetail`、`G_GameInstall`、`G_GameInstalled`、`G_GameProgress` | 模块十 / 十七 / 十八 |
| 活动 | `G_Activity`、`G_ActivityDetail`、`G_ActivityEdit` | 模块四 / 社交生态优化 |
| 个人中心 | `G_User`、`G_UserPosts`、`G_UserComments`、`G_UserRelations`、`G_Settings`、`G_UserSettings`、`G_FileManager`、`G_Account_Recharge` | 模块三 / 十 / 十五 |
| 积分体系 | `G_Points`、`G_Checkin`、`G_Levels`、`G_Tasks`、`G_Badges`、`G_Leaderboard` | 模块五 / 十五 |
| 组织认证 | `G_OrgVerify`、`G_OrgVerifyStatus`、`G_OrgDetails`、`G_AdminOrgVerify` | 模块七 / 二十五 |
| 开发者 | `G_DeveloperIntro`、`G_DeveloperPortal`、`G_DeveloperReview`、`G_DeveloperStatus` | 模块十五 / 十六 / 开发者申请规范化 |
| OAuth | `G_OAuthAuthorize`、`G_AuthorizedApps` | 模块二十一 |
| 后台管理 | `G_AdminDashboard`、`G_AdminModeration`、`G_AdminUsers`、`G_AdminSystem`、`G_AdminDeveloper`、`G_Admin`、`G_AdminContents`、`G_AdminMails`、`G_AdminOAuth`、`G_AdminReports`、`G_AdminSettings` | 模块五 / 二十五 |
| 实时与统计 | `G_Realtime`、`G_Dashboard`、`G_StatsDetail` | 模块九 |
| 第三方资源 | `G_ThirdPartyDetail` | 模块二十 |

### 2.2 组件 / 服务 / 提供者模块

- **应用外壳 `iGM_AppShell`**：`iGM_Sidebar`（树状导航）、`iGM_TopBar`、`iGM_MobileTabBar`（模块二十二移动端适配）。
- **UI 组件 `src/iGM_Components/`**：`iGM_Avatar`、`iGM_PostCard`、`iGM_PostImageUploader`、`iGM_ImageUploader`、`iGM_CommentList`、`iGM_FriendButton`、`iGM_ReportDialog`、`iGM_StatsCharts`、`iGM_UserRules`、`iGM_Pagination`、`iGM_Popover`、`iGM_EmptyState`、`iGM_VerifiedBadge`、`iGM_SessionExpiredToast` 等。
- **导航真源 `iGM_Navigation/iGM_NavConfig.ts`**：主页 / 社区 / 个人 / 积分 / 管理 / 开发者 六个分区。
- **Provider `src/iGM_Providers/`**：`iGM_AuthProvider`、`iGM_WebSocketProvider`（模块九）、`iGM_ThemeProvider`、`iGM_LocaleProvider`。
- **服务层归口 `src/iGM_Services/`**：全部请求经 `iGM_Request` 统一封装，基址由 `iGM_Config.iGM_GetApiBase()` 运行时解析。

| 客户端模块 | 对应后端路由 |
|------------|--------------|
| `iGM_AuthClient` | G_Auth |
| `iGM_CommunityClient`、`iGM_PostClient` | G_Community / G_Post |
| `iGM_ActivityClient`、`iGM_ResourceClient` | G_Activity / G_Resource |
| `iGM_NotificationClient` | G_Notification |
| `iGM_FileClient` | G_File |
| `iGM_PointsClient` | G_Points |
| `iGM_AdminClient`、`iGM_SystemClient` | G_Admin |
| `iGM_OrgVerifyClient`、`iGM_AgreementClient` | G_OrgVerify |
| `iGM_SocialClient`、`iGM_MessageClient` | G_Social / G_Message |
| `iGM_MinecraftClient`、`iGM_GameClient` | G_Minecraft / G_Game |
| `iGM_ThirdPartyClient` | G_ThirdParty |
| `iGM_DeveloperClient` | G_Developer |
| `iGM_OAuthClient`、`iGM_OAuthTokenStore` | G_OAuth |
| `iGM_RealtimeClient`、`iGM_StatsClient` | G_Realtime / G_Stats |

---

## 三、后端模块（iGM_Server）

分层：`iGM_Routes`（G_*）→ `iGM_Services`（业务）→ `iGM_Repositories`（数据）→ `iGM_Migrations`（建表）。

### 3.1 路由模块（共 25 个，`src/iGM_Routes/`）

| 路由文件 | 模块归属 | 作用 |
|----------|----------|------|
| `G_Health` | 基础 | 健康检查 |
| `G_Api` | 模块八 | 公共客户端信息 / IP 检测 |
| `G_Auth` | 模块二 / 八 | 注册、登录、会话、验证码、密码重置 |
| `G_Community` | 模块三 | 用户主页、关注、个人中心聚合 |
| `G_Post` | 模块三 | 帖子与评论 |
| `G_Notification` | 模块四 | 站内通知 |
| `G_File` | 模块四 | 文件上传与媒体管理 |
| `G_Activity` | 模块四 | 活动发布与报名 |
| `G_Resource` | 模块四 / 十四 | 资源库与下载 |
| `G_Points` | 模块五 / 十五 | 积分、签到、等级、任务、勋章 |
| `G_Admin` | 模块五 / 二十五 | 管理后台 |
| `G_Seo` | 模块五 | 站点 SEO 数据 |
| `G_OrgVerify` | 模块七 | 组织认证 |
| `G_Realtime` | 模块九 | WebSocket 实时通信与在线状态 |
| `G_Stats` | 模块九 | 运营统计与数据看板 |
| `G_Social` | 模块十 | 关注 / 好友 / 黑名单 |
| `G_Message` | 模块十 | 私信会话 |
| `G_Minecraft` | 模块十 | Minecraft 资源分区 |
| `G_Developer` | 模块十五 / 十六 | 开发者申请与 SDK |
| `G_Game` | 模块十七 | 游戏本体下载与自动组装 |
| `G_ThirdParty` | 模块二十 | Modrinth 第三方资源与进度同步 |
| `G_OAuth` | 模块二十一 | OAuth 2.0 + OIDC 身份提供方 |
| `G_LauncherRelease` | 模块二十六 | 启动器发布历史（官网与启动器共用） |
| `G_AdminExaminer` | 考试系统 | 命题创作者申请审核（/api/admin/examiner-applications） |
| `iGM_RouteSupport` | 共享 | 模块三 / 四 路由处理工具 |

### 3.2 服务模块（`src/iGM_Services/`，按域归类）

- **认证与安全**：`iGM_AuthService`、`iGM_SecurityService`、`iGM_RateLimitService`、`iGM_MailService` + `iGM_MailTemplates`、`iGM_IpLocationService`。
- **内容与社区**：`iGM_ContentService`、`iGM_NotificationService`、`iGM_ActivityService`、`iGM_PointsService`、`iGM_ReportService`。
- **社交**：`iGM_SocialService`、`iGM_MessageService`。
- **资源与游戏**：`iGM_ResourceService`、`iGM_UnifiedResourceService`、`iGM_ResourceRelationService`、`iGM_ThirdPartyService`、`iGM_ThirdPartyDownloadService`、`iGM_ModrinthService`、`iGM_GameService`、`iGM_GameDownloadService`、`iGM_VersionFilesService`、`iGM_FabricService`。
- **文件与存储**：`iGM_FileService`、`iGM_FileSignatureService`、`iGM_StorageService`、`iGM_ZipService`、`iGM_FolderPickerService`。
- **组织与开发者**：`iGM_OrgVerifyService`、`iGM_DeveloperService`。
- **平台能力**：`iGM_RealtimeService`、`iGM_StatsService`、`iGM_AdminService`、`iGM_HealthService`、`iGM_LauncherReleaseService`。
- **OAuth**：`iGM_OAuthService`、`iGM_OAuthCrypto`。
- **额度**：`iGM_QuotaService`。

### 3.3 数据访问模块（`src/iGM_Repositories/`，29 个）

`iGM_UserRepository`、`iGM_SessionRepository`、`iGM_TokenRepository`、`iGM_PostRepository`、`iGM_PostImageRepository`、`iGM_CommentRepository`、`iGM_InteractionRepository`、`iGM_NotificationRepository`、`iGM_FileRepository`、`iGM_ActivityRepository`、`iGM_ResourceRepository`、`iGM_ResourceRelationRepository`、`iGM_TaxonomyRepository`、`iGM_PointsRepository`、`iGM_AdminRepository`、`iGM_ReportRepository`、`iGM_SocialRepository`、`iGM_MessageRepository`、`iGM_OrgVerifyRepository`、`iGM_DeveloperRepository`、`iGM_DeveloperStatsRepository`、`iGM_GameRepository`、`iGM_ThirdPartyRepository`、`iGM_LauncherReleaseRepository`、`iGM_OAuthRepository`、`iGM_OnlineUserRepository`、`iGM_StatsRepository`、`iGM_QuotaRepository`。

### 3.4 数据库迁移模块（`src/iGM_Migrations/`，34 个）

| 迁移文件 | 模块 |
|----------|------|
| iGM_001_Init | 模块一 初始化 |
| iGM_002_Auth | 模块二 用户认证与账户体系 |
| iGM_003_Community | 模块三 社区帖子评论 |
| iGM_004_Module4 | 模块四 通知 / 文件 / 活动 / 资源 |
| iGM_005_Module4ResourceActivity | 模块四 资源关联活动 |
| iGM_006_Module5 | 模块五 积分等级勋章签到任务 + 后台 |
| iGM_007_Module7 / 008_Module7b / 009_Module7c | 模块七 组织认证（三轮） |
| iGM_010_Module8 | 模块八 注册五框向导 |
| iGM_011_Module9 | 模块九 实时通信 + 统计数据 |
| iGM_012_Module10 / 013_Module10Fix | 模块十 社交私信 / 帖子配图 / MC 资源分区 |
| iGM_014_ResourceDownloadable | 资源可下载字段 |
| iGM_015_Module15 | 模块十五 UID 区分位 / 等级考核 / 周季任务 / 勋章稀有度 |
| iGM_016_Module16 | 模块十六 UID 顺序号 + 开发者申请独立入口 |
| iGM_017_Module17 | 模块十七 游戏本体一键下载 |
| iGM_018_Module18 | 模块十八 原版 + Fabric + 版本资料库 + 多版本隔离 |
| iGM_019_Module20 / 020_Module20Patch | 模块二十 Fabric 资源下载（Modrinth） |
| iGM_021_Module21 | 模块二十一 OAuth 2.0 + OIDC |
| iGM_022_UserPreferences | 个性化设置（主题 / 密度 / 字号 / 侧栏 / 首页模块） |
| iGM_023_Module22 / 024_Module22KeyCleanup | 模块二十二 本地测试回调 / 应用软删除 / 取消开发者密钥 |
| iGM_025_Module25 | 模块二十五 OAuth 合规字段 + 注册登录 IP + 调用量统计 |
| iGM_026_Module26 | 模块二十六 启动器发布历史 + 资源关系图 |
| iGM_027_ReportReasonDetail | 社交生态优化 举报体系 |
| iGM_028~031 | 已废弃（相关功能与数据表已移除） |
| iGM_032_DropLegacy / 033_DualCurrency | UQ/Coin 双币种账户体系 |
| iGM_034_DeveloperIntro | 开发者申请规范化 |

---

## 四、启动器项目模块（IGLAUNCHER，v26.3.3）

工作区：`apps/*` + `packages/*`。

| 子项目 | 目录 | 技术栈 | 职责 |
|--------|------|--------|------|
| 外壳 | `apps/shell` | Electrobun + Bun | 主进程、窗口、IPC、桥接（`iGM_Launcher_Bridge`、`iGM_Launcher_Ipc`、`iGM_Launcher_Main`） |
| 界面 | `apps/launcher-ui` | Next.js 静态导出 | 首页、设置、外观、资源中心、下载进度窗口（`G_DownloadProgress`） |
| 安装程序 | `apps/installer` | Electrobun | 安装 / 快捷方式 / 载荷同步 |
| 核心引擎 | `zig-core` | Zig（bun:ffi 调用） | `iGM_Downloader`、`iGM_FileManager`、`iGM_Hasher`、`iGM_JavaManager`、`iGM_Launcher_Core` |
| 共享包 | `packages/shared` | TypeScript | 跨端子项目共享类型与常量 |

**功能子模块（`apps/shell/src/`）**

| 文件 | 功能 |
|------|------|
| `iGM_Launcher_SDK` / `iGM_Launcher_CoreBindings` | SDK 封装与 Zig 动态库 FFI 绑定 |
| `iGM_Launcher_Download` / `iGM_Launcher_DownloadProgressWindow` | 多线程分片下载与独立进度窗口 |
| `iGM_Launcher_GameDir` | 游戏目录定位与实例隔离（共享 .minecraft + 实例 gameDir） |
| `iGM_Launcher_Java` | Java 运行时管理 |
| `iGM_Launcher_Launch` | 实例启动 |
| `iGM_Launcher_MsaAuth` / `iGM_Launcher_TokenVault` | 正版微软账号登录与令牌保管 |
| `iGM_Launcher_BindingStore` / `iGM_Launcher_Usage` | 绑定存储与累计使用时长 |

**打包链**：`build:zig → build:ui → sync:ui → shell build → portable → sync:installer → installer build`。

---

## 五、开发者生态与开放能力

| 能力 | 归属项目 | 入口 |
|------|----------|------|
| 开发者申请 / 审核 / 公示 | 主站 + CLI 站 | `G_DeveloperIntro` / `G_DeveloperReview` / cli 站 `/oauth/publicity` |
| OAuth 2.0 + OIDC 身份提供方 | 后端 G_OAuth + CLI 站 | cli 站 `/oauth/apply`、`/oauth/apps`、`/oauth/docs` |
| SDK / Adapter 接入文档 | CLI 站 | `/sdk`、`/docs/cli/*`、`/docs/adapter/*` |
| CLI 命令与 API 文档 | CLI 站 | `/commands`、`/api`、`/docs/cli/*` |
| iGM CLI 命令行工具 | `apps/iGM_CLI`（npm `igm-cli`） | 命令 `igm` |

---

## 六、下载站项目模块

### 6.1 启动器下载站（apps/launcher-download → launcher.igcraftlit.com）

页面：`/`（首页）、`/download`、`/releases`（历史版本）、`/changelog`、`/about`、`/docs`（`install` / `faq`）。
数据来源：后端 `G_LauncherRelease`（表 `iGM_LauncherReleases`），最新版置顶 + 历史版本倒序。

### 6.2 CLI / SDK 文档站（apps/cli-download → cli.igcraftlit.com）

分区：`/docs`（CLI 文档）、`/docs/adapter`（适配器协议）、`/sdk`、`/api`、`/commands`、`/oauth/*`（接入 / 我的应用 / 文档 / 公示）。

---

## 七、基础设施与自动化

| 类别 | 内容 |
|------|------|
| 数据库 | PostgreSQL（连接 `postgresql://iguser:igpassword@localhost:5432/igcraftlit`），容器名 `ig-postgres`；迁移由后端启动自动执行 |
| 上传目录 | `D:/IGWEB/uploads/<userId>/<yyyyMM>/` |
| 邮件 | 163 SMTP（smtp.163.com:465），服务 `iGM_MailService` |
| 隧道 | cloudflared 命名隧道 `igcraftlit-api` → localhost:3001 |
| CI - 主站 | `.github/workflows/deploy-main-web.yml` → Pages `iGCraftlitG` |
| CI - CLI 站 | `.github/workflows/deploy-cli-web.yml` → Pages `iGM-CLI-Download` |
| CI - 启动器下载站 | `.github/workflows/deploy-launcher-download.yml` → Pages `iGM-Launcher-Download` |
| CI - 启动器发布 | `.github/workflows/release-launcher.yml` → GitHub Releases（推 `v*` tag） |
| 运维脚本 | `scripts/iGM_AutoDeploy.ts`、`iGM_DbMigrate.ts`、`iGM_ExportLauncherReleases.ts`、`iGM_MinecraftVersionSync.ts`、`iGM_MinecraftVersionSyncAll.ts` |
| 启动脚本 | `start.bat`、`iGM_Start.ps1`、`RUN.txt` |
| 文档 | `iGM_Startup.md`（启动指南）、`iGM_StartCodeSummary.md`（启动链路代码总结）、`docs/iGM_UserAgreement.md` |

---

## 八、命名与分层速查

| 类型 | 前缀 | 示例 |
|------|------|------|
| 组件 / 服务 / 模块 / 表 | `iGM_` | `iGM_NotificationService`、`iGM_Users` |
| 页面 / API 路由 | `G_` | `G_Home`、`G_Auth`、`G_Community` |
| 语言支持 | — | 主站 zh-CN/zh-TW/en/ja/ru；启动器与下载站 zh-CN/zh-TW/en/ja/ru |

**前端分层**：`app/[locale]/G_*/page.tsx`（路由薄壳）→ `iGM_Pages/`（页面）→ `iGM_Components/`（组件）→ `iGM_Services/`（请求）→ `iGM_Request`。
**后端分层**：`G_*.ts`（路由）→ `iGM_*Service`（业务）→ `iGM_*Repository`（数据）→ `iGM_Migrations`（建表）。