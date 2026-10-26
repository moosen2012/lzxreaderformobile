import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';

export const ENTRY_ROW_HEIGHT = 48;

interface EntryRowProps {
  theme: Theme;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  meta?: string;
  isActive?: boolean;
  isBookmarked?: boolean;
  /** 选择模式下勾选态：行首显示勾选框 */
  isSelected?: boolean;
  selectionMode?: boolean;
  showArrow?: boolean;
  /** 行尾 ··· 按钮（可发现性：长按是隐藏手势，··· 常驻可见） */
  onMore?: () => void;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
}

/**
 * 目录内容列表的统一行（设计稿 §8.1 EntryRow）：
 * 列表行：图标 + 标题 + 元信息 + 收藏标记 + 行尾"···"操作入口，选择模式下左侧换成勾选框。
 * 箭头/··· 与行主体是两个独立热区，触控热区 ≥ 44×44。
 */
export const EntryRow: React.FC<EntryRowProps> = ({
  theme,
  iconName,
  iconColor,
  title,
  meta,
  isActive = false,
  isBookmarked = false,
  isSelected = false,
  selectionMode = false,
  showArrow = false,
  onMore,
  onPress,
  onLongPress,
  accessibilityLabel,
}) => (
  <View
    style={[
      styles.row,
      {
        backgroundColor: isSelected ? theme.primaryLight : isActive ? theme.primaryLight : 'transparent',
        borderBottomColor: theme.separator,
      },
    ]}
  >
    {selectionMode ? (
      <View style={styles.checkbox}>
        <Ionicons
          name={isSelected ? 'checkbox' : 'square-outline'}
          size={20}
          color={isSelected ? theme.primary : theme.textTertiary}
        />
      </View>
    ) : null}

    <TouchableOpacity
      style={styles.main}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={iconName} size={18} color={iconColor} style={styles.icon} />

      <Text
        style={[styles.title, { color: isActive && !isSelected ? theme.primary : theme.text }]}
        numberOfLines={1}
      >
        {title}
      </Text>

      {isBookmarked ? (
        <Ionicons name="bookmark" size={12} color={theme.primary} style={styles.bookmark} />
      ) : null}

      {meta ? (
        <Text style={[styles.meta, { color: theme.textTertiary }]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </TouchableOpacity>

    {showArrow && !selectionMode ? (
      <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} style={styles.trailing} />
    ) : null}

    {onMore && !selectionMode ? (
      <TouchableOpacity
        style={styles.moreButton}
        onPress={onMore}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={`${title} 的更多操作`}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
      </TouchableOpacity>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ENTRY_ROW_HEIGHT,
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 44,
    alignItems: 'center',
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingLeft: 16,
  },
  icon: {
    marginRight: 12,
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
  },
  bookmark: {
    marginHorizontal: 6,
  },
  meta: {
    fontSize: 12,
    marginLeft: 8,
  },
  trailing: {
    marginHorizontal: 6,
  },
  moreButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
