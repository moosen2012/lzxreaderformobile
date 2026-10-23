/**
 * MathJax 引擎的**唯一**入口模块。
 *
 * 为什么要单独拆一个文件：
 *   mathjax-full 解压后 38MB，模块图极大。之前 mathRenderer 在顶层 import mathjax，
 *   导致 App 冷启动时（即使只是停在"还没有文件"的空态）就要同步求值这整套东西，
 *   在 Expo Go dev 模式下会长时间占住 JS 线程，系统直接弹"isn't responding"。
 *
 *   现在 mathRenderer 用 `import('./mathjaxEngine')` 动态加载，
 *   只有真正第一次渲染公式时才付这份代价。
 *
 * 注意：**不要**在别的文件里 import mathjax-full，否则又会回到启动即加载。
 */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';

/**
 * 这些 import 只为触发副作用（把宏包注册进 TeX 全局配置表）。
 * 少了它们，`packages: ['ams']` 不会生效，pmatrix / align 等环境会报
 * "Unknown environment" —— 这是 MathJax 在 ESM 下的一个坑。
 *
 * 不要引入 autoload / require 包：它们依赖动态 require 与 fs，RN 运行时不可用。
 */
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js';
import 'mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js';
import 'mathjax-full/js/input/tex/noerrors/NoErrorsConfiguration.js';

/** 只注册阅读场景常见宏包，避免把 MathJax 全量包（含大量扩展）打进来 */
const TEX_PACKAGES = ['base', 'ams', 'newcommand', 'mathtools', 'textmacros', 'noerrors'];

let doc: ReturnType<typeof mathjax.document> | null = null;
let adaptor: ReturnType<typeof liteAdaptor> | null = null;

function ensureEngine() {
  if (doc && adaptor) return { doc, adaptor };

  const a = liteAdaptor();
  RegisterHTMLHandler(a);
  const tex = new TeX({ packages: TEX_PACKAGES });
  // fontCache: 'local' 让每个 SVG 自带字形路径，脱离全局 defs 也能独立渲染
  const svg = new SVG({ fontCache: 'local' });
  const d = mathjax.document('', { InputJax: tex, OutputJax: svg });

  adaptor = a;
  doc = d;
  return { doc, adaptor };
}

/**
 * 把 TeX 渲染成 MathJax 的 SVG 外层 HTML。
 * 失败（语法错误、内部异常）返回 null，由调用方降级为原始文本。
 */
export function convertToSvg(tex: string, display: boolean, em: number, ex: number): string | null {
  try {
    const engine = ensureEngine();
    const node = engine.doc.convert(tex, {
      display,
      em,
      ex,
      // 给一个足够宽的容器，避免长公式被 MathJax 主动断行
      containerWidth: 100000,
    });
    return engine.adaptor.outerHTML(node);
  } catch {
    return null;
  }
}
