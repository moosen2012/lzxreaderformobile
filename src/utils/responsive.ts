import { useWindowDimensions } from 'react-native';
import { useRef } from 'react';
import {
  BREAKPOINTS,
  HEADER_HEIGHT,
  HEADER_HEIGHT_SHORT,
  READER_CONTENT_MAX_WIDTH,
  READER_MAX_WIDTH_TRIGGER,
  SHORT_HEIGHT,
  TIER_BREAKPOINTS,
  boundaryBetween,
  drawerWidthFor,
  getDeviceType,
  headerHeightFor,
  readerLimitedFor,
  resolveTier,
  sidebarWidthForTier,
  tierForWidth,
  type LayoutTier,
} from './layoutTiers';

/**
 * 响应式布局 hook（档位判定逻辑在 utils/layoutTiers.ts，纯函数，可 Node 单测）。
 * 这里只负责订阅窗口尺寸、持有防抖状态，并把结果摊平成 UI 需要的形状。
 */

export interface ResponsiveLayout {
  width: number;
  height: number;
  tier: LayoutTier;
  isShort: boolean;
  isLandscape: boolean;
  /** 树窗格宽度；compact 为 0（走抽屉） */
  sidebarWidth: number;
  /** compact 抽屉宽度 */
  drawerWidth: number;
  /** 顶栏高度（已含短屏压缩） */
  headerHeight: number;
  /** 阅读区是否需要限宽居中 */
  readerLimited: boolean;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const isShort = height < SHORT_HEIGHT;
  const isLandscape = width > height;

  // 断点防抖：宽度在边界 ±24pt 内抖动时保持当前档位，避免布局闪烁
  const tierRef = useRef<LayoutTier>(tierForWidth(width));
  tierRef.current = resolveTier(tierRef.current, width);
  const tier = tierRef.current;

  return {
    width,
    height,
    tier,
    isShort,
    isLandscape,
    sidebarWidth: sidebarWidthForTier(tier),
    drawerWidth: drawerWidthFor(width),
    headerHeight: headerHeightFor(height),
    readerLimited: readerLimitedFor(width),
  };
}

export function useResponsive() {
  const { tier, width, height, isLandscape, drawerWidth, isShort } = useResponsiveLayout();
  const { isPhone, isSmallTablet, isTablet } = getDeviceType(width);

  return {
    width,
    height,
    tier,
    isShort,
    isPhone,
    isSmallTablet,
    isTablet,
    // 兼容旧语义：非 compact 即"宽屏"（宽屏 = 树常驻，窄屏 = 抽屉）
    isWide: tier !== 'compact',
    drawerWidth,
    isLandscape,
  };
}

export {
  BREAKPOINTS,
  HEADER_HEIGHT,
  HEADER_HEIGHT_SHORT,
  READER_CONTENT_MAX_WIDTH,
  READER_MAX_WIDTH_TRIGGER,
  SHORT_HEIGHT,
  TIER_BREAKPOINTS,
  boundaryBetween,
  getDeviceType,
  resolveTier,
  tierForWidth,
  type LayoutTier,
};
