import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useReaderStore } from '../store/readerStore';
import { getFileType, isFileTooLarge, MAX_FILE_SIZE } from '../utils/fileHelper';
import { persistPickedFile } from '../utils/fileStorage';
import type { FileItem, PickFileResult } from '../types';

/** 与 EXTENSION_MAP 保持一致的 accept 列表（web 端 input 只认字符串） */
const WEB_ACCEPT =
  '.md,.markdown,.mdown,.mkd,.txt,.text,.log,.js,.jsx,.ts,.tsx,.py,.go,.java,.c,.cpp,.cc,.h,.hpp,.cs,.rb,.php,.swift,.kt,.rs,.sh,.bash,.zsh,.sql,.html,.css,.scss,.less,.json,.xml,.yaml,.yml,.toml,.ini,.conf,.dart,.lua,.r,.scala,.clj,.ex,.exs,.erl,.vim';

// Web 平台文件选择：使用 HTML input 元素
function pickFileWeb(): Promise<{ name: string; content: string; size: number } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = WEB_ACCEPT;

    // 用完必须移除，否则每次选文件都会在 DOM 里留下一个游离节点
    const cleanup = () => {
      input.onchange = null;
      input.oncancel = null;
      input.remove();
    };

    input.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }

      if (isFileTooLarge(file.size)) {
        cleanup();
        reject(new Error(`文件过大（超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB），暂不支持加载`));
        return;
      }

      try {
        const content = await file.text();
        cleanup();
        resolve({ name: file.name, content, size: file.size });
      } catch {
        cleanup();
        reject(new Error('文件读取失败，可能是编码不支持'));
      }
    };

    input.oncancel = () => {
      cleanup();
      resolve(null);
    };

    input.click();
  });
}

export function useFilePicker() {
  const addFile = useReaderStore((state) => state.addFile);
  const openFile = useReaderStore((state) => state.openFile);

  const pickFile = useCallback(async (): Promise<PickFileResult> => {
    try {
      // Web 平台
      if (Platform.OS === 'web') {
        try {
          const result = await pickFileWeb();
          if (!result) {
            return { success: false, error: 'cancelled' };
          }

          const now = Date.now();
          const fileItem: FileItem = {
            id: `web-${now}-${result.name}`,
            name: result.name,
            type: getFileType(result.name),
            content: result.content,
            uri: '',
            size: result.size,
            lastModified: now,
            addedAt: now,
            directory: '',
          };

          addFile(fileItem);
          openFile(fileItem.id);

          return { success: true, file: fileItem };
        } catch (webError) {
          const msg = webError instanceof Error ? webError.message : '文件选择失败';
          return { success: false, error: msg };
        }
      }

      // 原生平台 (iOS/Android)
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return { success: false, error: 'cancelled' };
      }

      const asset = result.assets?.[0];
      if (!asset) {
        return { success: false, error: '未选择文件' };
      }

      if (isFileTooLarge(asset.size)) {
        return {
          success: false,
          error: `文件过大（超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB），暂不支持加载`,
        };
      }

      let content: string;
      try {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } catch {
        return { success: false, error: '文件读取失败，可能是编码不支持' };
      }

      // 复制到 app 自有目录，避免 cache 被系统清理后内容永久丢失
      const permanentUri = await persistPickedFile({ uri: asset.uri, name: asset.name });
      const now = Date.now();

      const fileItem: FileItem = {
        // 用 名称+大小 做稳定 id：同一文件重复导入时覆盖，而不是堆出多条重复项
        id: `file-${asset.name}-${asset.size ?? content.length}`,
        name: asset.name,
        type: getFileType(asset.name),
        content,
        uri: permanentUri,
        size: asset.size,
        lastModified: asset.lastModified ?? now,
        addedAt: now,
        directory: '',
      };

      addFile(fileItem);
      // 打开刚导入的文件：右栏从"目录内容"切到阅读器
      openFile(fileItem.id);

      return { success: true, file: fileItem };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return { success: false, error: `文件选择失败: ${message}` };
    }
  }, [addFile, openFile]);

  return { pickFile };
}
