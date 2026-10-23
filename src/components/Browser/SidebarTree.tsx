import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { FileItem, TreeNode } from '../../types';
import { buildFileTree, getFileIconColor, getFileIconName, getFileType } from '../../utils/fileHelper';
import { showFileActionMenu } from '../../utils/fileActions';
import { deleteImportedFile } from '../../utils/fileStorage';
import { useReaderStore } from '../../store/readerStore';
import { getAncestors, getFileDirectory, normalizePath } from '../../utils/fileTree';
import { useResponsive } from '../../utils/responsive';

const ROW_HEIGHT = 34;

interface SidebarTreeProps {
  theme: Theme;
}

interface FlatRow {
  key: string;
  kind: 'root' | 'dir' | 'file';
  node: TreeNode;
  depth: number;
}

/** 根级伪节点：给用户一个"回到全部文件"的入口 */
const ROOT_NODE: TreeNode = { name: '全部文件', path: '', isDirectory: true, children: [] };

/** 默认展开根下的第一层目录，避免侧栏一打开全是折叠行 */
function getDefaultExpanded(files: FileItem[]): Set<string> {
  const paths = new Set<string>();
  for (const file of files) {
    const dir = normalizePath(file.directory);
    const first = dir.split('/')[0];
    if (first) paths.add(first);
  }
  return paths;
}

function flatten(nodes: TreeNode[], expanded: Set<string>, depth: number): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    rows.push({
      key: node.isDirectory ? `dir:${node.path}` : `file:${node.fileId ?? node.path}`,
      kind: node.isDirectory ? 'dir' : 'file',
      node,
      depth,
    });
    if (node.isDirectory && expanded.has(node.path)) {
      rows.push(...flatten(node.children, expanded, depth + 1));
    }
  }
  return rows;
}

export const SidebarTree: React.FC<SidebarTreeProps> = ({ theme }) => {
  const files = useReaderStore((state) => state.files);
  const currentDirPath = useReaderStore((state) => state.currentDirPath);
  const currentFileId = useReaderStore((state) => state.currentFileId);
  const bookmarks = useReaderStore((state) => state.bookmarks);
  const navigateToDir = useReaderStore((state) => state.navigateToDir);
  const openFile = useReaderStore((state) => state.openFile);
  const removeFile = useReaderStore((state) => state.removeFile);
  const toggleBookmark = useReaderStore((state) => state.toggleBookmark);
  const { isWide } = useResponsive();

  const [expanded, setExpanded] = useState<Set<string>>(() => getDefaultExpanded(files));

  const tree = useMemo(() => buildFileTree(files), [files]);
  const filesMap = useMemo(() => {
    const map = new Map<string, FileItem>();
    for (const file of files) map.set(file.id, file);
    return map;
  }, [files]);
  const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks]);

  // 导航或打开文件后，把路径上的目录全部展开，保证当前项一定在树里可见
  useEffect(() => {
    const activeDir =
      currentDirPath || getFileDirectory(currentFileId ? filesMap.get(currentFileId) : null);
    const ancestors = getAncestors(activeDir);
    if (ancestors.length === 0) return;

    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const path of ancestors) {
        if (!next.has(path)) {
          next.add(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentDirPath, currentFileId, filesMap]);

  const rows = useMemo(() => {
    const rootRow: FlatRow = { key: 'root', kind: 'root', node: ROOT_NODE, depth: 0 };
    return [rootRow, ...flatten(tree, expanded, 1)];
  }, [tree, expanded]);

  const handleNavigate = useCallback(
    (path: string) => {
      // 窄屏选完目录就收起抽屉，否则用户看不到右侧的变化
      navigateToDir(path, { collapseSidebar: !isWide });
    },
    [navigateToDir, isWide]
  );

  const handleToggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleFilePress = useCallback((fileId: string) => openFile(fileId), [openFile]);

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

  const renderRow = useCallback(
    ({ item }: { item: FlatRow }) => {
      const { node, depth } = item;
      const isDir = item.kind !== 'file';
      const file = node.fileId ? filesMap.get(node.fileId) : undefined;
      const isExpanded = isDir && (item.kind === 'root' || expanded.has(node.path));
      const isActive = isDir
        ? item.kind === 'root'
          ? currentDirPath === ''
          : currentDirPath === node.path
        : currentFileId === node.fileId;
      const isBookmarked = !!node.fileId && bookmarkSet.has(node.fileId);

      const fileType = isDir ? null : getFileType(node.name);
      const iconName = isDir
        ? isExpanded
          ? 'folder-open'
          : 'folder'
        : (getFileIconName(fileType!) as keyof typeof Ionicons.glyphMap);
      const iconColor = isDir ? '#F5A623' : getFileIconColor(fileType!);

      const handlePress = () => {
        if (isDir) handleNavigate(item.kind === 'root' ? '' : node.path);
        else if (file) handleFilePress(file.id);
      };

      return (
        <View
          style={[
            styles.row,
            { paddingLeft: 8 + depth * 14 },
            isActive ? { backgroundColor: theme.primaryLight } : null,
          ]}
        >
          {/* 箭头是独立的展开热区：点箭头只折叠，点行才是导航 */}
          {isDir && item.kind === 'dir' ? (
            <Pressable
              onPress={() => handleToggleExpand(node.path)}
              hitSlop={6}
              style={styles.chevron}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? `折叠 ${node.name}` : `展开 ${node.name}`}
            >
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={13}
                color={theme.textTertiary}
              />
            </Pressable>
          ) : (
            <View style={styles.chevron} />
          )}

          <Pressable
            style={styles.main}
            onPress={handlePress}
            onLongPress={file ? () => handleFileLongPress(file) : undefined}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={`${isDir ? '目录' : '文件'}: ${node.name}`}
          >
            <Ionicons name={iconName} size={15} color={iconColor} style={styles.icon} />
            <Text
              style={[
                styles.name,
                {
                  color: isActive ? theme.primary : theme.text,
                  fontWeight: isDir ? '600' : '400',
                },
              ]}
              numberOfLines={1}
            >
              {node.name}
            </Text>
            {isBookmarked ? (
              <Ionicons name="bookmark" size={11} color={theme.primary} style={styles.bookmark} />
            ) : null}
          </Pressable>
        </View>
      );
    },
    [
      filesMap,
      expanded,
      currentDirPath,
      currentFileId,
      bookmarkSet,
      theme,
      handleNavigate,
      handleToggleExpand,
      handleFilePress,
      handleFileLongPress,
    ]
  );

  const keyExtractor = useCallback((item: FlatRow) => item.key, []);
  const getItemLayout = useCallback(
    (_data: ArrayLike<FlatRow> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
  );

  if (files.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="documents-outline" size={28} color={theme.textTertiary} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>还没有文件</Text>
        <Text style={[styles.emptyHint, { color: theme.textTertiary }]}>
          在右侧添加文件或导入目录
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      renderItem={renderRow}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      initialNumToRender={24}
      windowSize={11}
      removeClippedSubviews
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingRight: 12,
  },
  chevron: {
    width: 18,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
  },
  icon: {
    marginRight: 6,
  },
  name: {
    flex: 1,
    fontSize: 13,
  },
  bookmark: {
    marginLeft: 6,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 6,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: 12,
    textAlign: 'center',
  },
});
