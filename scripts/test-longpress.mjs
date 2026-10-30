/**
 * 长按判定的回归测试。
 *
 * 背景：正文原先用 Pressable 包住滚动容器来实现长按唤菜单，结果 Pressability 在按下时就
 * 抢 JS responder（Android blockNativeResponder=true），把内层原生 ScrollView 的触摸分发
 * 截断，正文完全滚不动。现在长按改成挂在滚动容器自己的 onTouch* 上，判定逻辑收敛到
 * utils/longPressGesture.ts 这两个纯函数里，必须钉住：
 * - 轻微手抖（< 10pt）仍然算长按；
 * - 一旦真的滚动（> 10pt）立刻不触发；
 * - 定时器晚到时按"最后一次位置"复检，避免边滚边弹菜单。
 */
import {
  LONG_PRESS_TOLERANCE_PX,
  exceedsLongPressTolerance,
  shouldTriggerLongPress,
} from '../src/utils/longPressGesture.ts';

const origin = { x: 100, y: 200 };

const cases = [
  {
    name: '原地按住：不超出容差',
    expect: () => !exceedsLongPressTolerance(origin, { x: 100, y: 200 }),
  },
  {
    name: '容差内的轻微手抖仍算按住（6/6 → 8.5pt）',
    expect: () =>
      !exceedsLongPressTolerance(origin, { x: origin.x + 6, y: origin.y + 6 }),
  },
  {
    name: '刚好等于容差仍算按住（边界取闭区间）',
    expect: () => !exceedsLongPressTolerance(origin, { x: origin.x + LONG_PRESS_TOLERANCE_PX, y: origin.y }),
  },
  {
    name: '超出容差即视为滚动',
    expect: () => exceedsLongPressTolerance(origin, { x: origin.x + LONG_PRESS_TOLERANCE_PX + 1, y: origin.y }),
  },
  {
    name: '纯纵向滑动同样取消长按',
    expect: () => exceedsLongPressTolerance(origin, { x: origin.x, y: origin.y - 40 }),
  },
  {
    name: '位移按欧氏距离算：dx=dy=8 合计 11.3pt，超出 10pt 容差',
    expect: () => exceedsLongPressTolerance(origin, { x: origin.x + 8, y: origin.y + 8 }),
  },
  {
    name: '定时器到点时位置未移动 → 触发',
    expect: () => shouldTriggerLongPress(origin, { x: origin.x + 2, y: origin.y + 3 }),
  },
  {
    name: '定时器到点前已滚走 → 不触发',
    expect: () => !shouldTriggerLongPress(origin, { x: origin.x, y: origin.y + 120 }),
  },
  {
    name: '自定义容差生效',
    expect: () => exceedsLongPressTolerance(origin, { x: origin.x + 5, y: origin.y }, 3),
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
