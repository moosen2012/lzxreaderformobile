import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { FileItem } from '../types';

/**
 * 文件索引的磁盘存储（`documentDirectory/library/index.json`）。
 *
 * 为什么不再放在 AsyncStorage：
 * Android 的 AsyncStorage 底层是 SQLite + CursorWindow，**单条记录超过约 2MB 就读取失败**
 * （"Row too big to fit into CursorWindow"）。实测每条 FileItem 的 JSON ≈ 429 字节：
 * 720 个文件 ≈ 302KB 是安全的，但导入上限是 20000 → ≈ 8.2MB，必然撞上，
 * 而且失败是静默的：重启后整个索引消失，用户以为文件被删了。
 *
 * 落盘方案：
 * - 只存元数据（content 一律清空，原生平台本来就按 uri 懒加载）；
 * - 先写 `index.json.tmp` 再替换，读取时若正式文件缺失会回退到 tmp（进程被杀也有救）；
 * - web 没有 documentDirectory，仍走 AsyncStorage（受 MAX_WEB_FILES=2000 保护）。
 */

const LIBRARY_DIR = 'library/';
const INDEX_NAME = 'index.json';
const INDEX_TMP_NAME = 'index.json.tmp';

/** 索引文件格式版本（结构变化时递增，读取侧据此决定是否丢弃） */
const INDEX_FORMAT = 1;

export const isIndexStorageAvailable = Platform.OS !== 'web' && !!FileSystem.documentDirectory;

function dirPath(): string | null {
  if (!isIndexStorageAvailable) return null;
  return `${FileSystem.documentDirectory}${LIBRARY_DIR}`;
}

function indexPath(): string | null {
  const dir = dirPath();
  return dir ? `${dir}${INDEX_NAME}` : null;
}

function tmpPath(): string | null {
  const dir = dirPath();
  return dir ? `${dir}${INDEX_TMP_NAME}` : null;
}

/** 落盘前清空正文：内容按需从 uri 重读，存进去只会把索引撑大一两个数量级 */
export function stripContentForIndex(files: FileItem[]): FileItem[] {
  return files.map((file) => (file.content ? { ...file, content: '' } : file));
}

async function readJson(path: string): Promise<FileItem[] | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { format?: number; files?: unknown };
    if (parsed.format !== INDEX_FORMAT) return null;
    if (!Array.isArray(parsed.files)) return null;
    return parsed.files as FileItem[];
  } catch {
    return null;
  }
}

/** 读取索引；没有 / 损坏 / 版本不符都返回 null，由调用方决定是否重建 */
export async function readFileIndex(): Promise<FileItem[] | null> {
  const path = indexPath();
  if (!path) return null;
  const fromMain = await readJson(path);
  if (fromMain) return fromMain;
  // 上次替换过程中被杀：正式文件不在，但 tmp 已经是完整 JSON
  const tmp = tmpPath();
  return tmp ? readJson(tmp) : null;
}

/** 覆盖写索引。任何失败都吞掉（内存态仍然正确，下次变更会再写一次） */
async function performWrite(files: FileItem[]): Promise<boolean> {
  const path = indexPath();
  const tmp = tmpPath();
  const dir = dirPath();
  if (!path || !tmp || !dir) return false;

  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // 目录已存在
  }

  try {
    const payload = JSON.stringify({
      format: INDEX_FORMAT,
      savedAt: Date.now(),
      files: stripContentForIndex(files),
    });
    await FileSystem.writeAsStringAsync(tmp, payload, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    // expo 没有原子 rename-over，先删后移会有毫秒级空窗；
    // 读取侧的 tmp 回退就是为这个空窗准备的
    await FileSystem.deleteAsync(path, { idempotent: true });
    await FileSystem.moveAsync({ from: tmp, to: path });
    return true;
  } catch {
    return false;
  }
}

/**
 * 写队列：两次写并发时它们会抢同一个 `.tmp` 文件，后一次可能读到前半段。
 * 串行化之后每次写的都是完整 payload。
 */
let writeChain: Promise<unknown> = Promise.resolve();

export function writeFileIndex(files: FileItem[]): Promise<boolean> {
  const next = writeChain.then(() => performWrite(files));
  writeChain = next.catch(() => false);
  return next;
}

/** 索引是否存在（用于判断"是首启还是索引损坏"） */
export async function fileIndexExists(): Promise<boolean> {
  const path = indexPath();
  if (!path) return false;
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  } catch {
    return false;
  }
}
