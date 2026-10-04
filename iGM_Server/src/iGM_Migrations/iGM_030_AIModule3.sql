-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_030_AIModule3.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_AI、G_Admin
-- 模块：iGM_Migrations / AI 赋能系统模块三（双模型架构 + UPR/SPR 双额度体系）
-- 作用：UQ 额度重命名为 UPR（通用额度），新增 SPR（付费额度）余额与流水
-- 内容：
--   1) iGM_Users：iGM_UqBalance 重命名为 iGM_UprBalance，默认值 5 → 10
--      （新用户注册免费赠送 10 UPR；存量用户余额原样保留，仅改名不丢数据）；
--   2) iGM_Users：新增 iGM_SprBalance（numeric，默认 0，仅充值获取）；
--   3) iGM_UQTransactions 重命名为 iGM_UPRTransactions（含索引同步改名）；
--   4) 新建 iGM_SPRTransactions：SPR 变动流水（recharge / chat_question / chat_answer）；
-- 说明：
--   - RENAME 保留历史数据与索引；表名与列名统一 iGM_ 前缀；迁移仅执行一次；
--   - 管理后台双通道统计分别聚合 UPR / SPR 两张流水表，不额外建汇总表。

-- ===== UPR：用户余额列改名 + 注册赠送默认值提升至 10 =====
ALTER TABLE iGM_Users RENAME COLUMN iGM_UqBalance TO iGM_UprBalance;
ALTER TABLE iGM_Users ALTER COLUMN iGM_UprBalance SET DEFAULT 10;

-- ===== SPR：新增付费余额列（仅充值获取，默认 0） =====
ALTER TABLE iGM_Users ADD COLUMN iGM_SprBalance NUMERIC(14,4) NOT NULL DEFAULT 0;

-- ===== UPR 流水表改名（保留全部历史流水与索引） =====
ALTER TABLE iGM_UQTransactions RENAME TO iGM_UPRTransactions;
ALTER INDEX iGM_Idx_UQTransactions_User RENAME TO iGM_Idx_UPRTransactions_User;
ALTER INDEX iGM_Idx_UQTransactions_Type RENAME TO iGM_Idx_UPRTransactions_Type;

-- ===== SPR 变动流水 =====
-- iGM_Type：recharge 充值 / chat_question 提问扣费 / chat_answer 回答按 token 扣费
-- iGM_Amount：变动值，正数为增加、负数为消耗；iGM_BalanceAfter：变动后余额
CREATE TABLE IF NOT EXISTS iGM_SPRTransactions (
  iGM_Id           TEXT PRIMARY KEY,
  iGM_UserId       TEXT NOT NULL,
  iGM_Type         TEXT NOT NULL,
  iGM_Amount       NUMERIC(14,4) NOT NULL,
  iGM_BalanceAfter NUMERIC(14,4) NOT NULL,
  iGM_Detail       TEXT NOT NULL DEFAULT '',
  iGM_CreatedAt    TEXT NOT NULL
);

-- 按用户查流水：时间倒序
CREATE INDEX IF NOT EXISTS iGM_Idx_SPRTransactions_User
  ON iGM_SPRTransactions (iGM_UserId, iGM_CreatedAt DESC);

-- 管理后台按类型 + 时间聚合（SPR 通道统计）
CREATE INDEX IF NOT EXISTS iGM_Idx_SPRTransactions_Type
  ON iGM_SPRTransactions (iGM_Type, iGM_CreatedAt);