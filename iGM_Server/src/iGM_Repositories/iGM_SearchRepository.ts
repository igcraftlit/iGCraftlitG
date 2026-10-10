/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_SearchRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Search
 * 模块：iGM_SearchRepository
 * 作用：全站搜索的唯一数据访问出口（帖子 / 资源 / 用户 / 组织）
 * 内容：四类实体的关键词匹配候选查询与命中计数，
 *       统一按相关度（标题精确 / 前缀 / 包含 / 正文或标签命中递减）排序，
 *       支持 LIMIT/OFFSET 内存窗口分页
 * 说明：
 *   - 仅检索公开可见数据：帖子与资源限 published、用户限 active；
 *   - 中文无空格，使用 ILIKE 子串匹配；LIKE 通配符已转义并配合 ESCAPE '\'，
 *     防止用户输入扩大匹配范围；三元组索引见迁移 iGM_040_Search.sql；
 *   - 占位符统一为 ?，由 iGM_Db 的方言层转换为 $1..$n，绑定顺序与 SQL 中出现顺序一致
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type {
  iGM_SearchOrgRow,
  iGM_SearchPostRow,
  iGM_SearchResourceRow,
  iGM_SearchUserRow,
} from "../iGM_Types/iGM_Search";

// 类型定义 //
/** 关键词匹配模式集合 */
export interface iGM_SearchPatterns {
  /** 原始关键词（用于 UID 精确比较与 lower(...) 等值比较） */
  keyword: string;
  /** 前缀模式：kw% */
  prefix: string;
  /** 包含模式：%kw% */
  contains: string;
}

/** 单类实体查询结果 */
export interface iGM_SearchEntityResult<TRow> {
  items: TRow[];
  total: number;
}

/** 单类实体的分页查询参数 */
export interface iGM_SearchEntityParams {
  patterns: iGM_SearchPatterns;
  limit: number;
  offset: number;
}

// 核心逻辑 //
/** 转义 ILIKE 通配符，配合 ESCAPE '\' 防止用户输入扩大匹配范围 */
function iGM_EscapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 由原始关键词构造三种匹配模式 */
export function iGM_BuildSearchPatterns(keyword: string): iGM_SearchPatterns {
  const escaped = iGM_EscapeLike(keyword);
  return {
    keyword,
    prefix: `${escaped}%`,
    contains: `%${escaped}%`,
  };
}

/* ---------- 帖子 ---------- */
const iGM_PostsSelect = `
  SELECT p.iGM_Id AS iGM_Id, p.iGM_Title AS iGM_Title,
         p.iGM_Content AS iGM_Content, p.iGM_CreatedAt AS iGM_CreatedAt,
         (CASE
            WHEN lower(p.iGM_Title) = lower(?) THEN 40
            WHEN p.iGM_Title ILIKE ? ESCAPE '\\' THEN 30
            WHEN p.iGM_Title ILIKE ? ESCAPE '\\' THEN 20
            WHEN p.iGM_Content ILIKE ? ESCAPE '\\' THEN 10
            ELSE 0
          END) AS iGM_Rank
    FROM iGM_Posts p
   WHERE p.iGM_Status = 'published'
     AND (p.iGM_Title ILIKE ? ESCAPE '\\' OR p.iGM_Content ILIKE ? ESCAPE '\\')`;

/** 搜索帖子（标题或正文命中），按相关度与时间倒序 */
export async function iGM_SearchPosts(
  params: iGM_SearchEntityParams,
): Promise<iGM_SearchEntityResult<iGM_SearchPostRow>> {
  const { keyword, prefix, contains } = params.patterns;
  const items = (await iGM_Db
    .query(
      `${iGM_PostsSelect}
       ORDER BY iGM_Rank DESC, p.iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(
      keyword,
      prefix,
      contains,
      contains,
      contains,
      contains,
      params.limit,
      params.offset,
    )) as iGM_SearchPostRow[];

  const totalRow = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Posts p
        WHERE p.iGM_Status = 'published'
          AND (p.iGM_Title ILIKE ? ESCAPE '\\' OR p.iGM_Content ILIKE ? ESCAPE '\\')`,
    )
    .get(contains, contains)) as { iGM_Count: number };

  return { items, total: totalRow.iGM_Count };
}

/* ---------- 资源 ---------- */
const iGM_ResourcesSelect = `
  SELECT r.iGM_Id AS iGM_Id, r.iGM_Title AS iGM_Title,
         r.iGM_Description AS iGM_Description, r.iGM_CreatedAt AS iGM_CreatedAt,
         (CASE
            WHEN lower(r.iGM_Title) = lower(?) THEN 40
            WHEN r.iGM_Title ILIKE ? ESCAPE '\\' THEN 30
            WHEN r.iGM_Title ILIKE ? ESCAPE '\\' THEN 20
            WHEN r.iGM_Description ILIKE ? ESCAPE '\\' THEN 10
            ELSE 0
          END) AS iGM_Rank
    FROM iGM_Resources r
   WHERE r.iGM_Status = 'published'
     AND (
       r.iGM_Title ILIKE ? ESCAPE '\\'
       OR r.iGM_Description ILIKE ? ESCAPE '\\'
       OR EXISTS (
         SELECT 1 FROM iGM_ResourceTagsMap m
           JOIN iGM_ResourceTags t ON t.iGM_Id = m.iGM_TagId
          WHERE m.iGM_ResourceId = r.iGM_Id AND t.iGM_Name ILIKE ? ESCAPE '\\'
       )
     )`;

