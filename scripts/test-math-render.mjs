/**
 * 公式渲染回归测试：
 * 1. TeX 能渲染出尺寸正确的 SVG
 * 2. SVG 标签里不能残留 ex 单位 / style（react-native-svg 不认）
 * 3. 颜色必须内联（SvgXml 没有 currentColor 继承）
 * 4. <use> 引用的字形 id 必须存在，否则真机上会渲染成空白
 * 5. 语法错误的公式要降级为 null，由 UI 显示原始 TeX
 * 6. 引擎是延迟加载的：异步接口 + 命中缓存后不再等待
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCachedMath, renderMath, setMathEngineLoader } from '../src/utils/mathRenderer.ts';

// Node 的 ESM 解析不到无扩展名的 .ts，这里显式声明依赖并注入加载器；
// 真实 App 里走的是 mathRenderer 内部的动态 import('./mathjaxEngine')
setMathEngineLoader(() => import('../src/utils/mathjaxEngine.ts'));

/**
 * 守卫：mathjax-full 只允许被 mathjaxEngine.ts 静态 import。
 * 一旦有人在别处（比如 MarkdownRenderer）顺手 import，App 冷启动又会被它拖死，
 * 而这种退化在单测里看不出来，所以直接用源码扫描卡住。
 */
function assertNoEagerMathjax() {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (full.endsWith('mathjaxEngine.ts')) continue;
      const source = readFileSync(full, 'utf8');
      if (/from\s+['"]mathjax-full/.test(source) || /import\s*\(\s*['"]mathjax-full/.test(source)) {
        offenders.push(full);
      }
    }
  };
  walk('src');
  return offenders;
}

const formulas = [
  { tex: 'E = mc^2', display: false },
  { tex: '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}', display: true },
  { tex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', display: true },
  { tex: '\\begin{align} a &= b \\\\ c &= d \\end{align}', display: true },
  { tex: '\\text{中文测试} + \\alpha_{i}^{2} \\leq \\sum_{k=1}^{n} k', display: false },
  { tex: '\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\nabla^2 u', display: true },
];

const COLOR = '#1C1C1E';
let failed = 0;

function check(name, condition, detail = '') {
  if (!condition) {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`PASS  ${name}`);
  }
}

async function main() {
  // 启动性能守卫：mathjax 只能在 mathjaxEngine.ts 里被静态引入
  const offenders = assertNoEagerMathjax();
  check(
    'mathjax 未被启动路径直接 import',
    offenders.length === 0,
    offenders.join(', ')
  );

  // 引擎加载前：缓存应该是空的，说明没有在模块顶层就把 mathjax 求值掉
  check(
    '模块加载时未预计算（懒加载生效）',
    getCachedMath('E = mc^2', { display: false, fontSize: 16, color: COLOR }) === undefined
  );

  for (const { tex, display } of formulas) {
    const result = await renderMath(tex, { display, fontSize: 16, color: COLOR });
    const label = tex.slice(0, 32).replace(/\n/g, ' ');

    if (!result) {
      check(`渲染 ${label}`, false, '返回 null');
      continue;
    }

    const openTag = result.svg.match(/<svg[^>]*>/)?.[0] ?? '';
    const pathIds = new Set(
      Array.from(result.svg.matchAll(/<path[^>]*\sid="([^"]+)"/g)).map((m) => m[1])
    );
    const useRefs = Array.from(result.svg.matchAll(/<use[^>]*(?:xlink:)?href="#([^"]+)"/g)).map(
      (m) => m[1]
    );
    const missing = useRefs.filter((ref) => !pathIds.has(ref));

    check(`渲染 ${label}`, result.width > 0 && result.height > 0, `尺寸 ${result.width}x${result.height}`);
    check(`  无 ex 单位残留`, !/\swidth="|\sheight="|\sstyle="/.test(openTag), openTag.slice(0, 100));
    check(`  颜色已内联`, result.svg.includes(COLOR));
    check(`  字形引用完整`, missing.length === 0, `缺失 ${missing.slice(0, 3).join(',')}`);
    check(
      `  已写入同步缓存`,
      getCachedMath(tex, { display, fontSize: 16, color: COLOR })?.width === result.width
    );
  }

  // 语法错误必须降级（返回 null），而不是渲染成深色模式下的实心错误块
  const broken = await renderMath('\\frac{1}{', { display: true, fontSize: 16, color: COLOR });
  check('非法公式降级为 null', broken === null, broken ? '仍返回了 SVG' : '');

  // 性能兜底：引擎已就绪后连续渲染 50 个不同公式不应超过 2s（真机上阈值放宽，这里只防明显退化）
  const started = Date.now();
  for (let i = 0; i < 50; i += 1) {
    await renderMath(`x_{${i}} + \\frac{1}{${i + 1}}`, { display: false, fontSize: 16, color: COLOR });
  }
  const elapsed = Date.now() - started;
  check(`50 个公式渲染耗时 ${elapsed}ms`, elapsed < 2000);

  console.log(failed === 0 ? '\n公式渲染测试全部通过' : `\n${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
