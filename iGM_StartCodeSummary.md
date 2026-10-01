# iGCraftLit Community · 前后端本地启动代码总结

> 本文档将前后端本地启动所涉及的全部核心代码（package.json 脚本、后端监听、前端 API 基址、数据库初始化）整理在一份文件中。
> 目的：你读完这一份就能理解启动链路的**代码层面**。不是快捷启动脚本（.bat/.cmd/.ps1），是真实的 TS/JSON 源码片段。
>
> 生成日期：2026-09-30

---

## 一、端口 & 域名 & 技术栈总览

| 层 | 技术栈 | 本地地址 | 说明 |
|---|---|---|---|
| 根工作区 | Bun workspaces | — | `apps/*` + `iGM_Server` 两个子工作区 |
| 后端 | Bun 1.x + Elysia 1.4 | http://localhost:3001 | 本地默认端口；被 Cloudflare 隧道映射为 https://api.igcraftlit.com |
| 前端主站 | Next.js 16.3.5 + next-intl 4.x | http://localhost:3000 | SSG 纯静态（output: "export"），dev 模式运行时；生产构建产物是 `apps/web/out`，部署到 Cloudflare Pages |
| 启动器（独立项目） | Electrobun + Bun + Next.js | http://localhost:3210 | 位于 `D:/IGWEB/IGLAUNCHER`，不在本文档范围；dev 脚本在 `IGLAUNCHER/package.json` |
| SQLite | bun:sqlite | `D:/IGWEB/database/igcraftlit.sqlite` | 后端启动时自动迁移 |
| SMTP | nodemailer + 163 邮箱 | smtp.163.com:465 | 认证码从环境变量读取 |
| CORS 白名单 | — | `https://igcraftlit.com`、`https://www.igcraftlit.com`、`http://localhost:3000` | 仅这三个域名能调后端；启动器调试端口 3210 **不在**白名单里，浏览器直连主站被拦截 |

---

## 二、根工作区：package.json（D:/IGWEB/package.json）

根工作区定义了 5 条顶层脚本，**本地联调用 `bun run dev` 一条命令同时拉起前后端**（依赖 concurrently 9.x）。

```json
{
  "name": "igcraftlit-community",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["apps/*", "iGM_Server"],
  "scripts": {
    "dev": "concurrently -n web,server -c blue,magenta \"bun run dev:web\" \"bun run dev:server\"",
    "dev:web": "bun run --cwd apps/web dev",
    "dev:server": "bun run --cwd iGM_Server dev",
    "build": "bun run --cwd apps/web build",
    "db:init": "bun run --cwd iGM_Server db:init",
    "db:migrate": "bun run --cwd iGM_Server db:migrate",
    "db:seed": "bun run --cwd iGM_Server db:seed"
  },
  "devDependencies": {
    "concurrently": "9.1.2",
    "typescript": "5.9.2"
  }
}
```

### 启动命令速查表

| 命令 | 作用 | 来源文件 |
|---|---|---|
| `bun run dev` | 同时拉起前端（3000）+ 后端（3001） | D:/IGWEB/package.json |
| `bun run dev:server` | 只拉后端，watch 模式 | D:/IGWEB/package.json |
| `bun run dev:web` | 只拉前端，next dev | D:/IGWEB/package.json |
| `bun run db:init` | 创建数据库 + 全量跑迁移 | D:/IGWEB/package.json |
| `bun run db:migrate` | 仅跑未执行的迁移 | D:/IGWEB/package.json |
| `bun run db:seed` | 种子数据（管理员账号等） | D:/IGWEB/package.json |
| `bun run build` | SSG 纯静态构建 | D:/IGWEB/package.json |
| `bun run --cwd iGM_Server start` | 后端直接 start（不带 watch） | iGM_Server/package.json |
| `bun run --cwd apps/web start` | 前端 next start（需先 build） | apps/web/package.json |

---

## 三、后端（iGM_Server）

### 3.1 package.json（D:/IGWEB/iGM_Server/package.json）

```json
{
  "name": "igcraftlit-server",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/iGM_ServerMain.ts",
    "start": "bun run src/iGM_ServerMain.ts",
    "db:init": "bun run src/iGM_Database/iGM_DbCli.ts init",
    "db:migrate": "bun run src/iGM_Database/iGM_DbCli.ts migrate",
    "db:seed": "bun run src/iGM_Database/iGM_DbCli.ts seed"
  },
  "dependencies": {
    "@elysiajs/cors": "1.4.2",
    "elysia": "1.4.30",
    "nodemailer": "^10.0.10"
  }
}
```

dev 模式是 `bun run --watch`（源码变更自动重载），start 模式不带 watch，生产构建用。

