import { useCallback, useRef, useState } from "react";

type SwipeDeleteOptions = {
  /** Minimum horizontal distance (px) to trigger delete. Default: 100 */
  threshold?: number;
  /** Called when swipe exceeds threshold */
  onDelete: () => void;
};

type SwipeDeleteState = {
  offsetX: number;
  swiping: boolean;
};

export function useSwipeDelete({
  threshold = 100,
  onDelete,
}: SwipeDeleteOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef<"horizontal" | "vertical" | null>(null);
  const suppressClick = useRef(false);
  const [state, setState] = useState<SwipeDeleteState>({
    offsetX: 0,
    swiping: false,
  });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    locked.current = null;
    suppressClick.current = false;
    setState({ offsetX: 0, swiping: true });
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    if (locked.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        locked.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      return;
    }

    if (locked.current === "vertical") return;

    // Only allow left swipe (negative dx)
    const clampedDx = Math.min(0, dx);
    setState({ offsetX: clampedDx, swiping: true });
  }, []);

  const onTouchEnd = useCallback(() => {
    setState((prev) => {
      suppressClick.current = prev.offsetX < -8;
      if (prev.offsetX < -threshold) {
        onDelete();
      }
      return { offsetX: 0, swiping: false };
    });
    locked.current = null;
  }, [threshold, onDelete]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClick.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick.current = false;
  }, []);

  return {
    offsetX: state.offsetX,
    swiping: state.swiping,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onClickCapture,
    },
  };
}
