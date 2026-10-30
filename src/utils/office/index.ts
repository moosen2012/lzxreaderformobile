/**
 * Office 文档转换门面。
 *
 * 重型依赖（mammoth ≈1.7MB、xlsx ≈1MB）一律延迟加载：
 * 只有用户真的打开 docx / xlsx 时才会把对应引擎拉进内存，启动路径保持干净。
 * 这也是 `mathjaxEngine` 已经在用的同一套做法。
 */

import type { FileType } from '../../types';
import { htmlToMarkdown } from './htmlToMarkdown.ts';

/** 需要"二进制 → Markdown"转换的类型 */
export type ConvertibleType = Extract<FileType, 'docx' | 'xlsx'>;

export function isConvertibleType(type: FileType): type is ConvertibleType {
  return type === 'docx' || type === 'xlsx';
}

/** 转换结果缓存：同一文件被反复打开时不必再解一次 zip（正文 LRU 只留 3 条，很容易被挤掉） */
const CACHE_LIMIT = 2;
const cache = new Map<string, string>();

function readCache(key: string): string | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  // 命中后移到队尾，维持 LRU 顺序
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function writeCache(key: string, markdown: string): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, markdown);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * 把解析层的原始异常翻成用户能照做的提示。
 *
 * 最容易被误解的是"加密文档"：它同样是 zip 结构，但 read 时会在某个 xml 处失败，
 * 如果不翻译，用户看到的是一串英文栈信息。
 */
function describeError(error: unknown, type: ConvertibleType): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  const label = type === 'docx' ? 'Word 文档' : 'Excel 表格';

  if (lower.includes('empty') || raw.includes('内容为空')) {
    return `${label}内容为空`;
  }
  if (
    lower.includes('end of central directory') ||
    lower.includes('corrupt') ||
    lower.includes('invalid signature') ||
    lower.includes('zip')
  ) {
    return `无法解析这个${label}：文件可能已加密、损坏，或不是真正的 .${type} 文件`;
  }
  return raw ? `无法解析这个${label}：${raw}` : `无法解析这个${label}`;
}

async function convertDocx(base64: string): Promise<string> {
  const { docxToHtml } = await import('./docxEngine');
  const { html } = await docxToHtml(base64);
  const markdown = htmlToMarkdown(html);
  if (!markdown) {
    throw new Error('empty');
  }
  return markdown;
}

async function convertXlsx(base64: string): Promise<string> {
  const { xlsxToMarkdown } = await import('./xlsxEngine');
  const { markdown } = xlsxToMarkdown(base64);
  if (!markdown) {
    throw new Error('empty');
  }
  return markdown;
}

/**
 * 二进制内容（base64）→ 可直接交给 MarkdownRenderer 的 Markdown。
 *
 * @param type     docx / xlsx
 * @param base64   文件内容的 base64
 * @param cacheKey 建议传 fileId；同一文件重复打开可跳过解析
 */
export async function convertOfficeDocument(
  type: ConvertibleType,
  base64: string,
  cacheKey?: string
): Promise<string> {
  if (cacheKey) {
    const cached = readCache(cacheKey);
    if (cached !== undefined) return cached;
  }

  let markdown: string;
  try {
    markdown = type === 'docx' ? await convertDocx(base64) : await convertXlsx(base64);
  } catch (error) {
    throw new Error(describeError(error, type));
  }

  if (cacheKey) writeCache(cacheKey, markdown);
  return markdown;
}
