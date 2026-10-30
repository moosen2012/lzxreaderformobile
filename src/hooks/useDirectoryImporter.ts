import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useReaderStore } from '../store/readerStore';
import { flushFileIndexNowAsync } from '../store/fileIndexSync';
import { getFileType, isBinaryDocument, isFileTooLarge, isSupportedFile } from '../utils/fileHelper';
import { scanDirectoryTree } from '../utils/directoryScanner';
import { createSafLister, isSafTreeAvailable, SAF_TREE_MISSING_MESSAGE } from '../services/saf';
import type {
  DirectoryItem,
  FileItem,
  ImportDirectoryOptions,
  ImportDirectoryResult,
  Mount,
} from '../types';

/**
 * 目录导入上限。
 *
 * 老实现是 200 个文件 / 10 层，超了直接 break 且没有任何提示——
 * 导入一个真实项目目录（例如 720 个 md、13 层）时用户只会看到"少了一大半文件"。
 * 现在只索引元数据、内容按需读，索引落在 `documentDirectory/library/index.json`
 * （见 utils/indexStorage：AsyncStorage 单条 ~2MB 上限装不下 2 万条），
 * 所以上限可以提高两个数量级，并且超限一定告知用户。
 */
export const MAX_IMPORT_FILES = 20000;
const MAX_IMPORT_DEPTH = 32;
/** 并发列目录数：一个目录一次 query，4 路并行对 SAF provider 比较温和 */
const SCAN_CONCURRENCY = 4;
/** Web 端需要把内容读进内存（没有持久 uri），上限压低 */
const MAX_WEB_FILES = 2000;

/**
 * 让出一帧再干重活。
 *
 * 导入收尾是同步的（合并几万条索引、写 8MB 的 index.json），如果紧接着上一次 setState
 * 执行，React 根本没机会把"正在写入文件索引…"画出来，用户看到的是浮层文字停留在上一阶段 + 卡顿。
 */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 16));
}

/** URI 解码失败（如文件名里有孤立 '%'）时退回原文，不抛异常 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 从 SAF tree URI 推导根目录名。
 * 不同 ROM 的 document provider 给出的 URI 形态不一：
 * 有的以 %2F 结尾、有的不含 %2F（此时末段形如 "primary:Documents/test"），
 * 不清洗会产出带尾斜杠/双斜杠/scheme 前缀的目录名，污染 FileItem.directory。
 */
function deriveRootName(treeUri: string): string {
  const raw = safeDecode(treeUri.split('%2F').pop() || treeUri.split('/').pop() || '');
  const lastSegment = raw.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
  const withoutScheme = lastSegment.includes(':') ? (lastSegment.split(':').pop() ?? '') : lastSegment;
  return withoutScheme || 'Imported';
}

