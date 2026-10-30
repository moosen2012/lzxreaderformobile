/**
 * 长按判定（纯逻辑，无 RN 依赖，便于 Node 回归测试）。
 *
 * 为什么不用 Pressable 包住正文：
 * Pressable（Pressability）在手指按下时就会抢占 JS responder，Android 上抢 responder
 * 默认 blockNativeResponder = true，会截断内层原生 ScrollView/FlatList 的触摸分发，
 * 结果就是正文一行都滚不动。所以长按改由滚动容器自己的 onTouch* 事件来判：
 * 原生滚动照旧，我们在旁边用一个定时器看"指头是否原地按满 420ms"。
 */

/** 长按延时：比系统默认 500ms 稍短，读文档时手感更跟手 */
export const LONG_PRESS_DELAY_MS = 420;

/**
 * 位移容差（pt）。
 * 手指在屏幕上几乎不可能完全静止（尤其滚动时手指会有轻微位移），
 * 容差太小会把"轻轻按住"误判成滚动；太大会让按下后小幅拖动也弹出菜单。
 */
export const LONG_PRESS_TOLERANCE_PX = 10;

export interface TouchPoint {
  x: number;
  y: number;
}

/** 位移是否已超出容差：超出即认为用户在滚动，应立刻取消长按计时 */
export function exceedsLongPressTolerance(
  origin: TouchPoint,
  current: TouchPoint,
  tolerancePx: number = LONG_PRESS_TOLERANCE_PX
): boolean {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  // 用平方比较，避免每次移动都开方
  return dx * dx + dy * dy > tolerancePx * tolerancePx;
}

/**
 * 定时器到点时是否应该真的触发长按。
 * 定时器本身可能因为 JS 线程繁忙而晚到（滚动中的 layout 计算就会拖），
 * 所以到点后再校验一次位移，防止"边滚边弹菜单"。
 */
export function shouldTriggerLongPress(
  origin: TouchPoint,
  current: TouchPoint,
  tolerancePx: number = LONG_PRESS_TOLERANCE_PX
): boolean {
  return !exceedsLongPressTolerance(origin, current, tolerancePx);
}
