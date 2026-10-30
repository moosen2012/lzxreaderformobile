/**
 * 文件类型。
 * - markdown / text / code：直接按文本读，原文渲染；
 * - docx / xlsx：二进制，打开时按需转换（docx→Markdown、xlsx→Markdown 表格），转换结果仍走 MarkdownRenderer；
 * - pdf：二进制且无法转成文本，交给原生 PDF 视图直接渲染 uri。
 */
export type FileType = 'markdown' | 'text' | 'code' | 'docx' | 'xlsx' | 'pdf';

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

// 目录树节点接口
export interface TreeNode {
  name: string;             // 文件/目录名
  path: string;             // 相对路径（如 "docs/api/readme.md"）
  isDirectory: boolean;
  fileId?: string;          // 文件节点引用 FileItem.id
  children: TreeNode[];     // 子节点（目录才有）
}

/**
 * 显式目录记录。
 *
 * 之前目录只靠 FileItem.directory 的路径段反推，导致空目录根本不存在于树里。
 * 导入时把扫描到的每个目录都记下来（哪怕里面没有可读文件），树里才能如实反映磁盘结构。
 */
export interface DirectoryItem {
  path: string;             // 相对全局根的完整路径，如 "docs/02-架构"
}

/** 挂载点：一次「导入目录」产生的根，持有 SAF 授权 uri 供刷新/重读使用 */
export interface Mount {
  id: string;
  name: string;             // 根目录名，同时作为路径首段
  rootPath: string;         // 与 name 相同，冗余一份便于将来改名不影响已有路径
  kind: 'saf' | 'internal' | 'web';
  treeUri: string | null;   // SAF 授权 uri；internal/web 为 null
  addedAt: number;
  truncated?: boolean;      // 本次导入触达上限
  /** 授权失效（列目录被系统拒绝）：树上要标出来，否则用户会一直点开失败 */
  invalid?: boolean;
}

/** 目录导入的统计结果，用于完成后的提示与「部分导入」标记 */
export interface ImportSummary {
  files: number;            // 收录文件数
  dirs: number;             // 收录目录数（含根）
  skipped: number;          // 类型不支持 / 体积超限而跳过
  truncated: boolean;       // 触达文件数上限
  maxDepthHit: boolean;     // 触达层级上限
  failedDirs: number;       // 列目录失败的目录数
  cancelled: boolean;       // 用户中途取消
}

// 渲染状态接口
export interface RenderState {
  isLoading: boolean;
  error: string | null;
  content: string;
  scrollPosition: number;
}

// 右侧面板形态：目录内容 / 文件内容
export type RightPane = 'folder' | 'reader';

// 目录内容视图形态：列表 / 网格
export type BrowserView = 'list' | 'grid';

// 列表排序键：名称 / 修改时间 / 大小
export type SortKey = 'name' | 'time' | 'size';

// 阅读器状态接口
export interface ReaderState {
  files: FileItem[];
  /** 显式目录（含空目录），与 files 的 directory 字段共同构建目录树 */
  directories: DirectoryItem[];
  /** 导入产生的挂载点，记录 SAF 授权 uri */
  mounts: Mount[];
  currentFileId: string | null;
  theme: ThemeMode;
  fontSize: number;
  codeTheme: CodeTheme;
  bookmarks: string[];
  recentFiles: string[];   // 最近打开的文件ID列表

  // 浏览位置（文件浏览器形态）
  currentDirPath: string;        // 当前目录，'' = 根目录
  rightPane: RightPane;          // 右栏显示"目录内容"还是"文件内容"
  sidebarOpen: boolean;          // 宽屏：左侧目录树是否展开（会持久化）
  drawerOpen: boolean;           // 窄屏：目录抽屉是否展开（默认关闭，不持久化）

  // 目录内容视图（持久化：用户偏好不应每次启动重置）
  browserView: BrowserView;      // 列表 / 网格
  sortKey: SortKey;              // 排序键
  sortAsc: boolean;              // 升降序（同名键再次点击时翻转）

  // 选择模式（不持久化）：长按进入，顶栏替换为批量操作栏
  selectionMode: boolean;
  selectedFileIds: string[];     // 批量移动/删除/收藏的文件
  selectedDirPaths: string[];    // 批量删除的目录（目录暂不支持跨目录移动：路径是虚拟的）

