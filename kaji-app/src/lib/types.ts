export type AppUser = {
  id: string;
  name: string;
  color: string | null;
};

export type RecordReaction = {
  id: string;
  userId: string;
  userName: string;
  emoji: string;
  createdAt: string;
};

export type ChoreRecordItem = {
  id: string;
  performedAt: string;
  memo: string | null;
  chore: { id: string; title: string };
  user: { id: string; name: string };
  isInitial?: boolean;
  isSkipped?: boolean;
  reactions?: RecordReaction[];
};

export type ChoreWithComputed = {
  id: string;
  title: string;
  icon: string;
  iconColor: string;
  bgColor: string;
  intervalDays: number;
  dailyTargetCount: number;
  archived: boolean;
  defaultAssigneeId: string | null;
  defaultAssigneeName: string | null;
  lastPerformedAt: string | null;
  lastPerformerName: string | null;
  lastPerformerId: string | null;
  lastRecordId: string | null;
  lastRecordIsInitial: boolean;
  lastRecordSkipped: boolean;
  dueAt: string | null;
  isDueToday: boolean;
  isDueTomorrow: boolean;
  isOverdue: boolean;
  overdueDays: number;
  daysSinceLast: number | null;
  doneToday: boolean;
};

export type HomeProgressState = "done" | "skipped" | "pending";

export type HomeProgressEntry = {
  total: number;
  completed: number;
  skipped: number;
  pending: number;
  latestState: HomeProgressState;
};

export type ChoreAssignmentEntry = {
  choreId: string;
  userId: string;
  userName: string;
  date: string;
};

export type NotificationSettings = {
  reminderTimes: string[];
  notifyReminder: boolean;
  notifyCompletion: boolean;
};

export type StatsPeriodKey = "week" | "month" | "half" | "year" | "all" | "custom";

export type StatsUserCount = {
  userId: string;
  name: string;
  count: number;
};

export type StatsChoreUserBreakdown = StatsUserCount & {
  ratio: number;
};

export type StatsChoreCount = {
  choreId: string;
  title: string;
  count: number;
  userCounts: StatsChoreUserBreakdown[];
};

export type StatsResponse = {
  rangeLabel: string;
  choreCounts: StatsChoreCount[];
  userCounts: StatsUserCount[];
};

export type HouseholdReportResponse = {
  currentMonthTotal: number;
  previousMonthTotal: number;
  choreCounts: Array<{
    choreId: string;
    title: string;
    icon: string;
    iconColor: string;
    bgColor: string;
    count: number;
  }>;
  staleTasks: Array<{
    choreId: string;
    title: string;
    icon: string;
    iconColor: string;
    bgColor: string;
    lastPerformedAt: string;
    intervalDays: number;
    daysSinceLast: number;
  }>;
};

export type MyStatsResponse = {
  currentMonthTotal: number;
  choreCounts: Array<{
    choreId: string;
    title: string;
    icon: string;
    iconColor: string;
    bgColor: string;
    count: number;
  }>;
};

export type ChoreScheduleOverride = {
  id: string;
  choreId: string;
  date: string;
  createdAt: string;
};

export type BootstrapResponse = {
  sessionUser: AppUser | null;
  householdInviteCode: string | null;
  users: AppUser[];
  chores: ChoreWithComputed[];
  todayChores: ChoreWithComputed[];
  tomorrowChores: ChoreWithComputed[];
  assignments: ChoreAssignmentEntry[];
  notificationSettings: NotificationSettings | null;
  customIcons: Array<{ id: string; label: string; icon: string; iconColor: string; bgColor: string }>;
  scheduleOverrides: ChoreScheduleOverride[];
  homeProgressByDate: Record<string, Record<string, HomeProgressEntry>>;
  needsRegistration: boolean;
};

export type CalendarMonthSummaryResponse = {
  month: string;
  countsByDate: Record<string, number>;
  generatedAt: string;
};
