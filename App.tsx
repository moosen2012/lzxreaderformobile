import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary/ErrorBoundary';
import { useReaderStore } from './src/store/readerStore';

export default function App() {
  const themeMode = useReaderStore((state) => state.theme);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <AppNavigator />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
