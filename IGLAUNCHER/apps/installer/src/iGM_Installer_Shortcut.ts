/**
 * 文件路径：apps/installer/src/iGM_Installer_Shortcut.ts
 * 所属层：安装程序 / 系统集成层
 * 路由：全局
 * 模块：iGM_Installer_Shortcut
 * 作用：安装完成后在桌面与开始菜单创建启动器快捷方式
 * 内容：用 PowerShell 调用 WScript.Shell 生成 .lnk，指向已安装目录内的 bin/launcher.exe
 *
 * 说明：Electrobun 2.0.1 未提供创建快捷方式的 API，故走系统自带的 WScript.Shell；
 *       路径中的单引号按 PowerShell 规则转义为两个单引号，避免注入与解析错误。
 */

// 导入依赖 //
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Utils } from "electrobun/main";
import { IGM_INSTALLER_SHORTCUT_NAME } from "@igm-launcher/shared";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //

/** 快捷方式文件名 */
const iGM_Installer_LinkName = `${IGM_INSTALLER_SHORTCUT_NAME}.lnk`;

/** 桌面目录 */
export function iGM_Installer_DesktopDir(): string {
  return Utils.paths.desktop;
}

/** 开始菜单「程序」目录（%APPDATA%\Microsoft\Windows\Start Menu\Programs） */
export function iGM_Installer_StartMenuDir(): string {
  const appData = process.env.APPDATA?.trim() || Utils.paths.appData;
  return join(appData, "Microsoft", "Windows", "Start Menu", "Programs");
}

/** PowerShell 单引号字符串转义 */
function iGM_Installer_Escape(value: string): string {
  return value.replace(/'/g, "''");
}

/** 生成单个 .lnk */
async function iGM_Installer_CreateLink(
  linkPath: string,
  targetExe: string,
  workingDir: string,
): Promise<void> {
  await mkdir(dirname(linkPath), { recursive: true });

  const script = [
    "$shell = New-Object -ComObject WScript.Shell",
    `$link = $shell.CreateShortcut('${iGM_Installer_Escape(linkPath)}')`,
    `$link.TargetPath = '${iGM_Installer_Escape(targetExe)}'`,
    `$link.WorkingDirectory = '${iGM_Installer_Escape(workingDir)}'`,
    `$link.IconLocation = '${iGM_Installer_Escape(targetExe)},0'`,
    `$link.Description = '${iGM_Installer_Escape(IGM_INSTALLER_SHORTCUT_NAME)}'`,
    "$link.Save()",
  ].join("; ");

  const result = Bun.spawnSync(
    [
      "powershell",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  if (result.exitCode !== 0) {
    const detail = result.stderr.toString().trim();
    throw new Error(detail || `创建快捷方式失败：${linkPath}`);
  }
}

/** 同时创建桌面与开始菜单快捷方式 */
export async function iGM_Installer_CreateShortcuts(
  targetExe: string,
  workingDir: string,
): Promise<void> {
  await iGM_Installer_CreateLink(
    join(iGM_Installer_DesktopDir(), iGM_Installer_LinkName),
    targetExe,
    workingDir,
  );
  await iGM_Installer_CreateLink(
    join(iGM_Installer_StartMenuDir(), iGM_Installer_LinkName),
    targetExe,
    workingDir,
  );
}

// 导出 //
/* 以上具名导出即为本模块对外接口 */