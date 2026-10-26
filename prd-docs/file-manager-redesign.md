# 目录导入只能一级 + 移动端文件管理器改造分析

> 状态：**P0/P1 已实施**（P0：方案 A 自研本地 Expo Module；P1：四档布局/三栏/选择模式/操作单/排序视图/重新授权/iOS 多选）。P2 仍为设计稿。
> 涉及范围：导入链路、数据模型、store、布局断点、交互语义
> 配套线框图：`prd-docs/wireframes/file-manager-wireframes.html`（浏览器打开）
>
> 实施记录见文末 §13。

---

## 0. 结论摘要

| 问题 | 结论 |
|---|---|
| 为什么只导入一级 | **不是** `MAX_DEPTH=10` 或 `MAX_IMPORT_FILES=200` 的锅。`FileSystem.getInfoAsync()` 对 `content://`（SAF）条目永远返回 `isDirectory: false` 或 `exists: false`，子目录在收集阶段就被当成"不支持的文件"丢弃了 |
| 只修 `isDirectory` 判断行不行 | **不行**。`StorageAccessFramework.readDirectoryAsync(子目录uri)` 会解析回用户最初授权的根目录，永远返回根目录内容（expo/expo#20102，官方回复"这就是设计如此"）。必须换一套列目录能力 |
| 能不能做成"像资源管理器" | 能，但不是把 Windows 那套搬过来。要换成 **挂载点 + 节点索引 + 内容懒加载**，并把布局从"宽/窄两档"升级为"四档 + 方向修正" |
| 最大风险 | 需要引入原生列目录能力（自研本地 Expo Module 或 `expo-saf-scan`）。纯 JS 在当前 SDK 51 上无解 |

真实规模参照（用户举例的 `D:\Gitee\lzxwebnovel`，排除 `node_modules`）：

| 指标 | 数值 | 对当前实现的影响 |
|---|---|---|
| `.md` 文件 | 720 个 | 超过 `MAX_IMPORT_FILES=200` → **静默截断**（`useDirectoryImporter.ts:99` 直接 `break`，无提示） |
| 目录数 | 1268 个 | 空目录不产生节点，树里直接消失 |
| 最大层级 | 13 层 | 超过 `MAX_DEPTH=10` → 深目录整体丢失 |
| 实际导入结果 | 根目录下 1 层文件 | 就是用户看到的"只有一级" |

也就是说：**这份文档现在有三重天花板 + 一个根因 bug**，全都要在改造中处理。

---

## 1. 根因分析

### 1.1 第一层：`isDirectory` 对 SAF 永远为 false

`src/hooks/useDirectoryImporter.ts`：

```ts
// :101
const info = await FileSystem.getInfoAsync(entryUri, { size: true });
if (!info.exists) continue;
const decodedName = safeDecode(entryUri.split('%2F').pop() || 'unknown');

// :106   ← 这里对 SAF 子项永远是 false
if (info.isDirectory) {
  await collectNativeEntries(entryUri, childPath, depth + 1, output);
} else {
  if (!isSupportedFile(decodedName)) continue;   // ← 目录名没有扩展名，全部在这里被丢掉
  ...
}
```

`node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/FileSystemModule.kt:112-170` 的实现只对 `file://` 用 `File.isDirectory`：

```kotlin
if (uri.scheme == "file") {
    ... putBoolean("isDirectory", file.isDirectory)
} else if (uri.scheme == "content" || ...) {
    val inputStream = context.contentResolver.openInputStream(uri) ?: throw FileNotFoundException()
    return Bundle().apply {
        putBoolean("exists", true)
        putBoolean("isDirectory", false)   // ← 死值
        ...
    }
}
```

而 `openInputStream()` 对目录 URI 通常直接抛 `FileNotFoundException` → 走 `exists:false` 分支。**两条路都进不去递归分支。**

结论：`collectNativeEntries` 实际只处理了根目录的直接子文件，一层之后全断。这也解释了为什么用户看到的是"只有一级"，而不是"少了几个文件"。

### 1.2 第二层：就算绕过判断，expo 的 SAF 递归也是坏的

`FileSystemModule.kt:401-415`：

```kotlin
AsyncFunction("readSAFDirectoryAsync") { uriStr: String ->
    if (uri.isSAFUri) {
        val file = DocumentFile.fromTreeUri(context, uri)   // ← 关键
        val children = file.listFiles()
        return@AsyncFunction children.map { it.uri.toString() }
    }
}
```

`DocumentFile.fromTreeUri()` 内部走的是 `DocumentsContract.getTreeDocumentId(uri)`，取 `content://auth/tree/<rootDocId>/document/<childDocId>` 中 **`tree/` 后面那一段**——即原始授权的根 documentId。于是传入子目录 URI，解析出来的还是根目录。

上游 issue expo/expo#20102 复现完全一致，维护者回复 "I believe this is how the API is intended to work"。**这是 API 语义，不是 bug，不会在 17.x 里修。**

推论：修好第 1.2 的 `isDirectory` 之后如果继续用 `SAF.readDirectoryAsync(子uri)`，会得到"每一层都重复根目录内容"的诡异结果（而且递归到 `MAX_DEPTH` 或 200 个文件才停）。**两处必须一起换掉。**

### 1.3 第三层：三道静默天花板

| 位置 | 值 | 行为 |
|---|---|---|
| `useDirectoryImporter.ts:10` | `MAX_IMPORT_FILES = 200` | 超过直接 `break`，无任何提示 |
| `useDirectoryImporter.ts:11` | `MAX_DEPTH = 10` | 超过直接 `return`，整个深目录消失 |
| `useDirectoryImporter.ts:228` | `readAsStringAsync` 全量读内容 | 200 个文件的内容全塞进 `files[]`，再整包 JSON 进 AsyncStorage |

Android AsyncStorage 底层是 SQLite，单条记录有 cursor window 限制（约 2MB）。导入几百个 md 后，持久化写入失败或极慢，表现为"导入完成后重启就没了/卡住"。

### 1.4 第四层：目录模型是"虚拟的"，天生做不出资源管理器

`FolderPane.tsx:190` 自己写着：

> 受限于"文件靠导入"的数据模型，空目录本身不会出现在树里

因为目录节点是 `buildFileTree()` 按 `file.directory` 路径段反推出来的。这意味着：**没有文件的目录不存在**。1268 个目录里只要有空目录，用户看到的结构就和磁盘不一致——这在"文件管理器"预期下是不可接受的。

---

## 2. 现状 vs 目标：差距清单

| 维度 | 现状 | 资源管理器该有的 | 移动端特殊约束 |
|---|---|---|---|
| 导入深度 | 1 层（bug） | 全深度（实测 13 层） | 需设硬上限与超限提示 |
| 导入数量 | 200 静默截断 | 数千级 | 不能全量读内容进内存 |
| 空目录 | 不存在 | 显示为 0 项 | — |
| 内容加载 | 导入时全量读 | 打开时才读 | 需 LRU 缓存 + 失效策略 |
| 目录来源 | 虚拟路径反推 | 真实扫描快照 | SAF 授权可能被系统回收 |
| 布局 | 宽/窄两档（768） | 可调窗格 | 四档 + 横竖屏 + 分屏 |
| 行操作 | 长按弹菜单 | 右键菜单 | 长按 + 行尾 `···`（可发现性） |
| 批量操作 | 无 | 框选/Ctrl 多选 | 长按进"选择模式" |
| 移动文件 | 无 | 拖拽 | 选择模式 + "移动到…" |
| 阅读宽度 | 跟随窗口 | 窗口宽=行长长 | 平板必须限制正文 measure |

---

## 3. 设计原则（移动端 ≠ Windows）

