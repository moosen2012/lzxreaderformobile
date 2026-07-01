# ReaderScreen（阅读器）功能详细设计

## 1. 页面概述

阅读器页面是应用的核心页面，用于展示文件内容，支持 Markdown 渲染和代码语法高亮。

## 2. 线框图

### 2.1 手机布局

```
+------------------------------------------+
|  [← 返回]  readme.md        [收藏] [设置] |
+------------------------------------------+
|                                          |
|  # 这是一级标题                          |
|                                          |
|  这是一段普通文本，支持 **粗体** 和       |
|  *斜体* 等基本格式。                      |
|                                          |
|  ## 二级标题                             |
|                                          |
|  - 列表项1                               |
|  - 列表项2                               |
|  - 列表项3                               |
|                                          |
|  ```javascript                          |
|  function hello() {                     |
|    console.log('Hello World');          |
|  }                                      |
|  ```                                    |
|                                          |
+------------------------------------------+
```

### 2.2 平板布局（分屏模式）

```
+-------------------+------------------------------------------+
|                   |  [← 返回]  readme.md    [收藏] [设置]     |
|  📄 readme.md     +------------------------------------------+
|  📄 index.js      |                                          |
|  📄 app.py        |  # 这是一级标题                          |
|                   |                                          |
|                   |  这是一段普通文本，支持 **粗体** 和       |
|                   |  *斜体* 等基本格式。                      |
|                   |                                          |
+-------------------+------------------------------------------+
```

## 3. 数据模型

### 3.1 渲染状态接口

```typescript
interface RenderState {
  isLoading: boolean;        // 是否正在加载
  error: string | null;      // 错误信息
  content: string;           // 原始内容
  renderedContent: string;   // 渲染后的内容（HTML）
  language: string;          // 代码语言（如果是代码文件）
  scrollPosition: number;    // 滚动位置
}
```

## 4. 功能详细说明

### 4.1 文件内容渲染

**Markdown 渲染**：
- 使用 `react-native-markdown-display` 组件
- 支持标题、列表、表格、链接、图片等基础 Markdown 语法
- 自定义样式以匹配应用主题

**代码高亮**：
- 使用 `highlight.js` + WebView 实现
- 支持 100+ 编程语言的语法高亮
- 根据文件扩展名自动检测语言
- 提供多种代码主题（github, monokai, vs 等）

**纯文本渲染**：
- 直接显示文本内容
- 保留原始格式和换行

### 4.2 工具栏功能

**返回按钮**：
- 返回上一页（文件列表）
- 保存当前阅读进度

**收藏按钮**：
- 切换当前文件的收藏状态
- 更新状态管理中的 bookmarks 数组

**设置按钮**：
- 打开设置面板
- 调整字体大小
- 切换代码主题
- 切换深色/浅色主题

### 4.3 阅读进度管理

**自动保存**：
- 监听滚动事件，记录当前滚动位置
- 切换文件时自动保存进度
- 应用重启时恢复阅读进度

**进度指示器**：
- 显示当前阅读百分比
- 提供快速跳转功能

## 5. 数据运转流程

### 5.1 文件加载流程

```
从状态管理获取 currentFile
    ↓
检查文件内容是否已加载
    ↓
如果未加载 → 调用 RNFS.readFile() 读取文件
    ↓
根据文件类型选择渲染器
    ↓
如果是 Markdown → 使用 Markdown 组件渲染
    ↓
如果是代码 → 使用 highlight.js + WebView 渲染
    ↓
如果是文本 → 直接显示内容
    ↓
更新渲染状态，显示内容
```

### 5.2 主题切换流程

```
用户点击设置按钮
    ↓
打开设置面板
    ↓
切换主题选项（浅色/深色）
    ↓
更新状态管理中的 theme 状态
    ↓
重新渲染组件，应用新主题样式
    ↓
如果是代码块 → 切换代码主题
    ↓
保存用户偏好设置
```

### 5.3 字体大小调整流程

```
用户在设置面板中调整字体大小
    ↓
更新状态管理中的 fontSize 状态
    ↓
重新渲染组件，应用新字体大小
    ↓
保存用户偏好设置
```

### 5.4 收藏功能流程

```
用户点击收藏按钮
    ↓
检查当前文件是否已在收藏列表中
    ↓
如果已收藏 → 从 bookmarks 数组移除
    ↓
如果未收藏 → 添加到 bookmarks 数组
    ↓
更新状态管理
    ↓
切换收藏按钮图标状态
```

## 6. 组件结构

```
ReaderScreen
├── Header
│   ├── BackButton
│   ├── FileName
│   ├── BookmarkButton
│   └── SettingsButton
├── ContentArea
│   ├── MarkdownRenderer (条件渲染)
│   ├── CodeRenderer (条件渲染)
│   └── TextRenderer (条件渲染)
├── SettingsPanel (条件渲染)
│   ├── FontSizeControl
│   ├── CodeThemeSelector
│   └── ThemeToggle
└── ProgressBar (可选)
```

## 7. 样式设计

### 7.1 Markdown 样式

**标题样式**：
```typescript
heading1: {
  fontSize: 24,
  fontWeight: 'bold',
  marginBottom: 16,
  marginTop: 24,
}
heading2: {
  fontSize: 20,
  fontWeight: 'bold',
  marginBottom: 12,
  marginTop: 20,
}
```

**代码块样式**：
```typescript
codeBlock: {
  fontFamily: 'Menlo',
  fontSize: 14,
  backgroundColor: '#f4f4f4',
  padding: 12,
  borderRadius: 8,
  marginBottom: 16,
}
```

### 7.2 代码高亮样式

**WebView 容器样式**：
```typescript
codeContainer: {
  flex: 1,
  backgroundColor: 'transparent',
  marginBottom: 16,
}
```

**代码主题选择**：
- github（浅色）
- monokai（深色）
- vs（浅色）
- androidstudio（深色）

### 7.3 颜色主题

**浅色主题**：
- 背景色：#FFFFFF
- 文字色：#000000
- 代码背景色：#F6F8FA
- 链接色：#0366D6

**深色主题**：
- 背景色：#1E1E1E
- 文字色：#D4D4D4
- 代码背景色：#2D2D2D
- 链接色：#4493F8

## 8. 性能优化

### 8.1 内容缓存

- 已渲染的内容进行缓存，避免重复渲染
- 切换文件时优先使用缓存内容

### 8.2 WebView 优化

- 预加载 WebView，减少首次渲染时间
- 复用 WebView 实例，避免重复创建
- 使用 `injectedJavaScript` 而非 `source` 更新内容

### 8.3 滚动优化

- 使用 `onScroll` 事件节流，减少状态更新频率
- 使用 `FlatList` 渲染长文档，实现虚拟滚动

## 9. 错误处理

### 9.1 文件读取错误

- 文件不存在：显示错误提示，返回文件列表
- 文件权限不足：提示用户授权或选择其他文件
- 文件编码错误：尝试使用 UTF-8 编码读取

### 9.2 渲染错误

- Markdown 语法错误：显示原始文本
- 代码语言不支持：使用纯文本显示
- WebView 加载失败：回退到原生渲染

## 10. 无障碍设计

- 所有按钮添加 `accessibilityLabel`
- 内容区域添加 `accessibilityRole="text"`
- 支持屏幕阅读器朗读内容
- 提供高对比度模式
