/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_LauncherRelease.ts
 * 所属层：后端 / 路由层
 * 路由：/G_LauncherRelease/*
 * 模块：G_LauncherRelease
 * 作用：启动器历史版本读取接口集合（官网下载页与启动器共用）
 * 内容：全部版本列表（发布日期倒序，最新版带 isLatest 标记）、最新版本
 * 约束：统一响应 { success, code, message, data }；只读接口，无需登录
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import {
  iGM_GetLatestLauncherReleaseService,
  iGM_ListLauncherReleasesService,
} from "../iGM_Services/iGM_LauncherReleaseService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 全部版本（含历史） ---------- */
async function iGM_HandleList() {
  return iGM_Ok(await iGM_ListLauncherReleasesService());
}

/* ---------- 最新版本 ---------- */
async function iGM_HandleLatest() {
  return iGM_Ok({ release: await iGM_GetLatestLauncherReleaseService() });
}

/**
 * G_LauncherRelease 启动器发布历史路由集合
 */
export const G_LauncherRelease = new Elysia({ name: "G_LauncherRelease" })
  .get("/G_LauncherRelease/list", iGM_HandleList as never)
  .get("/G_LauncherRelease/latest", iGM_HandleLatest as never);

// 导出 //
export default G_LauncherRelease;