import { startOfJstDay, toJstDateKey } from "@/lib/time";
import type { ChoreScheduleOverride, ChoreWithComputed } from "@/lib/types";

export type HomeOccurrenceState = "done" | "skipped" | "pending";

export type HomeOccurrence = {
  chore: ChoreWithComputed;
  state: HomeOccurrenceState;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const JA_COLLATOR = new Intl.Collator("ja");

function scheduledDayOffset(
  chore: Pick<ChoreWithComputed, "dueAt">,
  targetDate: Date,
) {
  if (!chore.dueAt) return null;
  const dueStart = startOfJstDay(new Date(chore.dueAt));
  if (Number.isNaN(dueStart.getTime())) return null;
  const targetStart = startOfJstDay(targetDate);
  return Math.floor((targetStart.getTime() - dueStart.getTime()) / DAY_IN_MS);
}

function isScheduledOnDate(
  chore: Pick<ChoreWithComputed, "dueAt" | "intervalDays">,
  targetDate: Date,
) {
  const diffDays = scheduledDayOffset(chore, targetDate);
  if (diffDays === null || diffDays < 0) return false;
  return diffDays % Math.max(1, chore.intervalDays) === 0;
}

function toCompletedOccurrence(
  chore: ChoreWithComputed,
): ChoreWithComputed {
  return {
    ...chore,
    doneToday: true,
  };
}

function toPendingOccurrence(
  chore: ChoreWithComputed,
): ChoreWithComputed {
  return {
    ...chore,
    doneToday: false,
    lastPerformedAt: null,
    lastPerformerName: null,
    lastPerformerId: null,
    lastRecordId: null,
    lastRecordIsInitial: false,
    lastRecordSkipped: false,
  };
}

function stateOrder(state: HomeOccurrenceState) {
  if (state === "done") return 0;
  if (state === "skipped") return 1;
  return 2;
}

export function countDoneHomeOccurrences(occurrences: HomeOccurrence[]) {
  return occurrences.filter((item) => item.state !== "pending").length;
}

export function buildHomeOccurrencesByDate(params: {
  chores: ChoreWithComputed[];
  dateKey: string;
  scheduleOverridesByChore: Map<string, ChoreScheduleOverride[]>;
}) {
  const { chores, dateKey, scheduleOverridesByChore } = params;
  const targetDate = startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`));
  if (Number.isNaN(targetDate.getTime())) return [];

  const occurrences: HomeOccurrence[] = [];

  for (const chore of chores) {
    const performedDateKey =
      chore.lastPerformedAt && !chore.lastRecordIsInitial
        ? toJstDateKey(startOfJstDay(new Date(chore.lastPerformedAt)))
        : null;
    const hasCompletedOccurrence = performedDateKey === dateKey;

    if (hasCompletedOccurrence) {
      occurrences.push({
        chore: toCompletedOccurrence(chore),
        state: chore.lastRecordSkipped ? "skipped" : "done",
      });
    }

    const overrideList = scheduleOverridesByChore.get(chore.id) ?? [];
    const scheduledOccurrences =
      overrideList.length > 0
        ? overrideList.filter((override) => override.date === dateKey).length
        : (isScheduledOnDate(chore, targetDate) ? 1 : 0);
    const pendingCount = Math.max(
      0,
      scheduledOccurrences - (hasCompletedOccurrence ? 1 : 0),
    );

    if (pendingCount > 0) {
      const pendingTemplate = toPendingOccurrence(chore);
      for (let index = 0; index < pendingCount; index += 1) {
        occurrences.push({ chore: { ...pendingTemplate }, state: "pending" });
      }
    }
  }

  occurrences.sort((a, b) => {
    const titleDiff = JA_COLLATOR.compare(a.chore.title, b.chore.title);
    if (titleDiff !== 0) return titleDiff;
    const idDiff = JA_COLLATOR.compare(a.chore.id, b.chore.id);
    if (idDiff !== 0) return idDiff;
    return stateOrder(a.state) - stateOrder(b.state);
  });

  return occurrences;
}
