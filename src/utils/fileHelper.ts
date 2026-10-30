import type { FileType } from '../types';
import type { DirectoryItem, FileItem, TreeNode } from '../types';
import { normalizePath } from './fileTree.ts';

// 文件扩展名到文件类型的映射
const EXTENSION_MAP: Record<string, FileType> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.mdown': 'markdown',
  '.mkd': 'markdown',
  '.txt': 'text',
  '.text': 'text',
  '.log': 'text',
  '.js': 'code',
  '.jsx': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.py': 'code',
  '.go': 'code',
  '.java': 'code',
  '.c': 'code',
  '.cpp': 'code',
  '.cc': 'code',
  '.h': 'code',
  '.hpp': 'code',
  '.cs': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.swift': 'code',
  '.kt': 'code',
  '.rs': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
  '.sql': 'code',
  '.html': 'code',
  '.css': 'code',
  '.scss': 'code',
  '.less': 'code',
  '.json': 'code',
  '.xml': 'code',
  '.yaml': 'code',
  '.yml': 'code',
  '.toml': 'code',
  '.ini': 'code',
  '.conf': 'code',
  '.dart': 'code',
  '.lua': 'code',
  '.r': 'code',
  '.scala': 'code',
  '.clj': 'code',
  '.ex': 'code',
  '.exs': 'code',
  '.erl': 'code',
  '.vim': 'code',
  '.dockerfile': 'code',
  // 办公文档：二进制，打开时按需转换（见 utils/office）
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xls': 'xlsx',
  '.pdf': 'pdf',
};

// 文件扩展名到highlight.js语言名称的映射
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.rs': 'rust',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.sql': 'sql',
  '.html': 'xml',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.conf': 'ini',
  '.dart': 'dart',
  '.lua': 'lua',
  '.r': 'r',
  '.scala': 'scala',
  '.clj': 'clojure',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.vim': 'vim',
  '.md': 'markdown',
  '.markdown': 'markdown',
};

// 根据文件名获取文件类型
export function getFileType(fileName: string): FileType {
  const ext = getExtension(fileName);
  return EXTENSION_MAP[ext] ?? 'text';
}

// 根据文件名获取代码语言
export function getLanguage(fileName: string): string {
  const ext = getExtension(fileName);
  return EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';
}

// 获取文件扩展名（小写）
export function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0) return '';
  return fileName.substring(dotIndex).toLowerCase();
}

// 格式化文件大小
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 格式化日期
export function formatDate(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  if (year === now.getFullYear()) {
    return `${month}-${day} ${hh}:${mm}`;
  }
  return `${year}-${month}-${day}`;
}

// 最大文件大小（10MB）：文本文件的上限，超过这个体积的纯文本在手机上排版也会卡死
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 二进制文档（docx / xlsx / pdf）的上限。
 * 不能和文本用同一个阈值：一个 8MB 的 docx 里往往是几十张图片，转成正文后体积远小于原文件；
 * 而文本的 10MB 上限是为了避免一次排版几十万行。
 */
export const MAX_BINARY_FILE_SIZE = 30 * 1024 * 1024;

/** 是否是需要走二进制读取 + 解析的办公文档 */
export function isBinaryDocument(fileName: string): boolean {
  const type = getFileType(fileName);
  return type === 'docx' || type === 'xlsx' || type === 'pdf';
}

/**
 * 检查文件大小是否超过限制（按类型取不同阈值）。
 * 传 fileName 才能判断办公文档；不传时按文本阈值处理（老调用点的行为不变）。
 */
export function isFileTooLarge(size?: number, fileName?: string): boolean {
  if (!size) return false;
  const limit = fileName && isBinaryDocument(fileName) ? MAX_BINARY_FILE_SIZE : MAX_FILE_SIZE;
  return size > limit;
}

// 文件类型图标名称
export function getFileIconName(type: FileType): string {
  switch (type) {
    case 'markdown':
      return 'logo-markdown';
    case 'code':
      return 'code-slash';
    case 'docx':
      return 'document-text';
    case 'xlsx':
      return 'grid';
    case 'pdf':
      return 'document';
    case 'text':
    default:
      return 'document-text';
  }
}

// 文件类型图标颜色
export function getFileIconColor(type: FileType): string {
  switch (type) {
    case 'markdown':
      return '#6C56F0';
    case 'code':
      return '#00B4D8';
    case 'docx':
      // Word 蓝 / Excel 绿 / PDF 红：让树上能一眼区分，而不是三个灰色文档图标
      return '#2B579A';
    case 'xlsx':
      return '#217346';
    case 'pdf':
      return '#D93025';
    case 'text':
    default:
      return '#8E8E93';
  }
}

