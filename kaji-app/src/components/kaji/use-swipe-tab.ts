import { useCallback, useRef } from "react";

type SwipeTabOptions<T extends string> = {
  tabs: readonly T[];
  activeTab: T;
  onChangeTab: (tab: T) => void;
  /** Minimum horizontal distance (px) to trigger a swipe. Default: 50 */
  threshold?: number;
  /** If true, swipe is disabled. */
  disabled?: boolean;
};

export function useSwipeTab<T extends string>({
  tabs,
  activeTab,
  onChangeTab,
  threshold = 50,
  disabled = false,
}: SwipeTabOptions<T>) {
  const startX = useRef(0);
  const startY = useRef(0);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
    },
    [disabled],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      // Only trigger if horizontal movement exceeds vertical
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;

      const idx = tabs.indexOf(activeTab);
      if (idx === -1) return;

      if (dx < 0 && idx < tabs.length - 1) {
        // Swipe left → next tab
        onChangeTab(tabs[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        // Swipe right → previous tab
        onChangeTab(tabs[idx - 1]);
      }
    },
    [disabled, threshold, tabs, activeTab, onChangeTab],
  );

  return { onTouchStart, onTouchEnd };
}
