/**
 * 文件路径：scripts/iGM_DbMigrate.ts
 * 所属层：仓库脚本层 / 数据迁移
 * 路由：无
 * 模块：iGM_DbMigrate
 * 作用：把旧 SQLite 库（D:/IGWEB/database/igcraftlit.sqlite）中全部 iGM_ 表的数据
 *       迁移到 PostgreSQL（Docker 中的 igcraftlit 库）
 * 内容：参数解析（--resume）、旧库备份、目标表清空、外键依赖拓扑排序、
 *       分批插入（默认每批 500 行）、逐表行数校验、孤儿外键统计、
 *       序列重置、日志与迁移报告
 * 说明：
 *   - 本脚本只搬数据不改结构，表结构由后端 iGM_RunMigrations 的迁移文件负责
 *   - 插入顺序由外键依赖拓扑排序决定，并在同优先级下按 字典表 → 用户表 → 业务表 排列
 *   - 旧库未开启外键强制，存量数据存在指向已删除用户的孤儿行；
 *     为保证「逐表行数与旧库完全一致」，导入期间在专用连接上临时关闭外键检查
 *     （session_replication_role = replica），导入结束后恢复并单独统计孤儿明细
 *   - 任一张表行数校验不一致立即中止；已完成的表记录在状态文件，可用 --resume 续传
 *   - 运行方式（工作目录 D:/IGWEB）：
 *       bun run scripts/iGM_DbMigrate.ts
 *       bun run scripts/iGM_DbMigrate.ts --resume
 */

// 导入依赖 //
import { Database } from "bun:sqlite";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { iGM_Pool } from "../iGM_Server/src/iGM_Database/iGM_Database";
import { iGM_ToPgSql } from "../iGM_Server/src/iGM_Database/iGM_PgDialect";

// 类型定义 //
/** 单表迁移结果 */
interface iGM_TableResult {
  /** 表名 */
  table: string;
  /** 旧库行数 */
  source: number;
  /** 新库行数 */
  target: number;
  /** 耗时（毫秒） */
  ms: number;
}

/** 断点续传状态 */
interface iGM_MigrateState {
  /** 本次迁移开始时间 */
  startedAt: string;
  /** 旧库备份文件路径 */
  backupPath: string;
  /** 已完成迁移的表名 */
  completed: string[];
  /** 已完成的各表结果 */
  results: iGM_TableResult[];
}

/** 外键约束描述 */
interface iGM_ForeignKey {
  /** 子表 */
  table: string;
  /** 子表列 */
  from: string;
  /** 父表 */
  toTable: string;
  /** 父表列 */
  to: string;
}

// 核心逻辑 //
/** 旧 SQLite 库路径 */
const iGM_SqlitePath = resolve(import.meta.dir, "../database/igcraftlit.sqlite");
/** 备份目录 */
const iGM_BackupDir = resolve(import.meta.dir, "../database/backup");
/** 日志目录 */
const iGM_LogDir = resolve(import.meta.dir, "logs");
/** 日志文件 */
const iGM_LogPath = join(iGM_LogDir, "db_migrate.log");
/** 断点续传状态文件 */
const iGM_StatePath = join(iGM_LogDir, "db_migrate.state.json");
/** 每批插入行数上限 */
const iGM_BatchSize = 500;
/** 单条 SQL 的参数数量上限（PostgreSQL 协议上限 65535，留出余量） */
const iGM_MaxParams = 60000;
/** 不参与数据迁移的表（旧库迁移记录，不搬到新库） */
const iGM_SkipTables = new Set<string>(["iGM_SchemaMigrations"]);

/** 字典表：无业务归属的参考数据，优先迁移 */
const iGM_DictionaryTables = new Set<string>([
  "iGM_Categories",
  "iGM_Tags",
  "iGM_Levels",
  "iGM_Badges",
  "iGM_Tasks",
  "iGM_UIDSequence",
  "iGM_ModLoaders",
  "iGM_ResourceCategories",
  "iGM_ResourceTags",
  "iGM_Organizations",
  "iGM_MinecraftVersions",
  "iGM_ThirdPartyResources",
]);

/** 用户表：账号与其直接附属数据 */
const iGM_UserTables = new Set<string>([
  "iGM_Users",
  "iGM_Sessions",
  "iGM_Tokens",
  "iGM_UserAgreements",
  "iGM_UserPreferences",
  "iGM_UserPoints",
  "iGM_UserBadges",
  "iGM_UserTasks",
  "iGM_Checkins",
  "iGM_PointsRecords",
  "iGM_NotificationPreferences",
  "iGM_MessageSettings",
  "iGM_OnlineUsers",
]);

/** 迁移顺序优先级：数值越小越先迁移 */
function iGM_TableRank(table: string): number {
  if (iGM_DictionaryTables.has(table)) return 0;
  if (iGM_UserTables.has(table)) return 1;
  return 2;
}

