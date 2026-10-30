import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { Theme } from '../../styles/themes';
import type { ScrollTouchProps } from '../../hooks/useLongPressScroll';

interface TextRendererProps {
  content: string;
  theme: Theme;
  fontSize: number;
  /** 长按唤出菜单（挂在 ScrollView 上，不抢 responder，滚动不受影响） */
  scrollTouchProps?: ScrollTouchProps;
}

export const TextRenderer: React.FC<TextRendererProps> = ({
  content,
  theme,
  fontSize,
  scrollTouchProps,
}) => {
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      showsVerticalScrollIndicator={false}
      {...scrollTouchProps}
    >
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
