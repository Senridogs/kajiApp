import { useCallback, useEffect, useRef, useState } from "react";

type SwipeTabOptions<T extends string> = {
  tabs: readonly T[];
  activeTab: T;
  onChangeTab: (tab: T) => void;
  /** Minimum horizontal distance (px) to trigger a swipe. Default: 50 */
  threshold?: number;
  /** If true, swipe is disabled. */
  disabled?: boolean;
  /** Horizontal gesture dominance ratio over vertical movement. Default: 1.0 */
  dominanceRatio?: number;
  /** Minimum movement before locking gesture direction. Default: 10 */
  lockDistance?: number;
  /** Minimum swipe velocity (px/ms) for flick-based trigger. Default: 0.7 */
  minFlickVelocity?: number;
  /** Minimum distance (px) for flick-based trigger. Default: 28 */
  minFlickDistance?: number;
  /** Animation time (ms) used when snapping back or completing swipe. Default: 0 */
  transitionDurationMs?: number;
  /**
   * If true, swipe is accepted only when:
   * - left swipe starts from the right side
   * - right swipe starts from the left side
   */
  requireDirectionalHalfStart?: boolean;
  /** Dead-zone width ratio around center (0..0.9). Default: 0 */
  centerDeadZoneRatio?: number;
};

export type SwipeTabVisualState<T extends string> = {
  fromTab: T;
  toTab: T | null;
  /** -1..1 (negative = swipe left, positive = swipe right) */
  progress: number;
  isDragging: boolean;
  isAnimating: boolean;
};

