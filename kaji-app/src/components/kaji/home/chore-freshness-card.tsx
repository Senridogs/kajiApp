"use client";

import { memo, useCallback, useRef } from "react";
import type { ChoreWithComputed } from "@/lib/types";
import { motion } from "motion/react";
import { freshnessHue, plantStage as getPlantStage } from "@/lib/freshness";
import { PlantIcon } from "./plant-icon";
import { useDarkMode } from "../hooks/use-dark-mode";

type Props = {
  chore: ChoreWithComputed;
  onRecord: (choreId: string) => void;
  onLongPress?: (chore: ChoreWithComputed) => void;
};

// カードの背景色をfreshnessRatioから連続グラデーションで計算
function cardBgStyle(ratio: number): React.CSSProperties {
  const hue = freshnessHue(ratio);
  return {
    backgroundColor: `hsl(${hue}, 75%, 92%)`,
    borderColor: `hsl(${hue}, 60%, 78%)`,
  };
}

function cardBgStyleDark(ratio: number): React.CSSProperties {
  const hue = freshnessHue(ratio);
  return {
    backgroundColor: `hsl(${hue}, 40%, 18%)`,
    borderColor: `hsl(${hue}, 35%, 28%)`,
  };
}

export const ChoreFreshnessCard = memo(function ChoreFreshnessCard({
  chore,
  onRecord,
  onLongPress,
}: Props) {
  const stage = getPlantStage(chore.freshnessRatio);
  const isDark = useDarkMode();

  const handleRecord = useCallback(() => {
    onRecord(chore.id);
  }, [chore.id, onRecord]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(chore);
  }, [chore, onLongPress]);

  // Long press detection
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      handleLongPress();
    }, 500);
  }, [handleLongPress]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return (
    <div
      className="relative flex flex-col items-center gap-1.5 rounded-[14px] border shadow-sm px-2 pb-2.5 pt-3 transition-all duration-300"
      style={isDark ? cardBgStyleDark(chore.freshnessRatio) : cardBgStyle(chore.freshnessRatio)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Plant icon - lifecycle visual */}
      <PlantIcon stage={stage} size={28} />

      {/* Chore title */}
      <span
        className={`w-full truncate text-center font-semibold leading-tight text-[var(--foreground)] ${
          chore.title.length > 8 ? "text-[9px]" : chore.title.length > 5 ? "text-[10px]" : "text-[11px]"
        }`}
      >
        {chore.title}
      </span>

      {/* Check button — matches HomeTaskRow checkbox pattern */}
      <motion.button
        type="button"
        onClick={handleRecord}
        whileTap={{ scale: 0.9 }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all border-[var(--app-text-tertiary)] bg-[var(--card)] hover:border-[var(--primary)]"
        aria-label={`${chore.title}を記録`}
      >
        <span className="flex items-center justify-center opacity-100">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      </motion.button>
    </div>
  );
});
