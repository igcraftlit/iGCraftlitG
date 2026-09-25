-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_009_Module7c.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Auth / G_Admin / G_OrgVerify
-- 作用：模块七第三轮——删除账号、组织负责人权限收窄、所有者金标
-- 内容：将两个组织负责人邮箱账号的全局角色由 admin 收窄为普通用户（user），
--       其组织认证（iGM_VerifiedOrgId）保留不变；
--       负责人仅可管理自己所属组织的认证审核内容，
--       不再拥有全局管理员权限，也不能再进入全局用户管理；
--       负责人身份（isOwner）由组织表 iGM_OwnerEmail 与用户邮箱比对得出
-- 说明：迁移按文件名记录执行历史，仅会执行一次；
--       全局管理员 admin@igcraftlit.com 不受影响；
--       后续这两个邮箱重新注册时，注册逻辑也只授予 user 角色

-- ===== 组织负责人权限收窄：仅保留组织认证，移除全局 admin 角色 =====
UPDATE iGM_Users
   SET iGM_Role = 'user'
 WHERE iGM_Email = 'igcraftlit@outlook.com';

UPDATE iGM_Users
   SET iGM_Role = 'user'
 WHERE iGM_Email = 'cayihuo@outlook.com';
