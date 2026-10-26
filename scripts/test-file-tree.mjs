import { buildFileTree, stripFiles } from '../src/utils/fileHelper.ts';
import { isStructuralChange } from '../src/utils/indexDiff.ts';
import {
  countChildren,
  countFiles,
  findNode,
  getAncestors,
  getBaseName,
  getBreadcrumbs,
  getFileDirectory,
  getListing,
  getParentPath,
  isPathInside,
  normalizePath,
} from '../src/utils/fileTree.ts';

function file(id, name, directory) {
  return { id, name, type: 'markdown', content: '', uri: '', addedAt: 0, directory };
}

const files = [
  file('f1', 'README.md', ''),
  file('f2', 'intro.md', 'docs'),
  file('f3', 'api-list.md', 'docs/api'),
  file('f4', 'auth.md', 'docs/api'),
  file('f5', 'guide.md', 'docs/guide'),
  file('f6', 'deep.md', 'docs/guide/advanced'),
];

const tree = buildFileTree(files);

const cases = [
  {
    name: 'normalizePath 统一分隔符并去掉首尾斜杠',
    expect: () => normalizePath('\\docs\\api\\') === 'docs/api' && normalizePath('/a/b/') === 'a/b',
  },
  {
    name: 'normalizePath 空值安全',
    expect: () => normalizePath(undefined) === '' && normalizePath(null) === '' && normalizePath('') === '',
  },
  {
    name: 'getParentPath 逐级向上，根目录仍返回根',
    expect: () =>
      getParentPath('docs/api') === 'docs' &&
      getParentPath('docs') === '' &&
      getParentPath('') === '',
  },
  {
    name: 'getBaseName 取末段',
    expect: () => getBaseName('docs/api') === 'api' && getBaseName('docs') === 'docs',
  },
  {
    name: 'getAncestors 返回全部祖先目录（不含根）',
    expect: () => {
      const result = getAncestors('docs/api');
      return result.length === 2 && result[0] === 'docs' && result[1] === 'docs/api';
    },
  },
  {
    name: 'getAncestors 根目录没有祖先',
    expect: () => getAncestors('').length === 0,
  },
  {
    name: 'getBreadcrumbs 含根节点，可逐级回退',
    expect: () => {
      const crumbs = getBreadcrumbs('docs/api');
      return (
        crumbs.length === 3 &&
        crumbs[0].path === '' &&
        crumbs[0].name === '全部' &&
        crumbs[2].path === 'docs/api' &&
        crumbs[2].name === 'api'
      );
    },
  },
  {
    name: '根目录列表区分目录与文件',
    expect: () => {
      const listing = getListing(tree, '');
      return (
        listing.dirs.length === 1 &&
        listing.dirs[0].name === 'docs' &&
        listing.files.length === 1 &&
        listing.files[0].name === 'README.md'
      );
    },
  },
  {
    name: '子目录列表只返回直属子项',
    expect: () => {
      const listing = getListing(tree, 'docs');
      return (
        listing.dirs.length === 2 &&
        listing.files.length === 1 &&
        listing.files[0].name === 'intro.md'
      );
    },
  },
  {
    name: '深层目录列表正确',
    expect: () => {
      const listing = getListing(tree, 'docs/api');
      return listing.files.length === 2 && listing.dirs.length === 0;
    },
  },
  {
    name: '不存在的目录返回空列表而不是抛错',
    expect: () => {
      const listing = getListing(tree, 'nope/xyz');
      return listing.dirs.length === 0 && listing.files.length === 0;
    },
  },
  {
    name: 'findNode 能定位目录与文件',
    expect: () => {
      const dir = findNode(tree, 'docs/api');
      const leaf = findNode(tree, 'docs/api/auth.md');
      return dir?.isDirectory === true && leaf?.isDirectory === false && leaf.name === 'auth.md';
    },
  },
  {
    name: 'countFiles 递归统计目录下文件数',
    expect: () => {
      const docs = findNode(tree, 'docs');
      return docs ? countFiles(docs) === 5 && countFiles(findNode(tree, 'docs/api')) === 2 : false;
    },
  },
  {
    name: 'countChildren 只数直属子项',
    expect: () => {
      const docs = findNode(tree, 'docs');
      return docs ? countChildren(docs) === 3 : false;
    },
  },
  {
    name: '树排序：目录在前、文件在后',
    expect: () => {
      const listing = getListing(tree, 'docs');
      return listing.dirs.every((node) => node.isDirectory) && listing.files.every((n) => !n.isDirectory);
    },
  },
  {
    name: 'getFileDirectory 无 directory 视为根目录',
    expect: () =>
      getFileDirectory(file('x', 'a.md', '')) === '' &&
      getFileDirectory(file('y', 'b.md', 'docs/api')) === 'docs/api' &&
      getFileDirectory(null) === '',
  },
  {
    name: 'isPathInside 判断包含关系',
    expect: () =>
      isPathInside('docs/api', 'docs') === true &&
      isPathInside('docs', 'docs') === true &&
      isPathInside('docsx', 'docs') === false &&
      isPathInside('anything', '') === true,
  },

  // ===== 真机回归：Android SAF 目录导入产生的脏路径不能崩 =====
  // 崩溃现场：dirNodeMap.get(dir) 返回 undefined 后读 .children
  // （ErrorBoundary 捕获的 "Cannot read property 'children' of undefined"）
  {
    name: 'buildFileTree 容忍双斜杠目录（SAF 尾斜杠 rootName 的产物）',
    expect: () => {
      const t = buildFileTree([file('d1', 'a.md', 'test//sub')]);
      const node = findNode(t, 'test/sub');
      return !!node && node.isDirectory && node.children.length === 1;
    },
  },
  {
    name: 'buildFileTree 容忍前导斜杠目录',
    expect: () => {
      const t = buildFileTree([file('d2', 'b.md', '/test')]);
      return t.length === 1 && t[0].path === 'test' && t[0].children.length === 1;
    },
  },
  {
    name: 'buildFileTree 容忍尾斜杠与反斜杠目录',
    expect: () => {
      const t = buildFileTree([
        file('d3', 'c.md', 'test/'),
        file('d4', 'd.md', 'test\\nested'),
      ]);
      const sub = findNode(t, 'test/nested');
      const testNode = findNode(t, 'test');
      return !!sub && !!testNode && testNode.children.length === 2;
    },
  },
  {
    name: 'buildFileTree 归一后同目录不重复建节点',
    expect: () => {
      const t = buildFileTree([
        file('d5', 'e.md', 'test/sub'),
        file('d6', 'f.md', 'test//sub'),
        file('d7', 'g.md', '/test/sub/'),
      ]);
      const sub = findNode(t, 'test/sub');
      return !!sub && sub.children.length === 3;
    },
  },
  {
    name: 'normalizePath 折叠连续斜杠并去首尾',
    expect: () =>
      normalizePath('a//b///c/') === 'a/b/c' &&
      normalizePath('/a/b') === 'a/b' &&
      normalizePath('a\\b') === 'a/b' &&
      normalizePath('///') === '' &&
      normalizePath(undefined) === '' &&
      normalizePath(null) === '',
  },

  // ===== v3：显式目录（空目录也要出现在树里） =====
  {
    name: 'buildFileTree 收录没有任何文件的空目录',
    expect: () => {
      const t = buildFileTree([file('e1', 'a.md', 'docs')], [{ path: 'docs/empty' }]);
      const empty = findNode(t, 'docs/empty');
      const docs = findNode(t, 'docs');
      return !!empty && empty.isDirectory && empty.children.length === 0 && docs?.children.length === 2;
    },
  },
  {
    name: 'buildFileTree 空目录缺失的祖先链会自动补齐',
    expect: () => {
      const t = buildFileTree([], [{ path: 'root/a/b/c' }]);
      const leaf = findNode(t, 'root/a/b/c');
      return !!leaf && leaf.isDirectory && t.length === 1 && t[0].path === 'root';
    },
  },
  {
    name: 'buildFileTree 显式目录与文件目录重复时不产生重复节点',
    expect: () => {
      const t = buildFileTree([file('e2', 'x.md', 'docs/api')], [
        { path: 'docs' },
        { path: 'docs/api' },
      ]);
      const docs = findNode(t, 'docs');
      return !!docs && docs.children.length === 1 && docs.children[0].children.length === 1;
    },
  },
  {
    name: 'buildFileTree 显式目录里的脏路径同样被归一',
    expect: () => {
      const t = buildFileTree([], [{ path: '/docs//a/' }]);
      const node = findNode(t, 'docs/a');
      return !!node && node.isDirectory && t[0].path === 'docs';
    },
  },
  {
    name: 'buildFileTree 只有显式目录时根节点排序稳定（目录优先）',
    expect: () => {
      const t = buildFileTree([file('e3', 'z.md', '')], [{ path: 'b' }, { path: 'a' }]);
      return t.length === 3 && t[0].name === 'a' && t[1].name === 'b' && t[2].name === 'z.md';
    },
  },
  {
    name: 'stripFiles 剔掉所有文件节点，只留目录骨架',
    expect: () => {
      const stripped = stripFiles(tree);
      const walk = (nodes) => nodes.every((n) => n.isDirectory && n.fileId === undefined && walk(n.children));
      // 根级 README.md 被剔除，docs 保留
      return walk(stripped) && stripped.length === 1 && stripped[0].name === 'docs';
    },
  },
  {
    name: 'stripFiles 保留空目录（目录节点不依赖文件存在）',
    expect: () => {
      const stripped = stripFiles(buildFileTree([], [{ path: 'a/b/c' }]));
      return stripped.length === 1 && stripped[0].children[0]?.children[0]?.path === 'a/b/c';
    },
  },
  {
    name: 'isStructuralChange 只有正文变化时不重写索引',
    expect: () => {
      const before = [file('f1', 'a.md', 'docs'), file('f2', 'b.md', 'docs')];
      const after = [{ ...before[0], content: '# 正文' }, before[1]];
      return isStructuralChange(before, before) === false && isStructuralChange(before, after) === false;
    },
  },
  {
    name: 'isStructuralChange 增删/改名/换目录/换 uri 都算结构变化',
    expect: () => {
      const before = [file('f1', 'a.md', 'docs')];
      return (
        isStructuralChange(before, []) === true &&
        isStructuralChange(before, [{ ...before[0], name: 'b.md' }]) === true &&
        isStructuralChange(before, [{ ...before[0], directory: 'other' }]) === true &&
        isStructuralChange(before, [{ ...before[0], uri: 'content://x' }]) === true &&
        isStructuralChange(before, [{ ...before[0], id: 'f2' }]) === true
      );
    },
  },
];

let failed = 0;
for (const testCase of cases) {
  let ok = false;
  try {
    ok = testCase.expect();
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
