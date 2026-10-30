import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary/ErrorBoundary';
import { useReaderStore } from './src/store/readerStore';
import { startFileIndexSync } from './src/store/fileIndexSync';
import { getTheme } from './src/styles/themes';

export default function App() {
  const themeMode = useReaderStore((state) => state.theme);
  const readerFullscreen = useReaderStore((state) => state.readerFullscreen);
  const rightPane = useReaderStore((state) => state.rightPane);
  const theme = getTheme(themeMode);
  const [indexReady, setIndexReady] = useState(false);

  /**
   * 全屏阅读时连状态栏一起隐藏 —— 正文真正占满整块屏幕。
   * 只在"右栏确实是阅读器"时隐藏：退出阅读（回目录）后状态栏必须立刻回来，
   * 否则用户在文件列表里看不到时间/电量，会以为是系统卡了。
   */
  const immersive = readerFullscreen && rightPane === 'reader';

  /**
   * 原生平台的文件索引来自 `documentDirectory/library/index.json`（见 store/fileIndexSync）。
   * 水合完成前先不渲染主界面，否则会先闪一下"还没有文件"再突然填满整个列表。
   * web 端没有文件系统，sync 会立即返回（索引仍随 AsyncStorage 持久化）。
   */
  useEffect(() => {
    let cancelled = false;
    void startFileIndexSync().finally(() => {
      if (!cancelled) setIndexReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} hidden={immersive} />
        {indexReady ? (
          <AppNavigator />
        ) : (
          <View style={{ flex: 1, backgroundColor: theme.background }} />
        )}
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
