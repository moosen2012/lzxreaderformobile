/**
 * 极简 HTML → Markdown（纯函数，无 React / RN 依赖，可被 Node 直接跑回归测试）。
 *
 * 存在的原因：mammoth 把 .docx 转成 HTML，而应用里所有正文都走 MarkdownRenderer。
 * 与其再引入一个 HTML 渲染器（react-native-render-html，体积 + 另一套样式体系），
 * 不如把 mammoth 会产出的那一小撮标签转成 Markdown，复用现有的主题 / 字号 / 深色 / 高亮。
 *
 * 覆盖范围只针对 mammoth 的输出子集：
 *   h1-h6 / p / br / hr / strong,b / em,i / u / s,del,strike / code / a / img /
 *   ul / ol / li（含嵌套）/ table,tr,td,th / blockquote / pre / div,section,article
 * 不认识的行内标签降级成它的文本内容，不认识的块级标签按容器继续递归。
 */

import { decodeEntities } from '../htmlEntities.ts';

export interface HtmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: (HtmlNode | string)[];
}

/** 没有闭合标签的元素：解析时不能入栈 */
const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'col']);

/** 块级标签：决定"是否另起一段" */
const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'blockquote',
  'pre',
  'hr',
  'div',
  'section',
  'article',
  'body',
]);

/**
 * 实体解码实现已抽到 `utils/htmlEntities`（阅读器渲染 Markdown 时也要用：
 * marked 会把 `&` `<` `>` 重新转义，而 react-native-marked 的 text() 不解码）。
 * 这里重新导出，保持既有调用方与测试的导入路径不变。
 */
export { decodeEntities };


function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

/**
 * 把 HTML 片段解析成简单节点树。
 *
 * 之所以要建树而不是用正则逐段替换：Word 的嵌套列表是 `<ul><li>a<ul><li>b</li></ul></li></ul>`，
 * 非贪婪正则会在第一个 `</ul>` 处收工，把外层剩下的内容整段吞掉。
 */
