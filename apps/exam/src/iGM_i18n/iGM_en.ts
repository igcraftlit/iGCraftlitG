/**
 * 文件路径：apps/exam/src/iGM_i18n/iGM_en.ts
 * 所属层：前端 / 国际化层
 * 路由：全局
 * 模块：iGM_ExamI18n
 * 作用：英文语言包
 * 内容：机构刊头、导航、索引页、详情页、计时器、解析与确认、管理端全部文案
 * 说明：扁平 camelCase 键，与 iGM_zhCN 结构严格一致；{token} 为运行时占位符
 */

// 导入依赖 //
import type { iGM_I18nDict } from "./iGM_I18nTypes";

// 核心逻辑 //
/** 英文语言包 */
export const iGM_en: iGM_I18nDict = {
  // 机构与刊头
  instituteName: "iG&M Educational Examination Institute",
  mastheadMeta: "VOL. {volume} · NO. {issue}",
  mastheadSubtitle: "EST. 2026 · ACADEMIC ASSESSMENT",
  navExaminations: "Examinations",
  navAdmin: "Exam Management",
  navUpload: "Upload Paper",
  themeGroupLabel: "Colour scheme",
  themeLight: "Light",
  themeDark: "Dark",
  langButtonLabel: "Language",
  langChinese: "中文",
  langEnglish: "English",
  // 页脚
  footerCopyright: "© {year} iGCraftLit Community",
  // 试卷索引页
  listEyebrow: "ACADEMIC ASSESSMENT ARCHIVE",
  listTitle: "Examination Catalogue",
  listLead:
    "A curated index of published assessment papers. Each entry is catalogued with its subject, issuing authority, allotted duration and total marks for review.",
  listStatPapers: "PAPERS INDEXED",
  listStatItems: "ITEMS TOTAL",
  listSectionIndex: "Index of Papers",
  listRetrieving: "RETRIEVING ARCHIVE…",
  listEmpty: "No published examinations available.",
  listError: "Unable to load examinations.",
  actionRefresh: "Refresh",
  actionRetry: "Retry",
  // 档案卡片
  cardDuration: "DURATION",
  cardTotal: "TOTAL",
  cardItems: "ITEMS",
  unitMinutes: " min",
  unitPoints: " pts",
  // 试卷详情页
  detailRetrieving: "RETRIEVING RECORD…",
  detailMissing: "No examination identifier provided.",
  detailError: "Unable to load the examination paper.",
  detailBack: "Back to catalogue",
  detailCatalogue: "CATALOGUE",
  detailEyebrow: "EXAMINATION RECORD",
  detailSpecTitle: "Record of Specifications",
  detailPaperTitle: "Examination Paper",
  detailNoContent: "No converted content is available yet; please wait for the conversion to finish.",
  detailPreviewHint:
    "A high-fidelity preview of the original layout; paging is supported.",
  detailSubmitTitle: "Declaration of Submission",
  detailSubmitLead:
    "By submitting, you confirm that this session has been completed. The record is stored for institutional review.",
  fieldSubject: "SUBJECT",
  fieldIssuer: "ISSUER",
  fieldReviewer: "REVIEWER",
  fieldDuration: "DURATION",
  fieldTotalMarks: "TOTAL MARKS",
  fieldItemCount: "ITEM COUNT",
  noticeTag: "NOTICE",
  // 计时器
  timerTitle: "SESSION TIMER",
  timerPause: "Pause",
  timerResume: "Resume",
  timerReset: "Reset",
  timerNoLimit: "NO TIME LIMIT",
  timerExpired: "TIME EXPIRED",
  timerElapsed: "ELAPSED",
  // 交卷
  stampSubmit: "SUBMIT PAPER",
  stampSubmitted: "SUBMITTED",
  stampError: "Submission failed. Please try again.",
  stampNote: "Submission recorded. The paper remains available for review.",
  // 管理端
  adminEyebrow: "INSTITUTIONAL CONSOLE",
  adminTitle: "Exam Management",
  adminLead:
    "Upload a PDF paper; it is converted to high-fidelity HTML via pdf2htmlEX. Once verified, confirm to publish it to the public catalogue.",
  adminIngestTitle: "Ingest Paper",
  adminIngestLead:
    "PDF only, up to 50 MB. The file is converted to HTML on upload; the source is deleted once conversion succeeds.",
  adminUpload: "UPLOAD PAPER",
  adminProofTitle: "Proofreading",
  adminPreviewLabel: "CONVERTED PREVIEW",
  adminPreviewDeleted: "No converted HTML preview has been generated yet.",
  adminDownloadOriginal: "Download original",
  adminRecognizedLabel: "SPECIFICATIONS",
  adminFieldTitle: "TITLE",
  adminFieldDuration: "DURATION (MIN)",
  adminFieldTotal: "TOTAL (PTS)",
  adminFieldItems: "ITEMS",
  adminFieldNotice: "NOTICE",
  adminPlaceholderTitle: "e.g. 2026 Provincial Examination",
  adminPlaceholderSubject: "Subject",
  adminPlaceholderIssuer: "Issuer",
  adminPlaceholderReviewer: "Reviewer",
  adminPlaceholderNotice: "Instructions shown to candidates (optional)",
  adminSave: "SAVE DRAFT",
  adminConfirm: "CONFIRM & PUBLISH",
  adminReparse: "RECONVERT",
  adminDelete: "DELETE PAPER",
  adminDiscard: "DISCARD",
  adminConfirmTitle: "Publish this paper?",
  adminConfirmBody: "Once published the paper appears in the public examination catalogue.",
  adminConfirmYes: "PUBLISH",
  adminConfirmNo: "CANCEL",
  adminLedgerTitle: "Paper Ledger",
  adminLedgerEntries: "ENTRIES",
  adminLedgerLoading: "LOADING LEDGER…",
  adminLedgerEmpty: "No papers ingested yet.",
  adminLedgerError: "Unable to load the administration ledger.",
  adminColCode: "CODE",
  adminColTitle: "TITLE",
  adminColSubject: "SUBJECT",
  adminColTotal: "TOTAL",
  adminColSubmissions: "SUBMISSIONS",
  adminColStatus: "STATUS",
  adminReview: "Review",
  adminUploadFailed: "Upload failed.",
  adminSaveFailed: "Save failed.",
  adminConfirmFailed: "Publish failed.",
  adminReparseFailed: "Reconversion failed.",
  adminDeleteFailed: "Delete failed.",
  adminIngested:
    "Paper uploaded and converting to HTML in the background. Wait for the progress to finish, then proofread.",
  adminSaved: "Changes saved.",
  adminConfirmed: "The paper is published to the public catalogue.",
  adminReparsed: "Reconverted from the original PDF.",
  adminDeleted: "Paper deleted.",
  adminDiscarded: "Proofreading discarded.",
  adminDiscardTitle: "Discard this paper?",
  adminDiscardBody:
    "The source file and converted content will be deleted and cannot be recovered.",
  // 转换进度
  adminProgressTitle: "CONVERSION PROGRESS",
  adminProgressConverting: "CONVERTING VIA pdf2htmlEX…",
  adminProgressWaiting: "AWAITING CONVERSION…",
  adminProgressDone: "Conversion complete; HTML generated.",
  adminProgressFailed: "CONVERSION FAILED",
  adminConvertingBanner:
    "Converting the document in the background. Please wait — no need to close this page…",
  adminGotoUpload: "Go to upload",
  // 上传页
  uploadEyebrow: "INSTITUTIONAL CONSOLE",
  uploadTitle: "Upload Paper",
  uploadLead:
    "PDF only, up to 50 MB. The file is converted to high-fidelity HTML on upload; preview it once conversion finishes.",
  uploadDropHint: "Drag a PDF here, or use the button below to choose a file",
  uploadPick: "CHOOSE PDF FILE",
  uploadOnlyPdf: "Only PDF files are accepted. Please choose again.",
  uploadTooLarge: "The file exceeds the 50 MB limit. Please compress it and retry.",
  uploadStageUpload: "UPLOADING",
  uploadStageConvert: "CONVERTING",
  uploadStageDone: "DONE",
  uploadStageFailed: "CONVERSION FAILED",
  uploadOpenPreview: "Open preview",
  uploadRetry: "Upload again",
  uploadFailed: "Upload failed. Please try again.",
  // 状态标签
  statusDraft: "DRAFT",
  statusPublished: "PUBLISHED",
  statusClosed: "CLOSED",
  convertStatusPending: "PENDING",
  convertStatusConverting: "CONVERTING",
  convertStatusCompleted: "COMPLETED",
  convertStatusFailed: "FAILED",
};

// 导出 //
export default iGM_en;
