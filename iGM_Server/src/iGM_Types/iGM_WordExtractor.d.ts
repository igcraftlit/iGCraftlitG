/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_WordExtractor.d.ts
 * 所属层：后端 / 类型声明层
 * 路由：无
 * 模块：iGM_WordExtractor
 * 作用：为 word-extractor（无官方类型声明的 DOC/DOCX 纯 JS 抽取库）补充最小类型声明
 * 内容：WordExtractor 默认导出类与抽取结果 Document 对象
 * 说明：仅声明实际使用的成员，不覆盖该库全部 API
 */

declare module "word-extractor" {
  /** 抽取结果文档对象 */
  export interface WordDocument {
    /** 正文文本 */
    getBody(): string;
    /** 脚注文本 */
    getFootnotes(): string;
    /** 页眉页脚文本 */
    getHeaders(): string;
  }

  /** DOC / DOCX 正文抽取器（纯 JS 实现，无需外部二进制） */
  export default class WordExtractor {
    /** 从文件路径或字节缓冲中抽取文档 */
    extract(source: string | Buffer): Promise<WordDocument>;
  }
}
