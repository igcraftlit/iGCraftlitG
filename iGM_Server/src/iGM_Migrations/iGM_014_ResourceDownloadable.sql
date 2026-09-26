/**
 * 文件路径：iGM_Server/src/iGM_Migrations/iGM_014_ResourceDownloadable.sql
 * 所属层：后端 / 数据迁移层
 * 模块：iGM_Resource
 * 作用：为 iGM_Resources 表新增「可下载」相关字段
 * 内容：iGM_Downloadable（是否可下载）、iGM_Slug（下载标识符，含用户 uid）、
 *       iGM_Version（版本号，选填），并为 iGM_Slug 建唯一索引
 */

ALTER TABLE iGM_Resources ADD COLUMN iGM_Downloadable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE iGM_Resources ADD COLUMN iGM_Slug TEXT;
ALTER TABLE iGM_Resources ADD COLUMN iGM_Version TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS iGM_Idx_Resources_Slug
  ON iGM_Resources (iGM_Slug) WHERE iGM_Slug IS NOT NULL;
