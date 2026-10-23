import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import { useReaderStore } from '../../store/readerStore';
import { useResponsive } from '../../utils/responsive';
import { SidebarTree } from './SidebarTree';

interface SidebarProps {
  theme: Theme;
}

export const Sidebar: React.FC<SidebarProps> = ({ theme }) => {
  const setSidebarOpen = useReaderStore((state) => state.setSidebarOpen);
  const setDrawerOpen = useReaderStore((state) => state.setDrawerOpen);
  const fileCount = useReaderStore((state) => state.files.length);
  const { isWide } = useResponsive();

  const handleClose = () => {
    if (isWide) setSidebarOpen(false);
    else setDrawerOpen(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <View style={[styles.header, { borderBottomColor: theme.separator }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]}>目录</Text>
          <Text style={[styles.count, { color: theme.textTertiary }]}>{fileCount}</Text>
        </View>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={isWide ? '收起目录树' : '关闭目录树'}
        >
          <Ionicons
            name={isWide ? 'chevron-back' : 'close'}
            size={18}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <SidebarTree theme={theme} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingLeft: 16,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  count: {
    fontSize: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
