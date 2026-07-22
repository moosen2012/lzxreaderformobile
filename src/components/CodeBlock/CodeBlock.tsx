import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import WebView from 'react-native-webview';
import hljs from 'highlight.js';
import type { CodeTheme } from '../../types';
import {
  generateCodeHtml,
  getHighlightThemeUrl,
  getHighlightBgColor,
  escapeHtml,
} from '../../utils/markdownHelper';

interface CodeBlockProps {
  code: string;
  language: string;
  codeTheme: CodeTheme;
  isDark: boolean;
}

// Web 平台专用渲染：react-native-webview 不支持 web，直接用 highlight.js 生成高亮 HTML
const WebCodeBlock: React.FC<CodeBlockProps> = ({ code, language, codeTheme, isDark }) => {
  const highlightedCode = useMemo(() => {
    try {
      if (language === 'plaintext' || !language) {
        return escapeHtml(code);
      }
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(code);
    }
  }, [code, language]);

  const bgColor = getHighlightBgColor(codeTheme, isDark);
  const textColor = isDark ? '#D4D4D4' : '#24292E';

  // web 平台直接返回原生 div，用 dangerouslySetInnerHTML 注入高亮 HTML
  return React.createElement('div', {
    style: {
      borderRadius: 8,
      minHeight: 100,
      backgroundColor: bgColor,
      alignSelf: 'stretch',
    },
    dangerouslySetInnerHTML: {
      __html: `
        <link rel="stylesheet" href="${getHighlightThemeUrl(codeTheme)}">
        <pre style="margin:0;padding:16px;overflow-x:auto;background:${bgColor};color:${textColor};font-family:'SF Mono',Menlo,Consolas,monospace;font-size:14px;line-height:1.6;white-space:pre;min-height:100px;"><code class="hljs">${highlightedCode}</code></pre>
      `,
    },
  });
};

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

const MIN_HEIGHT = 200;

export const CodeBlock: React.FC<CodeBlockProps> = React.memo(({ code, language, codeTheme, isDark }) => {
  // Web 平台使用原生 HTML 渲染，避免 react-native-webview 不支持 web 导致空白
  if (Platform.OS === 'web') {
    return <WebCodeBlock code={code} language={language} codeTheme={codeTheme} isDark={isDark} />;
  }

  const [webViewHeight, setWebViewHeight] = useState(0);
  const [loaded, setLoaded] = useState(false);

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

  const handleLoadEnd = useCallback(() => {
    setLoaded(true);
  }, []);

  // 计算最终高度：有内容高度用内容高度，否则用最小高度
  const finalHeight = webViewHeight > 0 ? webViewHeight : MIN_HEIGHT;

  return (
    <View style={[styles.container, { height: finalHeight }]}>
      <WebView
        source={{ html }}
        style={[styles.webview, { height: finalHeight }]}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        injectedJavaScript={HEIGHT_DETECTION_SCRIPT}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
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
  webContainer: {
    borderRadius: 8,
    minHeight: 100,
    // web 平台让内部 HTML 内容自然撑开高度
    alignSelf: 'stretch',
  },
  webview: {
    backgroundColor: 'transparent',
  },
});
