import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import rust from 'highlight.js/lib/languages/rust';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import less from 'highlight.js/lib/languages/less';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import ini from 'highlight.js/lib/languages/ini';
import dart from 'highlight.js/lib/languages/dart';
import lua from 'highlight.js/lib/languages/lua';
import r from 'highlight.js/lib/languages/r';
import scala from 'highlight.js/lib/languages/scala';
import clojure from 'highlight.js/lib/languages/clojure';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import vim from 'highlight.js/lib/languages/vim';
import markdown from 'highlight.js/lib/languages/markdown';
import type { CodeTheme } from '../types';

/**
 * 只注册实际会用到的语言。
 * 直接 `import hljs from 'highlight.js'` 会把 190+ 种语言全部打进 bundle（几百 KB），
 * 对我们支持的 40 个扩展名来说完全没有必要。
 */
const LANGUAGES = {
  javascript,
  typescript,
  python,
  go,
  java,
  c,
  cpp,
  csharp,
  ruby,
  php,
  swift,
  kotlin,
  rust,
  bash,
  sql,
  xml,
  css,
  scss,
  less,
  json,
  yaml,
  ini,
  dart,
  lua,
  r,
  scala,
  clojure,
  elixir,
  erlang,
  vim,
  markdown,
};

/**
 * 语言注册会为每种语法编译正则，属于容易被忽视的启动开销。
 * 改成首次真正高亮时才注册：停在空态或只读 markdown 时不付这份成本。
 */
let languagesRegistered = false;
function ensureLanguages() {
  if (languagesRegistered) return;
  languagesRegistered = true;
  for (const [name, definition] of Object.entries(LANGUAGES)) {
    hljs.registerLanguage(name, definition);
  }
}

// 主题 CSS 内联（避免 WebView 从 CDN 加载，零网络请求）
const THEME_CSS_LIGHT: Record<CodeTheme, string> = {
  github:
    'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#24292e;background:#fff}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}.hljs-built_in,.hljs-symbol{color:#e36209}.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}.hljs-subst{color:#24292e}.hljs-section{color:#005cc5;font-weight:700}.hljs-bullet{color:#735c0f}.hljs-emphasis{color:#24292e;font-style:italic}.hljs-strong{color:#24292e;font-weight:700}.hljs-addition{color:#22863a;background-color:#f0fff4}.hljs-deletion{color:#b31d28;background-color:#ffeef0}',
  monokai:
    'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{background:#272822;color:#ddd}.hljs-keyword,.hljs-literal,.hljs-name,.hljs-number,.hljs-selector-tag,.hljs-strong,.hljs-tag{color:#f92672}.hljs-code{color:#66d9ef}.hljs-attr,.hljs-attribute,.hljs-link,.hljs-regexp,.hljs-symbol{color:#bf79db}.hljs-addition,.hljs-built_in,.hljs-bullet,.hljs-emphasis,.hljs-section,.hljs-selector-attr,.hljs-selector-pseudo,.hljs-string,.hljs-subst,.hljs-template-tag,.hljs-template-variable,.hljs-title,.hljs-type,.hljs-variable{color:#a6e22e}.hljs-class .hljs-title,.hljs-title.class_{color:#fff}.hljs-comment,.hljs-deletion,.hljs-meta,.hljs-quote{color:#75715e}.hljs-doctag,.hljs-keyword,.hljs-literal,.hljs-section,.hljs-selector-id,.hljs-selector-tag,.hljs-title,.hljs-type{font-weight:700}',
  vs: 'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{background:#fff;color:#000}.hljs-comment,.hljs-quote,.hljs-variable{color:green}.hljs-built_in,.hljs-keyword,.hljs-name,.hljs-selector-tag,.hljs-tag{color:#00f}.hljs-addition,.hljs-attribute,.hljs-literal,.hljs-section,.hljs-string,.hljs-template-tag,.hljs-template-variable,.hljs-title,.hljs-type{color:#a31515}.hljs-deletion,.hljs-meta,.hljs-selector-attr,.hljs-selector-pseudo{color:#2b91af}.hljs-doctag{color:grey}.hljs-attr{color:red}.hljs-bullet,.hljs-link,.hljs-symbol{color:#00b0e8}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}',
  androidstudio:
    'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#a9b7c6;background:#282b2e}.hljs-bullet,.hljs-literal,.hljs-number,.hljs-symbol{color:#6897bb}.hljs-deletion,.hljs-keyword,.hljs-selector-tag{color:#cc7832}.hljs-link,.hljs-template-variable,.hljs-variable{color:#629755}.hljs-comment,.hljs-quote{color:grey}.hljs-meta{color:#bbb529}.hljs-addition,.hljs-attribute,.hljs-string{color:#6a8759}.hljs-section,.hljs-title,.hljs-type{color:#ffc66d}.hljs-name,.hljs-selector-class,.hljs-selector-id{color:#e8bf6a}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}',
};

