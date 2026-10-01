/**
 * 文件路径：iGM_Server/src/iGM_Database/iGM_Database.ts
 * 所属层：后端 / 数据访问层
 * 路由：全局
 * 模块：iGM_Database
 * 作用：PostgreSQL 连接池、数据访问出口、启动时自动执行迁移
 * 内容：连接池单例、iGM_Db（query / prepare / run / transaction）、事务上下文、
 *       迁移记录表读写、迁移文件扫描执行
 * 说明：数据访问出口沿用历史调用形态（query().get/.all、run、transaction），
 *       但 PostgreSQL 驱动为异步，故全部返回 Promise，调用方必须 await；
 *       事务通过 AsyncLocalStorage 绑定连接，事务体内对 iGM_Db 的调用
 *       复用同一连接，保证原子性
 */

// 导入依赖 //
import { Pool, types, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_ToPgSql } from "./iGM_PgDialect";

// 类型定义 //
/** 写操作结果：changes 对应受影响行数 */
export interface iGM_QueryResult {
  changes: number;
}

/** 预编译语句形态：与 iGM_Db.query 返回结构一致 */
export interface iGM_Statement {
  get: (...params: unknown[]) => Promise<any>;
  all: (...params: unknown[]) => Promise<any[]>;
  run: (...params: unknown[]) => Promise<iGM_QueryResult>;
}

// 核心逻辑 //
/**
 * int8（COUNT(*)、SUM(integer) 的返回类型）默认被驱动解析为字符串，
 * 会导致业务层拿到 "7" 而不是 7；本项目不存在超过 2^53 的整数，统一解析为 number
 */
types.setTypeParser(20, (value: string) => Number(value));

/** 连接池：懒连接，数据库未启动时不会在模块导入阶段抛错 */
export const iGM_Pool = new Pool({
  connectionString: iGM_Config.databaseUrl,
  max: Number(process.env.IGM_PG_POOL_MAX ?? 10),
});

/** 事务上下文：事务体内复用同一连接 */
const iGM_TxStore = new AsyncLocalStorage<PoolClient>();

/** 把 undefined 归一为 NULL（驱动不接受 undefined 参数） */
function iGM_NormalizeParams(params: unknown[]): any[] {
  return params.map((param) => (param === undefined ? null : param));
}

/** 执行单条 SQL：优先使用当前事务连接，否则走连接池 */
async function iGM_Execute(
  sql: string,
  params: unknown[],
): Promise<{ rows: any[]; changes: number }> {
  const text = iGM_ToPgSql(sql);
  const values = iGM_NormalizeParams(params);
  const client = iGM_TxStore.getStore();
  const result =
    values.length > 0
      ? client
        ? await client.query(text, values)
        : await iGM_Pool.query(text, values)
      : client
        ? await client.query(text)
        : await iGM_Pool.query(text);
  return { rows: result.rows, changes: result.rowCount ?? 0 };
}

/** 构造语句对象（query 与 prepare 共用） */
function iGM_CreateStatement(sql: string): iGM_Statement {
  return {
    get: async (...params: unknown[]): Promise<any> => {
      const { rows } = await iGM_Execute(sql, params);
      return rows[0];
    },
    all: async (...params: unknown[]): Promise<any[]> => {
      const { rows } = await iGM_Execute(sql, params);
      return rows;
    },
    run: async (...params: unknown[]): Promise<iGM_QueryResult> => {
      const { changes } = await iGM_Execute(sql, params);
      return { changes };
    },
  };
}

/** 数据访问出口单例 */
export const iGM_Db = {
  query: (sql: string): iGM_Statement => iGM_CreateStatement(sql),
  prepare: (sql: string): iGM_Statement => iGM_CreateStatement(sql),
  run: (sql: string, params: unknown[] = []): Promise<iGM_QueryResult> =>
    iGM_CreateStatement(sql).run(...params),
  /**
   * 事务包装：返回可调用的异步函数，调用后开启事务。
   * 事务体内对 iGM_Db 的任意调用都会复用同一连接
   */
  transaction:
    <T>(fn: (...args: any[]) => Promise<T> | T) =>
    async (...args: any[]): Promise<T> => {
      const client = await iGM_Pool.connect();
      try {
        await client.query("BEGIN");
        const result = await iGM_TxStore.run(client, async () => fn(...args));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // 回滚失败不覆盖原始异常
        }
        throw error;
      } finally {
        client.release();
      }
    },
};

/** 读取已执行迁移名称集合 */
async function iGM_GetAppliedMigrations(): Promise<Set<string>> {
  await iGM_Db.run(
    `CREATE TABLE IF NOT EXISTS iGM_SchemaMigrations (
       iGM_Name TEXT PRIMARY KEY,
       iGM_ExecutedAt TEXT NOT NULL
     )`,
  );
  const rows = (await iGM_Db
    .query(`SELECT iGM_Name FROM iGM_SchemaMigrations ORDER BY iGM_Name`)
    .all()) as { iGM_Name: string }[];
  return new Set(rows.map((row) => row.iGM_Name));
}

/**
 * 执行所有未应用的迁移，返回本次新执行的迁移文件名列表。
 * 迁移文件为纯 DDL/DML，统一经方言转换后按简单查询协议整段执行，
 * 每个文件独立事务，失败即回滚并抛出，不记录迁移名
 */
export async function iGM_RunMigrations(): Promise<string[]> {
  const applied = await iGM_GetAppliedMigrations();
  const migrationsDir = resolve(import.meta.dir, "../iGM_Migrations");
  if (!existsSync(migrationsDir)) return [];

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const executed: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await Bun.file(join(migrationsDir, file)).text();
    const client = await iGM_Pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(iGM_ToPgSql(sql));
      await client.query(
        iGM_ToPgSql(
          `INSERT INTO iGM_SchemaMigrations (iGM_Name, iGM_ExecutedAt) VALUES (?, ?)`,
        ),
        [file, new Date().toISOString()],
      );
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // 回滚失败不覆盖原始异常
      }
      throw new Error(
        `[iGM_Database] 迁移执行失败：${file}：${String(error)}`,
      );
    } finally {
      client.release();
    }
    executed.push(file);
    console.log(`[iGM_Database] 迁移已执行：${file}`);
  }
  return executed;
}

// 导出 //
export default iGM_Db;
