import { scanDirectoryTree } from '../src/utils/directoryScanner.ts';

/**
 * 目录扫描引擎回归测试。
 *
 * 这里用一棵假树模拟 Android SAF：
 * 每个目录一次 listChildren(documentId)，子目录靠 documentId 继续下钻
 * ——正是旧实现（getInfoAsync + SAF.readDirectoryAsync）做不到的部分。
 */

const TREE = {
  '': [
    { name: 'README.md', isDirectory: false, uri: 'u:README.md', size: 100 },
    { name: 'cover.png', isDirectory: false, uri: 'u:cover.png', size: 900 },
    { name: 'docs', isDirectory: true, documentId: 'docs' },
  ],
  docs: [
    { name: 'a.md', isDirectory: false, documentId: 'docs/a.md', uri: 'u:docs/a.md', size: 10 },
    { name: 'empty', isDirectory: true, documentId: 'docs/empty' },
    { name: 'sub', isDirectory: true, documentId: 'docs/sub' },
  ],
  'docs/empty': [],
  'docs/sub': [
    { name: 'b.md', isDirectory: false, documentId: 'docs/sub/b.md', uri: 'u:docs/sub/b.md', size: 20 },
    { name: 'deep', isDirectory: true, documentId: 'docs/sub/deep' },
  ],
  'docs/sub/deep': [
    { name: 'c.md', isDirectory: false, documentId: 'docs/sub/deep/c.md', uri: 'u:docs/sub/deep/c.md', size: 30 },
  ],
};

function makeLister(tree = TREE, onCall) {
  return async (documentId) => {
    onCall?.(documentId);
    const key = documentId ?? '';
    if (!(key in tree)) throw new Error(`no such dir: ${key}`);
    return tree[key];
  };
}

const acceptMd = (name, size) => name.endsWith('.md') && (size ?? 0) <= 1000;

const cases = [
  {
    name: '全深度扫描：跨三层子目录都能收进来',
    expect: async () => {
      const result = await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(),
        acceptFile: acceptMd,
      });
      const names = result.files.map((f) => f.name).sort();
      return (
        names.join(',') === 'README.md,a.md,b.md,c.md' &&
        result.stats.files === 4 &&
        result.files.every((f) => f.uri.startsWith('u:'))
      );
    },
  },
  {
    name: '目录路径包含挂载点根名，文件 directory 指向父目录',
    expect: async () => {
      const result = await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(),
        acceptFile: acceptMd,
      });
      const readme = result.files.find((f) => f.name === 'README.md');
      const deep = result.files.find((f) => f.name === 'c.md');
      return (
        readme?.directory === 'root' &&
        readme?.path === 'root/README.md' &&
        deep?.directory === 'root/docs/sub/deep' &&
        deep?.path === 'root/docs/sub/deep/c.md'
      );
    },
  },
  {
    name: '空目录也会出现在目录清单里（树的空节点来源）',
    expect: async () => {
      const result = await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(),
        acceptFile: acceptMd,
      });
      return (
        result.directories.includes('root/docs/empty') &&
        result.directories.includes('root/docs/sub/deep') &&
        result.stats.dirs === 5
      );
    },
  },
  {
    name: '不支持的类型计入 skipped，不进入文件清单',
    expect: async () => {
      const result = await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(),
        acceptFile: acceptMd,
      });
      return result.stats.skipped === 1 && !result.files.some((f) => f.name === 'cover.png');
    },
  },
  {
    name: 'maxDepth 生效：超深目录只记录目录、不再展开',
    expect: async () => {
      const result = await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(),
        acceptFile: acceptMd,
        maxDepth: 1,
      });
      const names = result.files.map((f) => f.name).sort();
      return (
        result.stats.maxDepthHit === true &&
        // docs/sub 已被记录（出现在树里），但它下面的 deep 从未被展开
        result.directories.includes('root/docs/sub') &&
        !result.directories.includes('root/docs/sub/deep') &&
        names.join(',') === 'README.md,a.md'
      );
    },
  },
  {
    name: 'maxFiles 生效：截断有标记，数量不超限',
    expect: async () => {
      const result = await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(),
        acceptFile: acceptMd,
        maxFiles: 2,
      });
      return result.stats.truncated === true && result.files.length === 2;
    },
  },
  {
    name: '取消后返回部分结果并标记 cancelled',
    expect: async () => {
      let calls = 0;
      const result = await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(),
        acceptFile: acceptMd,
        // 第一次检查放行，让根目录先被列出来；之后立刻取消
        shouldCancel: () => {
          calls += 1;
          return calls > 2;
        },
      });
      return result.stats.cancelled === true;
    },
  },
  {
    name: '单个目录列失败不中断整棵树',
    expect: async () => {
      const broken = { ...TREE };
      delete broken['docs/sub'];
      const result = await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(broken),
        acceptFile: acceptMd,
      });
      return (
        result.stats.failedDirs === 1 &&
        result.files.some((f) => f.name === 'a.md') &&
        result.directories.includes('root/docs/sub')
      );
    },
  },
  {
    name: '目录缺少 documentId 时不入队（否则原生侧会当根目录重扫）',
    expect: async () => {
      const broken = {
        '': [
          { name: 'a.md', isDirectory: false, uri: 'u:a.md', size: 1 },
          // provider 没返回 document_id 的目录
          { name: 'ghost', isDirectory: true },
        ],
      };
      const result = await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(broken),
        acceptFile: acceptMd,
      });
      return (
        result.directories.includes('root/ghost') &&
        result.stats.failedDirs === 1 &&
        result.stats.dirs === 2 &&
        result.files.length === 1
      );
    },
  },
  {
    name: '进度回调在扫描过程中被调用',
    expect: async () => {
      const seen = [];
      await scanDirectoryTree({
        rootName: 'root',
        listChildren: makeLister(),
        acceptFile: acceptMd,
        onProgress: (p) => seen.push(p),
      });
      return seen.length > 0 && seen[seen.length - 1].dirs === 5;
    },
  },
];

let failed = 0;
for (const testCase of cases) {
  let ok = false;
  try {
    ok = await testCase.expect();
  } catch (error) {
    console.log(`FAIL  ${testCase.name} (${error instanceof Error ? error.message : error})`);
    failed += 1;
    continue;
  }

  if (!ok) {
    failed += 1;
    console.log(`FAIL  ${testCase.name}`);
  } else {
    console.log(`PASS  ${testCase.name}`);
  }
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 个用例失败`);
process.exit(failed === 0 ? 0 : 1);
