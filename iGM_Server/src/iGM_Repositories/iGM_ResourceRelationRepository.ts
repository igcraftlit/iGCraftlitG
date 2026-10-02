/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_ResourceRelationRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Resource
 * 模块：iGM_ResourceRelationRepository
 * 作用：资源关系表（iGM_ResourceRelations）与关系图节点来源（版本表、资源表）
 *       的唯一数据访问出口
 * 内容：关系全量替换（先删 auto 后插）、按节点集合读取关系、
 *       读取全部版本行与 Minecraft 资源行（关系图节点来源）
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_ResourceGraphNodeKind,
  iGM_ResourceRelationRow,
} from "../iGM_Types/iGM_ResourceGraph";

// 类型定义 //
/** 关系推导后待落库的一条边 */
export interface iGM_ResourceRelationInput {
  fromId: string;
  toId: string;
  relation: string;
}

/** 关系图的版本节点来源行 */
export interface iGM_GraphVersionRow {
  iGM_Id: string;
  iGM_Version: string;
  iGM_Type: string;
  iGM_ReleaseTime: string | null;
}

/** 关系图的资源节点来源行 */
export interface iGM_GraphResourceRow {
  iGM_Id: string;
  iGM_Title: string;
  iGM_ResourceType: string;
  iGM_McVersions: string | null;
  iGM_DownloadCount: number;
}

// 核心逻辑 //
/** 读取全部 Minecraft 版本行（关系图版本节点来源，按发布时间倒序） */
export async function iGM_ListGraphVersionRows(): Promise<iGM_GraphVersionRow[]> {
  return (await iGM_Db
    .query(
      `SELECT iGM_Id, iGM_Version, iGM_Type, iGM_ReleaseTime
         FROM iGM_MinecraftVersions
        ORDER BY iGM_ReleaseTime DESC`,
    )
    .all()) as iGM_GraphVersionRow[];
}

/**
 * 读取 Minecraft 资源行（关系图资源节点来源）。
 * 仅取已发布且带资源类型（属于 Minecraft 分区）的资源，限制 500 条以约束图规模。
 */
export async function iGM_ListGraphResourceRows(): Promise<iGM_GraphResourceRow[]> {
  return (await iGM_Db
    .query(
      `SELECT iGM_Id, iGM_Title, iGM_ResourceType, iGM_McVersions, iGM_DownloadCount
         FROM iGM_Resources
        WHERE iGM_ResourceType IS NOT NULL AND iGM_Status = 'published'
        ORDER BY iGM_CreatedAt DESC
        LIMIT 500`,
    )
    .all()) as iGM_GraphResourceRow[];
}

/** 关系表是否为空（空表时图查询先触发一次重算） */
export async function iGM_CountAutoRelations(): Promise<number> {
  const row = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_ResourceRelations WHERE iGM_Source = 'auto'`,
    )
    .get()) as { iGM_Count: number };
  return Number(row?.iGM_Count ?? 0);
}

/**
 * 全量替换自动推导的关系：先删除全部 source='auto' 的行，再批量插入。
 * 人工维护（manual）的关系不受影响。
 */
export async function iGM_ReplaceAutoRelations(
  relations: iGM_ResourceRelationInput[],
): Promise<number> {
  await iGM_Db.run(`DELETE FROM iGM_ResourceRelations WHERE iGM_Source = 'auto'`);
  const now = new Date().toISOString();
  const insert = iGM_Db.prepare(
    `INSERT INTO iGM_ResourceRelations
       (iGM_Id, iGM_FromResourceId, iGM_ToResourceId, iGM_RelationType, iGM_Source, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, 'auto', ?)
     ON CONFLICT DO NOTHING`,
  );
  let inserted = 0;
  for (const relation of relations) {
    const result = await insert.run(
      iGM_RandomUuid(),
      relation.fromId,
      relation.toId,
      relation.relation,
      now,
    );
    inserted += result.changes;
  }
  return inserted;
}

/** 读取与给定节点集合相关的全部关系边 */
export async function iGM_ListRelationsForNodes(
  nodeIds: string[],
): Promise<iGM_ResourceRelationRow[]> {
  const unique = Array.from(new Set(nodeIds)).filter(Boolean);
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(", ");
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_ResourceRelations
        WHERE iGM_FromResourceId IN (${placeholders})
           OR iGM_ToResourceId IN (${placeholders})`,
    )
    .all(...unique, ...unique)) as iGM_ResourceRelationRow[];
}

/** 按主键查询版本行（图中心节点解析用） */
export async function iGM_FindGraphVersionById(
  id: string,
): Promise<iGM_GraphVersionRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT iGM_Id, iGM_Version, iGM_Type, iGM_ReleaseTime
           FROM iGM_MinecraftVersions WHERE iGM_Id = ?`,
      )
      .get(id)) as iGM_GraphVersionRow | undefined) ?? null
  );
}

/** 按版本号查询版本行（图中心节点解析用） */
export async function iGM_FindGraphVersionByVersion(
  version: string,
): Promise<iGM_GraphVersionRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT iGM_Id, iGM_Version, iGM_Type, iGM_ReleaseTime
           FROM iGM_MinecraftVersions WHERE iGM_Version = ?`,
      )
      .get(version)) as iGM_GraphVersionRow | undefined) ?? null
  );
}

/** 按主键查询资源行（图中心节点解析用） */
export async function iGM_FindGraphResourceById(
  id: string,
): Promise<iGM_GraphResourceRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT iGM_Id, iGM_Title, iGM_ResourceType, iGM_McVersions, iGM_DownloadCount
           FROM iGM_Resources WHERE iGM_Id = ?`,
      )
      .get(id)) as iGM_GraphResourceRow | undefined) ?? null
  );
}

/** 节点类型判定：版本 id 命中版本表即为 version，否则视为 resource */
export async function iGM_ResolveGraphNodeKind(
  id: string,
): Promise<iGM_ResourceGraphNodeKind> {
  const version = await iGM_FindGraphVersionById(id);
  return version ? "version" : "resource";
}

// 导出 //
export default {
  iGM_ListGraphVersionRows,
  iGM_ListGraphResourceRows,
  iGM_CountAutoRelations,
  iGM_ReplaceAutoRelations,
  iGM_ListRelationsForNodes,
  iGM_FindGraphVersionById,
  iGM_FindGraphVersionByVersion,
  iGM_FindGraphResourceById,
  iGM_ResolveGraphNodeKind,
};