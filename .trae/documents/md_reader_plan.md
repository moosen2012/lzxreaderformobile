# React Native MD/代码阅读器 - 实现计划

## 1. 项目概述

### 1.1 目标
开发一个支持 Android/iOS 手机和平板电脑的 Markdown/代码阅读器应用。

### 1.2 核心功能
- 本地文件读取（.md, .txt, .js, .ts, .py, .go 等代码文件）
- Markdown 渲染（标题、列表、表格、代码块等）
- 代码语法高亮
- 深色/浅色主题切换
- 文件列表导航
- 平板分屏布局支持

---

## 2. 技术选型

### 2.1 框架选择

| 方案 | 优点 | 缺点 | 决策 |
|------|------|------|------|
| Expo | 快速开发，内置大量 API，无需原生配置 | 某些原生模块受限 | ✅ 推荐 |
| 裸机 React Native | 完全自定义，原生模块无限制 | 配置复杂，开发周期长 | ❌ |

**理由**：阅读器应用核心依赖文件读取和 WebView，这些 Expo 均支持。使用 Expo Dev Client 可满足自定义需求。

### 2.2 核心依赖

| 依赖 | 用途 | 版本 |
|------|------|------|
| `react-native` | 核心框架 | ^0.74.x |
| `expo` | Expo SDK | ^51.x |
| `@react-navigation/native` | 导航 | ^6.x |
| `@react-navigation/native-stack` | 堆栈导航 | ^6.x |
| `react-native-markdown-display` | Markdown 渲染 | ^7.x |
| `highlight.js` | 代码语法高亮 | ^11.x |
| `react-native-document-picker` | 文件选择 | ^9.x |
| `react-native-fs` | 文件系统操作 | ^2.x |
| `zustand` | 状态管理 | ^4.x |
| `react-native-responsive-screen` | 响应式布局 | ^1.x |

### 2.3 渲染策略

**Markdown**：使用 `react-native-markdown-display` 进行原生渲染，性能更好。

**代码高亮**：由于 React Native 原生对复杂代码高亮支持有限，采用以下方案：
- 普通代码块：使用 `highlight.js` + WebView 渲染
- 行内代码：使用原生 Text 组件 + 样式

---

## 3. 应用架构

### 3.1 目录结构

```
src/
├── components/          # 可复用组件
│   ├── FileList/        # 文件列表组件
│   ├── Reader/          # 阅读器组件
│   ├── CodeBlock/       # 代码块组件
│   └── ThemeToggle/     # 主题切换组件
├── screens/             # 屏幕页面
│   ├── HomeScreen/      # 首页（文件列表）
│   └── ReaderScreen/    # 阅读器页面
├── store/               # 状态管理
│   └── readerStore.ts   # 阅读器状态
├── utils/               # 工具函数
│   ├── fileHelper.ts    # 文件操作工具
│   └── markdownHelper.ts # Markdown 处理工具
├── hooks/               # 自定义 Hooks
│   └── useFilePicker.ts # 文件选择 Hook
├── styles/              # 样式文件
│   ├── themes.ts        # 主题定义
│   └── global.ts        # 全局样式
└── App.tsx              # 应用入口
```

### 3.2 状态管理 (Zustand)

```typescript
interface ReaderState {
  files: FileItem[];           // 文件列表
  currentFile: FileItem | null; // 当前文件
  theme: 'light' | 'dark';      // 主题
  fontSize: number;             // 字体大小
  bookmarks: string[];          // 书签列表
  addFile: (file: FileItem) => void;
  setCurrentFile: (file: FileItem | null) => void;
  toggleTheme: () => void;
  setFontSize: (size: number) => void;
  toggleBookmark: (fileId: string) => void;
}
```

### 3.3 导航结构

```
HomeScreen (文件列表)
    │
    └── ReaderScreen (阅读器)
```

- **手机**：堆栈导航，点击文件进入阅读器
- **平板**：分屏布局，左侧文件列表，右侧阅读器

---

## 4. 响应式布局策略

### 4.1 设备判断

```typescript
import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const isTablet = width >= 768;
export const isSmallTablet = width >= 600 && width < 768;
```

### 4.2 布局适配

