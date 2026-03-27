"use client";

import { useState, useCallback } from "react";
import {
  type GridColumns,
  GRID_COLUMNS_STORAGE_KEY,
  normalizeGridColumns,
} from "@/lib/grid-columns";
import { SettingsPanel } from "./settings-shared";

const GRID_COLUMN_ITEMS: ReadonlyArray<{ key: GridColumns; label: string }> = [
  { key: 3, label: "3列" },
  { key: 4, label: "4列" },
  { key: 5, label: "5列" },
];

type Props = {
  onBack: () => void;
};

export function GridColumnsView({ onBack }: Props) {
  const [columns, setColumns] = useState<GridColumns>(() => {
    if (typeof window === "undefined") return 3;
    return normalizeGridColumns(
      localStorage.getItem(GRID_COLUMNS_STORAGE_KEY),
    );
  });

  const handleChange = useCallback((next: GridColumns) => {
    setColumns(next);
    localStorage.setItem(GRID_COLUMNS_STORAGE_KEY, String(next));
  }, []);

  return (
    <SettingsPanel title="カード表示" onBack={onBack}>
      <p className="text-[13px] font-medium leading-relaxed text-[var(--muted-foreground)]">
        ホーム画面のカード列数を選択
      </p>

      <div className="flex gap-2">
        {GRID_COLUMN_ITEMS.map((item) => {
          const selected = columns === item.key;
          return (
            <button
              key={`grid-col-${item.key}`}
              type="button"
              onClick={() => handleChange(item.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-[14px] font-bold transition-colors ${
                selected
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--secondary)] text-[var(--foreground)]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex justify-between px-1">
        <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
          コンパクト
        </span>
        <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
          ゆったり
        </span>
      </div>
    </SettingsPanel>
  );
}
