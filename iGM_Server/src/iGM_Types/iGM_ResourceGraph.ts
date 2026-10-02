/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_ResourceGraph.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Resource
 * 模块：iGM_ResourceGraph
 * 作用：定义资源中心树状关系图的节点、边与查询入参
 * 内容：关系类型枚举、节点/边/图数据 DTO、关系行类型
 */

// 导入依赖 //
// （本文件仅包含类型与常量，无运行时依赖）

// 类型定义 //
/** 关系类型：compatible 兼容 / dependency 依赖 / derived 衍生 */
export type iGM_ResourceRelationType = "compatible" | "dependency" | "derived";

/** 资源关系行 */
export interface iGM_ResourceRelationRow {
  iGM_Id: string;
  iGM_FromResourceId: string;
  iGM_ToResourceId: string;
  iGM_RelationType: string;
  iGM_Source: string;
  iGM_CreatedAt: string;
}

/** 图节点类型：version Minecraft 版本 / resource 资源库资源 */
export type iGM_ResourceGraphNodeKind = "version" | "resource";

/** 图节点 */
export interface iGM_ResourceGraphNode {
  id: string;
  kind: iGM_ResourceGraphNodeKind;
  /** 展示名称：版本号为版本字符串，资源为标题 */
  label: string;
  /** 版本节点：版本类型（release / snapshot / old_beta / old_alpha） */
  versionType?: string;
  /** 资源节点：资源类型（mod / texture_pack / modpack 等） */
  resourceType?: string;
  /** 资源节点：下载数 */
  downloadCount?: number;
  /** 距中心节点的跳数（0 为中心） */
  ring: number;
  /** 是否为中心节点 */
  center: boolean;
}

/** 图边 */
export interface iGM_ResourceGraphEdge {
  from: string;
  to: string;
  relation: iGM_ResourceRelationType;
}

/** 图数据 */
export interface iGM_ResourceGraphData {
  centerId: string;
  centerKind: iGM_ResourceGraphNodeKind;
  nodes: iGM_ResourceGraphNode[];
  edges: iGM_ResourceGraphEdge[];
}

// 核心逻辑 //
/** 允许的关系类型 */
export const iGM_ResourceRelationTypes: iGM_ResourceRelationType[] = [
  "compatible",
  "dependency",
  "derived",
];

/** 判断未知字符串是否为合法关系类型 */
export function iGM_IsResourceRelationType(
  value: unknown,
): value is iGM_ResourceRelationType {
  return (
    typeof value === "string" &&
    iGM_ResourceRelationTypes.includes(value as iGM_ResourceRelationType)
  );
}

/**
 * 计算版本号所属「版本族」：取前两段数字（如 1.20.1 -> 1.20）。
 * 段数不足两段时返回原串；用于同族版本互为兼容的规则推导。
 */
export function iGM_ResolveVersionFamily(version: string): string {
  const parts = version.split(".");
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}

// 导出 //
export default {
  iGM_ResourceRelationTypes,
  iGM_IsResourceRelationType,
  iGM_ResolveVersionFamily,
};