/**
 * base64 → Uint8Array（纯函数，无 RN / Node 依赖）。
 *
 * 为什么不直接用 `atob`：Hermes 与不同 RN 版本对 `atob` / `Buffer` 的支持不一致，
 * 而 docx / xlsx 解析只需要一段字节，自己解最省事，也能在 Node 里直接单测。
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET[i]] = i;
  // URL-safe 变体（部分 provider 会给出 -_ 而不是 +/）
  table['-'] = 62;
  table['_'] = 63;
  return table;
})();

export function base64ToUint8Array(base64: string): Uint8Array {
  // 去掉 data URI 前缀与所有空白（base64 内容里不允许出现换行，但实际文件里很常见）
  const cleaned = base64.replace(/^data:[^,]*,/, '').replace(/[\s\r\n]+/g, '').replace(/=+$/, '');
  const byteLength = Math.floor((cleaned.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < cleaned.length; i += 1) {
    const value = LOOKUP[cleaned[i]];
    if (value === undefined) continue; // 非法字符直接跳过，容错优先
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex] = (buffer >> bits) & 0xff;
      byteIndex += 1;
    }
  }

  return byteIndex === bytes.length ? bytes : bytes.slice(0, byteIndex);
}

/** Uint8Array → 独立的 ArrayBuffer（mammoth / xlsx 都要求连续内存） */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Uint8Array → base64。
 * 只给 web 端用：浏览器拿到的是 ArrayBuffer，而转换门面的入参统一是 base64。
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // 一次拼 32KB，避免 apply 参数过多爆栈
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === 'function') return btoa(binary);
  // 极少数环境没有 btoa：退回手工编码
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const triple = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += ALPHABET[(triple >> 18) & 63];
    out += ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? ALPHABET[triple & 63] : '=';
  }
  return out;
}
