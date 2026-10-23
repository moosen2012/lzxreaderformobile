import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import WebView from 'react-native-webview';
import { generateMermaidHtml } from '../../utils/markdownHelper';

interface MermaidBlockProps {
  code: string;
  isDark: boolean;
  /** 兜底代码块的前景色（渲染失败或 Web 端降级时使用） */
  textColor?: string;
  /** 兜底代码块的背景色 */
  backgroundColor?: string;
  /** 边框色 */
  borderColor?: string;
}

interface WebViewMessage {
  type: 'height' | 'error';
  height?: number;
  message?: string;
}

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 2000;
const isWeb = Platform.OS === 'web';

export const MermaidBlock: React.FC<MermaidBlockProps> = React.memo(
  ({
    code,
    isDark,
    textColor = '#24292E',
    backgroundColor = 'transparent',
    borderColor = '#E5E5EA',
  }) => {
    const [height, setHeight] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const html = useMemo(
      () => generateMermaidHtml(code, isDark, backgroundColor),
      [code, isDark, backgroundColor]
    );

    const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as WebViewMessage;
        if (payload.type === 'height' && typeof payload.height === 'number' && payload.height > 0) {
          setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, payload.height)));
        } else if (payload.type === 'error') {
          setError(payload.message ?? '图表渲染失败');
        }
      } catch {
        // 忽略非 JSON 消息
      }
    }, []);

    // Web 端 react-native-webview 不可用，直接降级为源码展示，避免白屏
    if (isWeb || error) {
      return (
        <View style={[styles.fallback, { borderColor, backgroundColor }]}>
          <Text style={[styles.hint, { color: error ? '#D73A49' : textColor }]}>
            {error ? `图表渲染失败：${error}` : 'Mermaid 图表（Web 端暂不支持渲染，请在移动端查看）'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text selectable style={[styles.code, { color: textColor }]}>
              {code}
            </Text>
          </ScrollView>
        </View>
      );
    }

    return (
      <View style={[styles.container, { height: height || MIN_HEIGHT }]}>
        <WebView
          source={{ html }}
          style={styles.webview}
          scrollEnabled={false}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          originWhitelist={['*']}
          onMessage={handleMessage}
        />
      </View>
    );
  },
  (prev, next) =>
    prev.code === next.code &&
    prev.isDark === next.isDark &&
    prev.backgroundColor === next.backgroundColor &&
    prev.textColor === next.textColor
);

MermaidBlock.displayName = 'MermaidBlock';

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fallback: {
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  hint: {
    fontSize: 12,
    opacity: 0.7,
  },
  code: {
    fontFamily: 'Menlo',
    fontSize: 12,
    lineHeight: 18,
  },
});