/**
 * 深色模式下的主题 CSS。
 * 之前只有亮色 token 配色、背景却随 isDark 变，导致深色模式出现"深底+深字"。
 * monokai / androidstudio 本身就是深色主题，无需变体。
 */
const THEME_CSS_DARK: Partial<Record<CodeTheme, string>> = {
  github:
    'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#c9d1d9;background:#0d1117}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#79c0ff}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#a5d6ff}.hljs-built_in,.hljs-symbol{color:#ffa657}.hljs-code,.hljs-comment,.hljs-formula{color:#8b949e}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#7ee787}.hljs-subst{color:#c9d1d9}.hljs-section{color:#1f6feb;font-weight:700}.hljs-bullet{color:#f2cc60}.hljs-emphasis{color:#c9d1d9;font-style:italic}.hljs-strong{color:#c9d1d9;font-weight:700}.hljs-addition{color:#aff5b4;background-color:#033a16}.hljs-deletion{color:#ffdcd7;background-color:#67060c}',
  vs: 'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{background:#1e1e1e;color:#d4d4d4}.hljs-comment,.hljs-quote{color:#6a9955}.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-name,.hljs-tag{color:#569cd6}.hljs-string,.hljs-doctag,.hljs-regexp{color:#ce9178}.hljs-number,.hljs-built_in{color:#b5cea8}.hljs-title,.hljs-section,.hljs-attribute{color:#dcdcaa}.hljs-type,.hljs-class .hljs-title{color:#4ec9b0}.hljs-attr{color:#9cdcfe}.hljs-meta{color:#c586c0}',
};

export function getHighlightThemeCss(theme: CodeTheme, isDark = false): string {
  if (isDark && THEME_CSS_DARK[theme]) return THEME_CSS_DARK[theme] as string;
  return THEME_CSS_LIGHT[theme] ?? THEME_CSS_LIGHT.github;
}

