# 全屏阅读 + Office 文档阅读（方案）

> 目标：① 打开文件即进入全屏阅读，长按正文唤出菜单可退出全屏；② 直接阅读 Word（.docx）等办公文档，库必须开源且商业免费。

---

## 一、现状（只读分析结论）

### 1.1 全屏现状

| 位置 | 现状 |
| --- | --- |
| `HomeScreen.tsx:385` | `isReadingFullscreen = isReading && tier !== 'large'` —— 只有非 L 档才隐藏 `AppHeader` |
| `HomeScreen.tsx:393` | 非 L 档把 `topInset = insets.top` 传给 `ReaderContent`，由阅读器自己让开状态栏 |
| `ReaderContent.tsx:230-268` | **即使隐藏了 AppHeader，阅读器自己还有一条 56pt 头部**（返回 + 标题 + `···`） |
| L 档（≥1200） | `AppHeader` 必须保留：它是唯一提供 `paddingTop: insets.top` 的地方，且承载面包屑与 `···` |
| 菜单入口 | 只有右上角 `···`（`ReaderMenu`），全屏后该入口会随头部一起消失 |
| 返回键 | `BrowserShell.tsx:77-109` 的 `BackHandler` 已做逐级退：选择模式 → 抽屉 → 阅读区 → 上级目录 |

**结论**：现在所谓的"沉浸阅读"只隐藏了应用头，阅读器自己的头部还在，正文可用高度被吃掉 56pt；而且没有"全屏"这个状态概念，所以没法做"打开即全屏 / 长按退出"。

### 1.2 文档类型现状

| 位置 | 现状 |
| --- | --- |
| `types/index.ts:2` | `FileType = 'markdown' \| 'text' \| 'code'` |
| `fileHelper.ts:6-57` | `EXTENSION_MAP` 白名单；`.docx/.doc/.xlsx` 均不在内 → `isSupportedFile()` 返回 false |
| `directoryScanner` 回调 `acceptFile` | `useDirectoryImporter.ts:249` 用 `isSupportedFile && !isFileTooLarge` → 导入目录时 **Office 文档被直接跳过**，连树里都不出现 |
| `services/saf` | 只有 `readTextFile()`，全程 UTF-8；docx 是 zip 二进制，按文本读必然乱码 |
| `ReaderContent` | 按 `type` 三分支（markdown / code / text），无二进制→结构化内容的通道 |

**结论**：不是"渲染不出来"，而是**文件压根进不了索引**。要做 Office 支持，链路是：白名单 → 二进制读取 → 解析成结构化内容 → 复用现有渲染器。

---

## 二、方案一：全屏阅读

### 2.1 状态模型

新增两个状态，区分"本次阅读是否全屏"与"要不要默认全屏"：

| 状态 | 持久化 | 含义 |
| --- | --- | --- |
| `readerFullscreen: boolean` | ❌ 不持久化 | 本次阅读是否全屏。`openFile()` 时置为 `autoFullscreenOnOpen` |
| `autoFullscreenOnOpen: boolean` | ✅ 持久化，默认 `true` | 用户偏好：打开文件是否自动全屏（设置面板可关） |

`closeReader()` 时不清 `readerFullscreen`（回到目录再进同一文件仍是全屏=用户上次的选择语义更顺）；重启后 `rightPane` 本来就不持久化，回到目录列表，无残留问题。

### 2.2 全屏时的界面契约

全屏 = **隐藏一切非正文容器**：

| 档位 | 隐藏项 | 正文 |
| --- | --- | --- |
| C（<600） | `AppHeader`、抽屉 | 满屏，自身 `paddingTop = insets.top` |
| M（600-899）/ E（900-1199） | `AppHeader`、侧栏 | 满屏，限宽 780 居中 |
| L（≥1200） | `AppHeader`、侧栏、中栏列表 | aside 独占整窗，限宽 780 居中 |

- **状态栏保留**：`insets.top` 继续由阅读器自己吃（`ReaderContent` 已支持 `topInset`）。理由：真隐藏状态栏后，Android 顶部下拉手势与刘海避让都会变复杂，收益只有 24pt。
- L 档全屏必须显式 `paddingTop = insets.top`（`AppHeader` 不在时没有第二个提供者），否则正文会顶到状态栏下 —— 这是本地记忆里已经踩过的坑。
- 根容器 `paddingBottom: insets.bottom` 保持不变。

