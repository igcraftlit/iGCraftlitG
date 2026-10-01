/**
 * 文件路径：apps/shell/src/iGM_Launcher_BindingStore.ts
 * 所属层：桌面外壳 / 持久化层
 * 路由：全局（仅供主进程调用）
 * 模块：iGM_Launcher_BindingStore
 * 作用：Minecraft 正版账号绑定关系的本地持久化——
 *       绑定记录与敏感令牌整体经 iGM_Launcher_TokenVault 加密后写入
 *       D:/IGLAUNCHER/data/account/mc_bindings.json，绝不明文落盘
 * 内容：读取 / 保存、按社区账号过滤的列表视图、新增与更新、解绑、设为默认、
 *       预留的社区后端同步调用点（主站尚未提供 iGM_MCBindings 接口，当前仅本地实现）
 *
 * 安全约束（第六节、第十二节）：
 *   1. 令牌与绑定记录同文件加密存储，渲染进程永远只能拿到 iGM_Launcher_MCBinding 视图；
 *   2. 解绑时本地令牌随之删除，不留残余；
 *   3. 一个社区账号下至多一个默认绑定，列表按“默认优先 + 绑定时间倒序”排序。
 */

// 导入依赖 //
import {
  IGM_LAUNCHER_MC_BINDINGS_FILE,
  iGM_Launcher_NormalizeDefaultBinding,
  type iGM_Launcher_MCBinding,
  type iGM_Launcher_MCBindingSecret,
} from "@igm-launcher/shared";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { IGM_LAUNCHER_DATA_ROOT } from "@igm-launcher/shared";
import { iGM_Launcher_Vault_Decrypt, iGM_Launcher_Vault_Encrypt } from "./iGM_Launcher_TokenVault";

// 类型定义 //

/** 加密文件内的明文结构 */
interface iGM_Launcher_McBindingsPayload {
  bindings: iGM_Launcher_MCBindingSecret[];
}

// 核心逻辑 //

/** 绑定文件绝对路径 */
function iGM_Launcher_BindingPath(): string {
  return join(IGM_LAUNCHER_DATA_ROOT, IGM_LAUNCHER_MC_BINDINGS_FILE);
}

/**
 * 读取全部绑定密钥载荷。
 * 文件缺失返回空；解密失败（如换机、换用户）抛出明确错误，
 * 由调用方提示“绑定令牌不可用，请重新绑定”，绝不静默丢弃用户绑定。
 */
async function iGM_Launcher_LoadSecrets(): Promise<iGM_Launcher_MCBindingSecret[]> {
  const path = iGM_Launcher_BindingPath();
  if (!existsSync(path)) return [];

  const envelope = (await readFile(path, "utf8")).trim();
  if (envelope.length === 0) return [];

  const plaintext = await iGM_Launcher_Vault_Decrypt(envelope);
  const parsed = JSON.parse(plaintext) as iGM_Launcher_McBindingsPayload;
  return Array.isArray(parsed.bindings) ? parsed.bindings : [];
}

/** 整体加密写回 */
async function iGM_Launcher_SaveSecrets(secrets: iGM_Launcher_MCBindingSecret[]): Promise<void> {
  const path = iGM_Launcher_BindingPath();
  await mkdir(dirname(path), { recursive: true });
  const envelope = await iGM_Launcher_Vault_Encrypt(
    JSON.stringify({ bindings: secrets } satisfies iGM_Launcher_McBindingsPayload),
  );
  await writeFile(path, `${envelope}\n`, "utf8");
}

/** 从密钥载荷中取出非敏感视图 */
function iGM_Launcher_ToViews(secrets: iGM_Launcher_MCBindingSecret[]): iGM_Launcher_MCBinding[] {
  return secrets.map((item) => item.binding);
}

/**
 * 按社区账号过滤并排序的绑定列表视图。
 * 未登录（communityUid 为空）时返回空列表，界面据此展示“登录后可绑定”引导。
 */
export async function iGM_Launcher_Binding_List(
  communityUid: string,
): Promise<iGM_Launcher_MCBinding[]> {
  if (!communityUid) return [];
  const secrets = await iGM_Launcher_LoadSecrets();
  const mine = secrets
    .filter((item) => item.binding.communityUid === communityUid)
    .map((item) => item.binding)
    .sort((left, right) => {
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      return right.addedAt.localeCompare(left.addedAt);
    });
  return mine;
}

/** 读取单条绑定的密钥载荷（含令牌，仅主进程内使用） */
export async function iGM_Launcher_Binding_GetSecret(
  bindingId: string,
): Promise<iGM_Launcher_MCBindingSecret | null> {
  const secrets = await iGM_Launcher_LoadSecrets();
  return secrets.find((item) => item.binding.id === bindingId) ?? null;
}

/**
 * 新增绑定：写入密钥载荷并把该社区账号下的首个绑定置为默认，
 * 返回更新后的列表视图与新绑定记录。
 */
