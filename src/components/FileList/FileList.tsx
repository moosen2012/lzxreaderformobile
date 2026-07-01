import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { FileItem } from '../../types';
import { FileListItem } from './FileListItem';

interface FileListProps {
  files: FileItem[];
  theme: Theme;
  currentFileId: string | null;
  bookmarks: string[];
  onFilePress: (file: FileItem) => void;
  onFileDelete: (file: FileItem) => void;
  onFileToggleBookmark: (file: FileItem) => void;
  onAddFile: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  theme,
  currentFileId,
  bookmarks,
  onFilePress,
  onFileDelete,
  onFileToggleBookmark,
  onAddFile,
  refreshing = false,
  onRefresh,
}) => {
  const renderItem = useCallback(
    ({ item }: { item: FileItem }) => (
      <FileListItem
        file={item}
        theme={theme}
        isActive={item.id === currentFileId}
        isBookmarked={bookmarks.includes(item.id)}
        onPress={onFilePress}
        onDelete={onFileDelete}
        onToggleBookmark={onFileToggleBookmark}
      />
    ),
    [theme, currentFileId, bookmarks, onFilePress, onFileDelete, onFileToggleBookmark]
  );

  const keyExtractor = useCallback((item: FileItem) => item.id, []);

  // 空状态
  if (files.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>文件列表</Text>
        </View>
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceAlt }]}>
            <Ionicons name="documents" size={56} color={theme.textTertiary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>还没有文件</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            点击下方按钮添加 Markdown 或代码文件
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={onAddFile}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="添加文件"
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addButtonText}>添加文件</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          文件列表{' '}
          <Text style={[styles.headerCount, { color: theme.textSecondary }]}>
            ({files.length})
          </Text>
        </Text>
      </View>
      <FlatList
        data={files}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          ) : undefined
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={onAddFile}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="添加文件"
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerCount: {
    fontSize: 14,
    fontWeight: '400',
  },
  listContent: {
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginHorizontal: 32,
    marginBottom: 24,
    gap: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
