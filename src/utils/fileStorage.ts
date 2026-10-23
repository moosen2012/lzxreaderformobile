import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

/**
 * 应用自有的文件目录。
 *
 * 之前直接把 DocumentPicker 返回的 uri 存进 store —— 那是 cacheDirectory 下的副本，
 * 系统清理缓存后文件内容就永久读不到了（重载逻辑还静默失败）。
 * 这里把导入的文件复制到 documentDirectory 下的 library/，保证长期有效。
 */
const LIBRARY_PATH = 'library/';

function getLibraryDir(): string | null {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) return null;
  return `${FileSystem.documentDirectory}${LIBRARY_PATH}`;
}

/** 生成安全的文件名（保留中文，替换路径分隔符等危险字符） */
function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'untitled';
}

/**
 * 把选择器给到的临时文件复制到应用目录，返回持久化后的 uri。
 * 复制失败时回退为原始 uri，至少当前会话仍可读取。
 */
export async function persistPickedFile(asset: { uri: string; name: string }): Promise<string> {
  const dir = getLibraryDir();
  if (!dir) return asset.uri;

  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // 目录已存在
  }

  try {
    const target = `${dir}${Date.now()}-${sanitizeName(asset.name)}`;
    await FileSystem.copyAsync({ from: asset.uri, to: target });
    return target;
  } catch {
    return asset.uri;
  }
}

/** uri 是否位于应用自有目录（只有这类文件才允许跟随"删除"动作一起物理删除） */
export function isManagedUri(uri?: string): boolean {
  const dir = getLibraryDir();
  return !!uri && !!dir && uri.startsWith(dir);
}

/**
 * 删除被移除文件的本地副本。
 * 只删除 library/ 下的文件，用户原始文件（content:// 或外部路径）绝不触碰。
 */
export async function deleteImportedFile(uri?: string): Promise<void> {
  if (!isManagedUri(uri)) return;
  try {
    await FileSystem.deleteAsync(uri as string, { idempotent: true });
  } catch {
    // 删除失败不影响列表状态
  }
}