### 2.3 交互

1. **打开即全屏**：`openFile()` → `readerFullscreen = autoFullscreenOnOpen`。
2. **长按正文 → 菜单**：长按判定挂在**滚动容器自己**的 `onTouch*` 上（`useLongPressScroll` + `utils/longPressGesture.ts`，延时 420ms / 位移容差 10pt），到点打开现有 `ReaderMenu`。
   - ⚠️ 初版是"正文外包一层 `Pressable` + `onLongPress`"，**实测会让正文完全滚不动**：Pressability 在手指按下时就抢占 JS responder，Android 上 `blockNativeResponder` 默认为 true，直接截断内层原生 `ScrollView/FlatList` 的触摸分发。RN 的"移动后把响应者交给滚动容器"只对 `Pressable` 作为**子节点**成立，作为**父节点**时滚动已经先被它吃掉了。
   - 现方案不调用任何 responder API：触摸事件由 `ScrollView` 原生视图自己收到（RN 的 ScrollView 会把 `onTouchStart/Move/End/Cancel` 链式转发给 props），我们只在旁边用定时器看"指头是否原地按满 420ms"，定时器到点时再按最后一次位置复检，避免边滚边弹菜单。
3. **菜单新增两项**（`ReaderMenu`）：
   - `退出全屏` / `进入全屏`（图标 `contract-outline` / `expand-outline`）
   - `返回目录`（仅 `onBack` 存在时显示，承接原来头部返回键的职责）
   - 菜单顶部显示当前文件名（全屏后头部标题没了，需要有个地方能确认在读什么）。
4. **首次全屏提示**：首次进入全屏时在底部弹一条淡出提示「长按正文可打开菜单」，3s 或任意触摸后消失，存 `AsyncStorage` 标记只显示一次。
5. **Android 返回键**：插入到 `BrowserShell` 的 `BackHandler` 顺序里 —— `选择模式 → 抽屉 → 全屏退出 → 阅读区关闭 → 上级目录`。必须放在"阅读区关闭"之前，否则返回键直接退出阅读、用户以为全屏没退。
6. **发现性兜底**（可选，默认开）：全屏时右下角一个 12% 透明度的 `···` 小圆点，触点 32pt。理由：纯长按没有可见入口，新用户可能困在全屏里。

### 2.4 涉及文件

| 文件 | 改动 |
| --- | --- |
| `src/types/index.ts` | `ReaderState` 加 `readerFullscreen` / `autoFullscreenOnOpen` 及两个 action |
| `src/store/readerStore.ts` | 初值、`openFile` 联动、`partialize` 加 `autoFullscreenOnOpen` |
| `src/screens/HomeScreen/HomeScreen.tsx` | `isReadingFullscreen` 改由 store 决定（不再看 tier）；顶栏/选择栏隐藏条件、`topInset` 传递、`BrowserShell` 传 `focusAside` |
| `src/components/Browser/BrowserShell.tsx` | 新增 `focusAside?: boolean`（宽屏时侧栏宽度动画到 0 且不渲染中栏）；`BackHandler` 加全屏分支 |
| `src/components/Reader/ReaderContent.tsx` | 新增 `fullscreen` / `onToggleFullscreen` props；全屏时不渲染头部；正文容器保持普通 `View`，长按回调透传给各渲染器；顶部 2px 进度线保留 |
| `src/utils/longPressGesture.ts` + `src/hooks/useLongPressScroll.ts` | 长按判定纯逻辑（延时 / 位移容差）+ 可透传给滚动容器的触摸回调集合 |
| `src/components/Reader/{Markdown,Text,Code}Renderer.tsx` | 接收 `scrollTouchProps` 并挂到内层 `FlatList` / `ScrollView` 上 |
| `src/components/Reader/ReaderMenu.tsx` | 新增"退出全屏""返回目录"项 + 文件名标题行 |
| `src/components/SettingsPanel/SettingsPanel.tsx` | 新增"打开文件自动全屏"开关 |

### 2.5 风险

