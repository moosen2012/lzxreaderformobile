import type { ThemeMode } from '../types';

export interface Theme {
  mode: ThemeMode;
  // 背景色
  background: string;
  surface: string;
  surfaceAlt: string;
  cardBackground: string;
  // 文字色
  text: string;
  textSecondary: string;
  textTertiary: string;
  // 主题色
  primary: string;
  primaryLight: string;
  // 边框/分割线
  border: string;
  separator: string;
  // 代码相关
  codeBackground: string;
  codeText: string;
  inlineCodeBackground: string;
  // 链接
  link: string;
  // 其他
  danger: string;
  warning: string;
  success: string;
  // 阴影
  shadowColor: string;
  shadowOpacity: number;
  // Header
  headerBackground: string;
  // 输入框
  inputBackground: string;
}

export const lightTheme: Theme = {
  mode: 'light',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F9F9FB',
  cardBackground: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#666666',
  textTertiary: '#999999',
  primary: '#007AFF',
  primaryLight: '#E3F0FF',
  border: '#E5E5EA',
  separator: '#E5E5EA',
  codeBackground: '#F6F8FA',
  codeText: '#24292E',
  inlineCodeBackground: '#EFF1F3',
  link: '#0366D6',
  danger: '#FF3B30',
  warning: '#FF9500',
  success: '#34C759',
  shadowColor: '#000000',
  shadowOpacity: 0.08,
  headerBackground: '#FFFFFF',
  inputBackground: '#F2F2F7',
};

export const darkTheme: Theme = {
  mode: 'dark',
  background: '#000000',
  surface: '#1C1C1E',
  surfaceAlt: '#2C2C2E',
  cardBackground: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: '#999999',
  textTertiary: '#666666',
  primary: '#0A84FF',
  primaryLight: '#1A2333',
  border: '#38383A',
  separator: '#38383A',
  codeBackground: '#2D2D2D',
  codeText: '#D4D4D4',
  inlineCodeBackground: '#2C2C2E',
  link: '#4493F8',
  danger: '#FF453A',
  warning: '#FF9F0A',
  success: '#32D74B',
  shadowColor: '#000000',
  shadowOpacity: 0.3,
  headerBackground: '#1C1C1E',
  inputBackground: '#2C2C2E',
};

export function getTheme(mode: ThemeMode): Theme {
  return mode === 'light' ? lightTheme : darkTheme;
}