// 支持的文件扩展名集合
const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXTENSION_MAP));

/**
 * 判断文件是否为应用支持的类型（md/txt/code 等）。
 */
export function isSupportedFile(fileName: string): boolean {
  const ext = getExtension(fileName);
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * 已知但明确不支持的办公格式，给一句能照做的提示。
 *
 * 单文件选择器不按类型过滤，用户完全可能选中 .doc / .pptx。
 * 如果不拦，.doc 会按 text 类型打开，屏幕上就是一堆乱码 —— 比"直接说不支持"更糟。
 */
const UNSUPPORTED_OFFICE_HINT: Record<string, string> = {
  '.doc': '旧版 .doc 暂不支持，请在 Word 里"另存为 .docx"后再打开',
  '.ppt': '暂不支持 PowerPoint 文档（.ppt）',
  '.pptx': '暂不支持 PowerPoint 文档（.pptx）',
  '.pages': '暂不支持 Pages 文档，请先导出为 .docx 或 PDF',
};

export function getUnsupportedOfficeHint(fileName: string): string | null {
  return UNSUPPORTED_OFFICE_HINT[getExtension(fileName)] ?? null;
}

/**
 * 按 directory 字段 + 显式目录列表构建目录树。
 *
 * 两种目录来源都会消费：
 * - `directories`：导入时扫描到的真实目录，**空目录也能出现在树里**（旧实现的最大缺口）；
 * - `FileItem.directory`：兜底，兼容 v3 之前没有显式目录的老数据。
 *
 * @param files       文件数组
 * @param directories 显式目录（相对全局根的完整路径）
 * @returns           目录树根节点数组
 */
export function buildFileTree(files: FileItem[], directories: DirectoryItem[] = []): TreeNode[] {
  const rootChildren: TreeNode[] = [];
  // 用 Map 保存已创建的目录节点，key 为相对路径
  const dirNodeMap = new Map<string, TreeNode>();

  /**
   * 确保 dirPath 及其所有祖先节点存在，返回最深层目录的 children 数组。
   * 文件直接挂到这个数组里，省掉一次 findNode。
   */
  const ensureDirectory = (dirPath: string): TreeNode[] => {
    // normalizePath 会折叠双斜杠/前导斜杠：Android SAF 某些 provider 会给出
    // "dir//sub" 这类脏路径，若不归一，目录查找会和逐段拼接的路径对不上
    const segments = normalizePath(dirPath).split('/').filter((s) => s.length > 0);
    let currentPath = '';
    let parentChildren = rootChildren;

    for (const seg of segments) {
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;

      let node = dirNodeMap.get(currentPath);
      if (!node) {
        node = {
          name: seg,
          path: currentPath,
          isDirectory: true,
          children: [],
        };
        dirNodeMap.set(currentPath, node);
        parentChildren.push(node);
      }
      parentChildren = node.children;
    }

    return parentChildren;
  };

  // 先落显式目录：空目录、只含不支持文件的目录都能被表达出来
  for (const dir of directories) {
    ensureDirectory(dir.path);
  }

  for (const file of files) {
    const dir = normalizePath(file.directory);

    if (!dir) {
      // 无目录 → 顶层文件节点
      rootChildren.push({
        name: file.name,
        path: file.name,
        isDirectory: false,
        fileId: file.id,
        children: [],
      });
      continue;
    }

    const siblings = ensureDirectory(dir);
    siblings.push({
      name: file.name,
      path: `${dir}/${file.name}`,
      isDirectory: false,
      fileId: file.id,
      children: [],
    });
  }

  // 排序：目录在前，文件在后，各自按名称排序
  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    for (const n of nodes) {
      if (n.isDirectory) sortTree(n.children);
    }
  };
  sortTree(rootChildren);

  return rootChildren;
}

/**
 * 去掉文件节点，只留目录骨架。
 *
 * 侧栏树与「移动到…」都只需要目录：一个 5000 文件的库，目录节点通常只有几十到几百个，
 * 剔掉文件后侧栏的 flatten 规模下降一个数量级（设计稿 §6.2「树只显示目录」）。
 */
export function stripFiles(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .filter((node) => node.isDirectory)
    .map((node) => ({ ...node, fileId: undefined, children: stripFiles(node.children) }));
}