### 3.2 核心端口 & 数据库 & CORS（iGM_Config.ts）

路径：`iGM_Server/src/iGM_Config/iGM_Config.ts`

这是后端启动时最先读取的配置，决定监听哪个端口、数据库文件在哪、CORS 允许哪些来源。**所有值都支持环境变量覆盖**（IGM_PORT、IGM_DATABASE_PATH、SMTP_HOST 等）。

```typescript
export const iGM_Config: iGM_AppConfig = {
  // 后端监听端口 —— 3001 是硬编码默认值；本地启动器（IGLAUNCHER）和前端主站都写死 localhost:3001
  port: Number(process.env.IGM_PORT ?? 3001),

  // 数据库文件路径 —— 用 import.meta.dir 做相对定位，不管从哪启动都落到 D:/IGWEB/database/
  databasePath:
    process.env.IGM_DATABASE_PATH ??
    resolve(import.meta.dir, "../../../database/igcraftlit.sqlite"),

  // CORS 白名单 —— 仅正式域名 + localhost:3000；注意启动器调试端口 3210 不在里面
  corsOrigins: [
    "https://igcraftlit.com",
    "https://www.igcraftlit.com",
    "http://localhost:3000",
  ],

  version: "0.5.0",

  auth: {
    // 会话 Cookie 名 iGM_SID —— 前端统一读取这个
    cookieName: "iGM_SID",
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    verifyCodeTtlMs: 10 * 60 * 1000,
    resetTokenTtlMs: 30 * 60 * 1000,
    maxVerifyAttempts: 5,
    // 邮件里重置链接的前端基址 —— 本地默认 3000
    webBaseUrl: process.env.IGM_WEB_BASE_URL ?? "http://localhost:3000",
    mailConsoleOnly: (process.env.IGM_MAIL_CONSOLE_ONLY ?? "false") === "true",
  },

  // SMTP 认证码从环境变量读取，禁止写进代码或提交 Git
  mail: {
    host: process.env.SMTP_HOST ?? "smtp.163.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : true,
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM ?? "",
  },

  // 本地上传根目录 —— D:/IGWEB/uploads
  upload: {
    rootDir: process.env.IGM_UPLOAD_DIR ?? resolve(import.meta.dir, "../../../uploads"),
    maxFileSize: Number(process.env.IGM_UPLOAD_MAX_SIZE ?? 20 * 1024 * 1024),
    imageMaxDimension: Number(process.env.IGM_UPLOAD_IMAGE_MAX_DIM ?? 8000),
    allowedExtensions: ["png","jpg","jpeg","gif","webp","svg","bmp","pdf","txt","md","csv","doc","docx","jar","mcpack",/* ... */],
    allowedMimeTypes: ["image/png","image/jpeg","application/pdf","application/zip",/* ... */],
  },
};
```

### 3.3 服务器入口（iGM_ServerMain.ts）

路径：`iGM_Server/src/iGM_ServerMain.ts`

**Elysia 应用创建 → CORS → 统一错误处理 → 挂载全部业务路由 → 确保上传目录存在 → 自动执行迁移 → 监听端口**。

```typescript
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { iGM_Config } from "./iGM_Config/iGM_Config";
import { iGM_RunMigrations } from "./iGM_Database/iGM_Database";
import { iGM_EnsureUploadRoot } from "./iGM_Services/iGM_StorageService";
// ... G_Health、G_Auth、G_Community、G_Post、G_File、G_Social、G_Message、G_Minecraft 等

// ① 创建 Elysia 应用并链式挂载插件与路由
const iGM_Server = new Elysia()
  // CORS：只允许白名单域名
  .use(cors({
    origin: (request) => iGM_Config.corsOrigins.includes(request.headers.get("Origin") ?? ""),
    methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    credentials: true,
  }))
  // 每个请求打一行日志
  .onRequest(({ request }) => {
    console.log(`[iGM_Server] ${request.method} ${new URL(request.url).pathname}`);
  })
  // 统一错误处理：按业务错误类型返回对应 HTTP 状态码
  .onError(({ code, error, set }) => { /* ... 省略，见源码 ... */ })
  // 挂载全部业务路由（共 19 个 G_* 路由）
  .use(G_Health)
  .use(G_Api)
  .use(G_Auth)
  .use(G_Community)
  .use(G_Post)
  .use(G_Notification)
  .use(G_File)
  .use(G_Activity)
  .use(G_Resource)
  .use(G_Points)
  .use(G_Admin)
  .use(G_Seo)
  .use(G_OrgVerify)
  .use(G_Realtime)
  .use(G_Stats)
  .use(G_Social)
  .use(G_Message)
  .use(G_Minecraft)
  // 根路径占位
  .get("/", () => ({ success: true, code: 200, message: "iGCraftLit Community API", data: null }));

// ② 启动前确保上传根目录存在
await iGM_EnsureUploadRoot();

// ③ 启动时自动执行 SQLite 迁移（iGM_001_Init.sql → iGM_014_ResourceDownloadable.sql）
await iGM_RunMigrations();

// ④ 仅在直接运行时监听端口；被 import.meta.main 之外的地方引入时不占用端口
if (import.meta.main) {
  iGM_Server.listen(iGM_Config.port);  // 默认 3001
  console.log(`[iGM_Server] 后端已启动：http://localhost:${iGM_Config.port}`);
}

