import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useReaderStore } from '../store/readerStore';
import {
  getFileType,
  getUnsupportedOfficeHint,
  isBinaryDocument,
  isFileTooLarge,
  MAX_BINARY_FILE_SIZE,
  MAX_FILE_SIZE,
} from '../utils/fileHelper';
import { persistPickedFile } from '../utils/fileStorage';
import { convertOfficeDocument, isConvertibleType } from '../utils/office';
import { uint8ArrayToBase64 } from '../utils/office/base64';
import type { FileItem, PickFileResult } from '../types';

/** 与 EXTENSION_MAP 保持一致的 accept 列表（web 端 input 只认字符串） */
const WEB_ACCEPT =
  '.md,.markdown,.mdown,.mkd,.txt,.text,.log,.js,.jsx,.ts,.tsx,.py,.go,.java,.c,.cpp,.cc,.h,.hpp,.cs,.rb,.php,.swift,.kt,.rs,.sh,.bash,.zsh,.sql,.html,.css,.scss,.less,.json,.xml,.yaml,.yml,.toml,.ini,.conf,.dart,.lua,.r,.scala,.clj,.ex,.exs,.erl,.vim,.docx,.xlsx,.xls,.pdf';

function tooLargeMessage(fileName: string): string {
  const limit = isBinaryDocument(fileName) ? MAX_BINARY_FILE_SIZE : MAX_FILE_SIZE;
  return `文件过大（超过 ${Math.round(limit / (1024 * 1024))}MB），暂不支持加载`;
}

/** Web 平台文件选择：使用 HTML input 元素 */
function pickFileWeb(): Promise<File | null> {
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

    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      resolve(file);
    };

    input.oncancel = () => {
      cleanup();
      resolve(null);
    };

    input.click();
  });
}

/**
 * web 端把 File 变成 FileItem 的内容。
 * - 文本类：直接 file.text()；
 * - docx / xlsx：读 arrayBuffer 后就地转换（浏览器里 mammoth / xlsx 都能跑）；
 * - pdf：web 端没有原生 PDF 视图，明确拒绝而不是给个白屏。
 */
async function readWebFileContent(
  file: File
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const type = getFileType(file.name);
  const unsupported = getUnsupportedOfficeHint(file.name);
  if (unsupported) {
    return { ok: false, error: unsupported };
  }
  if (type === 'pdf') {
    return { ok: false, error: 'Web 端暂不支持 PDF 预览，请在手机 App 中打开' };
  }
  if (isConvertibleType(type)) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const markdown = await convertOfficeDocument(type, uint8ArrayToBase64(bytes));
      return { ok: true, content: markdown };
    } catch (error) {
      const message = error instanceof Error ? error.message : '文档解析失败';
      return { ok: false, error: message };
    }
  }
  try {
    return { ok: true, content: await file.text() };
  } catch {
    return { ok: false, error: '文件读取失败，可能是编码不支持' };
  }
}

