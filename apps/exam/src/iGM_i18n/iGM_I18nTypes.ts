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
  navUpload: string;
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
  listSearchPlaceholder: string;
  listSearchNoResult: string;
  actionRefresh: string;
  actionRetry: string;
  // 档案卡片
  cardDuration: string;
  cardTotal: string;
  cardItems: string;
  unitMinutes: string;
  unitPoints: string;
  /** 占用空间文案，{size} 为 MB 数值 */
  fileSizeValue: string;
  // 试卷详情页
  detailRetrieving: string;
  detailMissing: string;
  detailError: string;
  detailBack: string;
  detailCatalogue: string;
  detailEyebrow: string;
  detailSpecTitle: string;
  detailPaperTitle: string;
  detailNoContent: string;
  detailPreviewHint: string;
  paperZoomOut: string;
  paperZoomFit: string;
  paperZoomIn: string;
  detailSubmitTitle: string;
  detailSubmitLead: string;
  fieldSubject: string;
  fieldIssuer: string;
  fieldReviewer: string;
  fieldDuration: string;
  fieldTotalMarks: string;
  fieldItemCount: string;
  /** 顶部信息栏：限时标签 */
  statDuration: string;
  /** 题数单位（题 / items） */
  unitQuestions: string;
  noticeTag: string;
  // 答案附件
  answerSectionTitle: string;
  answerSectionLead: string;
  answerView: string;
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
  adminPreviewTitle: string;
  adminPreviewLabel: string;
  adminPreviewDeleted: string;
  adminDownloadOriginal: string;
  adminSpecLabel: string;
  adminFieldTitle: string;
  adminFieldDuration: string;
  adminFieldTotal: string;
  adminFieldItems: string;
  adminFieldNotice: string;
  adminPlaceholderTitle: string;
  adminPlaceholderSubject: string;
  adminPlaceholderIssuer: string;
  adminPlaceholderReviewer: string;
  adminPlaceholderNotice: string;
  // 管理端：信息修改
  adminEditInfo: string;
  adminEditSpec: string;
  adminSaveMeta: string;
  adminSaveMetaDone: string;
  adminSaveMetaFailed: string;
  adminSaveMetaRequired: string;
  // 管理端：答案附件
  adminAnswerLabel: string;
  adminAnswerUpload: string;
  adminAnswerReplace: string;
  adminAnswerNone: string;
  adminAnswerUploading: string;
  adminAnswerOnlyPdf: string;
  adminAnswerTooLarge: string;
  adminAnswerFailed: string;
  adminAnswerUploaded: string;
  adminAnswerView: string;
  adminReparse: string;
  adminDelete: string;
  adminCancel: string;
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
  adminReparseFailed: string;
  adminDeleteFailed: string;
  adminIngested: string;
  adminReparsed: string;
  adminDeleted: string;
  adminDiscarded: string;
  adminDiscardTitle: string;
  adminDiscardBody: string;
  // 部署状态
  deployTitle: string;
  deployBody: string;
  deployBack: string;
  deployDone: string;
  // 转换进度
  adminProgressTitle: string;
  adminProgressConverting: string;
  adminProgressWaiting: string;
  adminProgressDone: string;
  adminProgressFailed: string;
  adminConvertingBanner: string;
  adminGotoUpload: string;
  // 上传页
  uploadEyebrow: string;
  uploadTitle: string;
  uploadLead: string;
  uploadFormTitle: string;
  uploadFileTitle: string;
  uploadDropHint: string;
  uploadPick: string;
  uploadOnlyPdf: string;
  uploadTooLarge: string;
  uploadRequiredHint: string;
  uploadInvalidNumber: string;
  uploadSubmit: string;
  uploadFailed: string;
  // 状态标签
  statusDraft: string;
  statusPublished: string;
  statusDeploying: string;
  statusClosed: string;
  convertStatusPending: string;
  convertStatusConverting: string;
  convertStatusCompleted: string;
  convertStatusFailed: string;
}

/** 语言包键联合类型 */
export type iGM_I18nKey = keyof iGM_I18nDict;