// ⑤ 导出 Web Standard fetch，将来可直接迁到 Cloudflare Workers
export default iGM_Server;
export const fetch = iGM_Server.fetch;
```

### 3.4 SQLite 数据库打开（iGM_Database.ts）

路径：`iGM_Server/src/iGM_Database/iGM_Database.ts`

```typescript
import { Database } from "bun:sqlite";

function iGM_OpenDatabase(): Database {
  const dbPath = resolve(iGM_Config.databasePath);  // D:/IGWEB/database/igcraftlit.sqlite
  if (!existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true });
  const database = new Database(dbPath, { create: true });
  database.run("PRAGMA foreign_keys = ON");  // 外键约束必须开启
  return database;
}
```

### 3.5 数据库迁移文件清单

`iGM_Server/src/iGM_Migrations/` 目录下（共 14 个，按文件名顺序执行）：
`iGM_001_Init.sql` → `iGM_002_Auth.sql` → `iGM_003_Community.sql` → `iGM_004_Module4.sql` → `iGM_005_Module4ResourceActivity.sql` → `iGM_006_Module5.sql` → `iGM_007_Module7.sql` → `iGM_008_Module7b.sql` → `iGM_009_Module7c.sql` → `iGM_010_Module8.sql` → `iGM_011_Module9.sql` → `iGM_012_Module10.sql` → `iGM_013_Module10Fix.sql` → `iGM_014_ResourceDownloadable.sql`

后端启动时自动扫描并执行未跑过的迁移，**不需要手动跑 `db:migrate`**（手动跑只用于重置或调试）。

---

## 四、前端主站（apps/web）

### 4.1 package.json（D:/IGWEB/apps/web/package.json）

Next.js 16.3.5 + next-intl 4.14.5 + React 19.3.0；dev/build/start 三条脚本。

```json
{
  "name": "igcraftlit-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",                                          // 默认端口 3000
    "build": "next build && bun run scripts/iGM_FixExportSegments.ts",  // SSG 静态导出
    "build:next": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "16.3.5",
    "next-intl": "4.14.5",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "lucide-react": "1.47.0",
    "recharts": "^3.10.1",
    "three": "0.180.0"
  }
}
```

### 4.2 构建配置（next.config.ts）

路径：`apps/web/next.config.ts`

**强制纯静态导出**，禁止 SSR/ISR/Server Actions。生产构建产物在 `apps/web/out`，部署到 Cloudflare Pages。

```typescript
const iGM_NextConfig: NextConfig = {
  // 纯静态导出 —— 这是 Next.js SSG 的核心开关
  output: "export",
  // 静态导出不支持 Next 内置图片优化器，关闭
  images: { unoptimized: true },
  // 构建期注入版本号与构建时间（健康检查页会读）
  env: {
    NEXT_PUBLIC_IGM_VERSION: "0.1.0",
    NEXT_PUBLIC_IGM_BUILD_TIME: new Date().toISOString(),
  },
};
```

另外还有一个构建后修正脚本：`apps/web/scripts/iGM_FixExportSegments.ts` —— Next 16 Windows 上 RSC 片段文件路径有 bug，`next build` 跑完会自动修一次，修正 1 个 RSC 片段文件路径。

### 4.3 API 基址运行时解析（iGM_Config.ts）

路径：`apps/web/src/iGM_Services/iGM_Config.ts`

这是前端**最关键**的启动配置。因为是纯静态站点，同一套产物既要跑在本地 localhost:3000、又要跑在生产 igcraftlit.com，所以 API 基址**不在编译期固化，而是运行时按当前页面域名解析**。

```typescript
const iGM_LocalApiBase = "http://localhost:3001";       // 本地联调直连本机后端
const iGM_ProdApiBase  = "https://api.igcraftlit.com";  // 生产：Cloudflare 隧道映射到本机 3001
const iGM_ProdHostSuffix = "igcraftlit.com";

