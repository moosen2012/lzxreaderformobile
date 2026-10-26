import type { FileItem, TreeNode } from '../types';

/**
 * 目录树查询工具（纯函数，无 React 依赖，便于用 Node 直接跑回归测试）。
 *
 * 背景：`FileItem.directory` 只是一段相对路径字符串（如 "docs/api"），
 * 应用里并不存在真实目录句柄，所以这里的"目录"全部是虚拟节点，
 * 由 utils/fileHelper 的 buildFileTree 按路径段拼出来。
 */

/** 统一分隔符、折叠连续斜杠并去掉首尾斜杠，'/' 与 '\' 都接受 */
export function normalizePath(path: string | undefined | null): string {
  if (!path) return '';
  return String(path)
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/** 上级目录路径；根目录的上级仍是根目录 */
export function getParentPath(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '' : normalized.slice(0, index);
}

/** 路径末段名称；根目录返回空串 */
export function getBaseName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index < 0 ? normalized : normalized.slice(index + 1);
}

/** 所有祖先目录路径（不含根），用于"导航时自动展开" */
export function getAncestors(path: string): string[] {
  const normalized = normalizePath(path);
  if (!normalized) return [];
  const segments = normalized.split('/');
  const result: string[] = [];
  let current = '';
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    result.push(current);
  }
  return result;
}

export interface Breadcrumb {
  name: string;
  path: string;
}

/** 面包屑（含根节点）。根节点名称固定为"全部"。 */
export function getBreadcrumbs(path: string): Breadcrumb[] {
  const normalized = normalizePath(path);
  const result: Breadcrumb[] = [{ name: '全部', path: '' }];
  let current = '';
  for (const segment of normalized.split('/').filter(Boolean)) {
    current = current ? `${current}/${segment}` : segment;
    result.push({ name: segment, path: current });
  }
  return result;
}

/** 按路径查找节点；找不到返回 null */
export function findNode(tree: TreeNode[], path: string): TreeNode | null {
  const target = normalizePath(path);
  if (!target) return null;

  const walk = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (node.path === target) return node;
      if (node.isDirectory && node.children.length > 0) {
        const hit = walk(node.children);
        if (hit) return hit;
      }
    }
    return null;
  };

  return walk(tree);
}

export interface DirectoryListing {
  dirs: TreeNode[];
  files: TreeNode[];
}

/** 某个目录下的直接子项，目录与文件分开（树本身已按"目录在前"排好序） */
export function getListing(tree: TreeNode[], path: string): DirectoryListing {
  const normalized = normalizePath(path);

  if (!normalized) {
    return {
      dirs: tree.filter((node) => node.isDirectory),
      files: tree.filter((node) => !node.isDirectory),
    };
  }

  const node = findNode(tree, normalized);
  if (!node || !node.isDirectory) {
    return { dirs: [], files: [] };
  }

  return {
    dirs: node.children.filter((child) => child.isDirectory),
    files: node.children.filter((child) => !child.isDirectory),
  };
}

/** 目录下递归统计文件数量（侧栏/目录行右侧显示"12 项"用） */
export function countFiles(node: TreeNode): number {
  if (!node.isDirectory) return 1;
  return node.children.reduce((sum, child) => sum + countFiles(child), 0);
}

/** 目录直属子项数量（目录行显示"3 项"更贴近资源管理器习惯） */
export function countChildren(node: TreeNode): number {
  return node.isDirectory ? node.children.length : 0;
}

/** 文件所在目录；没有 directory 字段视为根目录 */
export function getFileDirectory(file: FileItem | null | undefined): string {
  return normalizePath(file?.directory);
}

/** 路径是否在某个目录之下（含自身） */
export function isPathInside(path: string, parent: string): boolean {
  const target = normalizePath(path);
  const base = normalizePath(parent);
  if (!base) return true;
  return target === base || target.startsWith(`${base}/`);
}
