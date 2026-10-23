import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';

export const FOLDER_ROW_HEIGHT = 48;

interface FolderRowProps {
  theme: Theme;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  meta?: string;
  isActive?: boolean;
  isBookmarked?: boolean;
  showArrow?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
}

/** 目录内容列表的一行：目录、文件、以及"返回上级"共用同一套排版 */
export const FolderRow: React.FC<FolderRowProps> = ({
  theme,
  iconName,
  iconColor,
  title,
  meta,
  isActive = false,
  isBookmarked = false,
  showArrow = false,
  onPress,
  onLongPress,
  accessibilityLabel,
}) => (
  <TouchableOpacity
    style={[
      styles.row,
      {
        backgroundColor: isActive ? theme.primaryLight : 'transparent',
        borderBottomColor: theme.separator,
      },
    ]}
    onPress={onPress}
    onLongPress={onLongPress}
    delayLongPress={350}
    activeOpacity={0.6}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
  >
    <Ionicons name={iconName} size={18} color={iconColor} style={styles.icon} />

    <Text
      style={[styles.title, { color: isActive ? theme.primary : theme.text }]}
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

    {showArrow ? (
      <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} style={styles.arrow} />
    ) : null}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FOLDER_ROW_HEIGHT,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 14,
  },
  bookmark: {
    marginHorizontal: 6,
  },
  meta: {
    fontSize: 12,
    marginLeft: 8,
  },
  arrow: {
    marginLeft: 6,
  },
});
