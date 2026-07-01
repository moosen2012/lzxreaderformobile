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

应用包含两个主要页面：

1. **HomeScreen（首页）**：文件列表页面，用于展示和管理本地文件
2. **ReaderScreen（阅读器）**：文件内容展示页面，支持 Markdown 渲染和代码高亮

## 3. 技术栈

- 框架：React Native + Expo
- 导航：React Navigation (native-stack)
- 状态管理：Zustand
- Markdown 渲染：react-native-markdown-display
- 代码高亮：highlight.js + WebView
- 文件操作：react-native-document-picker + react-native-fs

## 4. 响应式布局

| 设备类型 | 布局方式 | 宽度分配 |
|----------|----------|----------|
| 手机 (< 600px) | 堆叠布局 | 全屏 |
| 小平板 (600-768px) | 分屏/堆叠可选 | 可配置 |
| 平板 (>= 768px) | 分屏布局 | 列表 30% / 阅读器 70% |

## 5. 文档索引

- [首页功能详细设计](./home-screen.md)
- [阅读器页面功能详细设计](./reader-screen.md)
