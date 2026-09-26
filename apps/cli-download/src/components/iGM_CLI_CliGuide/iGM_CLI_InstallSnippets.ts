/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_CliGuide/iGM_CLI_InstallSnippets.ts
 * 所属层：前端 / 组件层
 * 路由：/docs/cli/install 与 /api 安装区块
 * 模块：iGM_CLI_Downloader
 * 作用：iGM CLI 安装片段与安装方式配置（语言无关，命令本身不翻译）
 * 内容：npm / bun 为推荐安装方式（已发布到 npm registry，可用）；通用下载次之（下载单文件后用 node 直接执行）；
 *       远程脚本（PowerShell/curl）与 npx 渠道暂未上线，标记为敬请期待
 */

// 类型定义 //
export interface iGM_CLI_InstallMethod {
  /** 章节锚点 id（install 子页二级目录与正文锚点共用） */
  id: string;
  /** 语言包字段后缀（docs.cli.install.*） */
  labelKey:
    | "windows"
    | "unix"
    | "npm"
    | "bun"
    | "npx"
    | "directWindows"
    | "directUnix";
  /** 代码块语言标签 */
  lang: string;
  /** 命令片段 */
  code: string;
  /** 是否敬请期待（暂不可用，不展示可复制命令） */
  comingSoon?: boolean;
}

// 核心逻辑 //
/** 静态站点对外域名，用于拼接单文件 CLI 下载地址 */
const iGM_CLI_SiteOrigin = "https://cli.igcraftlit.com";

/** 单文件 CLI 下载地址（部署到 Cloudflare Pages 后可直接访问） */
const iGM_CLI_BinaryUrl = `${iGM_CLI_SiteOrigin}/iGM_CLIMain.js`;

/** 语言无关的命令片段（命令本身不翻译） */
export const iGM_CLI_InstallSnippets = {
  /** 远程安装脚本暂未上线，仅保留占位 */
  powershell: `irm ${iGM_CLI_BinaryUrl.replace("iGM_CLIMain.js", "install.ps1")} | iex`,
  unix: `curl -fsSL ${iGM_CLI_BinaryUrl.replace("iGM_CLIMain.js", "install.sh")} | bash`,
  npm: "npm install -g igm-cli",
  bun: "bun add -g igm-cli",
  npx: "npx igm-cli\nbunx igm-cli",
  /** 当前可用：系统 CLI 直接运行单文件 */
  directWindows: `irm ${iGM_CLI_BinaryUrl} -OutFile igm.js; node igm.js`,
  directUnix: `curl -fsSL ${iGM_CLI_BinaryUrl} -o igm.js && node igm.js`,
  configJson: `{
  "name": "my-mc-server",
  "version": "1.0.0",
  "minecraft": "1.20.1",
  "loader": "fabric",
  "dependencies": {
    "sodium": "^0.5.8",
    "lithium": "^0.12.1"
  }
}`,
  lang: "igm config set lang=zh-CN",
};

/** 安装方式列表：npm / bun 为推荐方式，通用下载次之，其余渠道敬请期待 */
export const iGM_CLI_InstallMethods: iGM_CLI_InstallMethod[] = [
  {
    id: "install-npm",
    labelKey: "npm",
    lang: "bash",
    code: iGM_CLI_InstallSnippets.npm,
  },
  {
    id: "install-bun",
    labelKey: "bun",
    lang: "bash",
    code: iGM_CLI_InstallSnippets.bun,
  },
  {
    id: "direct-windows",
    labelKey: "directWindows",
    lang: "powershell",
    code: iGM_CLI_InstallSnippets.directWindows,
  },
  {
    id: "direct-unix",
    labelKey: "directUnix",
    lang: "bash",
    code: iGM_CLI_InstallSnippets.directUnix,
  },
  {
    id: "install-powershell",
    labelKey: "windows",
    lang: "powershell",
    code: iGM_CLI_InstallSnippets.powershell,
    comingSoon: true,
  },
  {
    id: "install-unix",
    labelKey: "unix",
    lang: "bash",
    code: iGM_CLI_InstallSnippets.unix,
    comingSoon: true,
  },
  {
    id: "install-npx",
    labelKey: "npx",
    lang: "bash",
    code: iGM_CLI_InstallSnippets.npx,
    comingSoon: true,
  },
];
