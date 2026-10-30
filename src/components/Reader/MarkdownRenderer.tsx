import React, { useMemo } from 'react';
import {
  StyleSheet,
  View,
  type TextStyle,
  type ViewStyle,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Markdown, { Renderer } from 'react-native-marked';
import type { Theme } from '../../styles/themes';
import type { CodeTheme } from '../../types';
import type { ScrollTouchProps } from '../../hooks/useLongPressScroll';
import { CodeBlock } from '../CodeBlock/CodeBlock';
import { MermaidBlock } from '../MermaidBlock/MermaidBlock';
import { MathBlock, isInlineMathNode } from '../MathBlock/MathBlock';
import { preprocessMarkdown, INLINE_MATH_MARKER } from '../../utils/markdownPreprocess';
import { decodeEntities } from '../../utils/htmlEntities';

interface MarkdownRendererProps {
  content: string;
  theme: Theme;
  fontSize: number;
  codeTheme: CodeTheme;
  isDark: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /**
   * 长按唤出菜单用的触摸回调。
   * 必须挂到内层 FlatList 上：外面套 Pressable 会抢 responder，
   * 直接让列表滚不动（Android 上 blockNativeResponder 会截断原生滚动）。
   */
  scrollTouchProps?: ScrollTouchProps;
}

/** 含行内公式的段落需要横向流式排版，否则公式会被挤到单独一行 */
const INLINE_FLOW_STYLE: ViewStyle = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'baseline',
};

// 自定义渲染器：拦截 code/codespan 实现代码高亮、Mermaid 图表、数学公式
class CustomRenderer extends Renderer {
  private codeTheme: CodeTheme;
  private isDark: boolean;
  private fontSize: number;
  private theme: Theme;

  constructor(codeTheme: CodeTheme, isDark: boolean, fontSize: number, theme: Theme) {
    super();
    this.codeTheme = codeTheme;
    this.isDark = isDark;
    this.fontSize = fontSize;
    this.theme = theme;
  }

  override code(
    text: string,
    language?: string,
    _containerStyle?: unknown,
    _textStyle?: unknown
  ): React.ReactNode {
    const key = this.getKey();

    if (language === 'mermaid') {
      return (
        <MermaidBlock
          key={key}
          code={text}
          isDark={this.isDark}
          textColor={this.theme.text}
          backgroundColor={this.theme.codeBackground}
          borderColor={this.theme.border}
        />
      );
    }

    if (language === 'katex' || language === 'math' || language === 'tex') {
      return (
        <MathBlock key={key} formula={text} fontSize={this.fontSize} color={this.theme.text} />
      );
    }

    return (
      <CodeBlock
        key={key}
        code={text}
        language={language || 'plaintext'}
        codeTheme={this.codeTheme}
        isDark={this.isDark}
      />
    );
  }

  override codespan(text: string, styles?: unknown): React.ReactNode {
    if (text.startsWith(INLINE_MATH_MARKER)) {
      return (
        <MathBlock
          key={this.getKey()}
          formula={text.slice(INLINE_MATH_MARKER.length)}
          fontSize={this.fontSize}
          color={this.theme.text}
          inline
        />
      );
    }
    return super.codespan(text, styles as never);
  }

  /**
   * marked 会把正文里的 `&` `<` `>` 转义成 `&amp;` `&lt;` `&gt;`，
   * 而默认的 `text()` / `html()` 只是把字符串塞进 `<Text>`，不会解码 ——
   * 结果"a & b"在屏幕上显示成"a &amp; b"（docx 转过来的文档几乎必现）。
   * 这里在最后一层把实体还原回字符。
   */
  override text(text: string | React.ReactNode[], styles?: TextStyle): React.ReactNode {
    return super.text(typeof text === 'string' ? decodeEntities(text) : text, styles);
  }

  override html(text: string | React.ReactNode[], styles?: TextStyle): React.ReactNode {
    return super.html(typeof text === 'string' ? decodeEntities(text) : text, styles);
  }