| 风险 | 处置 |
| --- | --- |
| ~~`Pressable` 包 `FlatList` 影响滚动手感~~ **已确认踩中** | 实机反馈"进入全屏后正文滑不动"。已改为把长按挂在滚动容器自身 `onTouch*` 上（见 §2.3 第 2 条），禁止再把滚动容器包进任何 Pressability 组件（`Pressable` / `Touchable*`） |
| L 档全屏后 `AppHeader` 消失导致顶部无安全区 | `ReaderContent` 显式 `paddingTop: insets.top` 且 `height: H + insets.top`（border-box，本地约定） |
| 两个 `BackHandler` 冲突 | 只在 `BrowserShell` 里加分支，`HomeScreen` 不再注册 |

---

## 三、方案二：Office 文档阅读

### 3.1 库选型（全部开源 + 商业免费）

| 用途 | 库 | 许可证 | 体积 | 备注 |
| --- | --- | --- | --- | --- |
| .docx 解析 | **mammoth** | BSD-2-Clause | ~1.7MB（浏览器构建） | 官方浏览器入口 `mammoth/mammoth.browser.js`，吃 `ArrayBuffer`，不依赖 `fs`/DOM；输出 HTML |
| 图片/zip 解码 | jszip（mammoth 依赖） | MIT 或 GPL-3.0（双许可，选 MIT） | 附带 | 无需单独引入 |
| 备用：1:1 版式还原 | **docx-preview** | Apache-2.0 | ~955KB + jszip | 依赖真实 DOM，只能在 WebView 里跑 |
| 备用：表格 | SheetJS CE | Apache-2.0 | ~1MB | .xlsx/.xls → markdown 表格 |
| 备用：PDF | react-native-pdf | MIT | 原生 | 需重建原生包 |
| 不推荐 | .doc（97-2003 二进制） | — | — | 社区只有纯文本提取（`word-extractor`，MIT），排版本质上无法还原；建议明确提示"另存为 .docx" |

> 许可证均已确认可用于商业闭源分发（BSD-2 / Apache-2.0 / MIT 都不要求开源衍生作品）。注意 **jszip 是 MIT OR GPL-3.0 双许可**，取 MIT 分支即无 GPL 传染。

### 3.2 选定方案（推荐）：mammoth → HTML → 轻量 HTML→Markdown → 复用现有渲染器

```
.docx(uri)
  → readBinaryFile(uri)          // base64
  → mammoth.convertToHtml         // 延迟加载，ArrayBuffer
  → htmlToMarkdown(html)          // 纯函数，Node 可测
  → MarkdownRenderer              // 主题 / 字号 / 深色 / 代码高亮全部免费复用
```

**为什么不是直接在 WebView 里跑 docx-preview**：
- 每个文档一个 WebView 实例，内存与首屏开销明显（本项目已因同样理由否掉了"每公式一个 WebView"）；
- WebView 内的排版不受主题、字号设置控制，深色模式要再写一套 CSS 注入；
- 需要把 docx-preview + jszip 打成 ~1.3MB 的离线 HTML 资源塞进 assets，包体增长比 mammoth 更大。

**代价（必须提前说明）**：mammoth 是"语义转换"而非"版式还原"，会丢分栏、文本框、页眉页脚、艺术字，复杂表格会降级；公式（OMML）只保留文本。换来的是与 Markdown 文档完全一致的阅读体验和零额外渲染层。

如果必须要"和 Word 里长得一样"，走 3.3 的 B 方案，或在菜单里加一个"原样查看"走 docx-preview。

### 3.3 备选方案（如需版式还原）

docx-preview 打进一个本地 HTML（`assets/docx-viewer.html`），WebView 通过 `injectedJavaScript` 传 base64 文档。改造成本比 3.2 高约 1 倍，且与主题体系脱耦。

### 3.4 涉及文件

