import { useCallback, useEffect, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import {
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_TOLERANCE_PX,
  exceedsLongPressTolerance,
  shouldTriggerLongPress,
  type TouchPoint,
} from '../utils/longPressGesture';

/** 可以透传给 ScrollView / FlatList 的触摸回调集合 */
export interface ScrollTouchProps {
  onTouchStart: (event: GestureResponderEvent) => void;
  onTouchMove: (event: GestureResponderEvent) => void;
  onTouchEnd: (event: GestureResponderEvent) => void;
  onTouchCancel: (event: GestureResponderEvent) => void;
}

function pointOf(event: GestureResponderEvent): TouchPoint {
  const { pageX, pageY } = event.nativeEvent;
  return { x: pageX, y: pageY };
}

/**
 * 在滚动容器上做长按检测，且**不抢 responder**。
 *
 * 这些回调直接挂在 ScrollView / FlatList 上（原生视图自己收到触摸事件），
 * 我们不调用任何 responder 相关 API，所以滚动、惯性滑动、下拉刷新都不受影响。
 *
 * @param onLongPress 触发的动作；传 undefined 时所有回调都是空操作
 */
export function useLongPressScroll(
  onLongPress?: () => void,
  delayMs: number = LONG_PRESS_DELAY_MS,
  tolerancePx: number = LONG_PRESS_TOLERANCE_PX
): ScrollTouchProps {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<TouchPoint>({ x: 0, y: 0 });
  const lastRef = useRef<TouchPoint>({ x: 0, y: 0 });

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 组件卸载 / 切换文件时不能留下野定时器（回调里会 setState）
  useEffect(() => clearTimer, [clearTimer]);

  const onTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      if (!onLongPress) return;
      const point = pointOf(event);
      originRef.current = point;
      lastRef.current = point;
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // 到点后再校验一次：定时器会被滚动时的 layout 计算拖后，期间手指可能已经移开
        if (shouldTriggerLongPress(originRef.current, lastRef.current, tolerancePx)) {
          onLongPress();
        }
      }, delayMs);
    },
    [onLongPress, delayMs, tolerancePx, clearTimer]
  );

  const onTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      if (!onLongPress) return;
      const point = pointOf(event);
      lastRef.current = point;
      if (exceedsLongPressTolerance(originRef.current, point, tolerancePx)) {
        clearTimer();
      }
    },
    [onLongPress, tolerancePx, clearTimer]
  );

  const onTouchEnd = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onTouchCancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
