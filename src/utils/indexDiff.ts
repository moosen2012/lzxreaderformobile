import type { FileItem } from '../types';

/**
 * 索引是否需要重写（纯函数，可 Node 单测）。
 *
 * 打开文件会 `updateFileContent` → files 换新数组，但落盘索引里根本不存正文，
 * 每翻一页都重写一份 8MB 的 json 纯属浪费。只有 id / 目录 / 名称 / uri 发生变化
 * （增删、移动、重新导入）才值得写盘。
 *
 * 数组顺序由 map/filter 保持，逐项比对即可；两万条约 1ms，远低于一次 8MB 写。
 */
export function isStructuralChange(prev: FileItem[], next: FileItem[]): boolean {
  if (prev === next) return false;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (a.id !== b.id || a.directory !== b.directory || a.name !== b.name || a.uri !== b.uri) {
      return true;
    }
  }
  return false;
}