  /**
   * 段落里一旦有行内公式，就把默认的纵向布局切成横向流式布局，
   * 这样"设 f(x) 为..."这类句子的文字和公式就能排在同一行。
   */
  override paragraph(children: React.ReactNode[], styles?: ViewStyle): React.ReactNode {
    const hasInlineMath = children.some(isInlineMathNode);
    return (
      <View key={this.getKey()} style={hasInlineMath ? [styles, INLINE_FLOW_STYLE] : styles}>
        {children}
      </View>
    );
  }
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  theme,
  fontSize,
  codeTheme,
  isDark,
  onScroll,
  scrollTouchProps,
}) => {
  const processedContent = useMemo(() => preprocessMarkdown(content), [content]);

  const renderer = useMemo(
    () => new CustomRenderer(codeTheme, isDark, fontSize, theme),
    [codeTheme, isDark, fontSize, theme]
  );

  const markedStyles = useMemo(
    () => ({
      h1: {
        fontSize: fontSize + 8,
        fontWeight: 'bold',
        color: theme.text,
        marginBottom: 12,
        marginTop: 24,
        lineHeight: (fontSize + 8) * 1.4,
      },
      h2: {
        fontSize: fontSize + 6,
        fontWeight: 'bold',
        color: theme.text,
        marginBottom: 10,
        marginTop: 20,
        lineHeight: (fontSize + 6) * 1.4,
      },
      h3: {
        fontSize: fontSize + 4,
        fontWeight: 'bold',
        color: theme.text,
        marginBottom: 8,
        marginTop: 16,
        lineHeight: (fontSize + 4) * 1.4,
      },
      h4: {
        fontSize: fontSize + 2,
        fontWeight: 'bold',
        color: theme.text,
        marginBottom: 6,
        marginTop: 14,
        lineHeight: (fontSize + 2) * 1.4,
      },
      h5: {
        fontSize: fontSize,
        fontWeight: 'bold',
        color: theme.text,
        marginBottom: 6,
        marginTop: 12,
        lineHeight: fontSize * 1.4,
      },
      h6: {
        fontSize: fontSize - 1,
        fontWeight: 'bold',
        color: theme.textSecondary,
        marginBottom: 6,
        marginTop: 12,
        lineHeight: (fontSize - 1) * 1.4,
      },
      paragraph: {
        marginTop: 8,
        marginBottom: 8,
        color: theme.text,
        fontSize,
        lineHeight: fontSize * 1.7,
      },
      text: {
        color: theme.text,
        fontSize,
        lineHeight: fontSize * 1.7,
      },
      strong: {
        fontWeight: 'bold',
        color: theme.text,
        fontSize,
        lineHeight: fontSize * 1.7,
      },
      em: {
        fontStyle: 'italic' as const,
        color: theme.text,
        fontSize,
        lineHeight: fontSize * 1.7,
      },
      strikethrough: {
        textDecorationLine: 'line-through',
        color: theme.textSecondary,
        fontSize,
        lineHeight: fontSize * 1.7,
      },
      link: {
        color: theme.link,
        textDecorationLine: 'underline',
        fontSize,
        lineHeight: fontSize * 1.7,
      },
      blockquote: {
        backgroundColor: theme.surfaceAlt,
        borderLeftWidth: 3,
        borderLeftColor: theme.primary,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginVertical: 8,
        borderRadius: 4,
      },
      codespan: {
        backgroundColor: theme.inlineCodeBackground,
        color: theme.codeText,
        padding: 2,
        paddingHorizontal: 6,
        borderRadius: 4,
        fontFamily: 'Menlo',
        fontSize: fontSize - 1,
      },
      code: {
        backgroundColor: theme.codeBackground,
        borderRadius: 8,
        marginVertical: 8,
        overflow: 'hidden',
      },
      list: {
        marginVertical: 8,
      },
      li: {
        color: theme.text,
        marginVertical: 4,
        fontSize,
        lineHeight: fontSize * 1.7,
      },
      table: {
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 6,
        marginVertical: 8,
        overflow: 'hidden',
      },
      tableRow: {
        flexDirection: 'row',
      },
      tableCell: {
        padding: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.border,
        color: theme.text,
      },
      hr: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.separator,
        marginVertical: 16,
      },
      image: {
        borderRadius: 8,
        marginVertical: 8,
      },
    }),
    [theme, fontSize]
  );

  const userTheme = useMemo(
    () => ({
      colors: {
        code: theme.codeBackground,
        link: theme.link,
        text: theme.text,
        border: theme.border,
      },
    }),
    [theme]
  );

  return (
    <Markdown
      value={processedContent}
      styles={markedStyles as never}
      theme={userTheme}
      renderer={renderer}
      flatListProps={{
        ...scrollTouchProps,
        onScroll,
        scrollEventThrottle: 32,
        contentContainerStyle: { padding: 16 },
        showsVerticalScrollIndicator: false,
        style: { backgroundColor: theme.background },
      }}
    />
  );
};
