/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_SearchService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Search
 * 模块：iGM_SearchService
 * 作用：全站聚合搜索编排——四类实体候选拉取、统一 DTO 映射、跨类相关度排序与分页
 * 内容：关键词/类型/分页归一化、单类型精确分页、all 模式并发候选合并排序、
 *       摘要按命中位置裁剪、详情路由组装
 * 说明：
 *   - 单类型：直接在 SQL 层 LIMIT/OFFSET 分页，total 为精确命中数；
 *   - all 模式：各类并发取候选窗口（上限 iGM_SearchCandidateWindow，且不小于
 *     当前页所需条数），合并后按相关度排序再内存分页，total 为各类精确数之和；
 *   - 任一类查询失败不影响其余类别（Promise.allSettled 容错，失败类计 0 条）
 */

// 导入依赖 //
import {
  iGM_BuildSearchPatterns,
  iGM_SearchOrgs,
  iGM_SearchPosts,
  iGM_SearchResources,
  iGM_SearchUsers,
  type iGM_SearchEntityResult,
} from "../iGM_Repositories/iGM_SearchRepository";
import {
  iGM_NormalizeSearchKeyword,
  iGM_NormalizeSearchPage,
  iGM_NormalizeSearchPageSize,
  iGM_NormalizeSearchType,
  iGM_SearchCandidateWindow,
  type iGM_SearchData,
  type iGM_SearchItemDto,
  type iGM_SearchType,
} from "../iGM_Types/iGM_Search";

// 类型定义 //
/** 聚合搜索入参（路由层原样透传查询参数） */
export interface iGM_SearchInput {
  q?: string;
  type?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

/** 合并排序用的中间条目 */
interface iGM_RankedItem {
  item: iGM_SearchItemDto;
  rank: number;
  createdAt: string;
}

// 核心逻辑 //
/** 摘要裁剪长度上限 */
const iGM_ExcerptMax = 140;

/** 压缩空白并按命中位置居中裁剪摘要，两端溢出以省略号标记 */
function iGM_BuildExcerpt(text: string | null, keyword: string): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (!keyword) return normalized.slice(0, iGM_ExcerptMax);

  const idx = normalized.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return normalized.slice(0, iGM_ExcerptMax);

  const half = Math.max(0, Math.floor((iGM_ExcerptMax - keyword.length) / 2));
  const start = Math.max(0, idx - half);
  const end = Math.min(normalized.length, start + iGM_ExcerptMax);
  const head = start > 0 ? "…" : "";
  const tail = end < normalized.length ? "…" : "";
  return `${head}${normalized.slice(start, end)}${tail}`;
}

/** 帖子行 → 统一条目 */
function iGM_MapPost(
  row: iGM_SearchEntityResult<{ iGM_Id: string; iGM_Title: string; iGM_Content: string; iGM_CreatedAt: string; iGM_Rank: number }>["items"][number],
  keyword: string,
): iGM_RankedItem {
  return {
    rank: row.iGM_Rank,
    createdAt: row.iGM_CreatedAt,
    item: {
      type: "post",
      id: row.iGM_Id,
      title: row.iGM_Title,
      excerpt: iGM_BuildExcerpt(row.iGM_Content, keyword),
      avatar: null,
      url: `/G_Post?postId=${encodeURIComponent(row.iGM_Id)}`,
    },
  };
}

/** 资源行 → 统一条目 */
function iGM_MapResource(
  row: {
    iGM_Id: string;
    iGM_Title: string;
    iGM_Description: string;
    iGM_CreatedAt: string;
    iGM_Rank: number;
  },
  keyword: string,
): iGM_RankedItem {
  return {
    rank: row.iGM_Rank,
    createdAt: row.iGM_CreatedAt,
    item: {
      type: "resource",
      id: row.iGM_Id,
      title: row.iGM_Title,
      excerpt: iGM_BuildExcerpt(row.iGM_Description, keyword),
      avatar: null,
      url: `/G_ResourceDetail?resourceId=${encodeURIComponent(row.iGM_Id)}`,
    },
  };
}

/** 用户行 → 统一条目 */
function iGM_MapUser(
  row: {
    iGM_Id: string;
    iGM_Uid: string | null;
    iGM_Username: string;
    iGM_DisplayName: string | null;
    iGM_Avatar: string | null;
    iGM_Bio: string | null;
    iGM_CreatedAt: string;
    iGM_Rank: number;
  },
  keyword: string,
): iGM_RankedItem {
  const bio = iGM_BuildExcerpt(row.iGM_Bio, keyword);
  return {
    rank: row.iGM_Rank,
    createdAt: row.iGM_CreatedAt,
    item: {
      type: "user",
      id: row.iGM_Id,
      title: row.iGM_DisplayName || row.iGM_Username,
      excerpt: bio || (row.iGM_Uid ? `UID ${row.iGM_Uid}` : ""),
      avatar: row.iGM_Avatar,
      url: `/G_User?userId=${encodeURIComponent(row.iGM_Id)}`,
    },
  };
}

