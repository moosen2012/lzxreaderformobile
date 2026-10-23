/**
 * Markdown 预处理（纯函数，不依赖 React Native，便于单测）。
 *
 * 目标：把 $...$ / $$...$$ 转成 katex 代码块标记，交给渲染器接管。
 * 关键约束：**不能碰代码块和行内代码里的 $**。
 * 早期实现直接对整个文档跑正则，导致代码块里的 $HOME、${i} 被当成公式，
 * 讲公式的示例代码显示直接错乱。
 */

/** 行内公式标记前缀（渲染器通过 codespan 拦截） */
export const INLINE_MATH_MARKER = '$KATEX$';

const INLINE_CODE_TOKEN = '\u0000IC';
const MATH_BLOCK_TOKEN = '\u0000MB';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 段内公式转换：先保护行内代码，再处理块级/行内公式 */
export function convertMathInText(text: string): string {
  const inlineCodes: string[] = [];
  const mathBlocks: string[] = [];

  let output = text.replace(/`[^`\n]*`/g, (matched) => {
    inlineCodes.push(matched);
    return `${INLINE_CODE_TOKEN}${inlineCodes.length - 1}\u0000`;
  });

  // 块级公式先抽成占位符，最后还原为围栏，避免被行内正则二次命中
  output = output.replace(/\$\$([\s\S]+?)\$\$/g, (_matched, math: string) => {
    mathBlocks.push(math.trim());
    return `${MATH_BLOCK_TOKEN}${mathBlocks.length - 1}\u0000`;
  });

  // 行内公式：首尾带空格的多半是货币（"$5 到 $10"），跳过
  output = output.replace(/\$([^\n$]+?)\$/g, (matched, math: string) => {
    if (!math.trim() || /^\s/.test(math) || /\s$/.test(math)) return matched;
    return `\`${INLINE_MATH_MARKER}${math}\``;
  });

  output = output.replace(
    new RegExp(`${escapeRegExp(INLINE_CODE_TOKEN)}(\\d+)\\u0000`, 'g'),
    (_matched, index: string) => inlineCodes[Number(index)] ?? ''
  );
  output = output.replace(
    new RegExp(`${escapeRegExp(MATH_BLOCK_TOKEN)}(\\d+)\\u0000`, 'g'),
    (_matched, index: string) => `\`\`\`katex\n${mathBlocks[Number(index)] ?? ''}\n\`\`\``
  );

  return output;
}

/** 剥离 YAML frontmatter */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/**
 * 按 ``` 围栏切分文档，只在"非代码块"的文本段里转换公式。
 */
export function preprocessMarkdown(content: string): string {
  const lines = stripFrontmatter(content).split('\n');

  const segments: string[] = [];
  let buffer: string[] = [];
  let fenceMarker: string | null = null;

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    segments.push(convertMathInText(buffer.join('\n')));
    buffer = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fenceMarker === null) {
        flushBuffer();
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        fenceMarker = null;
      }
      segments.push(line);
      continue;
    }

    if (fenceMarker !== null) {
      segments.push(line);
    } else {
      buffer.push(line);
    }
  }
  flushBuffer();

  return segments.join('\n');
}
