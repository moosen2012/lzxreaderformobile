import hljs from 'highlight.js';
import type { CodeTheme } from '../types';

// 内联 highlight.js 主题 CSS（避免 WebView 从 CDN 加载，大幅提升渲染速度）
const THEME_CSS: Record<CodeTheme, string> = {
  github:
    'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#24292e;background:#fff}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}.hljs-built_in,.hljs-symbol{color:#e36209}.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}.hljs-subst{color:#24292e}.hljs-section{color:#005cc5;font-weight:700}.hljs-bullet{color:#735c0f}.hljs-emphasis{color:#24292e;font-style:italic}.hljs-strong{color:#24292e;font-weight:700}.hljs-addition{color:#22863a;background-color:#f0fff4}.hljs-deletion{color:#b31d28;background-color:#ffeef0}',
  monokai:
    'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{background:#272822;color:#ddd}.hljs-keyword,.hljs-literal,.hljs-name,.hljs-number,.hljs-selector-tag,.hljs-strong,.hljs-tag{color:#f92672}.hljs-code{color:#66d9ef}.hljs-attr,.hljs-attribute,.hljs-link,.hljs-regexp,.hljs-symbol{color:#bf79db}.hljs-addition,.hljs-built_in,.hljs-bullet,.hljs-emphasis,.hljs-section,.hljs-selector-attr,.hljs-selector-pseudo,.hljs-string,.hljs-subst,.hljs-template-tag,.hljs-template-variable,.hljs-title,.hljs-type,.hljs-variable{color:#a6e22e}.hljs-class .hljs-title,.hljs-title.class_{color:#fff}.hljs-comment,.hljs-deletion,.hljs-meta,.hljs-quote{color:#75715e}.hljs-doctag,.hljs-keyword,.hljs-literal,.hljs-section,.hljs-selector-id,.hljs-selector-tag,.hljs-title,.hljs-type{font-weight:700}',
  vs:
    'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{background:#fff;color:#000}.hljs-comment,.hljs-quote,.hljs-variable{color:green}.hljs-built_in,.hljs-keyword,.hljs-name,.hljs-selector-tag,.hljs-tag{color:#00f}.hljs-addition,.hljs-attribute,.hljs-literal,.hljs-section,.hljs-string,.hljs-template-tag,.hljs-template-variable,.hljs-title,.hljs-type{color:#a31515}.hljs-deletion,.hljs-meta,.hljs-selector-attr,.hljs-selector-pseudo{color:#2b91af}.hljs-doctag{color:grey}.hljs-attr{color:red}.hljs-bullet,.hljs-link,.hljs-symbol{color:#00b0e8}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}',
  androidstudio:
    'pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}.hljs{color:#a9b7c6;background:#282b2e}.hljs-bullet,.hljs-literal,.hljs-number,.hljs-symbol{color:#6897bb}.hljs-deletion,.hljs-keyword,.hljs-selector-tag{color:#cc7832}.hljs-link,.hljs-template-variable,.hljs-variable{color:#629755}.hljs-comment,.hljs-quote{color:grey}.hljs-meta{color:#bbb529}.hljs-addition,.hljs-attribute,.hljs-string{color:#6a8759}.hljs-section,.hljs-title,.hljs-type{color:#ffc66d}.hljs-name,.hljs-selector-class,.hljs-selector-id{color:#e8bf6a}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}',
};

// 使用 npm 包中的 highlight.js 预高亮代码（避免在 WebView 中加载和执行 JS）
export function highlightCode(code: string, language: string): string {
  try {
    if (language === 'plaintext' || !language) {
      return escapeHtml(code);
    }
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

// 生成代码高亮的HTML（预高亮 + 内联CSS，零网络请求）
// wordWrap: true=自动换行, false=水平滚动（默认）
export function generateCodeHtml(
  code: string,
  language: string,
  codeTheme: CodeTheme,
  isDark: boolean,
  wordWrap: boolean = false
): string {
  const themeCss = getHighlightThemeCss(codeTheme);
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

// 生成 Mermaid 图表的 HTML
export function generateMermaidHtml(code: string, isDark: boolean): string {
  const theme = isDark ? 'dark' : 'default';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      margin: 0;
      padding: 8px;
      background: transparent;
      display: flex;
      justify-content: center;
    }
    .mermaid { font-size: 14px; }
  </style>
</head>
<body>
  <div class="mermaid">${escapeHtml(code)}</div>
  <script>
    try {
      mermaid.initialize({ startOnLoad: true, theme: '${theme}' });
    } catch(e) {
      console.error('Mermaid error:', e);
    }
  </script>
</body>
</html>`;
}

// 生成 KaTeX 数学公式的 HTML
export function generateKatexHtml(
  formula: string,
  isDark: boolean,
  isBlock: boolean
): string {
  const textColor = isDark ? '#D4D4D4' : '#24292E';
  const displayMode = isBlock ? 'true' : 'false';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      margin: 0;
      padding: 4px;
      background: transparent;
      color: ${textColor};
      font-size: 16px;
    }
    .formula { display: flex; justify-content: center; }
  </style>
</head>
<body>
  <span id="formula"></span>
  <script>
    try {
      katex.render(${JSON.stringify(formula)}, document.getElementById('formula'), {
        displayMode: ${displayMode},
        throwOnError: false
      });
    } catch(e) {
      console.error('KaTeX error:', e);
    }
  </script>
</body>
</html>`;
}

// 获取highlight.js主题内联CSS（替代CDN链接，零网络请求）
export function getHighlightThemeCss(theme: CodeTheme): string {
  return THEME_CSS[theme] ?? THEME_CSS.github;
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

// 转义HTML
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