/** 搜索资源（名称/描述/标签命中），按相关度与时间倒序 */
export async function iGM_SearchResources(
  params: iGM_SearchEntityParams,
): Promise<iGM_SearchEntityResult<iGM_SearchResourceRow>> {
  const { keyword, prefix, contains } = params.patterns;
  const items = (await iGM_Db
    .query(
      `${iGM_ResourcesSelect}
       ORDER BY iGM_Rank DESC, r.iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(
      keyword,
      prefix,
      contains,
      contains,
      contains,
      contains,
      contains,
      params.limit,
      params.offset,
    )) as iGM_SearchResourceRow[];

  const totalRow = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Resources r
        WHERE r.iGM_Status = 'published'
          AND (
            r.iGM_Title ILIKE ? ESCAPE '\\'
            OR r.iGM_Description ILIKE ? ESCAPE '\\'
            OR EXISTS (
              SELECT 1 FROM iGM_ResourceTagsMap m
                JOIN iGM_ResourceTags t ON t.iGM_Id = m.iGM_TagId
               WHERE m.iGM_ResourceId = r.iGM_Id AND t.iGM_Name ILIKE ? ESCAPE '\\'
            )
          )`,
    )
    .get(contains, contains, contains)) as { iGM_Count: number };

  return { items, total: totalRow.iGM_Count };
}

/* ---------- 用户 ---------- */
const iGM_UsersSelect = `
  SELECT u.iGM_Id AS iGM_Id, u.iGM_Uid AS iGM_Uid,
         u.iGM_Username AS iGM_Username, u.iGM_DisplayName AS iGM_DisplayName,
         u.iGM_Avatar AS iGM_Avatar, u.iGM_Bio AS iGM_Bio,
         u.iGM_CreatedAt AS iGM_CreatedAt,
         (CASE
            WHEN u.iGM_Uid = ? THEN 50
            WHEN lower(u.iGM_Username) = lower(?) THEN 40
            WHEN u.iGM_Username ILIKE ? ESCAPE '\\' THEN 30
            WHEN u.iGM_DisplayName ILIKE ? ESCAPE '\\' THEN 25
            WHEN u.iGM_Username ILIKE ? ESCAPE '\\' THEN 20
            ELSE 5
          END) AS iGM_Rank
    FROM iGM_Users u
   WHERE u.iGM_Status = 'active'
     AND (u.iGM_Uid = ? OR u.iGM_Username ILIKE ? ESCAPE '\\'
          OR u.iGM_DisplayName ILIKE ? ESCAPE '\\' OR u.iGM_Bio ILIKE ? ESCAPE '\\')`;

/** 搜索用户（UID 精确、用户名/昵称/简介命中），按相关度与注册时间倒序 */
export async function iGM_SearchUsers(
  params: iGM_SearchEntityParams,
): Promise<iGM_SearchEntityResult<iGM_SearchUserRow>> {
  const { keyword, prefix, contains } = params.patterns;
  const items = (await iGM_Db
    .query(
      `${iGM_UsersSelect}
       ORDER BY iGM_Rank DESC, u.iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(
      keyword,
      keyword,
      prefix,
      contains,
      contains,
      keyword,
      contains,
      contains,
      contains,
      params.limit,
      params.offset,
    )) as iGM_SearchUserRow[];

  const totalRow = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Users u
        WHERE u.iGM_Status = 'active'
          AND (u.iGM_Uid = ? OR u.iGM_Username ILIKE ? ESCAPE '\\'
               OR u.iGM_DisplayName ILIKE ? ESCAPE '\\' OR u.iGM_Bio ILIKE ? ESCAPE '\\')`,
    )
    .get(keyword, contains, contains, contains)) as { iGM_Count: number };

  return { items, total: totalRow.iGM_Count };
}

/* ---------- 组织 ---------- */
const iGM_OrgsSelect = `
  SELECT o.iGM_Id AS iGM_Id, o.iGM_Name AS iGM_Name, o.iGM_Slug AS iGM_Slug,
         o.iGM_Description AS iGM_Description, o.iGM_Logo AS iGM_Logo,
         o.iGM_CreatedAt AS iGM_CreatedAt,
         (CASE
            WHEN lower(o.iGM_Name) = lower(?) THEN 40
            WHEN o.iGM_Name ILIKE ? ESCAPE '\\' THEN 30
            WHEN o.iGM_Name ILIKE ? ESCAPE '\\' THEN 20
            WHEN o.iGM_Description ILIKE ? ESCAPE '\\' THEN 10
            ELSE 0
          END) AS iGM_Rank
    FROM iGM_Organizations o
   WHERE (o.iGM_Name ILIKE ? ESCAPE '\\' OR o.iGM_Description ILIKE ? ESCAPE '\\')`;

/** 搜索组织（名称/描述命中），按相关度与创建时间倒序 */
export async function iGM_SearchOrgs(
  params: iGM_SearchEntityParams,
): Promise<iGM_SearchEntityResult<iGM_SearchOrgRow>> {
  const { keyword, prefix, contains } = params.patterns;
  const items = (await iGM_Db
    .query(
      `${iGM_OrgsSelect}
       ORDER BY iGM_Rank DESC, o.iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(
      keyword,
      prefix,
      contains,
      contains,
      contains,
      contains,
      params.limit,
      params.offset,
    )) as iGM_SearchOrgRow[];

  const totalRow = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Organizations o
        WHERE (o.iGM_Name ILIKE ? ESCAPE '\\' OR o.iGM_Description ILIKE ? ESCAPE '\\')`,
    )
    .get(contains, contains)) as { iGM_Count: number };

  return { items, total: totalRow.iGM_Count };
}

// 导出 //
export default {
  iGM_BuildSearchPatterns,
  iGM_SearchPosts,
  iGM_SearchResources,
  iGM_SearchUsers,
  iGM_SearchOrgs,
};