export async function iGM_Launcher_Binding_Add(
  secret: iGM_Launcher_MCBindingSecret,
): Promise<{ bindings: iGM_Launcher_MCBinding[]; binding: iGM_Launcher_MCBinding }> {
  const secrets = await iGM_Launcher_LoadSecrets();
  const uid = secret.binding.communityUid;
  const sameAccount = secrets.filter((item) => item.binding.communityUid === uid);
  const binding: iGM_Launcher_MCBinding = {
    ...secret.binding,
    isDefault: sameAccount.length === 0 ? true : secret.binding.isDefault,
  };
  const next = [...secrets, { ...secret, binding }];
  await iGM_Launcher_SaveSecrets(next);
  await iGM_Launcher_Binding_SyncBackend("add", binding);
  return { bindings: await iGM_Launcher_Binding_List(uid), binding };
}

/** 更新绑定的非敏感字段（档案刷新、拥有权复核、令牌刷新后调用） */
export async function iGM_Launcher_Binding_Update(
  binding: iGM_Launcher_MCBinding,
  patch?: Partial<iGM_Launcher_MCBindingSecret>,
): Promise<iGM_Launcher_MCBinding[]> {
  const secrets = await iGM_Launcher_LoadSecrets();
  const index = secrets.findIndex((item) => item.binding.id === binding.id);
  if (index < 0) return iGM_Launcher_Binding_List(binding.communityUid);

  const next = [...secrets];
  next[index] = {
    ...secrets[index],
    ...patch,
    binding: { ...secrets[index].binding, ...binding },
  };
  await iGM_Launcher_SaveSecrets(next);
  return iGM_Launcher_Binding_List(binding.communityUid);
}

/**
 * 解绑：删除本地记录与其中的全部令牌，并在同社区账号下重新归一化默认绑定。
 * 预留的后端同步点在此一并触发（当前仅本地实现）。
 */
export async function iGM_Launcher_Binding_Remove(
  bindingId: string,
): Promise<{ bindings: iGM_Launcher_MCBinding[]; communityUid: string }> {
  const secrets = await iGM_Launcher_LoadSecrets();
  const target = secrets.find((item) => item.binding.id === bindingId);
  if (!target) return { bindings: [], communityUid: "" };

  const uid = target.binding.communityUid;
  const remaining = secrets.filter((item) => item.binding.id !== bindingId);

  // 同社区账号下重新归一化默认项，避免解绑默认账号后出现无默认状态
  const mine = remaining
    .filter((item) => item.binding.communityUid === uid)
    .map((item) => item.binding);
  const normalized = iGM_Launcher_NormalizeDefaultBinding(mine);
  const normalizedMap = new Map(normalized.map((item) => [item.id, item]));
  const next = remaining.map((item) =>
    normalizedMap.has(item.binding.id)
      ? { ...item, binding: normalizedMap.get(item.binding.id)! }
      : item,
  );

  await iGM_Launcher_SaveSecrets(next);
  await iGM_Launcher_Binding_SyncBackend("remove", target.binding);
  return { bindings: await iGM_Launcher_Binding_List(uid), communityUid: uid };
}

/** 设为默认：同一社区账号下互斥，返回更新后的列表视图 */
export async function iGM_Launcher_Binding_SetDefault(
  bindingId: string,
): Promise<{ bindings: iGM_Launcher_MCBinding[]; communityUid: string }> {
  const secrets = await iGM_Launcher_LoadSecrets();
  const target = secrets.find((item) => item.binding.id === bindingId);
  if (!target) return { bindings: [], communityUid: "" };

  const uid = target.binding.communityUid;
  const mine = secrets.filter((item) => item.binding.communityUid === uid);
  const normalized = iGM_Launcher_NormalizeDefaultBinding(
    mine.map((item) => item.binding),
    bindingId,
  );
  const normalizedMap = new Map(normalized.map((item) => [item.id, item]));
  const next = secrets.map((item) =>
    normalizedMap.has(item.binding.id)
      ? { ...item, binding: normalizedMap.get(item.binding.id)! }
      : item,
  );

  await iGM_Launcher_SaveSecrets(next);
  return { bindings: await iGM_Launcher_Binding_List(uid), communityUid: uid };
}

/**
 * 预留：社区后端绑定同步。
 * 依据本模块确认的范围决策（“仅启动器本地实现”），主站
 * D:/IGWEB/iGM_Server 当前不新增 iGM_MCBindings 接口，
 * 因此这里不做任何网络请求，只记录同步点，待主站提供契约后在此接入；
 * 返回值恒为 false 表示“未同步到服务端”，界面据此对用户如实说明绑定仅存本机。
 */
async function iGM_Launcher_Binding_SyncBackend(
  action: "add" | "remove",
  binding: iGM_Launcher_MCBinding,
): Promise<boolean> {
  console.log(
    `[iGM_Launcher_BindingStore] 绑定${
      action === "add" ? "新增" : "移除"
    }已落盘（本地）；服务端同步点预留：${binding.uuid}`,
  );
  return false;
}

// 导出 //
export { iGM_Launcher_BindingPath as IGM_LAUNCHER_BINDING_PATH };
export default iGM_Launcher_Binding_List;