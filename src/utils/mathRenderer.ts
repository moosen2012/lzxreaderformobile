/**
 * TeX 公式渲染：在 JS 侧把 TeX 转成自包含的 SVG 字符串。
 *
 * 为什么不用 WebView + KaTeX：
 *   - 每个公式一个 WebView 实例，30 个公式就是 30 个 WebView，Android 上必然卡顿/OOM；
 *   - KaTeX 需要从 CDN 拉 js/css/字体，离线不可用，首屏慢。
 *
 * 为什么引擎要延迟加载：
 *   mathjax-full 的模块图极大，如果在本文件顶层 import，App 冷启动就会被它占住 JS 线程
 *   （即使只是停在空态、一个公式都没有）。所以这里用动态 import，
 *   只有第一次真的要渲染公式时才加载 mathjaxEngine。
 */

export interface MathSvg {
  /** 自包含的 <svg> 字符串，颜色已内联 */
  svg: string;
  /** 渲染宽度（px） */
  width: number;
  /** 渲染高度（px） */
  height: number;
  /** 相对基线的下沉量（px），用于行内对齐 */
  baselineOffset: number;
}

interface MathRenderOptions {
  /** 块级公式（\displaystyle + 居中） */
  display: boolean;
  /** 正文字号（px），用于把 ex 换算成 px */
  fontSize: number;
  /** 前景色，替换 SVG 里的 currentColor */
  color: string;
}

/** 1ex 约等于 0.5em，MathJax 的尺寸以 ex 为单位输出 */
const EX_TO_EM = 0.5;

type MathEngineModule = typeof import('./mathjaxEngine');

let enginePromise: Promise<MathEngineModule | null> | null = null;

/**
 * 引擎加载器。默认走动态 import：Metro 会把模块留在 bundle 里，但**推迟到第一次用到才求值**，
 * 这是避免冷启动被 mathjax 拖死的唯一办法。
 *
 * 单测里 Node 的 ESM 解析不到无扩展名的 .ts，所以允许测试注入自己的加载器。
 */
let engineLoader: (() => Promise<MathEngineModule | null>) | null = null;

export function setMathEngineLoader(loader: () => Promise<MathEngineModule | null>) {
  engineLoader = loader;
  enginePromise = null;
}

/**
 * 动态加载公式引擎。
 * 返回 null 表示加载失败（例如打包时漏了依赖），调用方降级显示源码。
 */
function loadEngine(): Promise<MathEngineModule | null> {
  if (!enginePromise) {
    engineLoader ??= () => import('./mathjaxEngine');
    enginePromise = engineLoader().catch(() => null);
  }
  return enginePromise;
}

/** 公式在滚动时会重复出现（重复渲染同一段内容），缓存避免重复计算 */
const cache = new Map<string, MathSvg | null>();
const CACHE_LIMIT = 400;

function cacheKeyOf(source: string, options: MathRenderOptions): string {
  return `${options.display ? 'D' : 'I'}|${options.fontSize}|${options.color}|${source}`;
}

/**
 * 同步读取缓存，用于首帧直接命中（重复渲染时不再闪一下源码）。
 * 返回 undefined 表示"没算过"，null 表示"算过但失败了"。
 */
export function getCachedMath(
  tex: string,
  options: MathRenderOptions
): MathSvg | null | undefined {
  const source = tex.trim();
  if (!source) return null;
  return cache.get(cacheKeyOf(source, options));
}

function readLength(html: string, attr: 'width' | 'height'): number {
  const match = html.match(new RegExp(`${attr}="([\\d.]+)ex"`));
  return match ? parseFloat(match[1]) : 0;
}

function readBaseline(html: string): number {
  const match = html.match(/vertical-align:\s*-([\d.]+)ex/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * 清洗 MathJax 产出的 SVG，使其能被 react-native-svg 正确解析：
 * - 去掉 style（CSS 的 vertical-align 在 RN 无效，尺寸改由外部 width/height 控制）
 * - 去掉 <svg> 上的 width/height（MathJax 用 ex 单位，RN 不认，会算出错误尺寸）
 * - currentColor 必须替换成具体颜色，SvgXml 没有颜色继承
 */
function sanitizeSvg(svg: string, color: string): string {
  const openTagMatch = svg.match(/<svg[\s\S]*?>/);
  if (!openTagMatch) return svg.replace(/currentColor/g, color);

  const cleanedOpenTag = openTagMatch[0]
    .replace(/\sstyle="[^"]*"/, '')
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '')
    .replace(/\srole="[^"]*"/, '')
    .replace(/\sfocusable="[^"]*"/, '');

  return `${cleanedOpenTag}${svg.slice(openTagMatch[0].length)}`.replace(/currentColor/g, color);
}

/**
 * 把 TeX 渲染成 SVG。
 * 失败（语法错误 / 引擎加载失败）返回 null，由调用方降级为原始文本。
 *
 * 首次调用会等待 mathjax 引擎加载，之后全程同步计算（只多一个微任务）。
 */
export async function renderMath(tex: string, options: MathRenderOptions): Promise<MathSvg | null> {
  const source = tex.trim();
  if (!source) return null;

  const key = cacheKeyOf(source, options);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const engine = await loadEngine();
  if (!engine) {
    cache.set(key, null);
    return null;
  }

  try {
    const exPx = options.fontSize * EX_TO_EM;
    const outer = engine.convertToSvg(source, options.display, options.fontSize, exPx);

    // MathJax 对语法错误不会抛异常，而是渲染一块"红底错误块"（merror + data-mjx-error）。
    // 这种块在深色主题下会变成实心黑块，体验很差，这里统一交给调用方降级为原始 TeX。
    if (!outer || outer.includes('data-mjx-error')) throw new Error('TeX 语法错误');

    const svgMatch = outer.match(/<svg[\s\S]*<\/svg>/);
    if (!svgMatch) throw new Error('SVG 输出为空');

    const width = readLength(outer, 'width') * exPx;
    const height = readLength(outer, 'height') * exPx;
    const baselineOffset = readBaseline(outer) * exPx;

    const result: MathSvg = {
      svg: sanitizeSvg(svgMatch[0], options.color),
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      baselineOffset: Math.round(baselineOffset * 100) / 100,
    };

    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/** 主题/字号切换时清空缓存（SVG 内已内联颜色和尺寸） */
export function clearMathCache() {
  cache.clear();
}
