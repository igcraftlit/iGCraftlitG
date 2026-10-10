# iGCraftLit Community - 完整启动指南

> 项目根目录：`D:/IGWEB`
> 域名：igcraftlit.com（生产）| localhost:3000（本地前端）| localhost:3001（本地后端）
> **快捷方式**：双击 `start.bat` 一键启动（启动后窗口自动关闭）

---

## ✅ 快速启动（双击 start.bat）

**最简单的方式**：直接双击 `D:\IGWEB\start.bat`

脚本会自动完成：
1. ✅ 检测并启动 PostgreSQL 数据库
2. ✅ 检测 Bun 是否已安装
3. ✅ 在新窗口后台启动前后端
4. ✅ **当前窗口自动关闭**（3 秒后）

启动成功后：
- 前端：http://localhost:3000
- 后端：http://localhost:3001
- 健康检查：http://localhost:3001/G_Api_Health

---

## 一、前置依赖

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| **Bun** | ≥ 1.0.0 | 后端运行时 & 包管理器，[下载](https://bun.sh/) |
| **Docker Desktop** | 最新版 | 运行 PostgreSQL 数据库容器，[下载](https://www.docker.com/) |
| **Node.js** | ≥ 20.0.0 | 前端 Next.js 开发依赖 |

可选：
- **Ollama + Qwen2.5:7B** — AI 助手 Free 通道（本地）
- **DeepSeek API Key** — AI 助手 Premium 通道（云端）
- **cloudflared** — 线上 API 隧道

---

## 二、数据库

### 首次创建容器

```powershell
docker run -d --name igm-postgres -p 5432:5432 -e POSTGRES_USER=iguser -e POSTGRES_PASSWORD=igpassword -e POSTGRES_DB=igcraftlit postgres:16-alpine
docker ps | findstr igm-postgres
exit
```

### 日常启动/停止

```powershell
docker start igm-postgres
exit
```

```powershell
docker stop igm-postgres
exit
```

### 连接信息

- **连接串**：`postgresql://iguser:igpassword@localhost:5432/igcraftlit`
- **端口**：5432

---

## 三、手动启动（命令行）

### 完整启动（前后端同时）

```powershell
docker start igm-postgres
cd D:\IGWEB
Remove-Item Env:BUN_INSPECT_CONNECT_TO -ErrorAction SilentlyContinue
bun run dev
```

> 这个命令会长期运行（前后端热重载），**不要**加 exit。Ctrl+C 停止后窗口会关闭。

### 仅前端

```powershell
docker start igm-postgres
cd D:\IGWEB
bun run dev:web
```

### 仅后端

```powershell
docker start igm-postgres
cd D:\IGWEB
Remove-Item Env:BUN_INSPECT_CONNECT_TO -ErrorAction SilentlyContinue
bun run dev:server
```

### 依赖安装（首次或更新时）

```powershell
cd D:\IGWEB
bun install
exit
```

---

## 四、生产构建

```powershell
cd D:\IGWEB
Remove-Item Env:BUN_INSPECT_CONNECT_TO -ErrorAction SilentlyContinue
bun run build
exit
```

构建产物：`apps/web/out`（纯静态 SSG）

---

## 五、数据库操作

```powershell
cd D:\IGWEB
bun run db:init        # 首次初始化（建表 + 迁移）
bun run db:migrate     # 增量迁移
bun run db:seed        # 填充种子数据
bun run db:relations   # 查看表关系
exit
```

> 后端启动时会自动执行迁移，正常开发不需要手动执行。

---

## 六、健康检查

启动成功后，用浏览器或 curl 验证：

```powershell
curl http://localhost:3001/G_Api_Health
exit
```

应返回：`{"success":true,"code":200,"message":"ok","data":{"status":"ok","service":"iGCraftLit Community API","version":"0.5.0",...}}`

---

## 七、Ollama 本地 AI（可选）

```powershell
ollama serve
ollama pull qwen2.5:7b
ollama list
exit
```

---

## 八、cloudflared 隧道（可选）

```powershell
cloudflared tunnel run igcraftlit-api
exit
```

---

## 九、常见问题

### Q1：后端报 "连接数据库失败"

```powershell
docker ps | findstr igm-postgres
docker start igm-postgres
exit
```

### Q2：端口被占用

```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :3001
taskkill /PID <进程号> /F
exit
```

### Q3：Bun 找不到

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
exit
```

### Q4：Next.js 构建失败

```powershell
cd D:\IGWEB
Remove-Item -Recurse -Force apps/web/.next -ErrorAction SilentlyContinue
Remove-Item Env:BUN_INSPECT_CONNECT_TO -ErrorAction SilentlyContinue
bun run build
exit
```

---

## 十、项目结构

```
D:/IGWEB/
├── apps/web/              # 主站前端（Next.js SSG）
├── apps/cli-download/     # 开发者平台
├── apps/launcher-download/# 启动器下载站
├── iGM_Server/             # 后端（Bun + Elysia）
│   ├── src/iGM_Routes/         # API 路由 G_Xxxxx.ts
│   ├── src/iGM_Services/       # 业务服务 iGM_XxxxxService.ts
│   ├── src/iGM_Repositories/   # 数据访问层
│   └── src/iGM_Migrations/     # SQL 迁移脚本
├── start.bat               # ⭐ 双击启动
└── iGM_Start.ps1           # ⭐ PowerShell 启动脚本
```

---

## 十一、命令速查

| 命令 | 说明 |
|------|------|
| `bun run dev` | 同时启动前后端（开发模式） |
| `bun run dev:web` | 仅启动前端 |
| `bun run dev:server` | 仅启动后端 |
| `bun run build` | 构建生产版本 |
| `bun run db:init` | 初始化数据库 |
| `bun run db:migrate` | 执行数据库迁移 |

## 十二、地址速查

| 服务 | 地址 |
|------|------|
| 本地前端 | http://localhost:3000 |
| 本地后端 | http://localhost:3001 |
| 后端健康检查 | http://localhost:3001/G_Api_Health |
| 线上主站 | https://igcraftlit.com |
| 线上 API | https://api.igcraftlit.com |
| Git 仓库 | https://github.com/igcraftlit/iGCraftlitG |

---

## 命名规则

| 类型 | 前缀 | 示例 |
|------|------|------|
| 组件 / 服务 / 模块 / 表 | `iGM_` | `iGM_AIChatWidget`, `iGM_Users` |
| 页面 / API 路由 | `G_` | `G_Home`, `G_Auth`, `G_Community` |
