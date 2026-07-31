import type { FileType } from '../types';

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

// 最大文件大小（10MB）
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 检查文件大小是否超过限制
export function isFileTooLarge(size?: number): boolean {
  return !!size && size > MAX_FILE_SIZE;
}

// 文件类型图标名称
export function getFileIconName(type: FileType): string {
  switch (type) {
    case 'markdown':
      return 'logo-markdown';
    case 'code':
      return 'code-slash';
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
    case 'text':
    default:
      return '#8E8E93';
  }
}

/**
 * 从文件 URI 中提取目录路径（用于显示）。
 *
 * Android 缓存路径如: file:///data/user/0/com.lzx.reader/cache/DocumentPicker/xxx.md
 *   → 提取 "DocumentPicker" 作为简短显示
 *
 * content:// URI（Android SAF）无法提取有意义的目录，返回空。
 * Web 平台 uri 为空，返回空。
 *
 * @param uri  文件 URI
 * @param name 文件名（用于从路径末尾移除）
 * @returns    可读的目录路径片段，如 "DocumentPicker" 或 "Downloads/Docs"；不可用时返回空字符串
 */
export function extractDirectory(uri: string, name: string): string {
  if (!uri) return '';

  // content:// 开头的 URI 无法提取目录，直接返回空
  if (uri.startsWith('content://')) return '';

  // 处理 file:// 协议头
  let path = uri;
  if (path.startsWith('file://')) {
    path = path.substring(7);
  }

  // URL 解码（处理 %20 等编码字符）
  try {
    path = decodeURIComponent(path);
  } catch {
    // 解码失败则使用原始路径
  }

  // 统一路径分隔符为 /
  path = path.replace(/\\/g, '/');

  // 移除末尾的文件名
  if (name && path.endsWith(name)) {
    path = path.substring(0, path.length - name.length);
  } else {
    // 移除最后一个路径段（文件名）
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash >= 0) {
      path = path.substring(0, lastSlash);
    }
  }

  // 移除末尾多余的斜杠
  path = path.replace(/\/+$/, '');

  if (!path) return '';

  // 拆分为路径段
  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return '';

  // 过滤无意义的系统路径段
  const meaningless = new Set([
    'data', 'user', '0', 'com.lzx.reader', 'cache',
    'files', 'appdata', 'local', 'shared',
  ]);

  const meaningfulSegments = segments.filter((s, i) => {
    // 过滤无意义段
    if (meaningless.has(s.toLowerCase())) return false;
    // 过滤纯数字段（如 "0"）
    if (/^\d+$/.test(s)) return false;
    // 过滤像 "com.xxx.xxx" 的包名段
    if (/^com\.[a-z]+\.[a-z]+/i.test(s)) return false;
    return true;
  });

  if (meaningfulSegments.length === 0) {
    // 如果全部被过滤了，取最后 1-2 段作为兜底
    const fallback = segments.slice(-2).filter((s) => !/^\d+$/.test(s));
    return fallback.length > 0 ? fallback.join('/') : '';
  }

  // 最多取最后 3 级有意义目录，避免路径过长
  return meaningfulSegments.slice(-3).join('/');
}
