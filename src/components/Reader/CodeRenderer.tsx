import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
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

  return <View style={styles.container}>{html}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
