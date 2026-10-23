# 文件浏览器形态改造设计

> 目标：把当前「文件列表 → 阅读器」的两页结构，演进为「左侧目录树 + 右侧目录内容 / 文件内容」的文件浏览器结构，侧栏可手动收起。
>
> 状态：**已实施（P0 + P1）**。`npm run verify` 全绿（typecheck / 21 项文件树测试 / lint）；
> `expo export` android 5.13MB、web 均打包通过。未在真机跑过，视觉与手势需实机确认（见 §10）。

---

## 1. 目标与边界

### 1.1 要做

| 能力 | 说明 |
|---|---|
| 左侧目录树 | 常驻侧栏，展示完整层级，可展开/折叠，可整体收起 |
| 右侧目录内容 | 显示"当前目录"下的子目录与文件，可按面包屑逐级返回 |
| 点击文件看内容 | 右侧从"目录内容"切换为"文件内容"，可返回所在目录 |
| 侧栏显隐 | 宽屏手动收起（留图标条再展开），手机从左侧滑出抽屉 |

### 1.2 不做（本轮）

- 不接管系统真实文件系统（当前数据源是"导入的 md/txt/代码文件"，不是设备全盘浏览）
- 不做文件重命名/移动/新建文件夹（受限于"文件靠导入"这一数据模型，见 §8.1）
- 不做全文搜索（另立需求）

---

## 2. 现状差距：为什么现在还不算浏览器

| 位置 | 现状 | 问题 |
|---|---|---|
| `store/readerStore.ts` | 只有 `currentFileId` | **没有 `currentDirPath`**，无从表达"我在看哪个文件夹" |
| `TreeView.tsx:53-59` | 点击目录行只 `onToggle(path)` | 目录是"折叠开关"，不是"导航目标"，右侧没有联动 |
| `FileList.tsx:44-46` | 列表/树两种视图互斥切换 | 树和列表被当成两种替代视图；浏览器里它们是**并存的左右两栏** |
| `FileList.tsx:129-168` | 一个 viewToggle 按钮 | 改造后整个切换控件可以删掉 |
| `HomeScreen.tsx:153-183` | 分屏时左列表 + 右阅读器 | 右栏只能显示"已选文件"，无法显示"目录内容" |
| `HomeScreen.tsx:79-81` | 手机端点击文件 `navigate('Reader')` | 手机与平板两套导航路径，侧栏无处安放 |

结论：这不是"加个侧边栏"的工作量，而是**信息架构从 2 页变成 1 页双栏**。好消息是数据层（`buildFileTree`、`FileItem.directory`、FlatList 虚拟化）已经就绪，不需要动导入链路。

---

## 3. 交互模型

### 3.1 布局（宽屏 ≥ 768）

```
┌──────────────────────────────────────────────────────────────┐
│  ☰  LZX Reader            [目录 / docs / api]      theme ⚙   │  ← 顶栏
├───────────────────┬──────────────────────────────────────────┤
│  目录树            │  面包屑：全部 › docs › api                │
│  ▾ 📁 docs        │  ────────────────────────────────────    │
│     ▸ 📁 api      │  📁 guide/          12 项        2026-10  │
│     ▸ 📁 guide    │  📁 images/         3 项         2026-10  │
│  ▾ 🗂 根目录       │  📄 intro.md        4.2 KB       10-23   │
│     📄 README.md  │  📄 api-list.md     8.1 KB       10-22   │
│                   │                                          │
│  [收起 ◀]         │            （右侧：FolderPane）           │
└───────────────────┴──────────────────────────────────────────┘
```

点击文件后，右栏替换为 `ReaderContent`，顶栏面包屑变成文件路径 + 返回按钮：

```
├───────────────────┼──────────────────────────────────────────┤
│  目录树            │  ‹ 返回   📄 api-list.md        ⚙  🔖 分享 │
│  （api 高亮）      │  ────────────────────────────────────    │
│                   │  # API 列表                              │
```

### 3.2 布局（手机 < 768）

侧栏变成浮层抽屉，右栏占满。抽屉打开时有半透明遮罩，点遮罩关闭。

