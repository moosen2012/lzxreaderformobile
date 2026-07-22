import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  theme,
  codeTheme,
  isDark,
}) => {
  const [wordWrap, setWordWrap] = useState(false);

  const codeBlock = useMemo(
    () => (
      <CodeBlock
        code={content}
        language={language}
        codeTheme={codeTheme}
        isDark={isDark}
        wordWrap={wordWrap}
      />
    ),
    [content, language, codeTheme, isDark, wordWrap]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {codeBlock}
        </View>
      </ScrollView>

      {/* 换行切换浮动按钮 */}
      <TouchableOpacity
        style={[
          styles.wrapButton,
          {
            backgroundColor: wordWrap ? theme.primary : theme.surface,
            borderColor: wordWrap ? theme.primary : theme.border,
          },
        ]}
        onPress={() => setWordWrap((v) => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={wordWrap ? '关闭自动换行' : '开启自动换行'}
      >
        <Ionicons
          name={wordWrap ? 'text' : 'text-outline'}
          size={16}
          color={wordWrap ? '#FFFFFF' : theme.textSecondary}
        />
        <Text
          style={[
            styles.wrapButtonText,
            { color: wordWrap ? '#FFFFFF' : theme.textSecondary },
          ]}
        >
          {wordWrap ? '换行' : '不换行'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    minHeight: 100,
  },
  wrapButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  wrapButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
