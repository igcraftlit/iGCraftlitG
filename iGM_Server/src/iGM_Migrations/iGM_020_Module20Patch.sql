/**
 * 文件路径：iGM_Server/src/iGM_Migrations/iGM_020_Module20Patch.sql
 * 所属层：后端 / 数据迁移层
 * 路由：G_ThirdParty
 * 模块：iGM_ThirdParty
 * 作用：为 iGM_ThirdPartyVersions 表新增「版本发布类型」字段
 * 内容：iGM_VersionType（release 正式版 / beta 测试版 / alpha 早期测试版），
 *       缺省 release，供网站与启动器区分正式版和测试版
 * 说明：迁移仅执行一次；已有历史行按缺省值回填为 release，
 *       下一次拉取上游版本时会按 Modrinth version_type 覆盖为准确值
 */

ALTER TABLE iGM_ThirdPartyVersions ADD COLUMN iGM_VersionType TEXT NOT NULL DEFAULT 'release';