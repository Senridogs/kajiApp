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
  comments?: ChoreRecordCommentItem[];
};

export type ChoreWithComputed = {
  id: string;
  title: string;
  icon: string;
  iconColor: string;
  bgColor: string;
  intervalDays: number;
  archived: boolean;
  defaultAssigneeId: string | null;
  defaultAssigneeName: string | null;
  lastPerformedAt: string | null;
  lastPerformerName: string | null;
  lastPerformerId: string | null;
  lastRecordId: string | null;
  lastRecordIsInitial: boolean;
  lastRecordSkipped: boolean;
  daysSinceLast: number | null;
  freshnessRatio: number;
  freshnessLevel: "fresh" | "upcoming" | "due" | "stale";
  freshnessLabel: string;
  plantStage: "sprout" | "growing" | "budding" | "bloom" | "wilting" | "withered";
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

export type BootstrapResponse = {
  sessionUser: AppUser | null;
  householdInviteCode: string | null;
  users: AppUser[];
  chores: ChoreWithComputed[];
  notificationSettings: NotificationSettings | null;
  customIcons: Array<{ id: string; label: string; icon: string; iconColor: string; bgColor: string }>;
  needsRegistration: boolean;
  gardenScore: number;
  householdStreak: number;
  homeMessage: { welcome: string | null; message: string };
  recentRecords: ChoreRecordItem[];
  recentAwards: AwardItem[];
};

export type AwardItem = {
  id: string;
  userId: string;
  type: string;
  awardKey: string;
  title: string;
  emoji: string;
  description: string | null;
  month: number | null;
  year: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ChoreRecordCommentItem = {
  id: string;
  recordId: string;
  userId: string;
  userName?: string;
  body: string;
  createdAt: string;
};

