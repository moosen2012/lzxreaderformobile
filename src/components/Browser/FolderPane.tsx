import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Clipboard, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../../styles/themes';
import type { FileItem, SortKey, TreeNode } from '../../types';
import { useReaderStore } from '../../store/readerStore';
import { buildFileTree, formatDate, formatFileSize, getFileIconColor, getFileIconName } from '../../utils/fileHelper';
import { getListing } from '../../utils/fileTree';
import { deleteImportedFile } from '../../utils/fileStorage';
import { ActionSheet, type SheetAction } from '../Actions/ActionSheet';
import { EntryRow, ENTRY_ROW_HEIGHT } from './EntryRow';

interface FolderPaneProps {
  theme: Theme;
  /** 仍被"空库引导页"的大按钮使用；工具栏上的入口已收进应用头"···"菜单 */
  onAddFile: () => void;
  onImportDirectory: () => void;
}

type Row =
  | { key: string; kind: 'dir'; node: TreeNode }
  | { key: string; kind: 'file'; file: FileItem }
  // 网格补位：最后一行不足 3 项时，用占位块把剩余列填满，否则卡片会被 flex:1 拉成整行宽
  | { key: string; kind: 'spacer' };

const GRID_COLUMNS = 3;
const GRID_ROW_HEIGHT = 96;

/** 按当前排序键排一行；目录始终排在文件前面（资源管理器习惯） */
function sortRows(rows: Row[], sortKey: SortKey, asc: boolean): Row[] {
  const sign = asc ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    if (a.kind === 'dir' && b.kind === 'dir') {
      return a.node.name.localeCompare(b.node.name, 'zh-Hans-CN') * sign;
    }
    if (a.kind === 'file' && b.kind === 'file') {
      switch (sortKey) {
        case 'time': {
          const ta = a.file.lastModified ?? a.file.addedAt;
          const tb = b.file.lastModified ?? b.file.addedAt;
          return (ta - tb) * sign;
        }
        case 'size':
          return ((a.file.size ?? 0) - (b.file.size ?? 0)) * sign;
        default:
          return a.file.name.localeCompare(b.file.name, 'zh-Hans-CN') * sign;
      }
    }
    return 0;
  });
  return sorted;
}

/** 网格最后一行补空位，列数对齐后卡片宽度才一致 */
function padGridRows(rows: Row[]): Row[] {
  const remainder = rows.length % GRID_COLUMNS;
  if (remainder === 0) return rows;
  const padded = [...rows];
  for (let i = 0; i < GRID_COLUMNS - remainder; i += 1) {
    padded.push({ key: `__spacer_${i}`, kind: 'spacer' });
  }
  return padded;
}

const SORT_LABEL: Record<SortKey, string> = { name: '名称', time: '时间', size: '大小' };