| 文件 | 改动 |
| --- | --- |
| `package.json` | `+ mammoth`（+ 视需要 `buffer` polyfill） |
| `metro.config.js`（新建） | alias `mammoth` → `mammoth/mammoth.browser.js`，避免 Metro 解析到 Node 入口引入 `fs` |
| `src/types/index.ts` | `FileType` 增加 `'docx'` |
| `src/utils/fileHelper.ts` | `EXTENSION_MAP` 加 `.docx`；拆出 `BINARY_MAX_BYTES`（Office 文档放宽到 30MB，二进制体积与文本不可比）；新增图标/颜色映射 |
| `src/services/saf/index.ts` | 新增 `readBinaryFile(uri): Promise<string>`（base64）：原生 `readAsBase64` 优先 → expo `EncodingType.Base64` 回退，同样带 20s 超时 |
| `modules/saf-tree`（Android 原生） | 新增 `readAsBase64(uri)`。**改完必须 `npx expo run:android` 重建，Expo Go 里没有** |
| `src/utils/office/docxEngine.ts`（新建） | **唯一允许静态 import mammoth 的文件**，导出 `convertDocxToHtml(base64)`；其余调用方一律 `import('./docxEngine')`（沿用 `mathjaxEngine` 的重型依赖铁律，`test-math-render.mjs` 的守卫扫描要同步覆盖） |
| `src/utils/office/docx.ts`（新建） | 延迟加载 + 缓存（同一 base64 不重复转换）+ 错误分类（损坏 / 加密 / 超限） |
| `src/utils/office/htmlToMarkdown.ts`（新建） | 纯函数：mammoth 会产出的子集（h1-h6/p/ul/ol/li/table/strong/em/a/img/blockquote/br/hr）→ Markdown |
| `scripts/test-html-to-markdown.mjs`（新建） | 覆盖标题、嵌套列表、表格、行内样式、data URI 图片、空段落 |
| `src/components/Reader/DocxRenderer.tsx`（新建） | 转换中骨架屏 / 失败态（含"该文档已加密"等文案）/ 成功后渲染 `MarkdownRenderer` |
| `src/components/Reader/ReaderContent.tsx` | `switch (type)` 增加 `case 'docx'`；懒加载逻辑改成"按类型取内容"（文本→UTF8，docx→base64+转 md） |
| `src/hooks/useFilePicker.ts` | `WEB_ACCEPT` 加 `.docx`；原生分支按类型选读取编码；web 分支用 `file.arrayBuffer()` |
| `src/hooks/useDirectoryImporter.ts` | `acceptFile` 用新的二进制上限；web 端 `MAX_WEB_FILES` 也保持 |

### 3.5 内容缓存策略

- 转换结果（markdown）存 `FileItem.content`，受现有 LRU 3 条约束，**不落 index.json**（`indexStorage.stripContentForIndex` 已保证）；
- 关闭再打开同一 docx 会重新转换（中等文档 ~200-600ms，有骨架屏兜底）；
- 可选优化：把转换结果写到 `library/.cache/<fileId>.md`，命中即读。**建议二期再做**，先把链路跑通。

### 3.6 风险

| 风险 | 处置 |
| --- | --- |
| mammoth 浏览器构建在 RN/Metro 下仍引用 Node 内置模块 | `metro.config.js` 明确 alias 到 `mammoth.browser.js`；若仍有 `buffer`/`process` 引用，用 `babel-preset-expo` 已有的 polyfill + 显式引入 `buffer` |
| Hermes 缺 `TextDecoder` | mammoth/jszip 内部若依赖，补 `text-encoding` polyfill 或在 engine 里注入实现 |
| 浏览器构建体积进不了启动路径 | 强制延迟加载 + `test-math-render.mjs` 守卫扫描（违规直接 FAIL） |
| SAF 云盘（Drive/OneDrive）base64 读取失败 | 原生 `readAsBase64` 用 `ContentResolver` 直读；失败时给"请导入到本地再打开"的明确文案，不静默 |
| 30MB 文档 base64 字符串约占 40MB 内存 | 上限卡 30MB；超限在打开前就提示，不进入转换 |
| 用户以为 docx 会"和 Word 一模一样" | 首次打开 docx 时一次性提示"已按阅读模式重排，复杂版式可能简化" |

---

## 四、实施顺序

| 阶段 | 内容 | 验证 |
| --- | --- | --- |
| 1 | 全屏阅读（状态 + 隐藏头 + 长按菜单 + 返回键 + 设置项） | 实机：C/M/E/L 四档 + 返回键逐级退 |
| 2 | 二进制读取通道（原生 `readAsBase64` + `services/saf` 封装） | 原生重建后读本机/SAF/云盘三处 docx |
| 3 | docx 解析链路（mammoth + htmlToMarkdown + DocxRenderer） | `npm run verify`；`test-html-to-markdown.mjs`；10 份真实 docx |
| 4 | 导入白名单与选择器放开（含 `.docx` 体积上限） | 目录导入 2000 文件不卡；docx 出现在树里 |
| 5（可选） | `.xlsx` → markdown 表格；`.pdf`；`.doc` 纯文本降级提示 | 按需 |

`npm run verify` 全绿是每阶段的收口条件（tsc + 4 个 node 测试 + eslint）。