  /**
   * 本次阅读是否全屏（不持久化）：全屏时隐藏应用头 / 侧栏 / 列表 / 阅读器标题栏，
   * 正文独占整屏。打开文件时由 autoFullscreenOnOpen 决定初值。
   */
  readerFullscreen: boolean;
  /** 打开文件时是否自动进入全屏（持久化偏好，设置面板可关） */
  autoFullscreenOnOpen: boolean;

  // Actions
  addFile: (file: FileItem) => void;
  addFiles: (files: FileItem[]) => void;  // 批量添加文件
  /** 导入整个目录：文件 + 显式目录 + 挂载点一次性合并进 store */
  addImport: (payload: {
    files: FileItem[];
    directories: DirectoryItem[];
    mount: Mount;
    /**
     * 同一挂载点重新扫描时为 true：先把旧索引里属于该根的条目摘掉再合并，
     * 否则磁盘上已删除的文件会永远留在列表里（点开才报"文件可能已被移动或删除"）。
     * 扫描被截断 / 用户中途取消时应传 false，避免把没扫到的条目误删。
     */
    replaceRoot?: boolean;
  }) => void;
  updateFileContent: (fileId: string, content: string) => void;  // 回填内容（不改当前选中）
  removeFile: (fileId: string) => void;
  setCurrentFile: (fileId: string | null) => void;
  toggleTheme: () => void;
  setFontSize: (size: number) => void;
  setCodeTheme: (theme: CodeTheme) => void;
  toggleBookmark: (fileId: string) => void;

  // 浏览导航
  navigateToDir: (path: string, options?: { collapseSidebar?: boolean }) => void;
  openFile: (fileId: string) => void;
  closeReader: () => void;
  setSidebarOpen: (open: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // 视图 / 排序
  setBrowserView: (view: BrowserView) => void;
  setSortKey: (key: SortKey) => void;   // 点同一个键翻转方向，点新键默认升序

  // 选择模式 + 批量操作
  enterSelectionMode: (firstId?: string, kind?: 'file' | 'dir') => void;
  toggleSelected: (id: string, kind: 'file' | 'dir') => void;
  exitSelectionMode: () => void;
  /** 批量移动文件到目标目录（目录不支持移动，调用方过滤） */
  moveFiles: (fileIds: string[], targetDir: string) => void;
  /** 批量删除：文件按 id，目录按路径（其下所有文件一并移除索引） */
  deleteNodes: (payload: { fileIds: string[]; dirPaths: string[] }) => void;
  /** 标记某个挂载点的授权是否失效（树上显示 ⚠，重新授权后清掉） */
  setMountInvalid: (mountId: string, invalid: boolean) => void;

  // 全屏阅读
  setReaderFullscreen: (fullscreen: boolean) => void;
  toggleReaderFullscreen: () => void;
  setAutoFullscreenOnOpen: (enabled: boolean) => void;
}

// 目录导入进度回调
export type ImportProgressCallback = (progress: {
  dirs: number;
  files: number;
  currentPath: string;
}) => void;

/**
 * 导入阶段。分段的唯一目的就是"别让用户盯着不确定的等待"：
 * 授权（系统选择器）/ 扫描（可能几十秒）/ 写索引（大批量时最容易被误判成卡死）。
 */
export type ImportPhase = 'picking' | 'scanning' | 'saving' | 'done';

export type ImportPhaseCallback = (phase: ImportPhase) => void;

/** 导入选项：三个回调都是可选的，调用方只关心自己需要的部分 */
export interface ImportDirectoryOptions {
  onProgress?: ImportProgressCallback;
  onPhase?: ImportPhaseCallback;
  /** 重新授权场景：预选回原来授权的目录（不保证系统接受，用户仍可改选） */
  initialUri?: string;
}

// 单文件选择结果
export interface PickFileResult {
  success: boolean;
  error?: string;
  file?: FileItem;
}

// 目录导入结果
export interface ImportDirectoryResult {
  success: boolean;
  error?: string;
  count?: number;
  rootName?: string;
  summary?: ImportSummary;
}