```
┌─────────────────────┐        ┌───────────────┬─────────┐
│ ☰  api  ›           │  点击  │ 目录树         │░░░░░░░░░│
│ ─────────────────   │  ☰ →   │  ▾ 📁 docs    │░遮罩░░░░│
│ 📁 guide/           │        │     📁 api    │░░░░░░░░░│
│ 📄 intro.md         │        │  📄 README.md │░░░░░░░░░│
└─────────────────────┘        └───────────────┴─────────┘
```

### 3.3 点击语义（关键改动）

| 目标 | 手势 | 行为 |
|---|---|---|
| 目录行的**箭头** | 点箭头（独立热区） | 只展开/折叠，不导航 |
| 目录行的**名称区域** | 点行 | 导航到该目录：`currentDirPath` 变更 + 右侧切回目录内容 + 祖先自动展开 |
| 文件行 | 点行 | 打开文件：`currentFileId` 设置 + 右栏切到 reader + 目录同步为该文件所在目录 |
| 文件行 | 长按 | 现有 `showFileActionMenu`（书签/删除），保持不变 |
| 返回按钮（阅读器内） | 点 | 右栏回到"文件所在目录"，`currentFileId` 保留（树里仍高亮，不丢上下文） |

> 现状 `TreeView` 点目录行 = 折叠，箭头和整行是同一个热区。必须拆开，否则"导航"和"折叠"抢同一个手势。

---

## 4. 状态模型

### 4.1 store 新增字段

`types/index.ts` 的 `ReaderState` 增加：

```ts
// 浏览位置
currentDirPath: string;              // '' = 根目录
rightPane: 'folder' | 'reader';      // 右栏形态
sidebarOpen: boolean;                // 宽屏：左侧目录树是否展开
drawerOpen: boolean;                 // 窄屏：目录抽屉是否展开

navigateToDir: (path: string, options?: { collapseSidebar?: boolean }) => void;
openFile: (fileId: string) => void;
closeReader: () => void;             // 回目录内容，保留 currentFileId
setSidebarOpen: (open: boolean) => void;
setDrawerOpen: (open: boolean) => void;
toggleSidebar: () => void;
```

> **侧栏与抽屉必须是两个状态。** 最初只用一个 `sidebarOpen`，结果手机上默认 `true`= 一启动就被抽屉盖住右栏。
> 现在 `sidebarOpen` 只表达宽屏偏好（持久化），`drawerOpen` 表达窄屏抽屉（默认 `false`，不持久化）。
> 各处的收放动作按断点分派：`isWide ? setSidebarOpen(false) : setDrawerOpen(false)`。

`currentFileId` 语义收敛为「当前选中文件」，不再兼任「右栏显示什么」——后者由 `rightPane` 决定。这样"返回目录"不会把选中态清掉。

### 4.2 action 实现要点

```ts
navigateToDir: (path, options) => set({
  currentDirPath: normalizePath(path),
  rightPane: 'folder',
  // 只在窄屏传 collapseSidebar：关的是抽屉，不动宽屏侧栏偏好
  ...(options?.collapseSidebar ? { drawerOpen: false } : null),
}),
```

窄屏"选完目录自动收抽屉"由调用方按断点决定（`SidebarTree` 里传 `collapseSidebar: !isWide`），
不要在 store 里读窗口尺寸——那是运行时状态，放 store 会变成难以清理的脏数据。

### 4.3 持久化（version 1 → 2）

| 字段 | 是否持久化 | 理由 |
|---|---|---|
| `sidebarOpen` | ✅ | 宽屏下用户明确收起过，重启应记住 |
| `drawerOpen` | ❌ | 窄屏抽屉必须每次从关闭开始，否则开屏即被遮住 |
| `currentDirPath` | ✅ | 回到上次浏览位置 |
| `currentFileId` | ✅（现状已存） | 已有 |
| `rightPane` | ❌ 固定为 `'folder'` | 避免重启直接进阅读器、内容还没回填的空白态 |

`migrate` 里补默认值：

