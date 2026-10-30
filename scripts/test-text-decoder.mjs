/**
 * TextDecoder polyfill 的对照测试。
 *
 * 真机上（Hermes）没有 TextDecoder，而 mammoth 解 docx 一定要用 ——
 * 之前打开 Word 直接报 `Property 'TextDecoder' doesn't exist`。
 * 这里用 Node 内置的 TextDecoder 作为标准答案，逐字节比对我们的 UTF-8 解码：
 * 合法输入必须完全一致，非法/截断输入也必须给出相同的 U+FFFD 替换结果。
 */
import {
  decodeLatin1,
  decodeUtf8,
  decodeUtf16,
  normalizeLabel,
  ensureTextDecoder,
} from '../src/utils/office/textDecoderPolyfill.ts';

const encoder = new TextEncoder();
const native = new TextDecoder();

const cases = [
  { name: '空输入', text: '' },
  { name: '纯 ASCII', text: 'Hello, LZX Reader!' },
  { name: '中文', text: '这是一段中文正文，用来验证解码是否正常。' },
  { name: '中英混排 + 标点', text: '第一章：标题（测试）；English, punctuation & symbols <>"' },
  { name: '多语言', text: '日本語のテキスト / 한글 텍스트 / Ελληνικά / Русский' },
  { name: '四字节（emoji / 代理对）', text: 'PDF 🎉📄 表情符号 👍🏽' },
  { name: '换行与制表', text: 'line1\nline2\r\nline3\ttabbed' },
  { name: '特殊空字符', text: '\u0000\u0007\u001f' },
];

const byteCases = [
  { name: '单个非法字节 0xFF', bytes: [0xff] },
  { name: '过长编码 0xC0 0xAF', bytes: [0xc0, 0xaf] },
  { name: '被截断的三字节序列', bytes: [0xe4, 0xb8] },
  { name: 'UTF-8 编码的代理区（非法）', bytes: [0xed, 0xa0, 0x80] },
  { name: '残缺文件中夹杂合法字符', bytes: [0x61, 0xff, 0xe4, 0xb8, 0xad, 0x62] },
];

let failed = 0;

function report(name, ok, detail) {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL  ${name}${detail ? ` (${detail})` : ''}`);
}

for (const testCase of cases) {
  const bytes = encoder.encode(testCase.text);
  const actual = decodeUtf8(bytes);
  report(
    `decodeUtf8 与原生一致：${testCase.name}`,
    actual === testCase.text && actual === native.decode(bytes),
    `expected ${JSON.stringify(native.decode(bytes))} got ${JSON.stringify(actual)}`
  );
}

for (const testCase of byteCases) {
  const bytes = new Uint8Array(testCase.bytes);
  const actual = decodeUtf8(bytes);
  const expected = native.decode(bytes);
  report(
    `decodeUtf8 非法序列替换一致：${testCase.name}`,
    actual === expected,
    `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`
  );
}

// BOM：默认吃掉（与浏览器一致），ignoreBOM=true 时保留
const bomBytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x62]);
report('默认剥离 BOM', decodeUtf8(bomBytes) === 'ab', JSON.stringify(decodeUtf8(bomBytes)));
report(
  'ignoreBOM=true 保留 BOM',
  decodeUtf8(bomBytes, true) === '\ufeffab',
  JSON.stringify(decodeUtf8(bomBytes, true))
);

// ArrayBuffer / TypedArray 视图都要能吃（mammoth 传的是 ArrayBuffer）
const view = encoder.encode('视图输入');
const fromView = decodeUtf8(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
report('接受 TypedArray 视图', fromView === '视图输入', fromView);

// ---------- latin1（windows-1252）：SheetJS 用它把字节转成二进制字符串 ----------
// 全 256 字节逐一对齐原生实现。这一条特别重要：最初 polyfill 把所有标签都按 UTF-8 解，
// 导致 xlsx 解析出来的全是方块字。
const allBytes = new Uint8Array(256);
for (let i = 0; i < 256; i += 1) allBytes[i] = i;
report(
  'latin1 全 256 字节与原生一致',
  decodeLatin1(allBytes) === new TextDecoder('latin1').decode(allBytes),
  'windows-1252 高区映射不一致'
);
report(
  'latin1 只做单字节映射（0xE4 0xB8 0xAD 不当 UTF-8 解）',
  decodeLatin1(new Uint8Array([0xe4, 0xb8, 0xad])) ===
    new TextDecoder('latin1').decode(new Uint8Array([0xe4, 0xb8, 0xad])),
  'latin1 被错误地当成 UTF-8'
);

// ---------- utf-16le / utf-16be：xlsx 里的 UTF-16 部件 ----------
const utf16le = new Uint8Array([0x2d, 0x4e, 0x87, 0x65]); // 中文
report(
  'utf-16le 与原生一致',
  decodeUtf16(utf16le, true) === new TextDecoder('utf-16le').decode(utf16le) &&
    decodeUtf16(utf16le, true) === '中文',
  JSON.stringify(decodeUtf16(utf16le, true))
);
const utf16be = new Uint8Array([0x4e, 0x2d, 0x65, 0x87]);
report(
  'utf-16be 与原生一致',
  decodeUtf16(utf16be, false) === new TextDecoder('utf-16be').decode(utf16be) &&
    decodeUtf16(utf16be, false) === '中文',
  JSON.stringify(decodeUtf16(utf16be, false))
);
report(
  'utf-16 奇数长度补替换字符',
  decodeUtf16(new Uint8Array([0x61, 0x00, 0x62]), true) === 'a\ufffd',
  JSON.stringify(decodeUtf16(new Uint8Array([0x61, 0x00, 0x62]), true))
);

// ---------- 标签归一化 ----------
report(
  '标签归一化：latin1 / iso-8859-1 / windows-1252 视为同一类',
  normalizeLabel('latin1') === 'latin1' &&
    normalizeLabel('ISO-8859-1') === 'latin1' &&
    normalizeLabel('windows-1252') === 'latin1',
  '别名映射不对'
);
report(
  '标签归一化：utf-16 / utf-16le 归一',
  normalizeLabel('utf-16') === 'utf-16le' && normalizeLabel('UTF-16LE') === 'utf-16le',
  'utf-16 别名映射不对'
);
report('标签归一化：未知标签回退 utf-8', normalizeLabel('gbk') === 'utf-8', '未知标签未回退');

// ---------- fatal 语义 ----------
ensureTextDecoder();
let fatalThrew = false;
try {
  new globalThis.TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([0xff]));
} catch {
  fatalThrew = true;
}
report('fatal:true 遇到非法字节抛错（与原生行为一致）', fatalThrew, '没有抛错');

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 个用例失败`);
process.exit(failed === 0 ? 0 : 1);
