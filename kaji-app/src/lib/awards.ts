import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Award definitions
// ---------------------------------------------------------------------------

export const AWARD_DEFINITIONS = {
  // Monthly awards
  speed_star: { label: "スピードスター", description: "一番多く家事をこなした", icon: "⚡" },
  early_bird: { label: "早起きマスター", description: "朝（5-9時）に最も活動した", icon: "🌅" },
  night_owl: { label: "夜型ヒーロー", description: "夜（21-翌2時）に最も活動した", icon: "🦉" },
  variety_king: { label: "バラエティキング", description: "最も多くの種類の家事をした", icon: "🎨" },
  streak_master: { label: "継続の達人", description: "最長ストリークを記録", icon: "🔥" },
  weekend_warrior: { label: "週末の戦士", description: "週末に最も活動した", icon: "💪" },
  steady_hand: { label: "コツコツの星", description: "最も均等に家事を分散した", icon: "⭐" },

  // Yearly awards
  annual_mvp: { label: "年間MVP", description: "年間で最も貢献した", icon: "🏆" },
  annual_growth: { label: "成長賞", description: "後半に大きく伸びた", icon: "📈" },
  annual_consistency: { label: "皆勤賞", description: "最も多くの月で活動した", icon: "🎖️" },
} as const;

export type AwardKey = keyof typeof AWARD_DEFINITIONS;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type UserScore = { userId: string; score: number };

type AwardCandidate = {
  awardKey: AwardKey;
  winners: ReadonlyArray<{ userId: string; score: number }>;
};

type ChoreRecordRow = {
  userId: string;
  performedAt: Date;
  choreId: string;
  isSkipped: boolean;
  isInitial: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toJstHour(date: Date): number {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.getUTCHours();
}

function toJstDateKey(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekend(date: Date): boolean {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const day = jst.getUTCDay();
  return day === 0 || day === 6;
}

/** Pick users with the highest score (handles ties). Returns empty if no scores > 0. */
function pickWinners(scores: ReadonlyArray<UserScore>): ReadonlyArray<UserScore> {
  if (scores.length === 0) return [];
  const max = Math.max(...scores.map((s) => s.score));
  if (max <= 0) return [];
  return scores.filter((s) => s.score === max);
}

/** Group records by userId into a Map<userId, records[]> without mutation. */
function groupByUser(records: ReadonlyArray<ChoreRecordRow>): Map<string, ReadonlyArray<ChoreRecordRow>> {
  const map = new Map<string, ChoreRecordRow[]>();
  for (const r of records) {
    const existing = map.get(r.userId);
    map.set(r.userId, existing ? [...existing, r] : [r]);
  }
  return map;
}

/** Get unique user IDs from records. */
function uniqueUserIds(records: ReadonlyArray<ChoreRecordRow>): ReadonlyArray<string> {
  return [...new Set(records.map((r) => r.userId))];
}

// ---------------------------------------------------------------------------
// Monthly award calculators
// ---------------------------------------------------------------------------

function calcSpeedStar(records: ReadonlyArray<ChoreRecordRow>): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => ({
    userId,
    score: records.filter((r) => r.userId === userId).length,
  }));
  return { awardKey: "speed_star", winners: pickWinners(scores) };
}

function calcEarlyBird(records: ReadonlyArray<ChoreRecordRow>): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => ({
    userId,
    score: records.filter((r) => r.userId === userId && toJstHour(r.performedAt) >= 5 && toJstHour(r.performedAt) < 9).length,
  }));
  return { awardKey: "early_bird", winners: pickWinners(scores) };
}

function calcNightOwl(records: ReadonlyArray<ChoreRecordRow>): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => ({
    userId,
    score: records.filter((r) => {
      const hour = toJstHour(r.performedAt);
      return r.userId === userId && (hour >= 21 || hour < 2);
    }).length,
  }));
  return { awardKey: "night_owl", winners: pickWinners(scores) };
}

