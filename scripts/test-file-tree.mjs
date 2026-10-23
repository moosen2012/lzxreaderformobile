import { buildFileTree } from '../src/utils/fileHelper.ts';
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
