-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_010_Module8.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Auth
-- 作用：模块八——注册流程改为五框向导，第四框在《用户管理规定》独立页
--       阅读并同意后返回；系统记录同意规定时的客户端 IP 与时间，
--       用于违规处置与配合执法机关调查
-- 内容：iGM_Users 新增 iGM_RulesAcceptedIp（同意时 IP）、
--       iGM_RulesAcceptedAt（同意时间 ISO 字符串），历史用户均为 NULL
-- 说明：迁移按文件名记录执行历史，仅会执行一次；
--       全部逻辑与解析由本服务自行实现，不依赖任何第三方 IP 库或付费服务

ALTER TABLE iGM_Users ADD COLUMN iGM_RulesAcceptedIp TEXT;
ALTER TABLE iGM_Users ADD COLUMN iGM_RulesAcceptedAt TEXT;
