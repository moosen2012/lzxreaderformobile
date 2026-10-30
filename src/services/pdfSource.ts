import * as FileSystem from 'expo-file-system';
import { readBase64File } from './saf';

/**
 * 把任意来源的 PDF 变成"原生 PDF 视图能直接读的本地路径"。
 *
 * 为什么必须复制一份：
 * react-native-pdf 的 JS 层对 `content://` 走的是
 * `path = decodeURIComponent(uri.replace(/file:\/\//i, ''))` 这条 else 分支
 * （node_modules/react-native-pdf/index.js 的 `_prepareFile`）。
 * `decodeURIComponent` 会把 SAF 文档 URI 里的 `%3A` / `%2F` 解回裸 `:` 和 `/`：
 *
 *   content://.../tree/primary%3ADownload%2Fdoc/document/primary%3ADownload%2Fdoc%2Fa.pdf
 *   → content://.../tree/primary:Download/doc/document/primary:Download/doc/a.pdf
 *
 * 路径段被斜杠切开后，系统算出的 tree id 只剩 `primary:Download`，
 * 与授权的 `primary:Download/doc` 对不上 —— ExternalStorageProvider 直接抛
 * SecurityException；而 PdfView 在 `onAttachedToWindow` 里只 catch FileNotFoundException，
 * 异常从 UI 线程冒出去 → **整个进程被系统杀掉**（真机表现为"打开 PDF 闪退"）。
 *
 * 复制到 `cacheDirectory` 后传纯本地路径，`decodeURIComponent` 对 ASCII 路径是恒等变换，
 * 原生 PdfRenderer 也能按文件流读取，彻底绕开这些问题。
 */

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}pdf-cache/`;

/**
 * 稳定短名（djb2 → 8 位 hex）。
 * 用 hash 而不是原文件名有两个原因：原文件名可能含中文 / `%` / 空格，
 * 经过 `decodeURIComponent` 会抛 URIError；同名不同目录也会互相覆盖。
 */
function cacheNameFor(uri: string): string {
  let hash = 5381;
  for (let i = 0; i < uri.length; i += 1) {
    hash = ((hash << 5) + hash + uri.charCodeAt(i)) | 0;
  }
  return `${(hash >>> 0).toString(16)}.pdf`;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // 目录已存在 / 并发创建都会走到这里，忽略
  }
}

/**
 * @returns 可以直接交给 react-native-pdf 的本地路径（file:// 或绝对路径）
 */
export async function resolveLocalPdfPath(uri: string): Promise<string> {
  // 含 `%` 的本地路径同样会被 decodeURIComponent 改写甚至抛错，一并复制
  const needsLocalCopy = uri.startsWith('content://') || uri.includes('%');
  if (!needsLocalCopy) return uri;
  if (!FileSystem.cacheDirectory) return uri;

  await ensureDir(CACHE_DIR);
  const target = `${CACHE_DIR}${cacheNameFor(uri)}`;

  const existing = await FileSystem.getInfoAsync(target);
  if (existing.exists) return target;

  try {
    // expo 的 copy 内部走 ContentResolver，externalstorage 这类 provider 都能读
    await FileSystem.copyAsync({ from: uri, to: target });
  } catch {
    // 云盘（Drive / OneDrive）的 content:// 有时不允许 expo 直接 copy：
    // 退回"原生读成 base64 → 写盘"，这条链路是我们自己维护的，覆盖面更广
    const base64 = await readBase64File(uri);
    await FileSystem.writeAsStringAsync(target, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  return target;
}
