#!/usr/bin/env node

// src/iGM_CLICommands.ts
import {
  existsSync as existsSync2,
  readFileSync,
  writeFileSync,
  mkdirSync as mkdirSync2,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { join as join2 } from "node:path";

// src/iGM_CLIConfig.ts
import { existsSync, mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
var iGM_CLI_DefaultApiBase = process.env.IGM_API_BASE ?? "https://api.igcraftlit.com";
function iGM_CLI_ResolveCacheDir() {
  const home = homedir();
  if (platform() === "win32") {
    return join(home, ".igm", "cache");
  }
  return join(home, ".igm", "cache");
}
function iGM_CLI_GetConfig() {
  const cacheDir = process.env.IGM_CACHE_DIR ?? iGM_CLI_ResolveCacheDir();
  const downloadDir = join(cacheDir, "downloads");
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }
  return {
    apiBase: iGM_CLI_DefaultApiBase,
    cacheDir,
    downloadDir,
    configPath: join(process.cwd(), "igm.json"),
    lockPath: join(process.cwd(), "igm.lock")
  };
}

// src/iGM_CLIRequest.ts
function iGM_CLI_ReadToken() {
  const envToken = process.env.IGM_TOKEN;
  if (envToken)
    return envToken;
  return null;
}
async function iGM_CLI_Request(path, options = {}) {
  const { apiBase } = iGM_CLI_GetConfig();
  const method = options.method ?? "GET";
  const token = options.token ?? iGM_CLI_ReadToken();
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const init = {
    method,
    headers,
    signal: options.signal
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`响应解析失败（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  if (!parsed.success) {
    throw new Error(`API 错误 [${parsed.code}]：${parsed.message}`);
  }
  return parsed;
}

// src/iGM_CLICommands.ts
function iGM_CLI_CommandHelp() {
  const help = `
iGM CLI - iGCraftLit × MuoCeon 联合构建的命令行下载工具

用法: igm <command> [options]

基础命令:
  igm                 显示帮助与版本
  igm --version       显示版本号
  igm --help          显示所有命令

资源检索:
  igm search <关键词>              搜索资源
  igm search <关键词> --type=mod   按类型筛选 (mod|modpack|resourcepack|map|skin|plugin|datapack)
  igm search <关键词> --version=1.20.1 --loader=fabric
  igm list                         列出已安装资源
  igm info <资源ID或slug>          查看资源详情

安装与下载:
  igm install <资源>               下载并安装到当前目录
  igm install <资源> --version=1.20.1 --loader=fabric
  igm install <资源> --dir=./mods
  igm install --file=igm.json      按配置文件批量安装
  igm add <资源>                   加入 igm.json 依赖并立即安装
  igm remove <资源>                从 igm.json 移除并从本地删除
  igm update                       更新所有已安装资源
  igm update <资源>                更新指定资源

项目管理:
  igm init                         初始化 igm.json 配置文件
  igm login                        登录 iGCraftLit 账号
  igm logout                       退出登录
  igm whoami                       查看当前登录用户
  igm cache clean                  清空本地缓存
  igm cache list                   查看缓存内容
  igm doctor                       检查环境、网络、缓存、后端连接状态
  igm serve                        启动本地适配器服务
  igm sdk                          获取 SDK
  igm api                          查看 API 文档

环境变量:
  IGM_API_BASE     覆盖 API 基础地址（默认 https://api.igcraftlit.com）
  IGM_CACHE_DIR    覆盖缓存目录
  IGM_TOKEN        直接指定登录 token

示例:
  igm search sodium --version=1.20.1 --loader=fabric
  igm install sodium --dir=./mods
  igm init && igm add lithium
`;
  console.log(help);
}
function iGM_CLI_CommandVersion() {
  console.log("igm-cli 0.1.3");
}
async function iGM_CLI_CommandSearch(args) {
  const keyword = args.positional[0];
  if (!keyword) {
    console.error("错误：请指定搜索关键词。用法：igm search <关键词>");
    process.exitCode = 1;
    return;
  }
  const params = new URLSearchParams({ search: keyword });
  if (typeof args.flags.type === "string")
    params.set("category", args.flags.type);
  if (typeof args.flags.version === "string")
    params.set("version", args.flags.version);
  if (typeof args.flags.loader === "string")
    params.set("loader", args.flags.loader);
  params.set("page", "1");
  params.set("pageSize", "20");
  try {
    const res = await iGM_CLI_Request(`/G_Resource?${params.toString()}`);
    const items = res.data.items ?? [];
    if (items.length === 0) {
      console.log(`未找到与「${keyword}」相关的资源。`);
      return;
    }
    console.log(`找到 ${res.data.total ?? items.length} 条结果：
`);
    for (const item of items) {
      const meta = [item.category, item.version, item.loader].filter(Boolean).join(" / ");
      console.log(`  ${item.id}  ${item.title}`);
      if (meta)
        console.log(`           ${meta}`);
      if (item.description)
        console.log(`           ${item.description.slice(0, 60)}`);
    }
  } catch (err) {
    console.error(`搜索失败：${err.message}`);
    process.exitCode = 1;
  }
}
async function iGM_CLI_CommandInfo(args) {
  const id = args.positional[0];
  if (!id) {
    console.error("错误：请指定资源 ID 或 slug。用法：igm info <资源ID>");
    process.exitCode = 1;
    return;
  }
  try {
    const res = await iGM_CLI_Request(`/G_Resource/${encodeURIComponent(id)}`);
    const item = res.data;
    console.log(`标题: ${item.title}`);
    if (item.description)
      console.log(`描述: ${item.description}`);
    if (item.category)
      console.log(`分类: ${item.category}`);
    if (item.version)
      console.log(`版本: ${item.version}`);
    if (item.loader)
      console.log(`加载器: ${item.loader}`);
  } catch (err) {
    console.error(`获取详情失败：${err.message}`);
    process.exitCode = 1;
  }
}
function iGM_CLI_CommandList() {
  const { configPath } = iGM_CLI_GetConfig();
  if (!existsSync2(configPath)) {
    console.log("当前目录无 igm.json，尚未安装任何资源。");
    return;
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw);
    const deps = cfg.dependencies ?? {};
    const keys = Object.keys(deps);
    if (keys.length === 0) {
      console.log("igm.json 中暂无依赖。");
      return;
    }
    console.log(`已安装 ${keys.length} 个资源：
`);
    for (const [name, ver] of Object.entries(deps)) {
      console.log(`  ${name}@${ver}`);
    }
  } catch {
    console.error("igm.json 解析失败。");
    process.exitCode = 1;
  }
}
async function iGM_CLI_CommandInstall(args) {
  if (typeof args.flags.file === "string") {
    await iGM_CLI_InstallFromFile(args.flags.file);
    return;
  }
  const resource = args.positional[0];
  if (!resource) {
    console.error("错误：请指定资源。用法：igm install <资源>");
    process.exitCode = 1;
    return;
  }
  const dir = typeof args.flags.dir === "string" ? args.flags.dir : ".";
  // 解析 slug@version 语法：下载 URL 只用 slug，version 仅用于展示
  const atIdx = resource.lastIndexOf("@");
  const slug = atIdx > 0 ? resource.slice(0, atIdx) : resource;
  const ver = atIdx > 0 ? resource.slice(atIdx + 1) : null;
  console.log(`正在安装 ${resource} 到 ${dir} ...`);
  try {
    const { apiBase } = iGM_CLI_GetConfig();
    const token = iGM_CLI_ReadToken();
    const url = `${apiBase}/G_Resource/${encodeURIComponent(slug)}/download`;
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const errText = await res.text();
        const errJson = JSON.parse(errText);
        if (errJson.message) msg = `${errJson.message}（HTTP ${res.status}）`;
      } catch {
        // 非 JSON 响应，保留状态码信息
      }
      throw new Error(msg);
    }
    // 从 Content-Disposition 解析文件名（兼容 filename 与 RFC 5987 filename*）
    const cd = res.headers.get("content-disposition") || "";
    let filename = `${resource}.zip`;
    const starMatch = cd.match(/filename\*=UTF-8''([^;]+)/i);
    if (starMatch) {
      filename = decodeURIComponent(starMatch[1]);
    } else {
      const plainMatch = cd.match(/filename="?([^";]+)"?/i);
      if (plainMatch) filename = plainMatch[1];
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!existsSync2(dir)) mkdirSync2(dir, { recursive: true });
    const dest = join2(dir, filename);
    writeFileSync(dest, buf);
    console.log(`下载完成：${dest}（${(buf.length / 1024).toFixed(1)} KB）`);
  } catch (err) {
    console.error(`安装失败：${err.message}`);
    process.exitCode = 1;
  }
}
async function iGM_CLI_InstallFromFile(file) {
  if (!existsSync2(file)) {
    console.error(`错误：配置文件 ${file} 不存在。`);
    process.exitCode = 1;
    return;
  }
  try {
    const cfg = JSON.parse(readFileSync(file, "utf-8"));
    const deps = Object.keys(cfg.dependencies ?? {});
    if (deps.length === 0) {
      console.log(`${file} 中无依赖。`);
      return;
    }
    console.log(`将安装 ${deps.length} 个依赖：${deps.join(", ")}`);
    for (const dep of deps) {
      console.log(`  - ${dep}@${cfg.dependencies[dep]}`);
    }
    console.log("提示：批量下载对接中，已列出待安装依赖。");
  } catch {
    console.error(`解析 ${file} 失败。`);
    process.exitCode = 1;
  }
}
async function iGM_CLI_CommandAdd(args) {
  const resource = args.positional[0];
  if (!resource) {
    console.error("错误：请指定资源。用法：igm add <资源>");
    process.exitCode = 1;
    return;
  }
  const { configPath } = iGM_CLI_GetConfig();
  let cfg = {};
  if (existsSync2(configPath)) {
    try {
      cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {}
  }
  cfg.dependencies = { ...cfg.dependencies ?? {}, [resource]: "^1.0.0" };
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + `
`);
  console.log(`已将 ${resource} 加入 igm.json。`);
  await iGM_CLI_CommandInstall(args);
}
function iGM_CLI_CommandRemove(args) {
  const resource = args.positional[0];
  if (!resource) {
    console.error("错误：请指定资源。用法：igm remove <资源>");
    process.exitCode = 1;
    return;
  }
  const { configPath } = iGM_CLI_GetConfig();
  if (!existsSync2(configPath)) {
    console.error("当前目录无 igm.json。");
    process.exitCode = 1;
    return;
  }
  const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
  if (cfg.dependencies && cfg.dependencies[resource]) {
    delete cfg.dependencies[resource];
    writeFileSync(configPath, JSON.stringify(cfg, null, 2) + `
`);
    console.log(`已从 igm.json 移除 ${resource}。`);
  } else {
    console.log(`${resource} 不在 igm.json 中。`);
  }
}
function iGM_CLI_CommandUpdate(args) {
  const target = args.positional[0];
  if (target) {
    console.log(`正在检查 ${target} 的更新 ...`);
  } else {
    console.log("正在检查所有已安装资源的更新 ...");
  }
  console.log("提示：自动更新功能对接中。");
}
function iGM_CLI_CommandInit() {
  const { configPath } = iGM_CLI_GetConfig();
  if (existsSync2(configPath)) {
    console.log(`igm.json 已存在：${configPath}`);
    return;
  }
  const cfg = {
    name: "my-mc-project",
    version: "1.0.0",
    minecraft: "1.20.1",
    loader: "fabric",
    dependencies: {}
  };
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + `
`);
  console.log(`已创建 igm.json：${configPath}`);
}
function iGM_CLI_CommandLogin() {
  console.log("请在浏览器中打开以下链接完成登录：");
  console.log("  https://igcraftlit.com/login");
  console.log("登录后将 token 设置到环境变量：");
  console.log("  Windows: set IGM_TOKEN=your_token");
  console.log("  macOS/Linux: export IGM_TOKEN=your_token");
}
function iGM_CLI_CommandLogout() {
  if (process.env.IGM_TOKEN) {
    console.log("已清除当前会话的 IGM_TOKEN（环境变量）。");
  } else {
    console.log("当前未登录。");
  }
}
async function iGM_CLI_CommandWhoami() {
  if (!process.env.IGM_TOKEN) {
    console.log("未登录。使用 igm login 登录。");
    return;
  }
  try {
    const res = await iGM_CLI_Request("/G_Auth/me");
    console.log(`当前用户：${res.data.username}`);
  } catch (err) {
    console.error(`获取用户信息失败：${err.message}`);
    process.exitCode = 1;
  }
}
function iGM_CLI_CommandCache(args) {
  const sub = args.positional[0];
  const { cacheDir, downloadDir } = iGM_CLI_GetConfig();
  if (sub === "clean") {
    if (existsSync2(downloadDir)) {
      rmSync(downloadDir, { recursive: true, force: true });
      mkdirSync2(downloadDir, { recursive: true });
    }
    console.log(`已清空缓存：${cacheDir}`);
    return;
  }
  if (sub === "list") {
    if (!existsSync2(downloadDir)) {
      console.log("缓存为空。");
      return;
    }
    const files = readdirSync(downloadDir);
    if (files.length === 0) {
      console.log("缓存为空。");
      return;
    }
    console.log(`缓存目录：${downloadDir}
`);
    let total = 0;
    for (const f of files) {
      const stat = statSync(join2(downloadDir, f));
      total += stat.size;
      console.log(`  ${f}  (${(stat.size / 1024).toFixed(1)} KB)`);
    }
    console.log(`
共 ${files.length} 个文件，总计 ${(total / 1024 / 1024).toFixed(2)} MB`);
    return;
  }
  console.error("用法：igm cache clean | igm cache list");
  process.exitCode = 1;
}
async function iGM_CLI_CommandDoctor() {
  const cfg = iGM_CLI_GetConfig();
  console.log(`iGM CLI 环境检查
`);
  console.log(`  平台:     ${process.platform} ${process.arch}`);
  console.log(`  Node:     ${process.version}`);
  console.log(`  API 地址: ${cfg.apiBase}`);
  console.log(`  缓存目录: ${cfg.cacheDir}`);
  console.log(`  配置文件: ${cfg.configPath}`);
  console.log("");
  try {
    const res = await fetch(`${cfg.apiBase}/G_Health`, { signal: AbortSignal.timeout(5000) });
    console.log(`  后端连接: ${res.ok ? "正常" : `异常 (HTTP ${res.status})`}`);
  } catch (err) {
    console.log(`  后端连接: 失败 (${err.message})`);
  }
  console.log(`  缓存目录: ${existsSync2(cfg.cacheDir) ? "存在" : "不存在（将自动创建）"}`);
  console.log(`  登录状态: ${process.env.IGM_TOKEN ? "已登录" : "未登录"}`);
}
function iGM_CLI_CommandServe() {
  console.log("本地适配器服务功能开发中。");
}
function iGM_CLI_CommandSdk() {
  console.log("SDK 下载与文档请访问：https://cli.igcraftlit.com/sdk");
}
function iGM_CLI_CommandApi() {
  console.log("API 文档请访问：https://cli.igcraftlit.com/api");
}

// src/iGM_CLIMain.ts
function iGM_CLI_ParseArgs(argv) {
  const args = argv.slice(2);
  let command = args[0] ?? "";
  const positional = [];
  const flags = {};
  for (const arg of args) {
    if (arg === "--version" || arg === "-V") {
      command = "__version__";
    } else if (arg === "--help" || arg === "-h") {
      command = "__help__";
    }
  }
  if (command === "__version__" || command === "__help__") {
    return { command, positional, flags };
  }
  for (let i = 1;i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > -1) {
        const key = arg.slice(2, eq);
        const value = arg.slice(eq + 1);
        flags[key] = value;
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}
async function iGM_CLI_Main() {
  const parsed = iGM_CLI_ParseArgs(process.argv);
  switch (parsed.command) {
    case "":
    case "__help__":
      iGM_CLI_CommandHelp();
      return;
    case "__version__":
      iGM_CLI_CommandVersion();
      return;
    case "search":
      await iGM_CLI_CommandSearch(parsed);
      return;
    case "info":
      await iGM_CLI_CommandInfo(parsed);
      return;
    case "list":
      iGM_CLI_CommandList();
      return;
    case "install":
      await iGM_CLI_CommandInstall(parsed);
      return;
    case "add":
      await iGM_CLI_CommandAdd(parsed);
      return;
    case "remove":
      iGM_CLI_CommandRemove(parsed);
      return;
    case "update":
      iGM_CLI_CommandUpdate(parsed);
      return;
    case "init":
      iGM_CLI_CommandInit();
      return;
    case "login":
      iGM_CLI_CommandLogin();
      return;
    case "logout":
      iGM_CLI_CommandLogout();
      return;
    case "whoami":
      await iGM_CLI_CommandWhoami();
      return;
    case "cache":
      iGM_CLI_CommandCache(parsed);
      return;
    case "doctor":
      await iGM_CLI_CommandDoctor();
      return;
    case "serve":
      iGM_CLI_CommandServe();
      return;
    case "sdk":
      iGM_CLI_CommandSdk();
      return;
    case "api":
      iGM_CLI_CommandApi();
      return;
    default:
      console.error(`未知命令：${parsed.command}`);
      console.error("运行 igm --help 查看所有可用命令。");
      process.exitCode = 1;
  }
}
iGM_CLI_Main().catch((err) => {
  console.error(`未捕获的错误：${err.message}`);
  process.exitCode = 1;
});