/** 右栏：显示"当前目录"的内容，点文件由 store 切到阅读器 */
export const FolderPane: React.FC<FolderPaneProps> = ({ theme, onAddFile, onImportDirectory }) => {
  const files = useReaderStore((state) => state.files);
  const directories = useReaderStore((state) => state.directories);
  const mounts = useReaderStore((state) => state.mounts);
  const currentDirPath = useReaderStore((state) => state.currentDirPath);
  const currentFileId = useReaderStore((state) => state.currentFileId);
  const bookmarks = useReaderStore((state) => state.bookmarks);
  const navigateToDir = useReaderStore((state) => state.navigateToDir);
  const openFile = useReaderStore((state) => state.openFile);
  const removeFile = useReaderStore((state) => state.removeFile);
  const toggleBookmark = useReaderStore((state) => state.toggleBookmark);
  const browserView = useReaderStore((state) => state.browserView);
  const sortKey = useReaderStore((state) => state.sortKey);
  const sortAsc = useReaderStore((state) => state.sortAsc);
  const setBrowserView = useReaderStore((state) => state.setBrowserView);
  const setSortKey = useReaderStore((state) => state.setSortKey);
  const selectionMode = useReaderStore((state) => state.selectionMode);
  const selectedFileIds = useReaderStore((state) => state.selectedFileIds);
  const selectedDirPaths = useReaderStore((state) => state.selectedDirPaths);
  const enterSelectionMode = useReaderStore((state) => state.enterSelectionMode);
  const toggleSelected = useReaderStore((state) => state.toggleSelected);
  const deleteNodes = useReaderStore((state) => state.deleteNodes);

  const listRef = useRef<FlatList<Row>>(null);
  const [sheetTarget, setSheetTarget] = useState<Row | null>(null);

  const tree = useMemo(() => buildFileTree(files, directories), [files, directories]);
  const filesMap = useMemo(() => {
    const map = new Map<string, FileItem>();
    for (const file of files) map.set(file.id, file);
    return map;
  }, [files]);
  const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks]);
  const selectedFileSet = useMemo(() => new Set(selectedFileIds), [selectedFileIds]);
  const selectedDirSet = useMemo(() => new Set(selectedDirPaths), [selectedDirPaths]);

  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];

    const listing = getListing(tree, currentDirPath);
    for (const dir of listing.dirs) {
      result.push({ key: `dir:${dir.path}`, kind: 'dir', node: dir });
    }
    for (const item of listing.files) {
      const file = item.fileId ? filesMap.get(item.fileId) : undefined;
      if (file) result.push({ key: `file:${file.id}`, kind: 'file', file });
    }

    return browserView === 'grid' ? padGridRows(sortRows(result, sortKey, sortAsc)) : sortRows(result, sortKey, sortAsc);
  }, [currentDirPath, tree, filesMap, sortKey, sortAsc, browserView]);

  // 切换目录后回到顶部，否则会停在上一个目录的滚动位置
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [currentDirPath]);

  // ============ 单项操作单 ============
  const sheetActions = useMemo<SheetAction[]>(() => {
    if (!sheetTarget) return [];
    if (sheetTarget.kind === 'dir') {
      const node = sheetTarget.node;
      return [
        { icon: 'open-outline', label: '打开', onPress: () => navigateToDir(node.path) },
        {
          icon: 'trash-outline',
          label: '删除',
          danger: true,
          onPress: () =>
            Alert.alert('确认删除', `确定要删除目录 "${node.name}" 吗？\n其下所有文件会一并移除索引。`, [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: () => deleteNodes({ fileIds: [], dirPaths: [node.path] }) },
            ]),
        },
      ];
    }

    const file = sheetTarget.kind === 'file' ? sheetTarget.file : null;
    if (!file) return [];
    const actions: SheetAction[] = [
      { icon: 'book-outline', label: '打开', onPress: () => openFile(file.id) },
      {
        icon: bookmarkSet.has(file.id) ? 'bookmark' : 'bookmark-outline',
        label: bookmarkSet.has(file.id) ? '取消书签' : '添加书签',
        onPress: () => toggleBookmark(file.id),
      },
    ];
    if (file.directory) {
      actions.push({
        icon: 'copy-outline',
        label: '复制目录路径',
        onPress: () => Clipboard.setString(file.directory ?? ''),
      });
    }
    actions.push({
      icon: 'trash-outline',
      label: '删除',
      danger: true,
      onPress: () =>
        Alert.alert('确认删除', `确定要从列表移除 "${file.name}" 吗？`, [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: () => {
              removeFile(file.id);
              void deleteImportedFile(file.uri);
            },
          },
        ]),
    });
    return actions;
  }, [sheetTarget, bookmarkSet, navigateToDir, openFile, toggleBookmark, removeFile, deleteNodes]);

  // ============ 行渲染 ============
  const getRowMeta = useCallback((row: Row): string | undefined => {
    if (row.kind !== 'file') return undefined;
    const { file } = row;
    return [file.size ? formatFileSize(file.size) : null, formatDate(file.lastModified ?? file.addedAt)]
      .filter(Boolean)
      .join(' · ');
  }, []);

  const renderListRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'spacer') return null;
      const isDir = item.kind === 'dir';
      const title = isDir ? item.node.name : item.file.name;
      const isSelected = isDir ? selectedDirSet.has(item.node.path) : selectedFileSet.has(item.file.id);

      return (
        <EntryRow
          theme={theme}
          iconName={
            isDir
              ? 'folder'
              : (getFileIconName(item.file.type) as keyof typeof Ionicons.glyphMap)
          }
          iconColor={isDir ? '#F5A623' : getFileIconColor(item.file.type)}
          title={title}
          meta={isDir ? undefined : getRowMeta(item)}
          isActive={!isDir && item.file.id === currentFileId}
          isBookmarked={!isDir && bookmarkSet.has(item.file.id)}
          selectionMode={selectionMode}
          isSelected={isSelected}
          showArrow={isDir}
          onMore={() => setSheetTarget(item)}
          onPress={() => {
            if (selectionMode) {
              toggleSelected(isDir ? item.node.path : item.file.id, isDir ? 'dir' : 'file');
            } else if (isDir) {
              navigateToDir(item.node.path);
            } else {
              openFile(item.file.id);
            }
          }}
          onLongPress={() => {
            if (!selectionMode) {
              enterSelectionMode(isDir ? item.node.path : item.file.id, isDir ? 'dir' : 'file');
            }
          }}
          accessibilityLabel={`${isDir ? '目录' : '文件'}: ${title}`}
        />
      );
    },
    [
      theme,
      currentFileId,
      bookmarkSet,
      selectionMode,
      selectedFileSet,
      selectedDirSet,
      navigateToDir,
      openFile,
      toggleSelected,
      enterSelectionMode,
      getRowMeta,
    ]
  );

  const renderGridCard = useCallback(
    ({ item }: { item: Row }) => {
      // 占位块：只为把最后一行的列数补齐
      if (item.kind === 'spacer') return <View style={styles.gridCardSpacer} />;
      const isDir = item.kind === 'dir';
      const title = isDir ? item.node.name : item.file.name;
      const isSelected = isDir ? selectedDirSet.has(item.node.path) : selectedFileSet.has(item.file.id);

      return (
        <TouchableOpacity
          style={[
            styles.gridCard,
            {
              backgroundColor: isSelected ? theme.primaryLight : theme.cardBackground,
              borderColor: theme.separator,
            },
          ]}
          onPress={() => {
            if (selectionMode) {
              toggleSelected(isDir ? item.node.path : item.file.id, isDir ? 'dir' : 'file');
            } else if (isDir) {
              navigateToDir(item.node.path);
            } else {
              openFile(item.file.id);
            }
          }}
          onLongPress={() => {
            if (!selectionMode) {
              enterSelectionMode(isDir ? item.node.path : item.file.id, isDir ? 'dir' : 'file');
            }
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${isDir ? '目录' : '文件'}: ${title}`}
        >
          {selectionMode ? (
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={18}
              color={isSelected ? theme.primary : theme.textTertiary}
              style={styles.gridCheck}
            />
          ) : null}
          <Ionicons
            name={isDir ? 'folder' : (getFileIconName(item.file.type) as keyof typeof Ionicons.glyphMap)}
            size={28}
            color={isDir ? '#F5A623' : getFileIconColor(item.file.type)}
          />
          <Text style={[styles.gridTitle, { color: theme.text }]} numberOfLines={2}>
            {title}
          </Text>
          {/* 网格也要有行尾入口：只在长按进选择模式时能操作，与列表视图的 "···" 不一致 */}
          {!selectionMode ? (
            <TouchableOpacity
              style={styles.gridMore}
              onPress={() => setSheetTarget(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${title} 的更多操作`}
            >
              <Ionicons name="ellipsis-horizontal" size={16} color={theme.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      );
    },
    [
      theme,
      selectionMode,
      selectedFileSet,
      selectedDirSet,
      navigateToDir,
      openFile,
      toggleSelected,
      enterSelectionMode,
    ]
  );

  const keyExtractor = useCallback((item: Row) => item.key, []);
  /**
   * 网格是 numColumns=3，一个"行"装 3 项，offset 必须按行算。
   * 旧实现按每项一行算，第 4 项之后的偏移量差 3 倍，滚动条长度和 scrollToIndex 都会错位。
   */
  const getItemLayout = useCallback(
    (_data: ArrayLike<Row> | null | undefined, index: number) => {
      const rowHeight = browserView === 'grid' ? GRID_ROW_HEIGHT : ENTRY_ROW_HEIGHT;
      const perRow = browserView === 'grid' ? GRID_COLUMNS : 1;
      return {
        length: rowHeight,
        offset: Math.floor(index / perRow) * rowHeight,
        index,
      };
    },
    [browserView]
  );

  const toolbar = useMemo(
    () => (
      <View style={[styles.toolbar, { borderBottomColor: theme.separator }]}>
        {(['name', 'time', 'size'] as SortKey[]).map((key) => (
          <TouchableOpacity
            key={key}
            style={styles.sortButton}
            onPress={() => setSortKey(key)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`按${SORT_LABEL[key]}排序`}
          >
            <Text
              style={[
                styles.sortText,
                { color: sortKey === key ? theme.primary : theme.textTertiary },
                sortKey === key ? styles.sortTextActive : null,
              ]}
            >
              {SORT_LABEL[key]}
              {sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={styles.toolbarSpacer} />

        <TouchableOpacity
          style={styles.viewButton}
          onPress={() => setBrowserView(browserView === 'list' ? 'grid' : 'list')}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={browserView === 'list' ? '切换为网格视图' : '切换为列表视图'}
        >
          <Ionicons
            name={browserView === 'list' ? 'grid-outline' : 'list-outline'}
            size={18}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </View>
    ),
    [theme, sortKey, sortAsc, browserView, setSortKey, setBrowserView]
  );

  // 当前目录所属的挂载点授权是否失效（路径首段就是挂载根名）
  const invalidMount = useMemo(() => {
    const root = currentDirPath.split('/')[0];
    if (!root) return null;
    const mount = mounts.find((m) => m.rootPath === root);
    return mount?.invalid ? mount : null;
  }, [currentDirPath, mounts]);

  // 全库为空：给引导操作，而不是一个空白列表。
  // 判空必须同时看 directories —— 只导入了一个没有可读文件的目录时，files 是空的但树是有的
  if (files.length === 0 && directories.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
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
      {/* 授权失效提示：Alert 点掉之后必须留一个持续可见的标记，否则用户会反复点开失败 */}
      {invalidMount ? (
        <View style={[styles.warnBanner, { backgroundColor: theme.surfaceAlt }]}>
          <Ionicons name="warning-outline" size={14} color={theme.danger} />
          <Text style={[styles.warnText, { color: theme.textSecondary }]} numberOfLines={2}>
            “{invalidMount.name}”的目录授权已失效，内容可能不完整
          </Text>
          <TouchableOpacity
            onPress={onImportDirectory}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="重新授权该目录"
          >
            <Text style={[styles.warnAction, { color: theme.primary }]}>重新授权</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {toolbar}

      <FlatList
        ref={listRef}
        data={rows}
        renderItem={browserView === 'grid' ? renderGridCard : renderListRow}
        numColumns={browserView === 'grid' ? GRID_COLUMNS : 1}
        key={browserView}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        contentContainerStyle={rows.length === 0 ? styles.listContentEmpty : undefined}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        windowSize={11}
        columnWrapperStyle={browserView === 'grid' ? styles.gridRow : undefined}
        ListEmptyComponent={
          <View style={styles.emptyFolder}>
            <Ionicons name="folder-open-outline" size={40} color={theme.textTertiary} />
            <Text style={[styles.emptyFolderTitle, { color: theme.text }]}>这个文件夹是空的</Text>
            <Text style={[styles.emptyFolderDesc, { color: theme.textSecondary }]}>
              重新导入该目录即可刷新内容
            </Text>
          </View>
        }
      />

      {/* 单项操作单：打开 / 收藏 / 复制路径 / 删除 */}
      {sheetTarget ? (
        <ActionSheet
          visible={sheetTarget !== null}
          theme={theme}
          title={sheetTarget.kind === 'dir' ? sheetTarget.node.name : sheetTarget.kind === 'file' ? sheetTarget.file.name : ''}
          subtitle={
            sheetTarget.kind === 'dir'
              ? sheetTarget.node.path
              : sheetTarget.kind === 'file'
                ? getRowMeta(sheetTarget)
                : undefined
          }
          actions={sheetActions}
          onClose={() => setSheetTarget(null)}
        />
      ) : null}

      {/* 批量移动（MoveTargetSheet）与批量删除（Alert）挂在 HomeScreen 的选择栏上：
          选择模式顶栏整体替换应用头，动作入口只能在那一层 */}
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
    height: 36,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warnText: {
    flex: 1,
    fontSize: 11.5,
  },
  warnAction: {
    fontSize: 12,
    fontWeight: '600',
  },
  sortButton: {
    paddingHorizontal: 8,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortText: {
    fontSize: 12,
  },
  sortTextActive: {
    fontWeight: '600',
  },
  toolbarSpacer: {
    flex: 1,
  },
  viewButton: {
    width: 32,
    height: 28,
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
  gridRow: {
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  gridCard: {
    flex: 1,
    height: GRID_ROW_HEIGHT - 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 8,
  },
  /** 补齐最后一行的空列：只占宽度，不画边框 */
  gridCardSpacer: {
    flex: 1,
    height: GRID_ROW_HEIGHT - 8,
  },
  gridCheck: {
    position: 'absolute',
    top: 6,
    left: 6,
  },
  gridMore: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTitle: {
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
