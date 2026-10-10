/**
 * 文件路径：apps/exam/src/iGM_i18n/iGM_zhCN.ts
 * 所属层：前端 / 国际化层
 * 路由：全局
 * 模块：iGM_ExamI18n
 * 作用：简体中文语言包（默认语言）
 * 内容：机构刊头、导航、索引页、详情页、计时器、阅读器、管理端全部文案
 * 说明：扁平 camelCase 键；{token} 为运行时占位符
 */

// 导入依赖 //
import type { iGM_I18nDict } from "./iGM_I18nTypes";

// 核心逻辑 //
/** 简体中文语言包 */
export const iGM_zhCN: iGM_I18nDict = {
  // 机构与刊头
  instituteName: "iG&M 教育考试学院",
  mastheadMeta: "第 {volume} 卷 · 第 {issue} 期",
  mastheadSubtitle: "创院于 2026 · 学术测评",
  navExaminations: "考试目录",
  navAdmin: "考试管理",
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
  // 试卷详情页
  detailRetrieving: "正在检索记录…",
  detailMissing: "未提供考试标识。",
  detailError: "无法加载试卷。",
  detailBack: "返回目录",
  detailCatalogue: "目录",
  detailEyebrow: "考试记录",
  detailSpecTitle: "规格记录表",
  detailViewerTitle: "试卷阅读器",
  detailSubmitTitle: "交卷声明",
  detailSubmitLead: "点击交卷即表示本次考试已完成，记录将留存供学院复核。",
  fieldSubject: "科目",
  fieldIssuer: "命题方",
  fieldReviewer: "审题方",
  fieldDuration: "时长",
  fieldTotalMarks: "总分",
  fieldItemCount: "题数",
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
  // 阅读器
  readerLabel: "阅读器",
  readerZoomIn: "放大",
  readerZoomOut: "缩小",
  readerFullscreen: "全屏",
  readerExitFullscreen: "退出全屏",
  readerLoading: "正在加载试卷…",
  readerError: "无法加载试卷。",
  readerPrev: "上一页",
  readerNext: "下一页",
  // 管理端
  adminEyebrow: "学院控制台",
  adminTitle: "考试管理",
  adminLead:
    "以 PDF 导入试卷，核对自动识别的规格信息，随后发布至公共目录。",
  adminIngestTitle: "导入试卷",
  adminIngestLead: "仅支持 PDF，最大 30 MB。元数据将从前三页自动提取。",
  adminSelectPdf: "选择 PDF",
  adminProofTitle: "校对",
  adminPreviewLabel: "试卷预览 · 前 3 页",
  adminReplacePdf: "替换 PDF",
  adminRecognizedLabel: "识别结果",
  adminFieldTitle: "标题",
  adminFieldDuration: "时长（分钟）",
  adminFieldTotal: "总分",
  adminFieldItems: "题数",
  adminFieldNotice: "须知",
  adminPlaceholderTitle: "如：2026 年省级统考",
  adminPlaceholderSubject: "科目",
  adminPlaceholderIssuer: "命题方",
  adminPlaceholderReviewer: "审题方",
  adminPlaceholderNotice: "面向考生的提示（可选）",
  adminSave: "保存",
  adminPublish: "发布",
  adminClose: "关闭",
  adminDelete: "删除",
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
  adminReview: "校对",
  adminUploadFailed: "上传失败。",
  adminSaveFailed: "保存失败。",
  adminReplaceFailed: "替换失败。",
  adminPublishFailed: "发布失败。",
  adminCloseFailed: "关闭失败。",
  adminDeleteFailed: "删除失败。",
  adminIngested: "PDF 已导入。请核对识别字段后发布。",
  adminSaved: "修改已保存。",
  adminPublished: "试卷已发布至公共目录。",
  adminClosed: "试卷已关闭。",
  adminDeleted: "试卷已删除。",
  adminReplaced: "试卷文件已替换。",
  // 状态标签
  statusDraft: "草稿",
  statusPublished: "已发布",
  statusClosed: "已关闭",
};

// 导出 //
export default iGM_zhCN;
