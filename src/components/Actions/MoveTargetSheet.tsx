import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { TreeNode } from '../../types';

interface MoveTargetSheetProps {
  visible: boolean;
  theme: Theme;
  /** 只含目录的树（调用方构建时已过滤掉文件节点） */
  tree: TreeNode[];
  /**
   * 被移动条目当前所在的目录，仅用于在列表里标一个"当前"。
   *
   * 这里刻意**不做排除**：文件移动不存在"目标是自己"的自包含问题，
   * 而旧实现把当前目录及其整棵子树都过滤掉了 —— 导入后 currentDirPath 就是挂载根，
   * 于是列表里只剩"全部（根目录）"一项，最常见的"挪到子文件夹"完全不可用。
   */
  currentPath?: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

interface FlatDir {
  key: string;
  name: string;
  path: string;
  depth: number;
  hasChildren: boolean;
}

/** 只铺开目录节点，文件不是合法的移动目标 */
function flattenDirs(nodes: TreeNode[], depth: number, out: FlatDir[]) {
  for (const node of nodes) {
    if (!node.isDirectory) continue;
    out.push({
      key: node.path,
      name: node.name,
      path: node.path,
      depth,
      hasChildren: node.children.some((child) => child.isDirectory),
    });
    flattenDirs(node.children, depth + 1, out);
  }
}

/**
 * 「移动到…」目标目录选择（设计稿 §8.1 MoveTargetSheet）：
 * 移动端没有拖拽精度，跨目录移动用底部弹层选目标目录，而不是手势。
 */
export const MoveTargetSheet: React.FC<MoveTargetSheetProps> = ({
  visible,
  theme,
  tree,
  currentPath,
  onPick,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const dirs: FlatDir[] = [{ key: '', name: '全部（根目录）', path: '', depth: 0, hasChildren: true }];
  flattenDirs(tree, 1, dirs);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="关闭目标目录选择">
        <Pressable
          // Modal 脱离了根容器的 insets.bottom，底部必须自己让开手势条
          style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.header, { borderBottomColor: theme.separator }]}>
            <Text style={[styles.title, { color: theme.text }]}>移动到…</Text>
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>选择目标文件夹</Text>
          </View>

          <FlatList
            data={dirs}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.key || '__root__'}
            renderItem={({ item }) => {
              const isCurrent = item.path === (currentPath ?? '');
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    pressed ? { backgroundColor: theme.surfaceAlt } : null,
                  ]}
                  onPress={() => {
                    onClose();
                    onPick(item.path);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`移动到 ${item.name}`}
                >
                  <View style={{ width: item.depth * 16 }} />
                  <Ionicons
                    name={item.hasChildren ? 'folder-open' : 'folder'}
                    size={18}
                    color="#F5A623"
                  />
                  <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {isCurrent ? (
                    <Text style={[styles.rowHint, { color: theme.textTertiary }]}>当前</Text>
                  ) : null}
                </Pressable>
              );
            }}
          />

          <Pressable
            style={[styles.cancel, { borderTopColor: theme.separator }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="取消"
          >
            <Text style={[styles.cancelLabel, { color: theme.textSecondary }]}>取消</Text>
          </Pressable>
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
    maxHeight: '65%',
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
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 48,
    paddingHorizontal: 20,
  },
  rowTitle: {
    flex: 1,
    fontSize: 14,
  },
  rowHint: {
    fontSize: 11,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
