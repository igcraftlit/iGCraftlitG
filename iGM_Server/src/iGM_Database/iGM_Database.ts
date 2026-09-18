/**
 * 文件路径：iGM_Server/src/iGM_Database/iGM_Database.ts
 * 所属层：后端 / 数据访问层
 * 路由：全局
 * 模块：iGM_Database
 * 作用：使用 bun:sqlite 打开本地原生 SQLite 文件并自动执行迁移
 * 内容：数据库单例、迁移记录表读写、迁移文件扫描执行
 */

// 导入依赖 //
import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";

// 类型定义 //
interface iGM_MigrationRow {
  iGM_Name: string;
  iGM_ExecutedAt: string;
}

// 核心逻辑 //
/**
 * 打开（必要时创建）本地 SQLite 数据库文件
 * 数据库文件禁止提交 Git，已在 .gitignore 中排除
 */
function iGM_OpenDatabase(): Database {
  const dbPath = resolve(iGM_Config.databasePath);
  if (!existsSync(dirname(dbPath))) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  return new Database(dbPath, { create: true });
}

/** 共享数据库单例 */
export const iGM_Db = iGM_OpenDatabase();

/** 读取已执行迁移名称集合 */
function iGM_GetAppliedMigrations(db: Database): Set<string> {
  db.run(
    `CREATE TABLE IF NOT EXISTS iGM_SchemaMigrations (
       iGM_Name TEXT PRIMARY KEY,
       iGM_ExecutedAt TEXT NOT NULL
     )`,
  );
  const rows = db
    .query(`SELECT iGM_Name FROM iGM_SchemaMigrations ORDER BY iGM_Name`)
    .all() as iGM_MigrationRow[];
  return new Set(rows.map((row) => row.iGM_Name));
}

/** 执行所有未应用的迁移，返回本次新执行的迁移文件名列表 */
export async function iGM_RunMigrations(
  db: Database = iGM_Db,
): Promise<string[]> {
  const applied = iGM_GetAppliedMigrations(db);
  const migrationsDir = resolve(import.meta.dir, "../iGM_Migrations");
  if (!existsSync(migrationsDir)) return [];

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const executed: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await Bun.file(join(migrationsDir, file)).text();
    const runMigration = db.transaction(() => {
      db.run(sql);
      db.run(
        `INSERT INTO iGM_SchemaMigrations (iGM_Name, iGM_ExecutedAt) VALUES (?, ?)`,
        [file, new Date().toISOString()],
      );
    });
    runMigration();
    executed.push(file);
    console.log(`[iGM_Database] 迁移已执行：${file}`);
  }
  return executed;
}

// 导出 //
export default iGM_Db;
