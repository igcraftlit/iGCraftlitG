/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_IssuerPresetRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Examiner（/G_Examiner/presets）
 * 模块：iGM_IssuerPresetRepository
 * 作用：iGM_IssuerPresets 命题方预设表的唯一数据访问出口
 * 内容：预设增删改查、按可见范围（公开或本人）列出、按创建者列出
 * 说明：预设默认全站可见，其他命题创作者上传试卷时可直接选用；
 *       关键词用于把试卷命题方文本自动归档到对应预设
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type { iGM_IssuerPresetRow } from "../iGM_Types/iGM_Examiner";

// 核心逻辑 //
/** 新建命题方预设 */
export async function iGM_InsertIssuerPreset(input: {
  name: string;
  keywords: string;
  creatorId: string;
  isPublic: boolean;
}): Promise<iGM_IssuerPresetRow> {
  const now = new Date().toISOString();
  const row: iGM_IssuerPresetRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_Name: input.name,
    iGM_Keywords: input.keywords,
    iGM_CreatorId: input.creatorId,
    iGM_IsPublic: input.isPublic,
    iGM_CreatedAt: now,
    iGM_UpdatedAt: now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_IssuerPresets
       (iGM_Id, iGM_Name, iGM_Keywords, iGM_CreatorId, iGM_IsPublic,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_Name,
      row.iGM_Keywords,
      row.iGM_CreatorId,
      row.iGM_IsPublic,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 按 ID 读取预设 */
export async function iGM_FindIssuerPresetById(
  presetId: string,
): Promise<iGM_IssuerPresetRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_IssuerPresets WHERE iGM_Id = ?`)
      .get(presetId)) as iGM_IssuerPresetRow | undefined) ?? null
  );
}

/** 列出对指定用户可见的预设（公开的或本人创建的），创建时间倒序 */
export async function iGM_ListIssuerPresetsVisibleTo(
  userId: string | null,
): Promise<iGM_IssuerPresetRow[]> {
  if (!userId) {
    return (await iGM_Db
      .query(
        `SELECT * FROM iGM_IssuerPresets
          WHERE iGM_IsPublic = ?
          ORDER BY iGM_CreatedAt DESC, iGM_Id DESC`,
      )
      .all(true)) as iGM_IssuerPresetRow[];
  }
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_IssuerPresets
        WHERE iGM_IsPublic = ? OR iGM_CreatorId = ?
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC`,
    )
    .all(true, userId)) as iGM_IssuerPresetRow[];
}

/** 列出全部预设（管理端概览） */
export async function iGM_ListAllIssuerPresets(): Promise<iGM_IssuerPresetRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_IssuerPresets
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC`,
    )
    .all()) as iGM_IssuerPresetRow[];
}

/** 更新预设（名称 / 关键词 / 可见性） */
export async function iGM_UpdateIssuerPreset(
  presetId: string,
  input: { name: string; keywords: string; isPublic: boolean },
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_IssuerPresets SET
       iGM_Name = ?, iGM_Keywords = ?, iGM_IsPublic = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [input.name, input.keywords, input.isPublic, new Date().toISOString(), presetId],
  );
}

/** 删除预设 */
export async function iGM_DeleteIssuerPreset(presetId: string): Promise<void> {
  await iGM_Db.run(`DELETE FROM iGM_IssuerPresets WHERE iGM_Id = ?`, [presetId]);
}

// 导出 //
export default {
  iGM_InsertIssuerPreset,
  iGM_FindIssuerPresetById,
  iGM_ListIssuerPresetsVisibleTo,
  iGM_ListAllIssuerPresets,
  iGM_UpdateIssuerPreset,
  iGM_DeleteIssuerPreset,
};
