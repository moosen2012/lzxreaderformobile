import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Markdown from 'react-native-markdown-display';
import type { Theme } from '../../styles/themes';
import type { CodeTheme } from '../../types';
import { CodeBlock } from '../CodeBlock/CodeBlock';

interface MarkdownRendererProps {
  content: string;
  theme: Theme;
  fontSize: number;
  codeTheme: CodeTheme;
  isDark: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  theme,
  fontSize,
  codeTheme,
  isDark,
}) => {
  // 自定义 Markdown 样式
  const mdStyle = useMemo(
    () =>
      ({
        body: {
          color: theme.text,
          fontSize: fontSize,
          lineHeight: fontSize * 1.7,
        },
        heading1: {
          fontSize: fontSize + 8,
          fontWeight: 'bold',
          color: theme.text,
          marginBottom: 12,
          marginTop: 24,
        },
        heading2: {
          fontSize: fontSize + 6,
          fontWeight: 'bold',
          color: theme.text,
          marginBottom: 10,
          marginTop: 20,
        },
        heading3: {
          fontSize: fontSize + 4,
          fontWeight: 'bold',
          color: theme.text,
          marginBottom: 8,
          marginTop: 16,
        },
        heading4: {
          fontSize: fontSize + 2,
          fontWeight: 'bold',
          color: theme.text,
          marginBottom: 6,
          marginTop: 14,
        },
        heading5: {
          fontSize: fontSize,
          fontWeight: 'bold',
          color: theme.text,
          marginBottom: 6,
          marginTop: 12,
        },
        heading6: {
          fontSize: fontSize - 1,
          fontWeight: 'bold',
          color: theme.textSecondary,
          marginBottom: 6,
          marginTop: 12,
        },
        paragraph: {
          marginTop: 8,
          marginBottom: 8,
          color: theme.text,
        },
        text: {
          color: theme.text,
        },
        strong: {
          fontWeight: 'bold',
          color: theme.text,
        },
        em: {
          fontStyle: 'italic',
          color: theme.text,
        },
        strikethrough: {
          textDecorationLine: 'line-through',
          color: theme.textSecondary,
        },
        link: {
          color: theme.link,
          textDecorationLine: 'underline',
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
        blockquote_text: {
          color: theme.textSecondary,
          fontStyle: 'italic',
        },
        code_inline: {
          backgroundColor: theme.inlineCodeBackground,
          color: theme.codeText,
          padding: 2,
          paddingHorizontal: 6,
          borderRadius: 4,
          fontFamily: 'Menlo',
          fontSize: fontSize - 1,
        },
        fence: {
          backgroundColor: theme.codeBackground,
          borderRadius: 8,
          marginVertical: 8,
          overflow: 'hidden',
        },
        code_block: {
          backgroundColor: theme.codeBackground,
          borderRadius: 8,
          marginVertical: 8,
          overflow: 'hidden',
        },
        list: {
          marginVertical: 8,
        },
        list_item: {
          marginVertical: 4,
        },
        bullet_list_icon: {
          color: theme.primary,
          marginLeft: 8,
        },
        bullet_list_text: {
          color: theme.text,
        },
        ordered_list_icon: {
          color: theme.primary,
        },
        ordered_list_text: {
          color: theme.text,
        },
        table: {
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 6,
          marginVertical: 8,
          overflow: 'hidden',
        },
        thead: {
          backgroundColor: theme.surfaceAlt,
        },
        th: {
          padding: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          fontWeight: 'bold',
          color: theme.text,
        },
        td: {
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

  // 自定义规则：代码块使用 WebView 高亮
  const rules = useMemo(
    () => ({
      fence: (node: any) => {
        const code = node.content || '';
        const lang = node.sourceInfo || 'plaintext';
        return (
          <CodeBlock
            key={node.key}
            code={code}
            language={lang}
            codeTheme={codeTheme}
            isDark={isDark}
          />
        );
      },
      code_block: (node: any) => {
        const code = node.content || '';
        return (
          <CodeBlock
            key={node.key}
            code={code}
            language="plaintext"
            codeTheme={codeTheme}
            isDark={isDark}
          />
        );
      },
    }),
    [codeTheme, isDark]
  );

  return (
    <View style={styles.container}>
      <Markdown style={mdStyle} rules={rules as any}>
        {content}
      </Markdown>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
});