| 设备 | 布局方式 | 宽度分配 |
|------|----------|----------|
| 手机 (< 600px) | 堆叠布局 | 全屏 |
| 小平板 (600-768px) | 分屏/堆叠可选 | 可配置 |
| 平板 (>= 768px) | 分屏布局 | 列表 30% / 阅读器 70% |

### 4.3 分屏实现

使用 `react-native-split-view` 或自定义 Flex 布局实现：

```typescript
<View style={{ flex: 1, flexDirection: 'row' }}>
  <View style={{ width: isTablet ? '30%' : '100%' }}>
    <FileList />
  </View>
  {isTablet && (
    <View style={{ width: '70%' }}>
      <Reader />
    </View>
  )}
</View>
```

---

## 5. 功能阶段规划

### 5.1 MVP (第一阶段)

- [x] 项目初始化
- [x] 文件选择功能
- [x] Markdown 基础渲染
- [x] 文件列表展示
- [x] 深色/浅色主题

### 5.2 V2 (第二阶段)

- [ ] 代码语法高亮
- [ ] 字体大小调整
- [ ] 文件历史记录
- [ ] 平板分屏布局

### 5.3 V3 (第三阶段)

- [ ] 书签功能
- [ ] 搜索功能
- [ ] 文件夹支持
- [ ] 分享功能

---

## 6. 关键实现细节

### 6.1 文件读取流程

```
用户选择文件 → DocumentPicker 返回文件 URI → RNFS 读取文件内容 → 解析文件类型 → 渲染
```

```typescript
const handleFilePick = async () => {
  const result = await DocumentPicker.pick({
    type: [DocumentPicker.types.allFiles],
  });
  
  const content = await RNFS.readFile(result.uri, 'utf8');
  const fileItem = {
    id: result.uri,
    name: result.name,
    type: getFileType(result.name),
    content,
  };
  
  store.addFile(fileItem);
  store.setCurrentFile(fileItem);
};
```

### 6.2 Markdown 渲染

使用 `react-native-markdown-display` 自定义样式：

```typescript
<Markdown
  style={{
    heading1: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
    heading2: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
    codeBlock: { fontFamily: 'Menlo', fontSize: 14, backgroundColor: '#f4f4f4' },
    // ... 更多样式
  }}
>
  {content}
</Markdown>
```

### 6.3 代码高亮实现

使用 WebView 包裹 highlight.js：

```typescript
<WebView
  source={{
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
        <script>hljs.highlightAll();</script>
        <style>
          body { background: transparent; padding: 16px; font-family: monospace; }
          pre { margin: 0; overflow-x: auto; }
        </style>
      </head>
      <body><pre><code class="language-${language}">${escapedCode}</code></pre></body>
      </html>
    `,
  }}
  style={{ flex: 1 }}
  scrollEnabled={false}
/>
```

---

## 7. 风险与处理

| 风险 | 影响 | 处理方案 |
|------|------|----------|
| iOS 文件权限 | 无法读取某些目录 | 使用 DocumentPicker，用户手动选择 |
| 大文件性能 | 内存占用高 | 限制文件大小，或使用分页加载 |
| 代码高亮性能 | WebView 渲染较慢 | 缓存渲染结果，优化 WebView 配置 |
| 平板适配复杂 | 布局兼容性问题 | 使用响应式库，多设备测试 |

---

## 8. 实施步骤

### 步骤 1: 项目初始化

```bash
npx create-expo-app@51.0.0 . --template react-native-ts
npm install
```

### 步骤 2: 安装依赖

```bash
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-markdown-display highlight.js
npm install react-native-document-picker react-native-fs
npm install zustand react-native-responsive-screen
npx pod-install
```

### 步骤 3: 配置导航

创建导航配置文件，设置主题支持。

### 步骤 4: 实现文件选择

创建 `useFilePicker` Hook 和文件列表组件。

### 步骤 5: 实现阅读器

创建 Markdown 渲染组件和代码高亮组件。

### 步骤 6: 实现主题切换

配置深色/浅色主题，应用全局样式。

### 步骤 7: 平板适配

实现响应式布局，添加分屏支持。

### 步骤 8: 测试与优化

多设备测试，性能优化，bug 修复。

---

## 9. 预期输出

- 完整的 React Native 项目结构
- 可编译运行的 Android/iOS 应用
- 支持 Markdown 和代码文件的阅读
- 手机和平板的自适应布局
- 深色/浅色主题切换功能
