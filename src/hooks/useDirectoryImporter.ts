import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useReaderStore } from '../store/readerStore';
import { getFileType, isSupportedFile, isFileTooLarge } from '../utils/fileHelper';
import type { FileItem } from '../types';

// 限制：最大导入文件数、最大递归深度
const MAX_FILES = 200;
const MAX_DEPTH = 10;

interface ImportResult {
  success: boolean;
  error?: string;
  count?: number;
  rootName?: string;
}

/**
 * Web 平台：使用 <input type="file" webkitdirectory> 选择整个目录。
 * 浏览器会自动递归收集所有文件，每个 File 对象的 webkitRelativePath 包含相对路径。
 */
function pickDirectoryWeb(): Promise<{ name: string; files: File[] } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    // @ts-expect-error: webkitdirectory 是非标准属性，TS 不识别
    input.webkitdirectory = true;

    input.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const fileList = target.files;
      if (!fileList || fileList.length === 0) {
        resolve(null);
        return;
      }

      const files = Array.from(fileList);
      // 从第一个文件的 relativePath 获取根目录名
      // webkitRelativePath 格式: "rootDir/subdir/file.txt"
      // @ts-expect-error: webkitRelativePath 是非标准属性
      const firstPath = files[0].webkitRelativePath || files[0].name;
      const rootName = firstPath.split('/')[0] || 'Imported';

      resolve({ name: rootName, files });
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function useDirectoryImporter() {
  const addFiles = useReaderStore((state) => state.addFiles);

  const importDirectory = useCallback(async (): Promise<ImportResult> => {
    try {
      // ===== Web 平台 =====
      if (Platform.OS === 'web') {
        const result = await pickDirectoryWeb();
        if (!result) {
          return { success: false, error: 'cancelled' };
        }

        const { name: rootName, files } = result;

        // 过滤支持的文件类型
        const supportedFiles = files.filter((f) => isSupportedFile(f.name));
        if (supportedFiles.length === 0) {
          return { success: false, error: '所选目录中没有支持的文件类型（md/txt/code 等）' };
        }

        // 限制文件数量
        if (supportedFiles.length > MAX_FILES) {
          return { success: false, error: `文件过多（${supportedFiles.length} 个），最多支持 ${MAX_FILES} 个` };
        }

        const fileItems: FileItem[] = [];
        for (const file of supportedFiles) {
          // 检查文件大小
          if (isFileTooLarge(file.size)) continue;

          try {
            const content = await file.text();
            // @ts-expect-error: webkitRelativePath 是非标准属性
            const relativePath: string = file.webkitRelativePath || file.name;
            // 提取目录：保留根目录名，去掉文件名
            const segments = relativePath.split('/');
            // directory = 除了最后一个（文件名）之外的全部路径段（含根目录名）
            const dirSegments = segments.slice(0, -1);
            const directory = dirSegments.join('/');

            const fileItem: FileItem = {
              id: `web-dir-${Date.now()}-${relativePath}`,
              name: file.name,
              type: getFileType(file.name),
              content,
              uri: '',
              size: file.size,
              lastModified: file.lastModified,
              addedAt: Date.now(),
              directory,
            };
            fileItems.push(fileItem);
          } catch {
            // 单个文件读取失败，跳过继续
          }
        }

        if (fileItems.length === 0) {
          return { success: false, error: '所有文件读取失败' };
        }

        addFiles(fileItems);
        return { success: true, count: fileItems.length, rootName };
      }

      // ===== Android 平台：使用 StorageAccessFramework =====
      const { StorageAccessFramework } = FileSystem;

      // 1. 请求目录权限
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        return { success: false, error: 'cancelled' };
      }

      const rootUri = permissions.directoryUri;
      // 从 URI 提取根目录名
      const rootName = decodeURIComponent(rootUri.split('%2F').pop() || 'Imported');

      // 2. 递归遍历目录
      const fileItems: FileItem[] = [];
      let fileCount = 0;

      async function traverseDir(dirUri: string, relativePath: string, depth: number): Promise<void> {
        if (fileCount >= MAX_FILES || depth >= MAX_DEPTH) return;

        let entries: string[];
        try {
          entries = await StorageAccessFramework.readDirectoryAsync(dirUri);
        } catch {
          return; // 读取目录失败，跳过
        }

        for (const entryUri of entries) {
          if (fileCount >= MAX_FILES) break;

          try {
            const info = await FileSystem.getInfoAsync(entryUri, { size: true });

            if (!info.exists) continue;

            if (info.isDirectory) {
              // 递归处理子目录
              const dirName = decodeURIComponent(entryUri.split('%2F').pop() || 'unknown');
              const newRelative = relativePath ? `${relativePath}/${dirName}` : dirName;
              await traverseDir(entryUri, newRelative, depth + 1);
            } else {
              // 文件：检查是否支持
              const fileName = decodeURIComponent(entryUri.split('%2F').pop() || 'unknown');
              if (!isSupportedFile(fileName)) continue;
              if (isFileTooLarge(info.size)) continue;

              // 读取文件内容
              let content: string;
              try {
                content = await FileSystem.readAsStringAsync(entryUri, {
                  encoding: FileSystem.EncodingType.UTF8,
                });
              } catch {
                continue; // 读取失败，跳过
              }

              fileCount++;
              fileItems.push({
                id: entryUri,
                name: fileName,
                type: getFileType(fileName),
                content,
                uri: entryUri,
                size: info.size,
                lastModified: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
                addedAt: Date.now(),
                directory: relativePath,
              });
            }
          } catch {
            // 单个条目处理失败，跳过继续
          }
        }
      }

      await traverseDir(rootUri, rootName, 0);

      if (fileItems.length === 0) {
        return { success: false, error: '所选目录中没有支持的文件' };
      }

      addFiles(fileItems);
      return { success: true, count: fileItems.length, rootName };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return { success: false, error: `导入目录失败: ${message}` };
    }
  }, [addFiles]);

  return { importDirectory };
}
