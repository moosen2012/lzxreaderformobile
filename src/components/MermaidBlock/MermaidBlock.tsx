import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';
import { generateMermaidHtml } from '../../utils/markdownHelper';

interface MermaidBlockProps {
  code: string;
  isDark: boolean;
}

export const MermaidBlock: React.FC<MermaidBlockProps> = React.memo(({ code, isDark }) => {
  const html = useMemo(
    () => generateMermaidHtml(code, isDark),
    [code, isDark]
  );

  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
      />
    </View>
  );
}, (prev, next) => {
  return prev.code === next.code && prev.isDark === next.isDark;
});

MermaidBlock.displayName = 'MermaidBlock';

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
