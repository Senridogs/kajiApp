import type { CalendarSummaryChoreSource } from "../../../src/lib/calendar-month-summary.js";
import type { ChoreScheduleOverride, ChoreWithComputed } from "../../../src/lib/types.js";

export const OCCURRENCE_TEST_MONTH = "2026-03";
export const OCCURRENCE_TEST_DATE_KEYS = ["2026-03-05", "2026-03-10", "2026-03-12"];

export const calendarFixtureChores: CalendarSummaryChoreSource[] = [
  {
    id: "c1",
    intervalDays: 7,
    dailyTargetCount: 1,
    createdAt: new Date("2026-02-01T00:00:00+09:00"),
    latestRecord: {
      performedAt: new Date("2026-02-26T09:00:00+09:00"),
      isSkipped: false,
    },
    scheduleOverrides: [],
  },
  {
    id: "c2",
    intervalDays: 1,
    dailyTargetCount: 2,
    createdAt: new Date("2026-02-01T00:00:00+09:00"),
    latestRecord: null,
    scheduleOverrides: [{ date: "2026-03-10" }],
  },
];

export const homeFixtureChores: ChoreWithComputed[] = [
  {
    id: "c1",
    title: "風呂掃除",
    icon: "sparkles",
    iconColor: "#111",
    bgColor: "#fff",
    intervalDays: 7,
    dailyTargetCount: 1,
    archived: false,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    lastPerformedAt: "2026-02-26T09:00:00+09:00",
    lastPerformerName: null,
    lastPerformerId: null,
    lastRecordId: null,
    lastRecordIsInitial: false,
    lastRecordSkipped: false,
    dueAt: "2026-03-05T00:00:00+09:00",
    isDueToday: false,
    isDueTomorrow: false,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: 0,
  },
  {
    id: "c2",
    title: "洗濯",
    icon: "shirt",
    iconColor: "#111",
    bgColor: "#fff",
    intervalDays: 1,
    dailyTargetCount: 2,
    archived: false,
    defaultAssigneeId: null,
    defaultAssigneeName: null,
    lastPerformedAt: null,
    lastPerformerName: null,
    lastPerformerId: null,
    lastRecordId: null,
    lastRecordIsInitial: false,
    lastRecordSkipped: false,
    dueAt: "2026-03-01T00:00:00+09:00",
    isDueToday: false,
    isDueTomorrow: false,
    isOverdue: false,
    overdueDays: 0,
    daysSinceLast: 0,
  },
];

export const homeFixtureOverrides = new Map<string, ChoreScheduleOverride[]>([
  [
    "c2",
    [
      {
        id: "ov-1",
        choreId: "c2",
        date: "2026-03-10",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
    ],
  ],
]);
