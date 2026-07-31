// 文件类型
export type FileType = 'markdown' | 'text' | 'code';

// 主题类型
export type ThemeMode = 'light' | 'dark';

// 代码高亮主题
export type CodeTheme = 'github' | 'monokai' | 'vs' | 'androidstudio';

// 文件项接口
export interface FileItem {
  id: string;              // 文件唯一标识（URI）
  name: string;            // 文件名
  type: FileType;          // 文件类型
  content: string;         // 文件内容
  uri: string;             // 文件URI
  size?: number;           // 文件大小（字节）
  lastModified?: number;   // 最后修改时间戳
  addedAt: number;         // 添加到应用的时间戳
  directory?: string;      // 文件所在目录路径（用于显示）
}

// 渲染状态接口
export interface RenderState {
  isLoading: boolean;
  error: string | null;
  content: string;
  scrollPosition: number;
}

// 阅读器状态接口
export interface ReaderState {
  files: FileItem[];
  currentFileId: string | null;
  theme: ThemeMode;
  fontSize: number;
  codeTheme: CodeTheme;
  bookmarks: string[];
  recentFiles: string[];   // 最近打开的文件ID列表

  // Actions
  addFile: (file: FileItem) => void;
  removeFile: (fileId: string) => void;
  setCurrentFile: (fileId: string | null) => void;
  toggleTheme: () => void;
  setFontSize: (size: number) => void;
  setCodeTheme: (theme: CodeTheme) => void;
  toggleBookmark: (fileId: string) => void;
  isBookmarked: (fileId: string) => boolean;
  getCurrentFile: () => FileItem | null;
  clearAll: () => void;
}
