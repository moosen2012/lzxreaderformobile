import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import { APP_NAME, APP_VERSION } from '../../utils/appVersion';

interface ReaderMenuProps {
  visible: boolean;
  theme: Theme;
  /** 菜单卡片顶部偏移：阅读器头部高度（全屏时为状态栏高度 + 一点内边距） */
  topOffset: number;
  /** 当前文件名：全屏后标题栏不渲染，菜单要负责告诉用户"在读什么" */
  title?: string;
  /** 当前是否全屏：决定显示"退出全屏"还是"进入全屏" */
  fullscreen: boolean;
  isBookmarked: boolean;
  isDark: boolean;
  onClose: () => void;
  onShare: () => void;
  onToggleBookmark: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onToggleFullscreen: () => void;
  /** 提供时显示"返回目录"（全屏下这是除物理返回键外唯一的退出路径） */
  onBackToFolder?: () => void;
}

interface MenuItem {
  key: string;
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}

/**
 * 阅读器"···"菜单：收拢分享/收藏/设置/主题切换等低频操作。
 * 全屏阅读后它是唯一的操作入口（标题栏不渲染），所以还要承担
 * "退出全屏"和"返回目录"两件事。
 */
export const ReaderMenu: React.FC<ReaderMenuProps> = ({
  visible,
  theme,
  topOffset,
  title,
  fullscreen,
  isBookmarked,
  isDark,
  onClose,
  onShare,
  onToggleBookmark,
  onOpenSettings,
  onToggleTheme,
  onToggleFullscreen,
  onBackToFolder,
}) => {
  const items: MenuItem[] = [];

  if (onBackToFolder) {
    items.push({
      key: 'back',
      icon: 'arrow-back-outline',
      label: '返回目录',
      color: theme.primary,
      onPress: onBackToFolder,
    });
  }

  items.push({
    key: 'fullscreen',
    icon: fullscreen ? 'contract-outline' : 'expand-outline',
    label: fullscreen ? '退出全屏' : '进入全屏',
    color: theme.text,
    onPress: onToggleFullscreen,
  });

  items.push(
    { key: 'share', icon: 'share-outline', label: '分享', color: theme.text, onPress: onShare },
    {
      key: 'bookmark',
      icon: isBookmarked ? 'bookmark' : 'bookmark-outline',
      label: isBookmarked ? '取消收藏' : '收藏',
      color: isBookmarked ? theme.warning : theme.text,
      onPress: onToggleBookmark,
    },
    { key: 'settings', icon: 'settings-outline', label: '设置', color: theme.text, onPress: onOpenSettings },
    {
      key: 'theme',
      icon: isDark ? 'sunny-outline' : 'moon-outline',
      label: isDark ? '切换浅色模式' : '切换深色模式',
      color: theme.text,
      onPress: onToggleTheme,
    }
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="关闭菜单">
        <View
          style={[
            styles.menu,
            { top: topOffset + 4, backgroundColor: theme.headerBackground, borderColor: theme.separator },
          ]}
        >
          {title ? (
            <Text
              style={[styles.title, { color: theme.textSecondary, borderBottomColor: theme.separator }]}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : null}

          {items.map((item, index) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.item,
                index < items.length - 1
                  ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator }
                  : null,
                pressed ? { backgroundColor: theme.surfaceAlt } : null,
              ]}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={18} color={item.color} />
              <Text style={[styles.itemLabel, { color: item.color }]}>{item.label}</Text>
            </Pressable>
          ))}

          {/* 版本标识：覆盖安装后一眼确认是不是新包 */}
          <Text style={[styles.versionText, { color: theme.textTertiary, borderTopColor: theme.separator }]}>
            {APP_NAME} v{APP_VERSION}
          </Text>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  menu: {
    position: 'absolute',
    right: 8,
    minWidth: 190,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  title: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  itemLabel: {
    fontSize: 15,
  },
  versionText: {
    fontSize: 11,
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
