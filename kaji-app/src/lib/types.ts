export type AppUser = {
  id: string;
  name: string;
  color: string | null;
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
  defaultAssigneeId: string | null;
  defaultAssigneeName: string | null;
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

export type ChoreAssignmentEntry = {
  choreId: string;
  userId: string;
  userName: string;
  date: string;
};

export type NotificationSettings = {
  reminderTimes: string[];
  notifyDueToday: boolean;
  remindDailyIfOverdue: boolean;
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
  isBigTask: boolean;
  count: number;
  userCounts: StatsChoreUserBreakdown[];
};

export type StatsResponse = {
  rangeLabel: string;
  choreCounts: StatsChoreCount[];
  userCounts: StatsUserCount[];
  bigTaskUserCounts: StatsUserCount[];
};

export type BootstrapResponse = {
  sessionUser: AppUser | null;
  householdInviteCode: string | null;
  users: AppUser[];
  chores: ChoreWithComputed[];
  todayChores: ChoreWithComputed[];
  tomorrowChores: ChoreWithComputed[];
  upcomingBigChores: ChoreWithComputed[];
  assignments: ChoreAssignmentEntry[];
  notificationSettings: NotificationSettings | null;
  customIcons: Array<{ id: string; label: string; icon: string; iconColor: string; bgColor: string }>;
  needsRegistration: boolean;
};