// 使用 npm 包中的 highlight.js 预高亮代码（避免在 WebView 中加载和执行 JS）
export function highlightCode(code: string, language: string): string {
  try {
    ensureLanguages();
    if (language === 'plaintext' || !language || !hljs.getLanguage(language)) {
      return escapeHtml(code);
    }
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

// 生成代码高亮的 HTML（预高亮 + 内联 CSS，零网络请求）
// wordWrap: true=自动换行, false=水平滚动（默认）
export function generateCodeHtml(
  code: string,
  language: string,
  codeTheme: CodeTheme,
  isDark: boolean,
  wordWrap: boolean = false
): string {
  const themeCss = getHighlightThemeCss(codeTheme, isDark);
  const bgColor = getHighlightBgColor(codeTheme, isDark);
  const textColor = isDark ? '#D4D4D4' : '#24292E';

  // 在 RN 侧预高亮代码，避免在 WebView 中加载和执行 highlight.js
  const highlightedCode = highlightCode(code, language);

  // 根据换行模式选择 CSS
  const preStyle = wordWrap
    ? 'overflow-x:hidden;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;'
    : 'overflow-x:auto;white-space:pre;';
  const codeHljsStyle = wordWrap
    ? 'padding:0;overflow-x:hidden;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;'
    : 'padding:0;overflow-x:auto;white-space:pre;';
  const scrollbarCss = wordWrap
    ? 'pre::-webkit-scrollbar{display:none;}pre{scrollbar-width:none;}'
    : 'pre::-webkit-scrollbar{height:4px;}pre::-webkit-scrollbar-thumb{background:rgba(128,128,128,0.4);border-radius:2px;}pre::-webkit-scrollbar-track{background:transparent;}';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    ${themeCss}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${bgColor};
      color: ${textColor};
      font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
      font-size: 14px;
      line-height: 1.6;
      -webkit-text-size-adjust: 100%;
    }
    pre {
      margin: 0;
      padding: 16px;
      background: ${bgColor};
      ${preStyle}
    }
    /* 覆盖主题 CSS 中的 padding 和 overflow-x */
    pre code.hljs {
      display: block;
      ${codeHljsStyle}
    }
    code {
      font-family: inherit;
    }
    ${scrollbarCss}
  </style>
</head>
<body>
  <pre><code class="hljs">${highlightedCode}</code></pre>
</body>
</html>`;
}

/** Mermaid CDN 版本固定，避免上游发版导致渲染行为漂移 */
const MERMAID_VERSION = '10.9.1';

/**
 * 生成 Mermaid 图表的 HTML。
 * 内置高度上报与错误上报：图表渲染完、或者失败时都会 postMessage 给 RN 侧，
 * 否则 WebView 只能靠固定 minHeight 占位，长图会被裁掉。
 */
export function generateMermaidHtml(code: string, isDark: boolean, backgroundColor = 'transparent'): string {
  const theme = isDark ? 'dark' : 'default';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      padding: 8px;
      background: ${backgroundColor};
      display: flex;
      justify-content: center;
      overflow: hidden;
    }
    .mermaid { font-size: 14px; }
    .mermaid svg { max-width: 100%; height: auto; }
    .mermaid-error {
      font-family: Menlo, monospace;
      font-size: 12px;
      color: #d73a49;
      white-space: pre-wrap;
      word-break: break-all;
      padding: 8px;
    }
  </style>
</head>
<body>
  <div class="mermaid">${escapeHtml(code)}</div>
  <script>
    (function () {
      function post(payload) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}
      }
      function postHeight() {
        var svg = document.querySelector('.mermaid svg');
        if (!svg) return;
        var h = Math.ceil(svg.getBoundingClientRect().height) + 16;
        post({ type: 'height', height: h });
      }
      function fail(message) {
        post({ type: 'error', message: String(message || '图表渲染失败') });
      }
      var settled = false;
      window.addEventListener('error', function (e) { if (!settled) fail(e.message); });
      try {
        if (typeof mermaid === 'undefined') { fail('图表库加载失败，请检查网络'); return; }
        mermaid.initialize({ startOnLoad: false, theme: '${theme}', securityLevel: 'strict' });
        mermaid.run({ querySelector: '.mermaid' }).then(function () {
          settled = true;
          postHeight();
          setTimeout(postHeight, 120);
          setTimeout(postHeight, 400);
        }).catch(function (e) { fail(e && e.message ? e.message : e); });
      } catch (e) {
        fail(e && e.message ? e.message : e);
      }
      window.addEventListener('resize', postHeight);
    })();
  </script>
</body>
</html>`;
}

// 获取代码背景色
export function getHighlightBgColor(theme: CodeTheme, isDark: boolean): string {
  const colors: Record<CodeTheme, string> = {
    github: isDark ? '#0D1117' : '#F6F8FA',
    monokai: '#272822',
    vs: isDark ? '#1E1E1E' : '#FFFFFF',
    androidstudio: '#282B2E',
  };
  return colors[theme];
}

// 转义 HTML
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 代码主题选项
export const CODE_THEME_OPTIONS: { label: string; value: CodeTheme; isDark: boolean }[] = [
  { label: 'GitHub', value: 'github', isDark: false },
  { label: 'Monokai', value: 'monokai', isDark: true },
  { label: 'VS Code', value: 'vs', isDark: false },
  { label: 'Android Studio', value: 'androidstudio', isDark: true },
];