function calcVarietyKing(records: ReadonlyArray<ChoreRecordRow>): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => {
    const choreIds = new Set(records.filter((r) => r.userId === userId).map((r) => r.choreId));
    return { userId, score: choreIds.size };
  });
  return { awardKey: "variety_king", winners: pickWinners(scores) };
}

function calcStreakMaster(records: ReadonlyArray<ChoreRecordRow>): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => {
    const userRecords = records.filter((r) => r.userId === userId);
    const dateKeys = [...new Set(userRecords.map((r) => toJstDateKey(r.performedAt)))].sort();
    if (dateKeys.length === 0) return { userId, score: 0 };

    let maxStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < dateKeys.length; i++) {
      const prev = new Date(dateKeys[i - 1] + "T00:00:00Z");
      const curr = new Date(dateKeys[i] + "T00:00:00Z");
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays === 1) {
        currentStreak += 1;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    return { userId, score: maxStreak };
  });
  return { awardKey: "streak_master", winners: pickWinners(scores) };
}

function calcWeekendWarrior(records: ReadonlyArray<ChoreRecordRow>): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => ({
    userId,
    score: records.filter((r) => r.userId === userId && isWeekend(r.performedAt)).length,
  }));
  return { awardKey: "weekend_warrior", winners: pickWinners(scores) };
}

function calcSteadyHand(records: ReadonlyArray<ChoreRecordRow>): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const byUser = groupByUser(records);

  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => {
    const userRecords = byUser.get(userId) ?? [];
    if (userRecords.length < 2) return { userId, score: 0 };

    // Count records per day-of-week (0-6). Lower standard deviation = more even distribution.
    const dayCounts = new Array(7).fill(0) as number[];
    for (const r of userRecords) {
      const jst = new Date(r.performedAt.getTime() + JST_OFFSET_MS);
      dayCounts[jst.getUTCDay()] += 1;
    }
    const mean = userRecords.length / 7;
    const variance = dayCounts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / 7;
    const stdDev = Math.sqrt(variance);
    // Invert: lower stdDev is better. Use 1/(1+stdDev) so score is between 0 and 1.
    // Multiply by 1000 and floor for integer comparison.
    return { userId, score: Math.floor(1000 / (1 + stdDev)) };
  });
  return { awardKey: "steady_hand", winners: pickWinners(scores) };
}

// ---------------------------------------------------------------------------
// Yearly award calculators
// ---------------------------------------------------------------------------

function calcAnnualMvp(records: ReadonlyArray<ChoreRecordRow>): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => ({
    userId,
    score: records.filter((r) => r.userId === userId).length,
  }));
  return { awardKey: "annual_mvp", winners: pickWinners(scores) };
}

function calcAnnualGrowth(records: ReadonlyArray<ChoreRecordRow>, year: number): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const midpoint = new Date(Date.UTC(year, 6, 1) - JST_OFFSET_MS); // July 1st JST

  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => {
    const userRecords = records.filter((r) => r.userId === userId);
    const firstHalf = userRecords.filter((r) => r.performedAt < midpoint).length;
    const secondHalf = userRecords.filter((r) => r.performedAt >= midpoint).length;
    // Growth = second half minus first half. Only positive growth counts.
    return { userId, score: Math.max(0, secondHalf - firstHalf) };
  });
  return { awardKey: "annual_growth", winners: pickWinners(scores) };
}

function calcAnnualConsistency(records: ReadonlyArray<ChoreRecordRow>): AwardCandidate {
  const userIds = uniqueUserIds(records);
  const scores: ReadonlyArray<UserScore> = userIds.map((userId) => {
    const months = new Set(
      records
        .filter((r) => r.userId === userId)
        .map((r) => {
          const jst = new Date(r.performedAt.getTime() + JST_OFFSET_MS);
          return jst.getUTCMonth();
        }),
    );
    return { userId, score: months.size };
  });
  return { awardKey: "annual_consistency", winners: pickWinners(scores) };
}

// ---------------------------------------------------------------------------
// Award generation
// ---------------------------------------------------------------------------

