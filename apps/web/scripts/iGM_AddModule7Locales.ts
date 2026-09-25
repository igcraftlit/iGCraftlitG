/**
 * 文件路径：apps/web/scripts/iGM_AddModule7Locales.ts
 * 所属层：前端 / 构建脚本层
 * 路由：无
 * 模块：iGM_AddModule7Locales
 * 作用：向五个语言包增量写入模块七（组织认证）文案键
 * 内容：nav 入口、pages 元数据、orgVerify 业务文案（申请/状态/管理/邮件外的全部键）
 * 说明：幂等——重复执行仅覆盖同名字段，不触碰其他模块文案
 */

// 导入依赖 //
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 类型定义 //
type iGM_Dict = Record<string, unknown>;

// 核心逻辑 //
/** 每个语言包的模块七文案 */
const iGM_LocalePayloads: Record<string, {
  nav: Record<string, string>;
  pages: Record<string, { title: string; description: string }>;
  orgVerify: iGM_Dict;
}> = {
  "zh-CN": {
    nav: {
      orgVerify: "组织认证",
      orgVerifyStatus: "申请记录",
      adminOrgVerify: "认证审核",
    },
    pages: {
      orgVerify: { title: "组织认证", description: "申请加入受信任组织，通过审核后展示认证标识" },
      orgVerifyStatus: { title: "申请记录", description: "查看我的组织认证申请状态与历史" },
      adminOrgVerify: { title: "认证审核", description: "审核组织认证申请，通过或拒绝并填写审核意见" },
    },
    orgVerify: {
      apply: {
        chooseOrg: "选择受信任组织",
        reason: "申请理由",
        reasonPlaceholder: "请说明你与该组织的关联，以及申请认证的原因…",
        reasonHint: "必填，最多 1000 字",
        proof: "证明材料（可选）",
        proofHint: "可上传一份证明材料（图片或文档，最大 20MB）",
        proofUpload: "上传附件",
        proofUploading: "上传中…",
        proofUploaded: "已上传附件",
        proofRemove: "移除附件",
        submit: "提交申请",
        submitting: "提交中…",
        pendingTip: "你已有一条待审核的申请，可在申请记录页查看，或取消后重新申请。",
        viewStatus: "查看申请记录",
      },
      status: {
        pending: "待审核",
        approved: "已通过",
        rejected: "已拒绝",
        cancelled: "已取消",
      },
      list: {
        empty: "暂无申请记录",
        cancel: "取消申请",
        reason: "申请理由",
        proof: "证明材料",
        proofView: "查看附件",
        reviewComment: "审核意见",
        reviewer: "审核人",
        submittedAt: "提交于 {time}",
        updatedAt: "更新于 {time}",
        applyNow: "立即申请组织认证",
      },
      admin: {
        filterPending: "待审核",
        filterApproved: "已通过",
        filterRejected: "已拒绝",
        filterCancelled: "已取消",
        filterAll: "全部",
        empty: "没有匹配的申请",
        applicant: "申请人",
        approve: "通过",
        reject: "拒绝",
        commentPlaceholder: "审核意见（可选，最多 500 字）",
        selfTip: "不能审核自己的申请",
      },
      messages: {
        submitted: "申请已提交，请等待审核",
        cancelled: "申请已取消",
        approved: "已通过该申请",
        rejected: "已拒绝该申请",
      },
      errors: {
        badRequest: "请求参数不正确",
        reasonTooLong: "申请理由不能超过 1000 字",
        proofTooLong: "证明材料信息过长",
        commentTooLong: "审核意见不能超过 500 字",
        orgNotFound: "组织不存在或未开放认证",
        pendingExists: "你已有一条待审核的申请",
        notFound: "申请不存在",
        notPending: "该申请已不在待审核状态",
        cannotReviewOwn: "不能审核自己的申请",
        loadFailed: "加载失败，请稍后重试",
      },
      badge: "已认证：{name}",
    },
  },
  "zh-TW": {
    nav: {
      orgVerify: "組織認證",
      orgVerifyStatus: "申請記錄",
      adminOrgVerify: "認證審核",
    },
    pages: {
      orgVerify: { title: "組織認證", description: "申請加入受信任組織，通過審核後展示認證標識" },
      orgVerifyStatus: { title: "申請記錄", description: "查看我的組織認證申請狀態與歷史" },
      adminOrgVerify: { title: "認證審核", description: "審核組織認證申請，通過或拒絕並填寫審核意見" },
    },
    orgVerify: {
      apply: {
        chooseOrg: "選擇受信任組織",
        reason: "申請理由",
        reasonPlaceholder: "請說明你與該組織的關聯，以及申請認證的原因…",
        reasonHint: "必填，最多 1000 字",
        proof: "證明材料（可選）",
        proofHint: "可上傳一份證明材料（圖片或文件，最大 20MB）",
        proofUpload: "上傳附件",
        proofUploading: "上傳中…",
        proofUploaded: "已上傳附件",
        proofRemove: "移除附件",
        submit: "提交申請",
        submitting: "提交中…",
        pendingTip: "你已有一條待審核的申請，可在申請記錄頁查看，或取消後重新申請。",
        viewStatus: "查看申請記錄",
      },
      status: {
        pending: "待審核",
        approved: "已通過",
        rejected: "已拒絕",
        cancelled: "已取消",
      },
      list: {
        empty: "暫無申請記錄",
        cancel: "取消申請",
        reason: "申請理由",
        proof: "證明材料",
        proofView: "查看附件",
        reviewComment: "審核意見",
        reviewer: "審核人",
        submittedAt: "提交於 {time}",
        updatedAt: "更新於 {time}",
        applyNow: "立即申請組織認證",
      },
      admin: {
        filterPending: "待審核",
        filterApproved: "已通過",
        filterRejected: "已拒絕",
        filterCancelled: "已取消",
        filterAll: "全部",
        empty: "沒有匹配的申請",
        applicant: "申請人",
        approve: "通過",
        reject: "拒絕",
        commentPlaceholder: "審核意見（可選，最多 500 字）",
        selfTip: "不能審核自己的申請",
      },
      messages: {
        submitted: "申請已提交，請等待審核",
        cancelled: "申請已取消",
        approved: "已通過該申請",
        rejected: "已拒絕該申請",
      },
      errors: {
        badRequest: "請求參數不正確",
        reasonTooLong: "申請理由不能超過 1000 字",
        proofTooLong: "證明材料資訊過長",
        commentTooLong: "審核意見不能超過 500 字",
        orgNotFound: "組織不存在或未開放認證",
        pendingExists: "你已有一條待審核的申請",
        notFound: "申請不存在",
        notPending: "該申請已不在待審核狀態",
        cannotReviewOwn: "不能審核自己的申請",
        loadFailed: "載入失敗，請稍後重試",
      },
      badge: "已認證：{name}",
    },
  },
  "en": {
    nav: {
      orgVerify: "Org Verification",
      orgVerifyStatus: "My Applications",
      adminOrgVerify: "Org Review",
    },
    pages: {
      orgVerify: { title: "Organization Verification", description: "Apply to join a trusted organization and show a verified badge" },
      orgVerifyStatus: { title: "My Applications", description: "Track the status and history of your organization verification applications" },
      adminOrgVerify: { title: "Organization Review", description: "Review organization verification applications with comments" },
    },
    orgVerify: {
      apply: {
        chooseOrg: "Choose a trusted organization",
        reason: "Reason",
        reasonPlaceholder: "Explain your relationship with the organization and why you are applying…",
        reasonHint: "Required, up to 1000 characters",
        proof: "Proof (optional)",
        proofHint: "Upload one supporting file (image or document, max 20MB)",
        proofUpload: "Upload file",
        proofUploading: "Uploading…",
        proofUploaded: "File uploaded",
        proofRemove: "Remove file",
        submit: "Submit application",
        submitting: "Submitting…",
        pendingTip: "You already have a pending application. View it in My Applications, or cancel it to apply again.",
        viewStatus: "View my applications",
      },
      status: {
        pending: "Pending",
        approved: "Approved",
        rejected: "Rejected",
        cancelled: "Cancelled",
      },
      list: {
        empty: "No applications yet",
        cancel: "Cancel application",
        reason: "Reason",
        proof: "Proof",
        proofView: "View file",
        reviewComment: "Review comment",
        reviewer: "Reviewer",
        submittedAt: "Submitted {time}",
        updatedAt: "Updated {time}",
        applyNow: "Apply for organization verification",
      },
      admin: {
        filterPending: "Pending",
        filterApproved: "Approved",
        filterRejected: "Rejected",
        filterCancelled: "Cancelled",
        filterAll: "All",
        empty: "No matching applications",
        applicant: "Applicant",
        approve: "Approve",
        reject: "Reject",
        commentPlaceholder: "Review comment (optional, up to 500 characters)",
        selfTip: "You cannot review your own application",
      },
      messages: {
        submitted: "Application submitted. Please wait for review.",
        cancelled: "Application cancelled",
        approved: "Application approved",
        rejected: "Application rejected",
      },
      errors: {
        badRequest: "Invalid request parameters",
        reasonTooLong: "Reason must be at most 1000 characters",
        proofTooLong: "Proof value is too long",
        commentTooLong: "Review comment must be at most 500 characters",
        orgNotFound: "Organization not found or not open for verification",
        pendingExists: "You already have a pending application",
        notFound: "Application not found",
        notPending: "This application is no longer pending",
        cannotReviewOwn: "You cannot review your own application",
        loadFailed: "Failed to load. Please try again later.",
      },
      badge: "Verified: {name}",
    },
  },
  "ja": {
    nav: {
      orgVerify: "組織認証",
      orgVerifyStatus: "申請履歴",
      adminOrgVerify: "認証審査",
    },
    pages: {
      orgVerify: { title: "組織認証", description: "信頼された組織への参加を申請し、承認後に認証バッジを表示" },
      orgVerifyStatus: { title: "申請履歴", description: "組織認証の申請状況と履歴を確認" },
      adminOrgVerify: { title: "認証審査", description: "組織認証申請を審査し、承認または拒否してコメントを記入" },
    },
    orgVerify: {
      apply: {
        chooseOrg: "信頼された組織を選択",
        reason: "申請理由",
        reasonPlaceholder: "組織との関係と申請理由を記入してください…",
        reasonHint: "必須、最大1000文字",
        proof: "証明資料（任意）",
        proofHint: "証明資料を1件アップロードできます（画像または文書、最大20MB）",
        proofUpload: "ファイルをアップロード",
        proofUploading: "アップロード中…",
        proofUploaded: "アップロード済み",
        proofRemove: "ファイルを削除",
        submit: "申請を送信",
        submitting: "送信中…",
        pendingTip: "審査中の申請があります。申請履歴で確認するか、キャンセルして再申請してください。",
        viewStatus: "申請履歴を見る",
      },
      status: {
        pending: "審査中",
        approved: "承認済み",
        rejected: "拒否",
        cancelled: "キャンセル済み",
      },
      list: {
        empty: "申請履歴はありません",
        cancel: "申請をキャンセル",
        reason: "申請理由",
        proof: "証明資料",
        proofView: "添付を見る",
        reviewComment: "審査コメント",
        reviewer: "審査担当",
        submittedAt: "申請日時 {time}",
        updatedAt: "更新日時 {time}",
        applyNow: "組織認証を申請する",
      },
      admin: {
        filterPending: "審査中",
        filterApproved: "承認済み",
        filterRejected: "拒否",
        filterCancelled: "キャンセル済み",
        filterAll: "すべて",
        empty: "該当する申請がありません",
        applicant: "申請者",
        approve: "承認",
        reject: "拒否",
        commentPlaceholder: "審査コメント（任意、最大500文字）",
        selfTip: "自分の申請は審査できません",
      },
      messages: {
        submitted: "申請を送信しました。審査をお待ちください",
        cancelled: "申請をキャンセルしました",
        approved: "申請を承認しました",
        rejected: "申請を拒否しました",
      },
      errors: {
        badRequest: "リクエストパラメータが正しくありません",
        reasonTooLong: "申請理由は1000文字以内で入力してください",
        proofTooLong: "証明資料の情報が長すぎます",
        commentTooLong: "審査コメントは500文字以内で入力してください",
        orgNotFound: "組織が存在しないか、認証を受け付けていません",
        pendingExists: "審査中の申請がすでにあります",
        notFound: "申請が見つかりません",
        notPending: "この申請は審査中ではありません",
        cannotReviewOwn: "自分の申請は審査できません",
        loadFailed: "読み込みに失敗しました。後でもう一度お試しください",
      },
      badge: "認証済み：{name}",
    },
  },
  "ru": {
    nav: {
      orgVerify: "Верификация организации",
      orgVerifyStatus: "Мои заявки",
      adminOrgVerify: "Проверка заявок",
    },
    pages: {
      orgVerify: { title: "Верификация организации", description: "Подайте заявку на вступление в доверенную организацию и получите значок" },
      orgVerifyStatus: { title: "Мои заявки", description: "Статус и история ваших заявок на верификацию организации" },
      adminOrgVerify: { title: "Проверка заявок", description: "Рассмотрение заявок на верификацию организаций с комментариями" },
    },
    orgVerify: {
      apply: {
        chooseOrg: "Выберите доверенную организацию",
        reason: "Причина заявки",
        reasonPlaceholder: "Опишите вашу связь с организацией и причину подачи заявки…",
        reasonHint: "Обязательно, до 1000 символов",
        proof: "Подтверждение (необязательно)",
        proofHint: "Можно загрузить один файл (изображение или документ, до 20 МБ)",
        proofUpload: "Загрузить файл",
        proofUploading: "Загрузка…",
        proofUploaded: "Файл загружен",
        proofRemove: "Удалить файл",
        submit: "Отправить заявку",
        submitting: "Отправка…",
        pendingTip: "У вас уже есть заявка на рассмотрении. Посмотрите её в «Мои заявки» или отмените, чтобы подать заново.",
        viewStatus: "Мои заявки",
      },
      status: {
        pending: "На рассмотрении",
        approved: "Одобрена",
        rejected: "Отклонена",
        cancelled: "Отменена",
      },
      list: {
        empty: "Заявок пока нет",
        cancel: "Отменить заявку",
        reason: "Причина",
        proof: "Подтверждение",
        proofView: "Открыть файл",
        reviewComment: "Комментарий проверки",
        reviewer: "Проверяющий",
        submittedAt: "Подана {time}",
        updatedAt: "Обновлена {time}",
        applyNow: "Подать заявку на верификацию",
      },
      admin: {
        filterPending: "На рассмотрении",
        filterApproved: "Одобренные",
        filterRejected: "Отклонённые",
        filterCancelled: "Отменённые",
        filterAll: "Все",
        empty: "Нет подходящих заявок",
        applicant: "Заявитель",
        approve: "Одобрить",
        reject: "Отклонить",
        commentPlaceholder: "Комментарий проверки (необязательно, до 500 символов)",
        selfTip: "Нельзя проверять собственную заявку",
      },
      messages: {
        submitted: "Заявка отправлена, ожидайте проверки",
        cancelled: "Заявка отменена",
        approved: "Заявка одобрена",
        rejected: "Заявка отклонена",
      },
      errors: {
        badRequest: "Некорректные параметры запроса",
        reasonTooLong: "Причина должна быть не длиннее 1000 символов",
        proofTooLong: "Слишком длинное значение подтверждения",
        commentTooLong: "Комментарий должен быть не длиннее 500 символов",
        orgNotFound: "Организация не найдена или верификация недоступна",
        pendingExists: "У вас уже есть заявка на рассмотрении",
        notFound: "Заявка не найдена",
        notPending: "Заявка больше не ожидает проверки",
        cannotReviewOwn: "Нельзя проверять собственную заявку",
        loadFailed: "Не удалось загрузить. Попробуйте позже.",
      },
      badge: "Подтверждено: {name}",
    },
  },
};

/** 深度合并（仅覆盖叶子，缺失键补齐） */
function iGM_Merge(target: iGM_Dict, patch: iGM_Dict): iGM_Dict {
  for (const [key, value] of Object.entries(patch)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
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
  iGM_Merge(data, payload as unknown as iGM_Dict);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`[iGM_AddModule7Locales] 已写入 ${locale}.json`);
}
