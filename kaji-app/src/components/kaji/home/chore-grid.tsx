"use client";

import { memo, useEffect, useRef, useMemo } from "react";
import { motion } from "motion/react";
import type { ChoreWithComputed } from "@/lib/types";
import { ChoreFreshnessCard } from "./chore-freshness-card";
import { PlantIcon } from "./plant-icon";

type Props = {
  chores: ChoreWithComputed[];
  columns?: 3 | 4 | 5;
  onRecord: (choreId: string) => void;
  onLongPress?: (chore: ChoreWithComputed) => void;
};

export const ChoreGrid = memo(function ChoreGrid({ chores, columns = 3, onRecord, onLongPress }: Props) {
  const hasMountedRef = useRef(false);

  useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  // freshnessRatio降順（オレンジが先、緑が後）
  const sorted = useMemo(() => {
    return [...chores]
      .filter((c) => !c.archived)
      .sort((a, b) => b.freshnessRatio - a.freshnessRatio);
  }, [chores]);

  if (sorted.length === 0) {
    return (
      <motion.div
        initial={hasMountedRef.current ? false : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: hasMountedRef.current ? 0 : 0.4 }}
        className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-8 text-center"
      >
        <PlantIcon stage="sprout" size={36} />
        <p className="mt-3 text-[16px] font-bold text-[var(--foreground)]">家事を追加して庭を育てよう</p>
        <p className="mt-2 text-[13px] font-medium text-[var(--muted-foreground)]">
          家事を登録すると、ここにフレッシュネスカードが並びます。
        </p>
      </motion.div>
    );
  }

  const gridClass =
    columns === 5
      ? "grid-cols-5 gap-1"
      : columns === 4
        ? "grid-cols-4 gap-1.5"
        : "grid-cols-3 gap-2";

  return (
    <motion.div className={`grid ${gridClass} px-4 pb-24`}>
      {sorted.map((chore, index) => (
        <motion.div
          key={chore.id}
          initial={hasMountedRef.current ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: hasMountedRef.current ? 0 : index * 0.03, duration: 0.3 }}
        >
          <ChoreFreshnessCard
            chore={chore}
            onRecord={onRecord}
            onLongPress={onLongPress}
          />
        </motion.div>
      ))}
    </motion.div>
  );
});
