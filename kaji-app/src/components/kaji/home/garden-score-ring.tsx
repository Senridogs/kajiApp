"use client";

import { memo } from "react";
import { motion } from "motion/react";
import { useDarkMode } from "../hooks/use-dark-mode";

type Props = {
  score: number;
};

const SIZE = 72;
const STROKE_WIDTH = 6;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// スコア 0 → hue=0（赤）、50 → hue=60（黄）、100 → hue=140（緑）
function scoreHue(score: number): number {
  return Math.round((score / 100) * 140);
}

export const GardenScoreRing = memo(function GardenScoreRing({
  score,
}: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  const center = SIZE / 2;
  const isDark = useDarkMode();

  const hue = scoreHue(clamped);
  const strokeColor = isDark
    ? `hsl(${hue}, 60%, 55%)`
    : `hsl(${hue}, 70%, 45%)`;
  const textColor = isDark
    ? `hsl(${hue}, 50%, 65%)`
    : `hsl(${hue}, 60%, 40%)`;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`庭の調子 ${clamped}点`}
      >
        {/* 背景弧 */}
        <circle
          cx={center}
          cy={center}
          r={RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth={STROKE_WIDTH}
        />
        {/* プログレス弧 */}
        <motion.circle
          cx={center}
          cy={center}
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          initial={{ strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      {/* 中央テキスト */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[18px] font-bold leading-none"
          style={{ color: textColor }}
        >
          {clamped}
        </span>
        <span className="mt-0.5 text-[9px] font-medium leading-none text-[var(--muted-foreground)]">
          庭の調子
        </span>
      </div>
    </div>
  );
});
