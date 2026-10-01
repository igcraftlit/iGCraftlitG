/**
 * 文件路径：iGM_Server/src/iGM_Database/iGM_PgDialect.ts
 * 所属层：后端 / 数据访问层
 * 路由：全局
 * 模块：iGM_Database
 * 作用：把历史 SQLite 方言 SQL 转换为 PostgreSQL 方言 SQL
 * 内容：SQL 词法扫描（跳过字符串字面量、注释、已加引号的标识符）、
 *       iGM_ 前缀标识符加双引号、? 占位符按出现顺序转换为 $1..$n
 * 说明：PostgreSQL 会把未加引号的标识符强制折叠为小写，而本项目表名与列名
 *       统一为 iGM_Xxxxx 形式，必须加双引号才能保持大小写；否则 SELECT *
 *       返回的字段名会变成 igm_xxxx，业务层按 iGM_Id 读取将全部取到 undefined
 */

// 类型定义 //
// （本文件仅导出转换函数，无对外类型）

// 核心逻辑 //
/** 判断字符是否可构成标识符（字母、数字、下划线、美元符） */
function iGM_IsIdentifierChar(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_" ||
    ch === "$"
  );
}

/**
 * SQLite 方言 → PostgreSQL 方言的最小转换
 * 1. 所有 iGM_ 开头的标识符加双引号（表名、列名、别名、索引名、约束名）
 * 2. ? 占位符按出现顺序替换为 $1、$2……
 * 字符串字面量与注释内部的内容原样保留，不参与上述变换
 */
export function iGM_ToPgSql(sql: string): string {
  const out: string[] = [];
  let index = 0;
  let paramIndex = 0;

  while (index < sql.length) {
    const ch = sql[index];

    // 单引号字符串：'' 为内部转义，整体原样复制
    if (ch === "'") {
      const start = index;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'") {
          if (sql[index + 1] === "'") {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      out.push(sql.slice(start, index));
      continue;
    }

    // 双引号标识符："" 为内部转义，整体原样复制（避免重复加引号）
    if (ch === '"') {
      const start = index;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === '"') {
          if (sql[index + 1] === '"') {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      out.push(sql.slice(start, index));
      continue;
    }

    // 行注释：复制到行尾
    if (ch === "-" && sql[index + 1] === "-") {
      const start = index;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      out.push(sql.slice(start, index));
      continue;
    }

    // 块注释：复制到 */ 结束
    if (ch === "/" && sql[index + 1] === "*") {
      const start = index;
      index += 2;
      while (
        index < sql.length &&
        !(sql[index] === "*" && sql[index + 1] === "/")
      ) {
        index += 1;
      }
      index = Math.min(index + 2, sql.length);
      out.push(sql.slice(start, index));
      continue;
    }

    // 占位符：? → $n（顺序与参数数组一致）
    if (ch === "?") {
      paramIndex += 1;
      out.push(`$${paramIndex}`);
      index += 1;
      continue;
    }

    // 标识符：iGM_ 前缀加双引号，其余原样保留
    if (iGM_IsIdentifierChar(ch)) {
      const start = index;
      while (index < sql.length && iGM_IsIdentifierChar(sql[index])) index += 1;
      const token = sql.slice(start, index);
      out.push(token.startsWith("iGM_") ? `"${token}"` : token);
      continue;
    }

    out.push(ch);
    index += 1;
  }

  return out.join("");
}

// 导出 //
export default iGM_ToPgSql;
