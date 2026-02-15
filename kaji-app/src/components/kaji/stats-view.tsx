"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { maxCount } from "@/components/kaji/helpers";
import { StatsPeriodKey, StatsResponse, StatsUserCount } from "@/lib/types";

const JA_COLLATOR = new Intl.Collator("ja");

const PERIOD_ITEMS: Array<{ key: StatsPeriodKey; label: string; accent?: boolean }> = [
  { key: "week", label: "1週間" },
  { key: "month", label: "1か月" },
  { key: "half", label: "半年" },
  { key: "year", label: "1年" },
  { key: "all", label: "全期間" },
  { key: "custom", label: "カスタム", accent: true },
];

const USER_COLORS = ["#4285F4", "#EA4335", "#33C28A", "#FBBC05", "#A142F4", "#00ACC1"];

const BALANCE_TABS = [
  { key: "all", label: "全タスク" },
  { key: "big", label: "大仕事のみ" },
] as const;

type BalanceTabKey = (typeof BALANCE_TABS)[number]["key"];

type CustomDateRange = {
  from: string;
  to: string;
};

type PieSlice = StatsUserCount & {
  ratio: number;
  start: number;
  color: string;
};

function buildPieData(users: StatsUserCount[], userColorMap: Map<string, string>): PieSlice[] {
  const total = users.reduce((sum, user) => sum + user.count, 0);
  let acc = 0;

  return users.map((user, idx) => {
    const ratio = total > 0 ? user.count / total : 0;
    const item = {
      ...user,
      ratio,
      start: acc,
      color: userColorMap.get(user.userId) ?? USER_COLORS[idx % USER_COLORS.length],
    };
    acc += ratio;
    return item;
  });
}

