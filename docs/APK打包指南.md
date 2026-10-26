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

- 日期：2026-10-26（第二次）
- 版本：1.1.1（versionCode 10）
- 变更：目录导入进度浮层（阶段 + 实时计数 + 取消）、md 打开卡转圈修复（读取超时 + 原生优先 + loading 状态机）
- 产物：`android\app\build\outputs\apk\release\app-release.apk`（67,684,799 B ≈ 64.5 MB）
- 签名：V2，`CN=LZX Reader, OU=Mobile, O=LZX`（沿用 `android/app/release.keystore`，可直接覆盖安装）
- 方式：`gradlew.bat assembleRelease`，构建耗时约 1 分钟（仅 JS/TS 改动，未执行 prebuild）

### 上一次记录

- 日期：2026-10-26
- 版本：1.1.0（versionCode 9）
- 产物：`android\app\build\outputs\apk\release\app-release.apk`（约 64.5 MB）
- 签名：V2，`CN=LZX Reader, O=LZX`
- 方式：`gradlew.bat assembleRelease`，构建耗时约 2 分钟
