"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import type { BootstrapResponse, ChoreWithComputed } from "@/lib/types";
import { iconByName, formatMonthDay } from "../helpers";

type SortKey = "name" | "interval" | "lastPerformed";

type Props = {
  boot: BootstrapResponse;
  onEditChore: (chore: ChoreWithComputed) => void;
  onAddChore: () => void;
};

const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "name", label: "名前順" },
  { key: "interval", label: "間隔順" },
  { key: "lastPerformed", label: "最終実行順" },
] as const;

function lastPerformedLabel(chore: ChoreWithComputed): string {
  if (!chore.lastPerformedAt || chore.lastRecordIsInitial) {
    return "未実施";
  }
  const dateStr = formatMonthDay(chore.lastPerformedAt);
  const name = chore.lastPerformerName ?? "";
  return `最終: ${dateStr} ${name}`;
}

function sortChores(
  chores: ReadonlyArray<ChoreWithComputed>,
  sortKey: SortKey,
  sortAsc: boolean,
): ReadonlyArray<ChoreWithComputed> {
  const dir = sortAsc ? 1 : -1;
  return [...chores].sort((a, b) => {
    switch (sortKey) {
      case "name":
        return a.title.localeCompare(b.title, "ja") * dir;
      case "interval":
        return (a.intervalDays - b.intervalDays) * dir;
      case "lastPerformed": {
        const aTime = a.lastPerformedAt
          ? new Date(a.lastPerformedAt).getTime()
          : 0;
        const bTime = b.lastPerformedAt
          ? new Date(b.lastPerformedAt).getTime()
          : 0;
        return (bTime - aTime) * dir;
      }
    }
  });
}

export function ManageScreen({ boot, onEditChore, onAddChore }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const activeChores = useMemo(
    () => boot.chores.filter((c) => !c.archived),
    [boot.chores],
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filteredChores = useMemo(() => {
    const filtered =
      trimmedQuery.length > 0
        ? activeChores.filter((c) =>
            c.title.toLowerCase().includes(trimmedQuery),
          )
        : activeChores;
    return sortChores(filtered, sortKey, sortAsc);
  }, [activeChores, trimmedQuery, sortKey, sortAsc]);

  const activeCount = activeChores.length;
  const isFiltering = trimmedQuery.length > 0;

  if (activeCount === 0) {
    return (
      <div className="space-y-5 pt-2">
        <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-10 text-center">
          <p className="text-[16px] font-bold text-[var(--foreground)]">
            家事がまだありません
          </p>
          <p className="mt-2 text-[13px] font-medium text-[var(--muted-foreground)]">
            ＋ボタンで追加しましょう
          </p>
        </div>
        <button
          type="button"
          onClick={onAddChore}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[15px] font-bold text-[var(--primary)]"
        >
          <Plus size={16} />
          家事を追加
        </button>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <div className="sticky top-0 z-10 space-y-2 bg-[var(--app-canvas)] pb-2 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-tertiary)]"
          />
          <input
            type="text"
            aria-label="家事を検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="家事を検索..."
            className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-[13px] text-[var(--foreground)] placeholder:text-[var(--app-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-[var(--app-text-tertiary)]">
            {isFiltering
              ? `${filteredChores.length}/${activeCount}件`
              : `${activeCount}件`}
          </span>
          <div className="flex gap-1">
            {SORT_OPTIONS.map((opt) => {
              const isActive = sortKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    if (isActive) {
                      setSortAsc((prev) => !prev);
                    } else {
                      setSortKey(opt.key);
                      setSortAsc(true);
                    }
                  }}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--app-text-tertiary)] hover:bg-[var(--muted)]"
                  }`}
                >
                  {opt.label}
                  {isActive && (
                    <span className="ml-0.5">{sortAsc ? "▲" : "▼"}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-1 pt-2">
        {filteredChores.map((chore) => {
          const ChoreIcon = iconByName(chore.icon);

          return (
            <button
              key={chore.id}
              type="button"
              onClick={() => onEditChore(chore)}
              className="flex w-full items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: chore.bgColor }}
                >
                  <ChoreIcon size={14} color={chore.iconColor} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-[var(--foreground)]">
                    {chore.title}
                  </p>
                  <p className="text-[11px] font-medium text-[var(--app-text-tertiary)]">
                    {chore.intervalDays}日ごと
                    <span className="mx-1">·</span>
                    {lastPerformedLabel(chore)}
                  </p>
                </div>
              </div>
              <ChevronRight
                size={14}
                color="var(--app-text-tertiary)"
                className="flex-shrink-0"
              />
            </button>
          );
        })}
      </div>

      {isFiltering && filteredChores.length === 0 && (
        <p className="py-4 text-center text-[13px] text-[var(--app-text-tertiary)]">
          該当する家事がありません
        </p>
      )}

      <button
        type="button"
        onClick={onAddChore}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] font-bold text-[var(--primary)]"
      >
        <Plus size={15} />
        家事を追加
      </button>
    </div>
  );
}
