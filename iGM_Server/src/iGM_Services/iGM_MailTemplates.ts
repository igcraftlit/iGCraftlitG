/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_MailTemplates.ts
 * 所属层：后端 / 基础服务层
 * 路由：G_Auth（注册验证、修改密码验证码）
 * 模块：iGM_MailTemplates
 * 作用：验证码邮件多语言模板与科幻终端风格 HTML 构建
 * 内容：五语言模板（zh-CN、zh-TW、en、ja、ru）、占位符替换、
 *       验证码方框（深色卡片 #1b212e、圆角 12px、左上角 Orbitron 字体站名、
 *       验证码 36px #6d8eff 字间距 8px）、统一页脚（官网 + 双联系邮箱）
 * 约定：称呼统一为「探星者」；正文含团队理念；
 *       占位符统一为 {username}、{code}、{expireMinutes}，由 iGM_MailService 发送时替换
 */

// 导入依赖 //
// （纯模板数据与字符串构建，无运行时依赖）

// 类型定义 //
/** 邮件支持的全部语言（与前端语言一一对应） */
export type iGM_MailLocale = "zh-CN" | "zh-TW" | "en" | "ja" | "ru";

/** 验证码邮件场景 */
export type iGM_CodeMailScenario = "register" | "passwordChange";

/** 单语言验证码邮件模板 */
export interface iGM_CodeMailTemplate {
  /** 邮件主题（◎ 前缀，不含占位符） */
  subject: string;
  /** 称呼（探星者 {username}） */
  greet: string;
  /** 团队理念段 */
  intro: string;
  /** 社区愿景段 */
  vision: string;
  /** 注册验证场景行 */
  scenarioRegister: string;
  /** 修改密码场景行 */
  scenarioPasswordChange: string;
  /** 纯文本验证码行（您的验证码是：{code}） */
  codeLabel: string;
  /** HTML 验证码方框内上方小字 */
  codeBoxLabel: string;
  /** 有效期与安全提示（{expireMinutes}） */
  validity: string;
  /** 团队落款 */
  sign: string;
  /** 页脚官网标签 */
  siteLabel: string;
  /** 页脚联系邮箱标签 */
  contactLabel: string;
}

/** 发送时的动态值 */
export interface iGM_CodeMailValues {
  username: string;
  code: string;
  expireMinutes: number;
}

