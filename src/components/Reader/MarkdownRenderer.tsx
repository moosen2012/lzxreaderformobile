import React, { useMemo } from 'react';
import {
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Markdown, { Renderer } from 'react-native-marked';
import type { Theme } from '../../styles/themes';
import type { CodeTheme } from '../../types';
import { CodeBlock } from '../CodeBlock/CodeBlock';
import { MermaidBlock } from '../MermaidBlock/MermaidBlock';
import { KatexBlock } from '../KatexBlock/KatexBlock';

interface MarkdownRendererProps {
  content: string;
  theme: Theme;
  fontSize: number;
  codeTheme: CodeTheme;
  isDark: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

// 预处理 Markdown：剥离 frontmatter、转换 LaTeX 公式为代码块标记
function preprocessMarkdown(content: string): string {
  // 1. 剥离 YAML frontmatter
  let result = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  // 2. 块级公式 $$...$$ → katex 代码块
  result = result.replace(
    /\$\$([\s\S]+?)\$\$/g,
    (_, math) => `\`\`\`katex\n${math.trim()}\n\`\`\``
  );
  // 3. 行内公式 $...$ → 带标记的行内代码
  result = result.replace(
    /\$([^\n$]+?)\$/g,
    (_, math) => `\`$KATEX$${math}\``
  );
  return result;
}

// 自定义渲染器：拦截 code/codespan 实现代码高亮、Mermaid 图表、KaTeX 公式
class CustomRenderer extends Renderer {
  private codeTheme: CodeTheme;
  private isDark: boolean;

  constructor(codeTheme: CodeTheme, isDark: boolean) {
    super();
    this.codeTheme = codeTheme;
    this.isDark = isDark;
  }

  override code(
    text: string,
    language?: string,
    _containerStyle?: unknown,
    _textStyle?: unknown,
  ): React.ReactNode {
    const key = this.getKey();

    if (language === 'mermaid') {
      return <MermaidBlock key={key} code={text} isDark={this.isDark} />;
    }

    if (language === 'katex') {
      return <KatexBlock key={key} formula={text} isDark={this.isDark} isBlock />;
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
    if (text.startsWith('$KATEX$')) {
      const formula = text.slice(7);
      return (
        <KatexBlock
          key={this.getKey()}
          formula={formula}
          isDark={this.isDark}
          isBlock={false}
        />
      );
    }
    return super.codespan(text, styles as any);
  }
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  theme,
  fontSize,
  codeTheme,
  isDark,
  onScroll,
}) => {
  const processedContent = useMemo(
    () => preprocessMarkdown(content),
    [content]
  );

  const renderer = useMemo(
    () => new CustomRenderer(codeTheme, isDark),
    [codeTheme, isDark]
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
    }) as any,
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
      styles={markedStyles}
      theme={userTheme}
      renderer={renderer}
      flatListProps={{
        onScroll,
        scrollEventThrottle: 16,
        contentContainerStyle: { padding: 16 },
        showsVerticalScrollIndicator: false,
        style: { backgroundColor: theme.background },
      }}
    />
  );
};
