import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { FileItem, TreeNode } from '../../types';
import { useReaderStore } from '../../store/readerStore';
import { buildFileTree, formatDate, formatFileSize, getFileIconColor, getFileIconName } from '../../utils/fileHelper';
import { countChildren, getListing, getParentPath } from '../../utils/fileTree';
import { showFileActionMenu } from '../../utils/fileActions';
import { deleteImportedFile } from '../../utils/fileStorage';
import { Breadcrumbs } from './Breadcrumbs';
import { FOLDER_ROW_HEIGHT, FolderRow } from './FolderRow';

interface FolderPaneProps {
  theme: Theme;
  onAddFile: () => void;
  onImportDirectory: () => void;
}

type Row =
  | { key: string; kind: 'up'; path: string }
  | { key: string; kind: 'dir'; node: TreeNode }
  | { key: string; kind: 'file'; file: FileItem };

/** 右栏：显示"当前目录"的内容，点文件由 store 切到阅读器 */
export const FolderPane: React.FC<FolderPaneProps> = ({ theme, onAddFile, onImportDirectory }) => {
  const files = useReaderStore((state) => state.files);
  const currentDirPath = useReaderStore((state) => state.currentDirPath);
  const currentFileId = useReaderStore((state) => state.currentFileId);
  const bookmarks = useReaderStore((state) => state.bookmarks);
  const navigateToDir = useReaderStore((state) => state.navigateToDir);
  const openFile = useReaderStore((state) => state.openFile);
  const removeFile = useReaderStore((state) => state.removeFile);
  const toggleBookmark = useReaderStore((state) => state.toggleBookmark);

  const listRef = useRef<FlatList<Row>>(null);

  const tree = useMemo(() => buildFileTree(files), [files]);
  const filesMap = useMemo(() => {
    const map = new Map<string, FileItem>();
    for (const file of files) map.set(file.id, file);
    return map;
  }, [files]);
  const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks]);

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];

    if (currentDirPath) {
      result.push({ key: 'up', kind: 'up', path: getParentPath(currentDirPath) });
    }

    const listing = getListing(tree, currentDirPath);
    for (const dir of listing.dirs) {
      result.push({ key: `dir:${dir.path}`, kind: 'dir', node: dir });
    }
    for (const item of listing.files) {
      const file = item.fileId ? filesMap.get(item.fileId) : undefined;
      if (file) result.push({ key: `file:${file.id}`, kind: 'file', file });
    }

    return result;
  }, [currentDirPath, tree, filesMap]);

  // 切换目录后回到顶部，否则会停在上一个目录的滚动位置
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [currentDirPath]);

  const handleFileLongPress = useCallback(
    (file: FileItem) => {
      showFileActionMenu({
        file,
        isBookmarked: bookmarkSet.has(file.id),
        onToggleBookmark: (target) => toggleBookmark(target.id),
        onDelete: (target) => {
          removeFile(target.id);
          void deleteImportedFile(target.uri);
        },
      });
    },
    [bookmarkSet, toggleBookmark, removeFile]
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'up') {
        return (
          <FolderRow
            theme={theme}
            iconName="arrow-up"
            iconColor={theme.textSecondary}
            title="上一级"
            onPress={() => navigateToDir(item.path)}
            accessibilityLabel="返回上一级目录"
          />
        );
      }

      if (item.kind === 'dir') {
        const count = countChildren(item.node);
        return (
          <FolderRow
            theme={theme}
            iconName="folder"
            iconColor="#F5A623"
            title={item.node.name}
            meta={count > 0 ? `${count} 项` : '空'}
            showArrow
            onPress={() => navigateToDir(item.node.path)}
            accessibilityLabel={`目录: ${item.node.name}`}
          />
        );
      }

      const { file } = item;
      const type = file.type;
      const meta = [file.size ? formatFileSize(file.size) : null, formatDate(file.addedAt)]
        .filter(Boolean)
        .join(' · ');

      return (
        <FolderRow
          theme={theme}
          iconName={getFileIconName(type) as keyof typeof Ionicons.glyphMap}
          iconColor={getFileIconColor(type)}
          title={file.name}
          meta={meta}
          isActive={file.id === currentFileId}
          isBookmarked={bookmarkSet.has(file.id)}
          onPress={() => openFile(file.id)}
          onLongPress={() => handleFileLongPress(file)}
          accessibilityLabel={`文件: ${file.name}`}
        />
      );
    },
    [theme, currentFileId, bookmarkSet, navigateToDir, openFile, handleFileLongPress]
  );

  const keyExtractor = useCallback((item: Row) => item.key, []);
  const getItemLayout = useCallback(
    (_data: ArrayLike<Row> | null | undefined, index: number) => ({
      length: FOLDER_ROW_HEIGHT,
      offset: FOLDER_ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const toolbar = (
    <View style={[styles.toolbar, { borderBottomColor: theme.separator }]}>
      <View style={styles.breadcrumbWrapper}>
        <Breadcrumbs theme={theme} path={currentDirPath} onNavigate={navigateToDir} />
      </View>

      <TouchableOpacity
        style={styles.toolbarButton}
        onPress={onAddFile}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="添加文件"
      >
        <Ionicons name="add" size={20} color={theme.primary} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.toolbarButton}
        onPress={onImportDirectory}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="导入目录"
      >
        <Ionicons name="folder-open-outline" size={18} color={theme.primary} />
      </TouchableOpacity>
    </View>
  );

  // 全库为空：给引导操作，而不是一个空白列表
  if (files.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {toolbar}
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceAlt }]}>
            <Ionicons name="documents-outline" size={52} color={theme.textTertiary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>还没有文件</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            添加单个文件，或导入整个目录来建立一个可浏览的目录树
          </Text>
          <View style={styles.emptyButtons}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={onAddFile}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="添加文件"
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>添加文件</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: theme.primary }]}
              onPress={onImportDirectory}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="导入目录"
            >
              <Ionicons name="folder-open-outline" size={18} color={theme.primary} />
              <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>导入目录</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {toolbar}

      <FlatList
        ref={listRef}
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        contentContainerStyle={rows.length === 0 ? styles.listContentEmpty : undefined}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        windowSize={11}
        ListEmptyComponent={
          <View style={styles.emptyFolder}>
            <Ionicons name="folder-open-outline" size={40} color={theme.textTertiary} />
            <Text style={[styles.emptyFolderTitle, { color: theme.text }]}>这个文件夹是空的</Text>
            <Text style={[styles.emptyFolderDesc, { color: theme.textSecondary }]}>
              受限于"文件靠导入"的数据模型，空目录本身不会出现在树里
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingLeft: 16,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  breadcrumbWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  toolbarButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyFolder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 6,
  },
  emptyFolderTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyFolderDesc: {
    fontSize: 12,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButtons: {
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    gap: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
