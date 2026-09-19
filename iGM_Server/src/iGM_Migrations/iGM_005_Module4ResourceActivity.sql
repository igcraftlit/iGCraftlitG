-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_005_Module4ResourceActivity.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_Resource、G_Activity
-- 模块：iGM_Migrations / G_Resource / G_Activity
-- 作用：为资源表补充「关联活动」外键，支撑活动详情页的「活动资源」
--       与资源详情页的「关联活动」两项需求
-- 内容：iGM_Resources 新增可空列 iGM_ActivityId 及活动维度查询索引
-- 说明：列可空，资源不强制归属活动；活动删除时资源保留但解除关联

-- ===== 资源 → 活动 关联列（可空，默认 NULL） =====
ALTER TABLE iGM_Resources ADD COLUMN iGM_ActivityId TEXT
  REFERENCES iGM_Activities (iGM_Id) ON DELETE SET NULL;

-- 活动详情按活动拉取已发布资源
CREATE INDEX IF NOT EXISTS iGM_Idx_Resources_Activity
  ON iGM_Resources (iGM_ActivityId, iGM_Status);
