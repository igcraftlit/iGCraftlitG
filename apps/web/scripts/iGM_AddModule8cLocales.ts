/**
 * 文件路径：apps/web/scripts/iGM_AddModule8cLocales.ts
 * 所属层：前端 / 构建脚本层
 * 路由：无
 * 模块：iGM_AddModule8cLocales
 * 作用：向五个语言包增量写入模块八第三轮文案键
 *       （规定独立页 IP 检测告知、注册同意操作条、向导第四框跳转文案）
 * 内容：userRules.ipDetecting/ipNotice/ipDetectFailed/registerHint/
 *       scrollToAccept/acceptAndReturn；
 *       auth.wizard.step4Intro/viewRules/acceptedInfo
 * 说明：幂等——重复执行仅覆盖同名字段，不触碰其他模块文案
 */

// 导入依赖 //
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 类型定义 //
type iGM_Dict = Record<string, unknown>;

// 核心逻辑 //
/** 每个语言包的模块八第三轮文案 */
const iGM_LocalePayloads: Record<string, iGM_Dict> = {
  "zh-CN": {
    userRules: {
      ipDetecting: "正在检测你的 IP 地址…",
      ipNotice:
        "你的 IP 地址：{ip}。注册并同意本规定时，系统将记录该 IP 与时间，用于违规处置及配合执法机关调查。",
      ipDetectFailed: "暂时无法检测到 IP 地址，请确认本地后端正在运行。",
      registerHint:
        "你正在注册新账号。请完整阅读本规定，滚动到页面底部后即可同意并返回注册向导。",
      scrollToAccept: "请继续向下滚动，阅读完规定全文后即可同意",
      acceptAndReturn: "我已阅读完毕，同意并返回注册",
    },
    auth: {
      wizard: {
        step4Intro:
          "注册前请先阅读《iGCraftLit 用户管理规定》。请点击下方按钮前往独立页面查看全文，阅读并同意后返回本向导。",
        viewRules: "阅读《用户管理规定》",
        acceptedInfo: "已阅读并同意规定 · IP：{ip} · {time}",
      },
    },
  },

  "zh-TW": {
    userRules: {
      ipDetecting: "正在偵測你的 IP 位址…",
      ipNotice:
        "你的 IP 位址：{ip}。註冊並同意本規定時，系統將記錄該 IP 與時間，用於違規處置及配合執法機關調查。",
      ipDetectFailed: "暫時無法偵測到 IP 位址，請確認本地後端正在運行。",
      registerHint:
        "你正在註冊新帳號。請完整閱讀本規定，捲動到頁面底部後即可同意並返回註冊精靈。",
      scrollToAccept: "請繼續向下捲動，閱讀完規定全文後即可同意",
      acceptAndReturn: "我已閱讀完畢，同意並返回註冊",
    },
    auth: {
      wizard: {
        step4Intro:
          "註冊前請先閱讀《iGCraftLit 使用者管理規定》。請點擊下方按鈕前往獨立頁面查看全文，閱讀並同意後返回本精靈。",
        viewRules: "閱讀《使用者管理規定》",
        acceptedInfo: "已閱讀並同意規定 · IP：{ip} · {time}",
      },
    },
  },

  en: {
    userRules: {
      ipDetecting: "Detecting your IP address…",
      ipNotice:
        "Your IP address: {ip}. When you register and accept these rules, this IP and the timestamp will be recorded for violation handling and law-enforcement cooperation.",
      ipDetectFailed:
        "Unable to detect the IP address right now. Please make sure the local backend is running.",
      registerHint:
        "You are creating a new account. Please read these rules in full — scroll to the bottom of the page to accept and return to registration.",
      scrollToAccept:
        "Keep scrolling to the bottom to finish reading and accept",
      acceptAndReturn:
        "I have finished reading — accept and return to sign up",
    },
    auth: {
      wizard: {
        step4Intro:
          "Before signing up, please read the iGCraftLit User Rules. Click the button below to view the full text on a separate page, then accept and return to this wizard.",
        viewRules: "Read the User Rules",
        acceptedInfo: "Rules read and accepted · IP: {ip} · {time}",
      },
    },
  },

  ja: {
    userRules: {
      ipDetecting: "IP アドレスを確認しています…",
      ipNotice:
        "あなたの IP アドレス：{ip}。本規約に同意して登録する際、この IP と時刻が記録され、違反対応および捜査機関への協力に使用されます。",
      ipDetectFailed:
        "現在 IP アドレスを確認できません。ローカルバックエンドが起動しているか確認してください。",
      registerHint:
        "新規登録中です。規約を最後までお読みください。ページ最下部までスクロールすると同意して登録に戻れます。",
      scrollToAccept:
        "下までスクロールして規約を読み終えると同意できます",
      acceptAndReturn: "読み終えました。同意して登録に戻る",
    },
    auth: {
      wizard: {
        step4Intro:
          "登録の前に『iGCraftLit 利用規約』をお読みください。下のボタンから別ページで全文を確認し、同意してからウィザードに戻ります。",
        viewRules: "利用規約を読む",
        acceptedInfo: "規約を読み同意しました · IP：{ip} · {time}",
      },
    },
  },

  ru: {
    userRules: {
      ipDetecting: "Определяем ваш IP-адрес…",
      ipNotice:
        "Ваш IP-адрес: {ip}. При регистрации и принятии правил этот IP-адрес и время будут сохранены для обработки нарушений и содействия правоохранительным органам.",
      ipDetectFailed:
        "Не удалось определить IP-адрес. Убедитесь, что локальный сервер запущен.",
      registerHint:
        "Вы создаёте новый аккаунт. Пожалуйста, полностью прочитайте правила — прокрутите страницу до конца, чтобы принять их и вернуться к регистрации.",
      scrollToAccept:
        "Прокрутите до конца страницы, чтобы дочитать правила и принять их",
      acceptAndReturn:
        "Я дочитал(а) — принять и вернуться к регистрации",
    },
    auth: {
      wizard: {
        step4Intro:
          "Перед регистрацией ознакомьтесь с Правилами пользователя iGCraftLit. Нажмите кнопку ниже, чтобы прочитать полный текст на отдельной странице, затем примите правила и вернитесь к мастеру.",
        viewRules: "Прочитать Правила пользователя",
        acceptedInfo: "Правила прочитаны и приняты · IP: {ip} · {time}",
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
  console.log(`[iGM_AddModule8cLocales] 已写入 ${locale}.json`);
}
