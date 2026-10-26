import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';

interface SelectionBarProps {
  theme: Theme;
  count: number;
  /** 是否有可移动的文件被选中（目录不能跨目录移动） */
  canMove: boolean;
  /** 与应用头同高：短屏 44 / 常规 52，避免选择模式下顶栏突然变高 */
  height?: number;
  onClose: () => void;
  onMove: () => void;
  onDelete: () => void;
}

/**
 * 选择模式顶栏（设计稿 §7.3）：整体替换应用头。
 * 批量动作只保留 移动 / 删除，不做批量重命名（危险操作）。
 */
export const SelectionBar: React.FC<SelectionBarProps> = ({
  theme,
  count,
  canMove,
  height = 52,
  onClose,
  onMove,
  onDelete,
}) => (
  <View
    style={[
      styles.bar,
      { backgroundColor: theme.headerBackground, borderBottomColor: theme.separator, height },
    ]}
  >
    <TouchableOpacity
      style={styles.button}
      onPress={onClose}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel="退出选择模式"
    >
      <Ionicons name="close" size={22} color={theme.text} />
    </TouchableOpacity>

    <Text style={[styles.title, { color: theme.text }]}>已选 {count} 项</Text>

    <TouchableOpacity
      style={[styles.action, !canMove && { opacity: 0.35 }]}
      onPress={canMove ? onMove : undefined}
      disabled={!canMove}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel="移动到其他文件夹"
    >
      <Ionicons name="arrow-redo-outline" size={18} color={canMove ? theme.primary : theme.textTertiary} />
      <Text style={[styles.actionLabel, { color: canMove ? theme.primary : theme.textTertiary }]}>
        移动到
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.action}
      onPress={onDelete}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel="删除所选"
    >
      <Ionicons name="trash-outline" size={18} color={theme.danger} />
      <Text style={[styles.actionLabel, { color: theme.danger }]}>删除</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 36,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
