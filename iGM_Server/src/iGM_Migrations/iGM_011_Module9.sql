-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_011_Module9.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Realtime / G_Stats
-- 作用：模块九——实时通信与在线状态、数据统计与运营看板建表
-- 内容：在线用户连接表 iGM_OnlineUsers、每日聚合统计表 iGM_StatsDaily、
--       聚合快照表 iGM_StatsSnapshots，及常用查询索引
-- 说明：所有表名与列名统一 iGM_ 前缀；在线用户随用户删除级联清理；
--       迁移按文件名记录执行历史，仅会执行一次

-- ===== 在线用户连接表：一条记录对应一条活跃 WebSocket 连接 =====
-- 同一用户可多端同时在线（多条记录）；心跳超时由服务端清扫删除
CREATE TABLE IF NOT EXISTS iGM_OnlineUsers (
  iGM_Id            TEXT PRIMARY KEY,
  iGM_UserId        TEXT NOT NULL,
  iGM_ConnectionId  TEXT NOT NULL UNIQUE,
  iGM_ConnectedAt   TEXT NOT NULL,
  iGM_LastHeartbeat TEXT NOT NULL,
  iGM_IpAddress     TEXT,
  iGM_UserAgent     TEXT,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- 在线列表按用户聚合；心跳清扫按时间过滤
CREATE INDEX IF NOT EXISTS iGM_Idx_OnlineUsers_User
  ON iGM_OnlineUsers (iGM_UserId);
CREATE INDEX IF NOT EXISTS iGM_Idx_OnlineUsers_Heartbeat
  ON iGM_OnlineUsers (iGM_LastHeartbeat);

-- ===== 每日聚合统计表：一行对应一个自然日（Asia/Shanghai 日界） =====
-- 由统计服务惰性聚合写入，趋势图优先读取本表以减少实时聚合压力
CREATE TABLE IF NOT EXISTS iGM_StatsDaily (
  iGM_Id               TEXT PRIMARY KEY,
  iGM_Date             TEXT NOT NULL UNIQUE,
  iGM_NewUsers         INTEGER NOT NULL DEFAULT 0,
  iGM_ActiveUsers      INTEGER NOT NULL DEFAULT 0,
  iGM_PostsCount       INTEGER NOT NULL DEFAULT 0,
  iGM_CommentsCount    INTEGER NOT NULL DEFAULT 0,
  iGM_LikesCount       INTEGER NOT NULL DEFAULT 0,
  iGM_ResourcesCount   INTEGER NOT NULL DEFAULT 0,
  iGM_ActivitiesCount  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS iGM_Idx_StatsDaily_Date
  ON iGM_StatsDaily (iGM_Date);

-- ===== 聚合快照表：按指标与周期存储聚合结果，便于快速查询 =====
-- iGM_Metric 如 overview / trend.users / leaderboard.posts；
-- iGM_Period 如 7d / 30d / 90d / daily；iGM_Value 存 JSON 字符串
CREATE TABLE IF NOT EXISTS iGM_StatsSnapshots (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_Metric    TEXT NOT NULL,
  iGM_Value     TEXT NOT NULL,
  iGM_Period    TEXT NOT NULL,
  iGM_CreatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_StatsSnapshots_Metric_Period
  ON iGM_StatsSnapshots (iGM_Metric, iGM_Period);
