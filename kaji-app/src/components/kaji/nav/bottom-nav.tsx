"use client";

import { memo } from "react";
import { Plus } from "lucide-react";
import { PRIMARY_COLOR } from "../constants";

export type TabKey = "home" | "activity" | "manage" | "stats";

type Props = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  dueCount?: number;
  onAddChore?: () => void;
};

export const BottomNav = memo(function BottomNav({
  activeTab,
  onTabChange,
  dueCount,
  onAddChore,
}: Props) {
  return (
    <>
      {/* Gradient fade above the nav — matches old UI */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-[74] mx-auto h-20 max-w-[430px] bg-gradient-to-t from-[var(--background)]/90 via-[var(--background)]/65 to-transparent"
      />

      {/* Floating pill nav — old design: 3 tabs + center add button */}
      <nav className="fixed bottom-4 left-0 right-0 z-[76] mx-auto max-w-[430px] px-4">
        <div className="flex w-full items-center justify-around rounded-full bg-[var(--card)] px-2 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          {/* Home */}
          <button
            type="button"
            onClick={() => onTabChange("home")}
            className="relative flex w-[62px] flex-col items-center gap-0.5 py-1"
            aria-label="ホーム"
            aria-current={activeTab === "home" ? "page" : undefined}
          >
            <span
              className="material-symbols-rounded text-[22px]"
              style={{
                color:
                  activeTab === "home"
                    ? PRIMARY_COLOR
                    : "var(--app-text-tertiary)",
              }}
            >
              home
            </span>
            <span
              className="text-[10px] font-bold"
              style={{
                color:
                  activeTab === "home"
                    ? PRIMARY_COLOR
                    : "var(--app-text-tertiary)",
              }}
            >
              ホーム
            </span>
            {dueCount !== undefined && dueCount > 0 ? (
              <span className="absolute -right-0.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[10px] font-bold text-white">
                {dueCount > 9 ? "9+" : dueCount}
              </span>
            ) : null}
          </button>

          {/* きろく */}
          <button
            type="button"
            onClick={() => onTabChange("activity")}
            className="flex w-[62px] flex-col items-center gap-0.5 py-1"
            aria-label="きろく"
            aria-current={activeTab === "activity" ? "page" : undefined}
          >
            <span
              className="material-symbols-rounded text-[22px]"
              style={{
                color:
                  activeTab === "activity"
                    ? PRIMARY_COLOR
                    : "var(--app-text-tertiary)",
              }}
            >
              menu_book
            </span>
            <span
              className="text-[10px] font-bold"
              style={{
                color:
                  activeTab === "activity"
                    ? PRIMARY_COLOR
                    : "var(--app-text-tertiary)",
              }}
            >
              きろく
            </span>
          </button>

          {/* Center Add button */}
          <button
            type="button"
            onClick={onAddChore}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-md"
            aria-label="家事を追加"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>

          {/* いえたすく */}
          <button
            type="button"
            onClick={() => onTabChange("manage")}
            className="flex w-[62px] flex-col items-center gap-0.5 py-1"
            aria-label="いえたすく"
            aria-current={activeTab === "manage" ? "page" : undefined}
          >
            <span
              className="material-symbols-rounded text-[22px]"
              style={{
                color:
                  activeTab === "manage"
                    ? PRIMARY_COLOR
                    : "var(--app-text-tertiary)",
              }}
            >
              checklist
            </span>
            <span
              className="text-[10px] font-bold"
              style={{
                color:
                  activeTab === "manage"
                    ? PRIMARY_COLOR
                    : "var(--app-text-tertiary)",
              }}
            >
              いえたすく
            </span>
          </button>

          {/* レポート */}
          <button
            type="button"
            onClick={() => onTabChange("stats")}
            className="flex w-[62px] flex-col items-center gap-0.5 py-1"
            aria-label="レポート"
            aria-current={activeTab === "stats" ? "page" : undefined}
          >
            <span
              className="material-symbols-rounded text-[22px]"
              style={{
                color:
                  activeTab === "stats"
                    ? PRIMARY_COLOR
                    : "var(--app-text-tertiary)",
              }}
            >
              bar_chart
            </span>
            <span
              className="text-[10px] font-bold"
              style={{
                color:
                  activeTab === "stats"
                    ? PRIMARY_COLOR
                    : "var(--app-text-tertiary)",
              }}
            >
              レポート
            </span>
          </button>
        </div>
      </nav>
    </>
  );
});