1. **没有右键**：长按 = 上下文菜单，但长按是"隐藏手势"，可发现性差 → 每行右侧常驻 `···`，长按是快捷方式。
2. **没有 hover**：所有"悬停才出现"的控件必须常驻或点击后出现。
3. **没有拖拽精度**：跨目录移动不用拖拽，用"选择模式 → 移动到…"底部弹层选目标目录。
4. **没有多窗口**：靠"三栏"模拟桌面的"树 + 列表 + 预览"并置。
5. **触控最小热区 44×44**，行高不低于 44；箭头与行必须是两个独立热区（这条现有代码已经做对了，`SidebarTree.tsx:180`）。
6. **单手可达区**：主要操作（导入、新建、批量操作）下沉到底部或顶栏右侧，不放屏幕中上部。
7. **返回键即导航**：Android 用户会连按返回，必须逐级退（选择模式 → 抽屉 → 阅读 → 上级目录 → 退出）。
8. **旋转不丢状态**：`AndroidManifest.xml` 已声明 `configChanges="orientation|screenSize"`，Activity 不重建，JS 状态天然保留；要额外保证滚动位置与树展开态不被 layout 切换重置。

---

## 4. 响应式布局体系

### 4.1 现有断点的问题

`src/utils/responsive.ts:27` 只有一个判断：

```ts
const isWide = width >= WIDE_BREAKPOINT; // 768
```

| 设备 | 尺寸(pt) | 现状判定 | 问题 |
|---|---|---|---|
| 手机竖屏 | 390×844 | 窄 | 正常 |
| 手机横屏 | 844×390 | **宽** | 顶栏 52 + 侧栏 280 挤在 390 高度里，正文只剩 338pt 高 |
| 平板竖屏 | 820×1180 | 宽 | 可接受，但侧栏不可调 |
| 平板横屏 | 1280×800 | 宽（两栏） | 浪费 40% 宽度，正文行长超过 100 字符 |
| 分屏/折叠 | 400~600 浮动 | 来回切 | 宽度动画与抽屉动画互相打架 |

`isLandscape` 已经算出来了（`responsive.ts:40`），但**全项目没有一处使用**。

### 4.2 新断点：四档 + 方向修正

以 `width` 定档，以 `height` 修正：

| 档位 | 条件 | 布局 | 典型设备 |
|---|---|---|---|
| **C** Compact | `width < 600` | 单栏 + 抽屉 | 手机竖屏、手机分屏 |
| **M** Medium | `600 ≤ width < 900` | 双栏（树 240，可切 0） | 平板竖屏、手机横屏 |
| **E** Expanded | `900 ≤ width < 1200` | 双栏（树 280） | 小平板横屏、折叠屏展开 |
| **L** Large | `width ≥ 1200` | **三栏**（树 260 + 列表 320 + 阅读） | 大平板横屏 |

方向修正（叠加在档位之上）：

| 规则 | 触发 | 效果 |
|---|---|---|
| 短屏压缩 | `height < 480` | 顶栏 52 → 44；侧栏默认收起；列表行高保持 44（不再压） |
| 横屏沉浸阅读 | `isLandscape && rightPane==='reader'` | 隐藏顶栏，只留浮动返回 + 进度条 |
| 正文限宽 | 阅读区 `width ≥ 700` | 正文 `maxWidth: 780` 居中 |
| 断点防抖 | 宽度变化 < 24pt 内不切换档位 | 避免折叠屏/分屏抖动导致动画重启 |

### 4.3 线框图 · 手机竖屏（C 档）

```
┌───────────────────────────────┐
│  ☰   lzxwebnovel        ···   │  顶栏 52（背景延伸进状态栏）
├───────────────────────────────┤
│ 全部 › docs › 02-架构         │  路径栏 36，可横滑，末段加粗
├───────────────────────────────┤
│ 📁 01-需求              12 项›│
│ 📁 02-架构               8 项›│
│ 📁 03-设计               5 项›│
│ 📄 README.md    4.2 KB   ···  │
│ 📄 overview.md  12 KB    ···  │
│ 📄 notes.md     1.0 KB   ···  │
│                               │
│                               │
├───────────────────────────────┤
│ 3 个文件夹 · 3 个文件          │  状态条 28（可关）
└───────────────────────────────┘
     ↑ 返回键：抽屉关 → 阅读退 → 上一级 → 退出
```

抽屉打开（覆盖 84% 宽，遮罩点击关闭）：

```
┌──────────────┬────────────────┐
│ 目录    720  │░░░░░░░░░░░░░░░░│
│ ▾ 📁 docs    │░░░░░░░░░░░░░░░░│
│   ▸ 01-需求  │░░ 遮  罩 ░░░░░░│
│   ▾ 02-架构  │░░░░░░░░░░░░░░░░│
│     📁 api   │░░░░░░░░░░░░░░░░│
│     📁 data  │░░░░░░░░░░░░░░░░│
│ ▸ 📁 web     │░░░░░░░░░░░░░░░░│
│ 📁 我的文件  │░░░░░░░░░░░░░░░░│
└──────────────┴────────────────┘
   ↑ 点目录 → 导航 + 自动收抽屉；点箭头 → 只展开
```

### 4.4 线框图 · 手机横屏（M 档 + 短屏修正）

宽度够两栏，但高度只有 ~390：侧栏**默认收起**，用一个悬浮按钮而不是常驻 280pt。

```
┌──────────────────────────────────────────────────┐
│ ☰  docs › 02-架构                          ···   │ 44
├──────────────────────────────────────────────────┤
│ 📁 api/     3 项                📄 README.md ··· │
│ 📁 data/    7 项                📄 design.md ··· │
│ 📄 notes.md 1.0 KB                               │
│                                                  │
└──────────────────────────────────────────────────┘
```

横屏沉浸阅读（顶栏隐藏）：

```
┌──────────────────────────────────────────────────┐
│ ‹ 02-架构/README.md                    🔖  ⚙   │ 44 浮动
├──────────────────────────────────────────────────┤
│  # 架构设计                                       │
│  正文按 maxWidth 780 居中，两侧留白               │
│  ▓▓▓▓▓▓▓▓▓░░░░░░ 62%                             │
└──────────────────────────────────────────────────┘
```

### 4.5 线框图 · 平板竖屏（M 档，双栏）

```
┌────────────────────────────────────────────────────────┐
│ ☰  lzxwebnovel                            🔍  ⚙  ··· │
├───────────────────┬────────────────────────────────────┤
│ 目录        720   │ 全部 › docs › 02-架构              │
│ ▾ 📁 docs         │ ──────────────────────────────────  │
│   ▸ 📁 01-需求    │ 📁 api/          3 项           ›  │
│   ▾ 📁 02-架构    │ 📁 data/         7 项           ›  │
│     📁 api        │ 📄 README.md     4.2 KB        ··· │
│     📁 data       │ 📄 design.md     8.1 KB        ··· │
│ ▸ 📁 web          │ 📄 notes.md      1.0 KB        ··· │
│ 📁 我的文件       │                                    │
│                   │                                    │
│ 240（可拖 200-320）│ flex                              │
└───────────────────┴────────────────────────────────────┘
```

### 4.6 线框图 · 平板横屏（L 档，三栏）

