/**
 * 文件路径：apps/exam/src/iGM_i18n/iGM_en.ts
 * 所属层：前端 / 国际化层
 * 路由：全局
 * 模块：iGM_ExamI18n
 * 作用：英文语言包
 * 内容：机构刊头、导航、索引页、详情页、计时器、阅读器、管理端全部文案
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
  detailViewerTitle: "Paper Viewer",
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
  // 阅读器
  readerLabel: "VIEWER",
  readerZoomIn: "Zoom in",
  readerZoomOut: "Zoom out",
  readerFullscreen: "Fullscreen",
  readerExitFullscreen: "Exit fullscreen",
  readerLoading: "LOADING PAPER…",
  readerError: "Unable to load the examination paper.",
  readerPrev: "Previous page",
  readerNext: "Next page",
  // 管理端
  adminEyebrow: "INSTITUTIONAL CONSOLE",
  adminTitle: "Exam Management",
  adminLead:
    "Ingest a paper as PDF, verify the automatically recognised specifications, then publish it to the public catalogue.",
  adminIngestTitle: "Ingest Paper",
  adminIngestLead:
    "PDF only, up to 30 MB. Metadata is extracted from the first three pages.",
  adminSelectPdf: "SELECT PDF",
  adminProofTitle: "Proofreading",
  adminPreviewLabel: "PAPER PREVIEW · 3 PAGES",
  adminReplacePdf: "Replace PDF",
  adminRecognizedLabel: "RECOGNISED SPECIFICATIONS",
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
  adminSave: "SAVE",
  adminPublish: "PUBLISH",
  adminClose: "CLOSE",
  adminDelete: "DELETE",
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
  adminReplaceFailed: "Replace failed.",
  adminPublishFailed: "Publish failed.",
  adminCloseFailed: "Close failed.",
  adminDeleteFailed: "Delete failed.",
  adminIngested: "PDF ingested. Review the recognized fields, then publish.",
  adminSaved: "Changes saved.",
  adminPublished: "Paper published to the public catalogue.",
  adminClosed: "Paper closed.",
  adminDeleted: "Paper deleted.",
  adminReplaced: "Paper file replaced.",
  // 状态标签
  statusDraft: "DRAFT",
  statusPublished: "PUBLISHED",
  statusClosed: "CLOSED",
};

// 导出 //
export default iGM_en;
