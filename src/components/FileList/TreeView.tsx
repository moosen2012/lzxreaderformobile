import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { FileItem, TreeNode } from '../../types';
import { getFileType, getFileIconName, getFileIconColor } from '../../utils/fileHelper';

interface TreeViewProps {
  files: FileItem[];
  theme: Theme;
  currentFileId: string | null;
  bookmarks: string[];
  onFilePress: (file: FileItem) => void;
  onFileDelete: (file: FileItem) => void;
  onFileToggleBookmark: (file: FileItem) => void;
  onPressDirectory?: (file: FileItem) => void;
}

// 单个树节点的行组件
interface TreeRowProps {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
  onToggle: (path: string) => void;
  onFilePress: (file: FileItem) => void;
  activeFileId: string | null;
  theme: Theme;
  filesMap: Map<string, FileItem>;
}

const TreeRow: React.FC<TreeRowProps> = ({
  node,
  depth,
  isExpanded,
  onToggle,
  onFilePress,
  activeFileId,
  theme,
  filesMap,
}) => {
  const isActive = !node.isDirectory && activeFileId === node.fileId;
  const file = node.fileId ? filesMap.get(node.fileId) : undefined;

  const handlePress = () => {
    if (node.isDirectory) {
      onToggle(node.path);
    } else if (file) {
      onFilePress(file);
    }
  };

  const iconName = node.isDirectory
    ? isExpanded
      ? 'folder-open'
      : 'folder'
    : (getFileIconName(getFileType(node.name)) as keyof typeof Ionicons.glyphMap);
  const iconColor = node.isDirectory ? '#F5A623' : getFileIconColor(getFileType(node.name));

  return (
    <TouchableOpacity
      style={[
        styles.row,
        {
          backgroundColor: isActive ? theme.primaryLight : 'transparent',
          paddingLeft: 16 + depth * 20,
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={node.isDirectory ? `目录: ${node.name}` : `文件: ${node.name}`}
    >
      {/* 展开/折叠箭头（仅目录） */}
      <View style={styles.chevronContainer}>
        {node.isDirectory ? (
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={theme.textTertiary}
          />
        ) : (
          <View style={styles.chevronPlaceholder} />
        )}
      </View>

      {/* 图标 */}
      <View style={styles.iconContainer}>
        <Ionicons name={iconName} size={16} color={iconColor} />
      </View>

      {/* 名称 */}
      <Text
        style={[
          styles.name,
          {
            color: isActive ? theme.primary : theme.text,
            fontWeight: node.isDirectory ? '600' : '400',
          },
        ]}
        numberOfLines={1}
      >
        {node.name}
      </Text>

      {/* 书签标记 */}
      {file && activeFileId !== node.fileId && (
        <View style={styles.bookmarkContainer}>
          {/* 书签状态在父组件管理，这里不展示 */}
        </View>
      )}
    </TouchableOpacity>
  );
};

// 将树展开为 FlatList 用的行列表
interface FlatRow {
  key: string;
  node: TreeNode;
  depth: number;
}

function flattenTree(
  nodes: TreeNode[],
  expandedPaths: Set<string>,
  depth: number
): FlatRow[] {
  const result: FlatRow[] = [];
  for (const node of nodes) {
    result.push({ key: node.path, node, depth });
    if (node.isDirectory && expandedPaths.has(node.path)) {
      result.push(...flattenTree(node.children, expandedPaths, depth + 1));
    }
  }
  return result;
}

export const TreeView: React.FC<TreeViewProps> = ({
  files,
  theme,
  currentFileId,
  bookmarks,
  onFilePress,
  onFileDelete: _onFileDelete,
  onFileToggleBookmark: _onFileToggleBookmark,
  onPressDirectory: _onPressDirectory,
}) => {
  // 默认展开第一级目录
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const rootDirs = new Set<string>();
    for (const f of files) {
      if (f.directory) {
        const firstSeg = f.directory.split('/')[0];
        if (firstSeg) rootDirs.add(firstSeg);
      }
    }
    return rootDirs;
  });

  // 构建 files Map
  const filesMap = useMemo(() => {
    const map = new Map<string, FileItem>();
    for (const f of files) map.set(f.id, f);
    return map;
  }, [files]);

  // 动态导入 buildFileTree 避免循环依赖问题
  const tree = useMemo(() => {
    // 内联实现，避免动态导入
    const rootChildren: TreeNode[] = [];
    const dirNodeMap = new Map<string, TreeNode>();
    const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

    for (const file of files) {
      const dir = file.directory ? normalize(file.directory) : '';
      if (!dir) {
        rootChildren.push({
          name: file.name,
          path: file.name,
          isDirectory: false,
          fileId: file.id,
          children: [],
        });
        continue;
      }

      const segments = dir.split('/').filter((s) => s.length > 0);
      let currentPath = '';
      let parentChildren = rootChildren;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        currentPath = currentPath ? `${currentPath}/${seg}` : seg;
        if (dirNodeMap.has(currentPath)) {
          parentChildren = dirNodeMap.get(currentPath)!.children;
          continue;
        }
        const node: TreeNode = {
          name: seg,
          path: currentPath,
          isDirectory: true,
          children: [],
        };
        dirNodeMap.set(currentPath, node);
        parentChildren.push(node);
        parentChildren = node.children;
      }

      const dirNode = dirNodeMap.get(dir)!;
      dirNode.children.push({
        name: file.name,
        path: `${dir}/${file.name}`,
        isDirectory: false,
        fileId: file.id,
        children: [],
      });
    }

    const sortTree = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
      for (const n of nodes) {
        if (n.isDirectory) sortTree(n.children);
      }
    };
    sortTree(rootChildren);
    return rootChildren;
  }, [files]);

  const flatRows = useMemo(
    () => flattenTree(tree, expandedPaths, 0),
    [tree, expandedPaths]
  );

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const renderRow = useCallback(
    ({ item }: { item: FlatRow }) => (
      <TreeRow
        node={item.node}
        depth={item.depth}
        isExpanded={expandedPaths.has(item.node.path)}
        onToggle={handleToggle}
        onFilePress={onFilePress}
        activeFileId={currentFileId}
        theme={theme}
        filesMap={filesMap}
      />
    ),
    [expandedPaths, handleToggle, onFilePress, currentFileId, theme, filesMap]
  );

  const keyExtractor = useCallback((item: FlatRow) => item.key, []);

  return (
    <FlatList
      data={flatRows}
      renderItem={renderRow}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 80,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingRight: 16,
  },
  chevronContainer: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  chevronPlaceholder: {
    width: 16,
  },
  iconContainer: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  name: {
    flex: 1,
    fontSize: 14,
  },
  bookmarkContainer: {
    padding: 4,
  },
});
