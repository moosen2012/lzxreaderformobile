import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { TreeNode } from '../../types';
import { buildFileTree, stripFiles } from '../../utils/fileHelper';
import { useReaderStore } from '../../store/readerStore';
import { getAncestors, normalizePath } from '../../utils/fileTree';
import { useResponsive } from '../../utils/responsive';
import { ActionSheet, type SheetAction } from '../Actions/ActionSheet';

const ROW_HEIGHT = 34;

interface SidebarTreeProps {
  theme: Theme;
}

interface FlatRow {
  key: string;
  kind: 'root' | 'dir';
  node: TreeNode;
  depth: number;
  /** 该挂载点授权已失效（行尾显示 ⚠） */
  invalid: boolean;
}

/** 根级伪节点：给用户一个"回到全部文件"的入口 */
const ROOT_NODE: TreeNode = { name: '全部文件', path: '', isDirectory: true, children: [] };

/** 默认展开根下的第一层目录，避免侧栏一打开全是折叠行 */
function getDefaultExpanded(paths: string[]): Set<string> {
  const result = new Set<string>();
  for (const raw of paths) {
    const first = normalizePath(raw).split('/')[0];
    if (first) result.add(first);
  }
  return result;
}

/**
 * 树只铺开目录。
 *
 * 设计稿 §6.2：5000 文件的库，目录通常只有几十到几百个，剔掉文件后 flatten 规模下降一个数量级；
 * 文件由中栏列表负责，树再列一遍既冗余又卡（原来 flatData 每帧都要重算上万行）。
 */
function flatten(
  nodes: TreeNode[],
  expanded: Set<string>,
  depth: number,
  invalidRoots: Set<string>,
  out: FlatRow[]
) {
  for (const node of nodes) {
    out.push({
      key: `dir:${node.path}`,
      kind: 'dir',
      node,
      depth,
      invalid: invalidRoots.has(node.path),
    });
    if (node.children.length > 0 && expanded.has(node.path)) {
      flatten(node.children, expanded, depth + 1, invalidRoots, out);
    }
  }
}

export const SidebarTree: React.FC<SidebarTreeProps> = ({ theme }) => {
  const files = useReaderStore((state) => state.files);
  const directories = useReaderStore((state) => state.directories);
  const mounts = useReaderStore((state) => state.mounts);
  const currentDirPath = useReaderStore((state) => state.currentDirPath);
  const navigateToDir = useReaderStore((state) => state.navigateToDir);
  const deleteNodes = useReaderStore((state) => state.deleteNodes);
  const { isWide } = useResponsive();

  const [expanded, setExpanded] = useState<Set<string>>(() =>
    getDefaultExpanded(directories.length > 0 ? directories.map((d) => d.path) : files.map((f) => f.directory ?? ''))
  );
  /** 长按目录弹出的操作单（与列表里的 ActionSheet 同一套 UI） */
  const [sheetDir, setSheetDir] = useState<TreeNode | null>(null);

  // 目录骨架：文件节点在这里就被剔掉，flatten 的节点数因此与文件数量无关
  const dirTree = useMemo(
    () => stripFiles(buildFileTree(files, directories)),
    [files, directories]
  );

  // 授权失效的挂载根（路径首段即挂载根名），行尾标 ⚠
  const invalidRoots = useMemo(() => {
    const result = new Set<string>();
    for (const mount of mounts) {
      if (mount.invalid && mount.kind === 'saf') result.add(normalizePath(mount.rootPath));
    }
    return result;
  }, [mounts]);

  // 导航后把路径上的目录全部展开，保证当前项一定在树里可见
  useEffect(() => {
    const ancestors = getAncestors(currentDirPath);
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
  }, [currentDirPath]);

  const rows = useMemo(() => {
    const rootRow: FlatRow = { key: 'root', kind: 'root', node: ROOT_NODE, depth: 0, invalid: false };
    const out: FlatRow[] = [rootRow];
    flatten(dirTree, expanded, 1, invalidRoots, out);
    return out;
  }, [dirTree, expanded, invalidRoots]);

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

  const sheetActions = useMemo<SheetAction[]>(() => {
    if (!sheetDir) return [];
    return [
      { icon: 'open-outline', label: '打开', onPress: () => handleNavigate(sheetDir.path) },
      {
        icon: 'trash-outline',
        label: '删除',
        danger: true,
        onPress: () => deleteNodes({ fileIds: [], dirPaths: [sheetDir.path] }),
      },
    ];
  }, [sheetDir, handleNavigate, deleteNodes]);

  const renderRow = useCallback(
    ({ item }: { item: FlatRow }) => {
      const { node, depth } = item;
      const isRoot = item.kind === 'root';
      const hasChildren = node.children.length > 0;
      const isExpanded = isRoot || expanded.has(node.path);
      const isActive = isRoot ? currentDirPath === '' : currentDirPath === node.path;

      return (
        <View
          style={[
            styles.row,
            { paddingLeft: 8 + depth * 14 },
            isActive ? { backgroundColor: theme.primaryLight } : null,
          ]}
        >
          {/* 箭头是独立的展开热区：点箭头只折叠，点行才是导航。
              没有子目录时不画箭头，否则会出现"点了没反应"的假箭头 */}
          {hasChildren ? (
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
            onPress={() => handleNavigate(isRoot ? '' : node.path)}
            onLongPress={isRoot ? undefined : () => setSheetDir(node)}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={`目录: ${node.name}`}
          >
            <Ionicons
              name={isExpanded && hasChildren ? 'folder-open' : 'folder'}
              size={15}
              color="#F5A623"
              style={styles.icon}
            />
            <Text
              style={[
                styles.name,
                {
                  color: isActive ? theme.primary : theme.text,
                  fontWeight: '600',
                },
              ]}
              numberOfLines={1}
            >
              {node.name}
            </Text>
            {item.invalid ? (
              <Ionicons name="warning" size={12} color={theme.danger} style={styles.warning} />
            ) : null}
          </Pressable>
        </View>
      );
    },
    [expanded, currentDirPath, theme, handleNavigate, handleToggleExpand]
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

  if (files.length === 0 && directories.length === 0) {
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
    <View style={styles.container}>
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

      <ActionSheet
        visible={sheetDir !== null}
        theme={theme}
        title={sheetDir?.name ?? ''}
        subtitle={sheetDir?.path}
        actions={sheetActions}
        onClose={() => setSheetDir(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  warning: {
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
