/**
 * docx 解析引擎 —— **唯一允许静态 import mammoth 的文件**。
 *
 * 重型依赖铁律（同 mathjaxEngine）：mammoth 的浏览器构建 ≈1.7MB，
 * 静态进启动路径会明显拖慢冷启动；其他文件一律通过 `utils/office/index` 里的
 * `convertDocx()`（内部 `import('./docxEngine')`）间接使用。
 * `scripts/test-math-render.mjs` 里有守卫扫描，违规会直接 FAIL。
 */

import mammoth from 'mammoth';
import { base64ToUint8Array, toArrayBuffer } from './base64.ts';
import { ensureTextDecoder } from './textDecoderPolyfill.ts';

type MammothInput = Parameters<typeof mammoth.convertToHtml>[0];

export interface DocxEngineResult {
  html: string;
  warnings: string[];
}

/**
 * .docx(base64) → HTML。
 *
 * mammoth 是"语义转换"而不是"版式还原"：分栏 / 文本框 / 页眉页脚 / 艺术字会丢，
 * 复杂表格会降级成普通表格。换来的是与 Markdown 文档完全一致的阅读体验（主题、字号、深色）。
 */
export async function docxToHtml(base64: string): Promise<DocxEngineResult> {
  // 必须先补 TextDecoder：Hermes 没有它，而 mammoth 的 Buffer 模拟层解码时一定会用
  ensureTextDecoder();

  const bytes = base64ToUint8Array(base64);
  if (bytes.length === 0) {
    throw new Error('文档内容为空');
  }

  const result = await mammoth.convertToHtml(
    /**
     * ⚠️ 只传 `arrayBuffer`，不要再同时传 `buffer`。
     * 传 `buffer` 会多走一条 Buffer 模拟层路径（同样依赖 TextDecoder，且更绕），
     * 没有任何好处：Metro 已把 mammoth alias 到浏览器构建（见 metro.config.js），
     * 它只认 `arrayBuffer`。TextDecoder 由 textDecoderPolyfill 负责补齐。
     */
    { arrayBuffer: toArrayBuffer(bytes) } as unknown as MammothInput,
    {
      // 中文 Word 常见样式名，默认样式表已经覆盖大部分；这里补上题注 / 引用
      styleMap: [
        "p[style-name='标题 1'] => h1:fresh",
        "p[style-name='标题 2'] => h2:fresh",
        "p[style-name='标题 3'] => h3:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
      ],
    }
  );

  return {
    html: result.value,
    warnings: (result.messages ?? [])
      .map((message) => message.message)
      .filter((message): message is string => typeof message === 'string'),
  };
}
