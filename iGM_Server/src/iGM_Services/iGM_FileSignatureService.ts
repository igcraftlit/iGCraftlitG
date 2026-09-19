/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_FileSignatureService.ts
 * 所属层：后端 / 基础服务层
 * 路由：G_File
 * 模块：iGM_FileSignatureService
 * 作用：基于文件内容（magic bytes / 结构特征）探测真实文件类型
 * 内容：常见图片（png/jpeg/gif/webp/bmp/svg）、PDF、ZIP 系（含 Office OOXML、
 *       jar、Minecraft 包）、RAR、GZIP、7z、OLE2（旧 Office）、TAR 的签名识别，
 *       文本类文件的可打印性校验，以及光栅图片宽高解析
 * 安全：扩展名与客户端声明的 MIME 均可伪造，落盘前必须以本服务的探测结果为准；
 *       防止将可执行/脚本内容伪装成图片或文档上传
 */

// 导入依赖 //
// （零依赖，仅使用标准 DataView 解析字节）

// 类型定义 //
/** 探测出的文件族 */
export type iGM_FileFamily =
  | "image"
  | "pdf"
  | "zip"
  | "rar"
  | "gzip"
  | "sevenZip"
  | "ole"
  | "tar"
  | "text";

/** 文件内容探测结果 */
export interface iGM_DetectedFile {
  /** 文件族 */
  family: iGM_FileFamily;
  /** 探测到的规范 MIME；文本类与部分容器无法精确判定时为 null */
  mime: string | null;
  /** 探测到的规范扩展名（小写，不含点）；无法确定时为 null */
  ext: string | null;
  /** 图片像素宽高（仅光栅图片） */
  width: number | null;
  height: number | null;
}

// 核心逻辑 //
/** 判断字节数组是否以指定偏移的十六进制签名开头 */
function iGM_MatchSignature(
  bytes: Uint8Array,
  signature: number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/** 按十六进制字符串生成签名数组 */
function iGM_HexSignature(hex: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    result.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return result;
}

/** 尝试以 UTF-8 解码文件头部片段 */
function iGM_DecodeHead(bytes: Uint8Array, length: number): string {
  const slice = bytes.slice(0, Math.min(length, bytes.length));
  return new TextDecoder("utf-8", { fatal: false }).decode(slice);
}

/* ---------- 图片宽高解析 ---------- */

/** 解析 PNG 宽高（IHDR 固定位于 16/20 字节，大端） */
function iGM_ReadPngDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} | null {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

/** 解析 GIF 宽高（逻辑屏幕描述符位于 6/8 字节，小端） */
function iGM_ReadGifDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} | null {
  if (bytes.length < 10) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint16(6, true),
    height: view.getUint16(8, true),
  };
}

/** 解析 BMP 宽高（DIB 头，宽位于 18、高位于 22 字节，小端） */
function iGM_ReadBmpDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} | null {
  if (bytes.length < 26) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 高度可能为负值（自上而下位图），取绝对值
  return {
    width: view.getInt32(18, true),
    height: Math.abs(view.getInt32(22, true)),
  };
}

/**
 * 解析 JPEG 宽高：遍历段标记查找 SOFn（Start Of Frame）
 * 跳过 DHT(C4)/DAC(CC)/JPG(C8) 等不含帧信息的标记
 */
function iGM_ReadJpegDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} | null {
  if (bytes.length < 4) return null;
  let offset = 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 9 < bytes.length) {
    // 段间可能存在填充 FF
    if (bytes[offset] !== 0xff) return null;
    let marker = bytes[offset + 1];
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1];
    }
    // SOF0..SOF15 中除 DHT、DAC、JPG、TEM 外均携带帧尺寸
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return {
        // SOFn 段：[标记2][长度2][精度1][高度2][宽度2]
        height: view.getUint16(offset + 5, false),
        width: view.getUint16(offset + 7, false),
      };
    }
    // 独立段（无长度字段）：扫描到下一个标记
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

/**
 * 解析 WebP 宽高：按 VP8 / VP8L / VP8X 三种 chunk 格式
 */
function iGM_ReadWebpDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} | null {
  if (bytes.length < 30) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fourcc = String.fromCharCode(
    bytes[12],
    bytes[13],
    bytes[14],
    bytes[15],
  );
  if (fourcc === "VP8 ") {
    // 简易(lossy)：关键帧头后 14 位起，宽高各 16 位（低 14 位有效）
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (fourcc === "VP8L") {
    // 无损(lossless)：签名字节 0x2f 后 14 位宽、14 位高
    const bits = view.getUint32(21, true);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >>> 14) & 0x3fff),
    };
  }
  if (fourcc === "VP8X") {
    // 扩展格式：24 位画布宽高（存储值 = 实际值 - 1）
    const width =
      1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height =
      1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }
  return null;
}

/**
 * 探测 SVG：去除 BOM 与开头空白后，首部应出现 <svg 标记，
 * 或为含 <svg 的 XML 文档
 */
function iGM_DetectSvg(bytes: Uint8Array): iGM_DetectedFile | null {
  const head = iGM_DecodeHead(bytes, 1024)
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  const isSvg =
    head.startsWith("<svg") ||
    (head.startsWith("<?xml") && head.includes("<svg"));
  if (!isSvg) return null;
  return {
    family: "image",
    mime: "image/svg+xml",
    ext: "svg",
    width: null,
    height: null,
  };
}

