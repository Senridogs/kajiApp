"use client";

import { useCallback, useRef } from "react";
import type { BootstrapResponse } from "@/lib/types";
import { apiFetch } from "@/components/kaji/helpers";

type SetBoot = (
  updater: (prev: BootstrapResponse | null) => BootstrapResponse | null,
) => void;

export function useChoreRecord(setBoot: SetBoot) {
  const rollbackRef = useRef<BootstrapResponse | null>(null);

  const recordChore = useCallback(
    async (
      choreId: string,
      options?: { memo?: string; skipped?: boolean },
    ) => {
      const now = new Date().toISOString();

      setBoot((prev) => {
        if (!prev) return prev;
        rollbackRef.current = prev;
        return {
          ...prev,
          chores: prev.chores.map((c) =>
            c.id === choreId
              ? {
                  ...c,
                  lastPerformedAt: now,
                  freshnessRatio: 0,
                  freshnessLevel: "fresh" as const,
                  freshnessLabel: "やったぜ",
                  plantStage: "sprout" as const,
                  lastRecordSkipped: options?.skipped ?? false,
                }
              : c,
          ),
        };
      });

      try {
        await apiFetch<{ id: string }>(`/api/chores/${choreId}/record`, {
          method: "POST",
          body: JSON.stringify({
            memo: options?.memo ?? null,
            skipped: options?.skipped ?? false,
          }),
        });
      } catch {
        if (rollbackRef.current) setBoot(() => rollbackRef.current);
        throw new Error("記録に失敗しました");
      }
    },
    [setBoot],
  );

  const undoRecord = useCallback(async (recordId: string) => {
    try {
      await apiFetch<void>(`/api/records/${recordId}`, { method: "DELETE" });
    } catch {
      throw new Error("取消に失敗しました");
    }
  }, []);

  return { recordChore, undoRecord };
}
