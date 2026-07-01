# Markdown 渲染库迁移计划：react-native-markdown-display → react-native-marked

## 概述

将项目的 Markdown 渲染库从 `react-native-markdown-display@7.0.2` 迁移到 `react-native-marked@6.0.7`（RN 0.74.5 对应 v6），同时补齐 YAML frontmatter 剥离、LaTeX 数学公式渲染、Mermaid 图表渲染三项扩展能力。

## 当前状态分析

### 依赖现状
- `react-native-markdown-display@^7.0.2` — 唯一使用点在 [MarkdownRenderer.tsx](file:///c:/Users/11577/Documents/GitHub/lzxreaderformobile/src/components/Reader/MarkdownRenderer.tsx)
- `highlight.js@^11.9.0` — 声明了但本地未 import，实际通过 WebView CDN 加载
- `react-native-webview@13.8.6` — CodeBlock 使用
- 无 `react-native-svg` 依赖

### 渲染架构
```
ReaderContent.tsx (ScrollView + onScroll 进度跟踪)
  └── MarkdownRenderer.tsx (react-native-markdown-display, rules 覆写 fence/code_block)
       └── CodeBlock.tsx (WebView + highlight.js CDN)
            └── markdownHelper.ts (generateCodeHtml)
```

### 主题机制
- `Theme` 接口（[themes.ts](file:///c:/Users/11577/Documents/GitHub/lzxreaderformobile/src/styles/themes.ts)）：light/dark 两套
- `CodeTheme`：4 种代码主题（github/monokai/vs/androidstudio）
- `readerStore.ts`：zustand 持久化 theme/fontSize/codeTheme

### 不存在的能力
- YAML frontmatter 解析：无
- LaTeX 数学公式：无
- Mermaid 图表：无（`mermaid` 代码块会被当普通代码处理）

## react-native-marked@6.0.7 API 要点

### 版本选择
- RN 0.76+ → 最新版 8.x
- **RN 0.75 及以下 → v6**（本项目 RN 0.74.5，用 `react-native-marked@6.0.7`）

### 组件 Props
| Prop | 类型 | 说明 |
|------|------|------|
| `value` | `string` | Markdown 文本（注意是 value 不是 children） |
| `styles` | `MarkedStyles` | 样式对象 |
| `theme` | `UserTheme` | 主题颜色 |
| `renderer` | `RendererInterface` | 自定义渲染器 |
| `flatListProps` | `Omit<FlatListProps, 'data'\|'renderItem'\|'horizontal'>` | FlatList 配置 |
| `tokenizer` | `MarkedTokenizer` | 自定义 tokenizer |

### RendererInterface 可覆写方法
```typescript
interface RendererInterface {
  paragraph(children, styles?): ReactNode;
  blockquote(children, styles?): ReactNode;
  heading(text, styles?, depth?): ReactNode;
  code(text, language?, containerStyle?, textStyle?): ReactNode;  // 代码块
  hr(styles?): ReactNode;
  listItem(children, styles?): ReactNode;
  list(ordered, li, listStyle?, textStyle?, startIndex?): ReactNode;
  escape(text, styles?): ReactNode;
  link(children, href, styles?, title?): ReactNode;
  image(uri, alt?, style?, title?): ReactNode;
  strong(children, styles?): ReactNode;
  em(children, styles?): ReactNode;
  codespan(text, styles?): ReactNode;  // 行内代码
  br(): ReactNode;
  del(children, styles?): ReactNode;
  text(text, styles?): ReactNode;
  html(text, styles?): ReactNode;  // HTML 被当作纯文本
  linkImage(href, imageUrl, alt?, style?, title?): ReactNode;
  table(header, rows, tableStyle?, rowStyle?, cellStyle?): ReactNode;
}
```

### 自定义渲染器用法
```typescript
import { Renderer } from 'react-native-marked';

class CustomRenderer extends Renderer {
  code(text, language, containerStyle, textStyle) {
    // 返回 ReactNode
  }
  codespan(text, styles) {
    // 返回 ReactNode
  }
}
```

## 改造方案

### 1. 依赖更新

**文件：`package.json`**

```bash
# 卸载旧库
npm uninstall react-native-markdown-display

# 安装新库（v6 兼容 RN 0.74.5）+ react-native-svg
npx expo install react-native-svg
npm install react-native-marked@6.0.7
```

> 注意：用 `npx expo install react-native-svg` 确保 Expo SDK 51 兼容版本自动匹配。

### 2. MarkdownRenderer.tsx 完全重写

**文件：[src/components/Reader/MarkdownRenderer.tsx](file:///c:/Users/11577/Documents/GitHub/lzxreaderformobile/src/components/Reader/MarkdownRenderer.tsx)**

#### 2.1 Props 变更
```typescript
interface MarkdownRendererProps {
  content: string;
  theme: Theme;
  fontSize: number;
  codeTheme: CodeTheme;
  isDark: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;  // 新增：进度跟踪
}
```

#### 2.2 内容预处理
在传入 `react-native-marked` 前，对 `content` 执行三步预处理：
1. **剥离 YAML frontmatter**：正则匹配 `^---\n[\s\S]*?\n---\n` 并移除
2. **转换块级数学公式**：`$$...$$` → ```` ```katex\n...\n``` ````
3. **转换行内数学公式**：`$...$` → `` `$KATEX$...$` ``（用 `$KATEX$` 前缀标记，在 codespan 中识别）

```typescript
function preprocessMarkdown(content: string): string {
  // 1. 剥离 YAML frontmatter
  let result = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  // 2. 块级公式 $$...$$ → katex 代码块
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => `\`\`\`katex\n${math.trim()}\n\`\`\``);
  // 3. 行内公式 $...$ → 带标记的行内代码（避免误匹配金额等）
  result = result.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, math) => `\`$KATEX$${math}\``);
  return result;
}
```

#### 2.3 自定义 Renderer
创建 `CustomMarkdownRenderer` 类继承 `Renderer`，覆写以下方法：

- **`code(text, language, ...)`**：
  - `language === 'mermaid'` → 渲染 `<MermaidBlock code={text} isDark={isDark} />`
  - `language === 'katex'` → 渲染 `<KatexBlock formula={text} isDark={isDark} isBlock />`
  - 其他 → 渲染现有 `<CodeBlock code={text} language={language} codeTheme={codeTheme} isDark={isDark} />`

- **`codespan(text, ...)`**：
  - `text.startsWith('$KATEX$')` → 渲染 `<KatexBlock formula={text.slice(7)} isDark={isDark} isBlock={false} />`
  - 其他 → 调用 `super.codespan()` 走默认渲染

> Renderer 实例需要持有 `codeTheme`、`isDark` 等闭包变量，在构造函数中传入。

#### 2.4 样式映射
将现有 `mdStyle`（react-native-markdown-display 格式）映射为 `MarkedStyles`（react-native-marked 格式）。键名基本一致，但需要注意：
- `react-native-marked` 的 `MarkedStyles` 包含 `heading1~6`、`paragraph`、`strong`、`em`、`del`、`link`、`codespan`、`code`、`blockquote`、`list`、`listItem`、`table`、`th`、`td`、`hr`、`image` 等
- 颜色全部从 `theme.*` 取值，保持与现有主题一致

#### 2.5 FlatList 集成
```tsx
<Markdown
  value={processedContent}
  styles={markedStyles}
  renderer={renderer}
  flatListProps={{
    onScroll,
    scrollEventThrottle: 16,
    contentContainerStyle: { padding: 16 },
    showsVerticalScrollIndicator: false,
  }}
