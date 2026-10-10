/**
 * 文件路径：apps/exam/src/iGM_i18n/iGM_I18nTypes.ts
 * 所属层：前端 / 国际化层
 * 路由：全局
 * 模块：iGM_ExamI18n
 * 作用：轻量语言包的类型定义与支持语言枚举
 * 内容：支持语言联合类型、语言包键结构（扁平 camelCase）
 * 说明：不引入 next-intl，不做路由级多语言，仅用于 React Context 文案查表
 */

// 类型定义 //
/** 支持的界面语言 */
export type iGM_ExamLang = "zh-CN" | "en";

/** 语言展示名：使用语言自身书写形式，供切换器直接展示 */
export const iGM_ExamLangLabels: Record<iGM_ExamLang, string> = {
  "zh-CN": "中文",
  en: "English",
};

/** 语言包结构：键为扁平 camelCase 标识，值为纯文本（可含 {token} 占位） */
export interface iGM_I18nDict {
  // 机构与刊头
  instituteName: string;
  mastheadMeta: string;
  mastheadSubtitle: string;
  navExaminations: string;
  navAdmin: string;
  themeGroupLabel: string;
  themeLight: string;
  themeDark: string;
  langButtonLabel: string;
  langChinese: string;
  langEnglish: string;
  // 页脚
  footerCopyright: string;
  // 试卷索引页
  listEyebrow: string;
  listTitle: string;
  listLead: string;
  listStatPapers: string;
  listStatItems: string;
  listSectionIndex: string;
  listRetrieving: string;
  listEmpty: string;
  listError: string;
  actionRefresh: string;
  actionRetry: string;
  // 档案卡片
  cardDuration: string;
  cardTotal: string;
  cardItems: string;
  unitMinutes: string;
  unitPoints: string;
  // 试卷详情页
  detailRetrieving: string;
  detailMissing: string;
  detailError: string;
  detailBack: string;
  detailCatalogue: string;
  detailEyebrow: string;
  detailSpecTitle: string;
  detailPaperTitle: string;
  detailTocTitle: string;
  detailNoContent: string;
  detailSubmitTitle: string;
  detailSubmitLead: string;
  fieldSubject: string;
  fieldIssuer: string;
  fieldReviewer: string;
  fieldDuration: string;
  fieldTotalMarks: string;
  fieldItemCount: string;
  noticeTag: string;
  // 计时器
  timerTitle: string;
  timerPause: string;
  timerResume: string;
  timerReset: string;
  timerNoLimit: string;
  timerExpired: string;
  timerElapsed: string;
  // 交卷
  stampSubmit: string;
  stampSubmitted: string;
  stampError: string;
  stampNote: string;
  // 管理端
  adminEyebrow: string;
  adminTitle: string;
  adminLead: string;
  adminIngestTitle: string;
  adminIngestLead: string;
  adminUpload: string;
  adminProofTitle: string;
  adminPreviewLabel: string;
  adminPreviewDeleted: string;
  adminDownloadOriginal: string;
  adminRecognizedLabel: string;
  adminParseLabel: string;
  adminFieldTitle: string;
  adminFieldDuration: string;
  adminFieldTotal: string;
  adminFieldItems: string;
  adminFieldNotice: string;
  adminFieldContent: string;
  adminPlaceholderTitle: string;
  adminPlaceholderSubject: string;
  adminPlaceholderIssuer: string;
  adminPlaceholderReviewer: string;
  adminPlaceholderNotice: string;
  adminPlaceholderContent: string;
  adminSave: string;
  adminConfirm: string;
  adminReparse: string;
  adminDelete: string;
  adminConfirmTitle: string;
  adminConfirmBody: string;
  adminConfirmYes: string;
  adminConfirmNo: string;
  adminLedgerTitle: string;
  adminLedgerEntries: string;
  adminLedgerLoading: string;
  adminLedgerEmpty: string;
  adminLedgerError: string;
  adminColCode: string;
  adminColTitle: string;
  adminColSubject: string;
  adminColTotal: string;
  adminColSubmissions: string;
  adminColStatus: string;
  adminReview: string;
  adminUploadFailed: string;
  adminSaveFailed: string;
  adminConfirmFailed: string;
  adminReparseFailed: string;
  adminDeleteFailed: string;
  adminIngested: string;
  adminSaved: string;
  adminConfirmed: string;
  adminReparsed: string;
  adminDeleted: string;
  // 状态标签
  statusDraft: string;
  statusPublished: string;
  statusClosed: string;
  parseStatusPending: string;
  parseStatusParsed: string;
  parseStatusConfirmed: string;
  parseStatusFailed: string;
}

/** 语言包键联合类型 */
export type iGM_I18nKey = keyof iGM_I18nDict;