type TrackingState<T extends string> = {
  active: boolean;
  horizontalLocked: boolean;
  startTab: T | null;
  startAt: number;
  width: number;
  startLocalX: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function useSwipeTab<T extends string>({
  tabs,
  activeTab,
  onChangeTab,
  threshold = 50,
  disabled = false,
  dominanceRatio = 1,
  lockDistance = 10,
  minFlickVelocity = 0.7,
  minFlickDistance = 28,
  transitionDurationMs = 0,
  requireDirectionalHalfStart = false,
  centerDeadZoneRatio = 0,
}: SwipeTabOptions<T>) {
  const startX = useRef(0);
  const startY = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tracking = useRef<TrackingState<T>>({
    active: false,
    horizontalLocked: false,
    startTab: null,
    startAt: 0,
    width: 1,
    startLocalX: 0,
  });

  const [visual, setVisual] = useState<SwipeTabVisualState<T>>({
    fromTab: activeTab,
    toTab: null,
    progress: 0,
    isDragging: false,
    isAnimating: false,
  });

  const clearSettleTimer = useCallback(() => {
    if (!settleTimer.current) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = null;
  }, []);

  const resetVisual = useCallback(
    (tab: T) => {
      setVisual({
        fromTab: tab,
        toTab: null,
        progress: 0,
        isDragging: false,
        isAnimating: false,
      });
    },
    [setVisual],
  );

  useEffect(() => () => clearSettleTimer(), [clearSettleTimer]);

  const getTargetTab = useCallback(
    (fromTab: T, dx: number) => {
      if (dx === 0) return null;
      const idx = tabs.indexOf(fromTab);
      if (idx === -1) return null;
      const targetIdx = dx < 0 ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= tabs.length) return null;
      return tabs[targetIdx] ?? null;
    },
    [tabs],
  );

  const settleTo = useCallback(
    (next: {
      fromTab: T;
      toTab: T | null;
      progress: number;
      isAnimating: boolean;
      onDone?: () => void;
    }) => {
      setVisual({
        fromTab: next.fromTab,
        toTab: next.toTab,
        progress: next.progress,
        isDragging: false,
        isAnimating: next.isAnimating,
      });

      if (transitionDurationMs <= 0) {
        next.onDone?.();
        resetVisual(next.toTab ?? next.fromTab);
        return;
      }

      clearSettleTimer();
      settleTimer.current = setTimeout(() => {
        next.onDone?.();
        resetVisual(next.toTab ?? next.fromTab);
      }, transitionDurationMs);
    },
    [clearSettleTimer, resetVisual, transitionDurationMs],
  );

  const isStartAllowedForDirection = useCallback(
    (dx: number, startLocalX: number, width: number) => {
      if (!requireDirectionalHalfStart || dx === 0) return true;
      const clampedRatio = clamp(centerDeadZoneRatio, 0, 0.9);
      const center = width / 2;
      const deadZoneHalf = (width * clampedRatio) / 2;
      if (startLocalX > center - deadZoneHalf && startLocalX < center + deadZoneHalf) {
        return false;
      }
      if (dx < 0) {
        return startLocalX >= center + deadZoneHalf;
      }
      return startLocalX <= center - deadZoneHalf;
    },
    [centerDeadZoneRatio, requireDirectionalHalfStart],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const touch = e.touches[0];
      if (!touch) return;
      const rect = e.currentTarget.getBoundingClientRect();

      clearSettleTimer();

      startX.current = touch.clientX;
      startY.current = touch.clientY;
      tracking.current.active = true;
      tracking.current.horizontalLocked = false;
      tracking.current.startTab = activeTab;
      tracking.current.startAt = Date.now();
      tracking.current.width = Math.max(1, rect.width || e.currentTarget.clientWidth);
      tracking.current.startLocalX = touch.clientX - rect.left;

      setVisual({
        fromTab: activeTab,
        toTab: null,
        progress: 0,
        isDragging: false,
        isAnimating: false,
      });
    },
    [activeTab, clearSettleTimer, disabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || !tracking.current.active) return;
      const touch = e.touches[0];
      const fromTab = tracking.current.startTab;
      if (!touch || !fromTab) return;

      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!tracking.current.horizontalLocked) {
        if (absDx < lockDistance && absDy < lockDistance) {
          return;
        }
        if (absDx < absDy * dominanceRatio) {
          tracking.current.active = false;
          resetVisual(fromTab);
          return;
        }
        tracking.current.horizontalLocked = true;
      }

      if (!isStartAllowedForDirection(dx, tracking.current.startLocalX, tracking.current.width)) {
        tracking.current.active = false;
        resetVisual(fromTab);
        return;
      }

      const targetTab = getTargetTab(fromTab, dx);
      const width = tracking.current.width;
      const baseProgress = clamp(dx / width, -1, 1);
      const progress = targetTab ? baseProgress : baseProgress * 0.22;

      setVisual({
        fromTab,
        toTab: targetTab,
        progress,
        isDragging: true,
        isAnimating: false,
      });
    },
    [disabled, dominanceRatio, getTargetTab, lockDistance, resetVisual],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || !tracking.current.active) return;
      const touch = e.changedTouches[0];
      const fromTab = tracking.current.startTab;
      if (!touch || !fromTab) {
        tracking.current.active = false;
        return;
      }

      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const dt = Math.max(1, Date.now() - tracking.current.startAt);
      const velocity = absDx / dt;

      const targetTab = getTargetTab(fromTab, dx);
      const horizontalDominant = absDx >= absDy * dominanceRatio;
      const startAllowed = isStartAllowedForDirection(
        dx,
        tracking.current.startLocalX,
        tracking.current.width,
      );
      const distanceEnough = absDx >= threshold;
      const flickEnough = absDx >= minFlickDistance && velocity >= minFlickVelocity;
      const shouldCommit =
        Boolean(targetTab) &&
        startAllowed &&
        horizontalDominant &&
        (distanceEnough || flickEnough);

      tracking.current.active = false;

      if (shouldCommit && targetTab) {
        const finalProgress = dx < 0 ? -1 : 1;
        settleTo({
          fromTab,
          toTab: targetTab,
          progress: finalProgress,
          isAnimating: transitionDurationMs > 0,
          onDone: () => onChangeTab(targetTab),
        });
        return;
      }

      settleTo({
        fromTab,
        toTab: targetTab,
        progress: 0,
        isAnimating: transitionDurationMs > 0,
      });
    },
    [
      disabled,
      dominanceRatio,
      getTargetTab,
      isStartAllowedForDirection,
      minFlickDistance,
      minFlickVelocity,
      onChangeTab,
      settleTo,
      threshold,
      transitionDurationMs,
    ],
  );

  const onTouchCancel = useCallback(() => {
    const fromTab = tracking.current.startTab ?? activeTab;
    tracking.current.active = false;
    settleTo({
      fromTab,
      toTab: null,
      progress: 0,
      isAnimating: transitionDurationMs > 0,
    });
  }, [activeTab, settleTo, transitionDurationMs]);

  const visualState: SwipeTabVisualState<T> =
    visual.isDragging || visual.isAnimating || Math.abs(visual.progress) > 0.0001
      ? visual
      : {
        fromTab: activeTab,
        toTab: null,
        progress: 0,
        isDragging: false,
        isAnimating: false,
      };

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, visual: visualState };
}
