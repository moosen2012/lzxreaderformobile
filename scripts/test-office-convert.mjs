/**
 * Office 文档转换回归测试（纯逻辑，不需要设备）：
 * 1. docx 的 HTML 片段能转成结构正确的 Markdown（标题 / 列表 / 表格 / 行内样式 / 链接 / 图片）
 * 2. base64 与字节数组的互转是自洽的（RN 里没有可靠的 atob / Buffer）
 * 3. 守卫：mammoth 只允许 docxEngine.ts 静态 import，xlsx 只允许 xlsxEngine.ts 静态 import
 *    —— 这两个包加起来 ≈2.7MB，一旦有人顺手 import 进普通组件，冷启动会被拖死，
 *    而这种退化在类型检查和线上表现里都看不出来，只能靠源码扫描卡住。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlToMarkdown, parseHtml } from '../src/utils/office/htmlToMarkdown.ts';
import { decodeEntities } from '../src/utils/htmlEntities.ts';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../src/utils/office/base64.ts';

let failed = 0;

function check(name, condition, detail = '') {
  if (!condition) {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

function checkEqual(name, actual, expected) {
  check(name, actual === expected, `\n  期望: ${JSON.stringify(expected)}\n  实际: ${JSON.stringify(actual)}`);
}

// ============ 1. HTML → Markdown ============
checkEqual(
  '标题：h1 转 #',
  htmlToMarkdown('<h1>安装说明</h1><p>正文第一段</p>'),
  '# 安装说明\n\n正文第一段'
);

checkEqual(
  '标题：h3 转 ###',
  htmlToMarkdown('<h3>小节</h3>'),
  '### 小节'
);

checkEqual(
  '行内样式：粗体 / 斜体 / 删除线 / 行内码',
  htmlToMarkdown('<p><strong>加粗</strong>与<em>斜体</em>还有<del>删除</del>和<code>x = 1</code></p>'),
  '**加粗**与*斜体*还有~~删除~~和`x = 1`'
);

checkEqual(
  '链接：保留 href',
  htmlToMarkdown('<p>见 <a href="https://example.com/a">文档</a></p>'),
  '见 [文档](https://example.com/a)'
);

checkEqual(
  '链接：页内锚点降级为纯文本',
  htmlToMarkdown('<p><a href="#bookmark-1">跳转</a></p>'),
  '跳转'
);

checkEqual(
  '实体：&amp; &lt; &nbsp; 与数字实体',
  htmlToMarkdown('<p>a &amp; b &lt; c &#65; &#x4E2D;</p>'),
  'a & b < c A 中'
);

checkEqual(
  '列表：无序',
  htmlToMarkdown('<ul><li>一</li><li>二</li></ul>'),
  '- 一\n- 二'
);

checkEqual(
  '列表：有序（尊重 start）',
  htmlToMarkdown('<ol start="3"><li>三</li><li>四</li></ol>'),
  '3. 三\n4. 四'
);

checkEqual(
  '列表：Word 的嵌套结构不能丢内容',
  htmlToMarkdown('<ul><li>父项<ul><li>子项 A</li><li>子项 B</li></ul></li><li>另一个父项</li></ul>'),
  '- 父项\n  - 子项 A\n  - 子项 B\n- 另一个父项'
);

checkEqual(
  '表格：首行为表头 + 分隔行',
  htmlToMarkdown(
    '<table><tr><th>名称</th><th>数量</th></tr><tr><td>甲</td><td>1</td></tr></table>'
  ),
  '| 名称 | 数量 |\n| --- | --- |\n| 甲 | 1 |'
);

checkEqual(
  '表格：单元格里的竖线要转义',
  htmlToMarkdown('<table><tr><th>a|b</th></tr><tr><td>c|d</td></tr></table>'),
  '| a\\|b |\n| --- |\n| c\\|d |'
);

checkEqual(
  '表格：列数不一致时补空单元格',
  htmlToMarkdown('<table><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></table>'),
  '| 1 | 2 |\n| --- | --- |\n| 3 |  |'
);

checkEqual(
  '引用块：每行加 > ',
  htmlToMarkdown('<blockquote><p>第一行</p><p>第二行</p></blockquote>'),
  '> 第一行\n>\n> 第二行'
);

checkEqual(
  '图片：小图保留 data URI',
  htmlToMarkdown('<p><img src="data:image/png;base64,AAAA" alt="图" /></p>'),
  '![图](data:image/png;base64,AAAA)'
);

check(
  '图片：超大 base64 被省略，避免正文撑爆内存',
  htmlToMarkdown(`<p><img src="data:image/png;base64,${'A'.repeat(400_001)}" /></p>`).includes('已省略')
);

checkEqual('空输入返回空串', htmlToMarkdown('   '), '');

checkEqual(
  '空段落不产生多余空行',
  htmlToMarkdown('<p>一</p><p></p><p></p><p>二</p>'),
  '一\n\n二'
);

check(
  '解析：未闭合的标签不会抛异常',
  (() => {
    const nodes = parseHtml('<p>没闭合<div>还在');
    return Array.isArray(nodes) && nodes.length > 0;
  })()
);

checkEqual(
  '解析：未知行内标签只保留文字',
  htmlToMarkdown('<p><span style="color:red">红字</span>与<sup>上标</sup></p>'),
  '红字与上标'
);

// ============ 2. base64 互转 ============
const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 65, 66, 67]);
const encoded = uint8ArrayToBase64(bytes);
checkEqual(
  'base64：编码结果与 Buffer 一致',
  encoded,
  Buffer.from(bytes).toString('base64')
);
checkEqual(
  'base64：解码能还原原始字节',
  Array.from(base64ToUint8Array(encoded)).join(','),
  Array.from(bytes).join(',')
);
checkEqual(
  'base64：容忍换行与 data URI 前缀',
  Array.from(base64ToUint8Array(`data:application/octet-stream;base64,${encoded.slice(0, 4)}\n${encoded.slice(4)}`)).join(','),
  Array.from(bytes).join(',')
);

// ============ 2.5 实体解码 ============
// marked 会把正文里的 & < > 重新转义成实体，而 react-native-marked 的 text() 不解码，
// 所以"a & b"会在屏幕上显示成"a &amp; b"。解码逻辑统一放在 utils/htmlEntities。
checkEqual('实体：命名实体还原', decodeEntities('a &amp; b &lt;tag&gt;'), 'a & b <tag>');
checkEqual('实体：引号与撇号', decodeEntities('&quot;x&quot; &apos;y&apos;'), '"x" \'y\'');
checkEqual('实体：十进制数字实体', decodeEntities('&#20013;&#25991;'), '中文');
checkEqual('实体：十六进制数字实体', decodeEntities('&#x4e2d;&#x6587;'), '中文');
checkEqual('实体：nbsp 变不换行空格', decodeEntities('a&nbsp;b'), 'a\u00a0b');
checkEqual('实体：不认识的实体原样保留', decodeEntities('&unknownentity;'), '&unknownentity;');
checkEqual('实体：双重转义只解一层', decodeEntities('&amp;amp;'), '&amp;');
checkEqual('实体：正文里的裸 & 不受影响', decodeEntities('Tom & Jerry'), 'Tom & Jerry');

// ============ 3. 重型依赖守卫 ============
const HEAVY_DEPS = [
  { pkg: 'mammoth', allowed: 'docxEngine.ts' },
  { pkg: 'xlsx', allowed: 'xlsxEngine.ts' },
];

function findEagerImports(pkg, allowedFile) {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (full.endsWith(allowedFile)) continue;
      const source = readFileSync(full, 'utf8');
      const eager = new RegExp(`from\\s+['"]${pkg}(/|['"])`).test(source);
      if (eager) offenders.push(full);
    }
  };
  walk('src');
  return offenders;
}

for (const dep of HEAVY_DEPS) {
  const offenders = findEagerImports(dep.pkg, dep.allowed);
  check(
    `守卫：${dep.pkg} 只在 ${dep.allowed} 里静态 import`,
    offenders.length === 0,
    offenders.join(', ')
  );
}

/**
 * 守卫：两个引擎都必须先补 TextDecoder。
 *
 * Hermes 没有 TextDecoder，mammoth 的 Buffer 模拟层和 SheetJS 的 XML 部件读取都会用到它；
 * 少了这一句真机就是"打开文档直接报错"。Node 有内置实现，跑不出这个问题，
 * 所以只能在源码层钉住（真正的运行时行为由 scripts/test-docx-hermes.mjs 覆盖）。
 */
for (const engine of ['src/utils/office/docxEngine.ts', 'src/utils/office/xlsxEngine.ts']) {
  check(
    `守卫：${engine.split('/').pop()} 调用了 ensureTextDecoder()`,
    readFileSync(engine, 'utf8').includes('ensureTextDecoder()'),
    '缺少 ensureTextDecoder()，Hermes 上会报 Property \'TextDecoder\' doesn\'t exist'
  );
}

/**
 * 守卫：docx 转换不要再传 mammoth 的 `buffer` 入参。
 * 那条路径只会多绕一层 Buffer 模拟层（同样依赖 TextDecoder），没有任何好处：
 * Metro 已把 mammoth alias 到浏览器构建，它只认 arrayBuffer。
 */
const docxEngineSource = readFileSync('src/utils/office/docxEngine.ts', 'utf8');
check(
  '守卫：docxEngine 不传 mammoth 的 buffer 入参',
  !/\bbuffer\s*:/.test(docxEngineSource),
  'docxEngine.ts 里出现了 buffer: 入参'
);




if (failed > 0) {
  console.log(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('\n全部通过');
