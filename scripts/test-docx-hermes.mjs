/**
 * docx 解析在"没有 TextDecoder 的运行时"（= Hermes）里的回归测试。
 *
 * 背景：真机打开任何 Word 都会报 `Property 'TextDecoder' doesn't exist`。
 * mammoth 的浏览器构建自带 Buffer 模拟层，解 docx 时会对 `new TextDecoder('utf-8')` 求值，
 * 而 Hermes 没有这个全局 —— 偏偏 Node 有，所以以前的 Node 单测全绿、真机全崩。
 *
 * 这个脚本先把 `globalThis.TextDecoder` 删掉再跑真实转换，等于把 Hermes 的缺失复现出来；
 * 用的是 Metro 实际打包的那份 `mammoth.browser.js`（不是 Node 构建），所以测的就是线上路径。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ensureTextDecoder } from '../src/utils/office/textDecoderPolyfill.ts';
import { htmlToMarkdown } from '../src/utils/office/htmlToMarkdown.ts';

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL  ${name}${detail ? ` (${detail})` : ''}`);
}

// 1. 先把运行时伪装成 Hermes
const nativeTextDecoder = globalThis.TextDecoder;
delete globalThis.TextDecoder;
check('前置条件：模拟运行时确实没有 TextDecoder', typeof globalThis.TextDecoder === 'undefined');

// 2. polyfill 之后必须可用，且重复调用幂等
ensureTextDecoder();
check('polyfill 安装成功', typeof globalThis.TextDecoder === 'function');
const installed = globalThis.TextDecoder;
ensureTextDecoder();
check('polyfill 重复调用不会覆盖已有实现', globalThis.TextDecoder === installed);

// 3. 用 Metro 实际打包的浏览器构建解一份真实 docx
const require = createRequire(import.meta.url);
const mammoth = require('mammoth/mammoth.browser.js');
const raw = readFileSync('testdata/sample.docx');
const arrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);

let html = '';
let failure = null;
try {
  const result = await mammoth.convertToHtml({ arrayBuffer });
  html = result.value;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
}

check('无 TextDecoder 环境下 mammoth 不再抛错', failure === null, failure ?? '');
check('中文标题解析正确（UTF-8 解码没被 polyfill 弄坏）', html.includes('第一章 测试标题'));
check('中文正文解析正确', html.includes('这是一段中文正文'));
check('列表项解析正确', html.includes('条目一') && html.includes('条目二'));
check('XML 实体被还原为普通字符', html.includes('&amp;') && html.includes('&lt;'));

// 4. HTML → Markdown 这一段也要能吃到（整条链路直到渲染器）
const markdown = htmlToMarkdown(html);
check('HTML → Markdown 保留了标题与正文', markdown.includes('第一章 测试标题') && markdown.includes('这是一段中文正文'));

// 5. 恢复现场，避免影响后续测试
globalThis.TextDecoder = nativeTextDecoder;

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 个用例失败`);
process.exit(failed === 0 ? 0 : 1);
