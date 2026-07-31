import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useReaderStore } from '../store/readerStore';
import { getFileType, isFileTooLarge, MAX_FILE_SIZE, extractDirectory } from '../utils/fileHelper';
import type { FileItem } from '../types';

// Web 平台文件选择：使用 HTML input 元素
function pickFileWeb(): Promise<{ name: string; content: string; size: number } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.mdown,.mkd,.txt,.text,.log,.js,.jsx,.ts,.tsx,.py,.go,.java,.c,.cpp,.cc,.h,.hpp,.cs,.rb,.php,.swift,.kt,.rs,.sh,.bash,.zsh,.sql,.html,.css,.scss,.less,.json,.xml,.yaml,.yml,.toml,.ini,.conf,.dart,.lua,.r,.scala,.clj,.ex,.exs,.erl,.vim';

    input.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      // 检查文件大小
      if (isFileTooLarge(file.size)) {
        reject(new Error(`文件过大（超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB），暂不支持加载`));
        return;
      }

      try {
        const content = await file.text();
        resolve({ name: file.name, content, size: file.size });
      } catch (err) {
        reject(new Error('文件读取失败，可能是编码不支持'));
      }
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

// Web 平台读取文件内容
function readFileWeb(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fetch(uri)
      .then((res) => res.text())
      .then(resolve)
      .catch(() => reject(new Error('文件读取失败')));
  });
}

export function useFilePicker() {
  const addFile = useReaderStore((state) => state.addFile);
  const setCurrentFile = useReaderStore((state) => state.setCurrentFile);

  const pickFile = useCallback(async (): Promise<{ success: boolean; error?: string; file?: FileItem }> => {
    try {
      // Web 平台
      if (Platform.OS === 'web') {
        try {
          const result = await pickFileWeb();
          if (!result) {
            return { success: false, error: 'cancelled' };
          }

          const fileType = getFileType(result.name);
          const fileItem: FileItem = {
            id: `web-${Date.now()}-${result.name}`,
            name: result.name,
            type: fileType,
            content: result.content,
            uri: '',
            size: result.size,
            lastModified: Date.now(),
            addedAt: Date.now(),
            directory: '',
          };

          addFile(fileItem);
          setCurrentFile(fileItem.id);

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

      if (!result.assets || result.assets.length === 0) {
        return { success: false, error: '未选择文件' };
      }

      const asset = result.assets[0];

      // 检查文件大小
      if (isFileTooLarge(asset.size)) {
        return {
          success: false,
          error: `文件过大（超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB），暂不支持加载`,
        };
      }

      // 读取文件内容
      let content: string;
      try {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } catch (readError) {
        return {
          success: false,
          error: '文件读取失败，可能是编码不支持',
        };
      }

      const fileType = getFileType(asset.name);
      const fileItem: FileItem = {
        id: asset.uri,
        name: asset.name,
        type: fileType,
        content,
        uri: asset.uri,
        size: asset.size,
        lastModified: Date.now(),
        addedAt: Date.now(),
        directory: extractDirectory(asset.uri, asset.name),
      };

      addFile(fileItem);
      setCurrentFile(fileItem.id);

      return { success: true, file: fileItem };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return { success: false, error: `文件选择失败: ${message}` };
    }
  }, [addFile, setCurrentFile]);

  return { pickFile };
}
