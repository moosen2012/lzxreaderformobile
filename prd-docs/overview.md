# React Native MD/代码阅读器 - 产品需求文档

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

## 2. 页面结构

应用已是**单页文件浏览器**结构（原「列表页 → 阅读器页」两页结构已合并，详见 `file-browser.md`）：

1. **HomeScreen（文件浏览器）**：左侧目录树 + 右侧目录内容／文件内容，侧栏可收起
   - 宽屏（≥768）：左右双栏并排
   - 窄屏（<768）：目录树为抽屉浮层，右栏占满，物理返回键按「关抽屉 → 退出阅读 → 退出 app」优先级处理
   - 原 `ReaderScreen` 路由已删除；`components/FileList/*` 已被 `components/Browser/*` 取代

## 3. 技术栈

- 框架：React Native + Expo (SDK 51)
- 导航：React Navigation (native-stack)
- 状态管理：Zustand（persist + AsyncStorage）
- Markdown 渲染：react-native-marked（自定义 Renderer）
- 代码高亮：highlight.js（按需注册语言，预高亮后交给 WebView 渲染）
- 公式渲染：MathJax (mathjax-full, liteAdaptor) 在 JS 侧输出 SVG → react-native-svg 绘制，**无 WebView、无 CDN 依赖**
- 图表渲染：Mermaid（WebView + 高度自适应，依赖 CDN，Web 端降级为源码）
- 文件操作：expo-document-picker + expo-file-system（导入文件复制到 documentDirectory/library 长期保存）

## 3.1 质量工具链

| 命令 | 作用 |
|------|------|
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | Markdown 预处理 + 公式渲染回归测试（纯 Node，无需模拟器） |
| `npm run lint` | ESLint（expo 规则 + hooks 规则） |
| `npm run format` | Prettier 格式化 |
| `npm run verify` | 以上三项串联，提交前跑这一条即可 |

## 4. 响应式布局

| 设备类型 | 布局方式 | 宽度分配 |
|----------|----------|----------|
| 手机 (< 600px) | 堆叠布局 | 全屏 |
| 小平板 (600-768px) | 分屏/堆叠可选 | 可配置 |
| 平板 (>= 768px) | 分屏布局 | 列表 30% / 阅读器 70% |

## 5. 文档索引

- [首页功能详细设计](./home-screen.md)
- [阅读器页面功能详细设计](./reader-screen.md)
