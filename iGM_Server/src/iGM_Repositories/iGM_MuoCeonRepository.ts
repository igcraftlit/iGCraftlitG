/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_MuoCeonRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_MuoCeon
 * 模块：iGM_MuoCeonRepository
 * 作用：MuoCeon 身份绑定表 iGM_MuoCeonBindings 的唯一数据访问出口
 * 内容：按 MuoCeon 用户标识（sub）查询绑定、按本地用户 ID 查询绑定、写入绑定
 * 说明：绑定为「本地账号 ↔ MuoCeon 身份」一对一；两列均有唯一约束，
 *       并发写入冲突由数据库唯一约束兜底，由业务层捕获后改为读取既有绑定
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";

// 类型定义 //
/** MuoCeon 绑定行 */
export interface iGM_MuoCeonBindingRow {
  iGM_Id: string;
  /** 本地用户主键（iGM_Users.iGM_Id） */
  iGM_UserId: string;
  /** MuoCeon 侧用户标识（userinfo.sub） */
  iGM_Sub: string;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

// 核心逻辑 //
/** 按 MuoCeon sub 查询绑定 */
export async function iGM_FindMuoCeonBindingBySub(
  sub: string,
): Promise<iGM_MuoCeonBindingRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_MuoCeonBindings WHERE iGM_Sub = ?`)
      .get(sub)) as iGM_MuoCeonBindingRow | undefined) ?? null
  );
}

/** 按本地用户 ID 查询绑定（用于判断账号是否已绑定 MuoCeon） */
export async function iGM_FindMuoCeonBindingByUserId(
  userId: string,
): Promise<iGM_MuoCeonBindingRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_MuoCeonBindings WHERE iGM_UserId = ?`)
      .get(userId)) as iGM_MuoCeonBindingRow | undefined) ?? null
  );
}

/** 写入一条 MuoCeon 绑定（冲突时抛出，由调用方转为读取既有绑定） */
export async function iGM_CreateMuoCeonBinding(params: {
  id: string;
  userId: string;
  sub: string;
  now: string;
}): Promise<iGM_MuoCeonBindingRow> {
  await iGM_Db.run(
    `INSERT INTO iGM_MuoCeonBindings
       (iGM_Id, iGM_UserId, iGM_Sub, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [params.id, params.userId, params.sub, params.now, params.now],
  );
  const row = await iGM_FindMuoCeonBindingBySub(params.sub);
  if (!row) throw new Error("iGM_CreateMuoCeonBinding：写入后查询失败");
  return row;
}

// 导出 //
export default {
  iGM_FindMuoCeonBindingBySub,
  iGM_FindMuoCeonBindingByUserId,
  iGM_CreateMuoCeonBinding,
};