这是最接近"桌面资源管理器"的形态，也是平板横屏下唯一不浪费空间的排法。

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ☰  lzxwebnovel                                       🔍   ⚙   ···        │
├──────────────┬──────────────────────┬────────────────────────────────────┤
│ 目录    720  │ 全部 › docs › 02     │  README.md              ‹ ›  ⚙    │
│ ▾ 📁 docs    │ ───────────────────  │ ──────────────────────────────────  │
│   ▸ 01-需求  │ 📁 api/      3 项 >  │  # 架构设计                         │
│   ▾ 02-架构  │ 📁 data/     7 项 >  │                                     │
│     📁 api   │ 📄 README.md  4.2KB  │  正文限宽 780 居中，两侧留白，        │
│     📁 data  │ 📄 design.md  8.1KB  │  行长控制在 60-75 字符               │
│     📁 imgs  │ 📄 notes.md   1.0KB  │                                     │
│ ▸ 📁 web     │                      │                                     │
│ 📁 我的文件  │                      │  ▓▓▓▓▓▓▓░░░░░░ 47%                  │
│              │                      │                                     │
│ 260          │ 320                  │ flex                                │
└──────────────┴──────────────────────┴────────────────────────────────────┘
```

- 未选文件时，第三栏显示占位：「从左侧选择一个文件开始阅读」，**不抢占列表宽度**。
- 列表与阅读区之间加可拖分割线（P2），范围 280–420。

### 4.7 档位切换决策图

```
                     ┌──────────────────┐
                     │ 读取 window 尺寸 │
                     └────────┬─────────┘
                              ▼
                 width < 600 ? ──是──► C 单栏 + 抽屉
                              │否
                              ▼
                 width < 900 ? ──是──► M 双栏（树 240）
                              │否
                              ▼
                width < 1200 ? ──是──► E 双栏（树 280）
                              │否
                              ▼
                                     L 三栏（260/320/阅读）

   叠加修正：height < 480 → 顶栏 44 + 树默认收起 + 阅读时隐藏顶栏
```

---

## 5. 导入流程重做

### 5.1 为什么必须拆成"扫描 / 确认 / 索引"三段

现状是一次性 `getInfo + readAsString` 混在一起，导致：
- 无法在读取前告诉用户"你选了 3412 个文件"；
- 无法取消；
- 内容全量进内存与 AsyncStorage；
- 超限静默截断。

新流程把"目录结构（元数据）"和"文件内容"彻底分开：

| 阶段 | 做什么 | 产物 | UI |
|---|---|---|---|
| ① 扫描 | 只列目录，拿 名称/类型/大小/修改时间/documentId | 节点清单 | 全屏 Modal + 进度 + 取消 |
| ② 确认 | 统计类型分布与体积，超过阈值让用户选范围 | 导入范围 | 底部 Sheet（全部 / 仅 md / 仅当前层） |
| ③ 索引 | 写入 store（不读内容） | `nodes` | 顶部进度条，可后台继续 |

### 5.2 扫描阶段线框

```
① 扫描                          ② 确认                          ③ 索引
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│   正在扫描目录…       │  │ 已找到               │  │ 正在导入              │
│                      │  │  720 个文件          │  │ ▓▓▓▓▓▓▓░░░░░ 43%     │
│   ▓▓▓▓▓▓▓░░░░  42%   │  │  1268 个文件夹        │  │                      │
│                      │  │  最深 13 层          │  │ docs/02-架构/api     │
│ 1,268 个文件夹        │  │  合计 48.2 MB        │  │                      │
│ 3,412 个文件          │  │                      │  │ 312 / 720            │
│                      │  │ 其中可阅读：1,052     │  │                      │
│      [取消]          │  │ [全部导入] [仅 Markdown]│ │      [取消]          │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
     ↑ 实时数字滚动       ↑ 超 500 文件才出现      ↑ 可切后台
```

### 5.3 硬上限与超限提示（不再是静默）

| 常量 | 建议值 | 超限行为 |
|---|---|---|
| `MAX_SCAN_FILES` | 20000 | 停止扫描，弹提示「已达 20000 个文件上限，剩余未导入」，已完成部分保留 |
| `MAX_SCAN_DEPTH` | 32 | 该分支标记 `truncated: true`，目录行显示「层级过深未完全展开」 |
| `MAX_SCAN_MS` | 60000 | 中断并提示 |
| `MAX_READ_SIZE` | 10MB（沿用） | 单文件跳过，计入"跳过清单" |
| 单文件读取失败 | — | 记入 `importReport.errors[]`，完成后可查看 |

### 5.4 目录能力技术选型（核心决策）

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 自研本地 Expo Module** `modules/saf-tree` | Kotlin 用 `DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)` 一次 query 拿齐 `document_id/display_name/mime_type/size/last_modified` | 一次查询一个目录（快）；完全可控；无三方依赖；**保留原始 treeUri → 权限天然正确** | 需要 dev build（项目已有 `android/`，`expo run:android` 本来就不走 Expo Go）；要维护 ~80 行 Kotlin | **推荐** |
| **B. `expo-saf-scan`** | `listAsync(treeUri, { recursive: true })` 直接返回全树（含 `path/isDirectory/size/lastModified`） | 开箱即用；实测 3074 文件 2.6s | 第三方新包，作者小众，长期维护风险；接口需隔离封装 | 备选（可先用来验证） |
| **C. 升级 SDK 54 + 新 `File`/`Directory` API** | `new Directory(uri).list()` | 官方长期方案 | 51→54 跨越过大（RN 0.74→0.81 / React 19 / 多个 native 依赖）；且实测 3074 文件 54.8s | 不推荐（远期） |
| **D. 纯 JS 变通** | 用 `getInfoAsync` + `readDirectoryAsync` 组合 | 无新增依赖 | 已证伪（§1.2），无解 | 排除 |

方案 A 的关键实现（示意，真正落地前需实机验证权限链路）：

```kotlin
// modules/saf-tree/android/src/main/java/expo/modules/saftree/SafTreeModule.kt
AsyncFunction("listChildren") { treeUri: String, documentId: String? ->
  val tree = Uri.parse(treeUri)          // 始终保留用户授权的原始 tree uri
  val parentId = documentId ?: DocumentsContract.getTreeDocumentId(tree)
  val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId)
  context.contentResolver.query(
    childrenUri,
    arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED),
    null, null, null
  )!!.use { c -> /* 逐行映射为 [{documentId,name,isDirectory,size,mtime}] */ }
}
```

> 这一段正是 expo 的实现丢掉的：它用 `DocumentFile.fromTreeUri(childUri)`，把子 documentId 当成了"tree id"解析。我们保留 `treeUri + documentId` 两个参数，就永远在授权范围内。

JS 侧统一接口，实现可替换（web / android / mock）：

```ts
// src/services/saf/types.ts
export interface SafEntry {
  documentId: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  mtime?: number;
}
export interface SafProvider {
  pickDirectory(): Promise<{ treeUri: string; name: string } | null>;
  hasAccess(treeUri: string): Promise<boolean>;
  listChildren(treeUri: string, documentId: string | null): Promise<SafEntry[]>;
  readText(treeUri: string, documentId: string): Promise<string>;
}
```

### 5.5 平台差异（必须写清楚，不能假装一致）

| 平台 | 目录导入 | 树形浏览 | 实现 |
|---|---|---|---|
| **Android** | ✅ SAF，全深度 | ✅ | 方案 A/B；`treeUri` 持久化，重启后 `hasAccess` 校验 |
| **iOS** | ❌ 系统无目录选择器 | ❌（退化为扁平） | `DocumentPicker` 多选（`multiple: true`），全部落"导入"挂载点根；**或** P2 做 Share Extension 支持从「文件」App 分享文件夹（需原生扩展，成本高） |
| **Web** | ✅ `webkitdirectory` | ✅ | 已有实现可用，只需接进新流程、去掉 `>200 整包失败` |

iOS 的现实约束要在 UI 上明说：菜单项文案从「导入目录」在 iOS 上变成「导入文件（多选）」，并提示"如需按目录浏览，请使用 Android 版或桌面版导入后同步"（如果将来有同步）。

### 5.6 授权失效处理

SAF 授权会在以下情况失效：用户清理数据、卸载重装、部分 ROM 在存储重挂载后回收。

- 启动时对每个 `mount.kind === 'saf'` 调 `hasAccess(treeUri)`；
- 失败 → 该挂载点整体置灰，行尾显示「⚠ 需要重新授权」；
- 点击 → `requestDirectoryPermissionsAsync(initialUri)`，**尽量让用户选回同一目录**，成功后按路径匹配重建索引，而不是重扫（避免丢失书签）。

---

## 6. 数据模型改造

### 6.1 现状

```ts
// 唯一真实数据源：文件内容 + 一个相对路径字符串
interface FileItem {
  id: string; name: string; type: FileType;
  content: string;         // 导入时全量读入，并整包持久化
  uri: string; size?: number; lastModified?: number; addedAt: number;
  directory?: string;      // 'docs/02-架构'
}
```

目录树完全由 `directory` 路径段反推 → 空目录不存在、无法表达"已扫描但未展开"、无法做懒加载。

### 6.2 新模型：挂载点 + 节点索引

```ts
// 挂载点：一个导入的目录（SAF）或应用内部库
interface Mount {
  id: string;
  name: string;                 // 'lzxwebnovel'
  kind: 'saf' | 'internal' | 'web';
  treeUri: string | null;       // SAF tree uri；internal 为 null
  addedAt: number;
  lastScanAt: number;
  truncated?: boolean;          // 触达上限
}