```ts
migrate: (persisted, version) => {
  const state = persisted as Partial<ReaderState>;
  if (version < 2) {
    state.currentDirPath = '';
    state.sidebarOpen = true;
  }
  return state;
}
```

---

## 5. 路径与树工具

`fileHelper.ts` 已有 369 行，新增的查询逻辑放**新文件** `src/utils/fileTree.ts`（纯函数，便于单测）：

```ts
normalizePath(p: string): string                       // 去首尾斜杠、统一分隔符
getParentPath(p: string): string
getBreadcrumbs(p: string): { name: string; path: string }[]   // 含根节点 { name: '全部', path: '' }
findNode(tree: TreeNode[], path: string): TreeNode | null
getListing(tree: TreeNode[], path: string): { dirs: TreeNode[]; files: TreeNode[] }
getAncestors(p: string): string[]                      // ['docs', 'docs/api']，用于自动展开
```

`getListing` 直接遍历 `buildFileTree` 的产物即可（树已经排序：目录在前、按 `localeCompare('zh-CN')`），不需要重新扫 `files`。

---

## 6. 组件拆分

### 6.1 目录结构

```
src/components/Browser/
├── BrowserShell.tsx      // 布局容器 + 断点 + 侧栏动画 + 遮罩 + 返回键
├── Sidebar.tsx           // 侧栏骨架：头部（标题/收起按钮）+ 底部操作
├── SidebarTree.tsx       // 目录树（由 TreeView 改造）
├── Breadcrumbs.tsx       // 面包屑
├── FolderPane.tsx        // 右栏：当前目录内容
├── FolderRow.tsx         // 目录行（文件行复用 FileListItem）
└── EmptyState.tsx        // 空目录 / 无文件 / 未选择
```

### 6.2 新增 / 改造 / 删除

| 文件 | 动作 | 说明 |
|---|---|---|
| `components/Browser/*` | 新增 | 见上 |
| `utils/fileTree.ts` | 新增 | §5 的纯函数（含 `scripts/test-file-tree.mjs` 17 条回归测试） |
| `components/FileList/TreeView.tsx` | **删除** | 逻辑迁入 `SidebarTree`（受控展开 + 导航语义） |
| `components/FileList/FileList.tsx` | **删除** | 列表模式迁入 `FolderPane`，树模式迁入 `SidebarTree`；`viewToggle` 一并消失 |
| `components/FileList/FileListItem.tsx` | **删除** | 72px 高、还带"所在目录"链接，在目录内是冗余信息；由 48px 的 `FolderRow` 取代 |
| `screens/HomeScreen/HomeScreen.tsx` | 重写（瘦身） | 243 行 → 约 180 行，只负责顶栏 + 导入动作 + 右栏切换 |
| `screens/ReaderScreen/ReaderScreen.tsx` | **删除** | 手机不再需要独立路由，右栏直接切换（见 §7.3） |
| `navigation/*` | 精简 | `RootStackParamList` 只留 `Home`；`AppNavigator` 不再注册 Reader |
| `components/Reader/ReaderContent.tsx` | 小改 | 去掉 `isEmbedded`（已无用途），改由 `onBack` 是否存在决定是否显示返回按钮 |
| `utils/responsive.ts` | 小改 | 移除 `useSplitView` / `fileListWidth` / `readerWidth`，改提供 `isWide` + `drawerWidth` |
| `utils/fileHelper.ts` | 小改 | 删掉 `extractDirectory`（81 行路径清洗+截断），单文件导入改落根目录 |
| `hooks/useFilePicker.ts` | 小改 | 单文件 `directory: ''`；导入后直接 `openFile` 打开 |

### 6.3 `SidebarTree` 的状态归属

展开态现在是组件内 `useState`。改造后需要"导航时自动展开祖先"，因此改为**受控**：

- `expandedPaths` 由 `BrowserShell` 持有（`useState<Set<string>>`）
- `navigateToDir(path)` 时 `setExpanded(prev => new Set([...prev, ...getAncestors(path)]))`
- 首次挂载：默认展开根目录第一层（沿用现有逻辑）
- 不受 store 持久化（展开态是瞬时视图状态，不值得存）