export function StatsView({
  stats,
  activePeriod,
  isLoading = false,
  customDateRange,
  onChangePeriod,
  onChangeCustomDateRange,
  onApplyCustomDateRange,
}: {
  stats: StatsResponse | null;
  activePeriod: StatsPeriodKey;
  isLoading?: boolean;
  customDateRange: CustomDateRange;
  onChangePeriod: (period: StatsPeriodKey) => void;
  onChangeCustomDateRange: (range: CustomDateRange) => void;
  onApplyCustomDateRange: (range: CustomDateRange) => void | Promise<void>;
}) {
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [balanceTab, setBalanceTab] = useState<BalanceTabKey>("all");

  const users = stats?.userCounts ?? [];
  const bigTaskUsers = stats?.bigTaskUserCounts ?? [];
  const choreCounts = [...(stats?.choreCounts ?? [])].sort((a, b) =>
    JA_COLLATOR.compare(a.title, b.title),
  );

  const userColorMap = new Map<string, string>();
  users.forEach((user, idx) => {
    userColorMap.set(user.userId, USER_COLORS[idx % USER_COLORS.length]);
  });

  const balanceUsers = balanceTab === "big" ? bigTaskUsers : users;
  const balanceTotal = balanceUsers.reduce((sum, user) => sum + user.count, 0);
  const balancePie = buildPieData(balanceUsers, userColorMap);
  const choreMax = maxCount(choreCounts);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {PERIOD_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              onChangePeriod(item.key);
              setCustomEditorOpen(item.key === "custom");
            }}
            className={`inline-flex items-center gap-1 rounded-[11px] px-2 py-1.5 text-[13.2px] font-bold ${
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

      {activePeriod === "custom" && customEditorOpen ? (
        <div className="space-y-2 rounded-2xl border border-[#DADCE0] bg-white p-4">
          <p className="text-[14px] font-bold text-[#202124]">カスタム期間</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center">
            <input
              type="date"
              value={customDateRange.from}
              max={customDateRange.to}
              onChange={(e) =>
                onChangeCustomDateRange({
                  ...customDateRange,
                  from: e.target.value,
                })
              }
              className="rounded-[12px] border border-[#DADCE0] bg-white px-3 py-2 text-[14px] font-semibold text-[#202124]"
            />
            <p className="text-center text-[14px] font-bold text-[#5F6368]">〜</p>
            <input
              type="date"
              value={customDateRange.to}
              min={customDateRange.from}
              onChange={(e) =>
                onChangeCustomDateRange({
                  ...customDateRange,
                  to: e.target.value,
                })
              }
              className="rounded-[12px] border border-[#DADCE0] bg-white px-3 py-2 text-[14px] font-semibold text-[#202124]"
            />
            <button
              type="button"
              onClick={async () => {
                await onApplyCustomDateRange(customDateRange);
                setCustomEditorOpen(false);
              }}
              className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[10px] bg-[#1A9BE8] px-2.5 text-[13px] font-bold leading-none text-white [writing-mode:horizontal-tb]"
            >
              適用
            </button>
          </div>
        </div>
      ) : null}

      {stats?.rangeLabel ? (
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#5F6368]">
          {isLoading ? <Loader2 size={13} className="animate-spin text-[#9AA0A6]" /> : null}
          集計範囲: {stats.rangeLabel}
        </p>
      ) : null}

      <div className="rounded-2xl bg-white p-4">
        <h3 className="text-[19px] font-bold text-[#202124]">分担バランス</h3>
        <div className="mt-2 flex gap-1">
          {BALANCE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setBalanceTab(tab.key)}
              className={`rounded-[10px] px-3 py-1.5 text-[12px] font-bold ${
                balanceTab === tab.key
                  ? "bg-[#1A9BE8] text-white"
                  : "bg-[#F1F3F4] text-[#5F6368]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <svg viewBox="0 0 42 42" className="h-[120px] w-[120px] -rotate-90">
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="#E8EAED" strokeWidth="10" />
            {balancePie.map((slice) => (
              <circle
                key={`${balanceTab}-${slice.userId}`}
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke={slice.color}
                strokeWidth="10"
                strokeDasharray={`${slice.ratio * 100} ${100 - slice.ratio * 100}`}
                strokeDashoffset={`${-slice.start * 100}`}
              />
            ))}
          </svg>
          <div className="w-full space-y-2">
            {balancePie.map((slice) => {
              const percent = balanceTotal > 0 ? Math.round((slice.count / balanceTotal) * 100) : 0;
              return (
                <div key={`${balanceTab}-row-${slice.userId}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                    <p className="text-base font-bold text-[#202124]">{slice.name}</p>
                  </div>
                  <p className="text-[16px] font-bold text-[#202124]">
                    {percent}% ({slice.count}回)
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl bg-white p-4">
        <h3 className="text-[19px] font-bold text-[#202124]">各タスクごと詳細</h3>
        <div className="flex flex-wrap gap-3">
          {users.map((user, idx) => {
            const color = userColorMap.get(user.userId) ?? USER_COLORS[idx % USER_COLORS.length];
            return (
              <div key={user.userId} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <p className="text-[13px] font-semibold text-[#5F6368]">{user.name}</p>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          {choreCounts.map((item) => {
            const barWidth = item.count > 0 ? Math.max((item.count / choreMax) * 100, 8) : 0;
            return (
              <div key={item.choreId} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-24">
                    <p className="truncate text-[15px] font-semibold text-[#5F6368]">{item.title}</p>
                  </div>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-md bg-[#F1F3F4]">
                    {barWidth > 0 ? (
                      <div className="flex h-3 overflow-hidden rounded-md" style={{ width: `${barWidth}%` }}>
                        {item.userCounts.map((userCount, idx) => {
                          if (userCount.count === 0) return null;
                          const color =
                            userColorMap.get(userCount.userId) ?? USER_COLORS[idx % USER_COLORS.length];
                          return (
                            <div
                              key={`${item.choreId}-${userCount.userId}`}
                              className="h-full"
                              style={{
                                flexGrow: userCount.count,
                                backgroundColor: color,
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <p className="w-8 text-right text-[15px] font-bold text-[#202124]">{item.count}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