export function parseHtml(html: string): (HtmlNode | string)[] {
  const root: HtmlNode = { tag: '#root', attrs: {}, children: [] };
  const stack: HtmlNode[] = [root];
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (parent: HtmlNode, raw: string) => {
    if (!raw) return;
    const text = decodeEntities(raw);
    if (!text.trim()) {
      // 纯空白只在两个行内元素之间才有意义，压成一个空格
      const last = parent.children[parent.children.length - 1];
      if (typeof last === 'string' && last.endsWith(' ')) return;
      parent.children.push(' ');
      return;
    }
    parent.children.push(text);
  };

  while ((match = tagRe.exec(html))) {
    pushText(stack[stack.length - 1], html.slice(lastIndex, match.index));
    lastIndex = tagRe.lastIndex;

    if (match[0].startsWith('<!--')) continue;

    const closing = match[1] === '/';
    const tag = (match[2] ?? '').toLowerCase();
    if (!tag) continue;

    if (closing) {
      // 逐层回退到同名标签；找不到就忽略这个闭合标签（容错优先）
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const node: HtmlNode = { tag, attrs: parseAttributes(match[3] ?? ''), children: [] };
    stack[stack.length - 1].children.push(node);
    const selfClosing = match[4] === '/' || VOID_TAGS.has(tag);
    if (!selfClosing) stack.push(node);
  }

  pushText(stack[stack.length - 1], html.slice(lastIndex));
  return root.children;
}

/** 内嵌图片超过这个长度就省略：base64 图片会直接进 FileItem.content，几十兆正文会把内存拖垮 */
const MAX_INLINE_IMAGE_CHARS = 400_000;

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function renderInline(nodes: (HtmlNode | string)[]): string {
  let out = '';
  for (const node of nodes) {
    if (typeof node === 'string') {
      out += node.replace(/[ \t\r\n]+/g, ' ');
      continue;
    }

    switch (node.tag) {
      case 'br':
        out += '\n';
        break;
      case 'strong':
      case 'b': {
        const inner = renderInline(node.children).trim();
        out += inner ? `**${inner}**` : '';
        break;
      }
      case 'em':
      case 'i': {
        const inner = renderInline(node.children).trim();
        out += inner ? `*${inner}*` : '';
        break;
      }
      case 's':
      case 'del':
      case 'strike': {
        const inner = renderInline(node.children).trim();
        out += inner ? `~~${inner}~~` : '';
        break;
      }
      case 'code': {
        const inner = renderInline(node.children).replace(/`/g, '');
        out += inner ? `\`${inner}\`` : '';
        break;
      }
      case 'a': {
        const inner = renderInline(node.children).trim();
        const href = node.attrs.href ?? '';
        out += href && !href.startsWith('#') ? `[${inner || href}](${href})` : inner;
        break;
      }
      case 'img': {
        const src = node.attrs.src ?? '';
        const alt = (node.attrs.alt ?? '图片').trim() || '图片';
        if (!src) break;
        if (src.startsWith('data:') && src.length > MAX_INLINE_IMAGE_CHARS) {
          out += `*[图片过大，已省略]*`;
          break;
        }
        out += `![${alt}](${src})`;
        break;
      }
      case 'hr':
        out += '\n\n---\n\n';
        break;
      default:
        // ✅ u / span / sub / sup / mark / small：只保留文字
        // ✅ 未知块级标签（div 等）在这里也按行内展开，避免内容丢失
        out += renderInline(node.children);
        break;
    }
  }
  return out;
}

function renderList(node: HtmlNode, depth: number): string {
  const ordered = node.tag === 'ol';
  const start = ordered ? Number.parseInt(node.attrs.start ?? '1', 10) : 1;
  let index = Number.isFinite(start) ? start : 1;
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  for (const child of node.children) {
    if (typeof child === 'string') {
      const text = child.trim();
      if (text) lines.push(`${indent}- ${text}`);
      continue;
    }
    if (child.tag !== 'li') continue;

    const inlineChildren: (HtmlNode | string)[] = [];
    const nestedLists: HtmlNode[] = [];
    for (const liChild of child.children) {
      if (typeof liChild !== 'string' && (liChild.tag === 'ul' || liChild.tag === 'ol')) {
        nestedLists.push(liChild);
      } else {
        inlineChildren.push(liChild);
      }
    }

    const marker = ordered ? `${index}. ` : '- ';
    index += 1;
    const text = renderInline(inlineChildren).replace(/\s+/g, ' ').trim();
    lines.push(`${indent}${marker}${text}`);
    for (const nested of nestedLists) {
      lines.push(renderList(nested, depth + 1));
    }
  }

  return lines.join('\n');
}

function collectRows(node: HtmlNode, rows: HtmlNode[]): void {
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (child.tag === 'tr') rows.push(child);
    else if (child.tag === 'thead' || child.tag === 'tbody' || child.tag === 'tfoot') {
      collectRows(child, rows);
    }
  }
}

function renderTable(node: HtmlNode): string {
  const rows: HtmlNode[] = [];
  collectRows(node, rows);
  if (rows.length === 0) return '';

  const matrix = rows.map((row) =>
    row.children
      .filter((cell): cell is HtmlNode => typeof cell !== 'string' && (cell.tag === 'td' || cell.tag === 'th'))
      .map((cell) => escapeTableCell(renderInline(cell.children)))
  );

  const columns = matrix.reduce((max, cells) => Math.max(max, cells.length), 0);
  if (columns === 0) return '';

  const pad = (cells: string[]): string[] => {
    const next = [...cells];
    while (next.length < columns) next.push('');
    return next;
  };

  const header = pad(matrix[0]);
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...matrix.slice(1).map((cells) => `| ${pad(cells).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function renderBlock(node: HtmlNode): string {
  const headingMatch = /^h([1-6])$/.exec(node.tag);
  if (headingMatch) {
    const text = renderInline(node.children).replace(/\s+/g, ' ').trim();
    return text ? `${'#'.repeat(Number(headingMatch[1]))} ${text}\n\n` : '';
  }

  switch (node.tag) {
    case 'p': {
      const text = renderInline(node.children).trim();
      return text ? `${text}\n\n` : '';
    }
    case 'ul':
    case 'ol':
      return `${renderList(node, 0)}\n\n`;
    case 'table': {
      const table = renderTable(node);
      return table ? `${table}\n\n` : '';
    }
    case 'blockquote': {
      const inner = renderBlocks(node.children).trim();
      if (!inner) return '';
      return `${inner
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')}\n\n`;
    }
    case 'pre': {
      const code = renderInline(node.children).replace(/^\n+|\n+$/g, '');
      return code ? `\`\`\`\n${code}\n\`\`\`\n\n` : '';
    }
    case 'hr':
      return '---\n\n';
    default:
      // div / section / article / body：纯容器，继续往里走
      return node.children.some((child) => typeof child !== 'string' && BLOCK_TAGS.has(child.tag))
        ? renderBlocks(node.children)
        : (() => {
            const text = renderInline(node.children).trim();
            return text ? `${text}\n\n` : '';
          })();
  }
}

function renderBlocks(nodes: (HtmlNode | string)[]): string {
  let out = '';
  let inlineBuffer: (HtmlNode | string)[] = [];

  const flushInline = () => {
    if (inlineBuffer.length === 0) return;
    const text = renderInline(inlineBuffer).trim();
    inlineBuffer = [];
    if (text) out += `${text}\n\n`;
  };

  for (const node of nodes) {
    if (typeof node === 'string') {
      inlineBuffer.push(node);
      continue;
    }
    if (!BLOCK_TAGS.has(node.tag)) {
      inlineBuffer.push(node);
      continue;
    }
    flushInline();
    out += renderBlock(node);
  }

  flushInline();
  return out;
}

/**
 * HTML → Markdown。返回的文本直接喂给 MarkdownRenderer。
 * 空段落丢弃、连续空行压成一个，避免 docx 里的空行使正文出现大片留白。
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return '';
  const markdown = renderBlocks(parseHtml(html));
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