---

## 五、已确认的决策

| 议题 | 决定 |
| --- | --- |
| Word 渲染 | **A 语义重排**（mammoth → HTML → Markdown → 现有渲染器），「原样查看」（docx-preview）留到下一轮 |
| 全屏强度 | **连状态栏一起隐藏**（`expo-status-bar` 的 `hidden`），只在"右栏确实是阅读器"时隐藏 |
| 本轮范围 | `.docx` + `.xlsx`（含 `.xls`）+ `.pdf`；`.doc` 给明确提示由系统另存为 `.docx` |

---

## 六、落地记录（已实施）

### 6.1 全屏阅读

| 文件 | 实际改动 |
| --- | --- |
| `types/index.ts` | 新增 `readerFullscreen` / `autoFullscreenOnOpen` 与三个 action |
| `store/readerStore.ts` | `openFile` 按偏好置全屏；`closeReader` / `removeFile` / `deleteNodes` 回落非全屏；`partialize` 只持久化 `autoFullscreenOnOpen` |
| `App.tsx` | `StatusBar hidden={readerFullscreen && rightPane === 'reader'}` |
| `HomeScreen.tsx` | 全屏判定改为 store（四档统一）；`BrowserShell` 传 `focusAside`（L 档）+ `hideSidebar`（所有档）；`topInset` 不再按档位传 0 |
| `BrowserShell.tsx` | 新增 `focusAside` / `hideSidebar`；全屏时树宽动画归零、抽屉收起、L 档不渲染中栏；返回键顺序加"退出全屏" |
| `ReaderContent.tsx` | 全屏时不渲染标题栏、正文自己吃 `insets.top`；长按经 `useLongPressScroll` 挂到滚动容器（**修正**：初版 `Pressable` 包裹导致正文无法滚动，见 §2.5）；首次全屏提示 3.2s；右下角 55% 透明小圆点作为长按的兜底入口 |
| `ReaderMenu.tsx` | 新增文件名标题行、"返回目录"、"退出全屏/进入全屏" |
| `SettingsPanel.tsx` | 新增"打开文件自动全屏"开关（默认开） |

行为链：打开文件 → 全屏（无应用头 / 无树 / 无列表 / 无标题栏 / 无状态栏）→ 长按正文（或右下角圆点）→ 菜单 → 退出全屏 / 返回目录；Android 物理返回键先退全屏、再退阅读、再退上级目录。

### 6.2 Office / PDF 阅读

| 文件 | 实际改动 |
| --- | --- |
| `package.json` | `mammoth@^1.13.0`（BSD-2）、`xlsx@^0.18.5`（Apache-2.0）、`react-native-pdf@^7.0.5`（MIT）、`react-native-blob-util@^0.25.1`（MIT） |
| `metro.config.js`（新建） | `mammoth` → `mammoth/mammoth.browser.js`；只对 xlsx/mammoth/jszip 把 `fs`/`stream`/`crypto` 解析成空模块 |
| `utils/office/htmlToMarkdown.ts` | 自研 HTML→Markdown（解析成节点树再渲染，处理 Word 的嵌套列表）；>400KB 的 base64 图片降级为"已省略" |
| `utils/office/base64.ts` | base64 ↔ Uint8Array（不依赖 `atob` / `Buffer`，Hermes 上行为一致） |
| `utils/office/docxEngine.ts` | 唯一静态 import mammoth；`convertDocxToHtml` |
| `utils/office/xlsxEngine.ts` | 唯一静态 import xlsx；每表 300 行 / 12 列 / 8 个 sheet 上限 |
| `utils/office/index.ts` | 延迟加载 + 错误翻译（加密/损坏 → 可读文案）+ 2 条结果缓存 |
| `services/saf/index.ts` | 新增 `readBase64File()`（原生优先、45s 超时） |
| `modules/saf-tree`（Kotlin） | 新增 `readAsBase64(uri)`，`ContentResolver` 直读 |
| `fileHelper.ts` | `.docx/.xlsx/.xls/.pdf` 入白名单；`MAX_BINARY_FILE_SIZE = 30MB`；Word 蓝 / Excel 绿 / PDF 红图标 |
| `useFilePicker.ts` | accept 列表放开；原生端二进制不预读正文（懒加载）；web 端即时转换（PDF 明确拒绝） |
| `useDirectoryImporter.ts` | `acceptFile` 用按类型的大小上限；web 目录导入仍只收文本 |
| `ReaderContent.tsx` | 按类型分流加载（UTF-8 / base64→Markdown / PDF 直传 uri）；`docx|xlsx` 复用 `MarkdownRenderer` |
| `Reader/PdfRenderer.tsx` | `react-native-pdf` 延迟 require + 优雅降级（web / 旧包）+ 页码角标 |
| `scripts/test-office-convert.mjs` | 24 项回归：标题/列表/表格/实体/base64/重型依赖守卫 |

