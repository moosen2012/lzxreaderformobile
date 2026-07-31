import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Clipboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReaderStore } from '../../store/readerStore';
import { useFilePicker } from '../../hooks/useFilePicker';
import { useResponsive } from '../../utils/responsive';
import { getTheme } from '../../styles/themes';
import { FileList } from '../../components/FileList/FileList';
import { ThemeToggle } from '../../components/ThemeToggle/ThemeToggle';
import { ReaderContent } from '../../components/Reader/ReaderContent';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FileItem } from '../../types';

type RootStackParamList = {
  Home: undefined;
  Reader: { fileId: string };
};

interface HomeScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const {
    files,
    currentFileId,
    theme: themeMode,
    bookmarks,
    setCurrentFile,
    removeFile,
    toggleBookmark,
    toggleTheme,
  } = useReaderStore();

  const { pickFile } = useFilePicker();
  const { useSplitView, fileListWidth, readerWidth } = useResponsive();
  const theme = getTheme(themeMode);

  // 处理文件选择
  const handleAddFile = useCallback(async () => {
    const result = await pickFile();
    if (!result.success) {
      if (result.error && result.error !== 'cancelled') {
        Alert.alert('提示', result.error);
      }
      return;
    }
    // 如果是手机，跳转到阅读器
    if (!useSplitView && result.file) {
      navigation.navigate('Reader', { fileId: result.file.id });
    }
  }, [pickFile, useSplitView, navigation]);

  // 处理文件点击
  const handleFilePress = useCallback(
    (file: FileItem) => {
      setCurrentFile(file.id);
      if (!useSplitView) {
        navigation.navigate('Reader', { fileId: file.id });
      }
    },
    [setCurrentFile, useSplitView, navigation]
  );

  // 处理文件删除
  const handleFileDelete = useCallback(
    (file: FileItem) => {
      removeFile(file.id);
    },
    [removeFile]
  );

  // 处理书签切换
  const handleToggleBookmark = useCallback(
    (file: FileItem) => {
      toggleBookmark(file.id);
    },
    [toggleBookmark]
  );

  // 处理目录点击
  const handlePressDirectory = useCallback(
    (file: FileItem) => {
      if (!file.directory) return;
      Alert.alert(
        '文件目录',
        file.directory,
        [
          { text: '复制路径', onPress: () => { Clipboard.setString(file.directory || ''); } },
          { text: '关闭', style: 'cancel' },
        ],
        { cancelable: true }
      );
    },
    []
  );

  // 平板分屏布局
  if (useSplitView) {
    return (
      <View style={[styles.splitContainer, { backgroundColor: theme.background }]}>
        {/* 左侧：文件列表 */}
        <View style={{ width: fileListWidth, maxWidth: 420 }}>
          <View style={[styles.splitHeader, { backgroundColor: theme.headerBackground, borderBottomColor: theme.separator }]}>
            <View style={styles.splitHeaderLeft}>
              <Ionicons name="book" size={24} color={theme.primary} />
              <Text style={[styles.appTitle, { color: theme.text }]}>LZX Reader</Text>
            </View>
            <ThemeToggle theme={theme} mode={themeMode} onToggle={toggleTheme} />
          </View>
          <FileList
            files={files}
            theme={theme}
            currentFileId={currentFileId}
            bookmarks={bookmarks}
            onFilePress={handleFilePress}
            onFileDelete={handleFileDelete}
            onFileToggleBookmark={handleToggleBookmark}
            onAddFile={handleAddFile}
            onPressDirectory={handlePressDirectory}
          />
        </View>

        {/* 分割线 */}
        <View style={[styles.splitDivider, { backgroundColor: theme.separator }]} />

        {/* 右侧：阅读器 */}
        <View style={{ width: readerWidth, flex: 1 }}>
          {currentFileId ? (
            <ReaderContent fileId={currentFileId} isEmbedded />
          ) : (
            <View style={[styles.emptyReader, { backgroundColor: theme.background }]}>
              <View style={[styles.emptyReaderIcon, { backgroundColor: theme.surfaceAlt }]}>
                <Ionicons name="book-outline" size={64} color={theme.textTertiary} />
              </View>
              <Text style={[styles.emptyReaderTitle, { color: theme.text }]}>
                选择一个文件开始阅读
              </Text>
              <Text style={[styles.emptyReaderDesc, { color: theme.textSecondary }]}>
                从左侧文件列表中选择文件
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // 手机布局
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.headerBackground, borderBottomColor: theme.separator }]}>
        <View style={styles.headerLeft}>
          <Ionicons name="book" size={24} color={theme.primary} />
          <Text style={[styles.appTitle, { color: theme.text }]}>LZX Reader</Text>
        </View>
        <ThemeToggle theme={theme} mode={themeMode} onToggle={toggleTheme} />
      </View>
      <FileList
        files={files}
        theme={theme}
        currentFileId={currentFileId}
        bookmarks={bookmarks}
        onFilePress={handleFilePress}
        onFileDelete={handleFileDelete}
        onFileToggleBookmark={handleToggleBookmark}
        onAddFile={handleAddFile}
        onPressDirectory={handlePressDirectory}
      />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  splitHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  splitDivider: {
    width: StyleSheet.hairlineWidth,
  },
  emptyReader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyReaderIcon: {
    width: 120,
    height: 120,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyReaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyReaderDesc: {
    fontSize: 14,
    textAlign: 'center',
  },
});
