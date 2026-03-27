"use client";

import { memo } from "react";
import { Flame } from "lucide-react";
import { motion } from "motion/react";

type Props = {
  streak: number;
};

export const StreakBadge = memo(function StreakBadge({ streak }: Props) {
  if (streak === 0) return null;

  const isHighStreak = streak >= 7;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", duration: 0.4 }}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
        isHighStreak
          ? "bg-[var(--destructive)]/15 ring-1 ring-[var(--destructive)]/30"
          : "bg-[var(--accent)]",
      ].join(" ")}
    >
      <Flame
        size={16}
        className={
          isHighStreak
            ? "fill-[var(--destructive)] text-[var(--destructive)]"
            : "fill-[var(--accent-foreground)] text-[var(--accent-foreground)]"
        }
      />
      <span
        className={[
          "text-[13px] font-semibold leading-none",
          isHighStreak
            ? "text-[var(--destructive)]"
            : "text-[var(--accent-foreground)]",
        ].join(" ")}
      >
        {streak}日連続達成中！
      </span>
    </motion.div>
  );
});
