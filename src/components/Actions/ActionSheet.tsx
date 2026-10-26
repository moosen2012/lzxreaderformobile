import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';

export interface SheetAction {
  icon: string;
  label: string;
  danger?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  theme: Theme;
  /** 标题（文件名 / 目录名） */
  title: string;
  /** 副标题（大小 · 时间 / 路径），可省 */
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}

/**
 * 底部操作单（设计稿 §7.4）。
 * 不用 ActionSheetIOS：跨平台一致、可控样式、危险项可单独红色分组。
 */
export const ActionSheet: React.FC<ActionSheetProps> = ({
  visible,
  theme,
  title,
  subtitle,
  actions,
  onClose,
}) => {
  // Modal 渲染在根容器之外，拿不到根容器的 paddingBottom；底部"取消"必须自己让开手势条
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="关闭操作菜单">
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: 8 + insets.bottom }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.header, { borderBottomColor: theme.separator }]}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.textTertiary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {actions.map((action, index) => (
            <TouchableOpacity
              key={action.label}
              style={[
                styles.actionRow,
                index < actions.length - 1
                  ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator }
                  : null,
              ]}
              onPress={() => {
                onClose();
                action.onPress();
              }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Ionicons
                name={action.icon as keyof typeof Ionicons.glyphMap}
                size={18}
                color={action.danger ? theme.danger : theme.text}
              />
              <Text style={[styles.actionLabel, { color: action.danger ? theme.danger : theme.text }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.cancelButton, { borderTopColor: theme.separator }]}
            onPress={onClose}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="取消"
          >
            <Text style={[styles.cancelLabel, { color: theme.textSecondary }]}>取消</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  actionLabel: {
    fontSize: 15,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
