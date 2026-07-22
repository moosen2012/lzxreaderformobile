import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { CodeBlock } from '../CodeBlock/CodeBlock';
import type { Theme } from '../../styles/themes';
import type { CodeTheme } from '../../types';

interface CodeRendererProps {
  content: string;
  language: string;
  theme: Theme;
  codeTheme: CodeTheme;
  isDark: boolean;
}

export const CodeRenderer: React.FC<CodeRendererProps> = ({
  content,
  language,
  codeTheme,
  isDark,
}) => {
  const html = useMemo(
    () => (
      <CodeBlock
        code={content}
        language={language}
        codeTheme={codeTheme}
        isDark={isDark}
      />
    ),
    [content, language, codeTheme, isDark]
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.content}>
        {html}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    minHeight: 100,
  },
});
