import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useReaderStore } from '../../store/readerStore';
import { useFilePicker } from '../../hooks/useFilePicker';
import { useDirectoryImporter } from '../../hooks/useDirectoryImporter';
import { useResponsive } from '../../utils/responsive';
import { getTheme, type Theme } from '../../styles/themes';
import { BrowserShell } from '../../components/Browser/BrowserShell';
import { Sidebar } from '../../components/Browser/Sidebar';
import { FolderPane } from '../../components/Browser/FolderPane';
import { ThemeToggle } from '../../components/ThemeToggle/ThemeToggle';
import { ReaderContent } from '../../components/Reader/ReaderContent';

interface AppHeaderProps {
  theme: Theme;
  themeMode: 'light' | 'dark';
  sidebarOpen: boolean;
  /** 状态栏/刘海高度：顶栏从 y=0 起画（背景要延伸到状态栏后面），但内容必须让开 */
  topInset: number;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
}

/** 顶栏横跨两栏：汉堡按钮控制左侧目录树，任何形态下都能找到 */
const AppHeader: React.FC<AppHeaderProps> = ({
  theme,
  themeMode,
  sidebarOpen,
  topInset,
  onToggleSidebar,
  onToggleTheme,
}) => (
  <View
    style={[
      styles.header,
      {
        backgroundColor: theme.headerBackground,
        borderBottomColor: theme.separator,
        paddingTop: topInset,
        height: HEADER_HEIGHT + topInset,
      },
    ]}
  >
    <View style={styles.headerLeft}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={onToggleSidebar}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={sidebarOpen ? '隐藏目录树' : '显示目录树'}
      >
        <Ionicons name="menu" size={22} color={sidebarOpen ? theme.primary : theme.textSecondary} />
      </TouchableOpacity>

      <Ionicons name="book" size={20} color={theme.primary} />
      <Text style={[styles.appTitle, { color: theme.text }]}>LZX Reader</Text>
    </View>

    <ThemeToggle theme={theme} mode={themeMode} onToggle={onToggleTheme} />
  </View>
);

export const HomeScreen: React.FC = () => {
  const currentFileId = useReaderStore((state) => state.currentFileId);
  const rightPane = useReaderStore((state) => state.rightPane);
  const sidebarOpen = useReaderStore((state) => state.sidebarOpen);
  const drawerOpen = useReaderStore((state) => state.drawerOpen);
  const themeMode = useReaderStore((state) => state.theme);
  const theme = getTheme(themeMode);

  const toggleTheme = useReaderStore((state) => state.toggleTheme);
  const toggleSidebar = useReaderStore((state) => state.toggleSidebar);
  const setDrawerOpen = useReaderStore((state) => state.setDrawerOpen);
  const closeReader = useReaderStore((state) => state.closeReader);
  const navigateToDir = useReaderStore((state) => state.navigateToDir);

  const { pickFile } = useFilePicker();
  const { importDirectory } = useDirectoryImporter();
  const { isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);

  // 宽屏收放侧栏、窄屏收放抽屉，是两套状态
  const sidebarVisible = isWide ? sidebarOpen : drawerOpen;
  const handleToggleSidebar = useCallback(() => {
    if (isWide) toggleSidebar();
    else setDrawerOpen(!drawerOpen);
  }, [isWide, toggleSidebar, setDrawerOpen, drawerOpen]);

  // 添加单个文件：useFilePicker 内部会 addFile + openFile，右栏自动切到阅读器
  const handleAddFile = useCallback(async () => {
    const result = await pickFile();
    if (!result.success && result.error && result.error !== 'cancelled') {
      Alert.alert('提示', result.error);
    }
  }, [pickFile]);

  // 导入目录：成功后直接进入该目录，省得用户再在树里找一遍
  const handleImportDirectory = useCallback(async () => {
    setImportProgress({ done: 0, total: 0 });
    const result = await importDirectory((done, total) => setImportProgress({ done, total }));
    setImportProgress(null);

    if (!result.success) {
      if (result.error && result.error !== 'cancelled') {
        Alert.alert('导入失败', result.error);
      }
      return;
    }

    if (result.rootName) {
      navigateToDir(result.rootName, { collapseSidebar: !isWide });
    }
  }, [importDirectory, navigateToDir, isWide]);

  const progressBanner = importProgress ? (
    <View style={[styles.progressBanner, { backgroundColor: theme.surfaceAlt }]}>
      <Text style={[styles.progressText, { color: theme.textSecondary }]}>
        正在导入 {importProgress.done}/{importProgress.total || '…'}
      </Text>
    </View>
  ) : null;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}
    >
      <AppHeader
        theme={theme}
        themeMode={themeMode}
        sidebarOpen={sidebarVisible}
        topInset={insets.top}
        onToggleSidebar={handleToggleSidebar}
        onToggleTheme={toggleTheme}
      />
      {progressBanner}

      <BrowserShell sidebar={<Sidebar theme={theme} />}>
        {rightPane === 'reader' && currentFileId ? (
          <ReaderContent fileId={currentFileId} onBack={closeReader} />
        ) : (
          <FolderPane
            theme={theme}
            onAddFile={handleAddFile}
            onImportDirectory={handleImportDirectory}
          />
        )}
      </BrowserShell>
    </View>
  );
};

const HEADER_HEIGHT = 52;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 2,
  },
  progressBanner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  progressText: {
    fontSize: 12,
  },
});
