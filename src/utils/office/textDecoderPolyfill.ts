/**
 * 最小 `TextDecoder` polyfill（UTF-8 / windows-1252 / UTF-16LE / UTF-16BE）。
 *
 * 为什么需要：
 * Hermes 没有 TextDecoder，而两个解析引擎都依赖它：
 * - mammoth（docx）的 Buffer 模拟层用 `new TextDecoder('utf-8')` 解 XML；
 * - SheetJS（xlsx）的 `cc2str()` 用 `new TextDecoder('latin1')` 把字节转成"二进制字符串"
 *   （它拿到 C1 区字符后再映射回字节），解 UTF-16 的部件还会用 `utf-16le/be`。
 *
 * ⚠️ 血泪教训：最初这里"只实现 UTF-8，其它标签也按 UTF-8 处理"，结果 docx 好了、
 * xlsx 全是方块 —— 因为 latin1 被当成 UTF-8 解，SheetJS 的字节流彻底错位。
 * 所以这里按标签分别实现，latin1 按 windows-1252 解（与浏览器/Node 的别名行为一致）。
 *
 * 纯逻辑、无 RN 依赖 → 可以用 Node 内置的 TextDecoder 做对照测试。
 */

/** WHATWG 解码失败时输出的替换字符 */
const REPLACEMENT = 0xfffd;

/** 通用续字节范围：0b10xxxxxx */
const CONTINUATION_MIN = 0x80;
const CONTINUATION_MAX = 0xbf;

/**
 * 每个首字节对应的**第一个续字节**范围。
 *
 * 这些区间不是随便取的，它们是 UTF-8 用来排除过长编码、代理区（U+D800~U+DFFF）
 * 和超出 U+10FFFF 的手段。只有逐字节按区间校验，替换字符的数量才能和浏览器一致
 * （例如 `ED A0 80` 应当在第二个字节处就报错，产出 3 个 U+FFFD，而不是 1 个）。
 */
function firstContinuationRange(lead: number): [number, number] | null {
  if (lead >= 0xc2 && lead <= 0xdf) return [CONTINUATION_MIN, CONTINUATION_MAX];
  if (lead === 0xe0) return [0xa0, CONTINUATION_MAX];
  if (lead >= 0xe1 && lead <= 0xec) return [CONTINUATION_MIN, CONTINUATION_MAX];
  if (lead === 0xed) return [CONTINUATION_MIN, 0x9f];
  if (lead >= 0xee && lead <= 0xef) return [CONTINUATION_MIN, CONTINUATION_MAX];
  if (lead === 0xf0) return [0x90, CONTINUATION_MAX];
  if (lead >= 0xf1 && lead <= 0xf3) return [CONTINUATION_MIN, CONTINUATION_MAX];
  if (lead === 0xf4) return [CONTINUATION_MIN, 0x8f];
  return null;
}

/** 该首字节开启的长度；0 表示非法首字节（0x80~0xC1 与 0xF5~0xFF） */
function sequenceLength(lead: number): number {
  if (lead < 0x80) return 1;
  if (lead < 0xc2) return 0;
  if (lead < 0xe0) return 2;
  if (lead < 0xf0) return 3;
  if (lead < 0xf5) return 4;
  return 0;
}

/**
 * UTF-8 字节 → 字符串。
 *
 * 按 WHATWG 的宽松规则处理非法序列：出错的**那一处**产出 U+FFFD，
 * 已经吃掉的合法续字节不再重复报错，出错的那个字节会被下一轮重新判断 ——
 * 这样残缺文件也能尽量读出内容，且替换结果与浏览器 TextDecoder 完全一致。
 */
export function decodeUtf8(bytes: Uint8Array, ignoreBOM = false): string {
  return decodeUtf8Detailed(bytes, ignoreBOM).text;
}

