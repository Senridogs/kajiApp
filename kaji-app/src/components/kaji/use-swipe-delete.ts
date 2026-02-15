import { useCallback, useRef, useState } from "react";

type SwipeDeleteOptions = {
  /** Minimum horizontal distance (px) to trigger delete. Default: 100 */
  threshold?: number;
  /** Require gesture to start within this many px from right edge. Disabled when 0 or undefined. */
  startFromRightEdgePx?: number;
  /** Additional predicate to decide if gesture can start. */
  startPredicate?: (event: React.TouchEvent) => boolean;
  /** Called when swipe exceeds threshold */
  onDelete: () => void;
};

type SwipeDeleteState = {
  offsetX: number;
  swiping: boolean;
};

export function useSwipeDelete({
  threshold = 100,
  startFromRightEdgePx,
  startPredicate,
  onDelete,
}: SwipeDeleteOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentOffsetX = useRef(0);
  const locked = useRef<"horizontal" | "vertical" | null>(null);
  const gestureEnabled = useRef(true);
  const suppressClick = useRef(false);
  const [state, setState] = useState<SwipeDeleteState>({
    offsetX: 0,
    swiping: false,
  });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rightEdgeDistance = e.currentTarget.getBoundingClientRect().right - touch.clientX;
    const passesPredicate = startPredicate ? startPredicate(e) : true;
    const withinStartZone =
      passesPredicate &&
      (!startFromRightEdgePx ||
        (rightEdgeDistance >= 0 && rightEdgeDistance <= startFromRightEdgePx));

    gestureEnabled.current = withinStartZone;
    if (!withinStartZone) {
      locked.current = null;
      currentOffsetX.current = 0;
      suppressClick.current = false;
      setState({ offsetX: 0, swiping: false });
      return;
    }

    startX.current = touch.clientX;
    startY.current = touch.clientY;
    locked.current = null;
    currentOffsetX.current = 0;
    suppressClick.current = false;
    setState({ offsetX: 0, swiping: true });
  }, [startFromRightEdgePx, startPredicate]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!gestureEnabled.current) return false;

    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    if (locked.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        locked.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      return false;
    }

    if (locked.current === "vertical") return false;

    // Only allow left swipe (negative dx)
    const clampedDx = Math.min(0, dx);
    currentOffsetX.current = clampedDx;
    setState({ offsetX: clampedDx, swiping: true });
    return clampedDx < 0;
  }, []);

  const onTouchEnd = useCallback(() => {
    const consumed = gestureEnabled.current && currentOffsetX.current < 0;

    if (!gestureEnabled.current) {
      locked.current = null;
      currentOffsetX.current = 0;
      suppressClick.current = false;
      return false;
    }

    setState((prev) => {
      suppressClick.current = prev.offsetX < -8;
      if (prev.offsetX < -threshold) {
        onDelete();
      }
      return { offsetX: 0, swiping: false };
    });
    locked.current = null;
    currentOffsetX.current = 0;
    gestureEnabled.current = false;
    return consumed;
  }, [threshold, onDelete]);

  const onTouchCancel = useCallback(() => {
    const consumed = gestureEnabled.current && currentOffsetX.current < 0;
    locked.current = null;
    currentOffsetX.current = 0;
    gestureEnabled.current = false;
    suppressClick.current = false;
    setState({ offsetX: 0, swiping: false });
    return consumed;
  }, []);

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
      onTouchCancel,
      onClickCapture,
    },
  };
}
