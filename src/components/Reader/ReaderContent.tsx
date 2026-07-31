import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Platform,
  ScrollView,
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
  onBack?: () => void;
  isEmbedded?: boolean;
}

export const ReaderContent: React.FC<ReaderContentProps> = ({ fileId, onBack, isEmbedded = false }) => {
  const {
    files,
    theme: themeMode,
    fontSize,
    codeTheme,
    bookmarks,
    toggleBookmark,
    toggleTheme,
    setFontSize,
    setCodeTheme,
    addFile,
  } = useReaderStore();

  const [showSettings, setShowSettings] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(0);
  const [isReloading, setIsReloading] = useState(false);

  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';

  // 获取当前文件
  const currentFile = useMemo(
    () => files.find((f) => f.id === fileId) ?? null,
    [files, fileId]
  );

  const isBookmarked = fileId ? bookmarks.includes(fileId) : false;
  const language = currentFile ? getLanguage(currentFile.name) : 'plaintext';

  // 如果文件内容为空，尝试重新读取（针对持久化后 content 丢失的情况）
  useEffect(() => {
    async function reloadContent() {
      if (!currentFile || currentFile.content !== '' || isReloading) return;
      // Web 平台没有本地 URI 可重新读取
      if (Platform.OS === 'web') return;
      // 没有有效的本地 URI
      if (!currentFile.uri) return;

      setIsReloading(true);
      try {
        const content = await FileSystem.readAsStringAsync(currentFile.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        // 更新文件内容
        addFile({ ...currentFile, content });
      } catch {
        // 读取失败，静默处理
      } finally {
        setIsReloading(false);
      }
    }

    reloadContent();
  }, [currentFile, addFile, isReloading]);

  // 阅读进度
  const progress = useMemo(() => {
    if (contentHeight === 0 || scrollHeight === 0) return 0;
    const maxScroll = contentHeight - scrollHeight;
    if (maxScroll <= 0) return 100;
    return Math.min(100, Math.max(0, (scrollOffset / maxScroll) * 100));
  }, [scrollOffset, contentHeight, scrollHeight]);

  // 分享文件
  const handleShare = useCallback(async () => {
    if (!currentFile) return;
    try {
      await Share.share({
        message: currentFile.content,
        title: currentFile.name,
      });
    } catch (error) {
      // 忽略分享错误
    }
  }, [currentFile]);

  // 渲染内容
  const renderContent = () => {
    if (!currentFile) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            文件未找到
          </Text>
        </View>
      );
    }

    if (!currentFile.content && currentFile.content !== '') {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            正在加载文件内容...
          </Text>
        </View>
      );
    }

    // 内容为空字符串时显示提示
    if (currentFile.content === '') {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
          <Ionicons name="document-text-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            文件内容为空
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
            onScroll={(e) => {
              setScrollOffset(e.nativeEvent.contentOffset.y);
              setContentHeight(e.nativeEvent.contentSize.height);
              setScrollHeight(e.nativeEvent.layoutMeasurement.height);
            }}
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
        return (
          <TextRenderer
            content={currentFile.content}
            theme={theme}
            fontSize={fontSize}
          />
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: theme.headerBackground, borderBottomColor: theme.separator }]}>
        {/* 返回按钮（非嵌入式模式才显示） */}
        {!isEmbedded && onBack ? (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="返回"
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
          {/* 分享 */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="分享"
          >
            <Ionicons name="share-outline" size={22} color={theme.primary} />
          </TouchableOpacity>

          {/* 书签 */}
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

          {/* 设置 */}
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
      {progress > 0 && progress < 100 && (
        <View style={[styles.progressBar, { backgroundColor: theme.separator }]}>
          <View
            style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.primary }]}
          />
        </View>
      )}

      {/* 面包屑导航 */}
      {currentFile?.directory ? (
        <View style={[styles.breadcrumbBar, { backgroundColor: theme.headerBackground, borderBottomColor: theme.separator }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.breadcrumbContent}
          >
            <TouchableOpacity
              style={styles.breadcrumbItem}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="返回首页"
            >
              <Ionicons name="home-outline" size={13} color={theme.textSecondary} />
            </TouchableOpacity>
            {currentFile.directory.split('/').map((segment, idx, arr) => (
              <React.Fragment key={idx}>
                <Ionicons name="chevron-forward" size={12} color={theme.textTertiary} />
                <Text
                  style={[styles.breadcrumbText, { color: idx === arr.length - 1 ? theme.textSecondary : theme.textTertiary }]}
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
  },
});
