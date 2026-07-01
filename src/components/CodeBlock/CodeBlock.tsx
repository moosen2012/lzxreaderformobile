import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';
import type { CodeTheme } from '../../types';
import { generateCodeHtml } from '../../utils/markdownHelper';

interface CodeBlockProps {
  code: string;
  language: string;
  codeTheme: CodeTheme;
  isDark: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = React.memo(({ code, language, codeTheme, isDark }) => {
  const html = useMemo(
    () => generateCodeHtml(code, language, codeTheme, isDark),
    [code, language, codeTheme, isDark]
  );

  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        style={styles.webview}
        scrollEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
      />
    </View>
  );
}, (prev, next) => {
  return prev.code === next.code && prev.language === next.language && prev.codeTheme === next.codeTheme && prev.isDark === next.isDark;
});

CodeBlock.displayName = 'CodeBlock';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 100,
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 8,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
