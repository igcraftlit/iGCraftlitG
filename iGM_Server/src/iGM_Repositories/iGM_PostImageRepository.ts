/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_PostImageRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Post（模块十扩展）
 * 模块：iGM_PostImageRepository
 * 作用：帖子配图关联表 iGM_PostImages 的唯一数据访问出口
 * 内容：按帖子读取有序配图、整组替换（创建/编辑帖子事务内调用）
 * 说明：图片排序即数组下标；删除帖子时由外键级联清理
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type { iGM_PostImageRow } from "../iGM_Types/iGM_Community";

// 类型定义 //
// （本仓储无额外入参类型，fileIds 有序字符串数组即排序依据）

// 核心逻辑 //
/** 读取帖子全部配图（按展示顺序升序） */
export async function iGM_ListPostImages(postId: string): Promise<iGM_PostImageRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_PostImages
        WHERE iGM_PostId = ?
        ORDER BY iGM_SortOrder ASC, iGM_Id ASC`,
    )
    .all(postId)) as iGM_PostImageRow[];
}

/** 统计帖子配图数量 */
export async function iGM_CountPostImages(postId: string): Promise<number> {
  return (
    (await iGM_Db
      .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_PostImages WHERE iGM_PostId = ?`)
      .get(postId)) as { iGM_Count: number }
  ).iGM_Count;
}

/**
 * 整组替换帖子配图：先删除全部关联，再按数组下标写入顺序。
 * 去重后保留首次出现的位置；空数组表示清空配图。
 */
export async function iGM_ReplacePostImages(
  postId: string,
  fileIds: string[],
  now: string,
): Promise<void> {
  await iGM_Db.run(`DELETE FROM iGM_PostImages WHERE iGM_PostId = ?`, [postId]);
  const unique: string[] = [];
  for (const fileId of fileIds) {
    const trimmed = fileId?.trim();
    if (trimmed && !unique.includes(trimmed)) unique.push(trimmed);
  }
  if (unique.length === 0) return;
  const insert = iGM_Db.prepare(
    `INSERT INTO iGM_PostImages (iGM_Id, iGM_PostId, iGM_FileId, iGM_SortOrder, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const [index, fileId] of unique.entries()) {
    await insert.run(iGM_RandomUuid(), postId, fileId, index, now);
  }
}

// 导出 //
export default {
  iGM_ListPostImages,
  iGM_CountPostImages,
  iGM_ReplacePostImages,
};
