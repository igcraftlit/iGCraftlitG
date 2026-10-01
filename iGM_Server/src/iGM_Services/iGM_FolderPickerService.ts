/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_FolderPickerService.ts
 * 所属层：后端 / 基础服务层
 * 路由：G_Game
 * 模块：iGM_FolderPickerService
 * 作用：调用系统原生文件夹选择器，把用户选中的绝对路径回传前端
 * 内容：Windows 下通过 PowerShell + WinForms FolderBrowserDialog（STA）弹出选择框，
 *       选择结果经临时文件以 UTF-8 回传；非 Windows 平台直接返回不支持
 * 说明：浏览器受安全限制无法读取本地绝对路径，故“浏览”按钮由后端代弹窗；
 *       临时脚本与结果文件在使用后立即清理
 */

// 导入依赖 //
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { iGM_GameError } from "./iGM_GameDownloadService";
import { iGM_RandomUuid } from "./iGM_SecurityService";

// 类型定义 //
// （本服务无对外类型，返回值为选中的绝对路径或 null）

// 核心逻辑 //
/** 文件夹选择器超时时间：5 分钟（用户可长时间停留） */
const iGM_PickerTimeoutMs = 5 * 60 * 1000;

/** Windows 原生文件夹选择脚本（以 -STA 运行，结果写入 UTF-8 临时文件） */
const iGM_PickerScript = `param([string]$OutFile)
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择 Minecraft 安装目录'
$dialog.ShowNewFolderButton = $true
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.WindowState = 'Minimized'
$form.ShowInTaskbar = $false
$result = $dialog.ShowDialog($form)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [System.IO.File]::WriteAllText($OutFile, $dialog.SelectedPath, [System.Text.Encoding]::UTF8)
  exit 0
}
exit 1
`;

/**
 * 弹出系统文件夹选择器
 * @returns 选中的绝对路径；用户取消或超时返回 null
 */
export async function iGM_PickFolder(): Promise<string | null> {
  if (process.platform !== "win32") {
    throw new iGM_GameError("game.errors.pickerUnsupported", 501);
  }

  const token = iGM_RandomUuid();
  const scriptPath = join(tmpdir(), `igm-picker-${token}.ps1`);
  const outputPath = join(tmpdir(), `igm-picker-${token}.txt`);

  try {
    await writeFile(scriptPath, iGM_PickerScript, "utf8");

    const proc = Bun.spawn(
      [
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-STA",
        "-File",
        scriptPath,
        outputPath,
      ],
      { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
    );

    const timeout = new Promise<"timeout">((done) =>
      setTimeout(() => done("timeout"), iGM_PickerTimeoutMs),
    );
    const outcome = await Promise.race([
      proc.exited.then((code) => code),
      timeout,
    ]);

    if (outcome === "timeout") {
      proc.kill();
      return null;
    }
    if (outcome !== 0) return null;

    const selected = (await readFile(outputPath, "utf8")).replace(/^\uFEFF/, "").trim();
    return selected.length > 0 ? selected : null;
  } catch {
    throw new iGM_GameError("game.errors.pickerFailed", 500);
  } finally {
    await rm(scriptPath, { force: true }).catch(() => undefined);
    await rm(outputPath, { force: true }).catch(() => undefined);
  }
}

// 导出 //
export default { iGM_PickFolder };