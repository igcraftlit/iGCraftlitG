/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ZipService.ts
 * 所属层：后端 / 基础服务层
 * 路由：G_Game
 * 模块：iGM_ZipService
 * 作用：极简 ZIP 读取能力，用于解压 natives 原生库（不引入任何第三方依赖）
 * 内容：读取中央目录、按条目解压（stored / deflate 两种压缩方式）
 * 说明：仅需处理 Minecraft natives 小体积 jar，全部内容一次性读入内存；
 *       ZIP64 条目（尺寸字段为 0xFFFFFFFF）不支持，遇到即跳过并记录
 */

// 导入依赖 //
import { inflateRawSync } from "node:zlib";

// 类型定义 //
/** 解压出的单个条目 */
export interface iGM_ZipEntry {
  /** 条目在压缩包内的相对路径（正斜杠） */
  name: string;
  data: Uint8Array;
}

// 核心逻辑 //
/** ZIP 中央目录结束标记 */
const iGM_EocdSignature = 0x06054b50;
/** ZIP 中央目录条目标记 */
const iGM_CentralSignature = 0x02014b50;
/** ZIP64 尺寸占位值 */
const iGM_Zip64Marker = 0xffffffff;

/** 在缓冲区尾部查找中央目录结束标记的位置（从后向前扫描） */
function iGM_FindEocd(view: DataView): number {
  const maxTail = Math.min(view.byteLength, 65557);
  for (let offset = view.byteLength - 22; offset >= view.byteLength - maxTail; offset -= 1) {
    if (offset < 0) break;
    if (view.getUint32(offset, true) === iGM_EocdSignature) return offset;
  }
  return -1;
}

/**
 * 解压 ZIP 缓冲区的全部条目
 * @param buffer ZIP 文件完整内容
 * @param filter 条目过滤器（返回 false 的条目不参与解压，用于跳过 META-INF 等）
 */
export function iGM_Unzip(
  buffer: Uint8Array,
  filter?: (name: string) => boolean,
): iGM_ZipEntry[] {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const eocd = iGM_FindEocd(view);
  if (eocd < 0) return [];

  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries: iGM_ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > view.byteLength) break;
    if (view.getUint32(cursor, true) !== iGM_CentralSignature) break;

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);

    const nameBytes = buffer.subarray(
      cursor + 46,
      cursor + 46 + nameLength,
    );
    const name = new TextDecoder("utf-8").decode(nameBytes);

    cursor += 46 + nameLength + extraLength + commentLength;

    // 目录条目与过滤掉的条目直接跳过
    if (name.endsWith("/")) continue;
    if (filter && !filter(name)) continue;
    if (
      compressedSize === iGM_Zip64Marker ||
      uncompressedSize === iGM_Zip64Marker ||
      localOffset === iGM_Zip64Marker
    ) {
      continue;
    }

    // 定位本地文件头，计算数据起始偏移
    if (localOffset + 30 > view.byteLength) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.byteLength) continue;

    const raw = buffer.subarray(dataStart, dataEnd);
    if (method === 0) {
      entries.push({ name, data: raw });
    } else if (method === 8) {
      entries.push({ name, data: new Uint8Array(inflateRawSync(raw)) });
    }
    // 其余压缩方式（bzip2/lzma 等）在 Minecraft natives 中不会出现，忽略
  }

  return entries;
}

// 导出 //
export default { iGM_Unzip };