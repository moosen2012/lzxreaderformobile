import { AppState } from 'react-native';
import { useReaderStore } from './readerStore';
import { isIndexStorageAvailable, readFileIndex, writeFileIndex } from '../utils/indexStorage';
import { isStructuralChange } from '../utils/indexDiff';

/**
 * 文件索引与磁盘（`library/index.json`）的同步。
 *
 * 时序上必须做两件事：
 * 1. **先等 persist 从 AsyncStorage 恢复完**再看盘 —— 否则 v3 老数据（files 还在 AsyncStorage 里）
 *    会被盘上的空索引覆盖，升级一次就丢全部文件；
 * 2. 水合完成前不许写盘 —— 否则启动瞬间的 `files: []` 会把刚读出来的索引清空。
 *
 * 写盘走防抖：导入 2 万个文件时 store 只 set 一次，但删除/移动会连续 set，没必要每次都写 8MB。
 */

const WRITE_DEBOUNCE_MS = 400;

let started = false;
let ready = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: ReturnType<typeof useReaderStore.getState>['files'] | null = null;

function flush(): void {
  if (!pending) return;
  const files = pending;
  pending = null;
  void writeFileIndex(files);
}

function schedule(files: ReturnType<typeof useReaderStore.getState>['files']): void {
  pending = files;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, WRITE_DEBOUNCE_MS);
}

/**
 * 只有"结构"变了才值得写盘（正文变化不算，见 utils/indexDiff）。
 */
function structuralChange(
  prev: ReturnType<typeof useReaderStore.getState>['files'],
  next: ReturnType<typeof useReaderStore.getState>['files']
): boolean {
  return isStructuralChange(prev, next);
}

/** 立即写盘（切后台 / 卸载前调用，避免防抖窗口内丢改动） */
export function flushFileIndexNow(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  flush();
}

/**
 * 立即写盘并等它写完。
 *
 * 导入一个大目录之后索引有数 MB，序列化 + 落盘本身就是几百毫秒的同步重活。
 * 走防抖的话这活会落在"导入完成浮层已经关掉"之后，用户看到的是莫名其妙的一卡；
 * 导入流程用它把写盘纳入"正在写入文件索引…"阶段。
 */
export function flushFileIndexNowAsync(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const files = pending;
  pending = null;
  if (!files) return Promise.resolve();
  return writeFileIndex(files).then(() => undefined);
}

function waitPersistHydration(): Promise<void> {
  if (useReaderStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useReaderStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

/**
 * 启动时调用一次：水合索引 → 接管后续变更。
 * web 平台返回 false（索引仍随 AsyncStorage 持久化，受 MAX_WEB_FILES 约束）。
 */
export async function startFileIndexSync(): Promise<boolean> {
  if (!isIndexStorageAvailable || started) return started;
  started = true;

  await waitPersistHydration();

  const fromDisk = await readFileIndex();
  if (fromDisk && fromDisk.length > 0) {
    useReaderStore.setState({ files: fromDisk });
  } else {
    // 从 v3 升级：AsyncStorage 里还有 files，搬一次到 index.json
    const legacy = useReaderStore.getState().files;
    if (legacy.length > 0) await writeFileIndex(legacy);
  }

  ready = true;

  useReaderStore.subscribe((state, prev) => {
    if (!ready) return;
    if (!structuralChange(prev.files, state.files)) return;
    schedule(state.files);
  });

  AppState.addEventListener('change', (status) => {
    if (status !== 'active') flushFileIndexNow();
  });

  return true;
}
