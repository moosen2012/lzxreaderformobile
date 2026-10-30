import appConfig from '../../app.json';

/**
 * 应用版本号：**唯一来源是 app.json 的 `expo.version`**，
 * 与 `android/app/build.gradle` 里读 versionName 的字段是同一个。
 *
 * 之前用 `expo-constants` 的 `Constants.expoConfig?.version`，
 * release 包里拿到的是构建期清单的旧值（菜单底部一直显示 v1.0.0），
 * 覆盖安装后根本没法确认装的是哪一个包 —— 覆盖测试时特别误导。
 * 直接 import app.json：Metro 会把 JSON 内联进 bundle，版本号不会和构建产物脱节。
 */
export const APP_NAME = 'LZX Reader';
export const APP_VERSION = appConfig.expo.version;
