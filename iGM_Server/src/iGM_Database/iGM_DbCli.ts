/**
 * 文件路径：iGM_Server/src/iGM_Database/iGM_DbCli.ts
 * 所属层：后端 / 数据库命令行入口
 * 路由：无
 * 模块：iGM_Database
 * 作用：提供 bun run db:init / db:migrate / db:seed 命令
 * 内容：数据库文件创建、迁移执行、种子数据占位
 */

// 导入依赖 //
import { iGM_Db, iGM_RunMigrations } from "./iGM_Database";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_CreateUser,
  iGM_FindUserByEmail,
} from "../iGM_Repositories/iGM_UserRepository";
import { iGM_HashPassword, iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";

// 类型定义 //
type iGM_DbCommand = "init" | "migrate" | "seed";

// 核心逻辑 //
/** 模块二种子账号：三种角色各一个，仅用于本地权限自检 */
const iGM_SeedUsers = [
  {
    username: "iGM_Admin",
    email: "admin@igcraftlit.com",
    password: "Admin12345",
    role: "admin" as const,
  },
  {
    username: "iGM_Moderator",
    email: "moderator@igcraftlit.com",
    password: "Moderator12345",
    role: "moderator" as const,
  },
  {
    username: "iGM_User",
    email: "user@igcraftlit.com",
    password: "User12345",
    role: "user" as const,
  },
];

/** 写入种子账号（已存在则跳过），账号默认邮箱已验证 */
async function iGM_SeedAuthUsers(): Promise<void> {
  const now = new Date().toISOString();
  for (const seed of iGM_SeedUsers) {
    if (iGM_FindUserByEmail(seed.email)) {
      console.log(`[iGM_Database] 种子账号已存在，跳过：${seed.email}`);
      continue;
    }
    const user = iGM_CreateUser({
      id: iGM_RandomUuid(),
      username: seed.username,
      email: seed.email,
      passwordHash: await iGM_HashPassword(seed.password),
      role: seed.role,
      now,
    });
    // 种子账号直接标记为邮箱已验证
    iGM_Db.run(
      `UPDATE iGM_Users SET iGM_EmailVerified = 1 WHERE iGM_Id = ?`,
      [user.iGM_Id],
    );
    console.log(
      `[iGM_Database] 种子账号已创建：${seed.username} / ${seed.email} / ${seed.password}（${seed.role}）`,
    );
  }
}

async function iGM_Main(): Promise<void> {
  const command = process.argv[2] as iGM_DbCommand | undefined;

  switch (command) {
    case "init": {
      // init：创建数据库文件、迁移记录表并执行全部迁移
      const executed = await iGM_RunMigrations(iGM_Db);
      console.log(
        `[iGM_Database] 初始化完成：${iGM_Config.databasePath}，本次迁移 ${executed.length} 个`,
      );
      break;
    }
    case "migrate": {
      const executed = await iGM_RunMigrations(iGM_Db);
      console.log(
        `[iGM_Database] 迁移完成，本次执行 ${executed.length} 个迁移文件`,
      );
      break;
    }
    case "seed": {
      // 模块二：写入三种角色的演示账号，便于本地权限自检
      await iGM_SeedAuthUsers();
      console.log("[iGM_Database] 种子数据写入完成");
      break;
    }
    default: {
      console.error("用法：bun run db:init | db:migrate | db:seed");
      process.exit(1);
    }
  }
}

// 执行 //
iGM_Main();
