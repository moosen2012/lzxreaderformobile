import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import WebView from 'react-native-webview';
import type { CodeTheme } from '../../types';
import {
  generateCodeHtml,
  highlightCode,
  getHighlightThemeCss,
  getHighlightBgColor,
} from '../../utils/markdownHelper';

interface CodeBlockProps {
  code: string;
  language: string;
  codeTheme: CodeTheme;
  isDark: boolean;
  wordWrap?: boolean;
}

// Web 平台专用渲染：react-native-webview 不支持 web，直接用 highlight.js 生成高亮 HTML
function WebCodeBlock({ code, language, codeTheme, isDark, wordWrap = false }: CodeBlockProps) {
  const highlightedCode = useMemo(
    () => highlightCode(code, language),
    [code, language]
  );

  const bgColor = getHighlightBgColor(codeTheme, isDark);
  const textColor = isDark ? '#D4D4D4' : '#24292E';
  // 主题 CSS 必须跟着 isDark 走，否则深色模式会出现"深底 + 深色 token"
  const themeCss = getHighlightThemeCss(codeTheme, isDark);

  const preStyle = wordWrap
    ? 'overflow-x:hidden;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;'
    : 'overflow-x:auto;white-space:pre;';
  const codeStyle = wordWrap
    ? 'padding:0;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;'
    : 'padding:0;white-space:pre;';

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
        <style>${themeCss}</style>
        <pre style="margin:0;padding:16px;background:${bgColor};color:${textColor};font-family:'SF Mono',Menlo,Consolas,monospace;font-size:14px;line-height:1.6;min-height:100px;${preStyle}"><code class="hljs" style="${codeStyle}">${highlightedCode}</code></pre>
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
    // 预高亮后内容为静态 HTML，少量延迟即可获取准确高度
    setTimeout(sendHeight, 50);
    setTimeout(sendHeight, 150);
    // 窗口大小变化时也重新发送
    window.addEventListener('resize', sendHeight);
  })();
  true;
`;

const MIN_HEIGHT = 200;
const isWeb = Platform.OS === 'web';

/**
 * 原生平台：WebView 渲染（预高亮 HTML，高度由页面 postMessage 回来）。
 * 注意 hooks 只能在组件内部无条件调用，所以平台判断放在模块级，
 * 而不是在组件函数里 `if (Platform.OS === 'web') return ...` 之后再调 useState。
 */
const NativeCodeBlockImpl: React.FC<CodeBlockProps> = ({
  code,
  language,
  codeTheme,
  isDark,
  wordWrap = false,
}) => {
  const [webViewHeight, setWebViewHeight] = useState(0);

  const html = useMemo(
    () => generateCodeHtml(code, language, codeTheme, isDark, wordWrap),
    [code, language, codeTheme, isDark, wordWrap]
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

  // 计算最终高度：有内容高度用内容高度，否则用最小高度
  const finalHeight = webViewHeight > 0 ? webViewHeight : MIN_HEIGHT;

  return (
    <View style={[styles.container, { height: finalHeight }]}>
      <WebView
        source={{ html }}
        style={[styles.webview, { height: finalHeight }]}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        injectedJavaScript={HEIGHT_DETECTION_SCRIPT}
        onMessage={handleMessage}
      />
    </View>
  );
};

const NativeCodeBlock: React.FC<CodeBlockProps> = React.memo(
  NativeCodeBlockImpl,
  (prev, next) =>
    prev.code === next.code &&
    prev.language === next.language &&
    prev.codeTheme === next.codeTheme &&
    prev.isDark === next.isDark &&
    prev.wordWrap === next.wordWrap
);

/** Web 平台没有 react-native-webview，直接用原生 HTML 渲染 */
export const CodeBlock: React.FC<CodeBlockProps> = isWeb ? WebCodeBlock : NativeCodeBlock;

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
