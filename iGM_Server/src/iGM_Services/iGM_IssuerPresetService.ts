/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_IssuerPresetService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Examiner（/G_Examiner/presets）、G_Exam（上传时归档调用）
 * 模块：iGM_IssuerPresetService
 * 作用：命题方预设的增删改查与关键词归档解析
 * 内容：可见预设列表、创建 / 编辑 / 删除（含归属校验与命名校验）、
 *       依据命题方文本解析并命中预设 ID（精确名称优先，其次关键词包含）
 * 说明：预设默认全站可见；未被公开的预设仅创建者本人可见；
 *       关键词归档用于把试卷自动归入对应预设，便于目录按预设筛选
 */

// 导入依赖 //
import {
  iGM_DeleteIssuerPreset,
  iGM_FindIssuerPresetById,
  iGM_InsertIssuerPreset,
  iGM_ListIssuerPresetsVisibleTo,
  iGM_UpdateIssuerPreset,
} from "../iGM_Repositories/iGM_IssuerPresetRepository";
import { iGM_ExaminerError } from "./iGM_ExaminerService";
import {
  iGM_CommitExamStaticFiles,
  iGM_RebuildExamStaticIndex,
} from "./iGM_ExamStaticService";
import {
  iGM_ExaminerMaxPresetName,
  iGM_JoinCommaList,
  iGM_SplitCommaList,
  type iGM_IssuerPresetDto,
  type iGM_IssuerPresetInput,
  type iGM_IssuerPresetRow,
} from "../iGM_Types/iGM_Examiner";

// 核心逻辑 //
/** 数据行 → 预设 DTO */
function iGM_ToPresetDto(
  row: iGM_IssuerPresetRow,
  currentUserId: string | null,
): iGM_IssuerPresetDto {
  return {
    id: row.iGM_Id,
    name: row.iGM_Name,
    keywords: iGM_SplitCommaList(row.iGM_Keywords),
    creatorId: row.iGM_CreatorId,
    isPublic: row.iGM_IsPublic,
    mine: currentUserId !== null && row.iGM_CreatorId === currentUserId,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/**
 * 预设变更后重建命题方筛选索引并推送
 * 失败仅告警，不阻断预设增删改本身
 */
async function iGM_ExportIndexAfterPresetChange(): Promise<void> {
  try {
    await iGM_RebuildExamStaticIndex();
    await iGM_CommitExamStaticFiles();
  } catch (error) {
    console.warn(
      `[iGM_IssuerPresetService] 预设变更后重建静态索引失败：${String(error)}`,
    );
  }
}

/** 校验预设入参，非法时抛 422 */
function iGM_AssertPresetInput(input: iGM_IssuerPresetInput): {
  name: string;
  keywords: string;
} {
  const name = input.name.trim();
  if (!name) {
    throw new iGM_ExaminerError("请填写命题方名称", 422);
  }
  if (name.length > iGM_ExaminerMaxPresetName) {
    throw new iGM_ExaminerError("命题方名称过长", 422);
  }
  const keywords = iGM_JoinCommaList(input.keywords);
  return { name, keywords };
}

/** 列出对当前用户可见的预设（未登录仅公开预设） */
export async function iGM_ListIssuerPresetsService(
  userId: string | null,
): Promise<iGM_IssuerPresetDto[]> {
  const rows = await iGM_ListIssuerPresetsVisibleTo(userId);
  return rows.map((row) => iGM_ToPresetDto(row, userId));
}

/** 创建命题方预设 */
export async function iGM_CreateIssuerPresetService(
  userId: string,
  input: iGM_IssuerPresetInput,
): Promise<iGM_IssuerPresetDto> {
  const { name, keywords } = iGM_AssertPresetInput(input);
  const row = await iGM_InsertIssuerPreset({
    name,
    keywords,
    creatorId: userId,
    isPublic: input.isPublic,
  });
  await iGM_ExportIndexAfterPresetChange();
  return iGM_ToPresetDto(row, userId);
}

/** 编辑命题方预设（仅创建者本人） */
export async function iGM_UpdateIssuerPresetService(
  userId: string,
  presetId: string,
  input: iGM_IssuerPresetInput,
): Promise<iGM_IssuerPresetDto> {
  const existing = await iGM_FindIssuerPresetById(presetId);
  if (!existing) throw new iGM_ExaminerError("预设不存在", 404);
  if (existing.iGM_CreatorId !== userId) {
    throw new iGM_ExaminerError("无权修改他人的预设", 403);
  }
  const { name, keywords } = iGM_AssertPresetInput(input);
  await iGM_UpdateIssuerPreset(presetId, {
    name,
    keywords,
    isPublic: input.isPublic,
  });
  await iGM_ExportIndexAfterPresetChange();
  const updated = await iGM_FindIssuerPresetById(presetId);
  return iGM_ToPresetDto(updated ?? existing, userId);
}

/** 删除命题方预设（仅创建者本人） */
export async function iGM_DeleteIssuerPresetService(
  userId: string,
  presetId: string,
): Promise<void> {
  const existing = await iGM_FindIssuerPresetById(presetId);
  if (!existing) throw new iGM_ExaminerError("预设不存在", 404);
  if (existing.iGM_CreatorId !== userId) {
    throw new iGM_ExaminerError("无权删除他人的预设", 403);
  }
  await iGM_DeleteIssuerPreset(presetId);
  await iGM_ExportIndexAfterPresetChange();
}

/**
 * 依据命题方文本解析命中的预设 ID
 * 规则：先精确匹配名称，再按关键词包含匹配；
 *       两类匹配均优先使用当前用户自己的预设。
 * @param presets 已加载的可见预设（避免重复查询）
 */
export function iGM_ResolveIssuerPresetId(
  userId: string | null,
  issuer: string,
  presets: readonly iGM_IssuerPresetRow[],
): string | null {
  const target = issuer.trim().toLowerCase();
  if (!target) return null;
  const own = presets.filter((p) => userId !== null && p.iGM_CreatorId === userId);
  const others = presets.filter((p) => userId === null || p.iGM_CreatorId !== userId);
  const ordered = [...own, ...others];

  const exact = ordered.find((p) => p.iGM_Name.trim().toLowerCase() === target);
  if (exact) return exact.iGM_Id;

  const keywordHit = ordered.find((p) =>
    iGM_SplitCommaList(p.iGM_Keywords).some((keyword) => {
      const k = keyword.toLowerCase();
      return k.length > 0 && target.includes(k);
    }),
  );
  return keywordHit ? keywordHit.iGM_Id : null;
}

/** 加载可见预设原始行（供上传归档复用） */
export async function iGM_LoadVisiblePresetRows(
  userId: string | null,
): Promise<iGM_IssuerPresetRow[]> {
  return await iGM_ListIssuerPresetsVisibleTo(userId);
}

// 导出 //
export default {
  iGM_ListIssuerPresetsService,
  iGM_CreateIssuerPresetService,
  iGM_UpdateIssuerPresetService,
  iGM_DeleteIssuerPresetService,
  iGM_ResolveIssuerPresetId,
  iGM_LoadVisiblePresetRows,
};
