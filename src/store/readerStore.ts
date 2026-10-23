import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReaderState, FileItem } from '../types';
import { getFileDirectory, normalizePath } from '../utils/fileTree';

/** 老版本按导入路径推导出来的假目录（library / Documents），迁移时统一清回根目录 */
const LEGACY_FAKE_DIR = /(^|\/)(library|Documents)(\/|$)/;

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      files: [],
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

      updateFileContent: (fileId: string, content: string) => {
        set((state) => ({
          files: state.files.map((f) => (f.id === fileId ? { ...f, content } : f)),
        }));
      },

      removeFile: (fileId: string) => {
        set((state) => ({
          files: state.files.filter((f) => f.id !== fileId),
          bookmarks: state.bookmarks.filter((id) => id !== fileId),
          recentFiles: state.recentFiles.filter((id) => id !== fileId),
          currentFileId: state.currentFileId === fileId ? null : state.currentFileId,
          // 正在读的文件被删掉时，右栏退回目录内容，避免停在"文件不存在"
          rightPane: state.currentFileId === fileId ? 'folder' : state.rightPane,
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
          recentFiles: [fileId, ...state.recentFiles.filter((id) => id !== fileId)].slice(0, 20),
        }));
      },

      /** 退出阅读：保留 currentFileId，只把右栏切回目录内容 */
      closeReader: () => {
        set({ rightPane: 'folder' });
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
    }),
    {
      name: 'lzx-reader-storage',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      // 只持久化必要的数据；原生平台不持久化 content（通过 uri 重新读取），web 平台保留 content（没有本地 uri 可重读）
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
        codeTheme: state.codeTheme,
        bookmarks: state.bookmarks,
        recentFiles: state.recentFiles,
        currentDirPath: state.currentDirPath,
        sidebarOpen: state.sidebarOpen,
        // rightPane 故意不持久化：重启后应停在目录列表，而不是内容还没回填的空白阅读器
        files:
          Platform.OS === 'web'
            ? state.files
            : state.files.map((f) => (f.content ? { ...f, content: '' } : f)),
      }),
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

        return state as ReaderState;
      },
    }
  )
);