function decodeUtf8Detailed(
  bytes: Uint8Array,
  ignoreBOM: boolean
): { text: string; hadError: boolean } {
  const len = bytes.length;
  const units: number[] = [];
  let i = 0;
  let hadError = false;

  // 默认行为与浏览器一致：开头带 BOM 时把它吃掉（否则正文第一个字符会多出 U+FEFF）
  if (!ignoreBOM && len >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    i = 3;
  }

  while (i < len) {
    const lead = bytes[i];

    if (lead < 0x80) {
      units.push(lead);
      i += 1;
      continue;
    }

    const size = sequenceLength(lead);
    if (size === 0) {
      units.push(REPLACEMENT);
      hadError = true;
      i += 1;
      continue;
    }

    let codePoint = size === 2 ? lead & 0x1f : size === 3 ? lead & 0x0f : lead & 0x07;
    let consumed = 1;
    let broken = false;

    for (let k = 1; k < size; k += 1) {
      // 序列被文件末尾截断：整段算一个错误，且已经到末尾
      if (i + k >= len) {
        broken = true;
        break;
      }
      const next = bytes[i + k];
      const range = k === 1 ? firstContinuationRange(lead) : [CONTINUATION_MIN, CONTINUATION_MAX];
      if (!range || next < range[0] || next > range[1]) {
        broken = true;
        break;
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
      consumed += 1;
    }

    if (broken) {
      units.push(REPLACEMENT);
      hadError = true;
      i += consumed;
      continue;
    }

    i += size;

    if (codePoint > 0xffff) {
      const offset = codePoint - 0x10000;
      units.push(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
    } else {
      units.push(codePoint);
    }
  }

  // 分块 fromCharCode：一次拼接 8K 个码元，避免 apply 参数过多爆栈
  let text = '';
  const CHUNK = 8192;
  for (let start = 0; start < units.length; start += CHUNK) {
    text += String.fromCharCode(...units.slice(start, start + CHUNK));
  }
  return { text, hadError };
}

/**
 * windows-1252 的 0x80~0x9F 段（也就是大家口中的 "latin1"）。
 * 未定义的 5 个位置（0x81/0x8D/0x8F/0x90/0x9D）保留原码位，与浏览器一致。
 */
const WINDOWS_1252_HIGH =
  '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f' +
  '\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';

export function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 8192;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    const units: number[] = [];
    for (let i = start; i < end; i += 1) {
      const byte = bytes[i];
      units.push(byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_HIGH.charCodeAt(byte - 0x80) : byte);
    }
    out += String.fromCharCode(...units);
  }
  return out;
}

export function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const length = Math.floor(bytes.length / 2);
  const units: number[] = new Array(length);
  for (let i = 0; i < length; i += 1) {
    const a = bytes[i * 2];
    const b = bytes[i * 2 + 1];
    units[i] = littleEndian ? (b << 8) | a : (a << 8) | b;
  }
  if (bytes.length % 2 === 1) units.push(REPLACEMENT);

  let out = '';
  const CHUNK = 8192;
  for (let start = 0; start < units.length; start += CHUNK) {
    out += String.fromCharCode(...units.slice(start, start + CHUNK));
  }
  return out;
}

export type TextDecoderLabel = 'utf-8' | 'latin1' | 'utf-16le' | 'utf-16be';

/** 标签归一化：只认实际用得到的几类，未知标签按 utf-8 处理 */
export function normalizeLabel(label?: string): TextDecoderLabel {
  const value = (label ?? 'utf-8').trim().toLowerCase();
  if (value === 'latin1' || value === 'iso-8859-1' || value === 'windows-1252' || value === 'ascii') {
    return 'latin1';
  }
  if (value === 'utf-16le' || value === 'utf-16' || value === 'ucs-2' || value === 'unicode') {
    return 'utf-16le';
  }
  if (value === 'utf-16be') return 'utf-16be';
  return 'utf-8';
}

interface TextDecoderLikeOptions {
  fatal?: boolean;
  ignoreBOM?: boolean;
}

function toBytes(input?: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (!input) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return new Uint8Array(input as ArrayBuffer);
}

class PolyfillTextDecoder {
  readonly encoding: TextDecoderLabel;
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;

  constructor(label?: string, options?: TextDecoderLikeOptions) {
    this.encoding = normalizeLabel(label);
    this.fatal = options?.fatal === true;
    this.ignoreBOM = options?.ignoreBOM === true;
  }

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    const bytes = toBytes(input);
    if (this.encoding === 'latin1') return decodeLatin1(bytes);
    if (this.encoding === 'utf-16le') return decodeUtf16(bytes, true);
    if (this.encoding === 'utf-16be') return decodeUtf16(bytes, false);

    const result = decodeUtf8Detailed(bytes, this.ignoreBOM);
    // fatal 语义：遇到非法序列直接抛错（SheetJS 会 catch 后走手动逐字节回退）
    if (this.fatal && result.hadError) {
      throw new TypeError('The encoded data was not valid UTF-8');
    }
    return result.text;
  }
}

/**
 * 只在运行时确实缺失时安装，绝不覆盖宿主已有的实现。
 * 重复调用是幂等的。
 */
export function ensureTextDecoder(): void {
  const scope = globalThis as unknown as { TextDecoder?: unknown };
  if (typeof scope.TextDecoder === 'function') return;
  scope.TextDecoder = PolyfillTextDecoder;
}
