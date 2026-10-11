/**
 * 文件路径：apps/exam/src/iGM_i18n/iGM_zhCN.ts
 * 所属层：前端 / 国际化层
 * 路由：全局
 * 模块：iGM_ExamI18n
 * 作用：简体中文语言包（默认语言）
 * 内容：机构刊头、导航、索引页、详情页、计时器、解析与确认、管理端全部文案
 * 说明：扁平 camelCase 键；{token} 为运行时占位符
 */

// 导入依赖 //
import type { iGM_I18nDict } from "./iGM_I18nTypes";

// 核心逻辑 //
/** 简体中文语言包 */
export const iGM_zhCN: iGM_I18nDict = {
  // 机构与刊头
  instituteName: "iGC&M 教育考试研究院",
  mastheadMeta: "第 {volume} 卷 · 第 {issue} 期",
  mastheadSubtitle: "创院于 2026 · 学术测评",
  navExaminations: "考试目录",
  navAdmin: "考试管理",
  navUpload: "上传试卷",
  themeGroupLabel: "色彩模式",
  themeLight: "浅色",
  themeDark: "深色",
  langButtonLabel: "语言",
  langChinese: "中文",
  langEnglish: "English",
  // 页脚
  footerCopyright: "© {year} iGCraftLit Community",
  // 试卷索引页
  listEyebrow: "学术测评档案",
  listTitle: "考试目录",
  listLead:
    "已发布试卷的编目索引。每条记录标注科目、命题方、考试时长与总分，供查阅与检索。",
  listStatPapers: "已收录试卷",
  listStatItems: "题目总数",
  listSectionIndex: "试卷索引",
  listRetrieving: "正在检索档案…",
  listEmpty: "暂无发布的考试资料",
  listError: "无法加载考试资料。",
  actionRefresh: "刷新",
  actionRetry: "重试",
  // 档案卡片
  cardDuration: "时长",
  cardTotal: "总分",
  cardItems: "题数",
  unitMinutes: " 分钟",
  unitPoints: " 分",
  fileSizeValue: "占用空间：{size} MB",
  // 试卷详情页
  detailRetrieving: "正在检索记录…",
  detailMissing: "未提供考试标识。",
  detailError: "无法加载试卷。",
  detailBack: "返回目录",
  detailCatalogue: "目录",
  detailEyebrow: "考试记录",
  detailSpecTitle: "规格记录表",
  detailPaperTitle: "试卷正文",
  detailNoContent: "暂无转换后的试卷内容，请等待转换完成。",
  detailPreviewHint: "以下为原始排版的高保真预览，支持翻页查看。",
  paperZoomOut: "缩小",
  paperZoomFit: "适应宽度",
  paperZoomIn: "放大",
  detailSubmitTitle: "交卷声明",
  detailSubmitLead: "点击交卷即表示本次考试已完成，记录将留存供学院复核。",
  fieldSubject: "科目",
  fieldIssuer: "命题方",
  fieldReviewer: "审题方",
  fieldDuration: "时长",
  fieldTotalMarks: "总分",
  fieldItemCount: "题数",
  statDuration: "限时",
  unitQuestions: " 题",
  noticeTag: "须知",
  // 计时器
  timerTitle: "考试计时器",
  timerPause: "暂停",
  timerResume: "继续",
  timerReset: "重置",
  timerNoLimit: "不限时",
  timerExpired: "已超时",
  timerElapsed: "已用时",
  // 交卷
  stampSubmit: "交卷",
  stampSubmitted: "已交卷",
  stampError: "交卷失败，请重试。",
  stampNote: "交卷已记录，试卷仍可供查阅。",
  // 管理端
  adminEyebrow: "学院控制台",
  adminTitle: "考试管理",
  adminLead:
    "在上传页填写试卷规格并发布，系统调用 pdf2htmlEX 高保真转换为 HTML；发布后可在台账中预览与维护。",
  adminIngestTitle: "导入试卷",
  adminIngestLead:
    "仅支持 PDF，最大 50 MB。上传前需填写完整规格，发布后自动转换为 HTML，转换成功即删除原始文件。",
  adminUpload: "上传试卷",
  adminPreviewTitle: "试卷预览",
  adminPreviewLabel: "转换预览",
  adminPreviewDeleted: "尚未生成转换后的 HTML 预览。",
  adminDownloadOriginal: "下载原文件",
  adminSpecLabel: "规格信息",
  adminFieldTitle: "试卷名称",
  adminFieldDuration: "时长（分钟）",
  adminFieldTotal: "总分",
  adminFieldItems: "题数",
  adminFieldNotice: "须知",
  adminPlaceholderTitle: "如：2026 年省级统考",
  adminPlaceholderSubject: "科目",
  adminPlaceholderIssuer: "命题方",
  adminPlaceholderReviewer: "审题方",
  adminPlaceholderNotice: "面向考生的提示（可选）",
  adminReparse: "重新转换",
  adminDelete: "删除试卷",
  adminCancel: "取消",
  adminLedgerTitle: "试卷台账",
  adminLedgerEntries: "条记录",
  adminLedgerLoading: "正在加载台账…",
  adminLedgerEmpty: "暂无已导入的试卷。",
  adminLedgerError: "无法加载管理台账。",
  adminColCode: "编号",
  adminColTitle: "标题",
  adminColSubject: "科目",
  adminColTotal: "总分",
  adminColSubmissions: "交卷数",
  adminColStatus: "状态",
  adminReview: "预览",
  adminUploadFailed: "上传失败。",
  adminReparseFailed: "重新转换失败。",
  adminDeleteFailed: "删除失败。",
  adminIngested: "试卷已发布，正在后台转换为 HTML 并部署。",
  adminReparsed: "已按原始 PDF 重新转换。",
  adminDeleted: "试卷已删除。",
  adminDiscarded: "试卷已删除。",
  adminDiscardTitle: "确认删除该试卷？",
  adminDiscardBody: "删除后将移除原始文件与已转换内容，且无法恢复。",
  // 部署状态
  deployTitle: "正在部署，请稍等几分钟",
  deployBody:
    "试卷已提交，Cloudflare Pages 正在构建，约 1-3 分钟后可在试卷列表中查看。",
  deployBack: "返回列表",
  deployDone: "部署完成，试卷已上线。",
  // 转换进度
  adminProgressTitle: "转换进度",
  adminProgressConverting: "正在调用 pdf2htmlEX 转换…",
  adminProgressWaiting: "等待转换…",
  adminProgressDone: "转换完成，已生成 HTML。",
  adminProgressFailed: "转换失败",
  adminConvertingBanner: "正在后台转换文档，请稍候，无需关闭页面…",
  adminGotoUpload: "前往上传试卷",
  // 上传页
  uploadEyebrow: "学院控制台",
  uploadTitle: "上传试卷",
  uploadLead:
    "填写试卷规格并选择 PDF（最大 50 MB），提交后即发布至公共目录，系统在后台转换为高保真 HTML。",
  uploadFormTitle: "发布信息",
  uploadFileTitle: "试卷文件",
  uploadDropHint: "将 PDF 文件拖拽到此处，或点击下方按钮选择文件",
  uploadPick: "选择 PDF 文件",
  uploadOnlyPdf: "仅支持 PDF 格式，请重新选择。",
  uploadTooLarge: "文件超过 50 MB 上限，请压缩后重试。",
  uploadRequiredHint: "请填写完整信息并选择 PDF 文件后再发布。",
  uploadInvalidNumber: "时长、总分、题数须为正整数。",
  uploadSubmit: "发布试卷",
  uploadFailed: "发布失败，请重试。",
  // 状态标签
  statusDraft: "草稿",
  statusPublished: "已发布",
  statusDeploying: "部署中",
  statusClosed: "已关闭",
  convertStatusPending: "待转换",
  convertStatusConverting: "转换中",
  convertStatusCompleted: "已完成",
  convertStatusFailed: "转换失败",
};

// 导出 //
export default iGM_zhCN;
