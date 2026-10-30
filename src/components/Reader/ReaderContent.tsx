import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
  Share,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BackChevron } from '../Icons/BackChevron';
import { useReaderStore } from '../../store/readerStore';
import { readBase64File, readTextFile } from '../../services/saf';
import { getTheme } from '../../styles/themes';
import { getLanguage } from '../../utils/fileHelper';
import { convertOfficeDocument, isConvertibleType } from '../../utils/office';
import { MarkdownRenderer } from '../../components/Reader/MarkdownRenderer';
import { CodeRenderer } from '../../components/Reader/CodeRenderer';
import { TextRenderer } from '../../components/Reader/TextRenderer';
import { PdfRenderer } from '../../components/Reader/PdfRenderer';
import { SettingsPanel } from '../../components/SettingsPanel/SettingsPanel';
import { ReaderMenu } from '../../components/Reader/ReaderMenu';
import { useLongPressScroll } from '../../hooks/useLongPressScroll';
import type { FileType } from '../../types';

const HEADER_HEIGHT = 56;

/** 首次进入全屏时的提示：全屏后没有可见的菜单入口，不说一句用户会以为卡住了 */
const FULLSCREEN_HINT = '长按正文可打开菜单，退出全屏或返回目录';

interface ReaderContentProps {
  fileId: string | undefined;
  /** 提供时在头部显示返回按钮（文件浏览器右栏用它回到目录内容） */
  onBack?: () => void;
  /**
   * 顶部安全区高度。全屏时应用头 / 阅读器头都不渲染，
   * 由阅读器自己顶到屏幕上缘并让开状态栏。
   */
  topInset?: number;
  /** 全屏阅读：隐藏标题栏，正文独占整屏，长按唤出菜单 */
  fullscreen?: boolean;
}

/** 需要按文本读取的类型（其余类型要么走二进制解析，要么交给原生视图） */
function isTextualType(type: FileType): boolean {
  return type === 'markdown' || type === 'text' || type === 'code';
}

