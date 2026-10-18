/**
 * 文件路径：apps/launcher-ui/lib/iGM_LauncherV2_SkinsData.ts
 * 所属层：前端 / 数据层
 * 路由：G_Main（皮肤库页签）
 * 模块：iGM_LauncherV2_SkinsData
 * 作用：皮肤库内置数据集（100 款皮肤）的类型化出口
 * 内容：皮肤条目本体存放在同目录的 iGM_LauncherV2_SkinsData.json（100 条，字段为
 *       id / name / author / downloads / type / skinUrl），本文件只做类型断言与再导出，
 *       保证界面侧按强类型读取，同时数据本体保持为纯 JSON 便于单独维护
 * 说明：纹理地址统一取自 Minotar 免密钥端点 https://minotar.net/skin/{name}；
 *       界面按下载量排序取「精选」前 50 款，按名称 A-Z 排序取「全部」
 */

// 导入依赖 //
import type { iGM_LauncherV2_SkinsDatum } from "./iGM_LauncherV2_Constants";
import iGM_LauncherV2_SkinsDataJson from "./iGM_LauncherV2_SkinsData.json";

// 核心逻辑 //

/** 内置皮肤数据集（100 款，来自同目录 JSON 数据文件） */
export const IGM_LAUNCHERV2_SKINS_DATA: iGM_LauncherV2_SkinsDatum[] =
  iGM_LauncherV2_SkinsDataJson as iGM_LauncherV2_SkinsDatum[];

// 导出 //
export default IGM_LAUNCHERV2_SKINS_DATA;