export function useFilePicker() {
  const addFile = useReaderStore((state) => state.addFile);
  const addFiles = useReaderStore((state) => state.addFiles);
  const openFile = useReaderStore((state) => state.openFile);

  /**
   * 多选文件导入（iOS 的"导入目录"替代路径，设计稿 §5.5）：
   * iOS 系统没有目录选择器，DocumentPicker multiple:true 一次选多个文件，
   * 全部落到"导入"挂载点根（directory: ''）。
   */
  const pickFiles = useCallback(async (): Promise<PickFileResult> => {
    try {
      // Web 平台：input multiple
      if (Platform.OS === 'web') {
        const picked = await new Promise<File[]>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = WEB_ACCEPT;
          input.multiple = true;

          const cleanup = () => {
            input.onchange = null;
            input.oncancel = null;
            input.remove();
          };

          input.onchange = () => {
            const list = Array.from(input.files ?? []);
            cleanup();
            if (list.length === 0) resolve([]);
            else resolve(list);
          };
          input.oncancel = () => {
            cleanup();
            resolve([]);
          };
          input.click();
        }).catch(() => [] as File[]);

        if (picked.length === 0) return { success: false, error: 'cancelled' };

        const now = Date.now();
        const items: FileItem[] = [];
        for (const file of picked) {
          if (isFileTooLarge(file.size, file.name)) continue;
          const read = await readWebFileContent(file);
          if (!read.ok) continue;
          items.push({
            id: `web-${now}-${file.name}`,
            name: file.name,
            type: getFileType(file.name),
            content: read.content,
            uri: '',
            size: file.size,
            lastModified: file.lastModified || now,
            addedAt: now,
            directory: '',
          });
        }
        if (items.length === 0) return { success: false, error: '没有可导入的文件' };

        addFiles(items);
        return { success: true, file: items[0] };
      }

      // 原生平台（iOS 为主）：DocumentPicker 多选
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return { success: false, error: 'cancelled' };

      const now = Date.now();
      const items: FileItem[] = [];
      for (const asset of result.assets ?? []) {
        if (isFileTooLarge(asset.size, asset.name)) continue;
        // .doc / .pptx 这类明确不支持的格式直接跳过，不塞进索引里变成"点开是乱码"
        if (getUnsupportedOfficeHint(asset.name)) continue;
        try {
          const type = getFileType(asset.name);
          // 二进制文档不在这里读内容：正文由 ReaderContent 打开时按类型懒加载
          const content = isBinaryDocument(asset.name)
            ? ''
            : await FileSystem.readAsStringAsync(asset.uri, {
                encoding: FileSystem.EncodingType.UTF8,
              });
          const permanentUri = await persistPickedFile({ uri: asset.uri, name: asset.name });
          items.push({
            id: `file-${asset.name}-${asset.size ?? content.length}`,
            name: asset.name,
            type,
            content,
            uri: permanentUri,
            size: asset.size,
            lastModified: asset.lastModified ?? now,
            addedAt: now,
            directory: '',
          });
        } catch {
          // 单个失败跳过
        }
      }
      if (items.length === 0) return { success: false, error: '没有可导入的文件' };

      addFiles(items);
      return { success: true, file: items[0] };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return { success: false, error: `文件选择失败: ${message}` };
    }
  }, [addFiles]);

  const pickFile = useCallback(async (): Promise<PickFileResult> => {
    try {
      // Web 平台
      if (Platform.OS === 'web') {
        try {
          const picked = await pickFileWeb();
          if (!picked) {
            return { success: false, error: 'cancelled' };
          }

          if (isFileTooLarge(picked.size, picked.name)) {
            return { success: false, error: tooLargeMessage(picked.name) };
          }

          const read = await readWebFileContent(picked);
          if (!read.ok) return { success: false, error: read.error };

          const now = Date.now();
          const fileItem: FileItem = {
            id: `web-${now}-${picked.name}`,
            name: picked.name,
            type: getFileType(picked.name),
            content: read.content,
            uri: '',
            size: picked.size,
            lastModified: picked.lastModified || now,
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

      if (isFileTooLarge(asset.size, asset.name)) {
        return { success: false, error: tooLargeMessage(asset.name) };
      }

      const unsupportedHint = getUnsupportedOfficeHint(asset.name);
      if (unsupportedHint) {
        return { success: false, error: unsupportedHint };
      }

      const type = getFileType(asset.name);
      let content = '';
      if (!isBinaryDocument(asset.name)) {
        try {
          content = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        } catch {
          return { success: false, error: '文件读取失败，可能是编码不支持' };
        }
      }

      // 复制到 app 自有目录，避免 cache 被系统清理后内容永久丢失
      const permanentUri = await persistPickedFile({ uri: asset.uri, name: asset.name });
      const now = Date.now();

      const fileItem: FileItem = {
        // 用 名称+大小 做稳定 id：同一文件重复导入时覆盖，而不是堆出多条重复项
        id: `file-${asset.name}-${asset.size ?? content.length}`,
        name: asset.name,
        type,
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

  return { pickFile, pickFiles };
}
