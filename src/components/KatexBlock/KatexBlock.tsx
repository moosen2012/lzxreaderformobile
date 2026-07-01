import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';
import { generateKatexHtml } from '../../utils/markdownHelper';

interface KatexBlockProps {
  formula: string;
  isDark: boolean;
  isBlock: boolean;
}

export const KatexBlock: React.FC<KatexBlockProps> = React.memo(({ formula, isDark, isBlock }) => {
  const html = useMemo(
    () => generateKatexHtml(formula, isDark, isBlock),
    [formula, isDark, isBlock]
  );

  return (
    <View style={isBlock ? styles.blockContainer : styles.inlineContainer}>
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
  return prev.formula === next.formula && prev.isDark === next.isDark && prev.isBlock === next.isBlock;
});

KatexBlock.displayName = 'KatexBlock';

const styles = StyleSheet.create({
  blockContainer: {
    flex: 1,
    minHeight: 40,
    marginVertical: 8,
    overflow: 'hidden',
  },
  inlineContainer: {
    minHeight: 24,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
