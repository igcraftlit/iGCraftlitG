-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_040_Search.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Search
-- 作用：全站搜索的索引准备（帖子 / 资源 / 用户 / 组织）
-- 内容：启用 pg_trgm 贡献扩展并为待搜字段建立 GIN 三元组索引，
--       以支撑 ILIKE '%关键词%' 的子串匹配，避免全表扫描
-- 说明：
--   - PostgreSQL 内置分词（simple/english）对中文无效（中文无空格），
--     且 pg_jieba / zhparser 未必随数据库镜像提供，故采用 pg_trgm 三元组
--     索引加速 LIKE/ILIKE 子串匹配作为默认方案；
--   - 扩展或索引不可用时以 DO 块捕获异常并降级为无索引（仅记录通知），
--     保证迁移在任何环境都不会因缺少贡献扩展而中断服务启动；
--   - 所有索引名统一 iGM_ 前缀，全部 IF NOT EXISTS 幂等。

BEGIN;

-- ===== 启用 pg_trgm 三元组扩展（不可用时降级，不中断迁移） =====
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: pg_trgm 不可用，降级为无三元组索引（%）', SQLERRM;
END $$;

-- ===== 帖子：标题与正文 =====
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_Posts_Title_Trgm
    ON iGM_Posts USING gin (iGM_Title gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_Posts 标题三元组索引（%）', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_Posts_Content_Trgm
    ON iGM_Posts USING gin (iGM_Content gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_Posts 正文三元组索引（%）', SQLERRM;
END $$;

-- ===== 资源：标题与描述 =====
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_Resources_Title_Trgm
    ON iGM_Resources USING gin (iGM_Title gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_Resources 标题三元组索引（%）', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_Resources_Desc_Trgm
    ON iGM_Resources USING gin (iGM_Description gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_Resources 描述三元组索引（%）', SQLERRM;
END $$;

-- ===== 资源标签：名称（标签命中作为资源命中依据之一） =====
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_ResourceTags_Name_Trgm
    ON iGM_ResourceTags USING gin (iGM_Name gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_ResourceTags 名称三元组索引（%）', SQLERRM;
END $$;

-- ===== 用户：用户名、昵称与简介 =====
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_Users_Username_Trgm
    ON iGM_Users USING gin (iGM_Username gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_Users 用户名三元组索引（%）', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_Users_DisplayName_Trgm
    ON iGM_Users USING gin (iGM_DisplayName gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_Users 昵称三元组索引（%）', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_Users_Bio_Trgm
    ON iGM_Users USING gin (iGM_Bio gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_Users 简介三元组索引（%）', SQLERRM;
END $$;

-- ===== 组织：名称与描述 =====
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_Organizations_Name_Trgm
    ON iGM_Organizations USING gin (iGM_Name gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_Organizations 名称三元组索引（%）', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS iGM_Idx_Organizations_Desc_Trgm
    ON iGM_Organizations USING gin (iGM_Description gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iGM_Search: 跳过 iGM_Organizations 描述三元组索引（%）', SQLERRM;
END $$;

COMMIT;
