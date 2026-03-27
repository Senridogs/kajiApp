"use client";

import { useState, useCallback, useRef } from "react";

const PULL_THRESHOLD = 80;

export function usePullRefresh(onRefresh: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    }
  }, []);

  const onTouchEnd = useCallback(
    async (e: React.TouchEvent) => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const endY = e.changedTouches[0].clientY;
      const diff = endY - startYRef.current;
      if (diff > PULL_THRESHOLD) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    },
    [onRefresh],
  );

  return { refreshing, onTouchStart, onTouchEnd };
}