export function iGM_GetApiBase(): string {
  // 优先级：显式环境变量 > 线上域名自动判定 > 本地地址
  const explicit = process.env.NEXT_PUBLIC_IGM_API_BASE?.replace(/\/$/, "");
  if (explicit) return explicit;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === iGM_ProdHostSuffix || host.endsWith(`.${iGM_ProdHostSuffix}`)) {
      return iGM_ProdApiBase;
    }
  }
  return iGM_LocalApiBase;
}

export const iGM_Config = {
  get apiBase() { return iGM_GetApiBase(); },  // getter：每次读取时重新解析
  version: process.env.NEXT_PUBLIC_IGM_VERSION ?? "0.1.0",
  buildTime: process.env.NEXT_PUBLIC_IGM_BUILD_TIME ?? "",
};
```

所有前端 API 调用都统一经过 `iGM_Request`（`apps/web/src/iGM_Services/iGM_Request.ts`），里面用的就是 `iGM_Config.apiBase`，不需要每个 Service 自己拼地址。

---

## 五、完整启动链路（按顺序）

**`bun run dev` 一条命令等价于下面 3 步：**

```
Step 1  后端启动
  │  bun run --cwd iGM_Server dev        // watch 模式
  │  ├─ Elysia() 创建应用
  │  ├─ cors({ origins: [igcraftlit.com, www.igcraftlit.com, localhost:3000] })
  │  ├─ iGM_RunMigrations()              // 自动执行 14 个 SQL 迁移
  │  ├─ iGM_EnsureUploadRoot()           // 确保 D:/IGWEB/uploads 存在
  │  └─ iGM_Server.listen(3001)          // http://localhost:3001
  │     健康检查: GET /G_Api_Health
  │
Step 2  前端启动（并行）
  │  bun run --cwd apps/web dev          // next dev, 端口 3000
  │  └─ http://localhost:3000/zh-CN/G_Home
  │     API 自动解析为 http://localhost:3001
  │
Step 3  前端调用后端
     iGM_Request.xxx()  →  iGM_Config.apiBase  →  fetch("http://localhost:3001/G_Auth/me")
     Cookie iGM_SID 随请求自动带上
```

---

## 六、环境变量清单（影响启动的）

| 变量 | 作用 | 默认值 | 读取方 |
|---|---|---|---|
| `IGM_PORT` | 后端监听端口 | 3001 | iGM_Config.ts |
| `IGM_DATABASE_PATH` | SQLite 文件路径 | D:/IGWEB/database/igcraftlit.sqlite | iGM_Config.ts |
| `IGM_WEB_BASE_URL` | 邮件里重置链接的前端基址 | http://localhost:3000 | iGM_Config.ts |
| `IGM_MAIL_CONSOLE_ONLY` | 本地调试时是否只输出邮件不真正发送 | false | iGM_Config.ts |
| `IGM_UPLOAD_DIR` | 本地上传存储根目录 | D:/IGWEB/uploads | iGM_Config.ts |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | 163 邮箱 SMTP 配置 | smtp.163.com / 465 / true | iGM_Config.ts |
| `SMTP_USER` / `SMTP_PASS` | SMTP 登录与授权码 | 空 | iGM_Config.ts |
| `MAIL_FROM` | 发件人地址 | 空 | iGM_Config.ts |
| `NEXT_PUBLIC_IGM_API_BASE` | 前端强制指定 API 基址（覆盖运行时域名解析） | 无 | iGM_Config.ts（前端） |
| `NEXT_PUBLIC_IGM_VERSION` | 前端构建时注入版本号 | "0.1.0" | next.config.ts |
| `NEXT_PUBLIC_IGM_BUILD_TIME` | 前端构建时注入构建时间 | — | next.config.ts |

---

## 七、生产部署（对比本地启动）

| 环节 | 本地 | 生产 |
|---|---|---|
| 前端构建 | — | `bun run build` → `apps/web/out` → wrangler pages deploy |
| 后端运行 | `bun run --watch src/iGM_ServerMain.ts` | 本地 CMD 常驻（或 cloudflared 隧道自启） |
| 域名 | localhost:3000 + localhost:3001 | igcraftlit.com + api.igcraftlit.com |
| API 基址 | 前端 iGM_GetApiBase() 返回 localhost:3001 | 前端 iGM_GetApiBase() 返回 api.igcraftlit.com |
| 隧道 | 无 | cloudflared 命名隧道 igcraftlit-api，https://api.igcraftlit.com → http://localhost:3001 |
| 数据库 | 同上（本地 SQLite） | 同上（本地 SQLite） |
| CORS | 同上 | 同上（igcraftlit.com、www.igcraftlit.com、localhost:3000 三者都在白名单） |

生产的 cloudflared 隧道配置文件在 `C:\Users\igcra\.cloudflared\config.yml`（用户启动文件夹自启）。
