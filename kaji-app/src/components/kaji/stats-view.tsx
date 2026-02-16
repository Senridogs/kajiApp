"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { maxCount } from "@/components/kaji/helpers";
import { useSwipeTab } from "@/components/kaji/use-swipe-tab";
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
  { key: "normal", label: "通常のみ" },
  { key: "big", label: "大仕事のみ" },
] as const;

type BalanceTabKey = (typeof BALANCE_TABS)[number]["key"];
const BALANCE_SWIPE_TRANSITION_MS = 220;
const BALANCE_TAB_KEYS: readonly BalanceTabKey[] = BALANCE_TABS.map((tab) => tab.key);
const CHARTS_ZERO_HOLD_MS = 300;
const PIE_TOP_START = 75; // 0時位置
const BAR_BASE_ANIMATION_MS = 420;
const BAR_OVERLAY_START_OFFSET_MS = 280;

type CustomDateRange = {
  from: string;
  to: string;
};

type PieSlice = StatsUserCount & {
  ratio: number;
  start: number;
  color: string;
};

type PieAnimationState = {
  dasharray: string;
  dashoffset: string;
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

function buildPieAnimationState(
  slice: PieSlice,
  sliceIdx: number,
  sliceCount: number,
  animated: boolean,
): PieAnimationState {
  const fullLength = slice.ratio * 100;
  const currentLength = animated ? fullLength : 0;

  if (sliceCount === 2) {
    if (sliceIdx === 0) {
      return {
        dasharray: `${currentLength} ${100 - currentLength}`,
        dashoffset: `${-PIE_TOP_START}`,
      };
    }
    const counterStart = PIE_TOP_START - currentLength;
    return {
      dasharray: `${currentLength} ${100 - currentLength}`,
      dashoffset: `${-counterStart}`,
    };
  }

  const clockwiseStart = PIE_TOP_START + (animated ? slice.start * 100 : 0);
  return {
    dasharray: `${currentLength} ${100 - currentLength}`,
    dashoffset: `${-clockwiseStart}`,
  };
}

export function StatsView({
  stats,
  activePeriod,
  isLoading = false,
  customDateRange,
  animationSeed = 0,
  userColors,
  onChangePeriod,
  onChangeCustomDateRange,
  onApplyCustomDateRange,
  onBalanceSwipeActiveChange,
}: {
  stats: StatsResponse | null;
  activePeriod: StatsPeriodKey;
  isLoading?: boolean;
  customDateRange: CustomDateRange;
  animationSeed?: number;
  userColors?: Map<string, string>;
  onChangePeriod: (period: StatsPeriodKey) => void;
  onChangeCustomDateRange: (range: CustomDateRange) => void;
  onApplyCustomDateRange: (range: CustomDateRange) => void | Promise<void>;
  onBalanceSwipeActiveChange?: (active: boolean) => void;
}) {
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [balanceTab, setBalanceTab] = useState<BalanceTabKey>("all");
  const [chartsAnimationReady, setChartsAnimationReady] = useState(false);
  const [chartsAnimationTrigger, setChartsAnimationTrigger] = useState(0);

  const triggerChartsAnimation = useCallback(() => {
    setChartsAnimationReady(false);
    setChartsAnimationTrigger((prev) => prev + 1);
  }, []);

  const users = stats?.userCounts ?? [];
  const bigTaskUsers = stats?.bigTaskUserCounts ?? [];
  const bigTaskCountMap = new Map(bigTaskUsers.map((user) => [user.userId, user.count]));
  const normalTaskUsers = users.map((user) => ({
    ...user,
    count: Math.max(0, user.count - (bigTaskCountMap.get(user.userId) ?? 0)),
  }));
  const choreCounts = [...(stats?.choreCounts ?? [])].sort((a, b) =>
    JA_COLLATOR.compare(a.title, b.title),
  );

  const userColorMap = new Map<string, string>();
  users.forEach((user, idx) => {
    userColorMap.set(
      user.userId,
      userColors?.get(user.userId) ?? USER_COLORS[idx % USER_COLORS.length],
    );
  });
  const userOrderMap = new Map(users.map((user, idx) => [user.userId, idx]));

  const choreMax = maxCount(choreCounts);
  const balanceSwipe = useSwipeTab<BalanceTabKey>({
    tabs: BALANCE_TAB_KEYS,
    activeTab: balanceTab,
    onChangeTab: (tab) => {
      triggerChartsAnimation();
      setBalanceTab(tab);
    },
    threshold: 56,
    dominanceRatio: 1.15,
    lockDistance: 12,
    transitionDurationMs: BALANCE_SWIPE_TRANSITION_MS,
  });
  const balanceDragging = balanceSwipe.visual.isDragging;
  useEffect(() => {
    onBalanceSwipeActiveChange?.(balanceDragging);
  }, [balanceDragging, onBalanceSwipeActiveChange]);
  useLayoutEffect(() => {
    setChartsAnimationReady(false);
    let frame2: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        timer = setTimeout(() => {
          setChartsAnimationReady(true);
        }, CHARTS_ZERO_HOLD_MS);
      });
    });
    return () => {
      cancelAnimationFrame(frame1);
      if (frame2 !== null) {
        cancelAnimationFrame(frame2);
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [stats, activePeriod, balanceTab, animationSeed, chartsAnimationTrigger]);

  const balanceByTab: Record<BalanceTabKey, { total: number; pie: PieSlice[] }> = {
    all: {
      total: users.reduce((sum, user) => sum + user.count, 0),
      pie: buildPieData(users, userColorMap),
    },
    normal: {
      total: normalTaskUsers.reduce((sum, user) => sum + user.count, 0),
      pie: buildPieData(normalTaskUsers, userColorMap),
    },
    big: {
      total: bigTaskUsers.reduce((sum, user) => sum + user.count, 0),
      pie: buildPieData(bigTaskUsers, userColorMap),
    },
  };
  const balanceSwipeProgress = balanceSwipe.visual.progress;
  const balanceSwipeFromTabIndex = Math.max(0, BALANCE_TAB_KEYS.indexOf(balanceSwipe.visual.fromTab));
  const balanceSwipeTrackTranslatePercent = (-balanceSwipeFromTabIndex + balanceSwipeProgress) * 100;
  const isBalanceSwipeMoving =
    balanceSwipe.visual.isDragging ||
    balanceSwipe.visual.isAnimating ||
    Math.abs(balanceSwipeProgress) > 0.0001;
  const balanceSwipeTrackTransitionStyle = balanceSwipe.visual.isDragging
    ? "none"
    : balanceSwipe.visual.isAnimating
      ? `transform ${BALANCE_SWIPE_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : "none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {PERIOD_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              triggerChartsAnimation();
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

      <div
        className="rounded-2xl bg-white p-4"
        onTouchStart={(e) => {
          e.stopPropagation();
          balanceSwipe.onTouchStart(e);
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          balanceSwipe.onTouchMove(e);
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          balanceSwipe.onTouchEnd(e);
        }}
        onTouchCancel={(e) => {
          e.stopPropagation();
          balanceSwipe.onTouchCancel();
        }}
      >
        <h3 className="text-[19px] font-bold text-[#202124]">分担バランス</h3>
        <div className="mt-2 flex gap-1">
          {BALANCE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                triggerChartsAnimation();
                setBalanceTab(tab.key);
              }}
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
        <div className="relative mt-3 overflow-hidden">
          <div
            className={`flex ${isBalanceSwipeMoving ? "will-change-transform" : ""}`}
            style={{
              transform: `translate3d(${balanceSwipeTrackTranslatePercent}%, 0, 0)`,
              transition: balanceSwipeTrackTransitionStyle,
            }}
          >
            {BALANCE_TAB_KEYS.map((tabKey) => {
              const tabData = balanceByTab[tabKey];
              return (
                <div key={tabKey} className="w-full shrink-0">
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 42 42" className="h-[120px] w-[120px]">
                      <circle cx="21" cy="21" r="15.915" fill="none" stroke="#F1F3F4" strokeWidth="10" />
                      {tabData.pie.map((slice, sliceIdx) => {
                        const pieAnimated = tabKey === balanceTab ? chartsAnimationReady : true;
                        const pieAnim = buildPieAnimationState(
                          slice,
                          sliceIdx,
                          tabData.pie.length,
                          pieAnimated,
                        );
                        return (
                          <circle
                            key={`${tabKey}-${slice.userId}`}
                            cx="21"
                            cy="21"
                            r="15.915"
                            fill="none"
                            stroke={slice.color}
                            strokeWidth="10"
                            strokeLinecap="round"
                            style={{
                              strokeDasharray: pieAnim.dasharray,
                              strokeDashoffset: pieAnim.dashoffset,
                              transition: pieAnimated
                                ? "stroke-dasharray 560ms cubic-bezier(0.22, 1, 0.36, 1), stroke-dashoffset 560ms cubic-bezier(0.22, 1, 0.36, 1)"
                                : "none",
                              transitionDelay: pieAnimated ? `${sliceIdx * 72}ms` : "0ms",
                            }}
                          />
                        );
                      })}
                    </svg>
                    <div className="w-full space-y-2">
                      {tabData.pie.map((slice) => {
                        const percent = tabData.total > 0 ? Math.round((slice.count / tabData.total) * 100) : 0;
                        return (
                          <div key={`${tabKey}-row-${slice.userId}`} className="flex items-center justify-between">
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
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl bg-white p-4">
        <h3 className="text-[19px] font-bold text-[#202124]">各タスクごと詳細</h3>
        <p className="text-[12px] font-semibold text-[#EA4335]">※ 赤い※マークは大仕事です</p>
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
          {choreCounts.map((item, itemIdx) => {
            const barWidth = item.count > 0 ? Math.max((item.count / choreMax) * 100, 8) : 0;
            const sortedUserCounts = [...item.userCounts].sort(
              (a, b) =>
                (userOrderMap.get(a.userId) ?? Number.MAX_SAFE_INTEGER) -
                (userOrderMap.get(b.userId) ?? Number.MAX_SAFE_INTEGER),
            );
            const leftUserCount = sortedUserCounts[0] ?? null;
            const rightUserCount = sortedUserCounts[1] ?? null;
            const leftRatio = item.count > 0 && leftUserCount ? leftUserCount.count / item.count : 0;
            const rightRatio = item.count > 0 && rightUserCount ? rightUserCount.count / item.count : 0;
            const leftWidth = barWidth * leftRatio;
            const rightWidth = barWidth * rightRatio;
            const leftColor = leftUserCount
              ? userColorMap.get(leftUserCount.userId) ?? USER_COLORS[0]
              : USER_COLORS[0];
            const rightColor = rightUserCount
              ? userColorMap.get(rightUserCount.userId) ?? USER_COLORS[1]
              : USER_COLORS[1];
            return (
              <div key={item.choreId} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-24">
                    <div className="flex items-center gap-1">
                      {item.isBigTask ? (
                        <span className="text-[14px] font-bold leading-none text-[#EA4335]" aria-label="大仕事">
                          ※
                        </span>
                      ) : null}
                      <p className="truncate text-[15px] font-semibold text-[#5F6368]">{item.title}</p>
                    </div>
                  </div>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-md bg-[#F1F3F4]">
                    {barWidth > 0 ? (
                      <>
                        <div
                          className="absolute left-0 top-0 h-full rounded-md bg-[#80868B]"
                          style={{
                            width: `${chartsAnimationReady ? barWidth : 0}%`,
                            transition: chartsAnimationReady
                              ? `width ${BAR_BASE_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                              : "none",
                            transitionDelay: chartsAnimationReady ? `${itemIdx * 64}ms` : "0ms",
                          }}
                        />
                        {leftUserCount && leftWidth > 0 ? (
                          <div
                            className="absolute left-0 top-0 h-full rounded-l-md"
                            style={{
                              width: `${leftWidth}%`,
                              backgroundColor: leftColor,
                              transform: `scaleX(${chartsAnimationReady ? 1 : 0})`,
                              transformOrigin: "left center",
                              transition: chartsAnimationReady
                                ? "transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                                : "none",
                              transitionDelay: chartsAnimationReady
                                ? `${itemIdx * 64 + BAR_OVERLAY_START_OFFSET_MS}ms`
                                : "0ms",
                            }}
                          />
                        ) : null}
                        {rightUserCount && rightWidth > 0 ? (
                          <div
                            className="absolute right-0 top-0 h-full rounded-r-md"
                            style={{
                              width: `${rightWidth}%`,
                              backgroundColor: rightColor,
                              transform: `scaleX(${chartsAnimationReady ? 1 : 0})`,
                              transformOrigin: "right center",
                              transition: chartsAnimationReady
                                ? "transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                                : "none",
                              transitionDelay: chartsAnimationReady
                                ? `${itemIdx * 64 + BAR_OVERLAY_START_OFFSET_MS + 54}ms`
                                : "0ms",
                            }}
                          />
                        ) : null}
                      </>
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
