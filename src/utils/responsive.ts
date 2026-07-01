import { Dimensions, useWindowDimensions } from 'react-native';
import type { DimensionValue } from 'react-native';
import { useState, useEffect } from 'react';

// 断点定义
export const BREAKPOINTS = {
  TABLET: 768,
  SMALL_TABLET: 600,
};

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

  // 是否使用分屏布局
  const useSplitView = isTablet;

  // 文件列表宽度比例
  const fileListWidth: DimensionValue = isTablet ? '30%' : isSmallTablet ? '38%' : '100%';
  const readerWidth: DimensionValue = isTablet ? '70%' : isSmallTablet ? '62%' : '100%';

  // 是否横屏
  const isLandscape = width > height;

  return {
    width,
    height,
    isPhone,
    isSmallTablet,
    isTablet,
    useSplitView,
    fileListWidth,
    readerWidth,
    isLandscape,
  };
}

// 监听屏幕旋转
export function useOrientation() {
  const [orientation, setOrientation] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return width > height ? 'landscape' : 'portrait';
  });

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setOrientation(window.width > window.height ? 'landscape' : 'portrait');
    });
    return () => subscription?.remove();
  }, []);

  return orientation;
}
