/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ResourceRelationService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Resource
 * 模块：iGM_ResourceRelationService
 * 作用：资源中心树状关系图的关系推导与图数据组装
 * 内容：
 *   1) 规则推导并落库（iGM_RebuildResourceRelations）：
 *      - compatible 兼容：同一版本族（主次版本号相同，如 1.20.x）内相邻版本互为兼容；
 *      - derived 衍生：同族内按发布时间升序，后一个版本由前一个版本衍生（older -> newer）；
 *      - dependency 依赖：Minecraft 分区资源依赖其声明的适用版本（resource -> version）。
 *   2) 图查询（iGM_GetResourceGraph）：以版本字符串或资源 id 为中心，
 *      BFS 向外扩散若干跳，返回 nodes（含 ring 远近视距）与 edges。
 * 说明：关系表为空时图查询会先触发一次重算并落库，保证接口首访即可用。
 */

// 导入依赖 //
import {
  iGM_CountAutoRelations,
  iGM_FindGraphResourceById,
  iGM_FindGraphVersionByVersion,
  iGM_ListGraphResourceRows,
  iGM_ListGraphVersionRows,
  iGM_ListRelationsForNodes,
  iGM_ReplaceAutoRelations,
  type iGM_GraphResourceRow,
  type iGM_GraphVersionRow,
  type iGM_ResourceRelationInput,
} from "../iGM_Repositories/iGM_ResourceRelationRepository";
import {
  iGM_IsResourceRelationType,
  iGM_ResolveVersionFamily,
  type iGM_ResourceGraphData,
  type iGM_ResourceGraphEdge,
  type iGM_ResourceGraphNode,
  type iGM_ResourceGraphNodeKind,
  type iGM_ResourceRelationType,
} from "../iGM_Types/iGM_ResourceGraph";

// 类型定义 //
/** 重算结果统计 */
export interface iGM_RelationRebuildResult {
  versions: number;
  resources: number;
  relations: number;
  inserted: number;
}

/** 图查询入参 */
export interface iGM_ResourceGraphQuery {
  /** 中心版本号（与 loader 无关，图上以版本号为节点） */
  version?: string;
  /** 中心资源 id */
  resourceId?: string;
  /** 向外扩散的最大跳数，默认 2，上限 3 */
  depth?: number;
}

/** 同族版本互为兼容的最大邻接数（防止完全图膨胀） */
const IGM_MAX_COMPATIBLE_NEIGHBORS = 3;

// 核心逻辑 //
/** 解析资源行的适用版本数组（iGM_McVersions 为 JSON 数组字符串） */
function iGM_ParseMcVersions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** 按发布时间升序排序（缺失发布时间视为最旧） */
function iGM_SortByReleaseTime(rows: iGM_GraphVersionRow[]): iGM_GraphVersionRow[] {
  return [...rows].sort((a, b) => {
    const at = a.iGM_ReleaseTime ?? "";
    const bt = b.iGM_ReleaseTime ?? "";
    if (at === bt) return a.iGM_Version.localeCompare(b.iGM_Version);
    return at < bt ? -1 : 1;
  });
}

/**
 * 规则推导全部自动关系（不落库，返回边集合）。
 * 供 iGM_RebuildResourceRelations 落库与图查询内联兜底共用。
 */
async function iGM_DeriveRelations(): Promise<{
  relations: iGM_ResourceRelationInput[];
  versions: iGM_GraphVersionRow[];
  resources: iGM_GraphResourceRow[];
}> {
  const [versions, resources] = await Promise.all([
    iGM_ListGraphVersionRows(),
    iGM_ListGraphResourceRows(),
  ]);

  const dedup = new Map<string, iGM_ResourceRelationInput>();
  const push = (
    fromId: string,
    toId: string,
    relation: iGM_ResourceRelationType,
  ): void => {
    if (!fromId || !toId || fromId === toId) return;
    const key = `${fromId}|${toId}|${relation}`;
    if (dedup.has(key)) return;
    dedup.set(key, { fromId, toId, relation });
  };

  /* ---------- 同族版本：兼容 + 衍生 ---------- */
  const familyMap = new Map<string, iGM_GraphVersionRow[]>();
  for (const version of versions) {
    const family = iGM_ResolveVersionFamily(version.iGM_Version);
    const list = familyMap.get(family) ?? [];
    list.push(version);
    familyMap.set(family, list);
  }

  for (const familyRows of familyMap.values()) {
    const ordered = iGM_SortByReleaseTime(familyRows);
    ordered.forEach((current, index) => {
      // 衍生：同族内后一个版本由前一个版本衍生
      if (index > 0) {
        push(ordered[index - 1].iGM_Id, current.iGM_Id, "derived");
      }
      // 兼容：与相邻的至多 N 个版本互为兼容（双向）
      for (let step = 1; step <= IGM_MAX_COMPATIBLE_NEIGHBORS; step += 1) {
        const neighbor = ordered[index + step];
        if (!neighbor) break;
        push(current.iGM_Id, neighbor.iGM_Id, "compatible");
        push(neighbor.iGM_Id, current.iGM_Id, "compatible");
      }
    });
  }

  /* ---------- 资源依赖其适用版本 ---------- */
  const versionByString = new Map<string, iGM_GraphVersionRow>();
  for (const version of versions) versionByString.set(version.iGM_Version, version);
  for (const resource of resources) {
    for (const versionString of iGM_ParseMcVersions(resource.iGM_McVersions)) {
      const target = versionByString.get(versionString);
      if (target) push(resource.iGM_Id, target.iGM_Id, "dependency");
    }
  }

  return { relations: Array.from(dedup.values()), versions, resources };
}

