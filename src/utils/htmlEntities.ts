/**
 * HTML 实体解码（纯函数，无 RN / Node 依赖）。
 *
 * 两处都用得上：
 * 1. `office/htmlToMarkdown` 解析 mammoth 产出的 HTML 时必须还原实体；
 * 2. `MarkdownRenderer` —— marked 会把正文里的 `&` `<` `>` 重新转义成 `&amp;` `&lt;` `&gt;`，
 *    而 react-native-marked 的 `text()` 只是把字符串塞进 `<Text>`，不会解码，
 *    于是"a & b"在屏幕上会显示成"a &amp; b"（docx 转换过来的文档尤其明显）。
 *
 * 只覆盖常见的命名实体 + 数字实体；不认识的实体原样保留（宁可显示原文，也不要吞掉内容）。
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  laquo: '«',
  raquo: '»',
  euro: '€',
  pound: '£',
  yen: '¥',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}