/** Build the UTC range for a given JST month. */
function jstMonthRange(year: number, month: number): { start: Date; end: Date } {
  // month is 1-based
  const start = new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - JST_OFFSET_MS);
  return { start, end };
}

/** Build the UTC range for a given JST year. */
function jstYearRange(year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, 0, 1) - JST_OFFSET_MS);
  const end = new Date(Date.UTC(year + 1, 0, 1) - JST_OFFSET_MS);
  return { start, end };
}

async function fetchRecords(
  householdId: string,
  start: Date,
  end: Date,
): Promise<ReadonlyArray<ChoreRecordRow>> {
  const rows = await prisma.choreRecord.findMany({
    where: {
      householdId,
      isInitial: false,
      isSkipped: false,
      performedAt: { gte: start, lt: end },
    },
    select: {
      userId: true,
      performedAt: true,
      choreId: true,
      isSkipped: true,
      isInitial: true,
    },
    orderBy: { performedAt: "asc" },
  });
  return rows;
}

export async function generateMonthlyAwards(
  householdId: string,
  year: number,
  month: number,
): Promise<ReadonlyArray<{ id: string; awardKey: string; userId: string }>> {
  const { start, end } = jstMonthRange(year, month);
  const records = await fetchRecords(householdId, start, end);

  if (records.length === 0) return [];

  // Check for existing awards to avoid duplicates
  const existing = await prisma.award.findFirst({
    where: { householdId, type: "monthly", year, month },
  });
  if (existing) return [];

  const candidates: ReadonlyArray<AwardCandidate> = [
    calcSpeedStar(records),
    calcEarlyBird(records),
    calcNightOwl(records),
    calcVarietyKing(records),
    calcStreakMaster(records),
    calcWeekendWarrior(records),
    calcSteadyHand(records),
  ];

  const awardsToCreate = candidates.flatMap((candidate) => {
    const def = AWARD_DEFINITIONS[candidate.awardKey];
    return candidate.winners.map((winner) => ({
      householdId,
      userId: winner.userId,
      type: "monthly" as const,
      awardKey: candidate.awardKey,
      emoji: def.icon,
      title: def.label,
      description: def.description,
      month,
      year,
      metadata: { score: winner.score },
    }));
  });

  if (awardsToCreate.length === 0) return [];

  // Use createMany for efficiency then fetch created records
  await prisma.award.createMany({ data: awardsToCreate });

  const created = await prisma.award.findMany({
    where: { householdId, type: "monthly", year, month },
    select: { id: true, awardKey: true, userId: true },
  });

  return created;
}

export async function generateYearlyAwards(
  householdId: string,
  year: number,
): Promise<ReadonlyArray<{ id: string; awardKey: string; userId: string }>> {
  const { start, end } = jstYearRange(year);
  const records = await fetchRecords(householdId, start, end);

  if (records.length === 0) return [];

  // Check for existing awards to avoid duplicates
  const existing = await prisma.award.findFirst({
    where: { householdId, type: "yearly", year, month: null },
  });
  if (existing) return [];

  const candidates: ReadonlyArray<AwardCandidate> = [
    calcAnnualMvp(records),
    calcAnnualGrowth(records, year),
    calcAnnualConsistency(records),
  ];

  const awardsToCreate = candidates.flatMap((candidate) => {
    const def = AWARD_DEFINITIONS[candidate.awardKey];
    return candidate.winners.map((winner) => ({
      householdId,
      userId: winner.userId,
      type: "yearly" as const,
      awardKey: candidate.awardKey,
      emoji: def.icon,
      title: def.label,
      description: def.description,
      month: null as number | null,
      year,
      metadata: { score: winner.score },
    }));
  });

  if (awardsToCreate.length === 0) return [];

  await prisma.award.createMany({ data: awardsToCreate });

  const created = await prisma.award.findMany({
    where: { householdId, type: "yearly", year, month: null },
    select: { id: true, awardKey: true, userId: true },
  });

  return created;
}
