import React, { useEffect, useRef } from 'react';
import { Animated, BackHandler, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useReaderStore } from '../../store/readerStore';
import { useResponsiveLayout } from '../../utils/responsive';
import { getTheme } from '../../styles/themes';
import { getParentPath } from '../../utils/fileTree';

const ANIMATION_DURATION = 240;

interface BrowserShellProps {
  sidebar: React.ReactNode;
  /** 主内容：目录列表（三栏时为中栏） */
  children: React.ReactNode;
  /** 三栏（L 档）时的右栏：阅读器。窄档不渲染。 */
  aside?: React.ReactNode;
  /**
   * 三栏时中栏（列表）的固定宽度。
   * 设计稿 §4.2 是「列表 320 / 阅读 flex」：两栏都 flex:1 时 1280 宽会各分到 510，
   * 列表过宽、阅读区被压，配合正文限宽 780 后左右留白还会不均。
   */
  mainWidth?: number;
}

/**
 * 文件浏览器外壳（设计稿 §4.2/§4.6）：
 * - C 档：单栏 + 抽屉浮层；
 * - M/E 档：双栏，树常驻可收放（宽度随档位 240/280）；
 * - L 档：三栏，树 260 + 列表 + 阅读器（aside）。
 *
 * 两条动画分开走不同的 driver：
 * - 宽屏收放的是 width，RN 不支持 native driver，只能用 JS 驱动；
 * - 窄屏收放的是 translateX，走原生线程，抽屉滑动不受 JS 线程影响。
 */
export const BrowserShell: React.FC<BrowserShellProps> = ({ sidebar, children, aside, mainWidth }) => {
  // 宽屏侧栏 / 窄屏抽屉是两个状态：抽屉默认关闭，否则手机一启动就被盖住
  const sidebarOpen = useReaderStore((state) => state.sidebarOpen);
  const drawerOpen = useReaderStore((state) => state.drawerOpen);
  const setDrawerOpen = useReaderStore((state) => state.setDrawerOpen);
  const rightPane = useReaderStore((state) => state.rightPane);
  const closeReader = useReaderStore((state) => state.closeReader);
  const selectionMode = useReaderStore((state) => state.selectionMode);
  const exitSelectionMode = useReaderStore((state) => state.exitSelectionMode);
  const navigateToDir = useReaderStore((state) => state.navigateToDir);
  const currentDirPath = useReaderStore((state) => state.currentDirPath);
  const themeMode = useReaderStore((state) => state.theme);
  const { tier, sidebarWidth, drawerWidth } = useResponsiveLayout();
  const theme = getTheme(themeMode);

  const isWide = tier !== 'compact';
  const visible = isWide ? sidebarOpen : drawerOpen;

  const widthAnim = useRef(new Animated.Value(sidebarOpen ? sidebarWidth : 0)).current;
  const drawerProgress = useRef(new Animated.Value(drawerOpen ? 1 : 0)).current;

  useEffect(() => {
    if (!isWide) return;
    Animated.timing(widthAnim, {
      toValue: sidebarOpen ? sidebarWidth : 0,
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [sidebarOpen, isWide, sidebarWidth, widthAnim]);

  useEffect(() => {
    if (isWide) return;
    Animated.timing(drawerProgress, {
      toValue: drawerOpen ? 1 : 0,
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, isWide, drawerProgress]);

  // 物理返回键逐级退（设计稿 §7.2）：
  // 选择模式 → 抽屉（C 档）→ 阅读区 → 上一级目录 → 系统退出
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectionMode) {
        exitSelectionMode();
        return true;
      }
      if (!isWide && drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (rightPane === 'reader') {
        closeReader();
        return true;
      }
      if (currentDirPath) {
        navigateToDir(getParentPath(currentDirPath));
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [
    isWide,
    drawerOpen,
    rightPane,
    selectionMode,
    currentDirPath,
    setDrawerOpen,
    closeReader,
    exitSelectionMode,
    navigateToDir,
  ]);

  const translateX = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });

  const backdropOpacity = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
  });

  return (
    <View style={styles.root}>
      {isWide ? (
        <Animated.View
          style={[
            styles.wideSidebar,
            {
              width: widthAnim,
              borderRightWidth: visible ? StyleSheet.hairlineWidth : 0,
              borderRightColor: theme.separator,
            },
          ]}
        >
          <View style={{ width: sidebarWidth, flex: 1 }}>{sidebar}</View>
        </Animated.View>
      ) : null}

      {/* 三栏时中栏定宽（设计稿 320），阅读区吃剩余宽度 */}
      <View style={mainWidth && aside ? { width: mainWidth } : styles.content}>{children}</View>

      {/* L 档三栏：阅读器常驻右栏；窄档由 children 自行切换阅读/列表 */}
      {tier === 'large' && aside ? (
        <>
          <View style={[styles.divider, { backgroundColor: theme.separator }]} />
          <View style={styles.content}>{aside}</View>
        </>
      ) : null}

      {!isWide ? (
        <>
          <Animated.View
            pointerEvents={visible ? 'auto' : 'none'}
            style={[styles.backdrop, { opacity: backdropOpacity }]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setDrawerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="关闭目录树"
            />
          </Animated.View>

          <Animated.View
            pointerEvents={visible ? 'auto' : 'none'}
            style={[
              styles.drawer,
              {
                width: drawerWidth,
                transform: [{ translateX }],
                backgroundColor: theme.surface,
                borderRightColor: theme.separator,
              },
            ]}
          >
            {sidebar}
          </Animated.View>
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  wideSidebar: {
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
  },
});
