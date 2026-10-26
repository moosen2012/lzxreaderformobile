import Constants from 'expo-constants';

/**
 * 应用版本号：与 app.json 的 expo.version 对应。
 * expo-constants 在 bare/prebuild 工作流里会把 app.json 烧进运行时清单，
 * 读不到时兜底，保证 UI 上永远有版本可看。
 */
export const APP_NAME = 'LZX Reader';
export const APP_VERSION = Constants.expoConfig?.version ?? '1.1.0';