---

## 7. 关键实现细节

### 7.1 侧栏动画

| 场景 | 实现 | 说明 |
|---|---|---|
| 手机抽屉 | `Animated.Value` + `translateX: -drawerWidth → 0`，`useNativeDriver: true` | 走原生线程；配 backdrop `opacity` 0→0.45 |
| 宽屏收起 | 另一个 `Animated.Value` 驱动 `width: 280 → 0`，`useNativeDriver: false` | **宽度无法用 native driver**。收起为 0，靠顶栏 ☰ 重新展开 |

两个状态各自配一个 `Animated.Value`：同一个 value 不能既被 native driver 驱动（transform）又被 JS 驱动（width），
旋转屏幕切换断点时两个 driver 会互相打架。

> 拒绝用 `LayoutAnimation`：RN 0.74 在 Android 旧架构下需 `UIManager.setLayoutAnimationEnabledExperimental`，Expo Go 里行为不一致。

### 7.2 目录内容列表

- 单 `FlatList`，数据 = `dirs`（`TreeNode[]`）拼 `files`，用 `type` 判别行类型
- 固定行高 44 → 保留 `getItemLayout`
- `navigateToDir` 后 `scrollToOffset({ offset: 0, animated: false })`（用 ref）
- 大目录：`initialNumToRender={20} windowSize={11} removeClippedSubviews`
- 目录行右侧显示"子项数"，文件行显示大小 + 修改时间

### 7.3 手机端去掉 Reader 路由（推荐）

当前手机端 `navigate('Reader')`，平板端右栏内嵌，**两套逻辑**。改造后统一为"右栏切换"，代价是要自己接管物理返回键：

```ts
// BrowserShell
useEffect(() => {
  const sub = BackHandler.addEventListener('hardwareBackPress', () => {
    if (sidebarOpen && isNarrow) { setSidebarOpen(false); return true; }
    if (rightPane === 'reader') { closeReader(); return true; }
    return false; // 交给系统退出 app
  });
  return () => sub.remove();
}, [sidebarOpen, isNarrow, rightPane]);
```

收益：一个屏幕适配所有尺寸、侧栏在阅读时也可用（不再"读文件时看不到树"）、少一个路由和一份重复布局。
代价：`ReaderScreen` 删除；若未来要深链接到某文件，需在 `Home` 上加可选参数 `initialFileId`。

### 7.4 空态

三种必须区分，否则用户不知道是"空目录"还是"没导入"：

| 场景 | 判定 | 文案 |
|---|---|---|
| 全库无文件 | `files.length === 0` | 「还没有文件」+ 添加文件 / 导入目录（沿用现有空态） |
| 目录为空 | `files.length > 0 && listing 为空` | 「这个文件夹是空的」 |
| 未打开文件（宽屏右栏） | `rightPane === 'folder'` 且有内容 | 正常显示目录，不显示空态 |

---

## 8. 必须先解决的数据问题

### 8.1 数据模型是"虚拟目录"，不是真实文件系统

现在 `FileItem.directory` 是导入时记下的**相对路径字符串**，不是真实目录句柄。直接后果：

- 不能"新建文件夹"（没有真实目录可建）
- 不能"移动到别的目录"（需要同步搬 library/ 下的物理文件）
- **空目录无法表示**（没有文件就没有树节点，导入一个空文件夹等于没导入）

本轮接受这个约束，把它做成"虚拟文件浏览器"。若要支持增删移动，需要在 `store` 增加 `folders: string[]` 并让 `buildFileTree` 先消费它，属于独立需求。

### 8.2 单文件导入会生成假目录（现有 bug，改造后会暴露）

`useFilePicker.ts:144` 用 `extractDirectory(permanentUri, asset.name)` 推导目录。而 `persistPickedFile` 存盘时给文件名加了 `Date.now()-` 前缀，导致 `asset.name` 匹配不上，走到"截掉最后一段"分支，再经 `fileHelper.ts:250-272` 的"过滤无意义段 + 只保留末 3 段"：

- Android → 目录变成 `library`
- iOS → 目录变成 `<UUID>/Documents/library`