export const ReaderContent: React.FC<ReaderContentProps> = ({
  fileId,
  onBack,
  topInset = 0,
  fullscreen = false,
}) => {
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
  const toggleReaderFullscreen = useReaderStore((state) => state.toggleReaderFullscreen);

  const [showSettings, setShowSettings] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  /**
   * loading 用"正在读哪个文件"表示，而不是布尔值。
   *
   * 旧实现是 `isReloading: boolean` + `if (!cancelled) setIsReloading(false)`：
   * 读 A 的过程中切到 B，A 的 finally 被 cancelled 守卫吞掉，B 若命中"内容已缓存"提前 return，
   * 布尔值就永远停在 true —— 正文其实已经有了，屏幕上却一直转圈，只能杀进程。
   */
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ fileId: string; message: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hintVisible, setHintVisible] = useState(false);
  const hintShownRef = useRef(false);

  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';

  const language = currentFile ? getLanguage(currentFile.name) : 'plaintext';

  // 首次进入全屏时提示一次（每次进程启动一次即可，不必落盘）
  useEffect(() => {
    if (!fullscreen || hintShownRef.current) {
      setHintVisible(false);
      return;
    }
    hintShownRef.current = true;
    setHintVisible(true);
    const timer = setTimeout(() => setHintVisible(false), 3200);
    return () => clearTimeout(timer);
  }, [fullscreen]);

  /**
   * 按需加载正文。
   * - 文本类（md/txt/code）：直接读 UTF-8；
   * - docx/xlsx：读 base64 → 转成 Markdown（结果回填到 content，后续再打开直接用缓存）；
   * - pdf：不读内容，直接把这个 uri 交给原生 PDF 视图。
   */
  useEffect(() => {
    if (!currentFile) return;
    if (currentFile.content !== '') return;
    if (Platform.OS === 'web' || !currentFile.uri) return;
    if (currentFile.type === 'pdf') return;

    const target = currentFile;
    const officeType = isConvertibleType(target.type) ? target.type : null;
    if (!officeType && !isTextualType(target.type)) return;

    setLoadingFileId(target.id);
    setLoadError(null);

    (async () => {
      try {
        let content: string;
        if (officeType) {
          const base64 = await readBase64File(target.uri);
          content = await convertOfficeDocument(officeType, base64, target.id);
        } else {
          // 走 services/saf：content:// 原生直读优先，内部带超时，不会无限等待
          content = await readTextFile(target.uri);
        }

        if (content) {
          // 只回填内容，不改变 currentFileId（分屏下否则会把用户正在读的文件切走）
          updateFileContent(target.id, content);
        } else {
          setLoadError({ fileId: target.id, message: '文件内容为空（0 字节）' });
        }
      } catch (error) {
        const detail = error instanceof Error && error.message ? error.message : '';
        setLoadError({
          fileId: target.id,
          message: detail
            ? officeType
              ? detail
              : `无法读取文件内容：${detail}`
            : '无法读取文件内容，文件可能已被移动或删除',
        });
      } finally {
        // 无论这次请求是否被"切换文件"打断，都必须清掉自己置的 loading。
        // 用函数式更新，避免把后来那个文件的 loading 一起清掉。
        setLoadingFileId((prev) => (prev === target.id ? null : prev));
      }
    })();
  }, [currentFile, updateFileContent, reloadToken]);

  /** 读取失败 / 内容为空时重试：把 token 加一，effect 依赖变化后重新拉一次 */
  const handleRetry = useCallback(() => {
    setLoadError(null);
    setReloadToken((token) => token + 1);
  }, []);

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

  const openMenu = useCallback(() => {
    setHintVisible(false);
    setShowMenu(true);
  }, []);

  /** 长按正文唤出菜单：回调挂在滚动容器自己的 onTouch* 上，不影响滚动 */
  const scrollTouchProps = useLongPressScroll(openMenu);

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

    // PDF 不读内容：直接把 uri 交给原生视图（web 端没有原生 PDF 组件，给明确提示）
    if (currentFile.type === 'pdf') {
      return (
        <PdfRenderer
          uri={currentFile.uri}
          theme={theme}
          name={currentFile.name}
        />
      );
    }

    /**
     * 首帧也要按"正在加载"处理：effect 在首次绘制之后才跑，
     * 否则会先闪一下"文件内容为空"再切成转圈。只要 uri 存在且还没拿到失败结论，
     * 这个 loading 一定会被上面的 effect 结束掉，不会再出现永远转圈。
     */
    const awaitingContent =
      currentFile.content === '' &&
      !!currentFile.uri &&
      Platform.OS !== 'web' &&
      loadError?.fileId !== currentFile.id;

    // 只有"当前这个文件正在读"才转圈：切到别的文件后旧请求不会把转圈带到新文件上
    if (loadingFileId === currentFile.id || awaitingContent) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {isConvertibleType(currentFile.type) ? '正在解析文档...' : '正在加载文件内容...'}
          </Text>
        </View>
      );
    }

    if (!currentFile.content) {
      const errorForFile = loadError?.fileId === currentFile.id ? loadError.message : null;
      // 内容读不出来时给"重试"而不是让用户退出去再点一次（重试会重新走一次读取链路）
      const canRetry = !!currentFile.uri && Platform.OS !== 'web';
      return (
        <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
          <Ionicons name="document-text-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {errorForFile ?? '文件内容为空'}
          </Text>
          {canRetry ? (
            <TouchableOpacity
              style={[styles.retryButton, { borderColor: theme.primary }]}
              onPress={handleRetry}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="重新读取文件内容"
            >
              <Text style={[styles.retryText, { color: theme.primary }]}>重新读取</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    switch (currentFile.type) {
      case 'markdown':
      // docx / xlsx 的内容在加载阶段已经被转成 Markdown，渲染路径与 md 完全一致
      case 'docx':
      case 'xlsx':
        return (
          <MarkdownRenderer
            content={currentFile.content}
            theme={theme}
            fontSize={fontSize}
            codeTheme={codeTheme}
            isDark={isDark}
            onScroll={handleScroll}
            scrollTouchProps={scrollTouchProps}
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
              scrollTouchProps={scrollTouchProps}
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
            scrollTouchProps={scrollTouchProps}
          />
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* 头部：一行搞定 —— 返回 + 文档标题 + "···"（分享/收藏/设置/主题都收进菜单）。
          全屏时整条不渲染，正文从屏幕顶端开始，由 container 的 paddingTop 让开状态栏。 */}
      {fullscreen ? null : (
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.headerBackground,
              borderBottomColor: theme.separator,
              paddingTop: topInset,
              // RN 是 border-box：paddingTop 算在 height 里面，必须显式加上，
              // 否则状态栏 24~44pt 的手机上只剩十几 pt 放标题和按钮（图标会顶进状态栏）
              height: HEADER_HEIGHT + topInset,
            },
          ]}
        >
          {onBack ? (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="返回目录"
            >
              <BackChevron color={theme.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerButtonPlaceholder} />
          )}

          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {currentFile?.name ?? '阅读器'}
          </Text>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel="更多操作"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* 进度条：全屏时它就是最顶部那条线，正好落在状态栏下沿 */}
      {progress > 0 && progress < 100 ? (
        <View style={[styles.progressBar, { backgroundColor: theme.separator }]}>
          <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.primary }]} />
        </View>
      ) : null}

      {/*
        内容区域。
        长按正文唤出菜单 —— 全屏后没有可见的菜单入口，长按是唯一"随手就能用"的手势。

        注意：这里**不能**用 Pressable 包住滚动容器。Pressability 在手指按下时就会抢占
        JS responder，Android 上抢 responder 默认 blockNativeResponder=true，会截断内层
        原生 ScrollView/FlatList 的触摸分发 —— 表现就是正文完全滚不动。
        长按改为挂在滚动容器自身的 onTouch* 上（useLongPressScroll），不碰 responder。
      */}
      <View style={[styles.body, fullscreen ? { paddingTop: topInset } : null]}>
        {renderContent()}
      </View>

      {/* 全屏提示：只在本次进程首次进入全屏时出现，不打扰后续阅读 */}
      {fullscreen && hintVisible ? (
        <Pressable style={styles.hint} onPress={() => setHintVisible(false)}>
          <Text style={styles.hintText}>{FULLSCREEN_HINT}</Text>
        </Pressable>
      ) : null}

      {/* 长按的兜底入口：右下角一个低透明度小圆点，纯长按没有可见入口时用户不至于困在全屏里 */}
      {fullscreen ? (
        <TouchableOpacity
          style={[styles.floatingMenu, { backgroundColor: theme.surfaceAlt, borderColor: theme.separator }]}
          onPress={openMenu}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="打开阅读菜单"
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      ) : null}

      {/* "···"菜单：全屏切换 / 返回目录 / 分享 / 收藏 / 设置 / 主题切换 */}
      <ReaderMenu
        visible={showMenu}
        theme={theme}
        topOffset={fullscreen ? Math.max(topInset, 12) : HEADER_HEIGHT + topInset}
        title={currentFile?.name}
        fullscreen={fullscreen}
        isBookmarked={isBookmarked}
        isDark={isDark}
        onClose={() => setShowMenu(false)}
        onShare={() => void handleShare()}
        onToggleBookmark={() => fileId && toggleBookmark(fileId)}
        onOpenSettings={() => setShowSettings(true)}
        onToggleTheme={toggleTheme}
        onToggleFullscreen={toggleReaderFullscreen}
        onBackToFolder={onBack}
      />

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
    height: HEADER_HEIGHT,
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
  body: {
    flex: 1,
  },
  progressBar: {
    height: 2,
    width: '100%',
  },
  progressFill: {
    height: '100%',
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
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 40,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 13,
    textAlign: 'center',
  },
  floatingMenu: {
    position: 'absolute',
    right: 10,
    bottom: 18,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.55,
  },
});
