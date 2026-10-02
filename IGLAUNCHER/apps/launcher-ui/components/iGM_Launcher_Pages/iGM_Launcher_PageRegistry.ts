/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_PageRegistry.ts
 * 所属层：前端 / 页面注册层
 * 路由：全局（SPA 单页）
 * 模块：iGM_Launcher_PageRegistry
 * 作用：SPA 页面注册表，把页面 id 映射到页面组件
 * 内容：界面收敛为单页的理由——Electrobun 打包后以 views:// 自定义协议读取静态产物，
 *       该协议只按精确文件路径读取、不解析目录，因此不再产出多份路由 HTML，
 *       只保留一个入口页，页面全部由客户端状态切换；
 *       模块二十六 E 把 downloads 与 versions 合并为资源中心页（pageId：resourceCenter）
 */

// 导入依赖 //
import type { ComponentType } from "react";
import type {
  iGM_Launcher_LaunchMode,
  iGM_Launcher_ThirdPartyEngine,
} from "@igm-launcher/shared";
import { iGM_Launcher_HomePage } from "./iGM_Launcher_HomePage";
import { iGM_Launcher_InstancesPage } from "./iGM_Launcher_InstancesPage";
import { iGM_Launcher_InstanceEditPage } from "./iGM_Launcher_InstanceEditPage";
import { iGM_Launcher_JavaPage } from "./iGM_Launcher_JavaPage";
import { iGM_Launcher_ResourceCenterPage } from "./iGM_Launcher_ResourceCenterPage";
import { iGM_Launcher_AccountPage } from "./iGM_Launcher_AccountPage";
import { iGM_Launcher_AccountLoginPage } from "./iGM_Launcher_AccountLoginPage";
import { iGM_Launcher_AccountMsBindPage } from "./iGM_Launcher_AccountMsBindPage";
import { iGM_Launcher_AccountProfilePage } from "./iGM_Launcher_AccountProfilePage";
import { iGM_Launcher_SettingsPage } from "./iGM_Launcher_SettingsPage";
import { iGM_Launcher_AppearancePage } from "./iGM_Launcher_AppearancePage";
import { iGM_Launcher_GameInstallPage } from "./iGM_Launcher_GameInstallPage";
import { iGM_Launcher_LaunchProgressPage } from "./iGM_Launcher_LaunchProgressPage";
import { iGM_Launcher_DownloadProgressPage } from "./iGM_Launcher_DownloadProgressPage";

// 类型定义 //
/**
 * SPA 可切换的页面 id（模块二新增实例编辑、Java 管理、账户登录三页；
 * 模块三新增正版绑定、正版档案两页；
 * 模块二十六 E 把下载中心（downloads）与资源库（versions）合并为资源中心页 resourceCenter；
 * 模块六新增下载安装位置确认页 gameInstall，由资源中心的「下载 / 安装」入口跳转，
 * 不经侧边栏，故不新增导航项；
 * 第八模块新增两个独立进度页：launchProgress（启动进度，由实例管理页选定登录方式后跳转）
 * 与 downloadProgress（下载进度，由下载安装页点「开始下载」后跳转），
 * 两者均不经侧边栏，只靠代码 navigate() 进入。
 * "about" 复用设置页组件，并额外定位到页内的关于分组，
 * 以便侧边栏「设置」与「关于」各自独立高亮
 */
export type iGM_Launcher_PageId =
  | "home"
  | "instances"
  | "instancesEdit"
  | "java"
  | "resourceCenter"
  | "gameInstall"
  | "launchProgress"
  | "downloadProgress"
  | "account"
  | "accountLogin"
  | "accountMsBind"
  | "accountProfile"
  | "settings"
  | "about"
  /** 模块二十六 B：外观与主题独立页（G_Appearance，对应侧边栏「外观」一级项） */
  | "appearance";

/**
 * 页面参数：实例编辑携带实例 id，正版档案页携带绑定记录 id，
 * 下载确认页携带目标版本号，两个进度页分别携带实例 id 与下载任务编号
 */
export interface iGM_Launcher_PageParams {
  instanceId?: string;
  bindingId?: string;
  /** 模块六：下载安装位置确认页的目标 Minecraft 版本号 */
  version?: string;
  /** 下载进度页的下载任务编号 */
  taskId?: string;
  /** 下载进度页实际使用的下载引擎（sdk 时展示「SDK 调用下载中」） */
  engine?: iGM_Launcher_ThirdPartyEngine;
  /** 启动进度页的登录方式（由实例管理页的登录方式选择对话框传入） */
  mode?: iGM_Launcher_LaunchMode;
}

/** 所有页面组件的统一入参 */
export interface iGM_Launcher_PageProps {
  params?: iGM_Launcher_PageParams;
}

// 核心逻辑 //
export const IGM_LAUNCHER_PAGE_REGISTRY: Record<
  iGM_Launcher_PageId,
  ComponentType<iGM_Launcher_PageProps>
> = {
  home: iGM_Launcher_HomePage,
  instances: iGM_Launcher_InstancesPage,
  instancesEdit: iGM_Launcher_InstanceEditPage,
  java: iGM_Launcher_JavaPage,
  resourceCenter: iGM_Launcher_ResourceCenterPage,
  gameInstall: iGM_Launcher_GameInstallPage,
  launchProgress: iGM_Launcher_LaunchProgressPage,
  downloadProgress: iGM_Launcher_DownloadProgressPage,
  account: iGM_Launcher_AccountPage,
  accountLogin: iGM_Launcher_AccountLoginPage,
  accountMsBind: iGM_Launcher_AccountMsBindPage,
  accountProfile: iGM_Launcher_AccountProfilePage,
  settings: iGM_Launcher_SettingsPage,
  about: iGM_Launcher_SettingsPage,
  appearance: iGM_Launcher_AppearancePage,
};

/** 切页后需要滚动定位的页内锚点 */
export const IGM_LAUNCHER_PAGE_ANCHORS: Partial<Record<iGM_Launcher_PageId, string>> = {
  about: "about",
};

// 导出 //
export default IGM_LAUNCHER_PAGE_REGISTRY;