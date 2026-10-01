/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Instance/iGM_Launcher_InstanceIcons.ts
 * 所属层：前端 / 实例模块共享层
 * 路由：G_Instances、G_Instances_Edit、G_Home（最近实例）
 * 模块：iGM_Launcher_InstanceIcons
 * 作用：把共享层的实例图标标识映射为 lucide 图标组件
 * 内容：实例卡片、实例编辑页图标选择器与首页最近实例共用同一份映射，
 *       禁止 emoji 与装饰符号，全部使用 lucide-react
 */

// 导入依赖 //
import {
  Box,
  Compass,
  Flame,
  Folder,
  Gem,
  Leaf,
  Pickaxe,
  Sword,
  type LucideIcon,
} from "lucide-react";
import type { iGM_Launcher_InstanceIconId } from "@igm-launcher/shared";

// 类型定义 //
/* （映射键取自共享层 iGM_Launcher_InstanceIconId） */

// 核心逻辑 //
export const IGM_LAUNCHER_INSTANCE_ICON_MAP: Record<
  iGM_Launcher_InstanceIconId,
  LucideIcon
> = {
  folder: Folder,
  cube: Box,
  pickaxe: Pickaxe,
  sword: Sword,
  leaf: Leaf,
  flame: Flame,
  gem: Gem,
  compass: Compass,
};

/** 读取图标组件，未知标识回退为 folder */
export function iGM_Launcher_InstanceIcon(
  iconId: iGM_Launcher_InstanceIconId,
): LucideIcon {
  return IGM_LAUNCHER_INSTANCE_ICON_MAP[iconId] ?? Folder;
}

// 导出 //
export default IGM_LAUNCHER_INSTANCE_ICON_MAP;