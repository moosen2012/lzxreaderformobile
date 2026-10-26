import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useReaderStore } from '../../store/readerStore';
import { useFilePicker } from '../../hooks/useFilePicker';
import { useDirectoryImporter, MAX_IMPORT_FILES } from '../../hooks/useDirectoryImporter';
import { useResponsiveLayout } from '../../utils/responsive';
import { getTheme, type Theme } from '../../styles/themes';
import { getParentPath } from '../../utils/fileTree';
import { buildFileTree, stripFiles } from '../../utils/fileHelper';
import { deleteImportedFile } from '../../utils/fileStorage';
import { createSafLister, isSafTreeAvailable } from '../../services/saf';
import type { ImportPhase, Mount } from '../../types';
import { ImportProgressOverlay } from '../../components/Import/ImportProgressOverlay';
import { BrowserShell } from '../../components/Browser/BrowserShell';
import { Sidebar } from '../../components/Browser/Sidebar';
import { FolderPane } from '../../components/Browser/FolderPane';
import { PathBar } from '../../components/Browser/PathBar';
import { SelectionBar } from '../../components/Browser/SelectionBar';
import { MoveTargetSheet } from '../../components/Actions/MoveTargetSheet';
import { AppMenu } from '../../components/Browser/AppMenu';
import { BackChevron } from '../../components/Icons/BackChevron';
import { ReaderContent } from '../../components/Reader/ReaderContent';

/** L 档三栏：中栏（目录列表）固定宽，阅读区吃剩余空间（设计稿 §4.2） */
const LIST_PANE_WIDTH = 320;

/** 导入浮层的状态：阶段 + 实时计数 + 起始时间（用于"已用时"秒表） */
interface ImportOverlayState {
  phase: ImportPhase;
  dirs: number;
  files: number;
  currentPath: string;
  startedAt: number;
}

/** 「导入完成」在浮层上停留一会儿再关，避免一闪而过用户根本没看到结果 */
const IMPORT_DONE_LINGER_MS = 700;

interface AppHeaderProps {
  theme: Theme;
  sidebarOpen: boolean;
  height: number;
  /** 状态栏/刘海高度：顶栏从 y=0 起画（背景要延伸到状态栏后面），但内容必须让开 */
  topInset: number;
  onBack: () => void;
  onToggleSidebar: () => void;
  onOpenMenu: () => void;
}

/**
 * 顶栏横跨两栏，单行搞定：返回（非根目录）+ 汉堡 + 面包屑（PathBar）+ "···"。
 * 面包屑可横滑、深层折叠成 …（设计稿 §4.3 路径栏），层级跳转不再只靠返回键逐级退。
 */
const AppHeader: React.FC<AppHeaderProps> = ({
  theme,
  sidebarOpen,
  height,
  topInset,
  onBack,
  onToggleSidebar,
  onOpenMenu,
}) => {
  const currentDirPath = useReaderStore((state) => state.currentDirPath);
  const navigateToDir = useReaderStore((state) => state.navigateToDir);

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.headerBackground,
          borderBottomColor: theme.separator,
          paddingTop: topInset,
          height: height + topInset,
        },
      ]}
    >
      {currentDirPath ? (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={onBack}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="返回上一级"
        >
          <BackChevron color={theme.primary} />
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={styles.headerButton}
        onPress={onToggleSidebar}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={sidebarOpen ? '隐藏目录树' : '显示目录树'}
      >
        <Ionicons name="menu" size={22} color={sidebarOpen ? theme.primary : theme.textSecondary} />
      </TouchableOpacity>

      {/* 标题位：可横滑面包屑，末段加粗，深层折叠成 … */}
      <View style={styles.headerPath}>
        <PathBar
          theme={theme}
          currentDirPath={currentDirPath}
          onNavigate={(path) => navigateToDir(path)}
        />
      </View>

      <TouchableOpacity
        style={styles.headerButton}
        onPress={onOpenMenu}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="更多操作"
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />
      </TouchableOpacity>
    </View>
  );
};