// 索引节点：目录和文件统一，路径可拼、可按需加载子项
interface LibraryNode {
  id: string;                   // `${mountId}:${relPath}`（迁移时沿用旧 fileId 保书签）
  mountId: string;
  path: string;                 // 相对挂载点的路径，'' = 挂载点根
  name: string;
  kind: 'dir' | 'file';
  documentId?: string;          // SAF 子项 documentId，读取内容用
  size?: number;
  mtime?: number;
  childrenCount?: number;       // 目录子项数，未展开也能显示
  loaded?: boolean;             // 子项是否已加载（懒加载）
  fileType?: FileType;          // 仅文件
}
```

store 形态：

```ts
interface LibraryState {
  mounts: Mount[];
  nodes: Record<string, LibraryNode>;   // 扁平字典，O(1) 查找
  childIndex: Record<string, string[]>; // dirPath -> 子节点 id 数组（已排序）
  contentCache: Record<string, string>; // 仅内存 LRU，3-5 条
}
```

好处：
- 空目录天然存在（`childIndex['docs/empty'] = []`）；
- 5000 文件只是 5000 个字典项，不进 UI，树/列表按 `childIndex` 取切片；
- 内容不再进持久化层。

### 6.3 内容读取策略

```
打开文件 → contentCache 命中？ ──是──► 直接渲染
                 │否
                 ▼
         saf.readText(treeUri, documentId)
                 │
        ┌────────┴─────────┐
       成功                失败
        │                   │
  写入 LRU 缓存        行标记为「无法读取」
  渲染                 （可能是文件被删/权限失效）
