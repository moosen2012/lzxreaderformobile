import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ReaderState,
  FileItem,
  DirectoryItem,
  Mount,
  BrowserView,
  SortKey,
} from '../types';
import { getFileDirectory, getParentPath, isPathInside, normalizePath } from '../utils/fileTree';

/** 老版本按导入路径推导出来的假目录（library / Documents），迁移时统一清回根目录 */
const LEGACY_FAKE_DIR = /(^|\/)(library|Documents)(\/|$)/;

/**
 * 正文缓存条数（设计稿 §6.3 分层缓存）。
 * 之前没有任何淘汰：一次会话里翻过的文件正文全部常驻，20k 索引下内存会单调增长。
 */
const CONTENT_CACHE_SIZE = 3;

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      files: [],
      directories: [],
      mounts: [],
      currentFileId: null,
      theme: 'light',
      fontSize: 16,
      codeTheme: 'github',
      bookmarks: [],
      recentFiles: [],

      currentDirPath: '',
      rightPane: 'folder',
      sidebarOpen: true,
      drawerOpen: false,

      browserView: 'list',
      sortKey: 'name',
      sortAsc: true,

      selectionMode: false,
      selectedFileIds: [],
      selectedDirPaths: [],

      // 全屏阅读状态：readerFullscreen 是本次会话的瞬时状态，autoFullscreenOnOpen 是持久化偏好
      readerFullscreen: false,
      autoFullscreenOnOpen: true,

      /**
       * 添加或更新文件。
       * 注意：不再顺带把 currentFileId 指向它 —— 否则后台回填内容（updateFileContent 的旧实现）
       * 会在分屏场景下把用户正在读的文件切走。
       */
      addFile: (file: FileItem) => {
        set((state) => {
          const existingIndex = state.files.findIndex((f) => f.id === file.id);
          const files =
            existingIndex >= 0
              ? state.files.map((f, i) => (i === existingIndex ? file : f))
              : [file, ...state.files];
          const recentFiles = [file.id, ...state.recentFiles.filter((id) => id !== file.id)].slice(0, 20);
          return { files, recentFiles };
        });
      },

      addFiles: (newFiles: FileItem[]) => {
        if (newFiles.length === 0) return;
        set((state) => {
          // 用 Map 去重：新文件覆盖旧文件
          const fileMap = new Map<string, FileItem>();
          for (const f of state.files) fileMap.set(f.id, f);
          for (const f of newFiles) fileMap.set(f.id, f);
          const files = Array.from(fileMap.values());

          const newIds = new Set(newFiles.map((f) => f.id));
          const recentFiles = [
            ...newFiles.map((f) => f.id),
            ...state.recentFiles.filter((id) => !newIds.has(id)),
          ].slice(0, 20);

          return { files, recentFiles };
        });
      },

      /**
       * 导入整个目录：文件、显式目录、挂载点一次性合并。
       *
       * 与 addFiles 的区别：
       * - 目录是显式记录（空目录也能进树，不再只靠 file.directory 反推）；
       * - 挂载点保存 treeUri，供「重新扫描 / 重新授权」使用；
       * - 不动 recentFiles —— 导入顺序不是「最近打开」，一次性写入几百条会把列表冲掉。
       */
      addImport: (payload) => {
        const { files: newFiles, directories: newDirs, mount, replaceRoot } = payload;
        if (newFiles.length === 0 && newDirs.length === 0) return;

        set((state) => {
          const root = normalizePath(mount.rootPath);
          const insideRoot = (path?: string): boolean => {
            const target = normalizePath(path);
            if (!root) return true;
            return target === root || target.startsWith(`${root}/`);
          };

          // 重新扫描同一挂载点：先把属于这个根的旧条目摘掉（含已从磁盘删除的文件/目录）
          const baseFiles = replaceRoot
            ? state.files.filter((file) => !insideRoot(file.directory))
            : state.files;
          const baseDirs = replaceRoot
            ? state.directories.filter((dir) => !insideRoot(dir.path))
            : state.directories;

          const fileMap = new Map<string, FileItem>();
          for (const f of baseFiles) fileMap.set(f.id, f);
          for (const f of newFiles) fileMap.set(f.id, f);

          const dirMap = new Map<string, DirectoryItem>();
          for (const d of baseDirs) dirMap.set(d.path, d);
          for (const d of newDirs) dirMap.set(d.path, d);

          const mountMap = new Map<string, Mount>();
          for (const m of state.mounts) mountMap.set(m.id, m);
          // 重新授权成功后自动清掉失效标记
          mountMap.set(mount.id, { ...mount, invalid: false });

          const files = Array.from(fileMap.values());
          const aliveIds = new Set(files.map((f) => f.id));
          const currentDropped =
            state.currentFileId != null && !aliveIds.has(state.currentFileId);

          return {
            files,
            directories: Array.from(dirMap.values()),
            mounts: Array.from(mountMap.values()),
            // 被清掉的条目不能只从 files 里消失，否则书签/最近里会留下点不开的悬空 id
            bookmarks: state.bookmarks.filter((id) => aliveIds.has(id)),
            recentFiles: state.recentFiles.filter((id) => aliveIds.has(id)),
            currentFileId: currentDropped ? null : state.currentFileId,
            rightPane: currentDropped ? 'folder' : state.rightPane,
          };
        });
      },

      updateFileContent: (fileId: string, content: string) => {
        set((state) => {
          // 只保留最近打开的几个文件的正文，其余回空（下次打开再从 uri 读）
          const keep = new Set<string>([fileId, ...state.recentFiles.slice(0, CONTENT_CACHE_SIZE)]);
          return {
            files: state.files.map((f) => {
              if (f.id === fileId) return { ...f, content };
              if (f.content && !keep.has(f.id)) return { ...f, content: '' };
              return f;
            }),
          };
        });
      },

      removeFile: (fileId: string) => {
        set((state) => ({
          files: state.files.filter((f) => f.id !== fileId),
          bookmarks: state.bookmarks.filter((id) => id !== fileId),
          recentFiles: state.recentFiles.filter((id) => id !== fileId),
          currentFileId: state.currentFileId === fileId ? null : state.currentFileId,
          // 正在读的文件被删掉时，右栏退回目录内容，避免停在"文件不存在"
          rightPane: state.currentFileId === fileId ? 'folder' : state.rightPane,
          readerFullscreen: state.currentFileId === fileId ? false : state.readerFullscreen,
        }));
      },

      setCurrentFile: (fileId: string | null) => {
        set((state) => {
          if (fileId) {
            const recentFiles = [fileId, ...state.recentFiles.filter((id) => id !== fileId)].slice(0, 20);
            return { currentFileId: fileId, recentFiles };
          }
          return { currentFileId: null };
        });
      },

      toggleTheme: () => {
        set((state) => ({
          theme: state.theme === 'light' ? 'dark' : 'light',
        }));
      },

      setFontSize: (size: number) => {
        set({ fontSize: Math.max(12, Math.min(28, size)) });
      },

      setCodeTheme: (theme) => {
        set({ codeTheme: theme });
      },

      toggleBookmark: (fileId: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.includes(fileId)
            ? state.bookmarks.filter((id) => id !== fileId)
            : [...state.bookmarks, fileId],
        }));
      },

      /**
       * 导航到某个目录：右栏回到目录内容，目录本身不清空当前选中文件（树里仍高亮）。
       * collapseSidebar 只在窄屏传 true —— 关的是抽屉，不动宽屏侧栏偏好。
       */
      navigateToDir: (path, options) => {
        set({
          currentDirPath: normalizePath(path),
          rightPane: 'folder',
          ...(options?.collapseSidebar ? { drawerOpen: false } : null),
        });
      },

      /** 打开文件：右栏切到阅读器，同时把浏览位置同步到文件所在目录，返回时面包屑才不会错 */
      openFile: (fileId: string) => {
        const file = get().files.find((f) => f.id === fileId);
        set((state) => ({
          currentFileId: fileId,
          currentDirPath: file ? getFileDirectory(file) : state.currentDirPath,
          rightPane: 'reader',
          // 打开即全屏：初值取用户偏好；用户全屏中又点了别的文件时保持全屏，不要突然弹回带头的界面
          readerFullscreen: state.readerFullscreen || state.autoFullscreenOnOpen,
          recentFiles: [fileId, ...state.recentFiles.filter((id) => id !== fileId)].slice(0, 20),
        }));
      },

      /** 退出阅读：保留 currentFileId，只把右栏切回目录内容 */
      closeReader: () => {
        set({ rightPane: 'folder', readerFullscreen: false });
      },

      setReaderFullscreen: (fullscreen: boolean) => {
        set({ readerFullscreen: fullscreen });
      },

      toggleReaderFullscreen: () => {
        set((state) => ({ readerFullscreen: !state.readerFullscreen }));
      },

      setAutoFullscreenOnOpen: (enabled: boolean) => {
        set({ autoFullscreenOnOpen: enabled });
      },

      setSidebarOpen: (open: boolean) => {
        set({ sidebarOpen: open });
      },

      setDrawerOpen: (open: boolean) => {
        set({ drawerOpen: open });
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarOpen: !state.sidebarOpen }));
      },

      setBrowserView: (view: BrowserView) => {
        set({ browserView: view });
      },

      /** 点同一个排序键翻转方向，点新键回到默认升序（名称/时间/大小的自然顺序） */
      setSortKey: (key: SortKey) => {
        set((state) =>
          state.sortKey === key
            ? { sortAsc: !state.sortAsc }
            : { sortKey: key, sortAsc: true }
        );
      },

      /** 长按进入选择模式，并选中长按的那一项（设计稿 §7.1） */
      enterSelectionMode: (firstId, kind = 'file') => {
        set({
          selectionMode: true,
          selectedFileIds: firstId && kind === 'file' ? [firstId] : [],
          selectedDirPaths: firstId && kind === 'dir' ? [firstId] : [],
        });
      },

      toggleSelected: (id, kind) => {
        set((state) => {
          if (kind === 'file') {
            const has = state.selectedFileIds.includes(id);
            return {
              selectedFileIds: has
                ? state.selectedFileIds.filter((x) => x !== id)
                : [...state.selectedFileIds, id],
            };
          }
          const has = state.selectedDirPaths.includes(id);
          return {
            selectedDirPaths: has
              ? state.selectedDirPaths.filter((x) => x !== id)
              : [...state.selectedDirPaths, id],
          };
        });
      },

      exitSelectionMode: () => {
        set({ selectionMode: false, selectedFileIds: [], selectedDirPaths: [] });
      },

      moveFiles: (fileIds, targetDir) => {
        const dir = normalizePath(targetDir);
        const ids = new Set(fileIds);
        set((state) => ({
          files: state.files.map((f) => (ids.has(f.id) ? { ...f, directory: dir } : f)),
        }));
      },

      /**
       * 批量删除：
       * - 文件按 id 直接移除（同步清理书签/最近/当前阅读）；
       * - 目录按路径移除，其下所有层级的文件一并出索引（目录记录本身也要清，否则留下"幽灵空目录"）。
       */
      deleteNodes: ({ fileIds, dirPaths }) => {
        const ids = new Set(fileIds);
        const roots = dirPaths.map(normalizePath).filter(Boolean);
        set((state) => {
          const files = state.files.filter(
            (f) =>
              !ids.has(f.id) &&
              !roots.some((root) => isPathInside(normalizePath(f.directory), root))
          );
          // 旧实现用 files.includes(f) 逐条比对，2 万文件时是 4 亿次比较；改成 id 集合
          const aliveIds = new Set(files.map((f) => f.id));
          const removedIds = new Set(
            state.files.filter((f) => !aliveIds.has(f.id)).map((f) => f.id)
          );
          const directories = state.directories.filter(
            (d) => !roots.some((root) => isPathInside(normalizePath(d.path), root))
          );
          const currentRemoved = state.currentFileId != null && removedIds.has(state.currentFileId);

          // 删掉的正是当前所在目录时，右栏会停在一个不存在的路径上（列表空、面包屑还在）。
          // 退到最近一个没被删的祖先目录，最终兜底到根。
          let currentDirPath = state.currentDirPath;
          if (roots.some((root) => isPathInside(currentDirPath, root))) {
            const outermost = roots
              .filter((root) => isPathInside(currentDirPath, root))
              .sort((a, b) => a.length - b.length)[0];
            let candidate = getParentPath(outermost ?? '');
            while (candidate && roots.some((root) => isPathInside(candidate, root))) {
              candidate = getParentPath(candidate);
            }
            currentDirPath = candidate;
          }

          return {
            files,
            directories,
            currentDirPath,
            bookmarks: state.bookmarks.filter((id) => !removedIds.has(id)),
            recentFiles: state.recentFiles.filter((id) => !removedIds.has(id)),
            currentFileId: currentRemoved ? null : state.currentFileId,
            rightPane: currentRemoved ? 'folder' : state.rightPane,
            readerFullscreen: currentRemoved ? false : state.readerFullscreen,
          };
        });
      },

      setMountInvalid: (mountId, invalid) => {
        set((state) => ({
          mounts: state.mounts.map((m) => (m.id === mountId ? { ...m, invalid } : m)),
        }));
      },
    }),
    {
      name: 'lzx-reader-storage',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      /**
       * 只持久化"偏好 + 小体积元数据"。
       *
       * 文件索引在原生平台落在 `documentDirectory/library/index.json`（utils/indexStorage）：
       * AsyncStorage 底层 SQLite 单条超过约 2MB 就读取失败，2 万文件 ≈ 8.2MB 一定撞上，
       * 而且失败是静默的。web 没有文件系统，仍随 AsyncStorage 走（有 MAX_WEB_FILES=2000 兜底）。
       */
      partialize: (state) => {
        const preferences = {
          theme: state.theme,
          fontSize: state.fontSize,
          codeTheme: state.codeTheme,
          bookmarks: state.bookmarks,
          recentFiles: state.recentFiles,
          currentDirPath: state.currentDirPath,
          sidebarOpen: state.sidebarOpen,
          // 显式目录与挂载点都是小体积元数据，必须持久化，否则重启后空目录与授权 uri 就丢了
          directories: state.directories,
          mounts: state.mounts,
          // 视图偏好跟着走；选择模式是瞬态，故意不持久化
          browserView: state.browserView,
          sortKey: state.sortKey,
          sortAsc: state.sortAsc,
          // 阅读偏好：打开文件是否自动全屏
          autoFullscreenOnOpen: state.autoFullscreenOnOpen,
          // rightPane / readerFullscreen 故意不持久化：重启后应停在目录列表，
          // 而不是内容还没回填的空白阅读器（全屏态同理，需要一个可退出的入口）
        };
        if (Platform.OS === 'web') return { ...preferences, files: state.files };
        return preferences;
      },
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<ReaderState>;

        if (version < 2) {
          state.currentDirPath = '';
          state.sidebarOpen = true;
          state.drawerOpen = false;
          state.rightPane = 'folder';
          // 老版本单文件导入会推导出 "library" / "<UUID>/Documents/library" 这类假目录，
          // 在文件浏览器里会直接变成一个莫名的顶层目录，这里一次性清回根目录。
          state.files = state.files?.map((file) =>
            LEGACY_FAKE_DIR.test(normalizePath(file.directory)) ? { ...file, directory: '' } : file
          );
        }

        if (version < 3) {
          // v3 之前没有"显式目录"和"挂载点"：老数据只有 files，
          // 树仍然能靠 directory 路径段反推出来（只是空目录缺失），所以补空数组即可，
          // 不需要给老文件伪造挂载点。
          state.directories = state.directories ?? [];
          state.mounts = state.mounts ?? [];
        }

        // v4：files 不再存 AsyncStorage，改落 library/index.json。
        // 这里故意保留老数据里的 files —— store/fileIndexSync 会在水合后把它搬到磁盘，搬完才不再写回。

        return state as ReaderState;
      },
    }
  )
);
