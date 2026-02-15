export type AppUser = {
  id: string;
  name: string;
};

export type ChoreWithComputed = {
  id: string;
  title: string;
  icon: string;
  iconColor: string;
  bgColor: string;
  intervalDays: number;
  isBigTask: boolean;
  archived: boolean;
  lastPerformedAt: string | null;
  lastPerformerName: string | null;
  lastRecordId: string | null;
  dueAt: string | null;
  isDueToday: boolean;
  isDueTomorrow: boolean;
  isOverdue: boolean;
  overdueDays: number;
  daysSinceLast: number | null;
  doneToday: boolean;
};

export type NotificationSettings = {
  reminderTimes: string[];
  notifyDueToday: boolean;
  remindDailyIfOverdue: boolean;
  notifyCompletion: boolean;
};

export type StatsPeriodKey = "week" | "month" | "half" | "year" | "all" | "custom";

export type StatsResponse = {
  rangeLabel: string;
  choreCounts: Array<{ choreId: string; title: string; count: number }>;
  userCounts: Array<{ userId: string; name: string; count: number }>;
};

export type BootstrapResponse = {
  sessionUser: AppUser | null;
  householdInviteCode: string | null;
  users: AppUser[];
  chores: ChoreWithComputed[];
  todayChores: ChoreWithComputed[];
  tomorrowChores: ChoreWithComputed[];
  upcomingBigChores: ChoreWithComputed[];
  notificationSettings: NotificationSettings | null;
  needsRegistration: boolean;
};
