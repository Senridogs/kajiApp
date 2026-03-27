"use client";

import { memo } from "react";
import { motion } from "motion/react";
import { GardenScoreRing } from "./garden-score-ring";
import { StreakBadge } from "./streak-badge";

type Props = {
  gardenScore: number;
  streak: number;
  welcome: string | null;
  message: string;
};

export const GardenHeader = memo(function GardenHeader({
  gardenScore,
  streak,
  welcome,
  message,
}: Props) {
  return (
    <motion.div
      className="px-4 pb-3 pt-1"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center gap-3">
        <GardenScoreRing score={gardenScore} />
        <div className="flex-1 min-w-0">
          {welcome && (
            <p className="text-[13px] font-semibold text-[var(--foreground)]">{welcome}</p>
          )}
          <p className="text-[13px] font-medium text-[var(--muted-foreground)]">{message}</p>
        </div>
        <StreakBadge streak={streak} />
      </div>
    </motion.div>
  );
});
