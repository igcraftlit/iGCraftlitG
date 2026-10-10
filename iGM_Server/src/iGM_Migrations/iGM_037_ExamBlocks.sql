-- =====================================================================
-- iGM_037_ExamBlocks.sql  —  iG&M 教育考试系统：结构化 Block 解析与图片提取
-- =====================================================================
-- 模块：iG&M 教育考试系统（试卷 PDF 上传解析升级）
-- 影响：iGM_Exams（结构化内容块 + 图片目录）、iGM_ExamFiles（解析进度）
-- 说明：
--   - 解析结果由 Markdown 全文改为结构化 Block 数组（JSONB），
--     前端按 Block 类型用自定义 React 组件渲染，不再加载 PDF.js
--   - 提取的图片落本地 images 目录，iGM_ImagesPath 保存相对存储根目录的目录路径，
--     Block 内仅保存图片文件名（磁盘路径绝不出现在对外 DTO）
--   - 解析进度记录在 iGM_ExamFiles：已解析页数 / 总页数 / 失败原因
--   - 原 iGM_ContentMarkdown 由结构化 Block 取代，直接删除该列
-- =====================================================================

BEGIN;

-- ===== 1. 试卷主表：结构化内容块与图片目录 =====
ALTER TABLE iGM_Exams ADD COLUMN IF NOT EXISTS iGM_ContentBlocks JSONB;
ALTER TABLE iGM_Exams ADD COLUMN IF NOT EXISTS iGM_ImagesPath TEXT;
-- 全文改存 iGM_ContentBlocks，Markdown 列废弃
ALTER TABLE iGM_Exams DROP COLUMN IF EXISTS iGM_ContentMarkdown;

-- ===== 2. 试卷文件表：逐页解析进度 =====
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_ParsedPages INTEGER NOT NULL DEFAULT 0;
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_TotalPages INTEGER NOT NULL DEFAULT 0;
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_ParseError TEXT;

COMMIT;