import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReaderState, FileItem, ThemeMode, CodeTheme } from '../types';

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

      addFile: (file: FileItem) => {
        set((state) => {
          // 检查是否已存在相同文件
          const existingIndex = state.files.findIndex((f) => f.id === file.id);
          let files: FileItem[];
          if (existingIndex >= 0) {
            // 更新已有文件
            files = state.files.map((f, i) => (i === existingIndex ? file : f));
          } else {
            files = [file, ...state.files];
          }
          // 更新最近文件列表
          const recentFiles = [file.id, ...state.recentFiles.filter((id) => id !== file.id)].slice(0, 20);
          return { files, currentFileId: file.id, recentFiles };
        });
      },

      addFiles: (newFiles: FileItem[]) => {
        if (newFiles.length === 0) return;
        set((state) => {
          // 用 Map 去重：新文件覆盖旧文件
          const fileMap = new Map<string, FileItem>();
          // 先放入已有文件
          for (const f of state.files) fileMap.set(f.id, f);
          // 再放入新文件（覆盖同 id 的）
          for (const f of newFiles) fileMap.set(f.id, f);
          const files = Array.from(fileMap.values());
          // 更新最近文件列表
          const newIds = newFiles.map((f) => f.id);
          const recentFiles = [
            ...newIds,
            ...state.recentFiles.filter((id) => !newIds.includes(id)),
          ].slice(0, 20);
          return {
            files,
            recentFiles,
            // 如果当前没有选中文件，选中第一个新文件
            currentFileId: state.currentFileId ?? newFiles[0].id,
          };
        });
      },

      removeFile: (fileId: string) => {
        set((state) => ({
          files: state.files.filter((f) => f.id !== fileId),
          bookmarks: state.bookmarks.filter((id) => id !== fileId),
          recentFiles: state.recentFiles.filter((id) => id !== fileId),
          currentFileId: state.currentFileId === fileId ? null : state.currentFileId,
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

      setCodeTheme: (theme: CodeTheme) => {
        set({ codeTheme: theme });
      },

      toggleBookmark: (fileId: string) => {
        set((state) => ({
          bookmarks: state.bookmarks.includes(fileId)
            ? state.bookmarks.filter((id) => id !== fileId)
            : [...state.bookmarks, fileId],
        }));
      },

      isBookmarked: (fileId: string) => {
        return get().bookmarks.includes(fileId);
      },

      getCurrentFile: () => {
        const state = get();
        return state.files.find((f) => f.id === state.currentFileId) ?? null;
      },

      clearAll: () => {
        set({ files: [], currentFileId: null, bookmarks: [], recentFiles: [] });
      },
    }),
    {
      name: 'lzx-reader-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // 只持久化必要的数据；原生平台不持久化 content（通过 uri 重新读取），web 平台保留 content（没有本地 uri 可重读）
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
        codeTheme: state.codeTheme,
        bookmarks: state.bookmarks,
        recentFiles: state.recentFiles,
        files: Platform.OS === 'web'
          ? state.files
          : state.files.map((f) => ({ ...f, content: '' })),
      }),
    }
  )
);
