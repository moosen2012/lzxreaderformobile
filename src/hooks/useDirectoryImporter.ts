import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useReaderStore } from '../store/readerStore';
import { getFileType, isSupportedFile, isFileTooLarge } from '../utils/fileHelper';
import { mapWithConcurrency } from '../utils/async';
import type { FileItem, ImportDirectoryResult, ImportProgressCallback } from '../types';

/** 限制：最大导入文件数、最大递归深度、并发读取数 */
export const MAX_IMPORT_FILES = 200;
const MAX_DEPTH = 10;
const READ_CONCURRENCY = 6;

/**
 * Web 平台：使用 <input type="file" webkitdirectory> 选择整个目录。
 * 浏览器会自动递归收集所有文件，每个 File 对象的 webkitRelativePath 包含相对路径。
 */
function pickDirectoryWeb(): Promise<{ name: string; files: File[] } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;

    input.onchange = (event) => {
      const target = event.target as HTMLInputElement;
      const fileList = target.files;
      if (!fileList || fileList.length === 0) {
        input.remove();
        resolve(null);
        return;
      }

      const files = Array.from(fileList);
      // webkitRelativePath 格式: "rootDir/subdir/file.txt"
      const firstPath = files[0].webkitRelativePath || files[0].name;
      const rootName = firstPath.split('/')[0] || 'Imported';
      input.remove();
      resolve({ name: rootName, files });
    };

    input.oncancel = () => {
      input.remove();
      resolve(null);
    };

    input.click();
  });
}

/** SAF 目录遍历得到的文件条目（尚未读取内容） */
interface NativeEntry {
  uri: string;
  name: string;
  size?: number;
  lastModified?: number;
  directory: string;
}

/** 递归收集目录下所有受支持的文件（先收集再并发读取，便于统计总数并展示进度） */
async function collectNativeEntries(
  dirUri: string,
  relativePath: string,
  depth: number,
  output: NativeEntry[]
): Promise<void> {
  if (output.length >= MAX_IMPORT_FILES || depth >= MAX_DEPTH) return;

  const { StorageAccessFramework } = FileSystem;
  let entries: string[];
  try {
    entries = await StorageAccessFramework.readDirectoryAsync(dirUri);
  } catch {
    return;
  }

  for (const entryUri of entries) {
    if (output.length >= MAX_IMPORT_FILES) break;
    try {
      const info = await FileSystem.getInfoAsync(entryUri, { size: true });
      if (!info.exists) continue;

      const decodedName = decodeURIComponent(entryUri.split('%2F').pop() || 'unknown');

      if (info.isDirectory) {
        const childPath = relativePath ? `${relativePath}/${decodedName}` : decodedName;
        await collectNativeEntries(entryUri, childPath, depth + 1, output);
      } else {
        if (!isSupportedFile(decodedName)) continue;
        if (isFileTooLarge(info.size)) continue;
        output.push({
          uri: entryUri,
          name: decodedName,
          size: info.size,
          lastModified: info.modificationTime ? info.modificationTime * 1000 : undefined,
          directory: relativePath,
        });
      }
    } catch {
      // 单个条目处理失败，跳过继续
    }
  }
}

export function useDirectoryImporter() {
  const addFiles = useReaderStore((state) => state.addFiles);

  const importDirectory = useCallback(
    async (onProgress?: ImportProgressCallback): Promise<ImportDirectoryResult> => {
      try {
        // ===== Web 平台 =====
        if (Platform.OS === 'web') {
          const result = await pickDirectoryWeb();
          if (!result) {
            return { success: false, error: 'cancelled' };
          }

          const { name: rootName, files } = result;
          const supportedFiles = files.filter((f) => isSupportedFile(f.name));

          if (supportedFiles.length === 0) {
            return { success: false, error: '所选目录中没有支持的文件类型（md/txt/code 等）' };
          }
          if (supportedFiles.length > MAX_IMPORT_FILES) {
            return {
              success: false,
              error: `文件过多（${supportedFiles.length} 个），最多支持 ${MAX_IMPORT_FILES} 个`,
            };
          }

          const candidates = supportedFiles.filter((f) => !isFileTooLarge(f.size));
          let done = 0;

          const fileItems = await mapWithConcurrency<File, FileItem | null>(
            candidates,
            READ_CONCURRENCY,
            async (file) => {
              try {
                const content = await file.text();
                const relativePath: string = file.webkitRelativePath || file.name;
                const dirSegments = relativePath.split('/').slice(0, -1);
                const now = Date.now();

                return {
                  id: `web-dir-${now}-${relativePath}`,
                  name: file.name,
                  type: getFileType(file.name),
                  content,
                  uri: '',
                  size: file.size,
                  lastModified: file.lastModified,
                  addedAt: now,
                  directory: dirSegments.join('/'),
                };
              } catch {
                return null;
              } finally {
                done += 1;
                onProgress?.(done, candidates.length);
              }
            }
          );

          const validItems = fileItems.filter((item): item is FileItem => item !== null);
          if (validItems.length === 0) {
            return { success: false, error: '所有文件读取失败' };
          }

          addFiles(validItems);
          return { success: true, count: validItems.length, rootName };
        }

        // ===== Android 平台：使用 StorageAccessFramework =====
        // SAF 只有 Android 有实现，iOS 上调用会直接崩，这里显式拒绝并给出引导
        if (Platform.OS !== 'android') {
          return {
            success: false,
            error: '当前平台不支持导入整个目录，请使用「添加文件」逐个导入',
          };
        }

        const { StorageAccessFramework } = FileSystem;

        // 1. 请求目录权限
        const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) {
          return { success: false, error: 'cancelled' };
        }

        const rootUri = permissions.directoryUri;
        const rootName = decodeURIComponent(rootUri.split('%2F').pop() || rootUri.split('/').pop() || 'Imported');

        // 2. 先收集清单，再并发读取
        const entries: NativeEntry[] = [];
        await collectNativeEntries(rootUri, rootName, 0, entries);

        if (entries.length === 0) {
          return { success: false, error: '所选目录中没有支持的文件' };
        }

        let done = 0;
        const fileItems = await mapWithConcurrency<NativeEntry, FileItem | null>(
          entries,
          READ_CONCURRENCY,
          async (entry) => {
            try {
              const content = await FileSystem.readAsStringAsync(entry.uri, {
                encoding: FileSystem.EncodingType.UTF8,
              });
              const now = Date.now();
              return {
                id: entry.uri,
                name: entry.name,
                type: getFileType(entry.name),
                content,
                uri: entry.uri,
                size: entry.size,
                lastModified: entry.lastModified ?? now,
                addedAt: now,
                directory: entry.directory,
              };
            } catch {
              return null;
            } finally {
              done += 1;
              onProgress?.(done, entries.length);
            }
          }
        );

        const validItems = fileItems.filter((item): item is FileItem => item !== null);
        if (validItems.length === 0) {
          return { success: false, error: '所选目录中的文件都读取失败' };
        }

        addFiles(validItems);
        return { success: true, count: validItems.length, rootName };
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        return { success: false, error: `导入目录失败: ${message}` };
      }
    },
    [addFiles]
  );

  return { importDirectory };
}