/**
 * Web 平台：使用 <input type="file" webkitdirectory> 选择整个目录。
 * 浏览器会自动递归收集所有文件，每个 File 对象的 webkitRelativePath 包含相对路径。
 * 没有持久 uri，所以内容必须当场读进内存（web 是次要平台，上限压低）。
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

export function useDirectoryImporter() {
  const addImport = useReaderStore((state) => state.addImport);
  const cancelRef = useRef(false);

  /** 扫描过程中用户可以取消；取消后已扫描到的部分仍会写入（summary.cancelled = true） */
  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const importDirectory = useCallback(
    async (options: ImportDirectoryOptions = {}): Promise<ImportDirectoryResult> => {
      const { onProgress, onPhase, initialUri } = options;
      cancelRef.current = false;

      try {
        // ===== Web 平台 =====
        if (Platform.OS === 'web') {
          const picked = await pickDirectoryWeb();
          if (!picked) {
            return { success: false, error: 'cancelled' };
          }

          const { name: rootName, files } = picked;
          /**
           * web 端目录导入仍然只收文本：这里是一次性把每个文件读成 `file.text()`，
           * 对 docx/xlsx 这类二进制会把字节解坏。Office 文档在 web 上走"单文件打开"那条路（会即时转换）。
           */
          const supported = files.filter((f) => isSupportedFile(f.name) && !isBinaryDocument(f.name));
          if (supported.length === 0) {
            return { success: false, error: '所选目录中没有支持的文件类型（md/txt/code 等）' };
          }

          const truncated = supported.length > MAX_WEB_FILES;
          const candidates = supported
            .filter((f) => !isFileTooLarge(f.size, f.name))
            .slice(0, MAX_WEB_FILES);

          // 目录集合从相对路径反推（web 侧拿不到空目录信息）
          const dirSet = new Set<string>();
          for (const file of candidates) {
            const segments = (file.webkitRelativePath || file.name).split('/').slice(0, -1);
            let current = '';
            for (const seg of segments) {
              current = current ? `${current}/${seg}` : seg;
              dirSet.add(current);
            }
          }

          onPhase?.('scanning');

          const now = Date.now();
          const fileItems: FileItem[] = [];
          for (const file of candidates) {
            if (cancelRef.current) break;
            try {
              const content = await file.text();
              const relativePath: string = file.webkitRelativePath || file.name;
              const dirSegments = relativePath.split('/').slice(0, -1);

              fileItems.push({
                id: `web-dir-${relativePath}`,
                name: file.name,
                type: getFileType(file.name),
                content,
                uri: '',
                size: file.size,
                lastModified: file.lastModified,
                addedAt: now,
                directory: dirSegments.join('/'),
              });
            } catch {
              // 单个文件读取失败就跳过，不中断整批
            }
            onProgress?.({
              dirs: dirSet.size,
              files: fileItems.length,
              currentPath: file.webkitRelativePath || file.name,
            });
          }

          if (fileItems.length === 0) {
            return { success: false, error: '所有文件读取失败' };
          }

          const mount: Mount = {
            id: `web:${rootName}`,
            name: rootName,
            rootPath: rootName,
            kind: 'web',
            treeUri: null,
            addedAt: now,
            truncated,
          };

          onPhase?.('saving');
          await yieldToPaint();
          addImport({
            files: fileItems,
            directories: Array.from(dirSet, (path) => ({ path })),
            mount,
            // 扫描完整时才允许清掉旧条目：部分导入（超限/取消/部分目录失败）
            // 只做合并，否则没扫到的文件会被当成"已删除"从索引里抹掉
            replaceRoot: !truncated && !cancelRef.current,
          });
          onPhase?.('done');

          return {
            success: true,
            count: fileItems.length,
            rootName,
            summary: {
              files: fileItems.length,
              dirs: dirSet.size,
              skipped: supported.length - candidates.length,
              truncated,
              maxDepthHit: false,
              failedDirs: 0,
              cancelled: cancelRef.current,
            },
          };
        }

        // ===== Android：SAF + 原生列目录 =====
        if (Platform.OS !== 'android') {
          return {
            success: false,
            error: '当前平台不支持导入整个目录，请使用「添加文件」逐个导入',
          };
        }

        if (!isSafTreeAvailable) {
          return { success: false, error: SAF_TREE_MISSING_MESSAGE };
        }

        const { StorageAccessFramework } = FileSystem;

        // 1. 请求目录权限（expo 内部会 takePersistableUriPermission，重启后仍可读）
        // initialUri：重新授权时预选回原目录，成功后按稳定 id 覆盖索引，书签/最近不丢
        onPhase?.('picking');
        const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
        if (!permissions.granted) {
          return { success: false, error: 'cancelled' };
        }

        const treeUri = permissions.directoryUri;
        const rootName = deriveRootName(treeUri);

        // 2. 全深度扫描：只取元数据，不读内容
        onPhase?.('scanning');
        const lister = createSafLister(treeUri);
        const scan = await scanDirectoryTree({
          rootName,
          listChildren: (documentId) => lister(documentId),
          acceptFile: (name, size) => isSupportedFile(name) && !isFileTooLarge(size, name),
          maxFiles: MAX_IMPORT_FILES,
          maxDepth: MAX_IMPORT_DEPTH,
          concurrency: SCAN_CONCURRENCY,
          onProgress,
          shouldCancel: () => cancelRef.current,
        });

        const now = Date.now();
        const fileItems: FileItem[] = scan.files.map((item) => ({
          // 用 documentId 做稳定 id：重复导入同一目录是覆盖，而不是堆出重复项
          id: `saf:${item.documentId ?? item.path}`,
          name: item.name,
          type: getFileType(item.name),
          // 内容懒加载：导入只存 uri，打开文件时由 ReaderContent 读取
          content: '',
          uri: item.uri,
          size: item.size,
          lastModified: item.mtime ?? now,
          addedAt: now,
          directory: item.directory,
        }));

        if (fileItems.length === 0 && scan.directories.length <= 1) {
          // 用户在浮层上点了取消：静默退出，不要弹"没有支持的文件"误导人
          return { success: false, error: scan.stats.cancelled ? 'cancelled' : '所选目录中没有支持的文件' };
        }

        const mount: Mount = {
          id: `saf:${treeUri}`,
          name: rootName,
          rootPath: rootName,
          kind: 'saf',
          treeUri,
          addedAt: now,
          truncated: scan.stats.truncated,
        };

        // 3. 合并进索引并落盘。这两步都是同步重活（几万条 Map + 8MB JSON），
        //    先让出一帧把"正在写入文件索引…"画出来，再把写盘也纳入这一阶段，
        //    否则用户会在浮层关掉之后遇到一段没有解释的卡顿。
        onPhase?.('saving');
        await yieldToPaint();
        addImport({
          files: fileItems,
          directories: scan.directories.map<DirectoryItem>((path) => ({ path })),
          mount,
          /**
           * 重新扫描同一个目录时替换而不是合并 —— 否则磁盘上删掉的文件会一直留在列表里，
           * 点开才报"文件可能已被移动或删除"。
           * 只有"完整扫完"才敢替换：触顶 / 取消 / 部分目录失败时，没扫到的条目是未知状态。
           */
          replaceRoot:
            !scan.stats.truncated && !scan.stats.cancelled && scan.stats.failedDirs === 0,
        });
        await flushFileIndexNowAsync();
        onPhase?.('done');

        return {
          success: true,
          count: fileItems.length,
          rootName,
          summary: {
            files: scan.stats.files,
            dirs: scan.stats.dirs,
            skipped: scan.stats.skipped,
            truncated: scan.stats.truncated,
            maxDepthHit: scan.stats.maxDepthHit,
            failedDirs: scan.stats.failedDirs,
            cancelled: scan.stats.cancelled,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        return { success: false, error: `导入目录失败: ${message}` };
      }
    },
    [addImport]
  );

  return { importDirectory, cancel };
}
