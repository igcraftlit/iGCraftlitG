/**
 * 文件路径：apps/web/scripts/iGM_AddModule7bLocales.ts
 * 所属层：前端 / 构建脚本层
 * 路由：无
 * 模块：iGM_AddModule7bLocales
 * 作用：向五个语言包增量写入模块七增强版文案键
 * 内容：组织详情/退出组织/关于组织编辑、审核页组织筛选、iGMUid、
 *       顶部导航用户区下拉菜单、G_OrgDetails 页面元数据
 * 说明：幂等——重复执行仅覆盖同名字段，不触碰其他模块文案
 */

// 导入依赖 //
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 类型定义 //
type iGM_Dict = Record<string, unknown>;

// 核心逻辑 //
/** 每个语言包的模块七增强文案 */
const iGM_LocalePayloads: Record<string, iGM_Dict> = {
  "zh-CN": {
    nav: { orgDetails: "组织详情" },
    pages: {
      orgDetails: { title: "组织详情", description: "查看受信任组织信息与关于组织介绍" },
    },
    topbar: { login: "登录" },
    auth: { settings: { uid: "iGMUid" } },
    admin: { users: { uid: "iGMUid", searchPlaceholder: "搜索用户名、邮箱或 iGMUid" } },
    community: { profile: { uidLabel: "iGMUid" } },
    orgVerify: {
      status: { left: "已退出" },
      details: {
        title: "我的组织认证",
        ownerTag: "组织负责人",
        about: "关于组织",
        aboutEmpty: "该组织暂未填写介绍内容。",
        editAbout: "编辑关于组织",
        aboutPlaceholder: "填写组织简介、愿景、联系方式、官网链接等（最多 5000 字）",
        save: "保存",
        saving: "保存中…",
        cancel: "取消",
        leave: "申请退出",
        leaveConfirm: "确定要退出该组织吗？退出后认证标识将被移除，你可以随时重新申请。",
        leaveReason: "退出理由（可选）",
        leaveReasonPlaceholder: "可简单说明退出原因…",
        viewDetails: "查看组织详情页",
      },
      admin: {
        filterOrg: "按组织筛选",
        filterOrgAll: "全部组织",
      },
      messages: {
        left: "已退出组织，认证标识已移除",
        aboutUpdated: "关于组织内容已更新",
      },
      errors: {
        alreadyVerified: "你已持有组织认证，需先退出后才能重新申请",
        notOrgMember: "你当前不属于任何受信任组织",
        forbidden: "你没有权限执行此操作",
        aboutTooLong: "关于组织内容不能超过 5000 字",
      },
    },
  },
  "zh-TW": {
    nav: { orgDetails: "組織詳情" },
    pages: {
      orgDetails: { title: "組織詳情", description: "查看受信任組織資訊與關於組織介紹" },
    },
    topbar: { login: "登入" },
    auth: { settings: { uid: "iGMUid" } },
    admin: { users: { uid: "iGMUid", searchPlaceholder: "搜尋使用者名稱、郵箱或 iGMUid" } },
    community: { profile: { uidLabel: "iGMUid" } },
    orgVerify: {
      status: { left: "已退出" },
      details: {
        title: "我的組織認證",
        ownerTag: "組織負責人",
        about: "關於組織",
        aboutEmpty: "該組織暫未填寫介紹內容。",
        editAbout: "編輯關於組織",
        aboutPlaceholder: "填寫組織簡介、願景、聯絡方式、官網連結等（最多 5000 字）",
        save: "儲存",
        saving: "儲存中…",
        cancel: "取消",
        leave: "申請退出",
        leaveConfirm: "確定要退出該組織嗎？退出後認證標識將被移除，你可以隨時重新申請。",
        leaveReason: "退出理由（可選）",
        leaveReasonPlaceholder: "可簡單說明退出原因…",
        viewDetails: "查看組織詳情頁",
      },
      admin: {
        filterOrg: "按組織篩選",
        filterOrgAll: "全部組織",
      },
      messages: {
        left: "已退出組織，認證標識已移除",
        aboutUpdated: "關於組織內容已更新",
      },
      errors: {
        alreadyVerified: "你已持有組織認證，需先退出後才能重新申請",
        notOrgMember: "你當前不屬於任何受信任組織",
        forbidden: "你沒有權限執行此操作",
        aboutTooLong: "關於組織內容不能超過 5000 字",
      },
    },
  },
  en: {
    nav: { orgDetails: "Organization" },
    pages: {
      orgDetails: { title: "Organization", description: "View trusted organization information and about content" },
    },
    topbar: { login: "Log in" },
    auth: { settings: { uid: "iGMUid" } },
    admin: { users: { uid: "iGMUid", searchPlaceholder: "Search by username, email or iGMUid" } },
    community: { profile: { uidLabel: "iGMUid" } },
    orgVerify: {
      status: { left: "Left" },
      details: {
        title: "My verified organization",
        ownerTag: "Organization owner",
        about: "About",
        aboutEmpty: "This organization has not provided an introduction yet.",
        editAbout: "Edit about",
        aboutPlaceholder: "Introduce the organization: mission, vision, contact, website, etc. (up to 5000 characters)",
        save: "Save",
        saving: "Saving…",
        cancel: "Cancel",
        leave: "Leave organization",
        leaveConfirm: "Are you sure you want to leave this organization? Your badge will be removed and you can reapply at any time.",
        leaveReason: "Reason for leaving (optional)",
        leaveReasonPlaceholder: "You may briefly explain why you are leaving…",
        viewDetails: "View organization page",
      },
      admin: {
        filterOrg: "Filter by organization",
        filterOrgAll: "All organizations",
      },
      messages: {
        left: "You have left the organization and your badge has been removed",
        aboutUpdated: "Organization about content updated",
      },
      errors: {
        alreadyVerified: "You are already verified. Leave the organization first to reapply",
        notOrgMember: "You are not a member of any trusted organization",
        forbidden: "You do not have permission to perform this action",
        aboutTooLong: "About content must be at most 5000 characters",
      },
    },
  },
  ja: {
    nav: { orgDetails: "組織詳細" },
    pages: {
      orgDetails: { title: "組織詳細", description: "信頼された組織の情報と紹介を確認" },
    },
    topbar: { login: "ログイン" },
    auth: { settings: { uid: "iGMUid" } },
    admin: { users: { uid: "iGMUid", searchPlaceholder: "ユーザー名、メールまたは iGMUid で検索" } },
    community: { profile: { uidLabel: "iGMUid" } },
    orgVerify: {
      status: { left: "退会済み" },
      details: {
        title: "認証済み組織",
        ownerTag: "組織責任者",
        about: "組織について",
        aboutEmpty: "この組織の紹介はまだありません。",
        editAbout: "紹介を編集",
        aboutPlaceholder: "組織の概要、ビジョン、連絡先、ウェブサイトなどを入力（最大5000文字）",
        save: "保存",
        saving: "保存中…",
        cancel: "キャンセル",
        leave: "退会を申請",
        leaveConfirm: "この組織を退会しますか？バッジは削除されますが、いつでも再申請できます。",
        leaveReason: "退会理由（任意）",
        leaveReasonPlaceholder: "退会理由を簡単にご記入ください…",
        viewDetails: "組織ページを見る",
      },
      admin: {
        filterOrg: "組織で絞り込み",
        filterOrgAll: "すべての組織",
      },
      messages: {
        left: "組織を退会し、認証バッジが削除されました",
        aboutUpdated: "組織の紹介を更新しました",
      },
      errors: {
        alreadyVerified: "すでに認証済みです。再申請するには先に退会してください",
        notOrgMember: "現在、信頼された組織に所属していません",
        forbidden: "この操作を行う権限がありません",
        aboutTooLong: "紹介は5000文字以内で入力してください",
      },
    },
  },
  ru: {
    nav: { orgDetails: "Об организации" },
    pages: {
      orgDetails: { title: "Об организации", description: "Информация о доверенной организации и раздел «О нас»" },
    },
    topbar: { login: "Войти" },
    auth: { settings: { uid: "iGMUid" } },
    admin: { users: { uid: "iGMUid", searchPlaceholder: "Поиск по имени, email или iGMUid" } },
    community: { profile: { uidLabel: "iGMUid" } },
    orgVerify: {
      status: { left: "Покинута" },
      details: {
        title: "Моя подтверждённая организация",
        ownerTag: "Владелец организации",
        about: "Об организации",
        aboutEmpty: "Эта организация пока не добавила описание.",
        editAbout: "Редактировать описание",
        aboutPlaceholder: "Опишите организацию: миссия, цели, контакты, сайт и т. д. (до 5000 символов)",
        save: "Сохранить",
        saving: "Сохранение…",
        cancel: "Отмена",
        leave: "Покинуть организацию",
        leaveConfirm: "Вы уверены, что хотите покинуть организацию? Значок будет удалён, но вы сможете подать заявку снова.",
        leaveReason: "Причина выхода (необязательно)",
        leaveReasonPlaceholder: "Можно кратко указать причину выхода…",
        viewDetails: "Открыть страницу организации",
      },
      admin: {
        filterOrg: "Фильтр по организации",
        filterOrgAll: "Все организации",
      },
      messages: {
        left: "Вы покинули организацию, значок удалён",
        aboutUpdated: "Описание организации обновлено",
      },
      errors: {
        alreadyVerified: "Вы уже верифицированы. Чтобы подать заявку снова, сначала покиньте организацию",
        notOrgMember: "Вы не состоите ни в одной доверенной организации",
        forbidden: "У вас нет прав для этого действия",
        aboutTooLong: "Описание должно быть не длиннее 5000 символов",
      },
    },
  },
};

/** 深度合并（仅覆盖叶子，缺失键补齐） */
function iGM_Merge(target: iGM_Dict, patch: iGM_Dict): iGM_Dict {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const base =
        target[key] !== null && typeof target[key] === "object"
          ? (target[key] as iGM_Dict)
          : {};
      target[key] = iGM_Merge(base, value as iGM_Dict);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const messagesDir = resolve(
  (import.meta as unknown as { dir: string }).dir,
  "../messages",
);
for (const [locale, payload] of Object.entries(iGM_LocalePayloads)) {
  const file = resolve(messagesDir, `${locale}.json`);
  const data = JSON.parse(readFileSync(file, "utf8")) as iGM_Dict;
  iGM_Merge(data, payload);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`[iGM_AddModule7bLocales] 已写入 ${locale}.json`);
}
