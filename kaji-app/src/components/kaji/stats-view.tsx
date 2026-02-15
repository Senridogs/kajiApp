"use client";

import { maxCount } from "@/components/kaji/helpers";
import { StatsPeriodKey, StatsResponse } from "@/lib/types";

const PERIOD_ITEMS: Array<{ key: StatsPeriodKey; label: string; accent?: boolean }> = [
  { key: "week", label: "1週間" },
  { key: "month", label: "1か月" },
  { key: "half", label: "半年" },
  { key: "year", label: "1年" },
  { key: "all", label: "全期間" },
  { key: "custom", label: "カスタム", accent: true },
];

const CHORE_COLORS = ["#EA4335", "#4285F4", "#33C28A", "#FBBC05"];

export function StatsView({
  stats,
  activePeriod,
  onChangePeriod,
}: {
  stats: StatsResponse | null;
  activePeriod: StatsPeriodKey;
  onChangePeriod: (period: StatsPeriodKey) => void;
}) {
  const pie = (() => {
    if (!stats?.userCounts?.length) return [];
    const total = stats.userCounts.reduce((sum, x) => sum + x.count, 0) || 1;
    let acc = 0;
    return stats.userCounts.map((u, idx) => {
      const ratio = u.count / total;
      const item = {
        ...u,
        ratio,
        start: acc,
        color: idx === 0 ? "#4285F4" : "#EA4335",
      };
      acc += ratio;
      return item;
    });
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {PERIOD_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChangePeriod(item.key)}
            className={`rounded-[11px] px-2 py-1.5 text-[13.2px] font-bold ${
              activePeriod === item.key
                ? "bg-[#1A9BE8] text-white"
                : item.accent
                  ? "bg-[#EEF3FF] text-[#4D8BFF]"
                  : "bg-[#F1F3F4] text-[#5F6368]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl bg-white p-4">
        {(stats?.choreCounts ?? []).slice(0, 4).map((item, idx) => {
          const max = maxCount(stats?.choreCounts ?? []);
          const width = Math.max((item.count / max) * 100, 4);
          const color = CHORE_COLORS[idx % CHORE_COLORS.length];
          return (
            <div key={item.choreId} className="flex items-center gap-2">
              <div className="w-24">
                <p className="truncate text-[15px] font-semibold text-[#5F6368]">{item.title}</p>
              </div>
              <div className="relative h-3 flex-1 rounded-md bg-[#F1F3F4]">
                <div className="h-3 rounded-md" style={{ width: `${width}%`, backgroundColor: color }} />
              </div>
              <p className="w-6 text-right text-[15px] font-bold text-[#202124]">{item.count}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-2.5 rounded-2xl bg-white p-4">
        {(stats?.userCounts ?? []).map((item, idx) => {
          const max = maxCount(stats?.userCounts ?? []);
          const width = Math.max((item.count / max) * 100, 4);
          const color = idx === 0 ? "#EA4335" : "#4285F4";
          return (
            <div key={item.userId} className="flex items-center gap-2">
              <div className="w-24">
                <p className="truncate text-[15px] font-bold text-[#5F6368]">{item.name}</p>
              </div>
              <div className="relative h-3 flex-1 rounded-md bg-[#F1F3F4]">
                <div className="h-3 rounded-md" style={{ width: `${width}%`, backgroundColor: color }} />
              </div>
              <p className="w-6 text-right text-[15px] font-bold text-[#202124]">{item.count}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-white p-4">
        <h3 className="text-[19px] font-bold text-[#202124]">分担バランス</h3>
        <div className="mt-3 flex items-center gap-3">
          <svg viewBox="0 0 42 42" className="h-[120px] w-[120px] -rotate-90">
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="#E8EAED" strokeWidth="10" />
            {pie.map((d) => (
              <circle
                key={d.userId}
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke={d.color}
                strokeWidth="10"
                strokeDasharray={`${d.ratio * 100} ${100 - d.ratio * 100}`}
                strokeDashoffset={`${-d.start * 100}`}
              />
            ))}
          </svg>
          <div className="w-full space-y-2">
            {pie.map((d) => (
              <div key={d.userId} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <p className="text-base font-bold text-[#202124]">{d.name}</p>
                </div>
                <p className="text-[20px] font-bold text-[#202124]">{Math.round(d.ratio * 100)}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
