"use client";

import { memo, useCallback } from "react";
import type { BootstrapResponse, ChoreWithComputed } from "@/lib/types";
import type { GridColumns } from "@/lib/grid-columns";
import { GardenHeader } from "../home/garden-header";
import { ChoreGrid } from "../home/chore-grid";

type Props = {
  boot: BootstrapResponse;
  gridColumns?: GridColumns;
  onRecord: (choreId: string) => void;
  onOpenChoreEditor: (chore?: ChoreWithComputed) => void;
};

export const HomeScreen = memo(function HomeScreen({ boot, gridColumns, onRecord, onOpenChoreEditor }: Props) {
  const handleLongPress = useCallback(
    (chore: ChoreWithComputed) => {
      onOpenChoreEditor(chore);
    },
    [onOpenChoreEditor],
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 bg-[var(--app-canvas)]">
        <GardenHeader
          gardenScore={boot.gardenScore}
          streak={boot.householdStreak}
          welcome={boot.homeMessage.welcome}
          message={boot.homeMessage.message}
        />
      </div>
      <div className="mt-1">
        <ChoreGrid
          chores={boot.chores}
          columns={gridColumns}
          onRecord={onRecord}
          onLongPress={handleLongPress}
        />
      </div>
    </div>
  );
});
