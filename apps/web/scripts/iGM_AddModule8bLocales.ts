/**
 * 文件路径：apps/web/scripts/iGM_AddModule8bLocales.ts
 * 所属层：前端 / 构建脚本层
 * 路由：无
 * 模块：iGM_AddModule8bLocales
 * 作用：向五个语言包增量写入模块八第二轮文案键（登录/注册五框向导界面）
 * 内容：注册五框向导文案（步骤副标题、上下步、
 *       阅读规定解锁、验证码横幅/输入/验证/重发/返回修改、欢迎回来）
 * 说明：幂等——重复执行仅覆盖同名字段，不触碰其他模块文案；
 *       根路径仍为品牌落地页，登录/注册位于 /G_Auth/login、/G_Auth/register
 */

// 导入依赖 //
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 类型定义 //
type iGM_Dict = Record<string, unknown>;

// 核心逻辑 //
/** 每个语言包的模块八第二轮文案 */
const iGM_LocalePayloads: Record<string, iGM_Dict> = {
  "zh-CN": {
    auth: {
      wizard: {
        stepSubtitle1: "输入用户名",
        stepSubtitle2: "填写邮箱",
        stepSubtitle3: "设置密码",
        stepSubtitle4: "阅读并同意用户管理规定",
        stepSubtitle5: "验证你的邮箱",
        next: "下一步",
        back: "上一步",
        agreeAndContinue: "已完成阅读，同意并继续",
        rulesFullPage: "查看完整规定页面",
        codeSentTo: "我们已向 {email} 发送了验证码，请输入邮件中的 6 位验证码",
        codePlaceholder: "请输入 6 位验证码",
        verify: "验证",
        backToEdit: "返回修改",
        welcomeBack: "欢迎回来，{name}",
        stepLabel: "第 {current} 步，共 {total} 步",
      },
    },
  },

  "zh-TW": {
    auth: {
      wizard: {
        stepSubtitle1: "輸入使用者名稱",
        stepSubtitle2: "填寫信箱",
        stepSubtitle3: "設定密碼",
        stepSubtitle4: "閱讀並同意使用者管理規定",
        stepSubtitle5: "驗證你的信箱",
        next: "下一步",
        back: "上一步",
        agreeAndContinue: "已完成閱讀，同意並繼續",
        rulesFullPage: "查看完整規定頁面",
        codeSentTo: "我們已向 {email} 發送了驗證碼，請輸入郵件中的 6 位驗證碼",
        codePlaceholder: "請輸入 6 位驗證碼",
        verify: "驗證",
        backToEdit: "返回修改",
        welcomeBack: "歡迎回來，{name}",
        stepLabel: "第 {current} 步，共 {total} 步",
      },
    },
  },

  en: {
    auth: {
      wizard: {
        stepSubtitle1: "Choose a username",
        stepSubtitle2: "Enter your email",
        stepSubtitle3: "Set a password",
        stepSubtitle4: "Read and accept the User Rules",
        stepSubtitle5: "Verify your email",
        next: "Next",
        back: "Back",
        agreeAndContinue: "Finished reading — agree and continue",
        rulesFullPage: "View the full rules page",
        codeSentTo:
          "We have sent a verification code to {email}. Please enter the 6-digit code from the email",
        codePlaceholder: "Enter the 6-digit code",
        verify: "Verify",
        backToEdit: "Edit details",
        welcomeBack: "Welcome back, {name}",
        stepLabel: "Step {current} of {total}",
      },
    },
  },

  ja: {
    auth: {
      wizard: {
        stepSubtitle1: "ユーザー名を入力",
        stepSubtitle2: "メールアドレスを入力",
        stepSubtitle3: "パスワードを設定",
        stepSubtitle4: "利用規約を読んで同意",
        stepSubtitle5: "メールアドレスを認証",
        next: "次へ",
        back: "戻る",
        agreeAndContinue: "読み終えました。同意して続行",
        rulesFullPage: "規約の全文を見る",
        codeSentTo:
          "{email} に認証コードを送信しました。メール内の 6 桁のコードを入力してください",
        codePlaceholder: "6 桁の認証コードを入力",
        verify: "認証する",
        backToEdit: "入力に戻る",
        welcomeBack: "おかえりなさい、{name}",
        stepLabel: "ステップ {current} / {total}",
      },
    },
  },

  ru: {
    auth: {
      wizard: {
        stepSubtitle1: "Введите имя пользователя",
        stepSubtitle2: "Укажите адрес эл. почты",
        stepSubtitle3: "Задайте пароль",
        stepSubtitle4: "Прочитайте и примите Правила",
        stepSubtitle5: "Подтвердите вашу эл. почту",
        next: "Далее",
        back: "Назад",
        agreeAndContinue: "Прочитано — принимаю и продолжаю",
        rulesFullPage: "Открыть полную страницу правил",
        codeSentTo:
          "Мы отправили код подтверждения на {email}. Введите 6-значный код из письма",
        codePlaceholder: "Введите 6-значный код",
        verify: "Подтвердить",
        backToEdit: "Изменить данные",
        welcomeBack: "С возвращением, {name}",
        stepLabel: "Шаг {current} из {total}",
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
  console.log(`[iGM_AddModule8bLocales] 已写入 ${locale}.json`);
}