export const HomeScreen: React.FC = () => {
  const currentFileId = useReaderStore((state) => state.currentFileId);
  const rightPane = useReaderStore((state) => state.rightPane);
  const sidebarOpen = useReaderStore((state) => state.sidebarOpen);
  const drawerOpen = useReaderStore((state) => state.drawerOpen);
  const themeMode = useReaderStore((state) => state.theme);
  const currentDirPath = useReaderStore((state) => state.currentDirPath);
  const files = useReaderStore((state) => state.files);
  const directories = useReaderStore((state) => state.directories);
  const mounts = useReaderStore((state) => state.mounts);
  const selectionMode = useReaderStore((state) => state.selectionMode);
  const selectedFileIds = useReaderStore((state) => state.selectedFileIds);
  const selectedDirPaths = useReaderStore((state) => state.selectedDirPaths);
  const theme = getTheme(themeMode);

  const toggleTheme = useReaderStore((state) => state.toggleTheme);
  const toggleSidebar = useReaderStore((state) => state.toggleSidebar);
  const setDrawerOpen = useReaderStore((state) => state.setDrawerOpen);
  const closeReader = useReaderStore((state) => state.closeReader);
  const navigateToDir = useReaderStore((state) => state.navigateToDir);
  const exitSelectionMode = useReaderStore((state) => state.exitSelectionMode);
  const moveFiles = useReaderStore((state) => state.moveFiles);
  const deleteNodes = useReaderStore((state) => state.deleteNodes);
  const setMountInvalid = useReaderStore((state) => state.setMountInvalid);

  const { pickFile, pickFiles } = useFilePicker();
  const { importDirectory, cancel: cancelImport } = useDirectoryImporter();
  const { tier, headerHeight, isShort, readerLimited } = useResponsiveLayout();
  const isWide = tier !== 'compact';
  const insets = useSafeAreaInsets();
  const [showAppMenu, setShowAppMenu] = useState(false);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [importState, setImportState] = useState<ImportOverlayState | null>(null);

  // 宽屏收放侧栏、窄屏收放抽屉，是两套状态
  const sidebarVisible = isWide ? sidebarOpen : drawerOpen;
  const setSidebarOpen = useReaderStore((state) => state.setSidebarOpen);
  // 用户手动动过侧栏之后，短屏自动收起就不再干涉
  const sidebarTouchedRef = useRef(false);
  const shortAutoCollapsedRef = useRef(false);

  const handleToggleSidebar = useCallback(() => {
    if (isWide) {
      sidebarTouchedRef.current = true;
      toggleSidebar();
    } else setDrawerOpen(!drawerOpen);
  }, [isWide, toggleSidebar, setDrawerOpen, drawerOpen]);

  /**
   * 短屏（手机横屏 ~390 高）默认收起侧栏：240 宽的树常驻会把正文压到只剩一行半。
   * 只在"进入/离开短屏"时各自动动一次，用户手动展开后不再干预。
   */
  useEffect(() => {
    if (isShort) {
      if (!shortAutoCollapsedRef.current && sidebarOpen && !sidebarTouchedRef.current) {
        shortAutoCollapsedRef.current = true;
        setSidebarOpen(false);
      }
      return;
    }
    if (shortAutoCollapsedRef.current) {
      shortAutoCollapsedRef.current = false;
      if (!sidebarTouchedRef.current) setSidebarOpen(true);
    }
  }, [isShort, sidebarOpen, setSidebarOpen]);

  // 添加单个文件：useFilePicker 内部会 addFile + openFile，右栏自动切到阅读器
  const handleAddFile = useCallback(async () => {
    const result = await pickFile();
    if (!result.success && result.error && result.error !== 'cancelled') {
      Alert.alert('提示', result.error);
    }
  }, [pickFile]);

  // iOS：「导入文件（多选）」——系统没有目录选择器，不做假入口（设计稿 §5.5）
  const handleImportFiles = useCallback(async () => {
    const result = await pickFiles();
    if (!result.success && result.error && result.error !== 'cancelled') {
      Alert.alert('提示', result.error);
    }
  }, [pickFiles]);

  /**
   * 导入目录：全深度扫描 → 索引；成功后直接进入该目录，省得用户再在树里找一遍。
   *
   * 全程有浮层：授权 / 扫描 / 写索引 / 完成四段都有明确文案和实时计数。
   * 老实现只有一条细横幅，而且只在扫描阶段出现，导入上千文件时用户看不到任何进展。
   */
  const handleImportDirectory = useCallback(
    async (initialUri?: string) => {
      const startedAt = Date.now();
      setImportState({ phase: 'picking', dirs: 0, files: 0, currentPath: '', startedAt });

      const result = await importDirectory({
        initialUri,
        onPhase: (phase) => setImportState((prev) => (prev ? { ...prev, phase } : prev)),
        onProgress: (progress) =>
          setImportState((prev) =>
            prev ? { ...prev, dirs: progress.dirs, files: progress.files, currentPath: progress.currentPath } : prev
          ),
      });

      if (!result.success) {
        setImportState(null);
        if (result.error && result.error !== 'cancelled') {
          Alert.alert('导入失败', result.error);
        }
        return;
      }

      // 让"导入完成 + 最终计数"在浮层上留一帧可读的时间
      setImportState((prev) =>
        prev ? { ...prev, phase: 'done', dirs: result.summary?.dirs ?? prev.dirs, files: result.summary?.files ?? prev.files } : prev
      );
      await new Promise((resolve) => setTimeout(resolve, IMPORT_DONE_LINGER_MS));
      setImportState(null);

      if (result.rootName) {
        navigateToDir(result.rootName, { collapseSidebar: !isWide });
      }

      // 部分成功必须说清楚，否则用户只会以为"文件又少了"
      const summary = result.summary;
      if (summary) {
        const notes: string[] = [];
        if (summary.truncated) {
          notes.push(`已达 ${MAX_IMPORT_FILES} 个文件上限，只导入了前 ${summary.files} 个`);
        }
        if (summary.maxDepthHit) {
          notes.push('部分子目录层级过深，未继续展开');
        }
        if (summary.failedDirs > 0) {
          notes.push(`${summary.failedDirs} 个目录读取失败（可能权限被收回）`);
        }
        if (summary.cancelled) {
          notes.push('导入已取消，保留已扫描到的部分');
        }
        if (notes.length > 0) {
          Alert.alert('导入完成（部分）', notes.join('\n'));
        }
      }
    },
    [importDirectory, navigateToDir, isWide]
  );

  // ============ SAF 授权失效检查（设计稿 §5.6）============
  // 每次挂载点列表变化后校验一次；失败的挂载点提示重新授权（预选回原目录重扫）。
  // 用 ref 记录已校验的 treeUri，避免每次 render 重复 query。
  const checkedMountsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (Platform.OS !== 'android' || !isSafTreeAvailable) return;

    const check = async (mount: Mount) => {
      try {
        const lister = createSafLister(mount.treeUri!);
        await lister(null);
        setMountInvalid(mount.id, false);
      } catch {
        // 置灰标记要看得到：只弹一次 Alert，用户点了"忽略"之后就再无提示，
        // 结果会反复点开一个永远失败的方向（设计稿 §5.6 行尾 ⚠）
        setMountInvalid(mount.id, true);
        Alert.alert('授权已失效', `"${mount.name}" 的目录授权已被系统收回，需要重新授权才能刷新内容。`, [
          { text: '忽略', style: 'cancel' },
          {
            text: '重新授权',
            onPress: () => void handleImportDirectory(mount.treeUri ?? undefined),
          },
        ]);
      }
    };

    for (const mount of mounts) {
      if (mount.kind !== 'saf' || !mount.treeUri) continue;
      if (checkedMountsRef.current.has(mount.id)) continue;
      checkedMountsRef.current.add(mount.id);
      void check(mount);
    }
  }, [mounts, handleImportDirectory, setMountInvalid]);

  // ============ 批量操作（选择栏动作入口在本层）============
  const selectedCount = selectedFileIds.length + selectedDirPaths.length;
  const canMoveSelected = selectedFileIds.length > 0;

  const handleBatchDelete = useCallback(() => {
    const ids = [...selectedFileIds];
    const dirPaths = [...selectedDirPaths];
    const message =
      ids.length > 0 && dirPaths.length > 0
        ? `确定要删除选中的 ${ids.length} 个文件和 ${dirPaths.length} 个目录（含其下所有文件）吗？`
        : ids.length > 0
          ? `确定要删除选中的 ${ids.length} 个文件吗？`
          : `确定要删除选中的 ${dirPaths.length} 个目录（含其下所有文件）吗？`;
    Alert.alert('确认删除', message, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          for (const id of ids) {
            const file = files.find((f) => f.id === id);
            if (file) void deleteImportedFile(file.uri);
          }
          deleteNodes({ fileIds: ids, dirPaths });
          exitSelectionMode();
        },
      },
    ]);
  }, [selectedFileIds, selectedDirPaths, files, deleteNodes, exitSelectionMode]);

  const handleBatchMove = useCallback(
    (targetDir: string) => {
      const apply = () => {
        moveFiles(selectedFileIds, targetDir);
        exitSelectionMode();
      };

      // SAF 文件的真实位置在系统目录里，本应用只有读权限，改不了磁盘结构。
      // 这种情况必须说清楚，否则用户会以为文件真的被搬走了（重新扫描就"还原"了）
      const safCount = selectedFileIds.filter((id) => {
        const file = files.find((f) => f.id === id);
        return !!file && file.uri.startsWith('content://');
      }).length;

      if (safCount === 0) {
        apply();
        return;
      }

      Alert.alert(
        '仅调整应用内位置',
        `所选文件中有 ${safCount} 个位于系统授权的目录（content://）。这里的"移动"只改变应用内的浏览位置，不会移动磁盘上的文件；重新导入该目录后它们会回到原位置。`,
        [
          { text: '取消', style: 'cancel' },
          { text: '继续', onPress: apply },
        ]
      );
    },
    [selectedFileIds, files, moveFiles, exitSelectionMode]
  );

  // MoveTargetSheet 只吃目录树：把文件节点剔除，只留目录骨架
  const dirTree = useMemo(() => stripFiles(buildFileTree(files, directories)), [files, directories]);

  const importOverlay = importState ? (
    <ImportProgressOverlay
      visible
      theme={theme}
      phase={importState.phase}
      dirs={importState.dirs}
      files={importState.files}
      currentPath={importState.currentPath}
      startedAt={importState.startedAt}
      onCancel={cancelImport}
    />
  ) : null;

  const isReading = rightPane === 'reader' && !!currentFileId;

  // 沉浸阅读：只有"阅读器自己就是整屏"的档位才隐藏应用头。
  // L 档三栏里应用头是唯一提供 paddingTop: insets.top 的地方，隐藏它会让左树/中栏顶到状态栏下，
  // 同时丢掉面包屑与"···"入口 —— 所以 large 档必须保留（设计稿 §4.2 方向修正）
  const isReadingFullscreen = isReading && tier !== 'large';

  // L 档三栏：阅读器常驻右栏；未选文件时显示占位，不抢占列表宽度
  const readerPane = isReading ? (
    <View style={readerLimited ? styles.readerLimited : styles.readerFill} pointerEvents="box-none">
      <ReaderContent
        fileId={currentFileId!}
        onBack={closeReader}
        topInset={isReadingFullscreen ? insets.top : 0}
      />
    </View>
  ) : null;

  const readerPlaceholder = (
    <View style={[styles.readerPlaceholder, { backgroundColor: theme.background }]}>
      <Ionicons name="book-outline" size={40} color={theme.textTertiary} />
      <Text style={[styles.readerPlaceholderText, { color: theme.textTertiary }]}>
        从左侧选择一个文件开始阅读
      </Text>
    </View>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}
    >
      {selectionMode && !isReadingFullscreen ? (
        <View style={{ paddingTop: insets.top }}>
          <SelectionBar
            theme={theme}
            count={selectedCount}
            canMove={canMoveSelected}
            height={headerHeight}
            onClose={exitSelectionMode}
            onMove={() => setMoveSheetOpen(true)}
            onDelete={handleBatchDelete}
          />
        </View>
      ) : !isReadingFullscreen ? (
        <AppHeader
          theme={theme}
          sidebarOpen={sidebarVisible}
          height={headerHeight}
          topInset={insets.top}
          onBack={() => navigateToDir(getParentPath(currentDirPath))}
          onToggleSidebar={handleToggleSidebar}
          onOpenMenu={() => setShowAppMenu(true)}
        />
      ) : null}
      {importOverlay}

      {/* 应用头"···"菜单：打开文件 / 导入 / 主题切换 */}
      <AppMenu
        visible={showAppMenu}
        theme={theme}
        topOffset={headerHeight + insets.top}
        isDark={themeMode === 'dark'}
        importLabel={Platform.OS === 'ios' ? '导入文件（多选）' : '打开文件夹'}
        onClose={() => setShowAppMenu(false)}
        onAddFile={() => void handleAddFile()}
        onImportDirectory={() =>
          Platform.OS === 'ios' ? void handleImportFiles() : void handleImportDirectory()
        }
        onToggleTheme={toggleTheme}
      />

      {/* 批量移动：目标目录选择（只有文件可移动；目录路径是虚拟的，暂不支持跨目录搬移） */}
      <MoveTargetSheet
        visible={moveSheetOpen}
        theme={theme}
        tree={dirTree}
        currentPath={currentDirPath}
        onPick={handleBatchMove}
        onClose={() => setMoveSheetOpen(false)}
      />

      <BrowserShell
        sidebar={<Sidebar theme={theme} />}
        mainWidth={tier === 'large' ? LIST_PANE_WIDTH : undefined}
        aside={
          tier === 'large'
            ? readerPane ?? readerPlaceholder
            : undefined
        }
      >
        {tier === 'large' ? (
          // L 档：中栏始终是目录列表，阅读器在 aside
          <FolderPane
            theme={theme}
            onAddFile={handleAddFile}
            onImportDirectory={() => void handleImportDirectory()}
          />
        ) : isReading ? (
          readerPane
        ) : (
          <FolderPane
            theme={theme}
            onAddFile={handleAddFile}
            onImportDirectory={() => void handleImportDirectory()}
          />
        )}
      </BrowserShell>
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
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPath: {
    flex: 1,
    marginHorizontal: 4,
  },
  readerFill: {
    flex: 1,
  },
  // 正文限宽（设计稿 §4.2）：阅读区 width ≥ 700 时 maxWidth 780 居中，行长控制在 60-75 字符
  readerLimited: {
    flex: 1,
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
  },
  readerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 32,
  },
  readerPlaceholderText: {
    fontSize: 13,
  },
});
