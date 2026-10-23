import React, { useEffect, useRef } from 'react';
import { Animated, BackHandler, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useReaderStore } from '../../store/readerStore';
import { useResponsive } from '../../utils/responsive';
import { getTheme } from '../../styles/themes';

const SIDEBAR_WIDTH = 280;
const ANIMATION_DURATION = 240;

interface BrowserShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 文件浏览器外壳：宽屏左右并排、窄屏抽屉浮层。
 *
 * 两条动画分开走不同的 driver：
 * - 宽屏收放的是 width，RN 不支持 native driver，只能用 JS 驱动；
 * - 窄屏收放的是 translateX，走原生线程，抽屉滑动不受 JS 线程影响。
 */
export const BrowserShell: React.FC<BrowserShellProps> = ({ sidebar, children }) => {
  // 宽屏侧栏 / 窄屏抽屉是两个状态：抽屉默认关闭，否则手机一启动就被盖住
  const sidebarOpen = useReaderStore((state) => state.sidebarOpen);
  const drawerOpen = useReaderStore((state) => state.drawerOpen);
  const setDrawerOpen = useReaderStore((state) => state.setDrawerOpen);
  const rightPane = useReaderStore((state) => state.rightPane);
  const closeReader = useReaderStore((state) => state.closeReader);
  const themeMode = useReaderStore((state) => state.theme);
  const { isWide, drawerWidth } = useResponsive();
  const theme = getTheme(themeMode);

  const visible = isWide ? sidebarOpen : drawerOpen;

  const widthAnim = useRef(new Animated.Value(sidebarOpen ? SIDEBAR_WIDTH : 0)).current;
  const drawerProgress = useRef(new Animated.Value(drawerOpen ? 1 : 0)).current;

  useEffect(() => {
    if (!isWide) return;
    Animated.timing(widthAnim, {
      toValue: sidebarOpen ? SIDEBAR_WIDTH : 0,
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [sidebarOpen, isWide, widthAnim]);

  useEffect(() => {
    if (isWide) return;
    Animated.timing(drawerProgress, {
      toValue: drawerOpen ? 1 : 0,
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, isWide, drawerProgress]);

  // 物理返回键优先级：关抽屉 > 退出阅读 > 交给系统退出 app
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isWide && drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (rightPane === 'reader') {
        closeReader();
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [isWide, drawerOpen, rightPane, setDrawerOpen, closeReader]);

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
          <View style={{ width: SIDEBAR_WIDTH, flex: 1 }}>{sidebar}</View>
        </Animated.View>
      ) : null}

      <View style={styles.content}>{children}</View>

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
