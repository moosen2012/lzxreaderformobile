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
  const theme = getTheme(themeMode);
  const [indexReady, setIndexReady] = useState(false);

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
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        {indexReady ? (
          <AppNavigator />
        ) : (
          <View style={{ flex: 1, backgroundColor: theme.background }} />
        )}
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
