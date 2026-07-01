import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { Theme } from '../../styles/themes';

interface TextRendererProps {
  content: string;
  theme: Theme;
  fontSize: number;
}

export const TextRenderer: React.FC<TextRendererProps> = ({ content, theme, fontSize }) => {
  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <Text
          style={{
            color: theme.text,
            fontSize: fontSize,
            lineHeight: fontSize * 1.7,
            fontFamily: 'Menlo',
          }}
        >
          {content}
        </Text>
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
  },
});
