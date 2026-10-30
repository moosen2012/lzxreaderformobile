# LZX Reader APK 打包指南

本文档记录如何将本项目（Expo / React Native）打包为 Android APK 安装包。

## 一、环境要求

| 组件 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | 18 及以上（当前使用 v22.x） | 运行 npm 脚本与 Metro |
| JDK | **17**（必须，当前使用 Temurin 17.x） | Android Gradle Plugin 要求 |
| Android SDK | API 34 / build-tools 34+ | 需设置环境变量 `ANDROID_HOME`（当前为 `D:\Android\Sdk`） |
| npm 依赖 | 与 package.json 一致 | 项目根目录执行过 `npm install` |

确认环境：

```powershell
java -version          # 应显示 17.x
node -v
$env:ANDROID_HOME      # 应指向 Android SDK 目录
```

## 二、项目结构说明

- 项目为 **Expo 管理式工作流（managed workflow）**，`android/` 目录由 `npx expo prebuild` 生成，且已纳入本地维护（含自定义签名与自动版本号逻辑）。
- `android/` 已被 `.gitignore` 忽略，不会进入版本库。
- 版本号规则（自动生成，见 `android/app/build.gradle`）：
  - `versionName`：自动读取 `app.json` 中 `expo.version`（单一版本来源）。
  - `versionCode`：自动取 git 提交总数，并取 max(git 值, 历史持久化值) 保证单调递增；git 不可用时回退到 `android/versionCode.properties`。

## 三、签名配置

发布签名通过 `android/keystore.properties` 配置（此文件包含密码，切勿提交）：

```properties
storeFile=app/release.keystore
storePassword=<密码>
keyAlias=lzxreader
keyPassword=<密码>
```

- 签名文件位于 `android/app/release.keystore`。
- `keystore.properties` 缺失时，release 构建自动回退到 debug 签名（仅用于本地调试）。

### 首次生成签名（如需重建 keystore）

```powershell
keytool -genkeypair -v -storetype PKCS12 `
  -keystore android\app\release.keystore `
  -alias lzxreader -keyalg RSA -keysize 2048 -validity 10000
```

## 四、打包步骤

### 1. 安装依赖（如未安装或依赖有变更）

```powershell
npm install
```

### 2. 同步原生工程（仅当原生配置/依赖变更时需要）

```powershell
npx expo prebuild --platform android
```

> 注意：`prebuild` 会重新生成 `android/` 目录。由于 `keystore.properties` 和 `release.keystore` 位于其中，重新生成前请先备份这两个文件；若未做过原生配置变更，可跳过此步直接打包。

仅更新 JS/TS 代码、`app.json` 中的 `version` 时，**无需** prebuild，直接执行下一步。

### 3. 构建 Release APK

```powershell
cd android
.\gradlew.bat assembleRelease
```

构建成功输出 `BUILD SUCCESSFUL`，产物位于：

```
android\app\build\outputs\apk\release\app-release.apk
```

版本信息同时输出在 `android\app\build\outputs\apk\release\output-metadata.json`。

### 4. （可选）其他构建目标

| 命令 | 产物 |
| --- | --- |
| `.\gradlew.bat assembleDebug` | 调试 APK（`app\build\outputs\apk\debug\app-debug.apk`，debug 签名） |
| `.\gradlew.bat bundleRelease` | AAB（`app\build\outputs\bundle\release\app-release.aab`，用于 Google Play） |

### 5. 安装到设备

