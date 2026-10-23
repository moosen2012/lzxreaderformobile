import { preprocessMarkdown, INLINE_MATH_MARKER } from '../src/utils/markdownPreprocess.ts';

const cases = [
  {
    name: '行内公式被转成标记',
    input: '设 $x^2 + y^2 = 1$ 为单位圆。',
    expect: (out) => out.includes(`${INLINE_MATH_MARKER}x^2 + y^2 = 1`),
  },
  {
    name: '块级公式转成 katex 围栏',
    input: '前文\n\n$$\n\\int_0^1 x dx\n$$\n\n后文',
    expect: (out) => out.includes('```katex') && out.includes('\\int_0^1 x dx'),
  },
  {
    name: '代码块里的 $HOME 不被当成公式',
    input: '```bash\necho $HOME\ncp ${i} $TARGET\n```',
    expect: (out) => out.includes('$HOME') && !out.includes(INLINE_MATH_MARKER),
  },
  {
    name: '代码块里的 $$ 不被转义',
    input: '```tex\n$$\nE = mc^2\n$$\n```',
    expect: (out) => out.includes('$$\nE = mc^2\n$$') && !out.includes('```katex\nE'),
  },
  {
    name: '行内代码里的 $x$ 保持不变',
    input: '用 `$x$` 表示行内公式源码。',
    expect: (out) => out.includes('`$x$`') && !out.includes(INLINE_MATH_MARKER),
  },
  {
    name: '货币金额不被误判',
    input: '价格从 $5 到 $10 不等。',
    expect: (out) => out.includes('$5 到 $10') && !out.includes(INLINE_MATH_MARKER),
  },
  {
    name: 'frontmatter 被剥离',
    input: '---\ntitle: 测试\n---\n\n正文 $a+b$',
    expect: (out) => !out.includes('title: 测试') && out.includes('正文'),
  },
  {
    name: '未闭合围栏之后的文本仍保持原样',
    input: '```js\nconst a = 1;\n',
    expect: (out) => out.includes('const a = 1;'),
  },
  {
    name: '多段公式与文字混排',
    input: '当 $a>0$ 时，$b$ 递增；否则 $c$ 递减。',
    expect: (out) => (out.match(/\$KATEX\$/g) || []).length === 3,
  },
];

let failed = 0;
for (const testCase of cases) {
  const output = preprocessMarkdown(testCase.input);
  const ok = testCase.expect(output);
  if (!ok) {
    failed += 1;
    console.log(`FAIL  ${testCase.name}`);
    console.log('  input   :', JSON.stringify(testCase.input));
    console.log('  output  :', JSON.stringify(output));
  } else {
    console.log(`PASS  ${testCase.name}`);
  }
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 个用例失败`);
process.exit(failed === 0 ? 0 : 1);
