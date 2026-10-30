/**
 * xlsx / xls 解析引擎 —— **唯一允许静态 import xlsx（SheetJS CE，Apache-2.0）的文件**。
 *
 * 表格在手机上没有横向滚动的地盘，所以这里不做"原样还原"，
 * 而是转成 Markdown 表格交给现有渲染器：能读、能搜、还能跟正文一起被主题/字号统一控制。
 * 行数 / 列数 / sheet 数都有上限，避免一张十万行的表把 JS 线程锁死。
 */

import * as XLSX from 'xlsx';
import { base64ToUint8Array } from './base64.ts';
import { ensureTextDecoder } from './textDecoderPolyfill.ts';

/** 单个 sheet 最多渲染多少行 / 列 */
const MAX_ROWS = 300;
const MAX_COLUMNS = 12;
/** 最多渲染多少个 sheet（一个工作簿塞 50 个 sheet 的情况并不罕见） */
const MAX_SHEETS = 8;

export interface XlsxEngineResult {
  markdown: string;
  truncated: boolean;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : String(value);
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function sheetToMarkdown(name: string, rows: unknown[][]): { markdown: string; truncated: boolean } {
  let truncated = false;

  // 去掉整行为空的行（Excel 的已用区域经常比实际内容大很多）
  const meaningful = rows.filter((row) => row.some((cell) => formatCell(cell) !== ''));
  const limitedRows = meaningful.slice(0, MAX_ROWS);
  if (meaningful.length > MAX_ROWS) truncated = true;

  const columns = limitedRows.reduce((max, row) => Math.max(max, row.length), 0);
  const visibleColumns = Math.min(columns, MAX_COLUMNS);
  if (columns > MAX_COLUMNS) truncated = true;

  if (limitedRows.length === 0 || visibleColumns === 0) {
    return { markdown: '', truncated };
  }

  const matrix = limitedRows.map((row) => {
    const cells = row.slice(0, visibleColumns).map(formatCell);
    // Markdown 表格的每行列数必须一致，行尾空格子要补齐
    while (cells.length < visibleColumns) cells.push('');
    return cells;
  });

  // 表头取第一行；如果第一行是空的（合并单元格常见），退化成"列 1/列 2"
  const header = matrix[0];
  const hasHeader = header.some((cell) => cell !== '');
  const headerCells = hasHeader ? header : header.map((_, index) => `列 ${index + 1}`);
  const bodyRows = hasHeader ? matrix.slice(1) : matrix;

  const lines = [
    `### ${name || '工作表'}`,
    '',
    `| ${headerCells.join(' | ')} |`,
    `| ${headerCells.map(() => '---').join(' | ')} |`,
    ...bodyRows.map((cells) => `| ${cells.join(' | ')} |`),
  ];

  if (truncated) {
    lines.push('', `*（表格过大，仅显示前 ${MAX_ROWS} 行 / ${MAX_COLUMNS} 列）*`);
  }

  return { markdown: lines.join('\n'), truncated };
}

/**
 * .xlsx / .xls(base64) → Markdown。
 *
 * 多 sheet 时每个 sheet 一个小标题；全部为空时返回空字符串，由上层给"表格里没有内容"的提示。
 */
export function xlsxToMarkdown(base64: string): XlsxEngineResult {
  // SheetJS 解某些 XML 部件时也会碰到 TextDecoder，Hermes 上没有内置实现
  ensureTextDecoder();

  const bytes = base64ToUint8Array(base64);
  if (bytes.length === 0) {
    throw new Error('文件内容为空');
  }

  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames.slice(0, MAX_SHEETS);
  let truncated = workbook.SheetNames.length > MAX_SHEETS;

  const sections: string[] = [];
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });
    const result = sheetToMarkdown(name, rows);
    if (result.truncated) truncated = true;
    if (result.markdown) sections.push(result.markdown);
  }

  if (sections.length === 0) return { markdown: '', truncated };

  const notice = truncated
    ? `\n\n*（工作簿较大，仅显示前 ${MAX_SHEETS} 个工作表）*`
    : '';

  return { markdown: `${sections.join('\n\n')}${notice}`, truncated };
}
