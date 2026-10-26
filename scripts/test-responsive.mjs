/**
 * 响应式档位与断点防抖的回归测试。
 *
 * 之前 responsive.ts 完全没有单测，而它是"四档布局 + 横屏修正"的唯一判定来源：
 * 档位算错会让平板横屏三栏消失、手机横屏被当成宽屏（240 侧栏挤掉正文）。
 * 纯函数部分（tierForWidth / boundaryBetween / resolveTier）在这里逐个钉住。
 */
import {
  BREAKPOINT_HYSTERSIS,
  HEADER_HEIGHT,
  HEADER_HEIGHT_SHORT,
  SHORT_HEIGHT,
  TIER_BREAKPOINTS,
  boundaryBetween,
  resolveTier,
  tierForWidth,
} from '../src/utils/layoutTiers.ts';

const cases = [
  {
    name: 'tierForWidth 四档边界（含边界值归属）',
    expect: () =>
      tierForWidth(320) === 'compact' &&
      tierForWidth(TIER_BREAKPOINTS.MEDIUM - 1) === 'compact' &&
      tierForWidth(TIER_BREAKPOINTS.MEDIUM) === 'medium' &&
      tierForWidth(TIER_BREAKPOINTS.EXPANDED - 1) === 'medium' &&
      tierForWidth(TIER_BREAKPOINTS.EXPANDED) === 'expanded' &&
      tierForWidth(TIER_BREAKPOINTS.LARGE - 1) === 'expanded' &&
      tierForWidth(TIER_BREAKPOINTS.LARGE) === 'large',
  },
  {
    name: '手机横屏 844×390 落到 medium（不是 large）',
    expect: () => tierForWidth(844) === 'medium',
  },
  {
    name: 'boundaryBetween 相邻返回边界、跨档返回 null',
    expect: () =>
      boundaryBetween('compact', 'medium') === TIER_BREAKPOINTS.MEDIUM &&
      boundaryBetween('medium', 'expanded') === TIER_BREAKPOINTS.EXPANDED &&
      boundaryBetween('expanded', 'large') === TIER_BREAKPOINTS.LARGE &&
      boundaryBetween('large', 'expanded') === TIER_BREAKPOINTS.LARGE &&
      boundaryBetween('compact', 'expanded') === null &&
      boundaryBetween('compact', 'compact') === null,
  },
  {
    name: 'resolveTier 边界内抖动不切换（防抖）',
    expect: () => {
      // 从 compact 起，宽度刚越过 600 但没超过 600+24
      const near = TIER_BREAKPOINTS.MEDIUM + BREAKPOINT_HYSTERSIS - 1;
      return resolveTier('compact', near) === 'compact';
    },
  },
  {
    name: 'resolveTier 越过阈值才切换',
    expect: () =>
      resolveTier('compact', TIER_BREAKPOINTS.MEDIUM + BREAKPOINT_HYSTERSIS) === 'medium' &&
      resolveTier('medium', TIER_BREAKPOINTS.MEDIUM - BREAKPOINT_HYSTERSIS) === 'compact',
  },
  {
    name: 'resolveTier 跨档跳变（分屏瞬间拉伸）直接放行',
    expect: () => resolveTier('compact', 1400) === 'large' && resolveTier('large', 360) === 'compact',
  },
  {
    name: 'resolveTier 同档位保持不变',
    expect: () => resolveTier('medium', TIER_BREAKPOINTS.MEDIUM + 10) === 'medium',
  },
  {
    name: '短屏阈值与顶栏高度关系',
    expect: () => SHORT_HEIGHT === 480 && HEADER_HEIGHT_SHORT < HEADER_HEIGHT,
  },
];

let failed = 0;
for (const testCase of cases) {
  let ok = false;
  try {
    ok = testCase.expect();
  } catch (error) {
    console.log(`FAIL  ${testCase.name} (${error instanceof Error ? error.message : error})`);
    failed += 1;
    continue;
  }

  if (!ok) {
    failed += 1;
    console.log(`FAIL  ${testCase.name}`);
  } else {
    console.log(`PASS  ${testCase.name}`);
  }
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 个用例失败`);
process.exit(failed === 0 ? 0 : 1);
