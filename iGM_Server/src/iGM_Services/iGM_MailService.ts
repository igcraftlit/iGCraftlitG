/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_MailService.ts
 * 所属层：后端 / 基础服务层
 * 路由：G_Auth
 * 模块：iGM_MailService
 * 作用：全站统一邮件发送服务（163 邮箱 SMTP）
 * 内容：通用 send 方法、注册邮箱验证码邮件、密码重置令牌邮件；
 *       邮件文案至少中英双语，落款含团队名称与问题联系邮箱；
 *       本地调试可用控制台输出而不真正发信
 */

// 导入依赖 //
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { iGM_Config } from "../iGM_Config/iGM_Config";

// 类型定义 //
/** 邮件语言：至少支持中文与英文，繁中映射中文，日文/俄文映射英文 */
export type iGM_MailLocale = "zh" | "en";

export interface iGM_SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface iGM_VerifyMailParams {
  to: string;
  username: string;
  /** 6 位数字验证码 */
  code: string;
  /** 验证码有效分钟数 */
  ttlMinutes: number;
  locale: string;
}

export interface iGM_ResetMailParams {
  to: string;
  username: string;
  /** 一次性重置令牌（拼入前端重置页链接） */
  token: string;
  /** 令牌有效分钟数 */
  ttlMinutes: number;
  locale: string;
  /** 本次请求对应的前端站点地址（不传则使用配置默认值） */
  webBaseUrl?: string;
}

// 核心逻辑 //
/** 将五种前端语言映射到邮件支持的两种语言 */
function iGM_ResolveMailLocale(locale: string): iGM_MailLocale {
  if (locale === "zh-CN" || locale === "zh-TW") return "zh";
  return "en";
}

/** 懒加载 SMTP 传输器（控制台模式下不创建连接） */
let iGM_Transporter: Transporter | null = null;
/** 传输器是否已完成启动校验，避免重复输出日志 */
let iGM_TransporterVerified = false;

function iGM_GetTransporter(): Transporter {
  if (!iGM_Transporter) {
    iGM_Transporter = nodemailer.createTransport({
      host: iGM_Config.mail.host,
      port: iGM_Config.mail.port,
      secure: iGM_Config.mail.secure,
      auth: {
        user: iGM_Config.mail.user,
        pass: iGM_Config.mail.pass,
      },
    });
    // 启动时异步校验 SMTP 连接，失败仅警告不阻断服务
    iGM_VerifyTransporter(iGM_Transporter);
  }
  return iGM_Transporter;
}

/** 校验 Brevo SMTP 连接是否可用，结果写入日志 */
async function iGM_VerifyTransporter(transporter: Transporter): Promise<void> {
  if (iGM_TransporterVerified) return;
  iGM_TransporterVerified = true;
  try {
    await transporter.verify();
    console.log(
      `[iGM_MailService] SMTP 已连接：${iGM_Config.mail.host}:${iGM_Config.mail.port}（发件人 ${iGM_Config.mail.from}）`,
    );
  } catch (error) {
    console.error(
      `[iGM_MailService] SMTP 连接失败（${iGM_Config.mail.host}:${iGM_Config.mail.port}）：`,
      error instanceof Error ? error.message : error,
    );
  }
}

/** HTML 外壳：极简黑白排版，无图片依赖；统一展示团队落款与问题联系邮箱 */
function iGM_WrapHtml(
  title: string,
  bodyHtml: string,
  mailLocale: iGM_MailLocale,
): string {
  const teamLine =
    mailLocale === "zh"
      ? "iGCraftLit Community 团队 · igcraftlit.com"
      : "The iGCraftLit Community Team · igcraftlit.com";
  const contactLine =
    mailLocale === "zh"
      ? "如有问题请联系：igcraftlit@outlook.com"
      : "If you have any questions, please contact: igcraftlit@outlook.com";
  return `<!doctype html>
<html lang="zh">
  <body style="margin:0;padding:24px;background:#f7f7f8;font-family:-apple-system,'Segoe UI',Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <div style="font-family:Georgia,serif;font-weight:600;letter-spacing:0.02em;font-size:16px;color:#18181b;margin-bottom:20px;">iGCraftLit Community</div>
      <h1 style="font-size:18px;color:#18181b;margin:0 0 16px;">${title}</h1>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 12px;" />
      <p style="font-size:12px;color:#71717a;margin:0 0 4px;">${teamLine}</p>
      <p style="font-size:12px;color:#a1a1aa;margin:0;">${contactLine}</p>
    </div>
  </body>
</html>`;
}

/**
 * 统一发送入口
 * 控制台模式（本地自检）：仅输出邮件内容，不连接 SMTP
 * SMTP 模式：发送失败时抛出由调用方决定处理策略
 */
