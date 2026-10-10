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
  detailTocTitle: "Contents",
  detailNoContent: "No parsed content is available for this paper.",
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
    "Ingest a paper document; the full text is parsed automatically. Once verified, confirm and delete the source file to publish it to the public catalogue.",
  adminIngestTitle: "Ingest Paper",
  adminIngestLead:
    "PDF / DOC / DOCX / TXT / MD, up to 50 MB. The full text is parsed on upload; the source file is retained until confirmation.",
  adminUpload: "UPLOAD PAPER",
  adminProofTitle: "Proofreading",
  adminPreviewLabel: "SOURCE FILE PREVIEW",
  adminPreviewDeleted:
    "The source file has been deleted; only the parsed structured content is retained.",
  adminDownloadOriginal: "Download original",
  adminRecognizedLabel: "SPECIFICATIONS",
  adminParseLabel: "PARSED CONTENT · STRUCTURED",
  adminFieldTitle: "TITLE",
  adminFieldDuration: "DURATION (MIN)",
  adminFieldTotal: "TOTAL (PTS)",
  adminFieldItems: "ITEMS",
  adminFieldNotice: "NOTICE",
  adminFieldContent: "STRUCTURED CONTENT BLOCKS",
  adminPlaceholderTitle: "e.g. 2026 Provincial Examination",
  adminPlaceholderSubject: "Subject",
  adminPlaceholderIssuer: "Issuer",
  adminPlaceholderReviewer: "Reviewer",
  adminPlaceholderNotice: "Instructions shown to candidates (optional)",
  adminPlaceholderContent: "Revise the parsed content here…",
  adminSave: "SAVE DRAFT",
  adminConfirm: "CONFIRM & PUBLISH (DELETE SOURCE)",
  adminReparse: "REPARSE",
  adminDelete: "DELETE PAPER",
  adminDiscard: "DISCARD",
  adminConfirmTitle: "Delete the original file?",
  adminConfirmBody:
    "Once deleted the original file cannot be recovered; only the parsed structured content will be retained.",
  adminConfirmYes: "CONFIRM",
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
  adminConfirmFailed: "Confirmation failed.",
  adminReparseFailed: "Reparse failed.",
  adminDeleteFailed: "Delete failed.",
  adminIngested:
    "Paper uploaded and parsing in the background. Wait for the progress to finish, then proofread.",
  adminSaved: "Changes saved.",
  adminConfirmed:
    "Source file deleted and the paper is published to the public catalogue.",
  adminReparsed: "Reparsed from the original file.",
  adminDeleted: "Paper deleted.",
  adminDiscarded: "Proofreading discarded.",
  adminDiscardTitle: "Discard this paper?",
  adminDiscardBody:
    "The source file and parsed content will be deleted and cannot be recovered.",
  // 解析进度
  adminProgressTitle: "PARSE PROGRESS",
  adminProgressPages: "PARSED {parsed} / {total} PAGES",
  adminProgressWaiting: "AWAITING PARSE…",
  adminProgressDone: "Parse complete, {blocks} content blocks.",
  adminProgressFailed: "PARSE FAILED",
  adminParsingBanner:
    "Parsing the document in the background. Please wait — no need to close this page…",
  // 结构化内容块
  blockPage: "P.",
  blockMoveUp: "Move up",
  blockMoveDown: "Move down",
  blockDelete: "Delete block",
  blockLevel: "LEVEL",
  blockTextPlaceholder: "Enter text…",
  blockListPlaceholder: "One item per line",
  blockListHint: "One list item per line",
  blockTablePlaceholder: "One row per line, cells separated by |",
  blockTableHint: "One row per line, cells separated by |; the first row is the header",
  blockCaptionPlaceholder: "Caption (optional)",
  blockNumber: "NO.",
  blockScore: "SCORE",
  blockQuestionStemPlaceholder: "Question stem…",
  blockOptionsPlaceholder: "One option per line",
  blockOptionsHint: "One option per line",
  blockAnswerPlaceholder: "Reference answer (optional)",
  blockTypeHeading: "HEADING",
  blockTypeParagraph: "PARAGRAPH",
  blockTypeList: "LIST",
  blockTypeTable: "TABLE",
  blockTypeImage: "IMAGE",
  blockTypeFormula: "FORMULA",
  blockTypeQuestion: "QUESTION",
  // 状态标签
  statusDraft: "DRAFT",
  statusPublished: "PUBLISHED",
  statusClosed: "CLOSED",
  parseStatusPending: "PENDING",
  parseStatusParsing: "PARSING",
  parseStatusParsed: "PARSED",
  parseStatusConfirmed: "CONFIRMED",
  parseStatusFailed: "FAILED",
};

// 导出 //
export default iGM_en;
