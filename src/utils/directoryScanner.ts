/**
 * 目录树扫描引擎（纯逻辑，无 React / RN / expo 依赖，便于 Node 直接跑回归测试）。
 *
 * 背景：Android SAF 无法通过 expo-file-system 递归（见 services/saf 注释），
 * 所以扫描必须自己做：一个目录一次 listChildren，把子目录 documentId 入队。
 * 这里只负责"遍历 + 过滤 + 统计"，不碰文件内容和 UI。
 */

/** 一次 listChildren 返回的条目（来自原生模块或 Web 的模拟实现） */
export interface ScanEntry {
  name: string;
  isDirectory: boolean;
  /** 子目录继续列目录时要用；Web 端可缺省 */
  documentId?: string | null;
  /** 读取文件内容用的 uri；Web 端为空 */
  uri?: string;
  size?: number;
  mtime?: number;
}

export interface ScanFile {
  name: string;
  /** 相对全局根的完整路径，如 "docs/02-架构/README.md" */
  path: string;
  /** 所在目录，如 "docs/02-架构" */
  directory: string;
  uri: string;
  documentId?: string;
  size?: number;
  mtime?: number;
}

export interface ScanProgress {
  /** 已扫描目录数（含根） */
  dirs: number;
  /** 已发现的可导入文件数 */
  files: number;
  /** 当前正在扫描的目录，用于进度条文案 */
  currentPath: string;
}

export interface ScanStats {
  dirs: number;
  files: number;
  /** 因类型不支持 / 体积超限 / 读取失败被跳过的条目数 */
  skipped: number;
  /** 触达文件数上限，只导入了前 N 个 */
  truncated: boolean;
  /** 触达层级上限，过深的子树未展开 */
  maxDepthHit: boolean;
  /** 用户主动取消，结果为部分数据 */
  cancelled: boolean;
  /** 列目录失败的目录数（权限收回、provider 异常等） */
  failedDirs: number;
}

export interface ScanResult {
  rootName: string;
  files: ScanFile[];
  /** 所有目录的完整路径（含 rootName 自身），用于把空目录也画进树里 */
  directories: string[];
  stats: ScanStats;
}

export interface ScanOptions {
  /** 挂载点根目录名，会作为路径首段 */
  rootName: string;
  /** 列某个目录的子项；documentId 为 null 表示根目录 */
  listChildren: (documentId: string | null) => Promise<ScanEntry[]>;
  /** 是否收录该文件（类型白名单 + 体积上限） */
  acceptFile: (name: string, size?: number) => boolean;
  /** 文件数上限，默认 20000 */
  maxFiles?: number;
  /** 层级上限，默认 32（超过只记录目录，不再展开） */
  maxDepth?: number;
  /** 并发列目录数，默认 4 */
  concurrency?: number;
  /** 进度回调（已节流：每扫描若干个目录才回调一次） */
  onProgress?: (progress: ScanProgress) => void;
  /** 外部取消信号 */
  shouldCancel?: () => boolean;
}

interface Task {
  documentId: string | null;
  path: string;
  depth: number;
}

/**
 * 进度回调的最小间隔。
 *
 * 老实现是"每 4 个目录回调一次"：一棵只有十几个目录、但某个目录里塞了几千个文件的树，
 * 进度会长时间停在 0/0，看起来就跟没反应一样。改成时间节流后，
 * 每个目录结束时都会尝试回调（约 8 次/秒），计数是连续往上跳的。
 */
const PROGRESS_INTERVAL_MS = 120;
/** 单目录内文件极多时（如 720 个 md 同层），按这个步长也刷一次计数 */
const PROGRESS_EVERY_N_FILES = 40;

/**
 * 广度优先遍历目录树。
 *
 * 并发模型：若干个 worker 共享一个队列；队列空但仍有在飞的请求时要继续等，
 * 否则会在子目录入队前提前退出（这是这类遍历最常见的 off-by-one 坑）。
 */
export async function scanDirectoryTree(options: ScanOptions): Promise<ScanResult> {
  const {
    rootName,
    listChildren,
    acceptFile,
    maxFiles = 20000,
    maxDepth = 32,
    concurrency = 4,
    onProgress,
    shouldCancel,
  } = options;

  const files: ScanFile[] = [];
  const directories: string[] = [rootName];
  const stats: ScanStats = {
    dirs: 1,
    files: 0,
    skipped: 0,
    truncated: false,
    maxDepthHit: false,
    cancelled: false,
    failedDirs: 0,
  };

  const queue: Task[] = [{ documentId: null, path: rootName, depth: 0 }];
  let inFlight = 0;
  let lastEmitAt = 0;

  const stopped = (): boolean => {
    if (shouldCancel?.()) {
      stats.cancelled = true;
      return true;
    }
    return stats.truncated;
  };

  /** force=true 用于收尾，保证调用方一定能拿到最终计数 */
  const emitProgress = (currentPath: string, force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastEmitAt < PROGRESS_INTERVAL_MS) return;
    lastEmitAt = now;
    onProgress({ dirs: stats.dirs, files: stats.files, currentPath });
  };

  const runTask = async (task: Task): Promise<void> => {
    let entries: ScanEntry[];
    try {
      entries = await listChildren(task.documentId);
    } catch {
      // 单个目录失败（权限被收回 / provider 异常）不应该中断整棵树
      stats.failedDirs += 1;
      return;
    }

    for (const entry of entries) {
      if (stopped()) return;

      const childPath = `${task.path}/${entry.name}`;

      if (entry.isDirectory) {
        directories.push(childPath);
        stats.dirs += 1;
        if (task.depth + 1 > maxDepth) {
          stats.maxDepthHit = true;
          continue;
        }
        // 没有 documentId 的目录无法继续下钻；若拿 null 入队，原生侧会把它当成"根目录"，
        // 结果是把整棵树重复扫一遍 —— 宁可少一层，也不能无限循环
        if (!entry.documentId) {
          stats.failedDirs += 1;
          continue;
        }
        queue.push({ documentId: entry.documentId, path: childPath, depth: task.depth + 1 });
        continue;
      }

      if (!acceptFile(entry.name, entry.size)) {
        stats.skipped += 1;
        continue;
      }
      if (files.length >= maxFiles) {
        // 超过上限就整体停止：继续扫只是白跑，用户看到的仍是"前 N 个"
        stats.truncated = true;
        return;
      }

      files.push({
        name: entry.name,
        path: childPath,
        directory: task.path,
        uri: entry.uri ?? '',
        documentId: entry.documentId ?? undefined,
        size: entry.size,
        mtime: entry.mtime,
      });
      stats.files += 1;
      // 同一层里文件很多时也要让计数动起来，不然只有等目录结束才有反馈
      if (stats.files % PROGRESS_EVERY_N_FILES === 0) {
        emitProgress(task.path);
      }
    }
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      if (stopped()) return;

      const task = queue.shift();
      if (!task) {
        if (inFlight === 0) return; // 队列空且无在飞请求 → 真正结束
        await new Promise((resolve) => setTimeout(resolve, 8));
        continue;
      }

      inFlight += 1;
      try {
        await runTask(task);
      } finally {
        inFlight -= 1;
      }

      // 节流在 emitProgress 内部做，这里每个目录结束都尝试一次
      emitProgress(task.path);
    }
  };

  // 先报一次 0 进度：系统选择器刚关掉、第一层还没列完时也有东西可显示
  emitProgress(rootName, true);

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, 8)) }, () => worker());
  await Promise.all(workers);

  emitProgress('', true);
  return { rootName, files, directories, stats };
}
