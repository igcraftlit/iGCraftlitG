-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_027_ReportReasonDetail.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_Post、G_Admin
-- 模块：iGM_Migrations / 社交生态优化（帖子举报表单）
-- 作用：举报表支持「原因分类 + 原因描述」两段式提交，并防止重复待处理举报
-- 内容：
--   1) iGM_Reports 增加 iGM_ReasonDetail：用户填写的原因描述（5-500 字）；
--      既有 iGM_Reason 收敛为原因分类码（spam/abuse/porn/illegal/plagiarism/other），
--      历史行保留原值，由展示层对未知分类码兜底为 other；
--   2) 部分唯一索引：同一举报人对同一目标只允许一条 pending 举报，
--      举报处理（resolved/dismissed）后可再次提交。
-- 说明：仅幂等追加列与索引，不删除历史数据；列名统一 iGM_ 前缀。

-- ===== 举报原因描述列 =====
ALTER TABLE iGM_Reports
  ADD COLUMN IF NOT EXISTS iGM_ReasonDetail TEXT NOT NULL DEFAULT '';

-- ===== 待处理举报防重（同举报人 + 同目标仅一条 pending） =====
CREATE UNIQUE INDEX IF NOT EXISTS iGM_Idx_Reports_PendingUnique
  ON iGM_Reports (iGM_ReporterId, iGM_TargetType, iGM_TargetId)
  WHERE iGM_Status = 'pending';