/>
```

不再需要外层 `ScrollView` 和 `View` 容器。

### 3. ReaderContent.tsx 调整

**文件：[src/components/Reader/ReaderContent.tsx](file:///c:/Users/11577/Documents/GitHub/lzxreaderformobile/src/components/Reader/ReaderContent.tsx)**

#### 变更点
`case 'markdown'` 分支：移除外层 `<ScrollView>`，直接渲染 `<MarkdownRenderer>`，将 `onScroll` 回调传入：

```tsx
case 'markdown':
  return (
    <MarkdownRenderer
      content={currentFile.content}
      theme={theme}
      fontSize={fontSize}
      codeTheme={codeTheme}
      isDark={isDark}
      onScroll={(e) => {
        setScrollOffset(e.nativeEvent.contentOffset.y);
        setContentHeight(e.nativeEvent.contentSize.height);
        setScrollHeight(e.nativeEvent.layoutMeasurement.height);
      }}
    />
  );
```

`code` 和 `text` 分支保持不变。

### 4. markdownHelper.ts 扩展

**文件：[src/utils/markdownHelper.ts](file:///c:/Users/11577/Documents/GitHub/lzxreaderformobile/src/utils/markdownHelper.ts)**

新增两个函数（保留现有 `generateCodeHtml`、`getHighlightThemeUrl`、`getHighlightBgColor`、`escapeHtml`、`CODE_THEME_OPTIONS`）：

#### 4.1 `generateMermaidHtml(code, isDark)`
生成包含 mermaid.js CDN 的完整 HTML，用于 WebView 渲染流程图/序列图/甘特图等。

```typescript
export function generateMermaidHtml(code: string, isDark: boolean): string {
  const theme = isDark ? 'dark' : 'default';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body { margin:0; padding:8px; background:transparent; display:flex; justify-content:center; }
    .mermaid { font-size:14px; }
  </style>
</head>
<body>
  <div class="mermaid">${escapeHtml(code)}</div>
  <script>
    mermaid.initialize({ startOnLoad:true, theme:'${theme}' });
  </script>
</body>
</html>`;
}
```

#### 4.2 `generateKatexHtml(formula, isDark, isBlock)`
生成包含 KaTeX CDN 的完整 HTML，用于 WebView 渲染数学公式。

```typescript
export function generateKatexHtml(formula: string, isDark: boolean, isBlock: boolean): string {
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
    body { margin:0; padding:4px; background:transparent; color:${textColor}; font-size:16px; }
    .formula { display:flex; justify-content:center; }
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
    } catch(e) {}
  </script>
</body>
</html>`;
}
```

### 5. 新增组件

#### 5.1 MermaidBlock 组件
**文件：`src/components/MermaidBlock/MermaidBlock.tsx`**

```typescript
interface MermaidBlockProps {
  code: string;
  isDark: boolean;
}
```
- 用 `WebView` 渲染 `generateMermaidHtml(code, isDark)`
- 结构与 `CodeBlock` 类似：`View` 容器 + `WebView`，`React.memo` 优化
- `minHeight: 100`，`borderRadius: 8`

#### 5.2 KatexBlock 组件
**文件：`src/components/KatexBlock/KatexBlock.tsx`**

```typescript
interface KatexBlockProps {
  formula: string;
  isDark: boolean;
  isBlock: boolean;
}
```
- 用 `WebView` 渲染 `generateKatexHtml(formula, isDark, isBlock)`
- 块级公式：`marginVertical: 8`，居中
- 行内公式：`display: 'inline-flex'`，无额外 margin

### 6. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 移除 markdown-display，添加 marked@6.0.7 + react-native-svg |
| `src/components/Reader/MarkdownRenderer.tsx` | 重写 | 迁移到 react-native-marked，预处理+自定义渲染器 |
| `src/components/Reader/ReaderContent.tsx` | 修改 | 移除 markdown 分支的 ScrollView，传 onScroll |
| `src/utils/markdownHelper.ts` | 扩展 | 新增 generateMermaidHtml、generateKatexHtml |
| `src/components/MermaidBlock/MermaidBlock.tsx` | 新建 | Mermaid WebView 渲染组件 |
| `src/components/KatexBlock/KatexBlock.tsx` | 新建 | KaTeX WebView 渲染组件 |

### 7. 不变的部分

- `CodeBlock.tsx` — 代码高亮逻辑不变，仍通过 WebView + highlight.js CDN
- `CodeRenderer.tsx` — 独立代码文件渲染不变
- `TextRenderer.tsx` — 纯文本渲染不变
- `themes.ts` — 主题定义不变
- `readerStore.ts` — 状态管理不变
- `fileHelper.ts` — 文件类型判断不变
- `SettingsPanel.tsx` — 设置面板不变
- `types/index.ts` — 类型定义不变

## 假设与决策

1. **版本锁定 v6**：RN 0.74.5 < 0.76，必须用 `react-native-marked@6.0.7`，不用最新 v8
2. **LaTeX 通过预处理实现**：`react-native-marked` 的 RendererInterface 不支持自定义 token 类型，所以通过预处理将 `$...$` / `$$...$$` 转换为特殊代码块/行内代码，在 renderer 中识别处理
3. **Mermaid 通过 code() 覆写实现**：检测 `language === 'mermaid'` 时渲染 MermaidBlock 而非 CodeBlock
4. **HTML 内嵌标签**：`react-native-marked` 将 HTML 当作纯文本处理，这是库的设计决策，不做额外处理
5. **FlatList 替代 ScrollView**：`react-native-marked` 内部使用 FlatList 虚拟滚动，移除 `ReaderContent` 中 markdown 分支的外层 ScrollView，通过 `flatListProps.onScroll` 保持进度跟踪
6. **行内公式标记**：用 `$KATEX$` 前缀在 codespan 中识别行内公式，避免与普通行内代码冲突
7. **CDN 依赖**：Mermaid 和 KaTeX 均通过 CDN 加载，与现有 highlight.js CDN 策略一致

## 验证步骤

1. **安装依赖**：`npx expo install react-native-svg` + `npm install react-native-marked@6.0.7` + `npm uninstall react-native-markdown-display`
2. **TypeScript 编译**：`npx tsc --noEmit` 确保无类型错误
3. **启动 Expo**：`npx expo start` 确保无运行时错误
4. **功能测试**：
   - 普通 Markdown（标题、列表、表格、链接、图片、引用、代码块）正常渲染
   - 主题切换（light/dark）样式正确联动
   - 字体大小调整生效
   - 代码主题切换生效（github/monokai/vs/androidstudio）
   - 阅读进度条正常工作
   - YAML frontmatter 被正确剥离（不显示 `---` 头部）
   - LaTeX 块级公式 `$$E=mc^2$$` 正常渲染
   - LaTeX 行内公式 `$E=mc^2$` 正常渲染
   - Mermaid 图表 ` ```mermaid ` 正常渲染
   - 长文档滚动流畅（FlatList 虚拟滚动）
