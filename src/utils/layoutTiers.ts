/**
 * 四档布局的纯逻辑（无 React / RN 依赖，便于 Node 直接跑回归测试）。
 *
 * 以 width 定档，以 height/方向叠加修正：
 * - C Compact  : width < 600            单栏 + 抽屉
 * - M Medium   : 600 ≤ width < 900      双栏（树 240）
 * - E Expanded : 900 ≤ width < 1200     双栏（树 280）
 * - L Large    : width ≥ 1200           三栏（树 260 + 列表 + 阅读）
 *
 * 防抖（§4.1「断点防抖」）：分屏/折叠屏拖动时宽度会来回越过档位边界，
 * 只有当宽度离"当前档位与目标档位之间的边界"≥ BREAKPOINT_HYSTERSIS pt 时才真正切换，
 * 避免布局闪烁与侧栏动画反复重启。
 */

export type LayoutTier = 'compact' | 'medium' | 'expanded' | 'large';

export const TIER_BREAKPOINTS = {
  MEDIUM: 600,
  EXPANDED: 900,
  LARGE: 1200,
} as const;

/** 断点防抖阈值（pt） */
export const BREAKPOINT_HYSTERSIS = 24;

/** 短屏阈值：手机横屏典型高度 ~390 */
export const SHORT_HEIGHT = 480;

/** 短屏下顶栏压缩：52 → 44 */
export const HEADER_HEIGHT = 52;
export const HEADER_HEIGHT_SHORT = 44;

/** 正文限宽（阅读区 width ≥ READER_MAX_WIDTH_TRIGGER 时生效） */
export const READER_CONTENT_MAX_WIDTH = 780;
export const READER_MAX_WIDTH_TRIGGER = 700;

/** 各档位侧栏宽度（树窗格）；compact 走抽屉，宽度由 drawerWidth 决定 */
const SIDEBAR_WIDTH_BY_TIER: Record<Exclude<LayoutTier, 'compact'>, number> = {
  medium: 240,
  expanded: 280,
  large: 260,
};

export function tierForWidth(width: number): LayoutTier {
  if (width < TIER_BREAKPOINTS.MEDIUM) return 'compact';
  if (width < TIER_BREAKPOINTS.EXPANDED) return 'medium';
  if (width < TIER_BREAKPOINTS.LARGE) return 'expanded';
  return 'large';
}

/** 两个档位之间的边界值；相邻才返回具体边界，跨档直接放行（返回 null） */
export function boundaryBetween(a: LayoutTier, b: LayoutTier): number | null {
  const order: LayoutTier[] = ['compact', 'medium', 'expanded', 'large'];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (Math.abs(ia - ib) !== 1) return null;
  const [lo, hi] = ia < ib ? [a, b] : [b, a];
  if (lo === 'compact' && hi === 'medium') return TIER_BREAKPOINTS.MEDIUM;
  if (lo === 'medium' && hi === 'expanded') return TIER_BREAKPOINTS.EXPANDED;
  return TIER_BREAKPOINTS.LARGE;
}

/**
 * 防抖后的档位。
 * 相邻档位必须越过边界至少 BREAKPOINT_HYSTERSIS pt 才切换；跨档（窗口瞬间跳变）直接放行。
 */
export function resolveTier(prev: LayoutTier, width: number): LayoutTier {
  const target = tierForWidth(width);
  if (target === prev) return prev;
  const boundary = boundaryBetween(prev, target);
  if (boundary == null || Math.abs(width - boundary) >= BREAKPOINT_HYSTERSIS) return target;
  return prev;
}

/** 树窗格宽度；compact 为 0（走抽屉） */
export function sidebarWidthForTier(tier: LayoutTier): number {
  return tier === 'compact' ? 0 : SIDEBAR_WIDTH_BY_TIER[tier];
}

/** 抽屉宽度：随屏幕宽度收放，最多 340 */
export function drawerWidthFor(width: number): number {
  return Math.min(Math.round(width * 0.84), 340);
}

/** 顶栏高度（已含短屏压缩） */
export function headerHeightFor(height: number): number {
  return height < SHORT_HEIGHT ? HEADER_HEIGHT_SHORT : HEADER_HEIGHT;
}

/** 阅读区是否需要限宽居中 */
export function readerLimitedFor(width: number): boolean {
  return width >= READER_MAX_WIDTH_TRIGGER;
}

// ---------------------------------------------------------------------------
// 旧接口（兼容保留）：早期只有"宽/窄"两档，部分组件仍用 isWide 判断
// ---------------------------------------------------------------------------

export const BREAKPOINTS = {
  TABLET: TIER_BREAKPOINTS.EXPANDED,
  SMALL_TABLET: TIER_BREAKPOINTS.MEDIUM,
};

export const WIDE_BREAKPOINT = BREAKPOINTS.TABLET;

export function getDeviceType(width: number) {
  return {
    isPhone: width < BREAKPOINTS.SMALL_TABLET,
    isSmallTablet: width >= BREAKPOINTS.SMALL_TABLET && width < BREAKPOINTS.TABLET,
    isTablet: width >= BREAKPOINTS.TABLET,
  };
}