### 6.3 必须做的构建动作

1. `npx expo run:android` —— **必须重建**：`saf-tree` 新增了 `readAsBase64`，且新增两个原生依赖（`react-native-pdf`、`react-native-blob-util`）。Expo Go 里一定没有。
2. `npm run verify`（tsc + 6 个 node 测试 + eslint）当前已全绿。
3. `android/` 是本地维护的 prebuild 产物，**不要跑 `expo prebuild --clean`**（会冲掉签名与版本号逻辑）；RN autolinking 会在下次 Gradle 构建时自动接上新依赖。

### 6.4 已知取舍

- docx 走语义重排：分栏、文本框、页眉页脚、艺术字会丢，OMML 公式只剩文本；复杂表格降级；图片以 data URI 内联（超大图省略）。
- 转换结果只进内存 LRU（3 条），**不落 index.json**：冷启动后首次打开需重新解析（中等文档约 0.2~0.6s，有骨架屏）。
- PDF 依赖原生视图，`content://`（云盘）可能拒绝直读，已在错误态给出可照做的提示。
- `.doc`（97-2003）仍不在白名单：社区只有纯文本提取，排版本质上无法还原。
- 重型依赖虽延迟加载，但仍进 JS bundle：Android hbc 由 ≈5MB 涨到 7.3MB。

### 6.5 验证记录

| 项 | 结果 |
| --- | --- |
| `npm run verify` | 通过（tsc + 6 个 node 测试 + eslint 0 error 0 warning） |
| 真实 docx 端到端 | 现场生成含标题 / 粗斜体 / 表格 / 实体的 docx，mammoth 浏览器构建 → HTML → Markdown，结构正确 |
| `expo export --platform android` | 通过（7.3MB hbc），确认 mammoth alias / xlsx 的 fs 空模块 / react-native-pdf 均可解析 |
| `expo export --platform web` | 通过。**踩坑**：react-native-pdf 内部引用 `react-native/Libraries/...` 的原生实现，web 没有对应变体，整个 web 构建会报 "Unable to resolve module ../Utilities/Platform"；已在 `metro.config.js` 对 web 平台把 `react-native-pdf` / `react-native-blob-util` 解析成空模块，并在 `PdfRenderer` 里做运行时守卫（空对象≠可用组件） |

### 6.6 遗留问题（需确认后再动）

`.gitignore` 第 36 行的 `android/` 会匹配**任意层级**的 `android` 目录，因此
`modules/saf-tree/android/**`（自定义原生模块 Kotlin 源码，含这次新增的 `readAsBase64`）
**完全没有纳入版本库**——目前只有 `expo-module.config.json` 和 `package.json` 被跟踪。
全新 clone 的仓库无法重建 SAF 模块。

建议修法（两行，不动现有的 `android/` 规则）：

```gitignore
# 自定义原生模块的源码必须入库（build 产物仍忽略）
!/modules/*/android/
/modules/*/android/build/
```


---

## 七、真机/模拟器实测踩坑（2026-10-30 修复批次）

以下四个问题都是**只有装到设备上才会暴露**的，单测和 `expo export` 都发现不了，记下来避免重犯。

### 7.1 正文无法滚动：`Pressable` 会抢走滚动容器的触摸

- **现象**：全屏与普通阅读时正文完全不能上下滑动，点击正常。
- **根因**：为了「长按正文唤出菜单」把滚动容器包进 `<Pressable>`。Pressability 在按下瞬间就索取 JS responder，Android 侧 `blockNativeResponder=true` 会截断内层原生 `ScrollView/FlatList` 的触摸分发，于是内层永远收不到 move 事件。
- **修法**：`Pressable` 一律不能包滚动容器。改为 `utils/longPressGesture.ts`（纯函数判定位移是否超出 10pt 容差）+ `hooks/useLongPressScroll.ts`（把 `onTouchStart/Move/End/Cancel` 挂到滚动容器自身，不调用任何 responder API）。
- **铁律**：滚动容器只挂 `onTouch*`，不要用 `Pressable` / `TouchableOpacity` 包裹。

