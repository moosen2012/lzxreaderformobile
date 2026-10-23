import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Platform,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { useReaderStore } from '../../store/readerStore';
import { getTheme } from '../../styles/themes';
import { getLanguage } from '../../utils/fileHelper';
import { MarkdownRenderer } from '../../components/Reader/MarkdownRenderer';
import { CodeRenderer } from '../../components/Reader/CodeRenderer';
import { TextRenderer } from '../../components/Reader/TextRenderer';
import { SettingsPanel } from '../../components/SettingsPanel/SettingsPanel';

interface ReaderContentProps {
  fileId: string | undefined;
  /** 提供时在头部显示返回按钮（文件浏览器右栏用它回到目录内容） */
  onBack?: () => void;
}

export const ReaderContent: React.FC<ReaderContentProps> = ({ fileId, onBack }) => {
  // 逐字段订阅：避免 files/bookmarks 之外的字段变化（比如主题、字号）引起整块重渲染
  const currentFile = useReaderStore((state) => state.files.find((f) => f.id === fileId) ?? null);
  const themeMode = useReaderStore((state) => state.theme);
  const fontSize = useReaderStore((state) => state.fontSize);
  const codeTheme = useReaderStore((state) => state.codeTheme);
  const isBookmarked = useReaderStore((state) => (fileId ? state.bookmarks.includes(fileId) : false));
  const toggleBookmark = useReaderStore((state) => state.toggleBookmark);
  const toggleTheme = useReaderStore((state) => state.toggleTheme);
  const setFontSize = useReaderStore((state) => state.setFontSize);
  const setCodeTheme = useReaderStore((state) => state.setCodeTheme);
  const updateFileContent = useReaderStore((state) => state.updateFileContent);

  const [showSettings, setShowSettings] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';

  const language = currentFile ? getLanguage(currentFile.name) : 'plaintext';

  // 如果文件内容为空，尝试重新读取（针对持久化后 content 丢失的情况）
  useEffect(() => {
    if (!currentFile) return;
    if (currentFile.content !== '') return;
    if (Platform.OS === 'web' || !currentFile.uri) return;

    let cancelled = false;
    setIsReloading(true);
    setReloadError(null);

    (async () => {
      try {
        const content = await FileSystem.readAsStringAsync(currentFile.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (cancelled) return;
        if (content) {
          // 只回填内容，不改变 currentFileId（分屏下否则会把用户正在读的文件切走）
          updateFileContent(currentFile.id, content);
        } else {
          setReloadError('文件内容为空');
        }
      } catch {
        if (!cancelled) setReloadError('无法读取文件内容，文件可能已被移动或删除');
      } finally {
        if (!cancelled) setIsReloading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentFile, updateFileContent]);

  /**
   * 滚动进度：滚动事件 16ms 一次，直接 setState 会让整棵阅读器每秒重渲染几十次。
   * 这里只在整数百分比发生变化时才更新。
   */
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const maxScroll = contentSize.height - layoutMeasurement.height;
    const ratio = maxScroll <= 0 ? 100 : (contentOffset.y / maxScroll) * 100;
    const rounded = Math.min(100, Math.max(0, Math.round(ratio)));
    setProgress((prev) => (prev === rounded ? prev : rounded));
  }, []);

  // 分享文件
  const handleShare = useCallback(async () => {
    if (!currentFile) return;
    try {
      await Share.share({
        message: currentFile.content,
        title: currentFile.name,
      });
    } catch {
      // 用户取消分享，忽略
    }
  }, [currentFile]);

  const renderContent = () => {
    if (!currentFile) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>文件未找到</Text>
        </View>
      );
    }

    if (isReloading) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            正在加载文件内容...
          </Text>
        </View>
      );
    }

    if (!currentFile.content) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
          <Ionicons name="document-text-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {reloadError ?? '文件内容为空'}
          </Text>
        </View>
      );
    }

    switch (currentFile.type) {
      case 'markdown':
        return (
          <MarkdownRenderer
            content={currentFile.content}
            theme={theme}
            fontSize={fontSize}
            codeTheme={codeTheme}
            isDark={isDark}
            onScroll={handleScroll}
          />
        );

      case 'code':
        return (
          <View style={{ flex: 1, backgroundColor: theme.background }}>
            <CodeRenderer
              content={currentFile.content}
              language={language}
              theme={theme}
              codeTheme={codeTheme}
              isDark={isDark}
            />
          </View>
        );

      case 'text':
      default:
        return <TextRenderer content={currentFile.content} theme={theme} fontSize={fontSize} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: theme.headerBackground, borderBottomColor: theme.separator }]}>
        {/* 返回按钮：内嵌在文件浏览器右栏时也要能回到目录内容 */}
        {onBack ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="返回目录"
          >
            <Ionicons name="chevron-back" size={26} color={theme.primary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButtonPlaceholder} />
        )}

        {/* 文件名 */}
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {currentFile?.name ?? '阅读器'}
        </Text>

        {/* 右侧按钮组 */}
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="分享"
          >
            <Ionicons name="share-outline" size={22} color={theme.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => fileId && toggleBookmark(fileId)}
            accessibilityRole="button"
            accessibilityLabel={isBookmarked ? '取消书签' : '添加书签'}
          >
            <Ionicons
              name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={22}
              color={isBookmarked ? theme.warning : theme.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowSettings(true)}
            accessibilityRole="button"
            accessibilityLabel="设置"
          >
            <Ionicons name="settings-outline" size={22} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 进度条 */}
      {progress > 0 && progress < 100 ? (
        <View style={[styles.progressBar, { backgroundColor: theme.separator }]}>
          <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.primary }]} />
        </View>
      ) : null}

      {/* 面包屑导航 */}
      {currentFile?.directory ? (
        <View style={[styles.breadcrumbBar, { backgroundColor: theme.headerBackground, borderBottomColor: theme.separator }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbContent}>
            <TouchableOpacity
              style={styles.breadcrumbItem}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="返回首页"
            >
              <Ionicons name="home-outline" size={13} color={theme.textSecondary} />
            </TouchableOpacity>
            {currentFile.directory.split('/').map((segment, idx, arr) => (
              <React.Fragment key={`${segment}-${idx}`}>
                <Ionicons name="chevron-forward" size={12} color={theme.textTertiary} />
                <Text
                  style={[
                    styles.breadcrumbText,
                    { color: idx === arr.length - 1 ? theme.textSecondary : theme.textTertiary },
                  ]}
                  numberOfLines={1}
                >
                  {segment}
                </Text>
              </React.Fragment>
            ))}
            <Ionicons name="chevron-forward" size={12} color={theme.textTertiary} />
            <Text style={[styles.breadcrumbText, { color: theme.primary, fontWeight: '500' }]} numberOfLines={1}>
              {currentFile.name}
            </Text>
          </ScrollView>
        </View>
      ) : null}

      {/* 内容区域 */}
      {renderContent()}

      {/* 设置面板 */}
      <SettingsPanel
        visible={showSettings}
        theme={theme}
        themeMode={themeMode}
        fontSize={fontSize}
        codeTheme={codeTheme}
        onClose={() => setShowSettings(false)}
        onToggleTheme={toggleTheme}
        onFontSizeChange={setFontSize}
        onCodeThemeChange={setCodeTheme}
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
    paddingHorizontal: 8,
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    padding: 6,
    borderRadius: 8,
  },
  headerButtonPlaceholder: {
    width: 38,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  progressBar: {
    height: 2,
    width: '100%',
  },
  progressFill: {
    height: '100%',
  },
  breadcrumbBar: {
    height: 32,
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  breadcrumbContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 4,
  },
  breadcrumbItem: {
    padding: 2,
  },
  breadcrumbText: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
