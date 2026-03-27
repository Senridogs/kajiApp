"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, ChevronDown } from "lucide-react";
import type {
  AwardItem,
  BootstrapResponse,
  HouseholdReportResponse,
  MyStatsResponse,
} from "@/lib/types";
import { apiFetch, iconByName } from "../helpers";
import { GardenScoreRing } from "@/components/kaji/home/garden-score-ring";
import { StreakBadge } from "@/components/kaji/home/streak-badge";

type Props = {
  boot: BootstrapResponse;
};

const REPORT_MONTH_OFFSETS = [2, 1, 0] as const;
const REPORT_MONTH_LABELS: Record<(typeof REPORT_MONTH_OFFSETS)[number], string> = {
  0: "今月",
  1: "先月",
  2: "2ヶ月前",
};

function toMonthKey(date: Date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKeyWithOffset(base: string, offset: number) {
  const [year, month] = base.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - offset, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function StatsScreen({ boot }: Props) {
  const [householdReport, setHouseholdReport] = useState<HouseholdReportResponse | null>(null);
  const [myReport, setMyReport] = useState<MyStatsResponse | null>(null);
  const [myReportPreviousTotal, setMyReportPreviousTotal] = useState<number | null>(null);
  const [reportMonthOffset, setReportMonthOffset] = useState<(typeof REPORT_MONTH_OFFSETS)[number]>(0);
  const [reportLoading, setReportLoading] = useState(false);
  const [myReportLoading, setMyReportLoading] = useState(false);
  const [awardsExplanationOpen, setAwardsExplanationOpen] = useState(false);

  const loadHouseholdReport = useCallback(async (offset: (typeof REPORT_MONTH_OFFSETS)[number]) => {
    const currentMonth = toMonthKey(new Date());
    const month = monthKeyWithOffset(currentMonth, offset);
    setReportLoading(true);
    try {
      const data = await apiFetch<HouseholdReportResponse>(
        `/api/household-report?month=${encodeURIComponent(month)}`,
      );
      setHouseholdReport(data);
    } finally {
      setReportLoading(false);
    }
  }, []);

  const loadMyReport = useCallback(async (offset: (typeof REPORT_MONTH_OFFSETS)[number]) => {
    const currentMonth = toMonthKey(new Date());
    const month = monthKeyWithOffset(currentMonth, offset);
    setMyReportLoading(true);
    try {
      const [data, previous] = await Promise.all([
        apiFetch<MyStatsResponse>(`/api/my-stats?month=${encodeURIComponent(month)}`, { cache: "no-store" }),
        offset < 2
          ? apiFetch<MyStatsResponse>(
            `/api/my-stats?month=${encodeURIComponent(monthKeyWithOffset(currentMonth, (offset + 1) as (typeof REPORT_MONTH_OFFSETS)[number]))}`,
            { cache: "no-store" },
          )
          : Promise.resolve<MyStatsResponse | null>(null),
      ]);
      setMyReport(data);
      setMyReportPreviousTotal(previous?.currentMonthTotal ?? null);
    } finally {
      setMyReportLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHouseholdReport(reportMonthOffset);
    void loadMyReport(reportMonthOffset);
  }, [reportMonthOffset, loadHouseholdReport, loadMyReport]);

  const householdReportDiff = useMemo(() => {
    if (!householdReport) return 0;
    return householdReport.currentMonthTotal - householdReport.previousMonthTotal;
  }, [householdReport]);

  const topChores = householdReport?.choreCounts.slice(0, 3) ?? [];
  const staleTasks = householdReport?.staleTasks.slice(0, 3) ?? [];
  const monthDiffLabel =
    householdReportDiff > 0 ? `+${householdReportDiff}` : `${householdReportDiff}`;

  // Awards filtered by selected month
  const userMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const u of boot.users) {
      map.set(u.id, { name: u.name, color: u.color });
    }
    return map;
  }, [boot.users]);

  const filteredAwards = useMemo((): AwardItem[] => {
    const currentMonth = toMonthKey(new Date());
    const selectedKey = monthKeyWithOffset(currentMonth, reportMonthOffset);
    const [selYear, selMonth] = selectedKey.split("-").map(Number);
    return boot.recentAwards.filter((award) => {
      if (award.month != null) {
        return award.year === selYear && award.month === selMonth;
      }
      return award.year === selYear;
    });
  }, [boot.recentAwards, reportMonthOffset]);

  // Garden score
  const gardenScore = boot.gardenScore;
  const gardenMessage =
    gardenScore === 100
      ? "全部の家事が周期内！最高の状態"
      : gardenScore >= 80
        ? "いい感じ！この調子"
        : gardenScore >= 50
          ? "まあまあ。少し手を入れよう"
          : "ちょっと荒れ気味。みんなで頑張ろう";

  return (
    <div className="space-y-5 px-5 pb-24 pt-5">
      {/* Garden score */}
      <div className="rounded-[16px] bg-[var(--card)] px-5 py-4">
        <div className="flex items-center gap-4">
          <GardenScoreRing score={gardenScore} />
          <p className="flex-1 text-[13px] font-medium leading-snug text-[var(--app-text-tertiary)]">
            {gardenMessage}
          </p>
        </div>
      </div>

      {/* Household streak */}
      {boot.householdStreak > 0 ? (
        <div className="flex">
          <StreakBadge streak={boot.householdStreak} />
        </div>
      ) : null}

      {/* Month period selector */}
      <div className="flex gap-1 rounded-[12px] bg-[var(--secondary)] p-1">
        {REPORT_MONTH_OFFSETS.map((offset) => (
          <button
            key={offset}
            type="button"
            onClick={() => setReportMonthOffset(offset)}
            className={`flex-1 rounded-[10px] px-2 py-1.5 text-[12.5px] font-bold ${reportMonthOffset === offset ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]"}`}
          >
            {REPORT_MONTH_LABELS[offset]}
          </button>
        ))}
      </div>

      {/* Awards */}
      <div className="rounded-[16px] bg-[var(--card)] px-5 py-5">
        <p className="text-[18px] font-bold text-[var(--foreground)]">
          {"アワード"}
        </p>
        <div className="mt-3 space-y-2">
          {filteredAwards.length === 0 ? (
            <p className="text-[13px] font-medium text-[var(--app-text-tertiary)]">
              {"まだアワードはありません"}
            </p>
          ) : (
            filteredAwards.map((award) => {
              const recipient = userMap.get(award.userId);
              return (
                <div
                  key={award.id}
                  className="flex items-center gap-3 rounded-[10px] bg-[var(--app-canvas)] px-3 py-2.5"
                >
                  <span className="text-[28px] leading-none">{award.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-[var(--foreground)]">
                      {award.title}
                    </p>
                    {award.description ? (
                      <p className="mt-0.5 truncate text-[12px] text-[var(--muted-foreground)]">
                        {award.description}
                      </p>
                    ) : null}
                  </div>
                  {recipient ? (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold text-white"
                      style={{ backgroundColor: recipient.color ?? "var(--primary)" }}
                    >
                      {recipient.name}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* Award explanation toggle */}
        <button
          type="button"
          onClick={() => setAwardsExplanationOpen((prev) => !prev)}
          className="mt-3 flex w-full items-center gap-1 text-[12px] font-medium text-[var(--muted-foreground)]"
        >
          <span>{"アワードとは？"}</span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${awardsExplanationOpen ? "rotate-180" : ""}`}
          />
        </button>
        {awardsExplanationOpen ? (
          <div className="mt-2 space-y-3 rounded-[10px] bg-[var(--app-canvas)] px-3 py-3">
            <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
              {"毎月1日に先月の活動を集計して、自動で表彰されます。年間アワードは1月1日に発表されます。"}
            </p>
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-[var(--app-text-tertiary)]">
                {"月間アワード（毎月）"}
              </p>
              <div className="space-y-0.5 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                <p>{"⚡ スピードスター — 最も多く家事をこなした人"}</p>
                <p>{"🌅 早起きマスター — 朝（5〜9時）に最も活動した人"}</p>
                <p>{"🦉 夜ふかしマスター — 夜（21〜2時）に最も活動した人"}</p>
                <p>{"🎨 バラエティキング — 最も多くの種類の家事をした人"}</p>
                <p>{"🔥 ストリークマスター — 最長連続記録の人"}</p>
                <p>{"💪 ウィークエンドウォリアー — 週末に最も活動した人"}</p>
                <p>{"⭐ コツコツマスター — 最も均等に家事をした人"}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-[var(--app-text-tertiary)]">
                {"年間アワード（1月）"}
              </p>
              <div className="space-y-0.5 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                <p>{"🏆 年間MVP — 年間で最も多く家事をした人"}</p>
                <p>{"📈 成長賞 — 後半に追い上げた人"}</p>
                <p>{"🎖️ 継続賞 — 最も多くの月で活動した人"}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Household monthly total */}
      <div className="space-y-3">
        <div className="rounded-[16px] bg-[var(--card)] px-5 py-5">
          <p className="text-[18px] font-bold text-[var(--foreground)]">
            {"今月のおうち"}
          </p>
          {reportLoading && !householdReport ? (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
              <Loader2 size={14} className="animate-spin" />
              {"読み込み中..."}
            </div>
          ) : (
            <>
              <div className="mt-2.5 flex items-end gap-2">
                <p className="text-[48px] font-bold leading-none text-[var(--primary)]">
                  {householdReport?.currentMonthTotal ?? 0}
                </p>
                <p className="text-[18px] font-semibold text-[var(--muted-foreground)]">
                  {"回"}
                </p>
                <span
                  className={`mb-1 inline-flex rounded-full px-2.5 py-1 text-[13px] font-bold ${householdReportDiff >= 0 ? "bg-[var(--app-surface-soft)] text-[var(--primary)]" : "bg-[var(--destructive)]/15 text-[var(--destructive)]"}`}
                >
                  {monthDiffLabel} {"先月比"}
                </span>
              </div>
              <p className="mt-2 text-[13px] font-medium text-[var(--app-text-tertiary)]">
                {"みんなでたくさんやったね！"}
              </p>
            </>
          )}
        </div>

        {/* Top 3 chores */}
        <div className="rounded-[16px] bg-[var(--card)] px-5 py-5">
          <p className="text-[18px] font-bold text-[var(--foreground)]">
            {"よく回った家事 トップ3"}
          </p>
          <div className="mt-3 space-y-2">
            {topChores.length === 0 ? (
              <p className="text-[13px] font-medium text-[var(--app-text-tertiary)]">
                {"まだ記録がありません。"}
              </p>
            ) : (
              topChores.map((item) => {
                const ItemIcon = iconByName(item.icon);
                return (
                  <div
                    key={item.choreId}
                    className="flex items-center gap-2 rounded-[10px] bg-[var(--app-canvas)] px-3 py-2"
                  >
                    <ItemIcon size={14} color={item.iconColor} />
                    <p className="flex-1 truncate text-[15px] font-bold text-[var(--foreground)]">
                      {item.title}
                    </p>
                    <p className="text-[15px] font-bold text-[var(--primary)]">
                      {item.count}{"回"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Stale tasks */}
        <div className="rounded-[16px] bg-[var(--card)] px-5 py-5">
          <p className="text-[18px] font-bold text-[var(--foreground)]">
            {"久しぶりかも？"}
          </p>
          <div className="mt-3 space-y-2">
            {staleTasks.length === 0 ? (
              <p className="text-[13px] font-medium text-[var(--app-text-tertiary)]">
                {"問題のある家事はありません。"}
              </p>
            ) : (
              staleTasks.map((item) => {
                const ItemIcon = iconByName(item.icon);
                const jst = new Date(new Date(item.lastPerformedAt).getTime() + 9 * 60 * 60 * 1000);
                const lastPerformedLabel = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;
                return (
                  <div
                    key={item.choreId}
                    className="flex items-center gap-2 rounded-[10px] bg-[var(--app-canvas)] px-3 py-2"
                  >
                    <ItemIcon size={14} color={item.iconColor} />
                    <p className="flex-1 truncate text-[14px] font-bold text-[var(--foreground)]">
                      {item.title}
                    </p>
                    <p className="text-[12px] font-medium text-[var(--muted-foreground)]">
                      {"最終: "}{lastPerformedLabel}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
