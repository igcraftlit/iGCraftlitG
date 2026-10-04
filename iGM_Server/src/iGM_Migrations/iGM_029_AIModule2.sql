-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_029_AIModule2.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_AI、G_Admin
-- 模块：iGM_Migrations / AI 赋能系统模块二（提示词限制 + SSE 流式 + UQ 额度系统）
-- 作用：新增 UQ 额度体系——用户余额字段与 UQ 变动流水表
-- 内容：
--   1) iGM_Users 新增 iGM_UqBalance（numeric，默认 5：新用户注册免费赠送 5 UQ，
--      存量用户随列默认值一并补足）；
--   2) iGM_UQTransactions：UQ 变动流水（register / chat_question / chat_answer / recharge），
--      同时记录变动后余额，全部变动可追溯；
-- 说明：
--   - 表名与列名统一 iGM_ 前缀；迁移仅执行一次；
--   - 管理后台 AI 调用统计直接聚合本表，不额外建汇总表。

-- ===== 用户 UQ 余额 =====
ALTER TABLE iGM_Users ADD COLUMN iGM_UqBalance NUMERIC(14,4) NOT NULL DEFAULT 5;

-- ===== UQ 变动流水 =====
-- iGM_Type：register 注册赠送 / chat_question 提问扣费 / chat_answer 回答按 token 扣费 / recharge 充值
-- iGM_Amount：变动值，正数为增加、负数为消耗；iGM_BalanceAfter：变动后余额
CREATE TABLE IF NOT EXISTS iGM_UQTransactions (
  iGM_Id           TEXT PRIMARY KEY,
  iGM_UserId       TEXT NOT NULL,
  iGM_Type         TEXT NOT NULL,
  iGM_Amount       NUMERIC(14,4) NOT NULL,
  iGM_BalanceAfter NUMERIC(14,4) NOT NULL,
  iGM_Detail       TEXT NOT NULL DEFAULT '',
  iGM_CreatedAt    TEXT NOT NULL
);

-- 按用户查流水：时间倒序
CREATE INDEX IF NOT EXISTS iGM_Idx_UQTransactions_User
  ON iGM_UQTransactions (iGM_UserId, iGM_CreatedAt DESC);

-- 管理后台按类型 + 时间聚合（AI 调用统计）
CREATE INDEX IF NOT EXISTS iGM_Idx_UQTransactions_Type
  ON iGM_UQTransactions (iGM_Type, iGM_CreatedAt);