/** 组织行 → 统一条目 */
function iGM_MapOrg(
  row: {
    iGM_Id: string;
    iGM_Name: string;
    iGM_Slug: string;
    iGM_Description: string;
    iGM_Logo: string | null;
    iGM_CreatedAt: string;
    iGM_Rank: number;
  },
  keyword: string,
): iGM_RankedItem {
  return {
    rank: row.iGM_Rank,
    createdAt: row.iGM_CreatedAt,
    item: {
      type: "org",
      id: row.iGM_Id,
      title: row.iGM_Name,
      excerpt: iGM_BuildExcerpt(row.iGM_Description, keyword),
      avatar: row.iGM_Logo,
      url: `/G_OrgDetails?orgId=${encodeURIComponent(row.iGM_Id)}`,
    },
  };
}

/** 各类实体的固定拼接顺序（跨类排序的同分次序） */
const iGM_TypeOrder: Record<iGM_SearchType, number> = {
  post: 0,
  resource: 1,
  user: 2,
  org: 3,
};

/** 单类型精确分页：直接下推到 SQL 层 */
async function iGM_SearchSingleType(
  type: iGM_SearchType,
  keyword: string,
  page: number,
  pageSize: number,
): Promise<iGM_SearchData> {
  const patterns = iGM_BuildSearchPatterns(keyword);
  const params = {
    patterns,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  let ranked: iGM_RankedItem[] = [];
  let total = 0;

  if (type === "post") {
    const result = await iGM_SearchPosts(params);
    ranked = result.items.map((row) => iGM_MapPost(row, keyword));
    total = result.total;
  } else if (type === "resource") {
    const result = await iGM_SearchResources(params);
    ranked = result.items.map((row) => iGM_MapResource(row, keyword));
    total = result.total;
  } else if (type === "user") {
    const result = await iGM_SearchUsers(params);
    ranked = result.items.map((row) => iGM_MapUser(row, keyword));
    total = result.total;
  } else {
    const result = await iGM_SearchOrgs(params);
    ranked = result.items.map((row) => iGM_MapOrg(row, keyword));
    total = result.total;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items: ranked.map((entry) => entry.item),
    total,
    page,
    pageSize,
    totalPages,
    type,
    query: keyword,
  };
}

/** 全类型混合：并发取候选窗口，合并排序后内存分页 */
async function iGM_SearchAllTypes(
  keyword: string,
  page: number,
  pageSize: number,
): Promise<iGM_SearchData> {
  const patterns = iGM_BuildSearchPatterns(keyword);
  // 候选窗口需足以覆盖当前页：取 page*pageSize，上限 iGM_SearchCandidateWindow
  const window = Math.min(iGM_SearchCandidateWindow, page * pageSize);
  const params = { patterns, limit: window, offset: 0 };

  const [posts, resources, users, orgs] = await Promise.allSettled([
    iGM_SearchPosts(params),
    iGM_SearchResources(params),
    iGM_SearchUsers(params),
    iGM_SearchOrgs(params),
  ]);

  const merged: iGM_RankedItem[] = [];
  let total = 0;

  if (posts.status === "fulfilled") {
    total += posts.value.total;
    merged.push(...posts.value.items.map((row) => iGM_MapPost(row, keyword)));
  }
  if (resources.status === "fulfilled") {
    total += resources.value.total;
    merged.push(
      ...resources.value.items.map((row) => iGM_MapResource(row, keyword)),
    );
  }
  if (users.status === "fulfilled") {
    total += users.value.total;
    merged.push(...users.value.items.map((row) => iGM_MapUser(row, keyword)));
  }
  if (orgs.status === "fulfilled") {
    total += orgs.value.total;
    merged.push(...orgs.value.items.map((row) => iGM_MapOrg(row, keyword)));
  }

  merged.sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    const typeOrder =
      iGM_TypeOrder[a.item.type] - iGM_TypeOrder[b.item.type];
    if (typeOrder !== 0) return typeOrder;
    return a.item.id < b.item.id ? -1 : 1;
  });

  const start = (page - 1) * pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items: merged.slice(start, start + pageSize).map((entry) => entry.item),
    total,
    page,
    pageSize,
    totalPages,
    type: "all",
    query: keyword,
  };
}

/**
 * 全站聚合搜索入口
 * 关键词为空时直接返回空结果（前端据此展示初始态，不下发数据库查询）
 */
export async function iGM_SearchAllService(
  input: iGM_SearchInput,
): Promise<iGM_SearchData> {
  const keyword = iGM_NormalizeSearchKeyword(input.q);
  const type = iGM_NormalizeSearchType(input.type);
  const page = iGM_NormalizeSearchPage(input.page);
  const pageSize = iGM_NormalizeSearchPageSize(input.pageSize);

  if (!keyword) {
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      totalPages: 1,
      type,
      query: "",
    };
  }

  if (type === "all") {
    return iGM_SearchAllTypes(keyword, page, pageSize);
  }
  return iGM_SearchSingleType(type, keyword, page, pageSize);
}

// 导出 //
export default { iGM_SearchAllService };