/** 表名 / 列名统一加双引号（PostgreSQL 保留 iGM_ 大小写） */
function iGM_Quote(name: string): string {
  return `"${name}"`;
}

/** 简单日志：同时输出到控制台与日志文件 */
function iGM_Log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  appendFileSync(iGM_LogPath, `${line}\n`, "utf8");
}

/** 专用连接：全流程复用同一条连接，保证 session_replication_role 生效 */
let iGM_Client: import("pg").PoolClient;

/** 在新库执行一条 SQL（统一经方言转换：? → $n、iGM_ 标识符加引号） */
async function iGM_Query(
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: any[]; changes: number }> {
  const text = iGM_ToPgSql(sql);
  const result =
    params.length > 0
      ? await iGM_Client.query(text, params)
      : await iGM_Client.query(text);
  return { rows: result.rows, changes: result.rowCount ?? 0 };
}

/** 读取旧库中全部 iGM_ 表 */
function iGM_ReadSqliteTables(sqlite: Database): string[] {
  return (
    sqlite
      .query(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name LIKE 'iGM_%'
          ORDER BY name`,
      )
      .all() as { name: string }[]
  )
    .map((row) => row.name)
    .filter((name) => !iGM_SkipTables.has(name));
}

/** 读取旧库某表的列名（按声明顺序） */
function iGM_SqliteColumns(sqlite: Database, table: string): string[] {
  return (
    sqlite.query(`PRAGMA table_info(${iGM_Quote(table)})`).all() as { name: string }[]
  ).map((row) => row.name);
}

/** 读取旧库某表的外键依赖（被引用的表） */
function iGM_SqliteDependencies(sqlite: Database, table: string): string[] {
  return (
    sqlite.query(`PRAGMA foreign_key_list(${iGM_Quote(table)})`).all() as {
      table: string;
    }[]
  ).map((row) => row.table);
}

/** 读取旧库全部外键约束（用于孤儿统计） */
function iGM_SqliteForeignKeys(sqlite: Database, tables: string[]): iGM_ForeignKey[] {
  const keys: iGM_ForeignKey[] = [];
  for (const table of tables) {
    const rows = sqlite.query(`PRAGMA foreign_key_list(${iGM_Quote(table)})`).all() as {
      table: string;
      from: string;
      to: string;
    }[];
    for (const row of rows) {
      if (!tables.includes(row.table)) continue;
      keys.push({ table, from: row.from, toTable: row.table, to: row.to });
    }
  }
  return keys;
}

/** 读取新库全部表与列类型 */
async function iGM_ReadPgColumns(): Promise<Map<string, Map<string, string>>> {
  const { rows } = await iGM_Query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  );

  const map = new Map<string, Map<string, string>>();
  for (const row of rows as {
    table_name: string;
    column_name: string;
    data_type: string;
  }[]) {
    const columns = map.get(row.table_name) ?? new Map<string, string>();
    columns.set(row.column_name, row.data_type.toUpperCase());
    map.set(row.table_name, columns);
  }
  return map;
}

/**
 * 计算迁移顺序：先按外键依赖拓扑排序，再在同批可选集合中
 * 按 字典表 → 用户表 → 业务表、同优先级按表名排序
 */
function iGM_SortTables(
  tables: string[],
  deps: Map<string, string[]>,
): { order: string[]; cycle: string[] } {
  const inList = new Set(tables);
  const dependents = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const table of tables) {
    // 自引用外键（如评论的父评论）不参与排序，否则会被误判为环
    const parents = [
      ...new Set(
        (deps.get(table) ?? []).filter((dep) => inList.has(dep) && dep !== table),
      ),
    ];
    inDegree.set(table, parents.length);
    for (const parent of parents) {
      const list = dependents.get(parent) ?? [];
      list.push(table);
      dependents.set(parent, list);
    }
  }

  const order: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((table) => (inDegree.get(table) ?? 0) === 0)
      .sort((a, b) => iGM_TableRank(a) - iGM_TableRank(b) || a.localeCompare(b));
    if (ready.length === 0) break;
    const pick = ready[0];
    order.push(pick);
    remaining.delete(pick);
    for (const child of dependents.get(pick) ?? []) {
      inDegree.set(child, (inDegree.get(child) ?? 0) - 1);
    }
  }

  return { order, cycle: [...remaining].sort() };
}

/** 按目标列类型把 SQLite 值转换为 PostgreSQL 可接受的值 */
function iGM_Coerce(value: unknown, pgType: string): unknown {
  if (value === null || value === undefined) return null;
  if (pgType === "INTEGER" || pgType === "BIGINT" || pgType === "SMALLINT") {
    return typeof value === "number" ? Math.trunc(value) : Number(value);
  }
  if (pgType === "DOUBLE PRECISION" || pgType === "REAL" || pgType === "NUMERIC") {
    return typeof value === "number" ? value : Number(value);
  }
  if (pgType === "BOOLEAN") {
    return value === 1 || value === true || value === "1";
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
  return String(value);
}

/** 读取状态文件 */
function iGM_LoadState(): iGM_MigrateState | null {
  if (!existsSync(iGM_StatePath)) return null;
  try {
    return JSON.parse(readFileSync(iGM_StatePath, "utf8")) as iGM_MigrateState;
  } catch {
    return null;
  }
}

/** 写入状态文件 */
function iGM_SaveState(state: iGM_MigrateState): void {
  writeFileSync(iGM_StatePath, JSON.stringify(state, null, 2), "utf8");
}

/** 迁移单张表：分批插入并校验行数 */
async function iGM_MigrateTable(
  sqlite: Database,
  table: string,
  columns: string[],
  pgTypes: Map<string, string>,
): Promise<iGM_TableResult> {
  const startedAt = Date.now();
  const selectList = columns.map(iGM_Quote).join(", ");
  const rows = sqlite
    .query(`SELECT ${selectList} FROM ${iGM_Quote(table)}`)
    .all() as Record<string, unknown>[];

  const batchSize = Math.max(
    1,
    Math.min(iGM_BatchSize, Math.floor(iGM_MaxParams / Math.max(columns.length, 1))),
  );
  const insertPrefix = `INSERT INTO ${iGM_Quote(table)} (${selectList}) VALUES `;

  if (rows.length > 0) {
    await iGM_Client.query("BEGIN");
    try {
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        const values: unknown[] = [];
        const tuples: string[] = [];
        for (const row of batch) {
          tuples.push(`(${columns.map(() => "?").join(", ")})`);
          for (const column of columns) {
            values.push(iGM_Coerce(row[column], pgTypes.get(column) ?? "TEXT"));
          }
        }
        await iGM_Query(`${insertPrefix}${tuples.join(", ")}`, values);
      }
      await iGM_Client.query("COMMIT");
    } catch (error) {
      await iGM_Client.query("ROLLBACK");
      throw error;
    }
  }

  const counted = await iGM_Query(
    `SELECT COUNT(*) AS iGM_Count FROM ${iGM_Quote(table)}`,
  );

  return {
    table,
    source: rows.length,
    target: Number(counted.rows[0]?.iGM_Count ?? 0),
    ms: Date.now() - startedAt,
  };
}

/** 统计新库中因旧库历史原因残留的孤儿外键行 */
async function iGM_CountOrphans(keys: iGM_ForeignKey[]): Promise<number> {
  let total = 0;
  for (const key of keys) {
    const { rows } = await iGM_Query(
      `SELECT COUNT(*) AS iGM_Count
         FROM ${iGM_Quote(key.table)} AS a
        WHERE a.${iGM_Quote(key.from)} IS NOT NULL
          AND NOT EXISTS (
                SELECT 1 FROM ${iGM_Quote(key.toTable)} AS b
                 WHERE b.${iGM_Quote(key.to)} = a.${iGM_Quote(key.from)}
              )`,
    );
    const count = Number(rows[0]?.iGM_Count ?? 0);
    if (count > 0) {
      iGM_Log(
        `  [孤儿] ${key.table}.${key.from} -> ${key.toTable}.${key.to}：${count} 行`,
      );
      total += count;
    }
  }
  return total;
}

/** 重置所有 serial / IDENTITY 列的自增序列到当前最大 ID */
async function iGM_ResetSequences(): Promise<number> {
  const { rows } = await iGM_Query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (column_default LIKE 'nextval(%' OR is_identity = 'YES')
      ORDER BY table_name, column_name`,
  );

  for (const row of rows as { table_name: string; column_name: string }[]) {
    await iGM_Query(
      `SELECT setval(pg_get_serial_sequence(?, ?),
                     COALESCE((SELECT MAX(${iGM_Quote(row.column_name)})
                                 FROM ${iGM_Quote(row.table_name)}), 1))`,
      [row.table_name, row.column_name],
    );
  }
  return rows.length;
}

/** 备份旧 SQLite 库 */
function iGM_BackupSqlite(): string {
  mkdirSync(iGM_BackupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(iGM_BackupDir, `igcraftlit.sqlite.${stamp}.bak`);
  copyFileSync(iGM_SqlitePath, target);
  return target;
}

/** 主流程 */
async function iGM_Main(): Promise<void> {
  const resume = process.argv.includes("--resume");
  mkdirSync(iGM_LogDir, { recursive: true });

  if (!existsSync(iGM_SqlitePath)) {
    throw new Error(`旧库文件不存在：${iGM_SqlitePath}`);
  }

  iGM_Log("==================== 数据迁移开始 ====================");
  iGM_Log(`旧库：${iGM_SqlitePath}`);
  iGM_Log(`模式：${resume ? "断点续传（--resume）" : "全量迁移"}`);

  iGM_Client = await iGM_Pool.connect();

  try {
    // 旧库未开启外键强制，存量数据含指向已删除用户的孤儿行；
    // 为保持行数完全一致，导入期间临时关闭外键检查，结束后恢复
    await iGM_Client.query("SET session_replication_role = replica");

    const sqlite = new Database(iGM_SqlitePath, { readonly: true });
    const pgColumns = await iGM_ReadPgColumns();

    const sqliteTables = iGM_ReadSqliteTables(sqlite);
    const missing = sqliteTables.filter((table) => !pgColumns.has(table));
    if (missing.length > 0) {
      iGM_Log(`[警告] 以下表在新库中不存在，已跳过：${missing.join(", ")}`);
    }

    const dependencies = new Map<string, string[]>();
    for (const table of sqliteTables) {
      dependencies.set(table, iGM_SqliteDependencies(sqlite, table));
    }

    const { order, cycle } = iGM_SortTables(sqliteTables, dependencies);
    if (cycle.length > 0) {
      throw new Error(`外键依赖存在环，无法确定迁移顺序：${cycle.join(", ")}`);
    }
    iGM_Log(`待迁移表：${order.length} 张`);

    const state: iGM_MigrateState = resume
      ? (iGM_LoadState() ?? {
          startedAt: new Date().toISOString(),
          backupPath: "(未记录)",
          completed: [],
          results: [],
        })
      : {
          startedAt: new Date().toISOString(),
          backupPath: "",
          completed: [],
          results: [],
        };

    if (!resume) {
      state.backupPath = iGM_BackupSqlite();
      iGM_Log(`旧库已备份至：${state.backupPath}`);
      iGM_SaveState(state);

      await iGM_Query(
        `TRUNCATE TABLE ${order.map(iGM_Quote).join(", ")} RESTART IDENTITY CASCADE`,
      );
      iGM_Log(`已清空目标表：${order.length} 张`);
    } else {
      iGM_Log(`已完成的表：${state.completed.length} 张，续传剩余部分`);
    }

    for (const table of order) {
      if (state.completed.includes(table)) continue;

      const columns = iGM_SqliteColumns(sqlite, table).filter((column) =>
        pgColumns.get(table)?.has(column),
      );
      if (columns.length === 0) {
        iGM_Log(`[警告] 表 ${table} 在目标库中没有匹配列，已跳过`);
        state.completed.push(table);
        iGM_SaveState(state);
        continue;
      }

      const result = await iGM_MigrateTable(
        sqlite,
        table,
        columns,
        pgColumns.get(table) ?? new Map<string, string>(),
      );

      if (result.source !== result.target) {
        iGM_Log(
          `[错误] 行数校验不一致：${table} 旧库 ${result.source} 行 / 新库 ${result.target} 行`,
        );
        iGM_Log("已中止迁移，请排查后使用 --resume 续传");
        sqlite.close();
        throw new Error(`行数校验不一致：${table}`);
      }

      state.completed.push(table);
      state.results.push(result);
      iGM_SaveState(state);
      iGM_Log(`迁移完成：${table} ${result.source} 行，用时 ${result.ms} 毫秒`);
    }

    const orphanKeys = iGM_SqliteForeignKeys(sqlite, sqliteTables);
    sqlite.close();

    await iGM_Client.query("SET session_replication_role = origin");

    const sequenceCount = await iGM_ResetSequences();
    iGM_Log(
      sequenceCount > 0
        ? `已重置 ${sequenceCount} 个自增序列`
        : "目标库无 serial / IDENTITY 列，跳过序列重置",
    );

    // 迁移报告 //
    const totalMs = Date.now() - new Date(state.startedAt).getTime();
    const totalRows = state.results.reduce((sum, item) => sum + item.source, 0);
    iGM_Log("-------------------- 迁移结果报告 --------------------");
    iGM_Log(
      `表数量：${state.results.length}，总行数：${totalRows}，总耗时：${totalMs} 毫秒`,
    );
    for (const item of state.results) {
      iGM_Log(
        `  ${item.table}\t旧库 ${item.source}\t新库 ${item.target}\t${item.ms} 毫秒`,
      );
    }
    iGM_Log("旧库历史原因残留的孤儿外键行（已按原样保留）：");
    const orphanCount = await iGM_CountOrphans(orphanKeys);
    iGM_Log(`  孤儿外键行合计：${orphanCount} 行`);
    iGM_Log("==================== 数据迁移结束 ====================");
  } finally {
    iGM_Client.release();
    await iGM_Pool.end();
  }
}

await iGM_Main();
