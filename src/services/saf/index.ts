import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { ScanEntry } from '../../utils/directoryScanner';

/**
 * SAF 目录列举服务。
 *
 * 为什么不直接用 expo-file-system：
 * - `getInfoAsync()` 对 content:// 条目恒返回 isDirectory:false（原生实现只对 file:// 判断目录）；
 * - `StorageAccessFramework.readDirectoryAsync(子目录uri)` 内部走 DocumentFile.fromTreeUri()，
 *   取的是 URI 里 `tree/` 那段（永远是授权根），拿子目录调用只会返回根目录内容（expo/expo#20102）。
 *
 * 所以列目录交给本地原生模块 modules/saf-tree（一次 query 一个目录，保留原始 treeUri）。
 * 读文件内容仍然用 FileSystem.readAsStringAsync —— 它对 content:// 走 openInputStream，是好的。
 */

interface NativeSafEntry {
  documentId: string;
  name: string;
  isDirectory: boolean;
  mimeType?: string;
  uri: string;
  size?: number;
  mtime?: number;
}

interface SafTreeNativeModule {
  listChildren(treeUri: string, documentId: string | null): Promise<NativeSafEntry[]>;
  /** 0.2.0 起提供；旧安装包没有这个函数，读取要回退到 expo */
  readAsString?: (uri: string) => Promise<string>;
  /** 0.3.0 起提供：docx / xlsx / pdf 等二进制文档用，返回 base64 */
  readAsBase64?: (uri: string) => Promise<string>;
}

const nativeModule: SafTreeNativeModule | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<SafTreeNativeModule>('SafTree') : null;

/** 当前安装包是否带上了原生列目录模块（旧包 / Expo Go / Web 均为 false） */
export const isSafTreeAvailable = nativeModule != null;

export const SAF_TREE_MISSING_MESSAGE =
  '当前安装包不支持全深度导入（缺少 saf-tree 原生模块）。请重新构建：npx expo run:android';

/** 生成某个 treeUri 的列目录函数，供 scanDirectoryTree 使用 */
export function createSafLister(treeUri: string): (documentId: string | null) => Promise<ScanEntry[]> {
  const module = nativeModule;
  if (!module) {
    throw new Error(SAF_TREE_MISSING_MESSAGE);
  }

  return async (documentId) => {
    const rows = await module.listChildren(treeUri, documentId);
    return rows.map((row) => ({
      name: row.name,
      isDirectory: row.isDirectory,
      documentId: row.documentId,
      uri: row.uri,
      size: row.size,
      mtime: row.mtime,
    }));
  };
}

/**
 * 单次读取的超时时间。
 *
 * ContentResolver 卡住（provider 已退出 / 云盘目录被系统挂起 / 授权半失效）时，
 * openInputStream 可能既不返回也不抛异常。没有超时的话调用方会永远停在"正在加载"，
 * 用户看到的就是一个永远转的圈 —— 宁可报错让用户重试或重新授权。
 */
const READ_TIMEOUT_MS = 20000;

export const READ_TIMEOUT_MESSAGE = '读取超时（文件可能过大、或目录授权已失效）';

/** 给 promise 套一个超时：超时后拒绝，原始 promise 的结果被忽略 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * 读取文件文本内容。
 *
 * content:// 走原生优先：expo 的 `isSAFUri` 只认 `com.android.externalstorage`，
 * 从 Google Drive / OneDrive / 部分 OEM 文件管理器导入的目录能扫出树，用 expo 读会直接抛
 * IOException；而且 expo 那条分支前面还要过一次 `filePermission` 判定，OEM provider 上
 * 实测容易走到异常路径甚至长时间不返回。原生模块用 ContentResolver 直读，链路最短。
 *
 * 原生不可用（旧安装包没有 readAsString）或失败时，退回 expo —— 也就是老行为。
 * 两条路径都带超时，保证调用方一定能拿到"成功 / 失败"的确定结果。
 */
export async function readTextFile(uri: string): Promise<string> {
  const module = nativeModule;
  const isContentUri = uri.startsWith('content://');

  if (Platform.OS === 'android' && isContentUri && module?.readAsString) {
    try {
      return await withTimeout(module.readAsString(uri), READ_TIMEOUT_MS, READ_TIMEOUT_MESSAGE);
    } catch (nativeError) {
      // 超时不再重试第二条路径：provider 已经卡住，再等 20s 只会让用户多等一倍
      if (nativeError instanceof Error && nativeError.message === READ_TIMEOUT_MESSAGE) {
        throw nativeError;
      }
      // 其它失败（provider 拒绝、旧模块签名不一致等）继续退回 expo
    }
  }

  return withTimeout(
    FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 }),
    READ_TIMEOUT_MS,
    READ_TIMEOUT_MESSAGE
  );
}

/**
 * 二进制文档的读取超时。
 *
 * docx / xlsx / pdf 常见几 MB 到几十 MB，比文本慢一个数量级；
 * 但仍必须有上限，理由和 `readTextFile` 一样：provider 卡住时不能永远转圈。
 */
const BINARY_READ_TIMEOUT_MS = 45000;

/**
 * 读取二进制文件，返回 base64（不是文本！）。
 *
 * 同样是原生优先：expo 的 `readAsStringAsync` 只认 `com.android.externalstorage`
 * 这类 authority，Drive / OneDrive 的 content:// 会直接 IOException。
 * Base64 是"能穿过 JS 边界的最小公共表示"，上层用 `utils/office/base64` 解成字节。
 */
export async function readBase64File(uri: string): Promise<string> {
  const module = nativeModule;
  const isContentUri = uri.startsWith('content://');

  if (Platform.OS === 'android' && isContentUri && module?.readAsBase64) {
    try {
      return await withTimeout(module.readAsBase64(uri), BINARY_READ_TIMEOUT_MS, READ_TIMEOUT_MESSAGE);
    } catch (nativeError) {
      if (nativeError instanceof Error && nativeError.message === READ_TIMEOUT_MESSAGE) {
        throw nativeError;
      }
      // 其余失败退回 expo：至少 file:// 与 externalstorage 这两类一定读得到
    }
  }

  return withTimeout(
    FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
    BINARY_READ_TIMEOUT_MS,
    READ_TIMEOUT_MESSAGE
  );
}