/** 规则推导并落库（db:relations 命令与图查询首访兜底共用） */
export async function iGM_RebuildResourceRelations(): Promise<iGM_RelationRebuildResult> {
  const { relations, versions, resources } = await iGM_DeriveRelations();
  const inserted = await iGM_ReplaceAutoRelations(relations);
  return {
    versions: versions.length,
    resources: resources.length,
    relations: relations.length,
    inserted,
  };
}

/** 懒重建：关系表为空时重算一次，避免图查询首访返回空图 */
async function iGM_EnsureRelations(): Promise<void> {
  const count = await iGM_CountAutoRelations();
  if (count === 0) await iGM_RebuildResourceRelations();
}

/** 解析中心节点 id 与类型 */
async function iGM_ResolveCenter(
  query: iGM_ResourceGraphQuery,
): Promise<{ id: string; kind: iGM_ResourceGraphNodeKind } | null> {
  if (query.resourceId) {
    const resource = await iGM_FindGraphResourceById(query.resourceId);
    if (resource) return { id: resource.iGM_Id, kind: "resource" };
  }
  if (query.version) {
    const version = await iGM_FindGraphVersionByVersion(query.version);
    if (version) return { id: version.iGM_Id, kind: "version" };
  }
  return null;
}

/** 构建节点索引：id -> 展示信息 */
async function iGM_BuildNodeIndex(): Promise<
  Map<string, { kind: iGM_ResourceGraphNodeKind; label: string; versionType?: string; resourceType?: string; downloadCount?: number }>
> {
  const [versions, resources] = await Promise.all([
    iGM_ListGraphVersionRows(),
    iGM_ListGraphResourceRows(),
  ]);
  const index = new Map<
    string,
    { kind: iGM_ResourceGraphNodeKind; label: string; versionType?: string; resourceType?: string; downloadCount?: number }
  >();
  for (const version of versions) {
    index.set(version.iGM_Id, {
      kind: "version",
      label: version.iGM_Version,
      versionType: version.iGM_Type,
    });
  }
  for (const resource of resources) {
    index.set(resource.iGM_Id, {
      kind: "resource",
      label: resource.iGM_Title,
      resourceType: resource.iGM_ResourceType,
      downloadCount: Number(resource.iGM_DownloadCount ?? 0),
    });
  }
  return index;
}

/**
 * 查询关系图：以中心节点为起点 BFS 扩散，返回节点与边。
 * 中心不存在时返回 null，由路由层转换为 404。
 */
export async function iGM_GetResourceGraph(
  query: iGM_ResourceGraphQuery,
): Promise<iGM_ResourceGraphData | null> {
  await iGM_EnsureRelations();
  const center = await iGM_ResolveCenter(query);
  if (!center) return null;

  const maxDepth = Math.max(1, Math.min(3, query.depth ?? 2));

  // BFS：记录每个节点距中心的跳数，并收集相邻边
  const ringById = new Map<string, number>([[center.id, 0]]);
  const edgeMap = new Map<string, iGM_ResourceGraphEdge>();
  let frontier: string[] = [center.id];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const relations = await iGM_ListRelationsForNodes(frontier);
    const nextFrontier: string[] = [];
    for (const relation of relations) {
      if (!iGM_IsResourceRelationType(relation.iGM_RelationType)) continue;
      const edge: iGM_ResourceGraphEdge = {
        from: relation.iGM_FromResourceId,
        to: relation.iGM_ToResourceId,
        relation: relation.iGM_RelationType,
      };
      const key = `${edge.from}|${edge.to}|${edge.relation}`;
      if (!edgeMap.has(key)) edgeMap.set(key, edge);
      for (const nodeId of [edge.from, edge.to]) {
        if (!ringById.has(nodeId)) {
          ringById.set(nodeId, depth);
          nextFrontier.push(nodeId);
        }
      }
    }
    frontier = nextFrontier;
  }

  // 组装节点：索引缺失时按 id 回落查询（资源行可能因限量未进索引）
  const index = await iGM_BuildNodeIndex();
  const nodes: iGM_ResourceGraphNode[] = [];
  for (const [id, ring] of ringById) {
    const info = index.get(id);
    if (info) {
      nodes.push({
        id,
        kind: info.kind,
        label: info.label,
        versionType: info.versionType,
        resourceType: info.resourceType,
        downloadCount: info.downloadCount,
        ring,
        center: id === center.id,
      });
      continue;
    }
    const resource = await iGM_FindGraphResourceById(id);
    if (!resource) continue;
    nodes.push({
      id,
      kind: "resource",
      label: resource.iGM_Title,
      resourceType: resource.iGM_ResourceType,
      downloadCount: Number(resource.iGM_DownloadCount ?? 0),
      ring,
      center: id === center.id,
    });
  }

  nodes.sort((a, b) => {
    if (a.center !== b.center) return a.center ? -1 : 1;
    if (a.ring !== b.ring) return a.ring - b.ring;
    return a.label.localeCompare(b.label);
  });

  // 只保留两端都在节点集合内的边
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.from(edgeMap.values()).filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );

  return { centerId: center.id, centerKind: center.kind, nodes, edges };
}

// 导出 //
export default {
  iGM_RebuildResourceRelations,
  iGM_GetResourceGraph,
};