/**
 * 文本类内容判定：前 8KB 内不含 NUL 等二进制控制字节。
 * UTF-16 文本（含大量 0x00）会被判为非文本，符合白名单内纯文本格式预期
 */
function iGM_LooksLikeText(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8192);
  if (limit === 0) return false;
  for (let i = 0; i < limit; i++) {
    const byte = bytes[i];
    // 允许制表、换行、回车；其余低于空格的控制字节视为二进制
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      return false;
    }
    // 0x7F 删除符也视为二进制
    if (byte === 0x7f) return false;
  }
  return true;
}

/**
 * 根据文件内容探测真实类型
 * @returns 探测结果；无法识别任何已知签名时返回 null
 */
export function iGM_DetectFileByBytes(
  bytes: Uint8Array,
): iGM_DetectedFile | null {
  if (bytes.length === 0) return null;

  /* ---------- 图片 ---------- */
  if (iGM_MatchSignature(bytes, iGM_HexSignature("89504e470d0a1a0a"))) {
    const dims = iGM_ReadPngDimensions(bytes);
    return {
      family: "image",
      mime: "image/png",
      ext: "png",
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  }
  if (iGM_MatchSignature(bytes, [0xff, 0xd8, 0xff])) {
    const dims = iGM_ReadJpegDimensions(bytes);
    return {
      family: "image",
      mime: "image/jpeg",
      ext: "jpg",
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  }
  if (
    iGM_MatchSignature(bytes, iGM_HexSignature("474946383761")) ||
    iGM_MatchSignature(bytes, iGM_HexSignature("474946383961"))
  ) {
    const dims = iGM_ReadGifDimensions(bytes);
    return {
      family: "image",
      mime: "image/gif",
      ext: "gif",
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  }
  if (
    iGM_MatchSignature(bytes, iGM_HexSignature("52494646")) &&
    bytes.length >= 12 &&
    iGM_MatchSignature(bytes, iGM_HexSignature("57454250"), 8)
  ) {
    const dims = iGM_ReadWebpDimensions(bytes);
    return {
      family: "image",
      mime: "image/webp",
      ext: "webp",
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    };
  }
  // BMP："BM"，且文件长度字段与实际长度大致相符（防止两字节误判）
  if (iGM_MatchSignature(bytes, [0x42, 0x4d]) && bytes.length >= 26) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const declaredSize = view.getUint32(2, true);
    if (declaredSize === 0 || Math.abs(declaredSize - bytes.length) < 64) {
      const dims = iGM_ReadBmpDimensions(bytes);
      return {
        family: "image",
        mime: "image/bmp",
        ext: "bmp",
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      };
    }
  }
  const svg = iGM_DetectSvg(bytes);
  if (svg) return svg;

  /* ---------- 文档与压缩包 ---------- */
  if (iGM_MatchSignature(bytes, iGM_HexSignature("255044462d"))) {
    return { family: "pdf", mime: "application/pdf", ext: "pdf", width: null, height: null };
  }
  // ZIP 容器：普通/空分卷/跨卷三种尾签名；docx/xlsx/pptx/jar 与 Minecraft 包同族
  if (
    iGM_MatchSignature(bytes, iGM_HexSignature("504b0304")) ||
    iGM_MatchSignature(bytes, iGM_HexSignature("504b0506")) ||
    iGM_MatchSignature(bytes, iGM_HexSignature("504b0708"))
  ) {
    return { family: "zip", mime: "application/zip", ext: "zip", width: null, height: null };
  }
  // RAR v4/v5 共用 7 字节签名
  if (iGM_MatchSignature(bytes, iGM_HexSignature("526172211a0700"))) {
    return {
      family: "rar",
      mime: "application/x-rar-compressed",
      ext: "rar",
      width: null,
      height: null,
    };
  }
  if (iGM_MatchSignature(bytes, [0x1f, 0x8b])) {
    return { family: "gzip", mime: "application/gzip", ext: "gz", width: null, height: null };
  }
  if (iGM_MatchSignature(bytes, iGM_HexSignature("377abcaf271c"))) {
    return {
      family: "sevenZip",
      mime: "application/x-7z-compressed",
      ext: "7z",
      width: null,
      height: null,
    };
  }
  // OLE2 复合文档：旧版 .doc/.xls/.ppt
  if (iGM_MatchSignature(bytes, iGM_HexSignature("d0cf11e0a1b11ae1"))) {
    return { family: "ole", mime: null, ext: null, width: null, height: null };
  }
  // TAR：ustar 魔数位于 257 偏移
  if (
    bytes.length > 262 &&
    iGM_MatchSignature(bytes, iGM_HexSignature("7573746172"), 257)
  ) {
    return { family: "tar", mime: "application/x-tar", ext: "tar", width: null, height: null };
  }

  /* ---------- 文本类 ---------- */
  if (iGM_LooksLikeText(bytes)) {
    return { family: "text", mime: null, ext: null, width: null, height: null };
  }

  return null;
}

// 导出 //
export default { iGM_DetectFileByBytes };