// 核心逻辑 //
/** 五语言模板表（不得修改理念句式与页脚内容） */
const iGM_CodeMailTemplates: Record<iGM_MailLocale, iGM_CodeMailTemplate> = {
  "zh-CN": {
    subject: "◎ iGCraftLit Community 验证码",
    greet: "您好，探星者 {username}。",
    intro:
      "欢迎加入 iGCraftLit Community。我们因梦想而聚，因创造而强，在探索中前行，在创新中突破，以求真之心共建社区。",
    vision:
      "在这里，每一位探星者都是社区的建造者。我们相信，每一次探索都在拓展认知的边界，每一次创新都在点亮未知的星图。愿你在 iGCraftLit 找到属于自己的轨道，与我们一起，向着更远的星辰出发。",
    scenarioRegister: "您正在验证注册邮箱，请使用以下验证码完成确认：",
    scenarioPasswordChange: "您正在修改账户密码，请使用以下验证码确认身份：",
    codeLabel: "您的验证码是：{code}",
    codeBoxLabel: "您的验证码",
    validity:
      "该验证码 {expireMinutes} 分钟内有效，请勿泄露给他人。如果这不是您本人的操作，请忽略此邮件。",
    sign: "—— iGCraftLit Community 团队",
    siteLabel: "团队官网",
    contactLabel: "联系邮箱",
  },
  "zh-TW": {
    subject: "◎ iGCraftLit Community 驗證碼",
    greet: "您好，探星者 {username}。",
    intro:
      "歡迎加入 iGCraftLit Community。我們因夢想而聚，因創造而強，在探索中前行，在創新中突破，以求真之心共建社區。",
    vision:
      "在這裡，每一位探星者都是社區的建造者。我們相信，每一次探索都在拓展認知的邊界，每一次創新都在點亮未知的星圖。願你在 iGCraftLit 找到屬於自己的軌道，與我們一起，向著更遠的星辰出發。",
    scenarioRegister: "您正在驗證註冊信箱，請使用以下驗證碼完成確認：",
    scenarioPasswordChange: "您正在修改帳戶密碼，請使用以下驗證碼確認身分：",
    codeLabel: "您的驗證碼是：{code}",
    codeBoxLabel: "您的驗證碼",
    validity:
      "該驗證碼 {expireMinutes} 分鐘內有效，請勿洩露給他人。如果這不是您本人的操作，請忽略此郵件。",
    sign: "—— iGCraftLit Community 團隊",
    siteLabel: "團隊官網",
    contactLabel: "聯絡信箱",
  },
  en: {
    subject: "◎ iGCraftLit Community Verification Code",
    greet: "Greetings, Starchaser {username}.",
    intro:
      "Welcome to iGCraftLit Community. We are gathered by dreams, strengthened by creation, advancing through exploration, breaking boundaries through innovation, and building our community with a heart devoted to truth.",
    vision:
      "Here, every Starchaser is a builder of the community. We believe every exploration expands the boundaries of knowledge, and every innovation lights up the uncharted star map. May you find your own orbit at iGCraftLit and set out with us toward more distant stars.",
    scenarioRegister: "You are verifying your registration email. Use the code below to confirm:",
    scenarioPasswordChange: "You are changing your account password. Use the code below to verify your identity:",
    codeLabel: "Your verification code is: {code}",
    codeBoxLabel: "Your verification code",
    validity:
      "This code expires in {expireMinutes} minutes. Please do not share it with anyone. If this was not you, simply ignore this email.",
    sign: "—— The iGCraftLit Community Team",
    siteLabel: "Website",
    contactLabel: "Contact",
  },
  ja: {
    subject: "◎ iGCraftLit Community 認証コード",
    greet: "こんにちは、スターチェイサー {username} さま。",
    intro:
      "iGCraftLit Community へようこそ。私たちは夢によって集い、創造によって強くなり、探求の中で前進し、イノベーションによって限界を突破し、真実を求める心でコミュニティを築いていきます。",
    vision:
      "ここでは、すべてのスターチェイサーがコミュニティの建造者です。すべての探求が認識の境界を広げ、すべてのイノベーションが未知の星図を照らすと信じています。iGCraftLit であなた自身の軌道を見つけ、私たちとともに、より遠い星々へ向かって出発してください。",
    scenarioRegister: "登録メールアドレスの認証を行っています。以下のコードで確認を完了してください：",
    scenarioPasswordChange: "アカウントのパスワードを変更しています。以下のコードで本人確認を行ってください：",
    codeLabel: "認証コード：{code}",
    codeBoxLabel: "認証コード",
    validity:
      "このコードは {expireMinutes} 分間有効です。他人に教えないでください。心当たりがない場合は、このメールを無視してください。",
    sign: "—— iGCraftLit Community チーム",
    siteLabel: "公式サイト",
    contactLabel: "お問い合わせ",
  },
  ru: {
    subject: "◎ iGCraftLit Community Код подтверждения",
    greet: "Здравствуйте, Звёздный странник {username}.",
    intro:
      "Добро пожаловать в iGCraftLit Community. Мы собрались вместе благодаря мечте, крепнем через созидание, движемся вперёд в исследованиях, совершаем прорывы в инновациях и строим сообщество с сердцем, ищущим истину.",
    vision:
      "Здесь каждый Звёздный странник — созидатель сообщества. Мы верим, что каждое исследование расширяет границы познания, а каждая инновация зажигает новые созвездия на карте неизведанного. Пусть в iGCraftLit вы найдёте свою орбиту и вместе с нами отправитесь к более далёким звёздам.",
    scenarioRegister: "Вы подтверждаете почту при регистрации. Используйте код ниже:",
    scenarioPasswordChange: "Вы меняете пароль своей учётной записи. Используйте код ниже для подтверждения личности:",
    codeLabel: "Ваш код подтверждения: {code}",
    codeBoxLabel: "Ваш код подтверждения",
    validity:
      "Код действителен {expireMinutes} минут. Не сообщайте его никому. Если это были не вы, просто проигнорируйте это письмо.",
    sign: "—— Команда iGCraftLit Community",
    siteLabel: "Официальный сайт",
    contactLabel: "Контакты",
  },
};

/** 按前端语言解析邮件模板（未知语言回退英文） */
export function iGM_ResolveCodeMailTemplate(locale: string): iGM_CodeMailTemplate {
  if (locale === "zh-TW") return iGM_CodeMailTemplates["zh-TW"];
  if (locale === "zh-CN" || locale.startsWith("zh")) return iGM_CodeMailTemplates["zh-CN"];
  if (locale === "ja") return iGM_CodeMailTemplates.ja;
  if (locale === "ru") return iGM_CodeMailTemplates.ru;
  return iGM_CodeMailTemplates.en;
}

/** 替换模板占位符：{username}、{code}、{expireMinutes} */
export function iGM_FillPlaceholders(input: string, values: iGM_CodeMailValues): string {
  return input
    .replaceAll("{username}", values.username)
    .replaceAll("{code}", values.code)
    .replaceAll("{expireMinutes}", String(values.expireMinutes));
}

