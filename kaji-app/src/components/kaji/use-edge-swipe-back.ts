import { useCallback, useRef } from "react";

type EdgeSwipeBackOptions = {
  onBack: () => void;
  enabled?: boolean;
  /** Horizontal start area from the left edge (px). Default: 28 */
  edgeWidth?: number;
  /** Minimum swipe distance (px). Default: 56 */
  threshold?: number;
};

export function useEdgeSwipeBack({
  onBack,
  enabled = true,
  edgeWidth = 28,
  threshold = 56,
}: EdgeSwipeBackOptions) {
  const tracking = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  const reset = useCallback(() => {
    tracking.current = false;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (!touch || touch.clientX > edgeWidth) {
        tracking.current = false;
        return;
      }
      tracking.current = true;
      startX.current = touch.clientX;
      startY.current = touch.clientY;
    },
    [edgeWidth, enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !tracking.current) return;
      const touch = e.touches[0];
      if (!touch) {
        tracking.current = false;
        return;
      }
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;
      if (dx < -12 || Math.abs(dy) > Math.abs(dx) + 24) {
        tracking.current = false;
      }
    },
    [enabled],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !tracking.current) return;
      const touch = e.changedTouches[0];
      if (!touch) {
        tracking.current = false;
        return;
      }
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;
      tracking.current = false;
      if (dx >= threshold && Math.abs(dx) > Math.abs(dy)) {
        onBack();
      }
    },
    [enabled, onBack, threshold],
  );

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset };
}
