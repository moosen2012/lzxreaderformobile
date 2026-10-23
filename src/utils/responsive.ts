import { useWindowDimensions } from 'react-native';

// 断点定义
export const BREAKPOINTS = {
  TABLET: 768,
  SMALL_TABLET: 600,
};

/** 宽屏：左树常驻、右侧内容并排。窄屏：目录树改为抽屉浮层。 */
export const WIDE_BREAKPOINT = BREAKPOINTS.TABLET;

// 获取设备类型
export function getDeviceType(width: number) {
  return {
    isPhone: width < BREAKPOINTS.SMALL_TABLET,
    isSmallTablet: width >= BREAKPOINTS.SMALL_TABLET && width < BREAKPOINTS.TABLET,
    isTablet: width >= BREAKPOINTS.TABLET,
  };
}

// 响应式Hook
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const { isPhone, isSmallTablet, isTablet } = getDeviceType(width);

  // 宽屏用双栏，窄屏用抽屉
  const isWide = width >= WIDE_BREAKPOINT;

  // 抽屉宽度：窄屏下占 84%，但不至于在小平板上宽得离谱
  const drawerWidth = Math.min(Math.round(width * 0.84), 340);

  return {
    width,
    height,
    isPhone,
    isSmallTablet,
    isTablet,
    isWide,
    drawerWidth,
    isLandscape: width > height,
  };
}