/** 验证码方框：深色卡片，左上角 Orbitron 站名，居中大号验证码 */
function iGM_CodeBoxHtml(code: string, boxLabel: string): string {
  return (
    `<div style="background:#1b212e;border:1px solid #2b364a;border-radius:12px;` +
    `padding:14px 18px 26px;margin:0 0 18px;">` +
    // 方框左上角：科幻字体站名（Orbitron，回退 Michroma/系统字体）
    `<div style="font-family:'Orbitron','Michroma','Segoe UI',Arial,sans-serif;` +
    `font-size:10px;font-weight:600;letter-spacing:2px;color:#8ea2ff;` +
    `text-transform:uppercase;margin:0 0 18px;">iGCraftLit Community</div>` +
    `<div style="font-size:12px;color:#aab4d0;text-align:center;margin:0 0 10px;">${boxLabel}</div>` +
    `<div style="font-family:'Orbitron','Michroma','Segoe UI',Arial,sans-serif;` +
    `font-size:36px;line-height:1.2;font-weight:700;color:#6d8eff;` +
    `letter-spacing:8px;text-align:center;">${code}</div>` +
    `</div>`
  );
}

/** 页脚：官网 + 双联系邮箱（.Net / .CN），全部语言统一 */
function iGM_MailFooterHtml(t: iGM_CodeMailTemplate): string {
  return (
    `<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 12px;" />` +
    `<p style="font-size:12px;color:#71717a;margin:0 0 4px;">` +
    `${t.siteLabel}：<a href="https://igcraftlit.com" style="color:#2563eb;text-decoration:none;">https://igcraftlit.com</a></p>` +
    `<p style="font-size:12px;color:#71717a;margin:0;">` +
    `${t.contactLabel}：<a href="mailto:igcraftlit@outlook.com" style="color:#2563eb;text-decoration:none;">igcraftlit@outlook.com</a> (.Net) / ` +
    `<a href="mailto:igcraftlit@163.com" style="color:#2563eb;text-decoration:none;">igcraftlit@163.com</a> (.CN)</p>`
  );
}

/** 构建验证码邮件 HTML（科幻终端风格） */
export function iGM_CodeMailHtml(
  t: iGM_CodeMailTemplate,
  scenario: iGM_CodeMailScenario,
  values: iGM_CodeMailValues,
): string {
  const greet = iGM_FillPlaceholders(t.greet, values);
  const scenarioLine =
    scenario === "register" ? t.scenarioRegister : t.scenarioPasswordChange;
  const validity = iGM_FillPlaceholders(t.validity, values);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:24px;background:#f7f7f8;font-family:-apple-system,'Segoe UI',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
    <div style="font-family:'Orbitron','Michroma','Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;color:#18181b;margin:0 0 20px;">iGCraftLit Community</div>
    <p style="font-size:14px;color:#52525b;margin:0 0 14px;">${greet}</p>
    <p style="font-size:13px;color:#71717a;line-height:1.8;margin:0 0 12px;">${t.intro}</p>
    <p style="font-size:13px;color:#71717a;line-height:1.8;margin:0 0 14px;">${t.vision}</p>
    <p style="font-size:14px;color:#3f3f46;margin:0 0 12px;">${scenarioLine}</p>
    ${iGM_CodeBoxHtml(values.code, t.codeBoxLabel)}
    <p style="font-size:12px;color:#a1a1aa;margin:0 0 16px;">${validity}</p>
    <p style="font-size:12px;color:#71717a;margin:0;">${t.sign}</p>
    ${iGM_MailFooterHtml(t)}
  </div>
</body>
</html>`;
}

/** 构建验证码邮件纯文本（用户基准结构） */
export function iGM_CodeMailText(
  t: iGM_CodeMailTemplate,
  scenario: iGM_CodeMailScenario,
  values: iGM_CodeMailValues,
): string {
  const greet = iGM_FillPlaceholders(t.greet, values);
  const scenarioLine =
    scenario === "register" ? t.scenarioRegister : t.scenarioPasswordChange;
  const validity = iGM_FillPlaceholders(t.validity, values);
  const codeLine = iGM_FillPlaceholders(t.codeLabel, values);

  return (
    `${greet}\n\n` +
    `${t.intro}\n\n` +
    `${t.vision}\n\n` +
    `${scenarioLine}\n` +
    `${codeLine}\n\n` +
    `${validity}\n\n` +
    `${t.sign}\n\n` +
    `${t.siteLabel}：https://igcraftlit.com\n` +
    `${t.contactLabel}：igcraftlit@outlook.com (.Net) / igcraftlit@163.com (.CN)`
  );
}

// 导出 //
export default {
  iGM_ResolveCodeMailTemplate,
  iGM_FillPlaceholders,
  iGM_CodeMailHtml,
  iGM_CodeMailText,
};
