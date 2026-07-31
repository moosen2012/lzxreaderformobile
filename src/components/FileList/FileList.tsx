import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { FileItem } from '../../types';
import { FileListItem } from './FileListItem';
import { TreeView } from './TreeView';

interface FileListProps {
  files: FileItem[];
  theme: Theme;
  currentFileId: string | null;
  bookmarks: string[];
  onFilePress: (file: FileItem) => void;
  onFileDelete: (file: FileItem) => void;
  onFileToggleBookmark: (file: FileItem) => void;
  onAddFile: () => void;
  onImportDirectory?: () => void;
  onPressDirectory?: (file: FileItem) => void;
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
  onImportDirectory,
  onPressDirectory,
  refreshing = false,
  onRefresh,
}) => {
  // 判断是否有文件含 directory 字段 → 自动使用树形视图
  const hasTreeStructure = useMemo(
    () => files.some((f) => f.directory && f.directory.length > 0),
    [files]
  );
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');

  // 当有树形结构数据时，自动切换到 tree 视图（仅一次）
  const effectiveViewMode = hasTreeStructure ? 'tree' : viewMode;

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
        onPressDirectory={onPressDirectory}
      />
    ),
    [theme, currentFileId, bookmarks, onFilePress, onFileDelete, onFileToggleBookmark, onPressDirectory]
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
            点击下方按钮添加文件或导入目录
          </Text>
        </View>
        <View style={styles.emptyButtons}>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            onPress={onAddFile}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="添加文件"
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>添加文件</Text>
          </TouchableOpacity>
          {onImportDirectory ? (
            <TouchableOpacity
              style={[styles.importButton, { borderColor: theme.primary }]}
              onPress={onImportDirectory}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="导入目录"
            >
              <Ionicons name="folder-open-outline" size={20} color={theme.primary} />
              <Text style={[styles.importButtonText, { color: theme.primary }]}>导入目录</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          文件列表{' '}
          <Text style={[styles.headerCount, { color: theme.textSecondary }]}>
            ({files.length})
          </Text>
        </Text>
        {hasTreeStructure ? (
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                {
                  backgroundColor: effectiveViewMode === 'list' ? theme.primary : 'transparent',
                },
              ]}
              onPress={() => setViewMode('list')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="列表视图"
            >
              <Ionicons
                name="list"
                size={16}
                color={effectiveViewMode === 'list' ? '#FFFFFF' : theme.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                {
                  backgroundColor: effectiveViewMode === 'tree' ? theme.primary : 'transparent',
                },
              ]}
              onPress={() => setViewMode('tree')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="树形视图"
            >
              <Ionicons
                name="git-branch"
                size={16}
                color={effectiveViewMode === 'tree' ? '#FFFFFF' : theme.textSecondary}
              />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {effectiveViewMode === 'tree' ? (
        <TreeView
          files={files}
          theme={theme}
          currentFileId={currentFileId}
          bookmarks={bookmarks}
          onFilePress={onFilePress}
          onFileDelete={onFileDelete}
          onFileToggleBookmark={onFileToggleBookmark}
          onPressDirectory={onPressDirectory}
        />
      ) : (
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
      )}

      {/* FAB 区域 */}
      <View style={styles.fabContainer}>
        {onImportDirectory ? (
          <TouchableOpacity
            style={[styles.fabSecondary, { backgroundColor: theme.surfaceAlt, borderColor: theme.separator }]}
            onPress={onImportDirectory}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="导入目录"
          >
            <Ionicons name="folder-open-outline" size={24} color={theme.primary} />
          </TouchableOpacity>
        ) : null}
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
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyButtons: {
    alignItems: 'center',
    gap: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginHorizontal: 32,
    gap: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginHorizontal: 32,
    borderWidth: 1.5,
    gap: 6,
  },
  importButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    gap: 12,
  },
  fab: {
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
  fabSecondary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
