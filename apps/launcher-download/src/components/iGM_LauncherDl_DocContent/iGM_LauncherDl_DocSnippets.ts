/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_DocContent/iGM_LauncherDl_DocSnippets.ts
 * 所属层：前端 / 文档内容常量层
 * 路由：/docs/install 文档页
 * 模块：iGM_LauncherDl_Downloader
 * 作用：文档中语言无关的代码片段单一事实来源（命令、字段名等）
 * 内容：安装包校验命令；文件名引用当前发布版本常量，避免与语言包重复维护
 */

// 导入依赖 //
import {
  iGM_LauncherDl_FileName,
  iGM_LauncherDl_VersionLabel,
} from "../../i18n/iGM_LauncherDl_ReleaseInfo";

// 类型定义 //
export interface iGM_LauncherDl_DocSnippet {
  /** 语言标签（小写展示在代码块头部） */
  label: string;
  /** 代码内容 */
  code: string;
}

// 核心逻辑 //
/** PowerShell 校验安装包 SHA256（含当前安装包文件名） */
export const iGM_LauncherDl_VerifySnippet: iGM_LauncherDl_DocSnippet = {
  label: "powershell",
  code: `Get-FileHash .\\${iGM_LauncherDl_FileName} -Algorithm SHA256`,
};

/** 当前发布版本展示文本（供文档正文引用） */
export const iGM_LauncherDl_DocVersionLabel = iGM_LauncherDl_VersionLabel;

// 导出 //
export default iGM_LauncherDl_VerifySnippet;