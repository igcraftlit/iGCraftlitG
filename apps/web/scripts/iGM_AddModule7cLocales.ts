/**
 * 文件路径：apps/web/scripts/iGM_AddModule7cLocales.ts
 * 所属层：前端 / 构建脚本层
 * 路由：无
 * 模块：iGM_AddModule7cLocales
 * 作用：向五个语言包增量写入模块七第三轮文案键
 * 内容：自助注销账号（设置页危险区）、管理员删除用户、
 *       组织所有者金标与所有者不可退出组织
 * 说明：幂等——重复执行仅覆盖同名字段，不触碰其他模块文案
 */

// 导入依赖 //
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 类型定义 //
type iGM_Dict = Record<string, unknown>;

// 核心逻辑 //
/** 每个语言包的模块七第三轮文案 */
const iGM_LocalePayloads: Record<string, iGM_Dict> = {
  "zh-CN": {
    auth: {
      messages: {
        deleteCodeSent: "注销验证码已发送至你的邮箱，10 分钟内有效",
        accountDeleted: "账号已注销",
      },
      settings: {
        deleteAccount: {
          title: "删除账号",
          description: "永久注销你的 iGCraftLit Community 账号。",
          warning:
            "账号删除后，你的帖子、评论、收藏、积分与组织认证等全部数据将被永久清除，无法恢复。",
          sendCode: "发送验证码到邮箱",
          resend: "重新发送",
          codeSent: "验证码已发送至你的邮箱，如未收到可稍后重发",
          codeLabel: "邮箱验证码",
          codePlaceholder: "输入 6 位验证码",
          confirmButton: "确认删除账号",
          confirming: "删除中…",
          confirmPrompt: "此操作不可恢复。确定要永久删除你的账号吗？",
          cancel: "取消",
        },
      },
    },
    admin: {
      users: {
        delete: "删除",
        deleteConfirm:
          "确定要删除用户 {name} 吗？该用户的全部数据将被永久清除且无法恢复。",
      },
      messages: {
        userDeleted: "用户已删除",
      },
      errors: {
        cannotDeleteSelf: "不能删除你自己的账号",
      },
    },
    orgVerify: {
      ownerBadge: "所有者",
      badgeOwner: "{name} 组织所有者",
      details: {
        ownerCannotLeave: "你是该组织的所有者，无法退出组织。",
      },
      errors: {
        ownerCannotLeave: "组织所有者不能退出自己的组织",
      },
    },
  },
  "zh-TW": {
    auth: {
      messages: {
        deleteCodeSent: "註銷驗證碼已發送至你的信箱，10 分鐘內有效",
        accountDeleted: "帳號已註銷",
      },
      settings: {
        deleteAccount: {
          title: "刪除帳號",
          description: "永久註銷你的 iGCraftLit Community 帳號。",
          warning:
            "帳號刪除後，你的貼文、留言、收藏、積分與組織認證等全部資料將被永久清除，無法復原。",
          sendCode: "發送驗證碼到信箱",
          resend: "重新發送",
          codeSent: "驗證碼已發送至你的信箱，如未收到可稍後重發",
          codeLabel: "信箱驗證碼",
          codePlaceholder: "輸入 6 位驗證碼",
          confirmButton: "確認刪除帳號",
          confirming: "刪除中…",
          confirmPrompt: "此操作無法復原。確定要永久刪除你的帳號嗎？",
          cancel: "取消",
        },
      },
    },
    admin: {
      users: {
        delete: "刪除",
        deleteConfirm:
          "確定要刪除使用者 {name} 嗎？該使用者的全部資料將被永久清除且無法復原。",
      },
      messages: {
        userDeleted: "使用者已刪除",
      },
      errors: {
        cannotDeleteSelf: "不能刪除你自己的帳號",
      },
    },
    orgVerify: {
      ownerBadge: "擁有者",
      badgeOwner: "{name} 組織擁有者",
      details: {
        ownerCannotLeave: "你是該組織的擁有者，無法退出組織。",
      },
      errors: {
        ownerCannotLeave: "組織擁有者不能退出自己的組織",
      },
    },
  },
  en: {
    auth: {
      messages: {
        deleteCodeSent:
          "An account deletion code has been sent to your email and is valid for 10 minutes",
        accountDeleted: "Account deleted",
      },
      settings: {
        deleteAccount: {
          title: "Delete account",
          description: "Permanently delete your iGCraftLit Community account.",
          warning:
            "After deletion, all your data — including posts, comments, favorites, points and organization verification — will be permanently removed and cannot be restored.",
          sendCode: "Send code to email",
          resend: "Resend",
          codeSent:
            "A verification code has been sent to your email. You can resend it shortly if it does not arrive.",
          codeLabel: "Email code",
          codePlaceholder: "Enter the 6-digit code",
          confirmButton: "Confirm deletion",
          confirming: "Deleting…",
          confirmPrompt:
            "This action cannot be undone. Are you sure you want to permanently delete your account?",
          cancel: "Cancel",
        },
      },
    },
    admin: {
      users: {
        delete: "Delete",
        deleteConfirm:
          "Are you sure you want to delete user {name}? All of their data will be permanently removed and cannot be restored.",
      },
      messages: {
        userDeleted: "User deleted",
      },
      errors: {
        cannotDeleteSelf: "You cannot delete your own account",
      },
    },
    orgVerify: {
      ownerBadge: "Owner",
      badgeOwner: "{name} organization owner",
      details: {
        ownerCannotLeave:
          "You are the owner of this organization and cannot leave it.",
      },
      errors: {
        ownerCannotLeave:
          "The organization owner cannot leave their own organization",
      },
    },
  },
  ja: {
    auth: {
      messages: {
        deleteCodeSent:
          "アカウント削除用の認証コードをメールに送信しました（10分間有効）",
        accountDeleted: "アカウントを削除しました",
      },
      settings: {
        deleteAccount: {
          title: "アカウント削除",
          description: "iGCraftLit Community アカウントを永久に削除します。",
          warning:
            "削除すると、投稿、コメント、お気に入り、ポイント、組織認証などのすべてのデータが完全に消去され、復元できません。",
          sendCode: "認証コードをメールに送信",
          resend: "再送信",
          codeSent:
            "認証コードをメールに送信しました。届かない場合はしばらくしてから再送信してください。",
          codeLabel: "メール認証コード",
          codePlaceholder: "6桁のコードを入力",
          confirmButton: "削除を確認",
          confirming: "削除中…",
          confirmPrompt:
            "この操作は取り消せません。本当にアカウントを永久に削除しますか？",
          cancel: "キャンセル",
        },
      },
    },
    admin: {
      users: {
        delete: "削除",
        deleteConfirm:
          "ユーザー {name} を削除しますか？そのユーザーのすべてのデータが完全に消去され、復元できません。",
      },
      messages: {
        userDeleted: "ユーザーを削除しました",
      },
      errors: {
        cannotDeleteSelf: "自分自身のアカウントは削除できません",
      },
    },
    orgVerify: {
      ownerBadge: "オーナー",
      badgeOwner: "{name} 組織のオーナー",
      details: {
        ownerCannotLeave:
          "あなたはこの組織のオーナーのため、退会できません。",
      },
      errors: {
        ownerCannotLeave:
          "組織のオーナーは自身の組織を退会できません",
      },
    },
  },
  ru: {
    auth: {
      messages: {
        deleteCodeSent:
          "Код для удаления аккаунта отправлен на вашу почту и действителен 10 минут",
        accountDeleted: "Аккаунт удалён",
      },
      settings: {
        deleteAccount: {
          title: "Удаление аккаунта",
          description: "Окончательно удалить ваш аккаунт iGCraftLit Community.",
          warning:
            "После удаления все ваши данные, включая записи, комментарии, избранное, баллы и подтверждение организации, будут удалены без возможности восстановления.",
          sendCode: "Отправить код на почту",
          resend: "Отправить снова",
          codeSent:
            "Код подтверждения отправлен на вашу почту. Если письмо не пришло, код можно запросить повторно.",
          codeLabel: "Код из письма",
          codePlaceholder: "Введите 6-значный код",
          confirmButton: "Подтвердить удаление",
          confirming: "Удаление…",
          confirmPrompt:
            "Это действие необратимо. Вы уверены, что хотите окончательно удалить свой аккаунт?",
          cancel: "Отмена",
        },
      },
    },
    admin: {
      users: {
        delete: "Удалить",
        deleteConfirm:
          "Вы уверены, что хотите удалить пользователя {name}? Все его данные будут удалены без возможности восстановления.",
      },
      messages: {
        userDeleted: "Пользователь удалён",
      },
      errors: {
        cannotDeleteSelf: "Нельзя удалить собственный аккаунт",
      },
    },
    orgVerify: {
      ownerBadge: "Владелец",
      badgeOwner: "Владелец организации {name}",
      details: {
        ownerCannotLeave:
          "Вы владелец этой организации и не можете её покинуть.",
      },
      errors: {
        ownerCannotLeave:
          "Владелец организации не может покинуть собственную организацию",
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
  console.log(`[iGM_AddModule7cLocales] 已写入 ${locale}.json`);
}
