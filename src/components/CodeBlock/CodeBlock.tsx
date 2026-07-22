import React, { useMemo, useState, useCallback } from 'react';
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

// 注入 JS：在内容加载完成后，将实际高度通过 postMessage 发送出来
const HEIGHT_DETECTION_SCRIPT = `
  (function() {
    function sendHeight() {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      window.ReactNativeWebView.postMessage(JSON.stringify({ height: height }));
    }
    // 初始发送
    sendHeight();
    // highlight.js 渲染完成后可能改变高度，延迟再发一次
    setTimeout(sendHeight, 100);
    setTimeout(sendHeight, 300);
    // 窗口大小变化时也重新发送
    window.addEventListener('resize', sendHeight);
  })();
  true;
`;

export const CodeBlock: React.FC<CodeBlockProps> = React.memo(({ code, language, codeTheme, isDark }) => {
  const [webViewHeight, setWebViewHeight] = useState(0);

  const html = useMemo(
    () => generateCodeHtml(code, language, codeTheme, isDark),
    [code, language, codeTheme, isDark]
  );

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (typeof data.height === 'number' && data.height > 0) {
        setWebViewHeight(data.height);
      }
    } catch {
      // 忽略解析错误
    }
  }, []);

  return (
    <View style={[styles.container, { height: Math.max(webViewHeight, 40) }]}>
      <WebView
        source={{ html }}
        style={[styles.webview, { height: Math.max(webViewHeight, 40) }]}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        injectedJavaScript={HEIGHT_DETECTION_SCRIPT}
        onMessage={handleMessage}
      />
    </View>
  );
}, (prev, next) => {
  return prev.code === next.code && prev.language === next.language && prev.codeTheme === next.codeTheme && prev.isDark === next.isDark;
});

CodeBlock.displayName = 'CodeBlock';

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 8,
  },
  webview: {
    backgroundColor: 'transparent',
  },
});
