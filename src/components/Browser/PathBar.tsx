import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import { getBreadcrumbs } from '../../utils/fileTree';

interface PathBarProps {
  theme: Theme;
  currentDirPath: string;
  onNavigate: (path: string) => void;
}

/** 超过 MAX_VISIBLE 段时折叠成「全部 › … › 尾段」；点 … 回到折叠段里最深的一层 */
const MAX_VISIBLE = 4;

/**
 * 可横滑面包屑（设计稿 §4.3 路径栏）。
 * 替代原来顶栏标题位"中间省略"的纯文本路径：
 * - 末段加粗高亮，其余段可点直接跳转；
 * - 深层路径折叠成 …，不再挤占宽度。
 */
export const PathBar: React.FC<PathBarProps> = ({ theme, currentDirPath, onNavigate }) => {
  const scrollRef = useRef<ScrollView>(null);
  const crumbs = useMemo(() => getBreadcrumbs(currentDirPath), [currentDirPath]);

  // 路径变化后滚到末段，保证"当前在哪"始终可见
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [currentDirPath]);

  const folded = crumbs.length > MAX_VISIBLE;
  // 折叠时保留：根（全部）+ … + 最后两段
  const visible = folded
    ? [crumbs[0], crumbs[crumbs.length - 3], crumbs[crumbs.length - 2], crumbs[crumbs.length - 1]]
    : crumbs;
  const foldTarget = crumbs[crumbs.length - 3]?.path ?? '';

  const renderCrumb = (crumb: { name: string; path: string }, isLast: boolean) => (
    <React.Fragment key={`${crumb.path}:${crumb.name}`}>
      {isLast ? (
        <Text style={[styles.crumbCurrent, { color: theme.text }]} numberOfLines={1}>
          {crumb.name}
        </Text>
      ) : (
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => onNavigate(crumb.path)}
          accessibilityRole="button"
          accessibilityLabel={`跳转到 ${crumb.name}`}
        >
          <Text style={[styles.crumb, { color: theme.textSecondary }]} numberOfLines={1}>
            {crumb.name}
          </Text>
        </TouchableOpacity>
      )}
      {!isLast ? (
        <Ionicons name="chevron-forward" size={12} color={theme.textTertiary} style={styles.chevron} />
      ) : null}
    </React.Fragment>
  );

  const items: React.ReactNode[] = [];
  visible.forEach((crumb, index) => {
    const isLast = index === visible.length - 1;
    if (folded && index === 1) {
      items.push(
        <React.Fragment key="fold">
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => onNavigate(foldTarget)}
            accessibilityRole="button"
            accessibilityLabel="展开折叠的上级目录"
          >
            <Text style={[styles.crumb, { color: theme.textTertiary }]}>…</Text>
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={12} color={theme.textTertiary} style={styles.chevron} />
        </React.Fragment>
      );
      return;
    }
    items.push(renderCrumb(crumb, isLast));
  });

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {items}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 36,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  crumb: {
    fontSize: 13,
    maxWidth: 140,
  },
  crumbCurrent: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 180,
  },
  chevron: {
    marginHorizontal: 5,
  },
});