export async function iGM_SendMail(params: iGM_SendMailParams): Promise<void> {
  if (iGM_Config.auth.mailConsoleOnly) {
    console.log(
      `[iGM_MailService] 控制台模式（不实际发信）\n` +
        `  收件人：${params.to}\n  主题：${params.subject}\n` +
        `  文本内容：\n${params.text}\n`,
    );
    return;
  }

  // 发信凭据必须由环境变量提供（SMTP_USER / SMTP_PASS / MAIL_FROM）
  if (!iGM_Config.mail.user || !iGM_Config.mail.pass || !iGM_Config.mail.from) {
    throw new Error(
      "邮件服务未配置：请在环境变量中设置 SMTP_USER、SMTP_PASS（163 授权码）与 MAIL_FROM",
    );
  }

  await iGM_GetTransporter().sendMail({
    // 发件人显示团队名称；邮箱地址必须与 163 认证账号一致
    from: `"iGCraftLit Community" <${iGM_Config.mail.from}>`,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

/** 发送注册邮箱验证码邮件 */
export async function iGM_SendVerificationMail(
  params: iGM_VerifyMailParams,
): Promise<void> {
  const mailLocale = iGM_ResolveMailLocale(params.locale);
  const ttl = params.ttlMinutes;

  const subject =
    mailLocale === "zh"
      ? `【iGCraftLit】邮箱验证码：${params.code}`
      : `[iGCraftLit] Your verification code: ${params.code}`;

  const text =
    mailLocale === "zh"
      ? `你好 ${params.username}，\n\n` +
        `你的邮箱验证码是：${params.code}\n` +
        `验证码 ${ttl} 分钟内有效，请勿泄露给他人。\n\n` +
        `如非本人操作，请忽略此邮件。\n\n` +
        `iGCraftLit Community 团队\n` +
        `如有问题请联系：igcraftlit@outlook.com`
      : `Hello ${params.username},\n\n` +
        `Your email verification code is: ${params.code}\n` +
        `The code will expire in ${ttl} minutes. Please do not share it.\n\n` +
        `If you did not request this, you can ignore this email.\n\n` +
        `The iGCraftLit Community Team\n` +
        `If you have any questions, please contact: igcraftlit@outlook.com`;

  const html = iGM_WrapHtml(
    mailLocale === "zh" ? "邮箱验证" : "Verify your email",
    `<p style="font-size:14px;color:#52525b;margin:0 0 16px;">` +
      (mailLocale === "zh"
        ? `你好 ${params.username}，欢迎加入 iGCraftLit Community。`
        : `Hello ${params.username}, welcome to iGCraftLit Community.`) +
      `</p>` +
      `<p style="font-size:13px;color:#71717a;margin:0 0 10px;">` +
      (mailLocale === "zh" ? "你的验证码是：" : "Your verification code is:") +
      `</p>` +
      `<div style="font-size:30px;font-weight:700;letter-spacing:10px;color:#2563eb;` +
      `background:rgba(37,99,235,0.08);border-radius:8px;padding:16px;text-align:center;margin:0 0 16px;">` +
      `${params.code}</div>` +
      `<p style="font-size:12px;color:#a1a1aa;margin:0;">` +
      (mailLocale === "zh"
        ? `验证码 ${ttl} 分钟内有效，请勿泄露给他人。`
        : `Expires in ${ttl} minutes. Please do not share this code.`) +
      `</p>`,
    mailLocale,
  );

  await iGM_SendMail({ to: params.to, subject, html, text });
}

/** 发送密码重置邮件（含一次性重置链接） */
export async function iGM_SendResetPasswordMail(
  params: iGM_ResetMailParams,
): Promise<void> {
  const mailLocale = iGM_ResolveMailLocale(params.locale);
  const ttl = params.ttlMinutes;
  const webBaseUrl = params.webBaseUrl ?? iGM_Config.auth.webBaseUrl;
  const resetUrl = `${webBaseUrl}/G_Auth/reset-password?token=${encodeURIComponent(params.token)}`;

  const subject =
    mailLocale === "zh"
      ? "【iGCraftLit】重置你的密码"
      : "[iGCraftLit] Reset your password";

  const text =
    mailLocale === "zh"
      ? `你好 ${params.username}，\n\n` +
        `我们收到了重置你账户密码的请求，请在 ${ttl} 分钟内点击以下链接：\n` +
        `${resetUrl}\n\n` +
        `如非本人操作，请忽略此邮件，你的密码不会被更改。\n\n` +
        `iGCraftLit Community 团队\n` +
        `如有问题请联系：igcraftlit@outlook.com`
      : `Hello ${params.username},\n\n` +
        `We received a request to reset your password. ` +
        `Please open the link below within ${ttl} minutes:\n` +
        `${resetUrl}\n\n` +
        `If you did not request this, you can ignore this email and your password will stay unchanged.\n\n` +
        `The iGCraftLit Community Team\n` +
        `If you have any questions, please contact: igcraftlit@outlook.com`;

  const html = iGM_WrapHtml(
    mailLocale === "zh" ? "重置密码" : "Reset your password",
    `<p style="font-size:14px;color:#52525b;margin:0 0 16px;">` +
      (mailLocale === "zh"
        ? `你好 ${params.username}，我们收到了重置你账户密码的请求。`
        : `Hello ${params.username}, we received a request to reset your password.`) +
      `</p>` +
      `<a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;` +
      `text-decoration:none;font-size:14px;font-weight:500;border-radius:8px;padding:11px 22px;margin:0 0 16px;">` +
      (mailLocale === "zh" ? "重置密码" : "Reset password") +
      `</a>` +
      `<p style="font-size:13px;color:#71717a;margin:0 0 8px;">` +
      (mailLocale === "zh" ? "或复制以下链接到浏览器：" : "Or copy this link into your browser:") +
      `</p>` +
      `<p style="font-size:12px;color:#71717a;word-break:break-all;margin:0 0 16px;">${resetUrl}</p>` +
      `<p style="font-size:12px;color:#a1a1aa;margin:0;">` +
      (mailLocale === "zh"
        ? `链接 ${ttl} 分钟内有效，仅可使用一次。如非本人操作请忽略此邮件。`
        : `The link expires in ${ttl} minutes and can be used only once. Ignore this email if you did not request it.`) +
      `</p>`,
    mailLocale,
  );

  await iGM_SendMail({ to: params.to, subject, html, text });
}

// 导出 //
export default {
  iGM_SendMail,
  iGM_SendVerificationMail,
  iGM_SendResetPasswordMail,
};
