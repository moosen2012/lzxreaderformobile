import type { CodeTheme } from '../types';

// 生成代码高亮的HTML
export function generateCodeHtml(
  code: string,
  language: string,
  codeTheme: CodeTheme,
  isDark: boolean
): string {
  const themeUrl = getHighlightThemeUrl(codeTheme);
  const bgColor = getHighlightBgColor(codeTheme, isDark);
  const textColor = isDark ? '#D4D4D4' : '#24292E';

  // 转义HTML特殊字符
  const escapedCode = escapeHtml(code);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <link rel="stylesheet" href="${themeUrl}">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <style>
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
      overflow-x: auto;
      white-space: pre;
      background: ${bgColor};
    }
    code {
      font-family: inherit;
    }
    /* 隐藏滚动条 */
    pre::-webkit-scrollbar { display: none; }
    pre { scrollbar-width: none; }
  </style>
</head>
<body>
  <pre><code class="language-${language}">${escapedCode}</code></pre>
  <script>
    try {
      hljs.highlightAll();
    } catch(e) {
      console.error('Highlight error:', e);
    }
  </script>
</body>
</html>`;
}

// 获取highlight.js主题URL
function getHighlightThemeUrl(theme: CodeTheme): string {
  const urls: Record<CodeTheme, string> = {
    github: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css',
    monokai: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/monokai.min.css',
    vs: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs.min.css',
    androidstudio: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/androidstudio.min.css',
  };
  return urls[theme];
}

// 获取代码背景色
function getHighlightBgColor(theme: CodeTheme, isDark: boolean): string {
  const colors: Record<CodeTheme, string> = {
    github: isDark ? '#0D1117' : '#F6F8FA',
    monokai: '#272822',
    vs: isDark ? '#1E1E1E' : '#FFFFFF',
    androidstudio: '#282B2E',
  };
  return colors[theme];
}

// 转义HTML
function escapeHtml(text: string): string {
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