现在列表视图里不明显，做成文件浏览器后**这会直接变成一个叫 `library` 的一级目录**，非常突兀。

**修法**：单文件导入一律 `directory: ''`（落根目录）。目录导入本来就是完整相对路径，不受影响。

### 8.3 `extractDirectory` 的截断逻辑该退场

`fileHelper.ts:272` 的 `meaningfulSegments.slice(-3)` 是为"展示用目录名"设计的。浏览器需要完整路径做导航，任何截断都会造成**不同深层目录被合并成同一个虚拟目录**（两个 `a/b/c/d` 和 `x/y/c/d` 撞车）。改造后该方法只服务于单文件导入，而单文件导入按 §8.2 已改为根目录 → 可以直接删除 `extractDirectory` 及其 60 行路径清洗逻辑。

### 8.4 老数据清洗（可选）

已安装用户的 `files` 里可能残留 `library` / `<UUID>/Documents/library` 这类假目录。迁移时可以做一次批量清洗：

```ts
// persist version 2 migrate
state.files = state.files?.map((f) =>
  /(^|\/)(library|Documents)$/.test(f.directory ?? '') ? { ...f, directory: '' } : f
);
```

不做也不影响功能，只是侧栏多个目录。建议做，成本 3 行。

---

## 9. 分阶段执行

### P0 骨架（核心，做完就是可用的文件浏览器）

1. `types/index.ts`、`readerStore.ts`：四个字段 + 四个 action + persist v2 迁移
2. `utils/fileTree.ts`：路径/树查询纯函数
3. `SidebarTree`：拆热区（箭头 = 展开，行 = 导航）、受控 `expandedPaths`
4. `FolderPane` + `FolderRow` + `Breadcrumbs`
5. `BrowserShell`：断点、侧栏动画、遮罩、`BackHandler`
6. `HomeScreen` 重写；删 `FileList` / `TreeView` / `ReaderScreen`，精简 navigation
7. `ReaderContent` 支持内嵌返回

### P1 打磨

自动展开祖先、目录/文件排序（名称/时间/大小）、宽屏收起图标条、手机导航后自动收抽屉、滚动复位、`README.md` 优先置顶（可选）。

### P2 增强

侧栏拖拽调宽、网格视图、文件名过滤、最近打开面板、空目录支持（`folders` 字段）、面包屑溢出省略（`…` 折叠中间层级）。

---

## 10. 验收清单

- [ ] 宽屏：左树右内容，点目录右侧联动，点文件右侧切阅读器
- [ ] 宽屏：点侧栏收起按钮 → 宽度收到 0，顶栏 ☰ 可再展开
- [ ] 手机：点 ☰ 抽屉滑出，点遮罩关闭；点目录后抽屉自动收起
- [ ] 手机：启动时抽屉是关闭的（不会一开屏就盖住右栏）
- [ ] 手机：物理返回键优先级 = 关抽屉 > 退出阅读 > 退出 app
- [ ] 面包屑每一级可点击，回到根目录不报错
- [ ] 空目录、空库、未选文件三种空态文案正确
- [ ] 文件长按菜单（书签/删除）在树里和目录列表里都能用
- [ ] 阅读器"返回"回到文件所在目录，树里该文件仍高亮
- [ ] 重启 app 回到上次目录；宽屏保留收起状态，手机抽屉仍从关闭开始
- [ ] `npm run verify`（typecheck + lint + test）全绿
- [ ] `expo export`（android + web）打包通过

---

## 11. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 宽度动画在低端安卓掉帧 | 收起侧栏时右栏抖动 | 260ms + `Easing.out(Easing.cubic)`；实测不行就退化为图标条瞬切 |
| 手机去掉路由后返回键行为变化 | 用户误以为"回不去" | 阅读器头部必须有可见返回按钮，不只靠物理键 |
| 老用户目录结构变化 | 假目录出现在侧栏 | §8.4 migrate 清洗 |
| 大目录（1000+ 文件） | 首次进入卡顿 | FlatList 固定行高 + 窗口裁剪，必要时加"仅显示前 200 项"提示 |