```powershell
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

## 五、验证签名

```powershell
$bt = Get-ChildItem "$env:ANDROID_HOME\build-tools" | Sort-Object Name -Descending | Select-Object -First 1
& "$($bt.FullName)\apksigner.bat" verify --print-certs android\app\build\outputs\apk\release\app-release.apk
```

期望输出包含 `V2 Signer: certificate DN: CN=LZX Reader, ...`。

## 六、常见问题

1. **构建报 JDK 版本错误**：确认 `java -version` 为 17，或设置 `org.gradle.java.home` 指向 JDK 17。
2. **SDK location not found**：确认 `ANDROID_HOME` 已设置，且 `android/local.properties` 中 `sdk.dir` 路径正确。
3. **versionCode 不增长**：确认项目为 git 仓库且有新提交；或检查 `android/versionCode.properties` 中持久化值。
4. **安装时提示签名冲突**：设备上已装过其他签名的同包名应用，需先卸载旧版。
5. **清理重建**：`.\gradlew.bat clean assembleRelease`。

## 七、本次打包记录

- 日期：2026-10-30（第四次）
- 版本：1.1.1（versionCode 10，未新增 git 提交，沿用持久化值）
- 变更：
  1. 修复正文无法滚动 —— 去掉包住滚动容器的 `Pressable`，改为 `useLongPressScroll` 挂在滚动容器自身的 `onTouch*` 上（长按唤出菜单的能力保留）
  2. 修复 docx 报 `Property 'TextDecoder' doesn't exist` —— 新增 `utils/office/textDecoderPolyfill.ts`（UTF-8 / latin1 / utf-16le / utf-16be），两个引擎入口调用 `ensureTextDecoder()`
  3. 修复 xlsx 表格中文变方块 —— 同上 polyfill 的多编码分支（SheetJS 用 `TextDecoder('latin1')` 做字节→二进制串）
  4. 修复打开 PDF 闪退 —— 新增 `services/pdfSource.ts`，先把 `content://` 复制到 cache 再交给原生视图（绕开 react-native-pdf 对 URI 做 `decodeURIComponent` 破坏 SAF 树关系的问题）
  5. 修复菜单版本号恒为 v1.0.0 —— `utils/appVersion.ts` 改为读 `app.json` 的 `expo.version`
- 产物：`android\app\build\outputs\apk\release\app-release.apk`（87,910,582 B ≈ 83.8 MB）
- 签名：V2，`CN=LZX Reader, OU=Mobile, O=LZX`（沿用 `android/app/release.keystore`，可直接 `adb install -r` 覆盖安装且保留已导入目录）
- 方式：`gradlew.bat assembleRelease`，构建耗时 1 分 36 秒（仅 JS/TS 改动，未执行 prebuild）
- 实测（模拟器 `Small_Phone`，Android 16 / x86_64）：
  - `sample.xlsx` → 标题「员工表」+ 表头「姓名/部门/工号」+ 张三/李四/王五 + A001~A003，横向滑动正常
  - `sample.docx` → 标题、中文正文、`&` 与 `<tag>`、列表项全部正确
  - `sample.pdf`（SAF `content://`）→ `PDF fixture page 1` + 页码 `1 / 1 · sample.pdf`，logcat 无 FATAL/SecurityException
  - 长文档（60 节 Markdown）→ 全屏下连续上滑从第 1 节到第 10 节；长按正文弹出阅读菜单；关闭菜单后继续滑动正常
  - 菜单底部显示 `LZX Reader v1.1.1`
- 校验：`npm run verify` 全绿（tsc + 9 个测试脚本 + eslint 0 error / 0 warning）

### 上一次记录（第三次，2026-10-30）

- 变更：全屏阅读（打开即全屏 + 长按菜单 + 状态栏隐藏 + 自动全屏开关）；新增 .docx（mammoth，BSD-2）/ .xlsx（SheetJS CE，Apache-2.0）/ .pdf（react-native-pdf，MIT）阅读
- 产物：87,905,963 B ≈ 83.8 MB（体积增长来自两个新原生依赖与 JS 包内新增的 mammoth/xlsx）
- 方式：`gradlew.bat assembleRelease`，构建耗时约 5.5 分钟（新原生依赖 react-native-pdf / react-native-blob-util / saf-tree readAsBase64 首次编译，未执行 prebuild，autolinking 自动接入）

### 更早记录

- 日期：2026-10-26（第二次）
- 版本：1.1.1（versionCode 10）
- 变更：目录导入进度浮层（阶段 + 实时计数 + 取消）、md 打开卡转圈修复（读取超时 + 原生优先 + loading 状态机）
- 产物：`android\app\build\outputs\apk\release\app-release.apk`（67,684,799 B ≈ 64.5 MB）
- 签名：V2，`CN=LZX Reader, OU=Mobile, O=LZX`（沿用 `android/app/release.keystore`，可直接覆盖安装）
- 方式：`gradlew.bat assembleRelease`，构建耗时约 1 分钟（仅 JS/TS 改动，未执行 prebuild）