### 7.2 docx 报 `Property 'TextDecoder' doesn't exist`

- **根因**：`mammoth/mammoth.browser.js` 经 browserify 打包，内部依赖 browserify 的 Buffer 垫片，而该垫片用 `TextDecoder` 转字符串。Hermes 没有这个全局对象。
- **试错**：先只去掉传给 mammoth 的 `buffer` 入参（只传 `arrayBuffer`）**无效** —— Node 侧实验证明 `arrayBuffer` 路径同样调用 `TextDecoder`。
- **修法**：`utils/office/textDecoderPolyfill.ts` 自实现 `TextDecoder`（UTF-8 逐字节续字节区间表、latin1/windows-1252、utf-16le/be、`fatal`、`ignoreBOM`），`docxEngine` 与 `xlsxEngine` 入口都调 `ensureTextDecoder()`（幂等，不覆盖宿主已有实现）。

### 7.3 xlsx 中文全变方块（☒）、数字列变斜体 f

- **根因**：SheetJS 的 `cc2str()` 用 `new TextDecoder('latin1')` 把字节转成二进制字符串（UTF-16 部件再用 `utf-16le/be`）。第一版 polyfill **把所有标签都按 UTF-8 解**，字节流整体错位，于是中文字节被拆成替换字符、ASCII 也被错解。
- **修法**：polyfill 增加 `normalizeLabel()` + latin1/utf-16 分支；`scripts/test-text-decoder.mjs` 用**全部 256 个单字节**与原生实现逐一对齐。
- **教训**：写 TextDecoder 垫片时，"只有 UTF-8" 是最容易犯的错，而 xlsx 恰好依赖 latin1。

### 7.4 打开 PDF 直接闪退（进程被杀）

- **现象**：从「导入目录」进来的 PDF 一打开 app 就退出，无 JS 报错。
- **logcat**：`SecurityException: Permission Denial: reading ... requires that you obtain access using ACTION_OPEN_DOCUMENT`，栈顶 `org.wonday.pdf.PdfView.drawPdf(PdfView.java:361)` ← `onAttachedToWindow` ← `NativeViewHierarchyManager.manageChildren`。
- **根因**：react-native-pdf 的 `_prepareFile` 对非网络/非 base64 的 URI 走 `decodeURIComponent(uri.replace(/file://///i,''))`。SAF 树 URI 形如
  `content://com.android.externalstorage.documents/tree/primary%3ADownload%2Flzxtest/document/primary%3ADownload%2Flzxtest%2Fsample.pdf`，
  被 `decodeURIComponent` 把 `%3A`/`%2F` 解成裸 `/` 之后，树 id 从 `primary:Download/lzxtest` 退化成 `primary:Download`，权限校验失败。`PdfView.onAttachedToWindow` 只 catch `FileNotFoundException`，`SecurityException` 直接冒到 UI 线程 → 进程被杀。
- **修法**：`services/pdfSource.ts` 的 `resolveLocalPdfPath()` 先把 `content://`（或含 `%` 的 uri）复制到 `${cacheDirectory}pdf-cache/`（文件名用 djb2 hash + `.pdf`），再把本地路径交给原生视图。复制先试 `FileSystem.copyAsync`（内部走 `contentResolver.openInputStream`，支持 `content://`），失败退回 `readBase64File` + `writeAsStringAsync`。
- **教训**：第三方原生视图不一定兼容 SAF，遇到"打开即退出、无 JS 错误"优先看 `logcat | grep -i SecurityException`，不要猜。

### 7.5 顺带修掉的小问题

- 菜单版本号恒显示 `v1.0.0`：`Constants.expoConfig?.version` 在 release 包里拿到旧值，改为直接读 `app.json` 的 `expo.version`（`utils/appVersion.ts`）。
- 正文里的 `&amp;` 显示：一度误判为渲染问题，实际是 `uiautomator dump` 会把 `&`/`<`/`>` 转成 XML 实体，**截图才是真相**。顺带把 `decodeEntities` 从 `office/htmlToMarkdown.ts` 抽到独立的 `utils/htmlEntities.ts`，供 Markdown 渲染复用。