```

- 原生：不入持久化，冷启动不预读；
- Web：无持久 uri，`File` 句柄不可跨会话 → 保留 `content` 于内存，刷新后需重新导入（现状如此，可接受）；
- 可选磁盘缓存：`cache/` 下按 `documentId + mtime` 哈希，P2 再做。

### 6.4 持久化（persist v3）

现状 `partialize` 把 `files`（含 content）整包塞 AsyncStorage（web 端尤其危险）。新方案：

| 数据 | 存储 | 理由 |
|---|---|---|
| `theme/fontSize/codeTheme/sidebarOpen/expandedPaths` | AsyncStorage（小） | 少量键值 |
| `mounts` + `nodes` + `childIndex` | `FileSystem.documentDirectory + 'library/index.json'` | 数千节点 ≈ 3-5MB，避开 SQLite 单条上限；可原子写（tmp → rename） |
| 阅读进度 / 书签 | AsyncStorage | 小 |

迁移 v2 → v3：

```ts
if (version < 3) {
  const mount: Mount = { id: 'legacy', name: '我的文件', kind: 'internal', treeUri: null, addedAt: Date.now(), lastScanAt: Date.now() };
  for (const f of state.files ?? []) {
    const path = [normalizePath(f.directory), f.name].filter(Boolean).join('/');
    nodes[f.id] = { id: f.id, mountId: 'legacy', path, name: f.name, kind: 'file', size: f.size, mtime: f.lastModified, fileType: f.type };
    // 同时把 ancestors 补齐进 childIndex
  }
}
```

**节点 id 必须沿用旧 `file.id`**，否则 `bookmarks` / `recentFiles` 全部失效。

---

## 7. 交互语义

### 7.1 手势矩阵

| 目标 | 手势 | 行为 |
|---|---|---|
| 文件行 | 单击 | 打开阅读（C 档整屏切换；L 档只换第三栏） |
| 文件行 | 长按 | 进入选择模式并选中该项，顶栏变「已选 1 项」 |
| 文件行 | 行尾 `···` | 操作单：打开 / 收藏 / 重命名 / 移动到… / 删除 / 属性 |
| 目录行 | 单击 | 进入该目录 |
| 目录行 | 行尾 `›` | 同单击（触屏上明确可点） |
| 树节点 | 单击名称 | 导航 |
| 树节点 | 单击箭头 | 只展开/折叠（现有实现已拆开热区，保留） |
| 树节点 | 长按 | 同上操作单（目录版：重命名/移动/删除/重新授权/在列表中打开） |
| 列表顶部 | 下拉 | 重新扫描该目录（SAF 才可用） |
| 选择模式 | 单击行 | 加选/取消 |
| 选择模式 | 顶部 ✕ | 退出选择 |

### 7.2 返回键层级（必须逐级）

```
选择模式 → 抽屉（C 档） → 阅读区 → 上一级目录 → 系统退出
```

现状 `BrowserShell.tsx:60-73` 缺了"上一级目录"这一级——用户在深层目录按返回会直接退 App，这是 C 档最容易踩的坑。

### 7.3 选择模式

```
┌───────────────────────────────┐
│ ✕  已选 3 项        »移动到  🗑 │  ← 顶栏整体替换
├───────────────────────────────┤
│ ☑ 📄 README.md                │
│ ☑ 📁 02-架构                  │
│ ☐ 📄 notes.md                 │
└───────────────────────────────┘
```

- 进入：长按任一文件/目录；
- 批量动作只保留"移动 / 删除 / 收藏"，不做"重命名"（批量重命名属于危险操作，P2 再议）。

### 7.4 操作单（底部 Sheet，不用 ActionSheetIOS）

理由：跨平台一致、可控样式、可放危险项红色分组。

```
┌────────────────────────────────┐
│  README.md                     │
│  4.2 KB · 2026-10-23 14:02     │
├────────────────────────────────┤
│  📖 打开                        │
│  🔖 收藏                        │
│  ✏️  重命名                      │
│  📂 移动到…                     │
├────────────────────────────────┤
│  🗑 删除                   (红) │
└────────────────────────────────┘
```

### 7.5 空态 / 异常态

| 场景 | 文案与操作 |
|---|---|
| 全库为空 | 「还没有文件」+「导入目录（Android）」「导入文件」「试试示例」 |
| 目录为空 | 「这个文件夹是空的」+「刷新」（SAF 可重新扫描，不再说"受限于数据模型"） |
| 权限失效 | 「授权已失效」+「重新授权」 |
| 文件读取失败 | 行内红点 + 「文件可能已被删除或移动」+「移除索引」 |
| 扫描被截断 | 顶部黄条「已达上限，仅导入前 20000 个文件」 |

---

## 8. 文件级改动清单

### 8.1 新增

| 文件 | 职责 |
|---|---|
| `modules/saf-tree/**` | 本地 Expo Module：`listChildren / readText / hasAccess`（Android only，iOS 侧空实现） |
| `src/services/saf/types.ts` | `SafProvider` 接口与 `SafEntry` |
| `src/services/saf/native.ts` | Android 实现（走模块或 `expo-saf-scan`） |
| `src/services/saf/web.ts` | `webkitdirectory` 实现 |
| `src/services/saf/index.ts` | 按平台导出单例 |
| `src/utils/libraryTree.ts` | 纯函数：`insertNodes / getChildren / getBreadcrumbs / moveNode / removeNode / sortEntries`（可 Node 跑测试） |
| `src/utils/libraryStorage.ts` | `index.json` 读写 + 原子替换 + v3 迁移数据组装 |
| `src/hooks/useImportDirectory.ts` | 重写：扫描/确认/索引三段、可取消、超限报告 |
| `src/hooks/useResponsiveLayout.ts` | 四档 + 方向修正 + 防抖 |
| `src/components/Browser/PathBar.tsx` | 可横滑面包屑（深层折叠 `…`） |
| `src/components/Browser/ListToolbar.tsx` | 视图切换 / 排序 / 新建（P2） |
| `src/components/Browser/SelectionBar.tsx` | 选择模式顶栏 |
| `src/components/Browser/EntryRow.tsx` | 统一行（替代 `FolderRow`，加行尾 `···`） |
| `src/components/Browser/ReaderPane.tsx` | 三栏模式下的阅读容器（限宽 780） |
| `src/components/Browser/ImportSheet.tsx` | 扫描进度 / 确认 / 结果报告 |
| `src/components/Actions/FileActionSheet.tsx` | 操作单 |
| `src/components/Actions/MoveTargetSheet.tsx` | 目标目录选择（仅显示目录树） |
| `scripts/test-library-tree.mjs` | 纯函数回归测试（含 13 层深目录、5000 节点、空目录） |

### 8.2 改造

| 文件 | 改动 |
|---|---|
| `src/types/index.ts` | 加 `Mount / LibraryNode / LayoutTier / SafEntry`；`ReaderState` 的 `files` 逐步过渡为 `nodes` |
| `src/store/readerStore.ts` | persist v3；拆分 `libraryStore`（mounts/nodes）与 `uiStore`（布局/展开态）；`openFile` 支持懒加载内容 |
| `src/components/Browser/BrowserShell.tsx` | 四档布局；三栏；横屏沉浸；返回键加"上一级" |
| `src/components/Browser/Sidebar.tsx` / `SidebarTree.tsx` | 树只显示目录（文件在右侧）；读 `childIndex`；懒加载展开；节点过多时分段渲染 |
| `src/components/Browser/FolderPane.tsx` | 读 `getChildren`；行尾 `···`；状态条；下拉刷新 |
| `src/screens/HomeScreen/HomeScreen.tsx` | 顶栏按档位高度；接 `PathBar`；接 `SelectionBar` |
| `src/utils/responsive.ts` | 改为 `useResponsiveLayout()` 返回 `tier + isShort + isLandscape + sidebarWidth` |
| `src/utils/fileHelper.ts` | `buildFileTree` 保留但标 `@deprecated`（迁移期并存），彻底切换后删除 |
| `app.json` | 若要加 `expo-saf-scan` 需 `plugins`；自研模块走 autolinking 无需改 |
| `android/app/src/main/AndroidManifest.xml` | 已是 `screenOrientation="unspecified"`，横竖屏无需改；`READ/WRITE_EXTERNAL_STORAGE` 可按需降级（SAF 不需要） |

### 8.3 删除

`src/components/Browser/FolderRow.tsx`（被 `EntryRow` 取代，迁移完成后）、`src/utils/fileHelper.ts` 中 `buildFileTree`（P2 末）。

---

## 9. 分阶段计划

### P0 · 修根因 + 数据骨架（先让"能导进来"）

1. `services/saf` 抽象 + Android `listChildren`（先接 `expo-saf-scan` 打通链路，或直接自研模块）
2. 重写 `useImportDirectory`：全深度扫描、`MAX_SCAN_FILES=20000`、`MAX_DEPTH=32`、可取消、**不读内容**、超限有提示
3. store v3：`mounts/nodes/childIndex` + 迁移（保住书签/最近）
4. `libraryTree.ts` 纯函数 + 测试（13 层 / 5000 节点 / 空目录三类用例）
5. `SidebarTree` / `FolderPane` 改读 `childIndex`；空目录能显示
6. 内容懒加载 + LRU

**验收口径**：导入 `lzxwebnovel` 的 `docs/`，层级、目录名、文件数与磁盘一致；重启后仍在。

### P1 · 移动端文件管理器交互

7. `useResponsiveLayout`：C/M/E/L 四档 + 短屏/横屏修正 + 防抖
8. `BrowserShell` 三栏布局（L 档）+ 阅读区限宽
9. `PathBar`（深层 `…` 折叠）+ 返回键补"上一级"
10. `EntryRow` 行尾 `···` + `FileActionSheet`
11. 选择模式 + 批量删除/移动（`MoveTargetSheet`）
12. 列表/网格切换 + 排序（名称/时间/大小）
13. 权限失效提示与重新授权
14. iOS 多选文件路径 + Web 接入新流程

### P2 · 增强

15. 内部库可写：新建文件夹 / 重命名 / 移动（`documentDirectory` 下真实文件操作）
16. 文件名过滤（即时）/ 全文搜索（另立）
17. 分割线拖拽调宽、缩略图、分享
18. Web 端持久化（IndexedDB 存 File 句柄）

---

## 10. 验收清单

| # | 检查项 |
|---|---|
| 1 | 导入 13 层深目录，树与磁盘逐级对照一致（截图比对） |
| 2 | 导入 720 个 md / 1268 个目录：不 OOM、不卡死，扫描 < 15s（Release） |
| 3 | 超过 20000 个文件时有明确提示，已导入部分不丢 |
| 4 | 空目录在树和列表中显示为「0 项」 |
| 5 | 重启 App 后目录结构、书签、最近打开完好 |
| 6 | C 档：点目录自动收抽屉；返回键逐级退（不直接退 App） |
| 7 | C 档：长按进选择模式，批量删 50 项不卡 |
| 8 | 手机横屏：顶栏 44，侧栏默认收起，阅读时顶栏隐藏 |
| 9 | 平板竖屏：双栏，树 240，可收起 |
| 10 | 平板横屏 ≥1200：三栏，正文限宽 780 居中，未选文件时第三栏为占位 |
| 11 | 旋转 5 次后展开态、当前目录、滚动位置不丢 |
| 12 | 断点边界 ±24pt 抖动不触发布局闪烁 |
| 13 | 撤销 SAF 权限后提示「需要重新授权」，重新授权后索引恢复 |
| 14 | iOS：多选导入可用，不出现「导入目录」入口 |
| 15 | `npm run verify` 全绿；新增 `test-library-tree.mjs` 通过 |

---

## 11. 风险与取舍

| 风险 | 影响 | 应对 |
|---|---|---|
| 引入原生模块导致 Expo Go 不可用 | 开发流程变化 | 项目本来就 `expo run:android`（有 `android/`），影响有限；文档里明确"需 dev build" |
| 自研模块权限链路在个别 ROM 上失败 | 某些机型无法列目录 | 保留 `expo-saf-scan` 作为 fallback provider；provider 接口可切换 |
| 5000 节点下树渲染卡顿 | 侧栏滚动掉帧 | 树只显示目录（减少 90% 行）；FlatList + `getItemLayout` + 折叠态懒展开 |
| 三栏在 1200–1280 之间偏挤 | 列表被压 | 列表最小 280，低于则自动降为双栏 |
| iOS 无法目录浏览 | 功能不对等 | UI 文案区分；不做假入口 |
| 大规模重构影响已安装用户 | 书签/最近丢失 | v3 迁移沿用旧 fileId；迁移前先做 `index.json` 原子写 |
| 阅读区限宽在窄屏误伤 | 手机端留白过多 | 仅在 `width ≥ 700` 时生效 |

---

## 12. 一句话总结

> 当前"只能导入一级"是 **`getInfoAsync` 对 SAF 恒返回 `isDirectory:false`** 导致的（即使修好，`SAF.readDirectoryAsync` 也递归不了，必须换原生列目录）。
> 要变成移动端文件管理器，核心不是加界面，而是把数据模型从「导入的 FileItem + 虚拟路径树」换成 **「挂载点 + 节点索引 + 内容懒加载」**，再叠加 **C/M/E/L 四档布局 + 横屏修正 + 触屏手势语义**。

---

## 13. 实施记录

### 13.1 P0 已完成（2026-10-26）

采用**方案 A：自研本地 Expo Module**。

| 文件 | 内容 |
|---|---|
| `modules/saf-tree/expo-module.config.json` | `platforms: ["android"]`，注册 `expo.modules.saftree.SafTreeModule` |
| `modules/saf-tree/android/build.gradle` | 复用 `ExpoModulesCorePlugin`，`useDefaultAndroidSdkVersions()` |
| `modules/saf-tree/android/.../SafTreeModule.kt` | `listChildren(treeUri, documentId)`：`buildChildDocumentsUriUsingTree` 一次 query 拿齐 `document_id / display_name / mime_type / size / last_modified`，并回传 `buildDocumentUriUsingTree` 拼出的可读 uri |
| `src/services/saf/index.ts` | `createSafLister(treeUri)` / `isSafTreeAvailable` / `SAF_TREE_MISSING_MESSAGE`；模块缺失时给出可执行提示而不是静默降级 |
| `src/utils/directoryScanner.ts` | 纯逻辑 BFS 扫描引擎：并发列目录、`maxFiles=20000`、`maxDepth=32`、可取消、逐目录统计（`skipped / truncated / maxDepthHit / failedDirs`） |
| `src/hooks/useDirectoryImporter.ts` | 重写：SAF 全深度扫描 + 内容懒加载（`content: ''`）+ `cancel()` + 部分成功统计；Web 走 `webkitdirectory`，上限 2000 |
| `src/store/readerStore.ts` | persist **v3**：新增 `directories`（显式目录）与 `mounts`（挂载点，存 `treeUri`），新增 `addImport()`；迁移 `<3` 补空数组 |
| `src/utils/fileHelper.ts` | `buildFileTree(files, directories?)`：先落显式目录再挂文件 → **空目录终于能显示** |
| `src/components/Browser/{FolderPane,SidebarTree}.tsx` | 接 `directories`，空目录文案改为"重新导入该目录即可刷新" |
| `src/screens/HomeScreen/HomeScreen.tsx` | 进度条改成"已扫描 N 个文件夹 · 发现 M 个文件" + **取消**按钮；完成后对截断/超深/失败目录弹汇总提示 |
| `scripts/test-directory-scan.mjs` | 新增 9 条扫描引擎用例（全深度、空目录、maxDepth、maxFiles、取消、单目录失败、进度） |
| `scripts/test-file-tree.mjs` | 追加 5 条显式目录用例（空目录、祖先补齐、去重、脏路径、排序） |

`npm run verify` 全绿：typecheck / 4 套测试（含新增 14 条用例）/ lint。
`:saf-tree:compileDebugKotlin` BUILD SUCCESSFUL。

### 13.2 与设计稿的偏差（有意为之）

| 设计稿 | 实际实现 | 原因 |
|---|---|---|
| `Mount[] + Record<id, LibraryNode> + childIndex` | 保留 `files: FileItem[]`，新增 `directories` + `mounts` | 阅读链路（`ReaderContent` / 书签 / 最近打开）全部依赖 `fileId`，一次性换字典收益低、风险高。当前模型已能表达空目录与挂载点，节点字典留到 P1 做"懒展开"时再换 |
| 节点 id 用 `mountId:relPath` | 文件 id 用 `saf:<documentId>` | documentId 在同一授权树内稳定，重复导入是覆盖而不是堆重复项 |
| 索引写 `documentDirectory/index.json` | 仍用 AsyncStorage，但**不再存内容** | 只存元数据后 2000 实体约 300KB，远低于 SQLite 单条上限；20k 级再切文件存储 |

### 13.3 已知遗留

1. **旧安装包必须重新构建**才能拿到原生模块（`npx expo run:android`）；未重建时点"打开文件夹"会明确提示，而不是静默只导一层。
2. 老数据（v3 之前导入的）没有 `mounts`，因此暂不支持"重新扫描/重新授权"，重新导入一次即可。
3. 空目录在"删除文件"后仍保留（目录是显式记录的），需要 P1 的"删除目录"操作。
4. P1 未做：四档断点、三栏布局、返回键补"上一级"、选择模式、懒展开。

### 13.4 P1 已完成（2026-10-26）

| 文件 | 内容 |
|---|---|
| `src/utils/responsive.ts` | 重写为 `useResponsiveLayout()`：C/M/E/L 四档（600/900/1200）+ `isShort`（height<480）+ `isLandscape` + 断点防抖（±24pt 内不切换档位）；`useResponsive()` 保留为兼容壳（isWide = 非 compact）。正文限宽 780（width ≥ 700 生效）、顶栏 52/44 常量在此导出 |
| `src/components/Browser/BrowserShell.tsx` | 侧栏宽度随档位（M 240 / E 280 / L 260，C 走抽屉）；L 档三栏（新增 `aside` prop 放阅读器）；返回键层级补齐：**选择模式 → 抽屉 → 阅读区 → 上一级目录 → 系统退出** |
| `src/components/Browser/PathBar.tsx` | 新增：可横滑面包屑（占顶栏标题位），末段加粗，深层折叠 `…`（>4 段时保留根+…+尾两段，点 … 回到折叠段最深一层） |
| `src/components/Browser/EntryRow.tsx` | 新增：统一行（替代 FolderRow 用于目录列表），行尾常驻 `···` 操作入口（独立热区 40×40）+ 选择模式勾选框 |
| `src/components/Actions/ActionSheet.tsx` | 新增：通用底部操作单（不用 ActionSheetIOS，危险项红色）。文件：打开/书签/复制路径/删除；目录：打开/删除 |
| `src/components/Actions/MoveTargetSheet.tsx` | 新增：批量移动的目标目录选择弹层（只列目录、排除自身子树，根目录可选） |
| `src/components/Browser/SelectionBar.tsx` | 新增：选择模式顶栏（✕ / 已选 N 项 / 移动到 / 删除），整体替换应用头 |
| `src/components/Browser/FolderPane.tsx` | 重写：排序工具栏（名称/时间/大小，同键再点翻转方向）+ 列表/网格切换（网格 3 列卡片）+ 选择模式（长按进入并选中、点行加选）+ 行尾 ··· 接操作单；文件 meta 显示改为 lastModified 优先 |
| `src/store/readerStore.ts` | 新增 `browserView/sortKey/sortAsc`（持久化）与 `selectionMode/selectedFileIds/selectedDirPaths`（瞬态）；新增动作 `setBrowserView/setSortKey/enterSelectionMode/toggleSelected/exitSelectionMode/moveFiles/deleteNodes`（批量删除会把目录子树下的文件与目录记录一并清掉，书签/最近/当前阅读同步清理） |
| `src/types/index.ts` | 新增 `BrowserView/SortKey` 与对应 state/actions |
| `src/screens/HomeScreen/HomeScreen.tsx` | 顶栏接 PathBar；高度随档位（44/52）；选择栏替换应用头；批量移动/删除入口挂本层；横屏阅读隐藏顶栏（沉浸）；阅读区限宽 780 居中；L 档三栏（未选文件时第三栏占位「从左侧选择一个文件开始阅读」）；启动时校验 SAF 挂载点授权，失效弹「重新授权」（预选回原目录重扫，稳定 id 覆盖不丢书签） |
| `src/hooks/useFilePicker.ts` | 新增 `pickFiles()`：iOS 多选导入（DocumentPicker multiple），Web 端 input multiple；全部落导入根（directory: ''） |
| `src/hooks/useDirectoryImporter.ts` | `importDirectory(onProgress, initialUri?)` 支持预选回原目录（重新授权场景） |
| `src/components/Browser/AppMenu.tsx` | 导入入口文案平台化：iOS 显示「导入文件（多选）」并走多选路径，Android 保持「打开文件夹」 |

`npm run verify` 全绿。

#### 与设计稿的偏差

| 设计稿 | 实际实现 | 原因 |
|---|---|---|
| 选择模式批量动作含"收藏" | 只保留 移动/删除 | 收藏已有单文件入口，批量书签场景弱，避免选择栏过挤 |
| 目录可批量移动 | 目录只支持批量删除 | 路径是虚拟反推的，移动目录需要级联改写子文件 directory + 树重建，留到 P2 数据模型（nodes 字典）落地后做 |
| 列表与阅读区可拖分割线（P2） | 未做 | 归入 P2 |
| 下拉刷新重新扫描 | 未做 | 依赖"重新扫描"按钮（P1 遗留第 2 条：老数据无 mounts），P2 与重新扫描一起做 |

#### P1 后仍遗留

1. 树的"懒展开 + 分段渲染"未做（`SidebarTree` 仍全量 flatten，5000 节点级别会卡，需 nodes 字典改造）。
2. 重新扫描/重新授权只覆盖有 `mounts` 的新数据。
3. 分割线拖拽、目录移动、下拉刷新 → P2。

---

## 14. 验收核查（2026-10-26）

### 14.1 自动校验结果

| 项 | 结果 |
|---|---|
| `npm run verify` | **exit 0**（tsc + 4 套测试 80 条 PASS + eslint） |
| `npx expo export --platform android` | **通过**，5.17 MB（与改造前同量级） |
| `:saf-tree:compileDebugKotlin` | 此前 BUILD SUCCESSFUL（本次核查未改动 Kotlin） |
| P0/P1 代码落地 | 文件全部存在（`PathBar` / `EntryRow` / `SelectionBar` / `ActionSheet` / `MoveTargetSheet` / `useResponsiveLayout` / `modules/saf-tree`） |

**结论：代码已经落地、能编能打，但"执行到位"不成立** —— 有 3 个会被用户直接发现的缺陷、4 个功能性问题、若干与设计稿的偏差（部分未记录在 §13.2/13.3）。

### 14.2 严重（会立刻被用户看到 / 直接坏功能）

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| S1 | **全屏阅读时阅读器头部被压扁** | `ReaderContent.tsx:191,269` + `HomeScreen.tsx:312` | 头部写死 `height: 56`，又加了 `paddingTop: topInset`。RN 是 border-box，**padding 算在 height 内** → 状态栏 24~44pt 的手机上，56 高只剩 12~32pt 放标题和按钮，图标会顶到状态栏里。对照 `HomeScreen` 的 `AppHeader` 用的是 `height: height + topInset`，两处不一致 |
| S2 | **平板横屏阅读时，左树与中栏内容顶到状态栏下面** | `HomeScreen.tsx:304` + `BrowserShell` 根容器 | `isReadingFullscreen` 在 `tier==='large' && isLandscape` 时也成立 → 整个 AppHeader（唯一提供 `paddingTop: insets.top` 的地方）被隐藏，但三栏仍然渲染，左树/中栏没有任何顶部安全区。且三栏模式下隐藏应用头本身也丢了面包屑与"···"入口 |
| S3 | **"移动到…"选不到当前目录的任何子目录** | `MoveTargetSheet.tsx:29`、`HomeScreen.tsx:374` | `excludePath={currentDirPath}` 且过滤条件为 `path === excludePath \|\| path.startsWith(excludePath + '/')`。导入后 `currentDirPath` 就是挂载根（如 `lzxwebnovel`），于是列表里只剩"全部（根目录）"一项 —— 最常见的"挪到子文件夹"完全不可用 |

### 14.3 功能性缺陷

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| F1 | **20000 文件上限与 AsyncStorage 存储上限自相矛盾** | `useDirectoryImporter.ts:23`、`readerStore.ts:308` | 实测每条 FileItem JSON ≈ 429 字节：720 文件 ≈ 302 KB（安全），20000 文件 ≈ **8.2 MB**。§1.3 自己诊断过 Android AsyncStorage(SQLite) 单条 2MB cursor window 限制 —— 上限放到 20000，等于把这个坑重新挖了回来，且失败是静默的（重启后索引丢失）。§13.2 写的"20k 级再切文件存储"实际没有护栏 |
| F2 | **重新扫描不清理磁盘上已删除的文件** | `readerStore.ts:88` `addImport` | 只做 Map 覆盖合并，不删旧条目。用户删了文件、重新导入同一目录，列表里仍是旧文件，点开报"文件可能已被移动或删除" |
| F3 | **非 `com.android.externalstorage` 提供者导入的文件读不出内容** | `services/saf/index.ts` + `expo-file-system` `FileSystemModule.kt:1082` | expo 的 `isSAFUri` 硬编码 `host.startsWith("com.android.externalstorage")`；`readAsStringAsync` 对其它 content:// 走 `else -> throw IOException`。从 Google Drive / OneDrive / 部分 OEM 文件管理器选的目录能扫出树，但**打开任何文件都失败**。根因和 §1.1 是同一类问题，只是换了位置 |
| F4 | **`isShort` 算出来但从未使用** | `responsive.ts:84`（全项目 0 处消费） | 设计稿 §4.2 与验收 #8 要求"短屏（height<480）侧栏默认收起"，实际只做到"顶栏 52→44"。手机横屏仍然是 M 档 + 常驻 240 侧栏，390 高度里正文被压 |

### 14.4 交互 / 视觉缺陷

| # | 问题 | 位置 |
|---|---|---|
| M1 | 批量移动对 SAF 文件只是**改虚拟路径标签**（`directory` 字段），磁盘上没动；下次重新扫描会被还原 —— 要么补原生 `moveDocument`，要么对 SAF 文件禁用该动作并说明 |
| M2 | 网格视图 `getItemLayout` 按"每项一行"算 offset（`FolderPane.tsx:288`），`numColumns=3` 时偏移量差 3 倍，滚动/估算高度会错位 |
| M3 | 网格最后一行不足 3 项时，卡片 `flex:1` 会被拉成整行宽（需补占位块） |
| M4 | 网格卡片没有行尾 `···`，只有长按进选择模式 —— 与列表视图操作入口不一致 |
| M5 | 树里的文件长按仍是旧的 `Alert` 菜单（`SidebarTree.tsx:130`），列表里已是新 `ActionSheet` —— 同一动作两套 UI |
| M6 | `ActionSheet` / `MoveTargetSheet` 是 `Modal`，脱离了根容器的 `paddingBottom: insets.bottom`，底部"取消"行会被手势条压住 |
| M7 | `SelectionBar` 固定 52 高，短屏不跟随 44 |
| M8 | 删除当前所在目录后 `currentDirPath` 不重置（`readerStore.ts:260`），停在一个不存在的路径上，列表空、面包屑还在 |
| M9 | 库为空判断只看 `files`（`FolderPane.tsx:343`、`SidebarTree.tsx:250`），只有目录/删光文件后仍显示"还没有文件"引导页，看不到目录树 |
| M10 | 批量删除文案在只选目录时是"确定要删除选中的 0 个文件和 2 个目录吗" |

### 14.5 与设计稿的偏差（此前未记录）

| 设计稿 | 实际 | 影响 |
|---|---|---|
| L 档 列表 320 / 阅读 flex | 列表与阅读**各 flex:1**（浏览器 1280 宽时各约 510） | 列表过宽、阅读区过窄，与"正文限宽 780"配合后左右留白不均 |
| 内容 LRU 缓存 3-5 条 | 无淘汰：打开过的文件内容常驻 `files[]` | 长会话内存单调增长；§6.3 的分层缓存没做 |
| `libraryTree.ts` + `test-library-tree.mjs` | 未创建（等价纯函数在 `fileTree.ts` / `directoryScanner.ts`） | 验收 #15 点名的测试文件不存在；`responsive.ts` 的档位与防抖也**没有单测** |
| 权限失效"置灰 + 行尾 ⚠" | 只弹一次 `Alert` | 忽略后无任何视觉提示，用户会重复点开失败 |
| 树只显示目录 | 树里仍列文件 | 节点数没减 90%，与"5000 节点卡顿"应对措施冲突 |
| `FolderRow.tsx` 迁移后删除 | 仍是死代码（0 处引用） | — |

### 14.6 建议修复顺序

1. **S1 / S2**：`ReaderContent` 头部改 `height: HEADER_HEIGHT + topInset`；`isReadingFullscreen` 限定 `tier !== 'large'`。
2. **S3**：`MoveTargetSheet` 只排除"被移动项自身"，当前目录及其子目录应可选（文件移动不存在自包含问题）。
3. **F4**：短屏时 `sidebarOpen` 默认收（首次进入按 `isShort` 初始化，不覆盖用户手动偏好）。
4. **F1**：把 `MAX_IMPORT_FILES` 降到 2000，或把索引落到 `documentDirectory/library/index.json`（§6.4 原方案），二选一。
5. **F3**：原生模块补 `readText(treeUri, documentId)`，绕开 expo 的 host 判断。
6. **F2 / M8 / M9 / M6 / M2 / M3**：逐个小修。
7. M1（SAF 真移动）单独评估，属 P2 数据模型范畴。


---

## 15. 修复执行记录（2026-10-26 第二轮）

> 状态：**已全部落地**。`npm run verify` exit 0（92 条用例 PASS）、`:saf-tree:compileDebugKotlin` BUILD SUCCESSFUL、`expo export --platform android` 5.19 MB 通过。
> 需重新构建安装包（`npx expo run:android`）：原生模块新增了 `readAsString`。

### 15.1 S 级（已修）

| # | 修法 | 文件 |
|---|---|---|
| S1 | 头部改为 `height: HEADER_HEIGHT + topInset`，与 `AppHeader` 的 `height: height + topInset` 对齐（RN 是 border-box，padding 吃高度） | `src/components/Reader/ReaderContent.tsx` |
| S2 | `isReadingFullscreen` 改为 `isReading && tier !== 'large'`；L 档保留应用头（唯一提供 `paddingTop: insets.top` 的地方，同时保住面包屑与 `···`） | `src/screens/HomeScreen/HomeScreen.tsx` |
| S3 | `MoveTargetSheet` 不再按 `excludePath` 过滤整棵子树，改为 `currentPath` 仅做"当前"标记；补上"取消"行与底部安全区 | `src/components/Actions/MoveTargetSheet.tsx` |

### 15.2 F 级（已修）

| # | 修法 | 文件 |
|---|---|---|
| F1 | 索引从 AsyncStorage 外置到 `documentDirectory/library/index.json`：只存元数据（content 清空）、写 tmp 再替换、读失败回退 tmp、**写队列串行化**、启动水合（等 persist 完成再读盘，v3 老数据自动搬一次）、**只在结构变化时写盘**、切后台立即 flush。persist 升到 **v4** 并且原生平台不再持久化 `files` | `src/utils/indexStorage.ts`（新）、`src/store/fileIndexSync.ts`（新）、`src/utils/indexDiff.ts`（新）、`App.tsx`、`src/store/readerStore.ts` |
| F2 | `addImport` 新增 `replaceRoot`：重新扫描同一挂载点时先摘掉该根下的旧文件/旧目录，再合并；只有"完整扫完"（未触顶、未取消、无失败目录）才允许替换 | `src/store/readerStore.ts`、`src/hooks/useDirectoryImporter.ts` |
| F3 | 原生模块新增 `readAsString(uri)`（ContentResolver 直读，绕开 expo 的 `isSAFUri` host 白名单）；`readTextFile()` 先走 expo、失败自动降级原生 | `modules/saf-tree/.../SafTreeModule.kt`、`src/services/saf/index.ts`、`src/components/Reader/ReaderContent.tsx` |
| F4 | 短屏（height < 480）进入时自动收起侧栏，离开时还原；用户手动动过侧栏后不再干预（`sidebarTouchedRef`） | `src/screens/HomeScreen/HomeScreen.tsx` |

### 15.3 M 级与偏差（已修）

| # | 修法 |
|---|---|
| M2 | 网格 `getItemLayout` 改按行算：`offset = floor(index / 3) * 96` |
| M3 | 新增 `spacer` 行 + `padGridRows()`，最后一行不足 3 项时补空列（卡片不再被拉满整行） |
| M4 | 网格卡片补右上 `···`，与列表视图操作入口一致（勾选框移到左上角避让） |
| M5 | 侧栏长按改为同一个 `ActionSheet`（`utils/fileActions.ts` 的 `Alert` 版已删除） |
| M6 | `ActionSheet` / `MoveTargetSheet` 自己消费 `useSafeAreaInsets()`，底部按钮不再被手势条压住 |
| M7 | `SelectionBar` 新增 `height` prop，跟随 `headerHeight`（短屏 44） |
| M8 | 删除当前所在目录时退到最近一个仍存在的祖先目录（原来停在不存在路径上） |
| M9 | 空库判断改为 `files.length === 0 && directories.length === 0`（只有目录时也能看到树） |
| M10 | 删除确认文案按选中类型拼接（不再出现"删除 0 个文件"） |
| 偏差 | L 档中栏定宽 320、阅读区 flex（`BrowserShell` 新增 `mainWidth`） |
| 偏差 | 正文缓存 LRU：`updateFileContent` 只保留最近 3 个文件的正文 |
| 偏差 | 侧栏树只显示目录（`stripFiles`），节点数与文件数解耦 |
| 偏差 | 授权失效置灰：`Mount.invalid` + 树内行尾 ⚠ + 目录列表顶部横幅"重新授权" |
| 偏差 | 删除死代码 `FolderRow.tsx`、`utils/fileActions.ts` |
| M1 | 不做真实 SAF 移动（需要目录 documentId 与 `moveDocument`，属 P2）；改为在批量移动前明确告知"仅调整应用内位置" |

### 15.4 新增/调整的测试

| 文件 | 内容 |
|---|---|
| `scripts/test-responsive.mjs`（新，8 条） | 四档边界、手机横屏 844×390 落 medium、`boundaryBetween`、`resolveTier` 防抖与跨档放行 |
| `scripts/test-file-tree.mjs`（+7 条） | `stripFiles` 剔文件保空目录、`isStructuralChange` 正文变化不重写索引 / 结构变化必重写 |
| `src/utils/layoutTiers.ts`（新） | 把档位判定从 `responsive.ts` 抽出为纯函数，Node 才能直接单测（`responsive.ts` 继续 re-export） |

### 15.5 仍然遗留（明确不做的）

1. **真机链路未验证**：扫描速度、SAF 授权跨重启、旋转后 insets 变化 —— 需要按 §10 的 15 条在设备上过一遍。
2. **SAF 真实移动/重命名**（M1）：需要目录 documentId 进入数据模型，属下一阶段。
3. **索引损坏后的用户提示**：目前静默回落到"空索引"，用户会看到空库；下一步可在 `App.tsx` 加一次性 toast。
4. `test-library-tree.mjs` 这一文件名不再需要 —— 等价纯函数已由 `fileTree` / `directoryScanner` / `layoutTiers` 三组测试覆盖。
