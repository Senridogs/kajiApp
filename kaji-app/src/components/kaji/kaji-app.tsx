"use client";

import { type CSSProperties, FormEvent, MouseEvent, TouchEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  Share2,
  User,
} from "lucide-react";

import { ActionButton } from "@/components/kaji/action-button";
import { BottomSheet } from "@/components/kaji/bottom-sheet";
import {
  ChoreEditor,
  CustomIconPicker,
  type ChoreForm,
  type CustomIconOption,
} from "@/components/kaji/chore-editor";
import { ConfirmDialog } from "@/components/kaji/confirm-dialog";
import { PRIMARY_COLOR, QUICK_ICON_PRESETS, USER_COLOR_PALETTE } from "@/components/kaji/constants";
import {
  deleteChoreDialogCopy,
  infoDialogCopy,
  mergeDuplicateDialogCopy,
  recordDateChoiceDialogCopy,
  rescheduleConfirmDialogCopy,
  undoRecordDialogCopy,
} from "@/components/kaji/dialog-copy";
import {
  apiFetch,
  darkenColor,
  dueInDaysLabel,
  formatJpDate,
  formatMonthDay,
  formatTopDate,
  iconByName,
  relativeLastPerformed,
  urlBase64ToUint8Array,
  lightenColor,
} from "@/components/kaji/helpers";
import { useEdgeSwipeBack } from "@/components/kaji/use-edge-swipe-back";
import { useSwipeTab } from "@/components/kaji/use-swipe-tab";
import {
  HomeSectionTitle,
  HomeTaskRow,
  ScreenTitle,
  SegmentedFilter,
  SettingToggleRow,
  SwipableListChoreRow,
  UndoToast,
} from "@/components/kaji/ui-parts";
import { AnimatedList } from "@/components/ui/animated-list";
import {
  BootstrapResponse,
  CalendarMonthSummaryResponse,
  ChoreRecordItem,
  ChoreAssignmentEntry,
  ChoreScheduleOverride,
  ChoreWithComputed,
  HouseholdReportResponse,
  MyStatsResponse,
  NotificationSettings,
  StatsPeriodKey,
  StatsResponse,
} from "@/lib/types";
import {
  applyHomeStoredOrder,
  sanitizeHomeOrderByDate,
  moveAcrossDates,
  reorderWithinDate,
  type HomeOrderByDate,
  type DropPosition,
} from "@/lib/home-order";
import {
  buildHomeRowsByDate,
  countDoneHomeOccurrences,
  countTotalHomeOccurrences,
} from "@/lib/home-occurrence";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

const JA_COLLATOR = new Intl.Collator("ja");
type ListSortKey = "kana" | "due" | "icon";
const LIST_SORT_ITEMS: Array<{ key: ListSortKey; label: string }> = [
  { key: "icon", label: "アイコン" },
  { key: "due", label: "期日" },
  { key: "kana", label: "かな順" },
];

const HOME_SECTION_STICKY_FALLBACK_TOP = 72;
const TAB_HEADER_HEIGHT_FALLBACK = 72;
const ASSIGNMENT_SHEET_SLIDE_MS = 240;
const ASSIGNMENT_BACK_SWIPE_EDGE_PX = 72;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PULL_REFRESH_TRIGGER_PX = 74;
const PULL_REFRESH_MAX_PX = 128;
const PULL_REFRESH_HOLD_PX = 28;
const REMINDER_HOUR_CHOICES = Array.from({ length: 18 }, (_, idx) => `${String(6 + idx).padStart(2, "0")}:00`);
const REACTION_CHOICES = ["👏", "❤️", "✨", "🎉"] as const;
const REACTION_ICON_MAP: Record<(typeof REACTION_CHOICES)[number], { icon: string; color: string }> = {
  "👏": { icon: "thumb_up", color: "#1A9BE8" },
  "❤️": { icon: "favorite", color: "#E53935" },
  "✨": { icon: "celebration", color: "#FF9800" },
  "🎉": { icon: "star", color: "#9C27B0" },
};
const WEEKDAY_SHORT = ["日", "月", "火", "水", "木", "金", "土"] as const;
const REPORT_MONTH_OFFSETS = [0, 1, 2] as const;
const REPORT_MONTH_LABELS: Record<(typeof REPORT_MONTH_OFFSETS)[number], string> = {
  0: "今月",
  1: "先月",
  2: "2ヶ月前",
};
const CALENDAR_WEEK_DAYS = 7;
const MAX_DAY_DOT_SLOTS = 6;
const DAY_DOT_VISIBLE_WHEN_OVERFLOW = 5;

type TabKey = "home" | "list" | "records" | "stats" | "settings";
const TAB_ORDER: readonly TabKey[] = ["home", "records", "list", "stats"] as const;
type AssignmentTabKey = "daily" | "big";
const ASSIGNMENT_TAB_ORDER: readonly AssignmentTabKey[] = ["daily", "big"] as const;
type StatsQueryOptions = { from: string; to: string };
type CustomDateRange = { from: string; to: string };
type SettingsViewKey = "menu" | "my-report" | "my-records" | "push" | "push-guide" | "family" | "manage" | "sleep";
type PushGuidePlatform = "android" | "iphone";
type PushGuideContent = {
  setupTitle: string;
  setupSteps: string[];
  troubleTitle: string;
  troubleSteps: string[];
};
type RescheduleChoice = "tomorrow" | "next_same_weekday" | "custom";
type RescheduleConfirmOrigin = "sheet" | "drag" | "future-record" | "future-skip";
type HomeDropInsert = {
  targetDateKey: string;
  targetChoreId: string;
  position: DropPosition;
};
type PendingRescheduleConfirm = {
  origin: RescheduleConfirmOrigin;
  choreId: string;
  choreTitle: string;
  sourceDateKey: string;
  targetDateKey: string;
  mergeIfDuplicate: boolean;
  sourceRecordId?: string;
  homeDropInsert?: HomeDropInsert;
};
type PendingMergeDuplicateConfirm = {
  origin: RescheduleConfirmOrigin;
  choreId: string;
  choreTitle: string;
  sourceDateKey: string;
  targetDateKey: string;
  sourceRecordId?: string;
  homeDropInsert?: HomeDropInsert;
};
type PendingRecordDateChoice = {
  choreId: string;
  choreTitle: string;
  sourceDateKey: string;
};
type PerformedAtMode = "today" | "source";
type MemoFlowMode = "default" | "calendar-quick";
type CalendarBlankActionMode = "choice" | "record";
type PendingCalendarPlanDuplicateConfirm = {
  choreId: string;
  choreTitle: string;
  dateKey: string;
};
type StandaloneScreenKey = "manage" | "my-report" | "my-records";
type StandaloneOriginKey = "settings" | "list" | "stats" | "records";
type TimelineRecordGroup = {
  dateKey: string;
  label: string;
  items: ChoreRecordItem[];
};
const APP_UPDATE_NOTICE_STORAGE_KEY = "kaji_app_update_notice";
const APP_UPDATE_TARGET_TAB_STORAGE_KEY = "kaji_app_update_target_tab";
const ONBOARDING_PENDING_STORAGE_KEY = "kaji_onboarding_pending";
const HOME_ORDER_STORAGE_KEY_PREFIX = "kaji_home_order_v1";
const HOME_ORDER_RETENTION_DAYS = 7;
const ONBOARDING_PRESET_CHORES = [
  { title: "食器洗い", icon: "cooking-pot", iconColor: "#33C28A", bgColor: "#EAF7EF", intervalDays: 1, isBigTask: false },
  { title: "洗濯", icon: "shirt", iconColor: "#7A6FF0", bgColor: "#EFEAFE", intervalDays: 2, isBigTask: false },
  { title: "ゴミ出し", icon: "recycle", iconColor: "#B97700", bgColor: "#FFF6E3", intervalDays: 3, isBigTask: false },
  { title: "水まわり掃除", icon: "droplets", iconColor: "#4D8BFF", bgColor: "#EEF3FF", intervalDays: 7, isBigTask: false },
] as const;
const PUSH_GUIDE_CONFIRM_STEPS = [
  "・「いま通知を送信」で通知が来たらOK",
  "・届かない時だけ、アプリ再起動後に再テスト",
  "・さらに届かない時は、端末通知設定を確認",
] as const;
const PUSH_GUIDE_CONTENT: Record<PushGuidePlatform, PushGuideContent> = {
  android: {
    setupTitle: "Android（ホーム追加からの手順）",
    setupSteps: [
      "1. Chromeで家事アプリを開く。",
      "2. 右上メニューから「ホーム画面に追加」。",
      "3. 追加したホーム画面アイコンから開く。",
      "4. ログイン画面が出たらログイン。",
      "5. 左上ユーザーアイコン→設定→プッシュ通知。",
      "6. 通知をON（すでにONならそのまま）。",
      "7. 「いま通知を送信」をタップ（確認用）。",
      "8. 許可確認が出たら許可。通知が来たらOK。",
    ],
    troubleTitle: "届かないとき（Android）",
    troubleSteps: [
      "1. 設定 > 通知 > 家事アプリ（またはChrome）を開く。",
      "2. 「通知を許可」「ロック画面」「音」をONにする。",
      "3. 設定 > 電池で最適化対象から外す。",
      "4. アプリに戻り、通知をOFF→ONし直す。",
      "5. 「いま通知を送信」を押し、1分待つ。",
      "6. 届けばOK。届かなければ端末再起動後に再テスト。",
    ],
  },
  iphone: {
    setupTitle: "iPhone（ホーム追加からの手順）",
    setupSteps: [
      "1. Safariで家事アプリを開く。",
      "2. 共有ボタン→「ホーム画面に追加」。",
      "3. 追加したホーム画面アイコンから開く。",
      "4. ログイン画面が出たらログイン。",
      "5. 左上ユーザーアイコン→設定→プッシュ通知。",
      "6. 通知をON（すでにONならそのまま）。",
      "7. 「いま通知を送信」をタップ（確認用）。",
      "8. 許可確認が出たら許可。通知が来たらOK。",
    ],
    troubleTitle: "届かないとき（iPhone）",
    troubleSteps: [
      "1. 設定 > 通知 > 家事アプリを開く。",
      "2. 「通知を許可」「ロック画面」「バナー」「サウンド」をON。",
      "3. 集中モード/おやすみモードで通知が止まっていないか確認。",
      "4. アプリに戻り、通知をOFF→ONし直す。",
      "5. 「いま通知を送信」を押し、1分待つ。",
      "6. 届けばOK。届かなければ端末再起動後に再テスト。",
    ],
  },
};
type PendingSwipeDelete = {
  toastId: string;
  chore: ChoreWithComputed;
  removedAssignments: ChoreAssignmentEntry[];
};

function toDateInputValue(date: Date) {
  return toJstDateKey(date);
}

function defaultCustomDateRange(now = new Date()): CustomDateRange {
  const to = toDateInputValue(now);
  const fromDate = addDays(now, -30);
  const from = toDateInputValue(fromDate);
  return { from, to };
}

function defaultLastPerformedAt(now = new Date()) {
  const previousDay = addDays(now, -1);
  return previousDay.toISOString();
}

function onboardingPresetLastPerformedAt(intervalDays: number, now = new Date()) {
  const todayStart = startOfJstDay(now);
  const normalizedInterval = Math.max(1, Math.trunc(intervalDays));
  return addDays(todayStart, -normalizedInterval).toISOString();
}

function applyPullResistance(distance: number) {
  return Math.min(PULL_REFRESH_MAX_PX, Math.max(0, distance) * 0.5);
}

function compareDateKey(left: string, right: string) {
  return left.localeCompare(right);
}

function resolvePerformedAtForDateKey(dateKey: string, now = new Date()) {
  const todayKey = toJstDateKey(startOfJstDay(now));
  if (compareDateKey(dateKey, todayKey) > 0) {
    return now;
  }

  const targetDayStart = startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`));
  if (Number.isNaN(targetDayStart.getTime())) {
    return now;
  }

  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const nowJst = new Date(now.getTime() + jstOffsetMs);
  const elapsedMs =
    ((nowJst.getUTCHours() * 60 + nowJst.getUTCMinutes()) * 60 + nowJst.getUTCSeconds()) * 1000 +
    nowJst.getUTCMilliseconds();
  return new Date(targetDayStart.getTime() + elapsedMs);
}

function buildGroupedTimelineRecords(items: ChoreRecordItem[]): TimelineRecordGroup[] {
  const todayKey = toJstDateKey(startOfJstDay(new Date()));
  const yesterdayKey = toJstDateKey(addDays(startOfJstDay(new Date()), -1));
  const filtered = items
    .filter((record) => !record.isInitial && !record.isSkipped)
    .slice(0, 60);
  const groups = new Map<string, ChoreRecordItem[]>();
  filtered.forEach((record) => {
    const key = toJstDateKey(startOfJstDay(new Date(record.performedAt)));
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  });
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dateKey, groupedItems]) => ({
      dateKey,
      label: isSameDateKey(dateKey, todayKey)
        ? "今日"
        : isSameDateKey(dateKey, yesterdayKey)
          ? "昨日"
          : (() => {
            const [, m, d] = dateKey.split("-").map(Number);
            return `${m}/${d}`;
          })(),
      items: groupedItems.sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()),
    }));
}

function toMonthKey(date: Date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKeyWithOffset(base: string, offset: number) {
  const [year, month] = base.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - offset, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfJstWeekMonday(date: Date) {
  const day = new Date(date);
  const jstDay = new Date(day.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
  const diff = jstDay === 0 ? -6 : 1 - jstDay;
  return startOfJstDay(addDays(day, diff));
}

function isSameDateKey(a: string, b: string) {
  return a === b;
}

function topDateWithWeekday(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    weekday: "long",
  }).format(now);
  return `${weekday} ${formatTopDate(now)}`;
}

function formatDateKeyMonthDayWeekday(dateKey: string) {
  const date = startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`));
  if (Number.isNaN(date.getTime())) return dateKey;
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = jstDate.getUTCMonth() + 1;
  const day = jstDate.getUTCDate();
  const weekday = WEEKDAY_SHORT[jstDate.getUTCDay()];
  return `${month}/${day}(${weekday})`;
}

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

function splitComputedChoresForHome(chores: ChoreWithComputed[]) {
  const todayChores = chores.filter((c) => c.isDueToday || c.isOverdue || c.doneToday);
  const tomorrowChores = chores.filter(
    (c) =>
      c.isDueTomorrow || (c.intervalDays === 1 && (c.isDueToday || c.isOverdue || c.doneToday)),
  );
  const upcomingBigChores: ChoreWithComputed[] = [];

  return { todayChores, tomorrowChores, upcomingBigChores };
}

/** Assignee priority: self=0 > partner=1 > none=2 */
function assigneePriority(assigneeId: string | null, sessionUserId: string | null): number {
  if (!assigneeId) return 2;
  if (sessionUserId && assigneeId === sessionUserId) return 0;
  return 1;
}

function sortHomeSectionChores(
  sectionKey: "today" | "yesterday" | "tomorrow" | "big",
  chores: ChoreWithComputed[],
  sessionUserId: string | null,
  resolveAssigneeId: (choreId: string) => string | null,
  customIcons: CustomIconOption[],
) {
  return [...chores].sort((a, b) => {
    const aIsSkipped = !!a.lastRecordSkipped && a.doneToday;
    const bIsSkipped = !!b.lastRecordSkipped && b.doneToday;
    if (a.id === b.id) {
      const doneFirstRank = (done: boolean, skipped: boolean) => {
        if (!done) return 2;
        return skipped ? 1 : 0;
      };
      const sameIdRankDiff =
        doneFirstRank(a.doneToday, aIsSkipped) - doneFirstRank(b.doneToday, bIsSkipped);
      if (sameIdRankDiff !== 0) return sameIdRankDiff;
    }

    // doneState: 0=not done, 1=done, 2=skipped
    const getDoneState = (done: boolean, skipped: boolean) => {
      if (sectionKey === "tomorrow") return 0; // Tomorrow section doesn't show done state sorting in the same way usually
      if (!done) return 0;
      return skipped ? 2 : 1;
    };

    const aState = getDoneState(a.doneToday, aIsSkipped);
    const bState = getDoneState(b.doneToday, bIsSkipped);

    // 1. Sort by done state (Not Done -> Done -> Skipped)
    if (aState !== bState) return aState - bState;

    // 2. assignee priority: self > partner > none
    const aAssignee = resolveAssigneeId(a.id);
    const bAssignee = resolveAssigneeId(b.id);
    const aPri = assigneePriority(aAssignee, sessionUserId);
    const bPri = assigneePriority(bAssignee, sessionUserId);
    if (aPri !== bPri) return aPri - bPri;

    // 3. icon label order
    const getLabel = (c: ChoreWithComputed) => {
      const custom = customIcons.find(
        (ci) =>
          ci.icon === c.icon && ci.iconColor === c.iconColor && ci.bgColor === c.bgColor,
      );
      if (custom) return custom.label;
      const preset = QUICK_ICON_PRESETS.find(
        (pi) =>
          pi.icon === c.icon && pi.iconColor === c.iconColor && pi.bgColor === c.bgColor,
      );
      if (preset) return preset.label;
      return c.icon;
    };
    const labelA = getLabel(a);
    const labelB = getLabel(b);
    const labelDiff = JA_COLLATOR.compare(labelA, labelB);
    if (labelDiff !== 0) return labelDiff;

    // 4. kama order (50-on)
    const titleDiff = a.title.localeCompare(b.title, "ja");
    if (titleDiff !== 0) return titleDiff;

    // 5. ID fallback for stability
    return a.id.localeCompare(b.id);
  });
}

function removeChoreFromBootstrap(
  previous: BootstrapResponse | null,
  choreId: string,
): BootstrapResponse | null {
  if (!previous || previous.needsRegistration) return previous;

  const nextChores = previous.chores.filter((chore) => chore.id !== choreId);
  if (nextChores.length === previous.chores.length) return previous;

  const split = splitComputedChoresForHome(nextChores);
  return {
    ...previous,
    chores: nextChores,
    todayChores: split.todayChores,
    tomorrowChores: split.tomorrowChores,
    upcomingBigChores: split.upcomingBigChores,
  };
}

function restoreChoreToBootstrap(
  previous: BootstrapResponse | null,
  chore: ChoreWithComputed,
): BootstrapResponse | null {
  if (!previous || previous.needsRegistration) return previous;
  if (previous.chores.some((item) => item.id === chore.id)) return previous;

  const nextChores = [...previous.chores, chore];
  const split = splitComputedChoresForHome(nextChores);
  return {
    ...previous,
    chores: nextChores,
    todayChores: split.todayChores,
    tomorrowChores: split.tomorrowChores,
    upcomingBigChores: split.upcomingBigChores,
  };
}

function mergeAssignments(
  previous: ChoreAssignmentEntry[],
  additions: ChoreAssignmentEntry[],
): ChoreAssignmentEntry[] {
  if (additions.length === 0) return previous;

  const existing = new Set(previous.map((entry) => `${entry.choreId}:${entry.userId}:${entry.date}`));
  const merged = [...previous];
  for (const entry of additions) {
    const key = `${entry.choreId}:${entry.userId}:${entry.date}`;
    if (existing.has(key)) continue;
    existing.add(key);
    merged.push(entry);
  }
  return merged;
}

function buildHomeDateKeys(now = new Date()) {
  const base = startOfJstDay(now);
  const today = toJstDateKey(base);
  const yesterday = toJstDateKey(addDays(base, -1));
  const tomorrow = toJstDateKey(addDays(base, 1));
  return { today, yesterday, tomorrow };
}

function sameHomeOrderByDate(a: HomeOrderByDate, b: HomeOrderByDate) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const left = a[key] ?? [];
    const right = b[key] ?? [];
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
  }
  return true;
}

export function KajiApp() {
  const [boot, setBoot] = useState<BootstrapResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriodKey>("week");
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsAnimationSeed, setStatsAnimationSeed] = useState(0);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>(() =>
    defaultCustomDateRange(),
  );
  const customDateRangeRef = useRef<CustomDateRange>(customDateRange);
  const statsRequestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [taskBanner, setTaskBanner] = useState<{ message: string; tone: "green" | "blue" } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "home";
    const storedTab = window.sessionStorage.getItem(APP_UPDATE_TARGET_TAB_STORAGE_KEY);
    if (storedTab && TAB_ORDER.includes(storedTab as TabKey)) {
      window.sessionStorage.removeItem(APP_UPDATE_TARGET_TAB_STORAGE_KEY);
      return storedTab as TabKey;
    }
    return "home";
  });

  const [records, setRecords] = useState<ChoreRecordItem[]>([]);
  const [householdReport, setHouseholdReport] = useState<HouseholdReportResponse | null>(null);
  const [myReport, setMyReport] = useState<MyStatsResponse | null>(null);
  const [myReportPreviousTotal, setMyReportPreviousTotal] = useState<number | null>(null);
  const [reportMonthOffset, setReportMonthOffset] = useState<(typeof REPORT_MONTH_OFFSETS)[number]>(0);
  const [reportLoading, setReportLoading] = useState(false);
  const [myReportLoading, setMyReportLoading] = useState(false);
  const [settingsView, setSettingsView] = useState<SettingsViewKey>("menu");
  const [pushGuidePlatform, setPushGuidePlatform] = useState<PushGuidePlatform>("android");
  const [standaloneScreen, setStandaloneScreen] = useState<StandaloneScreenKey | null>(null);
  const [standaloneOrigin, setStandaloneOrigin] = useState<StandaloneOriginKey>("settings");
  const [sleepModeEnabled, setSleepModeEnabled] = useState(false);
  const [sleepModeStart, setSleepModeStart] = useState("22:00");
  const [sleepModeEnd, setSleepModeEnd] = useState("07:00");
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [calendarWeekStart, setCalendarWeekStart] = useState<Date>(() =>
    startOfJstWeekMonday(startOfJstDay(new Date())),
  );
  const [calendarMonthCursor, setCalendarMonthCursor] = useState<Date>(() =>
    startOfJstDay(new Date()),
  );
  const [calendarMonthSummary, setCalendarMonthSummary] = useState<CalendarMonthSummaryResponse | null>(null);
  const [calendarSelectedDateKey, setCalendarSelectedDateKey] = useState<string>(() =>
    toJstDateKey(startOfJstDay(new Date())),
  );
  const [rescheduleTarget, setRescheduleTarget] = useState<ChoreWithComputed | null>(null);
  const [rescheduleChoice, setRescheduleChoice] = useState<RescheduleChoice>("tomorrow");
  const [rescheduleBaseDateKey, setRescheduleBaseDateKey] = useState<string>(() =>
    toJstDateKey(startOfJstDay(new Date())),
  );
  const [rescheduleCustomDate, setRescheduleCustomDate] = useState<string>(() =>
    toJstDateKey(addDays(startOfJstDay(new Date()), 1)),
  );
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [pendingRescheduleConfirm, setPendingRescheduleConfirm] = useState<PendingRescheduleConfirm | null>(null);
  const [pendingMergeDuplicateConfirm, setPendingMergeDuplicateConfirm] =
    useState<PendingMergeDuplicateConfirm | null>(null);
  const [rescheduleConfirmLoading, setRescheduleConfirmLoading] = useState(false);
  const [draggingChore, setDraggingChore] = useState<ChoreWithComputed | null>(null);
  const [dragSourceDateKey, setDragSourceDateKey] = useState<string | null>(null);
  const [dragTargetDateKey, setDragTargetDateKey] = useState<string | null>(null);
  const [homeDropTarget, setHomeDropTarget] = useState<HomeDropInsert | null>(null);
  const [touchDragging, setTouchDragging] = useState(false);
  const [touchDragPos, setTouchDragPos] = useState({ x: 0, y: 0 });
  const touchDragInfoRef = useRef<{
    active: boolean;
    chore: ChoreWithComputed;
    sourceDateKey: string;
    startX: number;
    startY: number;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressChipClickRef = useRef(false);
  const dragNavTimerRef = useRef<number | null>(null);
  const dragNavHoveringRef = useRef<string | null>(null);
  const dragScrollRafRef = useRef<number | null>(null);
  const dragScrollSpeedRef = useRef<number>(0);
  const calendarWeekStartRef = useRef<Date>(new Date());
  const calendarMonthKeyRef = useRef<string>(toMonthKey(startOfJstDay(new Date())));
  const calendarSummaryEnabledRef = useRef(false);
  const calendarSwipeStartXRef = useRef<number | null>(null);
  const calendarSwipeStartYRef = useRef<number | null>(null);
  const dropDraggedChoreToDateRef = useRef<
    (targetDateKey: string, options?: { homeDropInsert?: HomeDropInsert }) => Promise<void>
  >(async () => { });
  const handleHomeDropRef = useRef<(drop: HomeDropInsert) => void>(() => { });
  const homeSectionChoreIdsRef = useRef<Record<string, string[]>>({});
  const [homeOrderByDate, setHomeOrderByDate] = useState<HomeOrderByDate>({});
  const [reactionPickerRecordId, setReactionPickerRecordId] = useState<string | null>(null);

  const [registerName, setRegisterName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerInviteCode, setRegisterInviteCode] = useState("");
  const [registerColor, setRegisterColor] = useState(USER_COLOR_PALETTE[0]);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [postRegisterRoutingPending, setPostRegisterRoutingPending] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(ONBOARDING_PENDING_STORAGE_KEY) === "1";
  });
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [onboardingBulkSelectOpen, setOnboardingBulkSelectOpen] = useState(false);
  const [onboardingPresetSelections, setOnboardingPresetSelections] = useState<string[]>(
    ONBOARDING_PRESET_CHORES.map((preset) => preset.title),
  );

  const [choreEditorOpen, setChoreEditorOpen] = useState(false);
  const [customIconOpen, setCustomIconOpen] = useState(false);
  const [customIcons, setCustomIcons] = useState<CustomIconOption[]>([]);
  const [editingChore, setEditingChore] = useState<ChoreForm | null>(null);
  const [memoTarget, setMemoTarget] = useState<ChoreWithComputed | null>(null);
  const [memoBaseDateKey, setMemoBaseDateKey] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  const [pendingRecordDateChoice, setPendingRecordDateChoice] =
    useState<PendingRecordDateChoice | null>(null);
  const [memoFlowMode, setMemoFlowMode] = useState<MemoFlowMode>("default");
  const [memoQuickDateKey, setMemoQuickDateKey] = useState<string | null>(null);
  const [skipCountDialogOpen, setSkipCountDialogOpen] = useState(false);
  const [skipCountValue, setSkipCountValue] = useState(1);
  const [skipCountMax, setSkipCountMax] = useState(1);
  const [calendarBlankActionOpen, setCalendarBlankActionOpen] = useState(false);
  const [calendarBlankActionDateKey, setCalendarBlankActionDateKey] = useState<string | null>(null);
  const [calendarBlankActionMode, setCalendarBlankActionMode] = useState<CalendarBlankActionMode>("choice");
  const [pendingCalendarPlanDuplicateConfirm, setPendingCalendarPlanDuplicateConfirm] =
    useState<PendingCalendarPlanDuplicateConfirm | null>(null);
  const [undoConfirmTarget, setUndoConfirmTarget] = useState<ChoreWithComputed | null>(null);
  const [recordUpdatingIds, setRecordUpdatingIds] = useState<string[]>([]);
  const [reactionUpdatingId, setReactionUpdatingId] = useState<string | null>(null);
  const [manageDetailChoreId, setManageDetailChoreId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [pendingSwipeDeletes, setPendingSwipeDeletes] = useState<PendingSwipeDelete[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saveChoreLoading, setSaveChoreLoading] = useState(false);
  const [deleteChoreLoading, setDeleteChoreLoading] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(
    null,
  );
  const [reminderTimePickerOpen, setReminderTimePickerOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [appUpdateLoading, setAppUpdateLoading] = useState(false);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [appReloading, setAppReloading] = useState(false);
  const startupUpdateCheckedRef = useRef(false);
  const missionBannerReadyRef = useRef(false);
  const previousTodayMissionCompletedRef = useRef(false);

  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentMounted, setAssignmentMounted] = useState(false);
  const [assignmentSlideIn, setAssignmentSlideIn] = useState(false);
  const assignmentCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listDeleteSwipeActive, setListDeleteSwipeActive] = useState(false);
  const [balanceSwipeActive, setBalanceSwipeActive] = useState(false);
  const clearAssignmentCloseTimer = useCallback(() => {
    if (!assignmentCloseTimerRef.current) return;
    clearTimeout(assignmentCloseTimerRef.current);
    assignmentCloseTimerRef.current = null;
  }, []);
  useEffect(
    () => () => {
      clearAssignmentCloseTimer();
    },
    [clearAssignmentCloseTimer],
  );
  const closeAssignment = useCallback(() => {
    if (!assignmentOpen && !assignmentMounted) return;
    clearAssignmentCloseTimer();
    setAssignmentSlideIn(false);
    assignmentCloseTimerRef.current = setTimeout(() => {
      assignmentCloseTimerRef.current = null;
      setAssignmentMounted(false);
      setAssignmentOpen(false);
    }, ASSIGNMENT_SHEET_SLIDE_MS);
  }, [assignmentMounted, assignmentOpen, clearAssignmentCloseTimer]);
  const openSettings = useCallback(() => {
    setSettingsView("menu");
    setSettingsOpen(true);
  }, []);
  const openSettingsView = useCallback((view: SettingsViewKey) => {
    if (view !== "manage") {
      setManageDetailChoreId(null);
    }
    setSettingsView(view);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsView("menu");
    setSettingsOpen(false);
  }, []);
  const toggleSettingsFromHeader = useCallback(() => {
    closeAssignment();
    if (settingsOpen) {
      closeSettings();
      return;
    }
    openSettings();
  }, [closeAssignment, closeSettings, openSettings, settingsOpen]);
  const openStandaloneScreen = useCallback(
    (screen: StandaloneScreenKey, origin: StandaloneOriginKey = "settings") => {
      if (screen === "manage") {
        setManageDetailChoreId(null);
      }
      setStandaloneOrigin(origin);
      setSettingsOpen(false);
      setSettingsView(screen);
      setStandaloneScreen(screen);
    },
    [],
  );
  const closeStandaloneScreen = useCallback(() => {
    setStandaloneScreen(null);
    setStandaloneOrigin("settings");
  }, []);
  const returnFromStandaloneScreen = useCallback(() => {
    const origin = standaloneOrigin;
    closeStandaloneScreen();
    if (origin === "settings") {
      setSettingsView("menu");
      setSettingsOpen(true);
      return;
    }
    if (origin === "list") {
      setActiveTab("list");
      return;
    }
    if (origin === "records") {
      setActiveTab("records");
      return;
    }
    setActiveTab("stats");
  }, [closeStandaloneScreen, standaloneOrigin]);
  const swipe = useSwipeTab({
    tabs: TAB_ORDER,
    activeTab,
    onChangeTab: (tab) => { closeAssignment(); closeSettings(); setActiveTab(tab); if (tab === "home") setRefreshAnimationSeed((p) => p + 1); },
    disabled: assignmentOpen || settingsOpen || standaloneScreen !== null || listDeleteSwipeActive || balanceSwipeActive || !!draggingChore,
    threshold: 78,
    dominanceRatio: 1.4,
    lockDistance: 14,
    minFlickVelocity: 0.95,
    minFlickDistance: 42,
    transitionDurationMs: 220,
    requireDirectionalHalfStart: true,
    centerDeadZoneRatio: 0,
  });
  const handleListDeleteSwipeActiveChange = useCallback((active: boolean) => {
    setListDeleteSwipeActive(active);
    if (active) {
      swipe.onTouchCancel();
    }
  }, [swipe]);
  const assignmentEdgeSwipe = useEdgeSwipeBack({
    onBack: closeAssignment,
    enabled: assignmentOpen,
    edgeWidth: Number.POSITIVE_INFINITY,
    threshold: 80,
  });
  const [assignmentUser, setAssignmentUser] = useState<string | null>(null);
  const [assignmentTab, setAssignmentTab] = useState<AssignmentTabKey>("daily");
  const assignmentTabSwipe = useSwipeTab<AssignmentTabKey>({
    tabs: ASSIGNMENT_TAB_ORDER,
    activeTab: assignmentTab,
    onChangeTab: setAssignmentTab,
    threshold: 56,
    dominanceRatio: 1.15,
    lockDistance: 12,
    transitionDurationMs: 220,
  });
  const assignmentTabSwipeActiveRef = useRef(false);
  const assignmentBackSwipeActiveRef = useRef(false);
  const [assignments, setAssignments] = useState<ChoreAssignmentEntry[]>([]);
  const [clearedDefaults, setClearedDefaults] = useState<Set<string>>(new Set());
  const [visibleAssignDays, setVisibleAssignDays] = useState(14);
  const [, startTransition] = useTransition();
  const assignSentinelRef = useRef<HTMLDivElement | null>(null);
  const [listSortKey, setListSortKey] = useState<ListSortKey>("icon");
  const [listSortOpen, setListSortOpen] = useState(true);
  const [homeHeaderHeight, setHomeHeaderHeight] = useState(HOME_SECTION_STICKY_FALLBACK_TOP);
  const homeHeaderRef = useRef<HTMLDivElement | null>(null);
  const listHeaderRef = useRef<HTMLDivElement | null>(null);
  const recordsHeaderRef = useRef<HTMLDivElement | null>(null);
  const statsHeaderRef = useRef<HTMLDivElement | null>(null);
  const settingsHeaderRef = useRef<HTMLDivElement | null>(null);
  const [listHeaderHeight, setListHeaderHeight] = useState(TAB_HEADER_HEIGHT_FALLBACK);
  const [recordsHeaderHeight, setRecordsHeaderHeight] = useState(TAB_HEADER_HEIGHT_FALLBACK);
  const [statsHeaderHeight, setStatsHeaderHeight] = useState(TAB_HEADER_HEIGHT_FALLBACK);
  const [settingsHeaderHeight, setSettingsHeaderHeight] = useState(TAB_HEADER_HEIGHT_FALLBACK);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const sectionTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const sectionSwipeSuppressedRef = useRef(false);
  const pullStartYRef = useRef(0);
  const pullStartXRef = useRef(0);
  const pullStartScrollTopRef = useRef(0);
  const pullEligibleRef = useRef(false);
  const pullDraggingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullDragging, setPullDragging] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [refreshAnimationSeed, setRefreshAnimationSeed] = useState(0);

  const sessionUser = boot?.sessionUser ?? null;
  const chores = boot?.chores ?? [];
  const calendarQuickRecordChores = useMemo(
    () =>
      [...chores]
        .filter((chore) => !chore.archived)
        .sort((left, right) => {
          const titleDiff = JA_COLLATOR.compare(left.title, right.title);
          if (titleDiff !== 0) return titleDiff;
          return JA_COLLATOR.compare(left.id, right.id);
        }),
    [chores],
  );
  const homeDateKeys = buildHomeDateKeys();
  const homeSectionDateKeySet = useMemo(
    () => new Set([homeDateKeys.yesterday, homeDateKeys.today, homeDateKeys.tomorrow]),
    [homeDateKeys.today, homeDateKeys.tomorrow, homeDateKeys.yesterday],
  );
  const homeOrderSanitizeOptions = useMemo(
    () => ({
      todayDateKey: homeDateKeys.today,
      rollingWindowDays: HOME_ORDER_RETENTION_DAYS,
    }),
    [homeDateKeys.today],
  );
  const homeOrderStorageKey = useMemo(
    () => (sessionUser?.id ? `${HOME_ORDER_STORAGE_KEY_PREFIX}:${sessionUser.id}` : null),
    [sessionUser?.id],
  );

  useEffect(() => {
    if (!homeOrderStorageKey) {
      setHomeOrderByDate({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(homeOrderStorageKey);
      if (!raw) {
        setHomeOrderByDate({});
        return;
      }
      const parsed = JSON.parse(raw);
      setHomeOrderByDate(sanitizeHomeOrderByDate(parsed, homeOrderSanitizeOptions));
    } catch {
      setHomeOrderByDate({});
    }
  }, [homeOrderSanitizeOptions, homeOrderStorageKey]);

  useEffect(() => {
    setHomeOrderByDate((previous) => {
      const sanitized = sanitizeHomeOrderByDate(previous, homeOrderSanitizeOptions);
      return sameHomeOrderByDate(previous, sanitized) ? previous : sanitized;
    });
  }, [homeOrderSanitizeOptions]);

  useEffect(() => {
    if (!homeOrderStorageKey) return;
    const sanitized = sanitizeHomeOrderByDate(homeOrderByDate, homeOrderSanitizeOptions);
    try {
      if (Object.keys(sanitized).length === 0) {
        window.localStorage.removeItem(homeOrderStorageKey);
      } else {
        window.localStorage.setItem(homeOrderStorageKey, JSON.stringify(sanitized));
      }
    } catch {
      // ignore storage errors (private mode / quota)
    }
  }, [homeOrderByDate, homeOrderSanitizeOptions, homeOrderStorageKey]);

  useEffect(() => {
    const targetDateKeys = [homeDateKeys.yesterday, homeDateKeys.today, homeDateKeys.tomorrow];
    const sectionIdsByDate = homeSectionChoreIdsRef.current;
    setHomeOrderByDate((previous) => {
      const next: HomeOrderByDate = { ...previous };

      targetDateKeys.forEach((dateKey) => {
        const baseIds = sectionIdsByDate[dateKey] ?? [];
        if (baseIds.length === 0) {
          delete next[dateKey];
          return;
        }

        const storedIds = previous[dateKey] ?? [];
        const orderedIds = applyHomeStoredOrder(baseIds, storedIds);
        if (orderedIds.length === 0) {
          delete next[dateKey];
        } else {
          next[dateKey] = orderedIds;
        }
      });

      const sanitized = sanitizeHomeOrderByDate(next, homeOrderSanitizeOptions);
      return sameHomeOrderByDate(previous, sanitized) ? previous : sanitized;
    });
  }, [homeOrderSanitizeOptions, boot, homeDateKeys.yesterday, homeDateKeys.today, homeDateKeys.tomorrow]);

  useEffect(() => {
    if (!manageDetailChoreId) return;
    if (chores.some((chore) => chore.id === manageDetailChoreId)) return;
    setManageDetailChoreId(null);
  }, [chores, manageDetailChoreId]);
  const todayMissionCompletedForBanner = useMemo(() => {
    if (!boot || boot.needsRegistration) return false;
    if (!boot.todayChores || boot.todayChores.length === 0) return false;
    return boot.todayChores.every((chore) => chore.doneToday);
  }, [boot]);

  const showTaskBanner = useCallback((message: string, tone: "green" | "blue" = "green") => {
    setTaskBanner({ message, tone });
  }, []);

  useEffect(() => {
    if (!taskBanner) return;
    const timer = window.setTimeout(() => {
      setTaskBanner(null);
    }, 2600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [taskBanner]);

  useEffect(() => {
    if (!boot || boot.needsRegistration || !sessionUser || onboardingOpen) {
      missionBannerReadyRef.current = false;
      previousTodayMissionCompletedRef.current = false;
      return;
    }
    if (!missionBannerReadyRef.current) {
      missionBannerReadyRef.current = true;
      previousTodayMissionCompletedRef.current = todayMissionCompletedForBanner;
      return;
    }
    if (todayMissionCompletedForBanner && !previousTodayMissionCompletedRef.current) {
      showTaskBanner("🎉 きょうのにんむ ぜんぶおわり！おつかれさま！", "green");
    }
    previousTodayMissionCompletedRef.current = todayMissionCompletedForBanner;
  }, [boot, onboardingOpen, sessionUser, showTaskBanner, todayMissionCompletedForBanner]);

  const listChores = useMemo(() => {
    const now = startOfJstDay(new Date());
    const daysUntil = (c: ChoreWithComputed) => {
      if (!c.dueAt) return 999;
      const due = startOfJstDay(new Date(c.dueAt));
      return Math.floor((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    };
    const arr = [...chores];
    switch (listSortKey) {
      case "kana":
        arr.sort((a, b) => JA_COLLATOR.compare(a.title, b.title));
        break;

      case "due":
        arr.sort((a, b) => daysUntil(a) - daysUntil(b));
        break;

      case "icon":
        arr.sort((a, b) => {
          const getLabel = (c: ChoreWithComputed) => {
            const custom = customIcons.find(
              (ci) =>
                ci.icon === c.icon && ci.iconColor === c.iconColor && ci.bgColor === c.bgColor,
            );
            if (custom) return custom.label;
            const preset = QUICK_ICON_PRESETS.find(
              (pi) =>
                pi.icon === c.icon && pi.iconColor === c.iconColor && pi.bgColor === c.bgColor,
            );
            if (preset) return preset.label;
            return c.icon;
          };

          const labelA = getLabel(a);
          const labelB = getLabel(b);
          const diff = JA_COLLATOR.compare(labelA, labelB);
          if (diff !== 0) return diff;

          return JA_COLLATOR.compare(a.title, b.title);
        });
        break;
    }
    return arr;
  }, [chores, listSortKey, customIcons]);
  const priorityHomeChoreIds = useMemo(
    () => new Set([...(boot?.todayChores ?? []), ...(boot?.tomorrowChores ?? [])].map((chore) => chore.id)),
    [boot?.todayChores, boot?.tomorrowChores],
  );

  const scheduleOverrides = boot?.scheduleOverrides ?? [];
  const scheduleOverridesByChore = useMemo(() => {
    const map = new Map<string, ChoreScheduleOverride[]>();
    for (const override of scheduleOverrides) {
      const list = map.get(override.choreId) ?? [];
      list.push(override);
      map.set(override.choreId, list);
    }
    return map;
  }, [scheduleOverrides]);

  const countScheduledOccurrencesOnDate = useCallback((choreId: string, dateKey: string) => {
    const chore = chores.find((item) => item.id === choreId);
    if (!chore) return 0;

    const overrideList = scheduleOverridesByChore.get(choreId) ?? [];
    if (overrideList.length > 0) {
      return overrideList.filter((override) => override.date === dateKey).length;
    }

    const targetDate = startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`));
    if (Number.isNaN(targetDate.getTime())) return 0;
    return isScheduledOnDate(chore, targetDate) ? Math.max(1, chore.dailyTargetCount) : 0;
  }, [chores, scheduleOverridesByChore]);

  const assignmentDaysByTab = useMemo(() => {
    const today = startOfJstDay(new Date());
    const todayKey = toJstDateKey(today);
    const days = Array.from({ length: 365 }, (_, i) => {
      const d = addDays(today, i);
      return { date: d, key: toJstDateKey(d) };
    });
    const mapDays = (filtered: typeof chores, mergeOverdueToToday: boolean) =>
      days
        .map(({ date, key: dateKey }) => {
          const scheduled = filtered.filter((c) => countScheduledOccurrencesOnDate(c.id, dateKey) > 0);
          // 今日の日付なら期限超過タスクもまとめて含める
          if (mergeOverdueToToday && dateKey === todayKey) {
            const overdueChores = filtered.filter((c) => c.isOverdue && !scheduled.some((s) => s.id === c.id));
            const dayChores = [...scheduled, ...overdueChores];
            if (dayChores.length === 0) return null;
            return { date, dateKey, dayChores };
          }
          if (scheduled.length === 0) return null;
          return { date, dateKey, dayChores: scheduled };
        })
        .filter(Boolean) as Array<{ date: Date; dateKey: string; dayChores: typeof chores }>;

    const dailyFiltered = chores.filter((c) => !c.isBigTask);
    const bigFiltered = chores.filter((c) => c.isBigTask);

    return {
      daily: mapDays(dailyFiltered, true),
      big: mapDays(bigFiltered, true),
    };
  }, [chores, priorityHomeChoreIds, countScheduledOccurrencesOnDate]);

  useEffect(() => {
    customDateRangeRef.current = customDateRange;
  }, [customDateRange]);

  const hasDuplicateScheduleCollision = useCallback((
    choreId: string,
    sourceDateKey: string,
    targetDateKey: string,
  ) => {
    if (sourceDateKey === targetDateKey) return false;
    return countScheduledOccurrencesOnDate(choreId, targetDateKey) > 0;
  }, [countScheduledOccurrencesOnDate]);

  const manageDetailTarget = useMemo(() => {
    if (!manageDetailChoreId) return null;
    return chores.find((chore) => chore.id === manageDetailChoreId) ?? null;
  }, [chores, manageDetailChoreId]);

  const manageUpcomingDateKeys = useMemo(() => {
    if (!manageDetailTarget) return [];

    const today = startOfJstDay(new Date());
    const todayKey = toJstDateKey(today);
    const overrideDateKeys = (scheduleOverridesByChore.get(manageDetailTarget.id) ?? [])
      .map((override) => override.date)
      .filter((dateKey) => dateKey >= todayKey)
      .sort((a, b) => a.localeCompare(b));

    if (overrideDateKeys.length > 0) {
      return overrideDateKeys.slice(0, 5);
    }

    const intervalDays = Math.max(1, manageDetailTarget.intervalDays);
    let cursor = manageDetailTarget.dueAt
      ? startOfJstDay(new Date(manageDetailTarget.dueAt))
      : null;

    if (!cursor || Number.isNaN(cursor.getTime())) return [];

    while (cursor.getTime() < today.getTime()) {
      cursor = addDays(cursor, intervalDays);
    }

    const items: string[] = [];
    let guard = 0;
    while (items.length < 5 && guard < 400) {
      items.push(toJstDateKey(cursor));
      cursor = addDays(cursor, intervalDays);
      guard += 1;
    }
    return items;
  }, [manageDetailTarget, scheduleOverridesByChore]);

  const calendarWindowStart = useMemo(
    () => startOfJstWeekMonday(addDays(calendarMonthCursor, -31)),
    [calendarMonthCursor],
  );
  const calendarWindowEnd = useMemo(
    () => addDays(calendarWindowStart, 130),
    [calendarWindowStart],
  );
  const calendarMonthKey = useMemo(
    () => toMonthKey(calendarMonthCursor),
    [calendarMonthCursor],
  );
  const calendarScheduleMap = useMemo(() => {
    const map = new Map<string, ChoreWithComputed[]>();
    const addToMap = (dateKey: string, chore: ChoreWithComputed) => {
      const current = map.get(dateKey) ?? [];
      current.push(chore);
      map.set(dateKey, current);
    };

    chores.forEach((chore) => {
      // Show the latest completed day on calendar as completed (initial seed records are excluded).
      if (chore.lastPerformedAt && !chore.lastRecordSkipped && !chore.lastRecordIsInitial) {
        const performedDateKey = toJstDateKey(startOfJstDay(new Date(chore.lastPerformedAt)));
        if (
          performedDateKey >= toJstDateKey(calendarWindowStart) &&
          performedDateKey <= toJstDateKey(calendarWindowEnd)
        ) {
          addToMap(performedDateKey, chore);
        }
      }

      const overrideList = (scheduleOverridesByChore.get(chore.id) ?? []).filter((override) => {
        if (override.date < toJstDateKey(calendarWindowStart)) return false;
        if (override.date > toJstDateKey(calendarWindowEnd)) return false;
        return true;
      });

      if (overrideList.length > 0) {
        const overrideDateCounts = new Map<string, number>();
        overrideList.forEach((ov) => {
          overrideDateCounts.set(ov.date, (overrideDateCounts.get(ov.date) ?? 0) + 1);
        });
        overrideDateCounts.forEach((count, dKey) => {
          for (let i = 0; i < count; i += 1) addToMap(dKey, chore);
        });
        return;
      }

      for (let day = calendarWindowStart; day <= calendarWindowEnd; day = addDays(day, 1)) {
        const dKey = toJstDateKey(day);
        if (!isScheduledOnDate(chore, day)) continue;
        const occurrenceCount = Math.max(1, chore.dailyTargetCount);
        for (let i = 0; i < occurrenceCount; i += 1) {
          addToMap(dKey, chore);
        }
      }
    });

    map.forEach((items) => {
      items.sort((a, b) => {
        const titleDiff = JA_COLLATOR.compare(a.title, b.title);
        if (titleDiff !== 0) return titleDiff;
        return JA_COLLATOR.compare(a.id, b.id);
      });
    });
    return map;
  }, [calendarWindowEnd, calendarWindowStart, chores, scheduleOverridesByChore]);

  const calendarMonthGridDates = useMemo(() => {
    const monthStart = startOfJstDay(new Date(calendarMonthCursor));
    const firstOfMonth = startOfJstDay(new Date(
      `${toJstDateKey(monthStart).slice(0, 8)}01T00:00:00+09:00`,
    ));
    const gridStart = startOfJstWeekMonday(firstOfMonth);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [calendarMonthCursor]);

  const calendarSelectedWeekDates = useMemo(
    () => Array.from({ length: CALENDAR_WEEK_DAYS }, (_, index) => addDays(calendarWeekStart, index)),
    [calendarWeekStart],
  );

  const loadBootstrap = useCallback(async () => {
    const data = await apiFetch<BootstrapResponse>("/api/bootstrap", { cache: "no-store" });
    setBoot(data);
    setAssignments(data.assignments ?? []);
    setNotificationSettings(data.notificationSettings);
    setCustomIcons(data.customIcons ?? []);
    return data;
  }, []);

  const loadCalendarMonthSummary = useCallback(async (month: string) => {
    const data = await apiFetch<CalendarMonthSummaryResponse>(
      `/api/calendar-month-summary?month=${encodeURIComponent(month)}`,
      { cache: "no-store" },
    );
    setCalendarMonthSummary(data);
    return data;
  }, []);

  const loadHouseholdReport = useCallback(async (offset: (typeof REPORT_MONTH_OFFSETS)[number]) => {
    const currentMonth = toMonthKey(new Date());
    const month = monthKeyWithOffset(currentMonth, offset);
    setReportLoading(true);
    try {
      const data = await apiFetch<HouseholdReportResponse>(
        `/api/household-report?month=${encodeURIComponent(month)}`,
        { cache: "no-store" },
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

  const loadStats = useCallback(async (period: StatsPeriodKey, options?: StatsQueryOptions) => {
    setStatsPeriod(period);
    setStatsLoading(true);
    try {
      await Promise.all([
        loadHouseholdReport(reportMonthOffset),
        loadMyReport(reportMonthOffset),
      ]);
      setStats(null);
      setStatsAnimationSeed((prev) => prev + 1);
    } finally {
      setStatsLoading(false);
    }
  }, [loadHouseholdReport, loadMyReport, reportMonthOffset]);

  const loadHistory = useCallback(async () => {
    const data = await apiFetch<{ records: ChoreRecordItem[] }>("/api/records");
    setRecords(data.records);
  }, []);

  const refreshAll = useCallback(
    async (period: StatsPeriodKey) => {
      const data = await loadBootstrap();
      if (data.needsRegistration || !data.sessionUser) {
        setStats(null);
        setStatsLoading(false);
        setRecords([]);
        setCalendarMonthSummary(null);
        return data;
      }
      await Promise.all([
        loadStats(period),
        loadHistory(),
        loadCalendarMonthSummary(calendarMonthKeyRef.current),
      ]);
      return data;
    },
    [loadBootstrap, loadCalendarMonthSummary, loadHistory, loadStats],
  );

  // ── Real-time sync polling ──────────────────────────────────
  const syncTokenRef = useRef<string | null>(null);
  const syncPollingRef = useRef(false);
  const syncRefreshingRef = useRef(false);
  const statsPeriodRef = useRef(statsPeriod);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { statsPeriodRef.current = statsPeriod; }, [statsPeriod]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => {
    if (activeTab === "records" && sessionUser) {
      void loadHistory();
    }
  }, [activeTab, sessionUser, loadHistory]);

  const syncCheck = useCallback(async () => {
    if (!boot || boot.needsRegistration || !sessionUser) return;

    // Don't start another poll while one is in-flight
    if (syncPollingRef.current) return;
    syncPollingRef.current = true;

    try {
      const res = await fetch("/api/sync", { cache: "no-store" });
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string | null };
      if (!token) return;

      // First call: just store the token
      if (syncTokenRef.current === null) {
        syncTokenRef.current = token;
        return;
      }

      // No change
      if (token === syncTokenRef.current) return;

      // Change detected from another device — refresh data in parallel
      syncTokenRef.current = token;

      // Skip if a previous refresh is still running
      if (syncRefreshingRef.current) return;
      syncRefreshingRef.current = true;

      // Fire bootstrap (critical) plus stats/history (secondary) in parallel
      const refreshPromises: Promise<unknown>[] = [
        loadBootstrap(),
        loadCalendarMonthSummary(calendarMonthKeyRef.current).catch(() => { }),
      ];
      // Only refresh stats/history when user is on those tabs
      const tab = activeTabRef.current;
      if (tab === "stats") {
        refreshPromises.push(loadStats(statsPeriodRef.current).catch(() => { }));
      }
      if (tab === "stats" || tab === "home" || tab === "records") {
        refreshPromises.push(loadHistory().catch(() => { }));
      }
      // Don't await — let polling continue while refresh runs in background
      Promise.all(refreshPromises).finally(() => {
        syncRefreshingRef.current = false;
      });
    } catch {
      // Silently ignore network errors during polling
    } finally {
      syncPollingRef.current = false;
    }
  }, [boot, loadBootstrap, loadCalendarMonthSummary, loadHistory, loadStats, sessionUser]);

  useEffect(() => {
    if (!boot || boot.needsRegistration || !sessionUser) return;

    const SYNC_INTERVAL_MS = 1_000;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(syncCheck, SYNC_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Immediately check on return, then resume periodic polling
        syncCheck();
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [boot, sessionUser, syncCheck]);
  // ── End real-time sync ─────────────────────────────────────

  const reloadAppForLatestUpdate = useCallback((options?: { showNotice?: boolean; targetTab?: TabKey }) => {
    if (typeof window === "undefined") return;
    if (options?.showNotice) {
      window.sessionStorage.setItem(APP_UPDATE_NOTICE_STORAGE_KEY, "1");
    }
    if (options?.targetTab) {
      window.sessionStorage.setItem(APP_UPDATE_TARGET_TAB_STORAGE_KEY, options.targetTab);
    }
    setAppReloading(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          window.location.reload();
        }, 120);
      });
    });
  }, []);

  const checkForServiceWorkerUpdate = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return false;

    const registration =
      (await navigator.serviceWorker.getRegistration()) ??
      (await navigator.serviceWorker.register("/sw.js"));

    if (registration.waiting || registration.installing) {
      return true;
    }

    const updateDetected = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        registration.removeEventListener("updatefound", onUpdateFound);
        window.clearTimeout(timeoutId);
        resolve(value);
      };
      const onUpdateFound = () => {
        finish(true);
      };
      const timeoutId = window.setTimeout(() => finish(false), 1200);
      registration.addEventListener("updatefound", onUpdateFound);
      registration.update().catch(() => finish(false));
    });

    return updateDetected || Boolean(registration.waiting || registration.installing);
  }, []);

  const handleManualAppUpdate = useCallback(() => {
    if (appUpdateLoading) return;

    void (async () => {
      try {
        setAppUpdateLoading(true);
        setError("");
        setInfoMessage("");

        // waiting 状態の SW があれば activate させる
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
        }

        // 常にリロードして最新のアプリコードを取得する
        reloadAppForLatestUpdate({ showNotice: true, targetTab: "home" });
      } catch (err: unknown) {
        setError((err as Error).message ?? "最新化に失敗しました。");
        setAppUpdateLoading(false);
      }
    })();
  }, [appUpdateLoading, reloadAppForLatestUpdate]);

  useEffect(() => {
    (async () => {
      try {
        await refreshAll("week");
      } catch (e: unknown) {
        setError((e as Error).message ?? "読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshAll]);

  useEffect(() => {
    if (!boot || boot.needsRegistration || !sessionUser) return;
    void (async () => {
      try {
        await Promise.all([
          loadHouseholdReport(reportMonthOffset),
          loadMyReport(reportMonthOffset),
        ]);
      } catch (err: unknown) {
        setError((err as Error).message ?? "レポートの取得に失敗しました。");
      }
    })();
  }, [boot, loadHouseholdReport, loadMyReport, reportMonthOffset, sessionUser]);

  useEffect(() => {
    const enabled = !!boot && !boot.needsRegistration && !!sessionUser;
    calendarSummaryEnabledRef.current = enabled;
    if (!enabled) {
      setCalendarMonthSummary(null);
    }
  }, [boot?.needsRegistration, sessionUser?.id]);

  useEffect(() => {
    if (!calendarSummaryEnabledRef.current) return;
    void loadCalendarMonthSummary(calendarMonthKey).catch((err: unknown) => {
      setError((err as Error).message ?? "カレンダー情報の取得に失敗しました。");
    });
  }, [calendarMonthKey, loadCalendarMonthSummary]);

  useEffect(() => {
    const selected = startOfJstDay(new Date(`${calendarSelectedDateKey}T00:00:00+09:00`));
    if (Number.isNaN(selected.getTime())) return;
    setCalendarWeekStart(startOfJstWeekMonday(selected));
  }, [calendarSelectedDateKey]);

  useEffect(() => {
    calendarWeekStartRef.current = calendarWeekStart;
  }, [calendarWeekStart]);

  useEffect(() => {
    calendarMonthKeyRef.current = calendarMonthKey;
  }, [calendarMonthKey]);

  useEffect(() => {
    if (activeTab !== "home" && activeTab !== "list") {
      // Cancel any in-flight drag state when leaving drag-capable tabs (M-2)
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      if (dragNavTimerRef.current) { clearTimeout(dragNavTimerRef.current); dragNavTimerRef.current = null; }
      touchDragInfoRef.current = null;
      setDraggingChore(null);
      setDragSourceDateKey(null);
      setDragTargetDateKey(null);
      setHomeDropTarget(null);
      setTouchDragging(false);
    }
  }, [activeTab]);

  const handleDeleteCustomIcon = useCallback((customIconId: string) => {
    setCustomIcons((prev) => prev.filter((icon) => icon.id !== customIconId));
    apiFetch(`/api/custom-icons/${customIconId}`, { method: "DELETE" }).catch((err: unknown) => {
      setError((err as Error).message ?? "カスタムアイコンの削除に失敗しました。");
      void loadBootstrap();
    });
  }, [loadBootstrap]);

  const handleAddCustomIcon = useCallback(async (icon: Omit<CustomIconOption, "id">) => {
    try {
      const result = await apiFetch<{ icon: CustomIconOption }>("/api/custom-icons", {
        method: "POST",
        body: JSON.stringify(icon),
      });
      setCustomIcons((prev) => [...prev, result.icon]);
      return result.icon;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(APP_UPDATE_NOTICE_STORAGE_KEY) !== "1") return;
    window.sessionStorage.removeItem(APP_UPDATE_NOTICE_STORAGE_KEY);
    setInfoMessage("あなたのアプリは最新です。");
  }, []);

  useEffect(() => {
    if (startupUpdateCheckedRef.current) return;
    startupUpdateCheckedRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const hasUpdate = await checkForServiceWorkerUpdate();
        if (!cancelled) {
          setAppUpdateAvailable(hasUpdate);
        }
      } catch {
        if (!cancelled) {
          setAppUpdateAvailable(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkForServiceWorkerUpdate]);

  useEffect(() => {
    if (!boot || boot.needsRegistration) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPushEnabled(Boolean(sub && Notification.permission === "granted"));
    })().catch(() => setPushEnabled(false));
  }, [boot]);

  useEffect(() => {
    const node = homeHeaderRef.current;
    if (!node) return;

    const updateHomeHeaderHeight = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      if (!Number.isFinite(next) || next <= 0) return;
      setHomeHeaderHeight((prev) => (prev === next ? prev : next));
    };

    updateHomeHeaderHeight();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateHomeHeaderHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, boot?.users.length]);

  useEffect(() => {
    const entries: Array<[React.RefObject<HTMLDivElement | null>, React.Dispatch<React.SetStateAction<number>>]> = [
      [listHeaderRef, setListHeaderHeight],
      [recordsHeaderRef, setRecordsHeaderHeight],
      [statsHeaderRef, setStatsHeaderHeight],
      [settingsHeaderRef, setSettingsHeaderHeight],
    ];
    const updateHeaderHeights = () => {
      for (const [ref, setter] of entries) {
        const el = ref.current;
        if (!el) continue;
        const h = Math.ceil(el.getBoundingClientRect().height);
        if (Number.isFinite(h) && h > 0) setter((prev) => (prev === h ? prev : h));
      }
    };

    updateHeaderHeights();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeaderHeights);
    for (const [ref] of entries) {
      if (ref.current) observer.observe(ref.current);
    }
    return () => observer.disconnect();
  }, [activeTab]);

  useEffect(() => {
    if (!assignmentOpen) return;
    pullEligibleRef.current = false;
    pullDraggingRef.current = false;
    setPullDragging(false);
    if (!pullRefreshing) {
      setPullDistance(0);
    }
  }, [assignmentOpen, pullRefreshing]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverscrollY = html.style.overscrollBehaviorY;
    const previousBodyOverscrollY = body.style.overscrollBehaviorY;
    const previousBodyOverflow = body.style.overflow;
    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";
    body.style.overflow = "hidden";
    return () => {
      html.style.overscrollBehaviorY = previousHtmlOverscrollY;
      body.style.overscrollBehaviorY = previousBodyOverscrollY;
      body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    const scroller = mainScrollRef.current;
    if (!scroller) return;

    const handleNativeTouchMove = (event: globalThis.TouchEvent) => {
      if (assignmentOpen || pullRefreshing) return;
      if (!pullEligibleRef.current) return;

      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - pullStartXRef.current;
      const dy = touch.clientY - pullStartYRef.current;
      const isMostlyVertical = Math.abs(dy) > Math.abs(dx) * 1.2;
      const canRefreshBySwipe =
        pullStartScrollTopRef.current <= 0 && scroller.scrollTop <= 0;

      if (dy > 0 && isMostlyVertical && canRefreshBySwipe) {
        event.preventDefault();
      }
    };

    scroller.addEventListener("touchmove", handleNativeTouchMove, {
      passive: false,
    });
    return () => {
      scroller.removeEventListener("touchmove", handleNativeTouchMove);
    };
  }, [assignmentOpen, pullRefreshing]);




  const setRecordUpdating = useCallback((choreId: string, isUpdating: boolean) => {
    setRecordUpdatingIds((prev) => {
      if (isUpdating) {
        return prev.includes(choreId) ? prev : [...prev, choreId];
      }
      return prev.filter((id) => id !== choreId);
    });
  }, []);

  const updateBootChoreOptimistically = useCallback(
    (choreId: string, updater: (chore: ChoreWithComputed) => ChoreWithComputed) => {
      setBoot((prev) => {
        if (!prev || prev.needsRegistration) return prev;
        const nextChores = prev.chores.map((chore) => (chore.id === choreId ? updater(chore) : chore));
        const split = splitComputedChoresForHome(nextChores);
        return {
          ...prev,
          chores: nextChores,
          todayChores: split.todayChores,
          tomorrowChores: split.tomorrowChores,
          upcomingBigChores: split.upcomingBigChores,
        };
      });
    },
    [],
  );

  const clearOnboardingPending = useCallback(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(ONBOARDING_PENDING_STORAGE_KEY);
  }, []);

  const registerUser = async (e: FormEvent) => {
    e.preventDefault();
    if (registerLoading) return;
    try {
      setRegisterLoading(true);
      setError("");
      const inviteCode = registerInviteCode.trim();
      const registerResponse = await apiFetch<{ isExistingUser?: boolean; onboardingRequired?: boolean }>("/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: registerName,
          password: registerPassword,
          color: registerColor,
          ...(inviteCode ? { inviteCode } : {}),
        }),
      });
      const shouldStartOnboarding =
        registerResponse?.onboardingRequired ??
        (!registerResponse?.isExistingUser && inviteCode.length === 0);
      if (typeof window !== "undefined") {
        if (shouldStartOnboarding) {
          window.sessionStorage.setItem(ONBOARDING_PENDING_STORAGE_KEY, "1");
        } else {
          window.sessionStorage.removeItem(ONBOARDING_PENDING_STORAGE_KEY);
        }
      }
      setPostRegisterRoutingPending(true);
      setOnboardingOpen(shouldStartOnboarding);
      if (shouldStartOnboarding) {
        setOnboardingBulkSelectOpen(false);
        setOnboardingPresetSelections(ONBOARDING_PRESET_CHORES.map((preset) => preset.title));
      } else {
        setOnboardingOpen(false);
        setActiveTab("home");
        setRefreshAnimationSeed((prev) => prev + 1);
      }
      await refreshAll("week");
    } catch (err: unknown) {
      setError((err as Error).message ?? "登録に失敗しました。");
    } finally {
      setPostRegisterRoutingPending(false);
      setRegisterLoading(false);
    }
  };

  const finishOnboarding = useCallback(() => {
    clearOnboardingPending();
    setOnboardingOpen(false);
    setOnboardingSubmitting(false);
    setOnboardingBulkSelectOpen(false);
    setOnboardingPresetSelections(ONBOARDING_PRESET_CHORES.map((preset) => preset.title));
    setActiveTab("home");
    setRefreshAnimationSeed((prev) => prev + 1);
  }, [clearOnboardingPending]);

  const handleOnboardingAddPreset = useCallback(async () => {
    if (onboardingSubmitting) return;
    const selectedPresets = ONBOARDING_PRESET_CHORES.filter((preset) =>
      onboardingPresetSelections.includes(preset.title),
    );
    if (selectedPresets.length === 0) {
      setError("少なくとも1つ選択してください。");
      return;
    }
    try {
      setOnboardingSubmitting(true);
      setError("");
      for (const preset of selectedPresets) {
        const lastPerformedAt = onboardingPresetLastPerformedAt(preset.intervalDays);
        await apiFetch("/api/chores", {
          method: "POST",
          body: JSON.stringify({
            title: preset.title,
            icon: preset.icon,
            iconColor: preset.iconColor,
            bgColor: preset.bgColor,
            intervalDays: preset.intervalDays,
            isBigTask: preset.isBigTask,
            lastPerformedAt,
          }),
        });
      }
      await refreshAll("week");
      setOnboardingBulkSelectOpen(false);
      setInfoMessage("家事をまとめて追加しました。");
    } catch (err: unknown) {
      setError((err as Error).message ?? "初期タスクの追加に失敗しました。");
    } finally {
      setOnboardingSubmitting(false);
    }
  }, [onboardingPresetSelections, onboardingSubmitting, refreshAll]);

  const openAddChore = () => {
    setEditingChore({
      title: "",
      intervalDays: 7,
      dailyTargetCount: 1,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#1A9BE8",
      bgColor: "#EAF5FF",
      lastPerformedAt: defaultLastPerformedAt(),
    });
    setChoreEditorOpen(true);
  };

  const openAddChoreForDate = (dateKey: string) => {
    const selectedDate = new Date(`${dateKey}T00:00:00+09:00`);
    const initialPerformedAt = Number.isNaN(selectedDate.getTime())
      ? defaultLastPerformedAt()
      : selectedDate.toISOString();
    closeSettings();
    closeStandaloneScreen();
    setEditingChore({
      title: "",
      intervalDays: 7,
      dailyTargetCount: 1,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#1A9BE8",
      bgColor: "#EAF5FF",
      lastPerformedAt: initialPerformedAt,
    });
    setChoreEditorOpen(true);
  };

  const closeCalendarBlankActionSheet = useCallback(() => {
    setCalendarBlankActionOpen(false);
    setCalendarBlankActionDateKey(null);
    setCalendarBlankActionMode("choice");
  }, []);

  const handleCalendarSurfaceTap = (event: MouseEvent<HTMLElement>, dateKey: string) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) return;
    setCalendarBlankActionDateKey(dateKey);
    setCalendarBlankActionMode("choice");
    setCalendarBlankActionOpen(true);
  };

  const openEditChore = (chore: ChoreWithComputed) => {
    setEditingChore({
      id: chore.id,
      title: chore.title,
      intervalDays: chore.intervalDays,
      dailyTargetCount: chore.dailyTargetCount,
      isBigTask: chore.isBigTask,
      icon: chore.icon,
      iconColor: chore.iconColor,
      bgColor: chore.bgColor,
      lastPerformedAt: chore.lastPerformedAt,
      defaultAssigneeId: chore.defaultAssigneeId,
    });
    setChoreEditorOpen(true);
  };

  const saveChore = async () => {
    if (!editingChore || saveChoreLoading || deleteChoreLoading) return;
    const editingChoreId = editingChore.id ?? null;
    setError("");
    if (!editingChore.lastPerformedAt) {
      setError("開始日は必須です。");
      return;
    }
    if (Number.isNaN(new Date(editingChore.lastPerformedAt).getTime())) {
      setError("開始日が不正です。");
      return;
    }

    const payload = {
      title: editingChore.title,
      intervalDays: Number(editingChore.intervalDays),
      dailyTargetCount: Number(editingChore.dailyTargetCount),
      isBigTask: editingChore.isBigTask,
      icon: editingChore.icon,
      iconColor: editingChore.iconColor,
      bgColor: editingChore.bgColor,
      lastPerformedAt: editingChore.lastPerformedAt ?? undefined,
      defaultAssigneeId: editingChore.defaultAssigneeId ?? undefined,
    };
    try {
      setSaveChoreLoading(true);
      if (editingChore.id) {
        await apiFetch(`/api/chores/${editingChore.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/chores", { method: "POST", body: JSON.stringify(payload) });
      }
      await refreshAll(statsPeriod);
      if (editingChoreId && manageDetailChoreId === editingChoreId) {
        setManageDetailChoreId(editingChoreId);
      }
      setDeleteConfirmOpen(false);
      setChoreEditorOpen(false);
    } catch (err: unknown) {
      const rawMessage = (err as Error).message ?? "家事の保存に失敗しました。";
      if (
        rawMessage.includes("DB_SCHEMA_MISSING") ||
        rawMessage.includes("db:init:current-env") ||
        rawMessage.includes("dailyTargetCount")
      ) {
        setError("1日回数を保存するためのDBスキーマが不足しています。npm run db:init:current-env 実行後に再試行してください。");
      } else {
        setError(rawMessage);
      }
    } finally {
      setSaveChoreLoading(false);
    }
  };

  const requestDeleteChore = () => {
    if (!editingChore?.id || saveChoreLoading || deleteChoreLoading) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteChore = async () => {
    if (!editingChore?.id || deleteChoreLoading || saveChoreLoading) return;
    const deletingChoreId = editingChore.id;
    try {
      setDeleteChoreLoading(true);
      await apiFetch(`/api/chores/${deletingChoreId}`, { method: "DELETE" });
      await refreshAll(statsPeriod);
      if (manageDetailChoreId === deletingChoreId) {
        setManageDetailChoreId(null);
      }
      setDeleteConfirmOpen(false);
      setChoreEditorOpen(false);
    } catch (err: unknown) {
      setError((err as Error).message ?? "家事の削除に失敗しました。");
    } finally {
      setDeleteChoreLoading(false);
    }
  };

  const restorePendingSwipeDelete = useCallback((pending: PendingSwipeDelete) => {
    setBoot((prev) => restoreChoreToBootstrap(prev, pending.chore));
    setAssignments((prev) => mergeAssignments(prev, pending.removedAssignments));
  }, []);

  const handleSwipeDeleteChore = useCallback(
    (chore: ChoreWithComputed) => {
      if (saveChoreLoading || deleteChoreLoading) return;

      setError("");
      const removedAssignments = assignments.filter((entry) => entry.choreId === chore.id);
      const toastId = `${chore.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setPendingSwipeDeletes((prev) => [{ toastId, chore, removedAssignments }, ...prev]);
      setBoot((prev) => removeChoreFromBootstrap(prev, chore.id));
      setAssignments((prev) => prev.filter((entry) => entry.choreId !== chore.id));
    },
    [assignments, deleteChoreLoading, saveChoreLoading],
  );

  const undoSwipeDeleteChore = useCallback((toastId: string) => {
    const target = pendingSwipeDeletes.find((item) => item.toastId === toastId);
    if (!target) return;
    setPendingSwipeDeletes((prev) => prev.filter((item) => item.toastId !== toastId));
    restorePendingSwipeDelete(target);
  }, [pendingSwipeDeletes, restorePendingSwipeDelete]);

  const finalizeSwipeDeleteChore = useCallback(async (toastId: string) => {
    const target = pendingSwipeDeletes.find((item) => item.toastId === toastId);
    if (!target) return;
    setPendingSwipeDeletes((prev) => prev.filter((item) => item.toastId !== toastId));

    try {
      await apiFetch(`/api/chores/${target.chore.id}`, { method: "DELETE" });
      void refreshAll(statsPeriod).catch((err: unknown) => {
        setError((err as Error).message ?? "家事一覧の更新に失敗しました。");
      });
    } catch (err: unknown) {
      restorePendingSwipeDelete(target);
      setError((err as Error).message ?? "家事の削除に失敗しました。");
    }
  }, [pendingSwipeDeletes, refreshAll, restorePendingSwipeDelete, statsPeriod]);

  const dismissSwipeDeleteToast = useCallback((toastId: string) => {
    void finalizeSwipeDeleteChore(toastId);
  }, [finalizeSwipeDeleteChore]);

  const openMemo = (chore: ChoreWithComputed, baseDateKey?: string) => {
    setMemoTarget(chore);
    setMemoBaseDateKey(baseDateKey ?? null);
    setPendingRecordDateChoice(null);
    setMemoFlowMode("default");
    setMemoQuickDateKey(null);
    setSkipCountDialogOpen(false);
    setSkipCountValue(1);
    setSkipCountMax(1);
    setMemo("");
    setMemoOpen(true);
  };

  const openCalendarQuickMemo = useCallback((chore: ChoreWithComputed, dateKey: string) => {
    setMemoTarget(chore);
    setMemoBaseDateKey(null);
    setPendingRecordDateChoice(null);
    setMemoFlowMode("calendar-quick");
    setMemoQuickDateKey(dateKey);
    setSkipCountDialogOpen(false);
    setSkipCountValue(1);
    setSkipCountMax(1);
    setMemo("");
    setMemoOpen(true);
  }, []);

  const memoPendingCount = useMemo(() => {
    if (!memoTarget) return 1;
    const sourceDateKey = memoBaseDateKey ?? toJstDateKey(startOfJstDay(new Date()));
    const pendingFromProgress = boot?.homeProgressByDate?.[sourceDateKey]?.[memoTarget.id]?.pending;
    if (typeof pendingFromProgress === "number") {
      return Math.max(1, pendingFromProgress);
    }
    const fallbackScheduled = countScheduledOccurrencesOnDate(memoTarget.id, sourceDateKey);
    return Math.max(1, fallbackScheduled);
  }, [boot?.homeProgressByDate, countScheduledOccurrencesOnDate, memoBaseDateKey, memoTarget]);

  const shiftDateKey = useCallback((dateKey: string, days: number) => {
    const parsed = startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`));
    if (Number.isNaN(parsed.getTime())) {
      return toJstDateKey(addDays(startOfJstDay(new Date()), days));
    }
    return toJstDateKey(addDays(parsed, days));
  }, []);

  const openReschedule = (chore: ChoreWithComputed, baseDateKey?: string) => {
    const baseKey = baseDateKey ?? toJstDateKey(startOfJstDay(new Date()));
    setRescheduleTarget(chore);
    setRescheduleBaseDateKey(baseKey);
    setRescheduleChoice("tomorrow");
    setRescheduleCustomDate(shiftDateKey(baseKey, 1));
    setPendingRescheduleConfirm(null);
    setPendingMergeDuplicateConfirm(null);
    setRescheduleOpen(true);
  };

  const openRescheduleEditChore = () => {
    if (!rescheduleTarget) return;
    const target = rescheduleTarget;
    setRescheduleOpen(false);
    setRescheduleTarget(null);
    openEditChore(target);
  };

  const resolveRescheduleDateKey = useCallback((choice: RescheduleChoice, customDate: string, baseDateKey: string) => {
    if (choice === "tomorrow") {
      return shiftDateKey(baseDateKey, 1);
    }
    if (choice === "next_same_weekday") {
      return shiftDateKey(baseDateKey, 7);
    }
    return customDate;
  }, [shiftDateKey]);

  const resolveSourceRecordIdForDate = useCallback(
    (chore: ChoreWithComputed, sourceDateKey: string | null | undefined) => {
      if (!sourceDateKey) return undefined;
      if (!chore.lastRecordId || !chore.lastPerformedAt || chore.lastRecordSkipped) return undefined;
      const performedDateKey = toJstDateKey(startOfJstDay(new Date(chore.lastPerformedAt)));
      if (performedDateKey !== sourceDateKey) return undefined;
      return chore.lastRecordId;
    },
    [],
  );

  const openRescheduleConfirmWithCollisionCheck = useCallback(
    (payload: Omit<PendingRescheduleConfirm, "mergeIfDuplicate">) => {
      if (hasDuplicateScheduleCollision(payload.choreId, payload.sourceDateKey, payload.targetDateKey)) {
        setPendingMergeDuplicateConfirm(payload);
        return;
      }
      setPendingRescheduleConfirm({ ...payload, mergeIfDuplicate: true });
    },
    [hasDuplicateScheduleCollision],
  );

  const rescheduleChoreToDate = useCallback(
    async ({
      choreId,
      targetDateKey,
      sourceDateKey,
      recalculateFuture,
      mergeIfDuplicate,
      sourceRecordId,
    }: {
      choreId: string;
      targetDateKey: string;
      sourceDateKey?: string;
      recalculateFuture?: boolean;
      mergeIfDuplicate?: boolean;
      sourceRecordId?: string;
    }) => {
      await apiFetch("/api/schedule-override", {
        method: "POST",
        body: JSON.stringify({
          choreId,
          date: targetDateKey,
          ...(sourceDateKey ? { sourceDate: sourceDateKey } : {}),
          ...(typeof recalculateFuture === "boolean" ? { recalculateFuture } : {}),
          ...(typeof mergeIfDuplicate === "boolean" ? { mergeIfDuplicate } : {}),
          ...(sourceRecordId ? { sourceRecordId } : {}),
        }),
      });
      await Promise.all([
        loadBootstrap(),
        loadCalendarMonthSummary(calendarMonthKeyRef.current),
      ]);
    },
    [loadBootstrap, loadCalendarMonthSummary],
  );

  const focusCalendarDate = useCallback((dateKey: string) => {
    const nextDate = startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`));
    if (Number.isNaN(nextDate.getTime())) return;
    // Cancel any pending week-nav timer so it doesn't fire after this explicit navigation.
    if (dragNavTimerRef.current) { clearTimeout(dragNavTimerRef.current); dragNavTimerRef.current = null; }
    dragNavHoveringRef.current = null;
    setCalendarSelectedDateKey(dateKey);
    setCalendarMonthCursor(nextDate);
  }, []);

  const applyReschedule = useCallback(() => {
    if (!rescheduleTarget) return;
    const nextDate = resolveRescheduleDateKey(rescheduleChoice, rescheduleCustomDate, rescheduleBaseDateKey);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      setError("日付を指定してください。");
      return;
    }
    const sourceRecordId = resolveSourceRecordIdForDate(rescheduleTarget, rescheduleBaseDateKey);
    openRescheduleConfirmWithCollisionCheck({
      origin: "sheet",
      choreId: rescheduleTarget.id,
      choreTitle: rescheduleTarget.title,
      sourceDateKey: rescheduleBaseDateKey,
      targetDateKey: nextDate,
      sourceRecordId,
    });
  }, [
    openRescheduleConfirmWithCollisionCheck,
    resolveSourceRecordIdForDate,
    rescheduleBaseDateKey,
    rescheduleChoice,
    rescheduleCustomDate,
    rescheduleTarget,
    resolveRescheduleDateKey,
  ]);

  const closePendingRescheduleConfirm = useCallback(() => {
    if (rescheduleConfirmLoading) return;
    setPendingRescheduleConfirm(null);
  }, [rescheduleConfirmLoading]);

  const closePendingMergeDuplicateConfirm = useCallback(() => {
    if (rescheduleConfirmLoading) return;
    setPendingMergeDuplicateConfirm(null);
  }, [rescheduleConfirmLoading]);

  const resolvePendingMergeDuplicateConfirm = useCallback((mergeIfDuplicate: boolean) => {
    if (!pendingMergeDuplicateConfirm || rescheduleConfirmLoading) return;
    setPendingMergeDuplicateConfirm(null);
    setPendingRescheduleConfirm({
      ...pendingMergeDuplicateConfirm,
      mergeIfDuplicate,
    });
  }, [pendingMergeDuplicateConfirm, rescheduleConfirmLoading]);

  const clearDragState = useCallback(() => {
    setDraggingChore(null);
    setDragSourceDateKey(null);
    setDragTargetDateKey(null);
    setHomeDropTarget(null);
    setTouchDragging(false);
    if (dragNavTimerRef.current) { clearTimeout(dragNavTimerRef.current); dragNavTimerRef.current = null; }
    dragNavHoveringRef.current = null;
    if (dragScrollRafRef.current !== null) { cancelAnimationFrame(dragScrollRafRef.current); dragScrollRafRef.current = null; }
    dragScrollSpeedRef.current = 0;
  }, []);

  const beginChoreDrag = useCallback((chore: ChoreWithComputed, sourceDateKey: string) => {
    setDraggingChore(chore);
    setDragSourceDateKey(sourceDateKey);
    setDragTargetDateKey(null);
    setHomeDropTarget(null);
  }, []);

  const resolveDropPosition = useCallback((clientY: number, element: HTMLElement): DropPosition => {
    const rect = element.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    return clientY < centerY ? "before" : "after";
  }, []);

  const reorderHomeWithinDate = useCallback(({
    dateKey,
    dragChoreId,
    targetChoreId,
    position,
  }: {
    dateKey: string;
    dragChoreId: string;
    targetChoreId: string;
    position: DropPosition;
  }) => {
    if (!homeSectionDateKeySet.has(dateKey)) return;
    setHomeOrderByDate((previous) => {
      const baseIds = [
        ...(homeSectionChoreIdsRef.current[dateKey] ?? previous[dateKey] ?? []),
      ];
      const reordered = reorderWithinDate(baseIds, dragChoreId, targetChoreId, position);
      const next: HomeOrderByDate = { ...previous };
      if (reordered.length === 0) {
        delete next[dateKey];
      } else {
        next[dateKey] = reordered;
      }
      return sanitizeHomeOrderByDate(next, homeOrderSanitizeOptions);
    });
  }, [homeOrderSanitizeOptions, homeSectionDateKeySet]);

  const applyHomeOrderAfterCrossDateMove = useCallback(({
    sourceDateKey,
    targetDateKey,
    choreId,
    homeDropInsert,
  }: {
    sourceDateKey: string;
    targetDateKey: string;
    choreId: string;
    homeDropInsert?: HomeDropInsert;
  }) => {
    if (!homeSectionDateKeySet.has(sourceDateKey) || !homeSectionDateKeySet.has(targetDateKey)) return;
    setHomeOrderByDate((previous) => {
      const sourceIds = [
        ...(homeSectionChoreIdsRef.current[sourceDateKey] ?? previous[sourceDateKey] ?? []),
      ];
      const targetIds = [
        ...(homeSectionChoreIdsRef.current[targetDateKey] ?? previous[targetDateKey] ?? []),
      ];
      const next: HomeOrderByDate = { ...previous };

      if (
        homeDropInsert &&
        homeDropInsert.targetDateKey === targetDateKey &&
        homeDropInsert.targetChoreId !== choreId &&
        targetIds.includes(homeDropInsert.targetChoreId)
      ) {
        const moved = moveAcrossDates(
          sourceIds,
          targetIds,
          choreId,
          homeDropInsert.targetChoreId,
          homeDropInsert.position,
        );
        if (moved.sourceIds.length > 0) {
          next[sourceDateKey] = moved.sourceIds;
        } else {
          delete next[sourceDateKey];
        }
        if (moved.targetIds.length > 0) {
          next[targetDateKey] = moved.targetIds;
        } else {
          delete next[targetDateKey];
        }
      } else {
        const filteredSource = sourceIds.filter((id) => id !== choreId);
        if (filteredSource.length > 0) {
          next[sourceDateKey] = filteredSource;
        } else {
          delete next[sourceDateKey];
        }
        if (targetIds.length > 0) {
          next[targetDateKey] = targetIds;
        } else {
          delete next[targetDateKey];
        }
      }

      return sanitizeHomeOrderByDate(next, homeOrderSanitizeOptions);
    });
  }, [homeOrderSanitizeOptions, homeSectionDateKeySet]);

  const handleChorePointerDown = useCallback(
    (chore: ChoreWithComputed, sourceDateKey: string, event: React.PointerEvent<HTMLElement>) => {
      if (!event.isPrimary) return;
      const { clientX: startX, clientY: startY } = event;
      touchDragInfoRef.current = { active: false, chore, sourceDateKey, startX, startY };
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = window.setTimeout(() => {
        if (!touchDragInfoRef.current) return;
        touchDragInfoRef.current.active = true;
        suppressChipClickRef.current = true;
        beginChoreDrag(touchDragInfoRef.current.chore, touchDragInfoRef.current.sourceDateKey);
        setTouchDragging(true);
        setTouchDragPos({ x: startX, y: startY });
        longPressTimerRef.current = null;
      }, 350);
    },
    [beginChoreDrag],
  );

  const dropDraggedChoreToDate = useCallback(async (
    targetDateKey: string,
    options?: { homeDropInsert?: HomeDropInsert },
  ) => {
    if (!draggingChore) return;
    if (dragSourceDateKey === targetDateKey) {
      clearDragState();
      return;
    }
    try {
      setError("");
      if (!dragSourceDateKey) {
        setError("移動元の日付が取得できません。");
        return;
      }
      const sourceRecordId = resolveSourceRecordIdForDate(draggingChore, dragSourceDateKey);
      openRescheduleConfirmWithCollisionCheck({
        origin: "drag",
        choreId: draggingChore.id,
        choreTitle: draggingChore.title,
        sourceDateKey: dragSourceDateKey,
        targetDateKey,
        sourceRecordId,
        homeDropInsert: options?.homeDropInsert,
      });
    } catch (err: unknown) {
      setError((err as Error).message ?? "日にち変更に失敗しました。");
    } finally {
      clearDragState();
    }
  }, [
    clearDragState,
    dragSourceDateKey,
    draggingChore,
    openRescheduleConfirmWithCollisionCheck,
    resolveSourceRecordIdForDate,
  ]);

  const handleHomeDrop = useCallback((drop: HomeDropInsert) => {
    if (!draggingChore) return;
    if (dragSourceDateKey === drop.targetDateKey) {
      reorderHomeWithinDate({
        dateKey: drop.targetDateKey,
        dragChoreId: draggingChore.id,
        targetChoreId: drop.targetChoreId,
        position: drop.position,
      });
      clearDragState();
      return;
    }
    void dropDraggedChoreToDate(drop.targetDateKey, { homeDropInsert: drop });
  }, [clearDragState, dragSourceDateKey, draggingChore, dropDraggedChoreToDate, reorderHomeWithinDate]);

  handleHomeDropRef.current = handleHomeDrop;

  // ref を常に最新の関数に同期。useEffect 内のクロージャが古いスナップショットを
  // 参照しないよう、render 時点で更新しておく。
  dropDraggedChoreToDateRef.current = dropDraggedChoreToDate;

  // グローバルポインターイベント — タッチデバイスでのドラッグ&ドロップ対応
  // 週ナビゲーションホバー・自動スクロールも含む
  useEffect(() => {
    const SCROLL_ZONE = 100;   // 端からこのpx内でスクロール発動
    const MAX_SCROLL_SPEED = 12; // px/frame

    const startScrollLoop = () => {
      if (dragScrollRafRef.current !== null) return;
      const loop = () => {
        const speed = dragScrollSpeedRef.current;
        const el = mainScrollRef.current;
        if (speed === 0 || !el) { dragScrollRafRef.current = null; return; }
        el.scrollTop += speed;
        dragScrollRafRef.current = requestAnimationFrame(loop);
      };
      dragScrollRafRef.current = requestAnimationFrame(loop);
    };

    const stopScrollLoop = () => {
      if (dragScrollRafRef.current !== null) { cancelAnimationFrame(dragScrollRafRef.current); dragScrollRafRef.current = null; }
      dragScrollSpeedRef.current = 0;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const info = touchDragInfoRef.current;
      if (!info) return;
      if (!info.active) {
        const dx = Math.abs(event.clientX - info.startX);
        const dy = Math.abs(event.clientY - info.startY);
        if (dx > 8 || dy > 8) {
          if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
          touchDragInfoRef.current = null;
        }
        return;
      }
      event.preventDefault();
      setTouchDragPos({ x: event.clientX, y: event.clientY });

      const els = document.elementsFromPoint(event.clientX, event.clientY);

      // ドロップ先の判定
      const homeDropEl = els.find(
        (el) =>
          el instanceof HTMLElement &&
          (el as HTMLElement).dataset.homeDropDate &&
          (el as HTMLElement).dataset.homeDropChoreId,
      ) as HTMLElement | undefined;
      if (homeDropEl?.dataset.homeDropDate && homeDropEl.dataset.homeDropChoreId) {
        const position = resolveDropPosition(event.clientY, homeDropEl);
        setHomeDropTarget({
          targetDateKey: homeDropEl.dataset.homeDropDate,
          targetChoreId: homeDropEl.dataset.homeDropChoreId,
          position,
        });
        setDragTargetDateKey(homeDropEl.dataset.homeDropDate);
      } else {
        setHomeDropTarget(null);
        const dropEl = els.find((el) => el instanceof HTMLElement && (el as HTMLElement).dataset.dropDate) as HTMLElement | undefined;
        setDragTargetDateKey(dropEl?.dataset.dropDate ?? null);
      }

      // 週ナビゲーションゾーンのホバー検出 — 600ms滞在で週移動
      const navEl = els.find((el) => el instanceof HTMLElement && (el as HTMLElement).dataset.dragNavigate) as HTMLElement | undefined;
      const navDir = navEl?.dataset.dragNavigate ?? null;
      if (navDir !== dragNavHoveringRef.current) {
        dragNavHoveringRef.current = navDir;
        if (dragNavTimerRef.current) { clearTimeout(dragNavTimerRef.current); dragNavTimerRef.current = null; }
        if (navDir === "next-week" || navDir === "prev-week") {
          dragNavTimerRef.current = window.setTimeout(() => {
            dragNavTimerRef.current = null;
            const delta = navDir === "next-week" ? 7 : -7;
            focusCalendarDate(toJstDateKey(addDays(calendarWeekStartRef.current, delta)));
          }, 600);
        }
      }

      // 画面端の自動スクロール
      const { clientY } = event;
      const h = window.innerHeight;
      if (clientY < SCROLL_ZONE) {
        dragScrollSpeedRef.current = -MAX_SCROLL_SPEED * (1 - clientY / SCROLL_ZONE);
        startScrollLoop();
      } else if (clientY > h - SCROLL_ZONE) {
        dragScrollSpeedRef.current = MAX_SCROLL_SPEED * (1 - (h - clientY) / SCROLL_ZONE);
        startScrollLoop();
      } else {
        dragScrollSpeedRef.current = 0;
        // speed=0 になったら loop が自然に止まる
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      if (dragNavTimerRef.current) { clearTimeout(dragNavTimerRef.current); dragNavTimerRef.current = null; }
      dragNavHoveringRef.current = null;
      stopScrollLoop();
      const info = touchDragInfoRef.current;
      touchDragInfoRef.current = null;
      if (!info?.active) return;
      const els = document.elementsFromPoint(event.clientX, event.clientY);
      const homeDropEl = els.find(
        (el) =>
          el instanceof HTMLElement &&
          (el as HTMLElement).dataset.homeDropDate &&
          (el as HTMLElement).dataset.homeDropChoreId,
      ) as HTMLElement | undefined;
      if (homeDropEl?.dataset.homeDropDate && homeDropEl.dataset.homeDropChoreId) {
        const position = resolveDropPosition(event.clientY, homeDropEl);
        handleHomeDropRef.current({
          targetDateKey: homeDropEl.dataset.homeDropDate,
          targetChoreId: homeDropEl.dataset.homeDropChoreId,
          position,
        });
        return;
      }
      const dropEl = els.find((el) => el instanceof HTMLElement && (el as HTMLElement).dataset.dropDate) as HTMLElement | undefined;
      if (dropEl?.dataset.dropDate) {
        void dropDraggedChoreToDateRef.current(dropEl.dataset.dropDate);
        return;
      }
      clearDragState();
    };

    const handlePointerCancel = () => {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      if (dragNavTimerRef.current) { clearTimeout(dragNavTimerRef.current); dragNavTimerRef.current = null; }
      dragNavHoveringRef.current = null;
      stopScrollLoop();
      touchDragInfoRef.current = null;
      clearDragState();
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
      stopScrollLoop();
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      if (dragNavTimerRef.current) { clearTimeout(dragNavTimerRef.current); dragNavTimerRef.current = null; }
    };
  }, [clearDragState, focusCalendarDate, resolveDropPosition]);

  const shiftCalendarMonth = useCallback((direction: -1 | 1) => {
    const nextMonthKey = monthKeyWithOffset(toMonthKey(calendarMonthCursor), direction === 1 ? -1 : 1);
    const nextDateKey = `${nextMonthKey}-01`;
    focusCalendarDate(nextDateKey);
    setCalendarExpanded(true);
  }, [calendarMonthCursor, focusCalendarDate]);

  const shiftCalendarWeek = useCallback((direction: -1 | 1) => {
    focusCalendarDate(toJstDateKey(addDays(calendarWeekStart, direction * CALENDAR_WEEK_DAYS)));
    setCalendarExpanded(false);
  }, [calendarWeekStart, focusCalendarDate]);

  const handleCalendarTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    calendarSwipeStartXRef.current = touch.clientX;
    calendarSwipeStartYRef.current = touch.clientY;
  }, []);

  const handleCalendarTouchEnd = useCallback((e: React.TouchEvent) => {
    const startX = calendarSwipeStartXRef.current;
    const startY = calendarSwipeStartYRef.current;
    calendarSwipeStartXRef.current = null;
    calendarSwipeStartYRef.current = null;
    const touch = e.changedTouches[0];
    if (!touch || startX === null || startY === null) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    const direction = dx < 0 ? 1 : -1;  // left = next (1), right = prev (-1)
    if (calendarExpanded) {
      shiftCalendarMonth(direction);
    } else {
      shiftCalendarWeek(direction);
    }
  }, [calendarExpanded, shiftCalendarMonth, shiftCalendarWeek]);

  const shiftTargetDateByWeek = useCallback((direction: -1 | 1) => {
    const source = dragSourceDateKey ?? toJstDateKey(startOfJstDay(new Date()));
    const sourceDate = startOfJstDay(new Date(`${source}T00:00:00+09:00`));
    const jstDay = new Date(sourceDate.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
    const weekDayIndex = jstDay === 0 ? 6 : jstDay - 1;
    // Use the source date's own week start (not calendarWeekStart) so that week-nav buttons
    // always move relative to the drag source even when the month calendar cursor diverges.
    const sourceWeekStart = startOfJstWeekMonday(sourceDate);
    const target = addDays(sourceWeekStart, direction * 7 + weekDayIndex);
    return toJstDateKey(target);
  }, [dragSourceDateKey]);

  const submitCalendarQuickCompletion = useCallback(async ({
    chore,
    dateKey,
    memoText,
  }: {
    chore: ChoreWithComputed;
    dateKey: string;
    memoText: string;
  }) => {
    const targetId = chore.id;
    const previousBoot = boot;
    const now = new Date();
    const todayStart = startOfJstDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const dayAfterTomorrow = addDays(todayStart, 2);
    const performedAt = resolvePerformedAtForDateKey(dateKey, now);
    const performedAtIso = performedAt.toISOString();
    const performedAtDateKey = toJstDateKey(startOfJstDay(performedAt));
    const completedTomorrowTask = chore.isDueTomorrow;

    setMemoOpen(false);
    setRecordUpdating(targetId, true);

    if (sessionUser) {
      updateBootChoreOptimistically(targetId, (current) => {
        const nextDueAt = addDays(performedAt, current.intervalDays);
        const nextDueAtTime = nextDueAt.getTime();
        return {
          ...current,
          doneToday: performedAt >= todayStart && performedAt < tomorrowStart,
          lastPerformedAt: performedAtIso,
          lastPerformerName: sessionUser.name,
          lastPerformerId: sessionUser.id,
          lastRecordIsInitial: false,
          lastRecordSkipped: false,
          lastRecordId: current.lastRecordId ?? `optimistic-${now.getTime()}`,
          dueAt: nextDueAt.toISOString(),
          isDueToday: nextDueAt >= todayStart && nextDueAt < tomorrowStart,
          isDueTomorrow: nextDueAt >= tomorrowStart && nextDueAt < dayAfterTomorrow,
          isOverdue: nextDueAt < todayStart,
          overdueDays:
            nextDueAt < todayStart
              ? Math.floor((todayStart.getTime() - nextDueAtTime) / DAY_IN_MS)
              : 0,
          daysSinceLast: 0,
        };
      });
    }

    try {
      const scheduledCount = countScheduledOccurrencesOnDate(targetId, dateKey);
      const body: Record<string, unknown> = {
        memo: memoText,
        skipped: false,
        performedAt: performedAtIso,
      };
      if (scheduledCount > 0) {
        body.sourceDate = dateKey;
        body.recalculateFuture = false;
        body.mergeIfDuplicate = false;
      }
      const result = await apiFetch<{ record: { id: string } }>(`/api/chores/${targetId}/record`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (result?.record?.id) {
        updateBootChoreOptimistically(targetId, (current) => ({
          ...current,
          lastRecordId: result.record.id,
        }));
      }

      await Promise.all([
        loadBootstrap(),
        loadCalendarMonthSummary(calendarMonthKeyRef.current),
      ]);

      if (!chore.doneToday && completedTomorrowTask && performedAtDateKey === toJstDateKey(todayStart)) {
        showTaskBanner("👏 明日のものをやってえらい！", "blue");
      }

      void Promise.all([loadStats(statsPeriod), loadHistory()]);
    } catch (err: unknown) {
      if (previousBoot) {
        setBoot(previousBoot);
      }
      setError((err as Error).message ?? "記録に失敗しました。");
    } finally {
      setRecordUpdating(targetId, false);
      setMemoTarget(null);
      setMemoBaseDateKey(null);
      setMemo("");
      setMemoFlowMode("default");
      setMemoQuickDateKey(null);
    }
  }, [
    boot,
    loadBootstrap,
    loadCalendarMonthSummary,
    loadHistory,
    loadStats,
    countScheduledOccurrencesOnDate,
    sessionUser,
    setRecordUpdating,
    showTaskBanner,
    statsPeriod,
    updateBootChoreOptimistically,
  ]);

  const addCalendarPlannedOccurrence = useCallback(async (
    chore: ChoreWithComputed,
    dateKey: string,
    allowDuplicate = false,
  ) => {
    const todayDateKey = toJstDateKey(startOfJstDay(new Date()));
    if (compareDateKey(dateKey, todayDateKey) < 0) {
      setError("過去の日付には予定登録できません。");
      return;
    }

    setError("");
    setRecordUpdating(chore.id, true);
    try {
      await apiFetch("/api/schedule-override", {
        method: "POST",
        body: JSON.stringify({
          choreId: chore.id,
          date: dateKey,
          mode: "add",
          allowDuplicate,
        }),
      });
      setPendingCalendarPlanDuplicateConfirm(null);
      await Promise.all([
        loadBootstrap(),
        loadCalendarMonthSummary(calendarMonthKeyRef.current),
      ]);
      setInfoMessage(`「${chore.title}」を${dateKey}に予定登録しました。`);
      closeCalendarBlankActionSheet();
    } catch (err: unknown) {
      const message = (err as Error).message ?? "予定登録に失敗しました。";
      if (
        !allowDuplicate &&
        message.includes("その日には同じ家事がすでに登録されています。")
      ) {
        setPendingCalendarPlanDuplicateConfirm({
          choreId: chore.id,
          choreTitle: chore.title,
          dateKey,
        });
        return;
      }
      setError(message);
    } finally {
      setRecordUpdating(chore.id, false);
    }
  }, [
    closeCalendarBlankActionSheet,
    loadBootstrap,
    loadCalendarMonthSummary,
    setRecordUpdating,
  ]);

  const resolveCalendarPlanDuplicateConfirm = useCallback((allowDuplicate: boolean) => {
    if (!pendingCalendarPlanDuplicateConfirm) return;
    const pending = pendingCalendarPlanDuplicateConfirm;
    setPendingCalendarPlanDuplicateConfirm(null);
    if (!allowDuplicate) return;
    const target = chores.find((chore) => chore.id === pending.choreId);
    if (!target) {
      setError("対象の家事が見つかりません。");
      return;
    }
    void addCalendarPlannedOccurrence(target, pending.dateKey, true);
  }, [addCalendarPlannedOccurrence, chores]);

  const handleCalendarBlankComplete = useCallback((chore: ChoreWithComputed, dateKey: string) => {
    const todayDateKey = toJstDateKey(startOfJstDay(new Date()));
    if (compareDateKey(dateKey, todayDateKey) < 0) {
      closeCalendarBlankActionSheet();
      openCalendarQuickMemo(chore, dateKey);
      return;
    }
    closeCalendarBlankActionSheet();
    void submitCalendarQuickCompletion({ chore, dateKey, memoText: "" });
  }, [closeCalendarBlankActionSheet, openCalendarQuickMemo, submitCalendarQuickCompletion]);

  const handleCalendarBlankPlanned = useCallback((chore: ChoreWithComputed, dateKey: string) => {
    void addCalendarPlannedOccurrence(chore, dateKey, false);
  }, [addCalendarPlannedOccurrence]);

  const submitMemoAction = useCallback(async ({
    skipped,
    skipCount,
    recalculateFuture,
    bypassFutureConfirm = false,
    mergeIfDuplicate = true,
    performedAtMode = "today",
  }: {
    skipped: boolean;
    skipCount?: number;
    recalculateFuture?: boolean;
    bypassFutureConfirm?: boolean;
    mergeIfDuplicate?: boolean;
    performedAtMode?: PerformedAtMode;
  }) => {
    if (!memoTarget) return;
    const targetId = memoTarget.id;
    const previousBoot = boot;
    const now = new Date();
    const todayStart = startOfJstDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const dayAfterTomorrow = addDays(todayStart, 2);
    const sourceDateKey = memoBaseDateKey ?? undefined;
    const shouldSendSourceDate = Boolean(sourceDateKey);
    let hasFutureMemoBase = false;
    if (sourceDateKey) {
      const baseDate = startOfJstDay(new Date(`${sourceDateKey}T00:00:00+09:00`));
      hasFutureMemoBase =
        !Number.isNaN(baseDate.getTime()) && baseDate.getTime() > todayStart.getTime();
    }
    if (performedAtMode === "today" && hasFutureMemoBase && !bypassFutureConfirm && sourceDateKey) {
      openRescheduleConfirmWithCollisionCheck({
        origin: skipped ? "future-skip" : "future-record",
        choreId: memoTarget.id,
        choreTitle: memoTarget.title,
        sourceDateKey,
        targetDateKey: toJstDateKey(todayStart),
      });
      return;
    }

    let performedAt = now;
    if (performedAtMode === "source" && sourceDateKey) {
      const sourceDayStart = startOfJstDay(new Date(`${sourceDateKey}T00:00:00+09:00`));
      if (!Number.isNaN(sourceDayStart.getTime())) {
        const elapsedTodayMs = Math.max(0, now.getTime() - todayStart.getTime());
        performedAt = new Date(sourceDayStart.getTime() + elapsedTodayMs);
      }
    }
    const performedAtIso = performedAt.toISOString();
    const performedAtDateKey = toJstDateKey(startOfJstDay(performedAt));
    const completedTomorrowTask = memoTarget.isDueTomorrow;

    setMemoOpen(false);
    setRecordUpdating(targetId, true);

    if (sessionUser) {
      updateBootChoreOptimistically(targetId, (chore) => {
        const nextDueAt = addDays(performedAt, chore.intervalDays);
        const nextDueAtTime = nextDueAt.getTime();
        return {
          ...chore,
          doneToday: performedAt >= todayStart && performedAt < tomorrowStart,
          lastPerformedAt: performedAtIso,
          lastPerformerName: skipped ? "スキップ" : sessionUser.name,
          lastPerformerId: sessionUser.id,
          lastRecordIsInitial: false,
          lastRecordSkipped: skipped,
          lastRecordId: skipped
            ? chore.lastRecordId ?? `optimistic-skip-${now.getTime()}`
            : chore.lastRecordId ?? `optimistic-${now.getTime()}`,
          dueAt: nextDueAt.toISOString(),
          isDueToday: nextDueAt >= todayStart && nextDueAt < tomorrowStart,
          isDueTomorrow: nextDueAt >= tomorrowStart && nextDueAt < dayAfterTomorrow,
          isOverdue: nextDueAt < todayStart,
          overdueDays:
            nextDueAt < todayStart
              ? Math.floor((todayStart.getTime() - nextDueAtTime) / (24 * 60 * 60 * 1000))
              : 0,
          daysSinceLast: 0,
        };
      });
    }

    try {
      const body: Record<string, unknown> = { memo, skipped, performedAt: performedAtIso };
      if (skipped && typeof skipCount === "number") {
        body.skipCount = skipCount;
      }
      if (shouldSendSourceDate && sourceDateKey) {
        const targetMatchesSource = sourceDateKey === performedAtDateKey;
        const effectiveMergeIfDuplicate =
          hasFutureMemoBase && !targetMatchesSource ? mergeIfDuplicate : false;
        body.sourceDate = sourceDateKey;
        body.recalculateFuture = recalculateFuture === true;
        body.mergeIfDuplicate = effectiveMergeIfDuplicate;
      }
      const result = await apiFetch<{ record: { id: string } }>(`/api/chores/${targetId}/record`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (result?.record?.id) {
        updateBootChoreOptimistically(targetId, (chore) => ({
          ...chore,
          lastRecordId: result.record.id,
        }));
      }
      if (shouldSendSourceDate && sourceDateKey) {
        await Promise.all([
          loadBootstrap(),
          loadCalendarMonthSummary(calendarMonthKeyRef.current),
        ]);
      }
      if (!skipped && completedTomorrowTask && performedAtDateKey === toJstDateKey(todayStart)) {
        showTaskBanner("👏 明日のものをやってえらい！", "blue");
      }
      void Promise.all([loadStats(statsPeriod), loadHistory()]);
    } catch (err: unknown) {
      if (previousBoot) {
        setBoot(previousBoot);
      }
      setError((err as Error).message ?? (skipped ? "スキップに失敗しました。" : "記録に失敗しました。"));
    } finally {
      setRecordUpdating(targetId, false);
      setMemoTarget(null);
      setMemoBaseDateKey(null);
      setMemoFlowMode("default");
      setMemoQuickDateKey(null);
      setSkipCountDialogOpen(false);
      setSkipCountValue(1);
      setSkipCountMax(1);
    }
  }, [
    boot,
    loadBootstrap,
    loadCalendarMonthSummary,
    loadHistory,
    loadStats,
    memo,
    memoBaseDateKey,
    memoTarget,
    openRescheduleConfirmWithCollisionCheck,
    sessionUser,
    setRecordUpdating,
    showTaskBanner,
    skipCountMax,
    skipCountValue,
    statsPeriod,
    updateBootChoreOptimistically,
  ]);

  const submitRecord = useCallback(() => {
    if (memoFlowMode === "calendar-quick" && memoTarget && memoQuickDateKey) {
      void submitCalendarQuickCompletion({
        chore: memoTarget,
        dateKey: memoQuickDateKey,
        memoText: memo,
      });
      return;
    }
    const todayDateKey = toJstDateKey(startOfJstDay(new Date()));
    if (memoTarget && memoBaseDateKey && memoBaseDateKey !== todayDateKey) {
      setPendingRecordDateChoice({
        choreId: memoTarget.id,
        choreTitle: memoTarget.title,
        sourceDateKey: memoBaseDateKey,
      });
      return;
    }
    setPendingRecordDateChoice(null);
    void submitMemoAction({ skipped: false, performedAtMode: "today" });
  }, [
    memo,
    memoBaseDateKey,
    memoFlowMode,
    memoQuickDateKey,
    memoTarget,
    submitCalendarQuickCompletion,
    submitMemoAction,
  ]);

  const submitSkip = useCallback(() => {
    if (!memoTarget) return;
    const defaultCount = Math.max(1, memoPendingCount);
    setPendingRecordDateChoice(null);
    setSkipCountMax(defaultCount);
    setSkipCountValue(defaultCount);
    setSkipCountDialogOpen(true);
  }, [memoPendingCount, memoTarget]);

  const confirmSkipWithCount = useCallback(() => {
    const skipCount = Math.max(1, Math.min(skipCountValue, skipCountMax));
    setPendingRecordDateChoice(null);
    setSkipCountDialogOpen(false);
    void submitMemoAction({ skipped: true, skipCount });
  }, [skipCountMax, skipCountValue, submitMemoAction]);

  const confirmPendingReschedule = useCallback(async (recalculateFuture: boolean) => {
    if (!pendingRescheduleConfirm || rescheduleConfirmLoading) return;
    try {
      setError("");
      setRescheduleConfirmLoading(true);
      if (
        pendingRescheduleConfirm.origin === "future-record" ||
        pendingRescheduleConfirm.origin === "future-skip"
      ) {
        await submitMemoAction({
          skipped: pendingRescheduleConfirm.origin === "future-skip",
          recalculateFuture,
          bypassFutureConfirm: true,
          mergeIfDuplicate: pendingRescheduleConfirm.mergeIfDuplicate,
        });
        setPendingRescheduleConfirm(null);
        return;
      }
      await rescheduleChoreToDate({
        choreId: pendingRescheduleConfirm.choreId,
        targetDateKey: pendingRescheduleConfirm.targetDateKey,
        sourceDateKey: pendingRescheduleConfirm.sourceDateKey,
        recalculateFuture,
        mergeIfDuplicate: pendingRescheduleConfirm.mergeIfDuplicate,
        sourceRecordId: pendingRescheduleConfirm.sourceRecordId,
      });
      if (pendingRescheduleConfirm.origin === "drag") {
        applyHomeOrderAfterCrossDateMove({
          sourceDateKey: pendingRescheduleConfirm.sourceDateKey,
          targetDateKey: pendingRescheduleConfirm.targetDateKey,
          choreId: pendingRescheduleConfirm.choreId,
          homeDropInsert: pendingRescheduleConfirm.homeDropInsert,
        });
      }
      focusCalendarDate(pendingRescheduleConfirm.targetDateKey);
      if (pendingRescheduleConfirm.origin === "sheet") {
        setRescheduleOpen(false);
        setRescheduleTarget(null);
      }
      setPendingRescheduleConfirm(null);
    } catch (err: unknown) {
      setError((err as Error).message ?? "日にち変更に失敗しました。");
    } finally {
      setRescheduleConfirmLoading(false);
    }
  }, [applyHomeOrderAfterCrossDateMove, focusCalendarDate, pendingRescheduleConfirm, rescheduleChoreToDate, rescheduleConfirmLoading, submitMemoAction]);

  const undoRecord = async (chore: ChoreWithComputed) => {
    if (!chore.lastRecordId) return;
    const previousBoot = boot;
    setRecordUpdating(chore.id, true);

    // Recalculate due-date flags from the pre-check dueAt.
    // submitRecord shifted dueAt forward by intervalDays, so we reverse it.
    const origDueAt = chore.dueAt
      ? addDays(new Date(chore.dueAt), -chore.intervalDays).toISOString()
      : null;
    const todayStart = startOfJstDay(new Date());
    const tomorrowStart = addDays(todayStart, 1);
    const dayAfterTomorrow = addDays(todayStart, 2);
    const dueTime = origDueAt ? new Date(origDueAt).getTime() : null;

    const restoredIsDueToday =
      dueTime !== null && dueTime >= todayStart.getTime() && dueTime < tomorrowStart.getTime();
    const restoredIsDueTomorrow =
      dueTime !== null && dueTime >= tomorrowStart.getTime() && dueTime < dayAfterTomorrow.getTime();
    const restoredIsOverdue = dueTime !== null && dueTime < todayStart.getTime();

    updateBootChoreOptimistically(chore.id, (current) => ({
      ...current,
      doneToday: false,
      lastRecordId: null,
      lastRecordSkipped: false,
      dueAt: origDueAt,
      isDueToday: restoredIsDueToday,
      isDueTomorrow: restoredIsDueTomorrow,
      isOverdue: restoredIsOverdue,
      overdueDays: restoredIsOverdue && dueTime !== null
        ? Math.floor((todayStart.getTime() - dueTime) / (24 * 60 * 60 * 1000))
        : 0,
    }));

    try {
      await apiFetch(`/api/records/${chore.lastRecordId}`, { method: "DELETE", body: "{}" });
      // Refresh authoritative state from server to ensure dueAt, lastPerformedAt etc. are correct.
      await Promise.all([
        loadBootstrap(),
        loadCalendarMonthSummary(calendarMonthKeyRef.current),
      ]);
      void Promise.all([loadStats(statsPeriod), loadHistory()]);
    } catch (err: unknown) {
      if (previousBoot) {
        setBoot(previousBoot);
      }
      setError((err as Error).message ?? "元に戻す処理に失敗しました。");
    } finally {
      setRecordUpdating(chore.id, false);
    }
  };

  const requestUndoRecord = (chore: ChoreWithComputed) => {
    if (!chore.lastRecordId) return;
    if (recordUpdatingIds.includes(chore.id)) return;
    setUndoConfirmTarget(chore);
  };

  const confirmUndoRecord = async () => {
    const target = undoConfirmTarget;
    if (!target) return;
    setUndoConfirmTarget(null);
    await undoRecord(target);
  };

  const openManageDetail = (choreId: string) => {
    setManageDetailChoreId(choreId);
    setHistoryFilter("all");
  };

  const toggleReaction = useCallback(
    async (record: ChoreRecordItem, emoji: (typeof REACTION_CHOICES)[number]) => {
      if (!sessionUser) return;
      if (reactionUpdatingId === record.id) return;
      const current = (record.reactions ?? []).find((reaction) => reaction.userId === sessionUser.id);
      try {
        setReactionUpdatingId(record.id);
        setError("");
        if (current?.emoji === emoji) {
          await apiFetch(`/api/records/${record.id}/reaction`, {
            method: "DELETE",
            body: "{}",
          });
        } else {
          await apiFetch(`/api/records/${record.id}/reaction`, {
            method: "PUT",
            body: JSON.stringify({ emoji }),
          });
        }
        await loadHistory();
      } catch (err: unknown) {
        setError((err as Error).message ?? "リアクションの更新に失敗しました。");
      } finally {
        setReactionUpdatingId(null);
      }
    },
    [loadHistory, reactionUpdatingId, sessionUser],
  );

  const updateNotificationSettings = async (next: NotificationSettings) => {
    const previous = notificationSettings;
    if (!previous) return;

    setError("");
    setNotificationSettings(next);
    try {
      const updated = await apiFetch<NotificationSettings>("/api/notification-settings", {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setNotificationSettings(updated);
    } catch (err: unknown) {
      setNotificationSettings(previous);
      setError((err as Error).message ?? "通知設定の保存に失敗しました。");
    }
  };

  const handleTogglePush = async (next: boolean) => {
    if (pushLoading) return;
    if (next) {
      const enabled = await subscribePush();
      if (!enabled) {
        setPushEnabled(false);
        return;
      }
      setPushEnabled(true);
      return;
    }

    try {
      setPushLoading(true);
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription?.endpoint) {
        await apiFetch("/api/subscriptions", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      await subscription?.unsubscribe();
      setPushEnabled(false);
      setReminderTimePickerOpen(false);
    } catch (err: unknown) {
      setError((err as Error).message ?? "通知設定の変更に失敗しました。");
    } finally {
      setPushLoading(false);
    }
  };

  const removeReminderTime = (time: string) => {
    if (!notificationSettings) return;
    if (notificationSettings.reminderTimes.length <= 1) {
      setError("通知時刻は1件以上必要です。");
      return;
    }
    const nextTimes = notificationSettings.reminderTimes.filter((value) => value !== time);
    void updateNotificationSettings({ ...notificationSettings, reminderTimes: nextTimes });
  };

  const addReminderTime = (time: string) => {
    if (!notificationSettings) return;
    if (notificationSettings.reminderTimes.includes(time)) return;
    if (notificationSettings.reminderTimes.length >= 4) {
      setError("通知時刻は最大4件までです。");
      return;
    }
    const nextTimes = [...notificationSettings.reminderTimes, time].sort((a, b) => a.localeCompare(b));
    void updateNotificationSettings({ ...notificationSettings, reminderTimes: nextTimes });
    setReminderTimePickerOpen(false);
  };

  const subscribePush = async () => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      setError("VAPID公開鍵が未設定です。");
      return false;
    }
    if (!("serviceWorker" in navigator)) return false;
    setPushLoading(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("通知の許可が必要です。");
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js"));
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await apiFetch("/api/subscriptions", { method: "POST", body: JSON.stringify(sub) });
      setPushEnabled(true);
      return true;
    } catch (err: unknown) {
      setError((err as Error).message ?? "通知を有効にできませんでした。");
      return false;
    } finally {
      setPushLoading(false);
    }
  };

  const handleTestNotification = async () => {
    const ready = pushEnabled || (await subscribePush());
    if (!ready) return;

    try {
      setError("");
      await apiFetch("/api/notifications/test", { method: "POST", body: "{}" });
    } catch (err: unknown) {
      setError((err as Error).message ?? "テスト通知の送信に失敗しました。");
    }
  };

  const applyCustomDateRange = async (range: CustomDateRange) => {
    if (!range.from || !range.to) {
      setError("カスタム期間の開始日と終了日を入力してください。");
      return;
    }
    if (range.from > range.to) {
      setError("カスタム期間は開始日が終了日より前になるように設定してください。");
      return;
    }

    try {
      setError("");
      await loadStats("custom", range);
    } catch (err: unknown) {
      setError((err as Error).message ?? "月間レポートの読み込みに失敗しました。");
    }
  };

  const pullRefreshEnabled = true;
  const executePullRefresh = useCallback(async () => {
    if (!pullRefreshEnabled) return;
    if (pullRefreshing) return;
    setPullRefreshing(true);
    setPullDistance(PULL_REFRESH_HOLD_PX);
    setError("");
    try {
      await refreshAll(statsPeriod);
      setRefreshAnimationSeed((prev) => prev + 1);
    } catch (err: unknown) {
      setError((err as Error).message ?? "最新化に失敗しました。");
    } finally {
      pullEligibleRef.current = false;
      pullDraggingRef.current = false;
      setPullDragging(false);
      setPullRefreshing(false);
      setPullDistance(0);
    }
  }, [pullRefreshing, refreshAll, statsPeriod, pullRefreshEnabled]);

  const handleMainScrollTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!pullRefreshEnabled) return;
      if (pullRefreshing || assignmentOpen || settingsOpen) return;
      const touch = event.touches[0];
      const scroller = mainScrollRef.current;
      if (!touch || !scroller) return;
      pullStartScrollTopRef.current = scroller.scrollTop;
      if (scroller.scrollTop > 0) {
        pullEligibleRef.current = false;
        pullDraggingRef.current = false;
        setPullDragging(false);
        return;
      }

      pullEligibleRef.current = true;
      pullDraggingRef.current = false;
      setPullDragging(false);
      pullStartYRef.current = touch.clientY;
      pullStartXRef.current = touch.clientX;
    },
    [assignmentOpen, pullRefreshing, settingsOpen],
  );

  const handleMainScrollTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!pullRefreshEnabled) return;
      if (!pullEligibleRef.current || pullRefreshing) return;
      const touch = event.touches[0];
      const scroller = mainScrollRef.current;
      if (!touch || !scroller) return;

      if (scroller.scrollTop > 0) {
        pullEligibleRef.current = false;
        pullDraggingRef.current = false;
        setPullDragging(false);
        setPullDistance(0);
        return;
      }

      const dx = touch.clientX - pullStartXRef.current;
      const dy = touch.clientY - pullStartYRef.current;
      const isMostlyVertical = Math.abs(dy) > Math.abs(dx) * 1.2;
      const canRefreshBySwipe = pullStartScrollTopRef.current <= 0 && scroller.scrollTop <= 0;

      if (dy > 0 && isMostlyVertical && canRefreshBySwipe) {
        event.preventDefault();
      }

      if (!pullDraggingRef.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 0.9) {
          pullEligibleRef.current = false;
          pullDraggingRef.current = false;
          setPullDragging(false);
          setPullDistance(0);
          return;
        }
        pullDraggingRef.current = true;
        setPullDragging(true);
      }

      if (dy <= 0) {
        setPullDistance(0);
        return;
      }

      setPullDistance(applyPullResistance(dy));
      event.preventDefault();
      event.stopPropagation();
    },
    [pullRefreshing],
  );

  // React 17+ registers onTouchMove as passive, preventing preventDefault().
  // Register directly with { passive: false } so pull-to-refresh can cancel scroll.
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const handler = (e: Event) => handleMainScrollTouchMove(e as unknown as TouchEvent<HTMLDivElement>);
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, [handleMainScrollTouchMove]);

  const endMainScrollPullGesture = useCallback(() => {
    if (!pullRefreshEnabled) return;
    const shouldHandle = pullDraggingRef.current || pullDistance > 0;
    pullEligibleRef.current = false;

    if (!shouldHandle) return;

    pullDraggingRef.current = false;
    setPullDragging(false);

    if (pullDistance >= PULL_REFRESH_TRIGGER_PX) {
      void executePullRefresh();
      return;
    }

    setPullDistance(0);
  }, [executePullRefresh, pullDistance, pullRefreshEnabled]);

  const handleMainScrollTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!pullRefreshEnabled) return;
      if (pullDraggingRef.current || pullDistance > 0) {
        event.stopPropagation();
      }
      endMainScrollPullGesture();
    },
    [endMainScrollPullGesture, pullDistance],
  );

  const handleMainScrollTouchCancel = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!pullRefreshEnabled) return;
      if (pullDraggingRef.current || pullDistance > 0) {
        event.stopPropagation();
      }
      endMainScrollPullGesture();
    },
    [endMainScrollPullGesture, pullDistance],
  );

  const historyUsers = useMemo(() => boot?.users ?? [], [boot?.users]);
  const historyFilters = useMemo(() => {
    const items = [{ key: "all", label: "全履歴" }];
    historyUsers.forEach((user) => items.push({ key: user.id, label: user.name }));
    return items;
  }, [historyUsers]);

  const historyRecords = useMemo(() => {
    if (!manageDetailTarget) return [];
    return records.filter((record) => {
      if (record.chore.id !== manageDetailTarget.id) return false;
      if (historyFilter === "all") return true;
      return record.user.id === historyFilter;
    });
  }, [historyFilter, manageDetailTarget, records]);

  const historyCountLast30 = useMemo(() => {
    if (!manageDetailTarget) return 0;
    const cutoff = addDays(startOfJstDay(new Date()), -30);
    return records.filter(
      (record) => record.chore.id === manageDetailTarget.id && new Date(record.performedAt) >= cutoff,
    ).length;
  }, [manageDetailTarget, records]);
  const latestRecordItem = useMemo(() => {
    return records
      .filter((record) => !record.isInitial && !record.isSkipped)
      .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime())[0] ?? null;
  }, [records]);
  const groupedTimelineRecords = useMemo(() => buildGroupedTimelineRecords(records), [records]);
  const myTimelineRecords = useMemo(() => {
    if (!sessionUser?.id) return [];
    return records.filter(
      (record) => !record.isInitial && !record.isSkipped && record.user.id === sessionUser.id,
    );
  }, [records, sessionUser?.id]);
  const myGroupedTimelineRecords = useMemo(
    () => buildGroupedTimelineRecords(myTimelineRecords),
    [myTimelineRecords],
  );

  const orderCalendarItemsByHomePreference = useCallback(
    (items: ChoreWithComputed[], dateKey: string) => {
      const baseIds = items.map((item) => item.id);
      if (new Set(baseIds).size !== baseIds.length) {
        return items;
      }
      const orderedIds = applyHomeStoredOrder(baseIds, homeOrderByDate[dateKey] ?? []);
      const itemById = new Map(items.map((item) => [item.id, item]));
      return orderedIds
        .map((id) => itemById.get(id))
        .filter((item): item is ChoreWithComputed => Boolean(item));
    },
    [homeOrderByDate],
  );

  const calendarSelectedWeekEntries = useMemo(() => {
    return calendarSelectedWeekDates.map((date) => {
      const dateKey = toJstDateKey(date);
      const items = calendarScheduleMap.get(dateKey) ?? [];
      const orderedItems = orderCalendarItemsByHomePreference(items, dateKey);
      return {
        date,
        dateKey,
        items: orderedItems,
      };
    });
  }, [calendarScheduleMap, calendarSelectedWeekDates, orderCalendarItemsByHomePreference]);
  const calendarSelectedDayEntries = useMemo(() => {
    const items = calendarScheduleMap.get(calendarSelectedDateKey) ?? [];
    return orderCalendarItemsByHomePreference(items, calendarSelectedDateKey);
  }, [calendarScheduleMap, calendarSelectedDateKey, orderCalendarItemsByHomePreference]);
  const reportMonthKey = useMemo(
    () => monthKeyWithOffset(toMonthKey(new Date()), reportMonthOffset),
    [reportMonthOffset],
  );
  const householdReportDiff = useMemo(() => {
    if (!householdReport) return 0;
    return householdReport.currentMonthTotal - householdReport.previousMonthTotal;
  }, [householdReport]);

  const renderDayDots = useCallback((dateKey: string) => {
    const count = calendarMonthSummary?.countsByDate[dateKey] ?? 0;
    if (count <= 0) return <span className="h-1 w-1 rounded-full bg-transparent" />;
    if (count <= 3) {
      return (
        <span className="mt-0.5 inline-flex items-center gap-0.5">
          {Array.from({ length: count }).map((_, index) => (
            <span
              key={`${dateKey}-dot-${index}`}
              className="h-1 w-1 rounded-full bg-[#1A9BE8]"
            />
          ))}
        </span>
      );
    }

    const hasOverflow = count > DAY_DOT_VISIBLE_WHEN_OVERFLOW;
    const dotCount = hasOverflow
      ? DAY_DOT_VISIBLE_WHEN_OVERFLOW
      : Math.min(MAX_DAY_DOT_SLOTS, count);
    const tokens = [
      ...Array.from({ length: dotCount }, (_, idx) => `dot-${idx}`),
      ...(hasOverflow ? ["plus"] : []),
    ];

    return (
      <span className="mt-0.5 inline-grid grid-cols-3 place-items-center gap-0.5">
        {tokens.map((token, index) => (
          token === "plus" ? (
            <span
              key={`${dateKey}-dot-plus-${index}`}
              className="inline-flex h-1 w-1 items-center justify-center text-[5px] font-bold leading-none text-[#1A9BE8]"
            >
              +
            </span>
          ) : (
            <span
              key={`${dateKey}-${token}`}
              className="h-1 w-1 rounded-full bg-[#1A9BE8]"
            />
          )
        ))}
      </span>
    );
  }, [calendarMonthSummary]);

  const renderChoreEditorSheets = () => (
    <>
      <BottomSheet
        open={choreEditorOpen && !customIconOpen}
        onClose={() => {
          if (saveChoreLoading || deleteChoreLoading) return;
          setChoreEditorOpen(false);
        }}
        title=""
        maxHeightClassName="max-h-[92vh]"
        containerClassName="px-0 pb-4 pt-[10px]"
        scrollable={true}
      >
        <div className="space-y-[14px] px-5 pb-1">
          <p className="text-center text-[24px] font-bold text-[#202124]">
            {editingChore?.id ? "編集" : "登録"}
          </p>
          {editingChore ? (
            <ChoreEditor
              mode={editingChore.id ? "edit" : "create"}
              value={editingChore}
              customIcons={customIcons}
              users={boot?.users ?? []}
              isSaving={saveChoreLoading}
              isDeleting={deleteChoreLoading}
              onChange={setEditingChore}
              onSave={saveChore}
              onDelete={requestDeleteChore}
              onDeleteCustomIcon={handleDeleteCustomIcon}
              onOpenCustomIcon={() => setCustomIconOpen(true)}
            />
          ) : null}
        </div>
      </BottomSheet>

      <BottomSheet open={customIconOpen} onClose={() => setCustomIconOpen(false)} title="" maxHeightClassName="max-h-[92vh]">
        {editingChore ? (
          <CustomIconPicker
            value={editingChore}
            onChange={setEditingChore}
            onApply={async (iconData) => {
              const saved = await handleAddCustomIcon(iconData);
              if (saved) {
                setEditingChore((prev) =>
                  prev
                    ? {
                      ...prev,
                      icon: saved.icon,
                      iconColor: saved.iconColor,
                      bgColor: saved.bgColor,
                    }
                    : prev,
                );
              }
              setCustomIconOpen(false);
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA]">
        <Loader2 className="h-8 w-8 animate-spin text-[#5F6368]" />
      </main>
    );
  }

  if (postRegisterRoutingPending || !boot || boot.needsRegistration || !sessionUser) {
    return (
      <main className="min-h-screen overflow-y-auto bg-gradient-to-b from-[#F8F9FA] to-[#EEF3FD]">
        <form
          onSubmit={registerUser}
          className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center gap-4 px-5 py-8"
        >
          <div className="rounded-[20px] bg-[#E8F0FE] p-5">
            <span className="material-symbols-rounded text-[44px] text-[#1A9BE8]">auto_awesome</span>
          </div>
          <p className="text-[42px] font-bold leading-none text-[#202124]">さあ、始めましょう</p>

          <div className="flex items-center justify-center gap-2">
            <span className="rounded-full bg-[#1A9BE8] px-4 py-2 text-[13px] font-bold text-white">はじめての方</span>
            <span className="rounded-full border border-[#DADCE0] bg-white px-4 py-2 text-[13px] font-semibold text-[#5F6368]">招待された方</span>
          </div>

          <div className="w-full space-y-3 rounded-[20px] border border-[#DADCE0] bg-white px-[18px] py-4">
            <div className="flex items-center gap-2">
              <User size={22} className="text-[#1A9BE8]" aria-hidden="true" />
              <p className="text-[24px] font-bold text-[#202124]">ログイン / 新規登録</p>
            </div>
            <div className="space-y-1">
              <p className="text-[13px] font-semibold text-[#5F6368]">ユーザーネーム</p>
              <input
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="あなたの名前"
                autoComplete="username"
                className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[16.8px] font-semibold text-[#202124] outline-none placeholder:text-[14px] placeholder:font-medium placeholder:text-[#9AA0A6]"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[13px] font-semibold text-[#5F6368]">パスワード</p>
              <input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="8文字以上"
                autoComplete="current-password"
                className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[16.8px] font-semibold text-[#202124] outline-none placeholder:text-[14px] placeholder:font-medium placeholder:text-[#9AA0A6]"
              />
            </div>
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] text-[#5F6368]">🏷️</span>
                <p className="text-[15px] font-bold text-[#202124]">家族コード</p>
                <p className="text-[13px] font-medium text-[#9AA0A6]">（任意）</p>
              </div>
              <input
                value={registerInviteCode}
                onChange={(e) => setRegisterInviteCode(e.target.value)}
                placeholder="パートナーから届いたコード"
                className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[16px] font-semibold text-[#202124] outline-none placeholder:text-[14px] placeholder:font-medium placeholder:text-[#9AA0A6]"
              />
              <p className="text-[11px] font-medium text-[#9AA0A6]">パートナーが先に登録済みの場合のみ入力</p>
            </div>
          </div>

          <div className="w-full space-y-2 px-1">
            <div className="flex items-center gap-1.5">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#1A9BE8] text-[11px] font-bold text-white">1</span>
              <p className="text-[12px] font-medium text-[#5F6368]">はじめての方：ユーザーネームとパスワードを決めて登録</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#33C28A] text-[11px] font-bold text-white">2</span>
              <p className="text-[12px] font-medium text-[#5F6368]">すでに登録済みの方：同じユーザーネームとパスワードでログイン</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={registerLoading}
            className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#1A9BE8] px-4 py-3 text-[16.8px] font-bold text-white shadow-lg shadow-[#2A1E1730] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {registerLoading ? <Loader2 size={18} className="animate-spin" /> : <span className="material-symbols-rounded text-[18px] leading-none">arrow_forward</span>}
            {registerLoading ? "読み込み中..." : "はじめる"}
          </button>
          <div className="flex flex-wrap justify-center gap-2">
            {USER_COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setRegisterColor(c)}
                className={`h-6 w-6 rounded-full ${registerColor === c ? "ring-2 ring-[#202124] ring-offset-2" : ""}`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
          {error ? <p className="mt-2 text-center text-sm text-[#C5221F]">{error}</p> : null}
        </form>
      </main>
    );
  }

  if (onboardingOpen) {
    const inviteCode = boot.householdInviteCode ?? "";
    const inviteLink =
      typeof window === "undefined"
        ? `https://ietasuku.vercel.app/?invite=${inviteCode}`
        : `${window.location.origin}/?invite=${inviteCode}`;

    const hasChores = boot.chores.length > 0;

    return (
      <>
        <main className="mx-auto flex h-screen w-full max-w-[430px] flex-col overflow-y-auto overscroll-y-contain bg-[#F8F9FA] px-5 py-8">
          <div className="mt-8 space-y-5">
            <div className="text-center">
              <span className="material-symbols-rounded text-[42px] text-[#1A9BE8]">home</span>
              <p className="mt-1.5 text-[42px] font-bold leading-none text-[#202124]">いえたすくへようこそ！</p>
            </div>

            <div className="space-y-2">
              <p className="text-[16px] font-bold text-[#202124]">まずはパートナーを招待</p>
              <p className="text-[13px] font-medium text-[#5F6368]">一緒に使う家族やパートナーにこのリンクを送ってね！</p>
              <div className="space-y-2 rounded-[14px] border border-[#DADCE0] bg-white p-3">
                <p className="truncate rounded-[10px] bg-[#F1F3F4] px-3 py-2 text-[12px] font-medium text-[#5F6368]">{inviteLink}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteLink);
                        setInfoMessage("招待リンクをコピーしました。");
                      } catch {
                        setError("リンクのコピーに失敗しました。");
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-[10px] border border-[#DADCE0] bg-white px-3 py-2 text-[13px] font-bold text-[#1A73E8]"
                  >
                    <Copy size={14} />
                    コピー
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (navigator.share) {
                        try {
                          await navigator.share({ title: "いえたすく 招待", text: inviteLink, url: inviteLink });
                          return;
                        } catch {
                          return;
                        }
                      }
                      try {
                        await navigator.clipboard.writeText(inviteLink);
                        setInfoMessage("招待リンクをコピーしました。");
                      } catch {
                        setError("リンクの共有に失敗しました。");
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-[10px] bg-[#1A9BE8] px-3 py-2 text-[13px] font-bold text-white"
                  >
                    <Share2 size={14} />
                    送る
                  </button>
                </div>
              </div>
              <p className="text-[12px] font-medium text-[#9AA0A6]">LINEやメッセージに貼り付けするだけで参加できるよ！</p>
            </div>

            <div className="space-y-2">
              <p className="text-[16px] font-bold text-[#202124]">家事を登録しよう</p>
              <button
                type="button"
                onClick={() => {
                  openAddChore();
                }}
                className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[15px] font-bold text-[#1A9BE8]"
              >
                ＋ タスクを追加
              </button>
              <button
                type="button"
                onClick={() => {
                  setOnboardingBulkSelectOpen(true);
                }}
                disabled={onboardingSubmitting || onboardingBulkSelectOpen}
                className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[15px] font-semibold text-[#202124] disabled:opacity-60"
              >
                🏠 よくある家事をまとめて追加
              </button>
              {onboardingBulkSelectOpen ? (
                <div className="space-y-2 rounded-[14px] border border-[#DADCE0] bg-white p-3">
                  <p className="text-[14px] font-bold text-[#202124]">家事まとめて追加</p>
                  <div className="space-y-1.5">
                    {ONBOARDING_PRESET_CHORES.map((preset) => {
                      const checked = onboardingPresetSelections.includes(preset.title);
                      return (
                        <button
                          key={`onboarding-preset-${preset.title}`}
                          type="button"
                          onClick={() => {
                            setOnboardingPresetSelections((prev) =>
                              prev.includes(preset.title)
                                ? prev.filter((title) => title !== preset.title)
                                : [...prev, preset.title],
                            );
                          }}
                          className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left ${checked ? "bg-[#E8F2FF]" : "bg-[#F8F9FA]"}`}
                        >
                          <span className="text-[13px] font-semibold text-[#202124]">{preset.title}</span>
                          <span className="material-symbols-rounded text-[18px] text-[#1A9BE8]">
                            {checked ? "check_circle" : "radio_button_unchecked"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setOnboardingBulkSelectOpen(false)}
                      disabled={onboardingSubmitting}
                      className="rounded-[10px] border border-[#DADCE0] bg-white px-3 py-2 text-[13px] font-bold text-[#5F6368] disabled:opacity-60"
                    >
                      戻る
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleOnboardingAddPreset();
                      }}
                      disabled={onboardingSubmitting}
                      className="rounded-[10px] bg-[#1A9BE8] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-60"
                    >
                      {onboardingSubmitting ? "追加中..." : "追加する"}
                    </button>
                  </div>
                </div>
              ) : null}
              {hasChores ? (
                <div className="rounded-[14px] border border-[#DADCE0] bg-white p-3">
                  <p className="text-[13px] font-bold text-[#5F6368]">追加したタスク（{boot.chores.length}件）</p>
                  <div className="mt-2 space-y-1">
                    {boot.chores.map((chore) => {
                      const ChoreIcon = iconByName(chore.icon || "sparkles");
                      return (
                        <div key={`onboarding-chore-${chore.id}`} className="flex items-center gap-2 rounded-[8px] bg-[#F8F9FA] px-3 py-1.5">
                          <ChoreIcon size={16} style={{ color: chore.iconColor || "#5F6368" }} />
                          <span className="text-[13px] font-medium text-[#202124]">{chore.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={finishOnboarding}
              disabled={onboardingSubmitting}
              className={
                hasChores
                  ? "w-full rounded-[14px] bg-[#1A9BE8] px-4 py-3 text-[16px] font-bold text-white disabled:opacity-60"
                  : "w-full rounded-[14px] bg-[#F1F3F4] px-4 py-3 text-[14px] font-semibold text-[#5F6368] disabled:opacity-60"
              }
            >
              {hasChores ? "完了してホームへ" : "あとで設定する"}
            </button>
            {error ? <p className="text-center text-sm text-[#C5221F]">{error}</p> : null}
          </div>
        </main>
        {renderChoreEditorSheets()}
      </>
    );
  }

  const todayKey = homeDateKeys.today;
  const yesterdayKey = homeDateKeys.yesterday;
  const tomorrowKey = homeDateKeys.tomorrow;
  const getHomeSectionDateKey = (sectionKey: "today" | "yesterday" | "tomorrow") => {
    if (sectionKey === "yesterday") return yesterdayKey;
    if (sectionKey === "tomorrow") return tomorrowKey;
    return todayKey;
  };

  const resolveAssigneeForSort = (
    choreId: string,
    sectionKey: "today" | "yesterday" | "tomorrow" | "big",
    choreRef?: ChoreWithComputed,
  ) => {
    const sectionDateKey =
      sectionKey === "big" && choreRef?.dueAt
        ? toJstDateKey(startOfJstDay(new Date(choreRef.dueAt)))
        : getHomeSectionDateKey(sectionKey === "big" ? "today" : sectionKey);
    const entry = assignments.find((x) => x.choreId === choreId && x.date === sectionDateKey);
    const clearKey = `${choreId}:${sectionDateKey}`;
    const isDefaultCleared = clearedDefaults.has(clearKey);
    const chore = choreRef ?? boot.chores.find((c) => c.id === choreId);
    if (entry) return entry.userId;
    if (!isDefaultCleared && chore?.defaultAssigneeId) return chore.defaultAssigneeId;
    return null;
  };

  const homeProgressByDate = boot.homeProgressByDate ?? {};
  const yesterdayRowsForHome = buildHomeRowsByDate({
    chores,
    dateKey: yesterdayKey,
    scheduleOverridesByChore,
    homeProgressByDate,
  });
  const todayRowsForHome = buildHomeRowsByDate({
    chores,
    dateKey: todayKey,
    scheduleOverridesByChore,
    homeProgressByDate,
  });
  const tomorrowRowsForHome = buildHomeRowsByDate({
    chores,
    dateKey: tomorrowKey,
    scheduleOverridesByChore,
    homeProgressByDate,
  });

  const orderHomeRows = (
    sectionKey: "today" | "yesterday" | "tomorrow",
    dateKey: string,
    sectionRows: typeof todayRowsForHome,
  ) => {
    const sortedChores = sortHomeSectionChores(
      sectionKey,
      sectionRows.map((row) => row.chore),
      sessionUser?.id ?? null,
      (choreId) => {
        const found = sectionRows.find((row) => row.chore.id === choreId)?.chore;
        return resolveAssigneeForSort(choreId, sectionKey, found);
      },
      customIcons,
    );
    const orderedIds = applyHomeStoredOrder(
      sortedChores.map((chore) => chore.id),
      homeOrderByDate[dateKey] ?? [],
    );
    const rowMap = new Map(sectionRows.map((row) => [row.chore.id, row]));
    return orderedIds
      .map((id) => rowMap.get(id))
      .filter((row): row is (typeof sectionRows)[number] => Boolean(row));
  };

  const homeSections = [
    {
      key: "yesterday" as const,
      title: "きのうのにんむ",
      rows: orderHomeRows("yesterday", yesterdayKey, yesterdayRowsForHome),
    },
    {
      key: "today" as const,
      title: "きょうのにんむ",
      rows: orderHomeRows("today", todayKey, todayRowsForHome),
    },
    {
      key: "tomorrow" as const,
      title: "あしたのにんむ",
      rows: orderHomeRows("tomorrow", tomorrowKey, tomorrowRowsForHome),
    },
  ].map((section) => ({
    ...section,
    doneCount: countDoneHomeOccurrences(section.rows),
    totalCount: countTotalHomeOccurrences(section.rows),
  }));
  homeSectionChoreIdsRef.current = Object.fromEntries(
    homeSections.map((section) => [
      getHomeSectionDateKey(section.key),
      section.rows.map((row) => row.chore.id),
    ]),
  );
  const hasAnyUpcomingChores = homeSections.some((section) => section.rows.length > 0);
  const swipeProgress = swipe.visual.progress;
  const swipeFromTabIndex = Math.max(0, TAB_ORDER.indexOf(swipe.visual.fromTab));
  const swipeTrackTranslatePercent = (-swipeFromTabIndex + swipeProgress) * 100;
  const isSwipeSheetMoving =
    swipe.visual.isDragging || swipe.visual.isAnimating || Math.abs(swipeProgress) > 0.0001;
  const swipeTrackTransitionStyle = swipe.visual.isDragging
    ? "none"
    : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
  const pullRefreshProgress = Math.min(1, pullDistance / PULL_REFRESH_TRIGGER_PX);
  const showPullRefreshHint = pullRefreshEnabled && (pullRefreshing || pullDistance > 0);
  const pullRefreshMessage = pullRefreshing
    ? "読み込み中..."
    : pullRefreshProgress >= 1
      ? "指を離して読み込み"
      : "下にスワイプして読み込み";
  const getPullAnimatedContentStyle = (tab: TabKey) =>
    pullRefreshEnabled && tab === activeTab
      ? {
        transform: pullDistance === 0 ? "none" : `translate3d(0, ${pullDistance}px, 0)`,
        transition:
          pullDragging || pullRefreshing ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      }
      : undefined;
  const renderInlinePullRefreshHint = (tab: TabKey) => {
    if (!pullRefreshEnabled) return null;
    if (!showPullRefreshHint || tab !== activeTab) return null;
    return (
      <div className="py-2 text-center">
        <p className="text-[12px] font-bold text-[#5F6368]">{pullRefreshMessage}</p>
      </div>
    );
  };
  const assignmentSwipeProgress = assignmentTabSwipe.visual.progress;
  const assignmentSwipeFromTabIndex = Math.max(
    0,
    ASSIGNMENT_TAB_ORDER.indexOf(assignmentTabSwipe.visual.fromTab),
  );
  const assignmentSwipeTrackTranslatePercent =
    (-assignmentSwipeFromTabIndex + assignmentSwipeProgress) * 100;
  const isAssignmentSwipeSheetMoving =
    assignmentTabSwipe.visual.isDragging ||
    assignmentTabSwipe.visual.isAnimating ||
    Math.abs(assignmentSwipeProgress) > 0.0001;
  const assignmentSwipeTrackTransitionStyle = assignmentTabSwipe.visual.isDragging
    ? "none"
    : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";

  const renderAssignmentTabContent = (tab: AssignmentTabKey) => {
    const days = assignmentDaysByTab[tab];
    return (
      <div className="space-y-3">
        {days.slice(0, visibleAssignDays).map(({ date, dateKey, dayChores }) => (
          <div key={`${tab}-${dateKey}`} className="space-y-1">
            <p className="text-[13px] font-bold text-[#5F6368]">
              {formatMonthDay(date.toISOString())}
            </p>
            <div className="rounded-[14px] bg-white">
              {dayChores.map((chore, idx) => {
                const entry = assignments.find(
                  (x) => x.choreId === chore.id && x.date === dateKey,
                );
                const clearKey = `${chore.id}:${dateKey}`;
                const isCleared = clearedDefaults.has(clearKey);
                const isDefaultOnly = !entry && !!chore.defaultAssigneeId && !isCleared;
                const effectiveUserId = entry?.userId ?? (isDefaultOnly ? chore.defaultAssigneeId : null);
                const effectiveUserName = entry?.userName ?? (isDefaultOnly ? chore.defaultAssigneeName : null);
                const isAssigned = assignmentUser
                  ? effectiveUserId === assignmentUser
                  : false;
                const effectiveUser = effectiveUserId ? boot.users.find((u) => u.id === effectiveUserId) : null;
                const effectiveColor = effectiveUser?.color || "#202124";
                const checkboxColor = effectiveUserId ? (effectiveUser?.color || "#1A9BE8") : "#DADCE0";

                return (
                  <button
                    key={chore.id}
                    type="button"
                    onClick={() => {
                      if (!assignmentUser) return;
                      const newUserId = isAssigned ? null : assignmentUser;
                      // デフォルト担当者のチェックを外す
                      if (isDefaultOnly && isAssigned) {
                        setClearedDefaults((prev) => { const next = new Set(prev); next.add(clearKey); return next; });
                        apiFetch("/api/assignments", {
                          method: "POST",
                          body: JSON.stringify({ choreId: chore.id, userId: null, date: dateKey }),
                        }).catch(() => setError("担当の保存に失敗しました。"));
                        return;
                      }
                      // デフォルト担当者を再チェック → clearedから削除するだけ
                      if (isCleared && newUserId === chore.defaultAssigneeId) {
                        setClearedDefaults((prev) => { const next = new Set(prev); next.delete(clearKey); return next; });
                        return;
                      }
                      if (newUserId) {
                        setClearedDefaults((prev) => { const next = new Set(prev); next.delete(clearKey); return next; });
                      }
                      startTransition(() => {
                        setAssignments((prev) => {
                          const filtered = prev.filter((x) => !(x.choreId === chore.id && x.date === dateKey));
                          if (newUserId) {
                            const userName = boot?.users.find((u) => u.id === newUserId)?.name ?? "";
                            filtered.push({ choreId: chore.id, userId: newUserId, userName, date: dateKey });
                          }
                          return filtered;
                        });
                      });
                      apiFetch("/api/assignments", {
                        method: "POST",
                        body: JSON.stringify({ choreId: chore.id, userId: newUserId, date: dateKey }),
                      }).catch(() => setError("担当の保存に失敗しました。"));
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-[7px] text-left ${idx > 0 ? "border-t border-[#F1F3F4]" : ""}`}
                    style={{
                      backgroundColor: effectiveUserId
                        ? lightenColor(effectiveColor, 0.95)
                        : "transparent",
                    }}
                  >
                    <span
                      className="material-symbols-rounded text-[20px]"
                      style={{ color: checkboxColor }}
                    >
                      {effectiveUserId ? "check_box" : "check_box_outline_blank"}
                    </span>
                    <span
                      className="flex-1 flex items-center gap-1 text-[13.5px] font-medium min-w-0 text-[#202124]"
                    >
                      <span className="truncate">{chore.title}</span>
                    </span>
                    {!effectiveUserId && (
                      <span className="shrink-0 rounded-full bg-[#BDC1C6] px-2 py-[2px] text-[10px] font-bold text-white">
                        未設定
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {visibleAssignDays < days.length ? (
          <div
            ref={assignmentTab === tab ? assignSentinelRef : undefined}
            className="flex justify-center py-3"
          >
            <button
              type="button"
              onClick={() => setVisibleAssignDays((prev) => Math.min(prev + 30, days.length))}
              className="rounded-xl bg-white px-4 py-2 text-[13px] font-bold text-[#5F6368] shadow-sm"
            >
              もっと見る
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderTabHeader = (tab: TabKey) => {
    if (tab === "home") {
      const topDate = topDateWithWeekday();
      return (
        <div ref={homeHeaderRef} className="border-b border-[#D7DCE2] bg-[#F8F9FA]/95 px-4 pb-3 pt-3 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleSettingsFromHeader}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white"
              aria-label={settingsOpen ? "設定を閉じる" : "設定を開く"}
            >
              <span className="material-symbols-rounded text-[26px]" style={{ color: sessionUser?.color ?? "#1A9BE8" }}>
                account_circle
              </span>
            </button>
            <p className="text-[44px] font-bold leading-none text-[#5F6368]">{topDate}</p>
            <div className="h-8 w-8" />
          </div>
        </div>
      );
    }
    if (tab === "list") {
      const calendarMonthTitle = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "long",
      }).format(calendarMonthCursor);
      return (
        <div ref={listHeaderRef} className="space-y-2 bg-[#F8F9FA]/95 px-5 pb-2 pt-4 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleSettingsFromHeader}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
              aria-label={settingsOpen ? "設定を閉じる" : "設定を開く"}
            >
              <span className="material-symbols-rounded text-[32px]" style={{ color: sessionUser?.color ?? "#1A9BE8" }}>
                account_circle
              </span>
            </button>
            <div className="flex items-center justify-end gap-2">
              <div className="flex items-center rounded-[8px] bg-[#F1F3F4] p-[3px]">
                <button
                  type="button"
                  onClick={() => setCalendarExpanded(false)}
                  className={`rounded-[6px] px-[14px] py-[6px] text-[13px] ${calendarExpanded ? "text-[#9AA0A6]" : "bg-white font-bold text-[#202124]"}`}
                >
                  週
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarExpanded(true)}
                  className={`rounded-[6px] px-[14px] py-[6px] text-[13px] ${calendarExpanded ? "bg-white font-bold text-[#202124]" : "text-[#9AA0A6]"}`}
                >
                  月
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (calendarExpanded) {
                    shiftCalendarMonth(-1);
                    return;
                  }
                  shiftCalendarWeek(-1);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#5F6368]"
                aria-label={calendarExpanded ? "前月へ" : "前週へ"}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCalendarExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#5F6368]"
              >
                {calendarMonthTitle}
                <ChevronDown size={15} className={calendarExpanded ? "rotate-180" : ""} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (calendarExpanded) {
                    shiftCalendarMonth(1);
                    return;
                  }
                  shiftCalendarWeek(1);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#5F6368]"
                aria-label={calendarExpanded ? "次月へ" : "次週へ"}
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => openStandaloneScreen("manage", "list")}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-[#E5EAF0] bg-white px-2 text-[11px] font-bold text-[#5F6368]"
              >
                <span className="material-symbols-rounded text-[15px]">checklist</span>
                家事管理
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (tab === "records") {
      return (
        <div ref={recordsHeaderRef} className="bg-[#F8F9FA]/95 px-5 pb-3 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleSettingsFromHeader}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
              aria-label={settingsOpen ? "設定を閉じる" : "設定を開く"}
            >
              <span className="material-symbols-rounded text-[32px]" style={{ color: sessionUser?.color ?? "#1A9BE8" }}>
                account_circle
              </span>
            </button>
            <p className="text-[28px] font-bold leading-none text-[#202124]">みんなのきろく</p>
            <div className="h-9 w-9" />
          </div>
        </div>
      );
    }
    if (tab === "stats") {
      return (
        <div ref={statsHeaderRef} className="space-y-2 bg-[#F8F9FA]/95 px-5 pb-3 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleSettingsFromHeader}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
              aria-label={settingsOpen ? "設定を閉じる" : "設定を開く"}
            >
              <span className="material-symbols-rounded text-[32px]" style={{ color: sessionUser?.color ?? "#1A9BE8" }}>
                account_circle
              </span>
            </button>
            <div className="text-center">
              <p className="text-[28px] font-bold leading-none text-[#202124]">月間レポート</p>
            </div>
            <div className="w-9" />
          </div>
          <div className="flex gap-1 rounded-[12px] bg-[#E9EEF6] p-1">
            {REPORT_MONTH_OFFSETS.map((offset) => (
              <button
                key={offset}
                type="button"
                onClick={() => setReportMonthOffset(offset)}
                className={`flex-1 rounded-[10px] px-2 py-1.5 text-[12.5px] font-bold ${reportMonthOffset === offset ? "bg-white text-[#202124] shadow-sm" : "text-[#5F6368]"}`}
              >
                {REPORT_MONTH_LABELS[offset]}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const renderTimelineRecords = (timelineGroups: TimelineRecordGroup[], emptyMessage: string) => {
    if (timelineGroups.length === 0) {
      return (
        <div className="rounded-[20px] border border-dashed border-[#DADCE0] bg-white px-5 py-10 text-center">
          <p className="text-[16px] font-bold text-[#202124]">まだ きろく がありません</p>
          <p className="mt-2 text-[13px] font-medium text-[#5F6368]">{emptyMessage}</p>
        </div>
      );
    }

    return timelineGroups.map((group) => (
      <div key={`record-group-${group.dateKey}`} className="space-y-2">
        <p className="text-[16px] font-bold text-[#202124]">{group.label}</p>
        <div className="space-y-2">
          {group.items.map((record) => {
            const choreForIcon = chores.find((ch) => ch.id === record.chore.id);
            const RecordIcon = iconByName(choreForIcon?.icon ?? "sparkles");
            const myReaction = (record.reactions ?? []).find((reaction) => reaction.userId === sessionUser.id);
            const reactionCounts = (record.reactions ?? []).reduce<Record<string, number>>((acc, reaction) => {
              acc[reaction.emoji] = (acc[reaction.emoji] ?? 0) + 1;
              return acc;
            }, {});
            const visibleReactions = REACTION_CHOICES.filter((emoji) => (reactionCounts[emoji] ?? 0) > 0);
            return (
              <div key={record.id} className="space-y-1">
                <div className="rounded-[14px] border border-[#E5EAF0] bg-white px-3 py-3">
                  <div className="flex items-center gap-2">
                    <RecordIcon size={16} color={choreForIcon?.iconColor ?? "#5F6368"} />
                    <p className="text-[15px] font-bold text-[#202124]">{record.chore.title}</p>
                    <span className="text-[12px] text-[#BDC1C6]">──</span>
                    <p className="text-[13px] font-semibold text-[#5F6368]">{record.user.name}</p>
                    <p className="ml-auto text-[11px] font-medium text-[#9AA0A6]">
                      {new Intl.DateTimeFormat("ja-JP", {
                        timeZone: "Asia/Tokyo",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(record.performedAt))}
                    </p>
                  </div>
                  {record.memo ? (
                    <p className="mt-1 text-[12px] font-medium text-[#5F6368]">「{record.memo}」</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 px-1">
                  {visibleReactions.map((emoji) => {
                    const mapped = REACTION_ICON_MAP[emoji];
                    const selected = myReaction?.emoji === emoji;
                    const count = reactionCounts[emoji] ?? 0;
                    return (
                      <button
                        key={`${record.id}-${emoji}`}
                        type="button"
                        onClick={() => {
                          void toggleReaction(record, emoji);
                        }}
                        disabled={reactionUpdatingId === record.id}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-bold ${selected ? "bg-[#E8F2FF]" : "bg-transparent"} disabled:opacity-50`}
                      >
                        <span className="material-symbols-rounded text-[18px]" style={{ color: mapped?.color ?? "#5F6368" }}>
                          {mapped?.icon ?? "add_reaction"}
                        </span>
                        {count > 1 ? <span className="text-[11px] text-[#5F6368]">{count}</span> : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setReactionPickerRecordId((prev) => (prev === record.id ? null : record.id));
                    }}
                    disabled={reactionUpdatingId === record.id}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-[#BDBDBD] disabled:opacity-50"
                  >
                    <span className="material-symbols-rounded text-[18px]">add_reaction</span>
                  </button>
                </div>
                {reactionPickerRecordId === record.id ? (
                  <div className="flex items-center gap-2 px-1">
                    {REACTION_CHOICES.map((emoji) => {
                      const mapped = REACTION_ICON_MAP[emoji];
                      const selected = myReaction?.emoji === emoji;
                      return (
                        <button
                          key={`${record.id}-picker-${emoji}`}
                          type="button"
                          onClick={() => {
                            void toggleReaction(record, emoji);
                            setReactionPickerRecordId(null);
                          }}
                          disabled={reactionUpdatingId === record.id}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${selected ? "bg-[#E8F2FF]" : "bg-white"} disabled:opacity-50`}
                        >
                          <span className="material-symbols-rounded text-[18px]" style={{ color: mapped.color }}>
                            {mapped.icon}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    ));
  };

  const renderMainTabContent = (tab: TabKey) => {
    if (tab === "home") {
      return (
        <div className="space-y-[10px]" style={{ paddingTop: homeHeaderHeight }}>
          <div className="space-y-[10px]" style={getPullAnimatedContentStyle(tab)}>
            {renderInlinePullRefreshHint(tab)}
            {hasAnyUpcomingChores ? (
              <>
                {homeSections.map((section) => {
                  const sectionDateKey = getHomeSectionDateKey(section.key);
                  return (
                    <div
                      key={section.key}
                      data-drop-date={sectionDateKey}
                      className={`space-y-[6px] rounded-[10px] ${dragTargetDateKey === sectionDateKey ? "bg-[#EEF4FE] px-1 py-1" : ""}`}
                      onDragOver={(event) => {
                        if (!draggingChore) return;
                        event.preventDefault();
                        setDragTargetDateKey(sectionDateKey);
                        setHomeDropTarget(null);
                      }}
                      onDragLeave={() => {
                        setDragTargetDateKey((prev) => (prev === sectionDateKey ? null : prev));
                        setHomeDropTarget(null);
                      }}
                      onDrop={(event) => {
                        if (!draggingChore) return;
                        event.preventDefault();
                        setHomeDropTarget(null);
                        if (dragSourceDateKey === sectionDateKey) {
                          clearDragState();
                          return;
                        }
                        void dropDraggedChoreToDate(sectionDateKey);
                      }}
                    >
                      <div
                        className="sticky z-20 bg-[#F8F9FA]/95 pb-1 pt-1 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85"
                        style={{ top: 0 }}
                      >
                        <HomeSectionTitle title={`${section.title}（${section.doneCount}/${section.totalCount}）`} />
                        {section.key === "tomorrow" ? (
                          <p className="mt-0.5 text-[12px] font-medium text-[#5F6368]">今日やっちゃってもOK！</p>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 items-stretch gap-2">
                        {section.rows.length === 0 ? (
                          <p className="py-2 text-center text-[12px] font-medium text-[#BDC1C6]">予定なし</p>
                        ) : section.rows.map((row, choreIndex) => {
                          const chore = row.chore;
                          const assignedEntry = assignments.find(
                            (x) => x.choreId === chore.id && x.date === sectionDateKey,
                          );
                          const isDefaultCleared = clearedDefaults.has(`${chore.id}:${sectionDateKey}`);
                          const effectiveAssigneeId = assignedEntry?.userId ?? (isDefaultCleared ? null : chore.defaultAssigneeId) ?? null;
                          const assigneeName = assignedEntry?.userName ?? (isDefaultCleared ? null : chore.defaultAssigneeName) ?? null;
                          const assigneeUser = effectiveAssigneeId ? boot.users.find((u) => u.id === effectiveAssigneeId) : null;
                          const assigneeColor = assigneeUser?.color ?? null;
                          const disableTomorrowDailyCheck = false;
                          const performerUser = chore.lastPerformerId ? boot.users.find((u) => u.id === chore.lastPerformerId) : null;
                          const performerColor = performerUser?.color ?? null;
                          const displayChore = chore;
                          const isHomeDropTarget =
                            homeDropTarget?.targetDateKey === sectionDateKey &&
                            homeDropTarget.targetChoreId === chore.id;
                          const showDropBefore = isHomeDropTarget && homeDropTarget.position === "before";
                          const showDropAfter = isHomeDropTarget && homeDropTarget.position === "after";
                          const homeRowKey = `${sectionDateKey}-${chore.id}-${choreIndex}`;
                          return (
                            <div
                              key={homeRowKey}
                              draggable
                              data-home-drop-date={sectionDateKey}
                              data-home-drop-chore-id={chore.id}
                              className={`${showDropBefore ? "border-t-2 border-[#1A73E8] pt-1" : ""} ${showDropAfter ? "border-b-2 border-[#1A73E8] pb-1" : ""}`}
                              onDragStart={(event) => {
                                beginChoreDrag(displayChore, sectionDateKey);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", chore.id);
                              }}
                              onDragOver={(event) => {
                                if (!draggingChore) return;
                                event.preventDefault();
                                event.stopPropagation();
                                const position = resolveDropPosition(event.clientY, event.currentTarget);
                                setDragTargetDateKey(sectionDateKey);
                                setHomeDropTarget({
                                  targetDateKey: sectionDateKey,
                                  targetChoreId: chore.id,
                                  position,
                                });
                              }}
                              onDragLeave={(event) => {
                                event.stopPropagation();
                                setHomeDropTarget((previous) => {
                                  if (
                                    previous &&
                                    previous.targetDateKey === sectionDateKey &&
                                    previous.targetChoreId === chore.id
                                  ) {
                                    return null;
                                  }
                                  return previous;
                                });
                              }}
                              onDrop={(event) => {
                                if (!draggingChore) return;
                                event.preventDefault();
                                event.stopPropagation();
                                const position = resolveDropPosition(event.clientY, event.currentTarget);
                                handleHomeDrop({
                                  targetDateKey: sectionDateKey,
                                  targetChoreId: chore.id,
                                  position,
                                });
                              }}
                              onDragEnd={clearDragState}
                              onPointerDown={(event) => handleChorePointerDown(displayChore, sectionDateKey, event)}
                              style={{ touchAction: "none" }}
                            >
                              <HomeTaskRow
                                chore={displayChore}
                                onRecord={(target) => openMemo(target, sectionDateKey)}
                                onUndo={requestUndoRecord}
                                meta={`${row.completed + row.skipped}/${row.total} ・ 完了${row.completed} / スキップ${row.skipped} / 残り${row.pending}`}
                                isUpdating={recordUpdatingIds.includes(chore.id)}
                                recordDisabled={disableTomorrowDailyCheck}
                                assigneeName={assigneeName}
                                assigneeColor={assigneeColor}
                                performerColor={performerColor}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#CFD8E3] bg-white px-5 py-8 text-center">
                <p className="text-[16px] font-bold text-[#202124]">近日実施するべきタスクはありません</p>
                <p className="mt-2 text-[13px] font-medium text-[#5F6368]">
                  必要な家事を追加すると、ここに表示されます。
                </p>
                <button
                  type="button"
                  onClick={openAddChore}
                  className="mt-4 rounded-[12px] bg-[#1A9BE8] px-4 py-2 text-[14px] font-bold text-white"
                >
                  家事を追加
                </button>
              </div>
            )}
            {latestRecordItem ? (
              <div className="space-y-[6px]">
                <div className="sticky z-20 bg-[#F8F9FA]/95 pb-1 pt-1 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85" style={{ top: 0 }}>
                  <HomeSectionTitle title="さいしんのきろく" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 rounded-[12px] border border-[#E5EAF0] bg-white px-3 py-2.5">
                    <span className="material-symbols-rounded text-[14px] text-[#33C28A]">check</span>
                    <p className="text-[13.5px] font-bold text-[#202124]">{latestRecordItem.chore.title}</p>
                    <p className="text-[12px] font-semibold text-[#5F6368]">{latestRecordItem.user.name}</p>
                    <p className="ml-auto text-[11px] font-medium text-[#9AA0A6]">
                      {new Intl.DateTimeFormat("ja-JP", {
                        timeZone: "Asia/Tokyo",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(latestRecordItem.performedAt))}
                    </p>
                  </div>
                  {latestRecordItem.memo ? (
                    <p className="px-1 text-[12px] font-medium text-[#5F6368]">「{latestRecordItem.memo}」</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    if (tab === "list") {
      const todayKey = toJstDateKey(startOfJstDay(new Date()));
      const currentMonthKey = toMonthKey(calendarMonthCursor);
      const calendarMonthLabel = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "long",
      }).format(calendarMonthCursor);
      const selectedDate = startOfJstDay(new Date(`${calendarSelectedDateKey}T00:00:00+09:00`));
      const selectedDateJst = new Date(selectedDate.getTime() + 9 * 60 * 60 * 1000);
      const selectedDateLabel = `${WEEKDAY_SHORT[selectedDateJst.getUTCDay()]} ${selectedDateJst.getUTCDate()}`;
      const previousWeekTarget = shiftTargetDateByWeek(-1);
      const nextWeekTarget = shiftTargetDateByWeek(1);

      const renderCalendarChip = (chore: ChoreWithComputed, dateKey: string, chipIndex: number) => {
        const ChipIcon = iconByName(chore.icon);
        const performerUser = chore.lastPerformerId
          ? boot.users.find((user) => user.id === chore.lastPerformerId)
          : null;
        const doneColor = performerUser?.color ?? "#33C28A";
        const performedDateKey =
          chore.lastPerformedAt && !chore.lastRecordSkipped && !chore.lastRecordIsInitial
            ? toJstDateKey(startOfJstDay(new Date(chore.lastPerformedAt)))
            : null;
        const isDone = performedDateKey === dateKey && dateKey < todayKey;
        const chipClass = isDone
          ? "border"
          : "border border-[#E5EAF0] bg-white text-[#202124]";
        const doneStyle: CSSProperties | undefined = isDone
          ? {
            backgroundColor: `${doneColor}14`,
            borderColor: `${doneColor}66`,
            color: darkenColor(doneColor, 18),
          }
          : undefined;
        return (
          <button
            key={`${dateKey}-${chore.id}-${chipIndex}`}
            type="button"
            onClick={() => {
              if (suppressChipClickRef.current) { suppressChipClickRef.current = false; return; }
              openReschedule(chore, dateKey);
            }}
            draggable
            onDragStart={(event) => {
              beginChoreDrag(chore, dateKey);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", chore.id);
            }}
            onDragEnd={clearDragState}
            onPointerDown={(event) => handleChorePointerDown(chore, dateKey, event)}
            className={`inline-flex items-center gap-1 rounded-[10px] px-[10px] py-[6px] text-[12px] font-semibold ${chipClass}`}
            style={{ touchAction: "none", ...doneStyle }}
          >
            <ChipIcon size={13} color={chore.iconColor} />
            <span>{chore.title}</span>
            {isDone ? <span className="material-symbols-rounded text-[14px]">check</span> : null}
          </button>
        );
      };

      return (
        <div className="space-y-4" style={{ paddingTop: listHeaderHeight }}>
          <div className="space-y-4" style={getPullAnimatedContentStyle(tab)}>
            {renderInlinePullRefreshHint(tab)}
            {calendarExpanded ? (
              <div
                data-calendar-swipe-surface="true"
                className="space-y-1 rounded-[16px] border border-[#E5EAF0] bg-white px-2 py-3"
                onTouchStart={handleCalendarTouchStart}
                onTouchEnd={handleCalendarTouchEnd}
              >
                <div className="flex items-center justify-between px-1 pb-1">
                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(-1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#F8F9FA] text-[#5F6368]"
                    aria-label="前月へ"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <p className="text-[13px] font-semibold text-[#5F6368]">{calendarMonthLabel}</p>
                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#F8F9FA] text-[#5F6368]"
                    aria-label="次月へ"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {WEEKDAY_SHORT.map((day, index) => (
                    <div key={`dow-${day}`} className={`text-center text-[10px] font-medium ${index === 0 ? "text-[#EA4335]" : index === 6 ? "text-[#4285F4]" : "text-[#9AA0A6]"}`}>
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {calendarMonthGridDates.map((date) => {
                    const dateKey = toJstDateKey(date);
                    const monthKey = toMonthKey(date);
                    const inMonth = monthKey === currentMonthKey;
                    const isSelected = dateKey === calendarSelectedDateKey;
                    const dayOfWeek = new Date(date.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
                    const weekendClass =
                      dayOfWeek === 0 ? "text-[#EA4335]" : dayOfWeek === 6 ? "text-[#4285F4]" : "text-[#202124]";
                    return (
                      <button
                        key={`month-cell-${dateKey}`}
                        type="button"
                        onClick={() => {
                          focusCalendarDate(dateKey);
                          setCalendarExpanded(false);
                        }}
                        className="flex min-h-[36px] flex-col items-center justify-center py-1"
                      >
                        <span
                          className={`rounded-[8px] px-[6px] py-[1px] text-[13px] font-bold leading-none ${isSelected
                            ? "bg-[#EEF4FE] text-[#202124]"
                            : inMonth
                              ? weekendClass
                              : "text-[#BDC1C6]"
                            }`}
                        >
                          {date.getDate()}
                        </span>
                        {inMonth ? renderDayDots(dateKey) : <span className="h-1 w-1" />}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarExpanded(false)}
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-[8px] py-1.5 text-[11px] font-semibold text-[#9AA0A6] hover:bg-[#F1F3F4] active:bg-[#E8EAED]"
                  aria-label="週表示に縮小"
                >
                  <ChevronDown size={14} className="rotate-180" />
                  <span>週表示に縮小</span>
                </button>
              </div>
            ) : null}

            {!calendarExpanded ? (
              <div
                data-calendar-swipe-surface="true"
                className="rounded-[14px] border border-[#E5EAF0] bg-white px-2 py-2"
                onTouchStart={handleCalendarTouchStart}
                onTouchEnd={handleCalendarTouchEnd}
              >
                <div className="flex items-center justify-around">
                  {calendarSelectedWeekEntries.map((entry) => {
                    const entryDateJst = new Date(entry.date.getTime() + 9 * 60 * 60 * 1000);
                    const weekday = WEEKDAY_SHORT[entryDateJst.getUTCDay()];
                    const dayNumber = entryDateJst.getUTCDate();
                    const isSelected = entry.dateKey === calendarSelectedDateKey;
                    const isSun = entryDateJst.getUTCDay() === 0;
                    const isSat = entryDateJst.getUTCDay() === 6;
                    return (
                      <button
                        key={entry.dateKey}
                        type="button"
                        onClick={() => setCalendarSelectedDateKey(entry.dateKey)}
                        className="flex min-w-[36px] flex-col items-center gap-[2px] py-1"
                      >
                        <span className={`text-[10px] font-medium ${isSun ? "text-[#EA4335]" : isSat ? "text-[#4285F4]" : "text-[#9AA0A6]"}`}>
                          {weekday}
                        </span>
                        <span className={`rounded-[16px] px-2 py-[2px] text-[16px] font-bold leading-none ${isSelected ? "bg-[#EEF4FE] text-[#202124]" : isSun ? "text-[#EA4335]" : isSat ? "text-[#4285F4]" : "text-[#202124]"}`}>
                          {dayNumber}
                        </span>
                        {renderDayDots(entry.dateKey)}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarExpanded(true)}
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-[8px] py-1.5 text-[11px] font-semibold text-[#9AA0A6] hover:bg-[#F1F3F4] active:bg-[#E8EAED]"
                  aria-label="カレンダー表示に拡大"
                >
                  <ChevronDown size={14} />
                  <span>カレンダー表示に拡大</span>
                </button>
              </div>
            ) : null}

            {draggingChore ? (
              <div
                data-drag-navigate="prev-week"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void dropDraggedChoreToDate(previousWeekTarget);
                }}
                className="rounded-[12px] border border-dashed border-[#F9AB00] bg-[#FFF8E8] px-3 py-2 text-center text-[12px] font-bold text-[#B06000]"
              >
                <span data-drag-navigate="prev-week">↑ ここに乗せると前の週に移動</span>
              </div>
            ) : null}

            <div className="space-y-4">
              {calendarSelectedWeekEntries.map((entry) => {
                const entryJst = new Date(entry.date.getTime() + 9 * 60 * 60 * 1000);
                return (
                  <div
                    key={`week-group-${entry.dateKey}`}
                    data-drop-date={entry.dateKey}
                    className={`space-y-2 rounded-[10px] px-1 py-1 ${dragTargetDateKey === entry.dateKey ? "bg-[#EEF4FE]" : entry.dateKey === calendarSelectedDateKey ? "bg-[#F5F9FF]" : ""}`}
                    onClick={(event) => {
                      handleCalendarSurfaceTap(event, entry.dateKey);
                    }}
                    onDragOver={(event) => {
                      if (!draggingChore) return;
                      event.preventDefault();
                      setDragTargetDateKey(entry.dateKey);
                    }}
                    onDragLeave={() => {
                      setDragTargetDateKey((prev) => (prev === entry.dateKey ? null : prev));
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      void dropDraggedChoreToDate(entry.dateKey);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-bold text-[#202124]">
                        {WEEKDAY_SHORT[entryJst.getUTCDay()]} {entryJst.getUTCDate()}
                        {entry.dateKey === todayKey ? " 今日" : ""}
                      </p>
                      <div className="h-px flex-1 bg-[#E5EAF0]" />
                      <p className="text-[12px] font-medium text-[#9AA0A6]">{entry.items.length}件</p>
                    </div>
                    <div className="flex flex-wrap gap-[6px]">
                      {entry.items.length === 0 ? (
                        <p className="text-[12px] font-medium text-[#BDC1C6]">予定なし</p>
                      ) : (
                        entry.items.map((chore, chipIndex) =>
                          renderCalendarChip(chore, entry.dateKey, chipIndex),
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {draggingChore ? (
              <div
                data-drag-navigate="next-week"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void dropDraggedChoreToDate(nextWeekTarget);
                }}
                className="rounded-[12px] border border-dashed border-[#34A853] bg-[#E8F5E9] px-3 py-2 text-center text-[12px] font-bold text-[#1E8E3E]"
              >
                <span data-drag-navigate="next-week">↓ ここに乗せると次の週に移動</span>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    if (tab === "records") {
      return (
        <div className="space-y-4" style={{ paddingTop: recordsHeaderHeight }}>
          <div className="space-y-5" style={getPullAnimatedContentStyle(tab)}>
            {renderInlinePullRefreshHint(tab)}
            <button
              type="button"
              onClick={() => openStandaloneScreen("my-records", "records")}
              className="flex w-full items-center justify-between rounded-[12px] border border-[#DADCE0] bg-white px-4 py-2.5 text-left"
            >
              <span className="text-[14px] font-semibold text-[#202124]">わたしのきろくを見る</span>
              <ChevronRight size={16} color="#9AA0A6" />
            </button>
            {renderTimelineRecords(groupedTimelineRecords, "家事を完了するとここにタイムライン表示されます。")}
          </div>
        </div>
      );
    }

    if (tab === "stats") {
      const topChores = householdReport?.choreCounts.slice(0, 3) ?? [];
      const staleTasks = householdReport?.staleTasks.slice(0, 3) ?? [];
      const monthDiffLabel =
        householdReportDiff > 0 ? `+${householdReportDiff}` : `${householdReportDiff}`;

      return (
        <div className="space-y-5" style={{ paddingTop: statsHeaderHeight }}>
          <div className="space-y-5" style={getPullAnimatedContentStyle(tab)}>
            {renderInlinePullRefreshHint(tab)}
            <button
              type="button"
              onClick={() => openStandaloneScreen("my-report", "stats")}
              className="flex w-full items-center justify-between rounded-[12px] border border-[#DADCE0] bg-white px-4 py-2.5 text-left"
            >
              <span className="text-[14px] font-semibold text-[#202124]">私のレポートを見る</span>
              <ChevronRight size={16} color="#9AA0A6" />
            </button>
            <div className="space-y-3">
              <div className="rounded-[16px] bg-white px-5 py-5">
                <p className="text-[18px] font-bold text-[#202124]">今月のおうち 🏠</p>
                {reportLoading && !householdReport ? (
                  <div className="mt-3 flex items-center gap-2 text-[13px] text-[#5F6368]">
                    <Loader2 size={14} className="animate-spin" />
                    読み込み中...
                  </div>
                ) : (
                  <>
                    <div className="mt-2.5 flex items-end gap-2">
                      <p className="text-[48px] font-bold leading-none text-[#1A9BE8]">{householdReport?.currentMonthTotal ?? 0}</p>
                      <p className="text-[18px] font-semibold text-[#5F6368]">回</p>
                      <span className={`mb-1 inline-flex rounded-full px-2.5 py-1 text-[13px] font-bold ${householdReportDiff >= 0 ? "bg-[#E6F4EA] text-[#1E8E3E]" : "bg-[#FCE8E6] text-[#C5221F]"}`}>
                        {monthDiffLabel} 先月比
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] font-medium text-[#9AA0A6]">みんなでたくさんやったね！</p>
                  </>
                )}
              </div>

              <div className="rounded-[16px] bg-white px-5 py-5">
                <p className="text-[18px] font-bold text-[#202124]">よく回った家事 トップ3</p>
                <div className="mt-3 space-y-2">
                  {topChores.length === 0 ? (
                    <p className="text-[13px] font-medium text-[#9AA0A6]">まだ記録がありません。</p>
                  ) : (
                    topChores.map((item) => {
                      const ItemIcon = iconByName(item.icon);
                      return (
                        <div key={item.choreId} className="flex items-center gap-2 rounded-[10px] bg-[#F8F9FA] px-3 py-2">
                          <ItemIcon size={14} color={item.iconColor} />
                          <p className="flex-1 truncate text-[15px] font-bold text-[#202124]">{item.title}</p>
                          <p className="text-[15px] font-bold text-[#1A9BE8]">{item.count}回</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-[16px] bg-white px-5 py-5">
                <p className="text-[18px] font-bold text-[#202124]">久しぶりかも？ 🤔</p>
                <div className="mt-3 space-y-2">
                  {staleTasks.length === 0 ? (
                    <p className="text-[13px] font-medium text-[#9AA0A6]">問題のある家事はありません。</p>
                  ) : (
                    staleTasks.map((item) => {
                      const ItemIcon = iconByName(item.icon);
                      const lastPerformed = new Date(item.lastPerformedAt);
                      const lastPerformedLabel = `${lastPerformed.getMonth() + 1}/${lastPerformed.getDate()}`;
                      return (
                        <div key={item.choreId} className="flex items-center gap-2 rounded-[10px] bg-[#F8F9FA] px-3 py-2">
                          <ItemIcon size={14} color={item.iconColor} />
                          <p className="flex-1 truncate text-[14px] font-bold text-[#202124]">{item.title}</p>
                          <p className="text-[12px] font-medium text-[#5F6368]">最終: {lastPerformedLabel}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const inviteCode = boot.householdInviteCode ?? "";
    const inviteLink =
      typeof window === "undefined"
        ? `https://ietasuku.vercel.app/?invite=${inviteCode}`
        : `${window.location.origin}/?invite=${inviteCode}`;

    if (settingsView === "push") {
      return (
        <div className="space-y-4 pb-4">
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => setSettingsView("menu")} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#202124]">
              <ChevronLeft size={18} />
            </button>
            <p className="text-[22px] font-bold text-[#202124]">プッシュ通知設定</p>
          </div>
          <SettingToggleRow title="プッシュ通知" subtitle="すべての通知をまとめてオン/オフ" checked={pushEnabled} disabled={pushLoading} onChange={(next) => { void handleTogglePush(next); }} />
          {pushEnabled && notificationSettings ? (
            <div className="space-y-3 rounded-[14px] bg-white p-3">
              <div className="space-y-2 rounded-[12px] border border-[#DADCE0] bg-[#F8F9FA] p-3">
                <p className="text-[13px] font-bold text-[#202124]">通知時刻</p>
                <div className="flex flex-wrap gap-2">
                  {notificationSettings.reminderTimes.map((time) => (
                    <button key={time} type="button" onClick={() => removeReminderTime(time)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-[#1A73E8]">
                      {time}
                      {notificationSettings.reminderTimes.length > 1 ? <span className="text-[#9AA0A6]">×</span> : null}
                    </button>
                  ))}
                  <button type="button" onClick={() => setReminderTimePickerOpen((prev) => !prev)} className="inline-flex h-[30px] items-center justify-center rounded-full border border-[#DADCE0] bg-white px-3 text-[12px] font-bold text-[#5F6368]">+ 追加</button>
                </div>
                {reminderTimePickerOpen ? (
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {REMINDER_HOUR_CHOICES.filter((time) => !notificationSettings.reminderTimes.includes(time)).map((time) => (
                      <button key={time} type="button" onClick={() => addReminderTime(time)} className="rounded-[10px] border border-[#DADCE0] bg-white px-2 py-1.5 text-[12px] font-bold text-[#5F6368]">{time}</button>
                    ))}
                  </div>
                ) : null}
              </div>
              <SettingToggleRow title="リマインド通知" checked={notificationSettings.notifyReminder} onChange={(next) => { void updateNotificationSettings({ ...notificationSettings, notifyReminder: next }); }} />
              <SettingToggleRow title="パートナーの完了通知" checked={notificationSettings.notifyCompletion} onChange={(next) => { void updateNotificationSettings({ ...notificationSettings, notifyCompletion: next }); }} />
              <button type="button" onClick={handleTestNotification} disabled={pushLoading} className="w-full rounded-[10px] bg-[#C2A12F] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-60">いま通知を送信</button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setPushGuidePlatform("android");
              setSettingsView("push-guide");
            }}
            className="flex w-full items-center justify-between rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-left"
          >
            <div>
              <p className="text-[14px] font-bold text-[#202124]">スマホ通知の設定方法</p>
              <p className="text-[12px] font-medium text-[#5F6368]">Android・iPhone向けの手順を案内</p>
            </div>
            <ChevronRight size={16} color="#9AA0A6" />
          </button>
        </div>
      );
    }

    if (settingsView === "push-guide") {
      const guide = PUSH_GUIDE_CONTENT[pushGuidePlatform];

      return (
        <div className="space-y-4 pb-4">
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => setSettingsView("push")} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#202124]">
              <ChevronLeft size={18} />
            </button>
            <p className="text-[22px] font-bold text-[#202124]">通知の設定方法</p>
          </div>

          <div className="flex gap-1 rounded-[12px] bg-[#E9EEF6] p-1">
            <button
              type="button"
              onClick={() => setPushGuidePlatform("android")}
              className={`flex-1 rounded-[10px] px-2 py-2 text-[13px] font-bold ${pushGuidePlatform === "android" ? "bg-white text-[#202124] shadow-sm" : "text-[#5F6368]"}`}
            >
              Android
            </button>
            <button
              type="button"
              onClick={() => setPushGuidePlatform("iphone")}
              className={`flex-1 rounded-[10px] px-2 py-2 text-[13px] font-bold ${pushGuidePlatform === "iphone" ? "bg-white text-[#202124] shadow-sm" : "text-[#5F6368]"}`}
            >
              iPhone
            </button>
          </div>

          <div className="space-y-2 rounded-[14px] border border-[#DADCE0] bg-white p-4">
            <p className="text-[15px] font-bold text-[#202124]">{guide.setupTitle}</p>
            <div className="space-y-1.5 text-[12px] font-medium leading-relaxed text-[#5F6368]">
              {guide.setupSteps.map((step) => (
                <p key={step}>{step}</p>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-[14px] border border-[#D8E7FF] bg-[#F5F9FF] p-4">
            <p className="text-[13px] font-bold text-[#1A9BE8]">確認（テスト）</p>
            <div className="space-y-1 text-[11.5px] font-medium leading-relaxed text-[#5F6368]">
              {PUSH_GUIDE_CONFIRM_STEPS.map((step) => (
                <p key={step}>{step}</p>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-[14px] border border-[#F2D39D] bg-[#FFF6E8] p-4">
            <p className="text-[13px] font-bold text-[#C58500]">{guide.troubleTitle}</p>
            <div className="space-y-1 text-[11px] font-medium leading-relaxed text-[#7A6A45]">
              {guide.troubleSteps.map((step) => (
                <p key={step}>{step}</p>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (settingsView === "family") {
      return (
        <div className="space-y-4 pb-4">
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => setSettingsView("menu")} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#202124]">
              <ChevronLeft size={18} />
            </button>
            <p className="text-[22px] font-bold text-[#202124]">家族招待・家族管理</p>
          </div>
          <div className="space-y-2 rounded-[16px] border border-[#E5EAF0] bg-white p-5">
            <p className="text-[14px] font-bold text-[#5F6368]">家族コード</p>
            <p className="text-[30px] font-extrabold tracking-[0.16em] text-[#1A9BE8]">{inviteCode || "----"}</p>
            <p className="text-[11px] font-medium text-[#9AA0A6]">パートナーにこのコードを共有してください</p>
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(inviteCode); setInfoMessage("家族コードをコピーしました。"); } catch { setError("家族コードのコピーに失敗しました。"); } }} className="rounded-[12px] bg-[#1A9BE8] px-3 py-2 text-[14px] font-bold text-white">コードをコピー</button>
          </div>
          <div className="space-y-2 rounded-[16px] border border-[#E5EAF0] bg-white p-5">
            <p className="text-[14px] font-bold text-[#5F6368]">招待リンク</p>
            <p className="truncate rounded-[10px] bg-[#F1F3F4] px-3 py-2 text-[13px] font-medium text-[#5F6368]">{inviteLink}</p>
            <button type="button" onClick={async () => { if (navigator.share) { try { await navigator.share({ title: "いえたすく 招待", text: inviteLink, url: inviteLink }); return; } catch { } } try { await navigator.clipboard.writeText(inviteLink); setInfoMessage("招待リンクをコピーしました。"); } catch { setError("招待リンクの共有に失敗しました。"); } }} className="rounded-[12px] border-2 border-[#1A9BE8] bg-white px-3 py-2 text-[14px] font-bold text-[#1A9BE8]">リンクを共有</button>
          </div>
          <div className="space-y-2">
            <p className="text-[22px] font-bold text-[#202124]">家族メンバー</p>
            {boot.users.map((member) => (
              <div key={member.id} className="flex items-center gap-3 rounded-[14px] border border-[#E5EAF0] bg-white px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ backgroundColor: member.color ?? "#1A9BE8" }}>
                  <span className="material-symbols-rounded text-[20px]">person</span>
                </div>
                <p className="flex-1 text-[15px] font-semibold text-[#202124]">{member.name}{member.id === sessionUser.id ? "（あなた）" : ""}</p>
                <span className={`text-[11px] font-bold ${member.id === sessionUser.id ? "text-[#1A9BE8]" : "text-[#34A853]"}`}>{member.id === sessionUser.id ? "管理者" : "参加中"}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (settingsView === "manage") {
      if (manageDetailTarget) {
        const DetailIcon = iconByName(manageDetailTarget.icon);
        return (
          <div className="space-y-3 pb-4">
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setManageDetailChoreId(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#202124]"
                aria-label="家事一覧に戻る"
              >
                <ChevronLeft size={18} />
              </button>
              <p className="text-[22px] font-bold text-[#202124]">家事詳細</p>
              <button
                type="button"
                onClick={() => openEditChore(manageDetailTarget)}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#E5EAF0] bg-white px-3 py-1.5 text-[12px] font-bold text-[#1A9BE8]"
              >
                <span className="material-symbols-rounded text-[16px]">edit</span>
                編集
              </button>
            </div>

            <div className="space-y-2 rounded-[16px] border border-[#E5EAF0] bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: manageDetailTarget.bgColor }}>
                  <DetailIcon size={18} color={manageDetailTarget.iconColor} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-bold text-[#202124]">{manageDetailTarget.title}</p>
                  <p className="text-[12px] font-medium text-[#5F6368]">
                    {manageDetailTarget.intervalDays}日ごと・担当: {manageDetailTarget.defaultAssigneeName ?? "なし"}
                  </p>
                </div>
              </div>
              <p className="text-[12px] font-medium text-[#5F6368]">直近30日の実施回数: {historyCountLast30}回</p>
            </div>

            <div className="space-y-2 rounded-[16px] border border-[#E5EAF0] bg-white p-4">
              <div className="flex items-end justify-between gap-2">
                <p className="text-[16px] font-bold text-[#202124]">実施予定</p>
                <span className="text-[11px] font-medium text-[#9AA0A6]">次の5件</span>
              </div>
              {manageUpcomingDateKeys.length === 0 ? (
                <p className="rounded-[10px] bg-[#F8F9FA] px-3 py-2 text-[13px] font-medium text-[#9AA0A6]">予定なし</p>
              ) : (
                <div className="space-y-2">
                  {manageUpcomingDateKeys.map((dateKey, index) => (
                    <button
                      key={`${manageDetailTarget.id}-planned-${dateKey}-${index}`}
                      type="button"
                      onClick={() => openReschedule(manageDetailTarget, dateKey)}
                      className="flex w-full items-center gap-2 rounded-[10px] bg-[#F8F9FA] px-3 py-2 text-left"
                    >
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-[#5F6368]">{index + 1}</span>
                      <p className="text-[14px] font-semibold text-[#202124]">{formatDateKeyMonthDayWeekday(dateKey)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-[16px] border border-[#E5EAF0] bg-white p-4">
              <p className="text-[16px] font-bold text-[#202124]">実施履歴</p>
              <SegmentedFilter items={historyFilters} activeKey={historyFilter} onChange={setHistoryFilter} />
              {historyRecords.length === 0 ? (
                <p className="rounded-[10px] bg-[#F8F9FA] px-3 py-4 text-center text-[13px] font-medium text-[#9AA0A6]">履歴がありません</p>
              ) : (
                <AnimatedList delay={70} className="items-stretch gap-2">
                  {historyRecords.map((record, index) => (
                    <div key={record.id} className="flex items-start gap-3 rounded-[12px] bg-[#F8F9FA] p-3">
                      <span
                        className="mt-1 h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: index % 2 === 0 ? "#33C28A" : "#4285F4" }}
                      />
                      <div className="space-y-1">
                        <p className="text-[14px] font-bold text-[#202124]">
                          {formatJpDate(record.performedAt)} {
                            record.isSkipped
                              ? "スキップ"
                              : record.isInitial || record.user.name === "初期登録"
                                ? "初回登録"
                                : `${record.user.name}が実施`
                          }
                        </p>
                        {record.memo ? (
                          <p className="text-[12px] font-medium text-[#5F6368]">メモ: {record.memo}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </AnimatedList>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-3 pb-4">
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => { if (standaloneScreen === "manage") { returnFromStandaloneScreen(); } else { setSettingsView("menu"); } }} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#202124]">
              <ChevronLeft size={18} />
            </button>
            <p className="text-[22px] font-bold text-[#202124]">家事を管理</p>
            <span className="text-[14px] font-medium text-[#9AA0A6]">{chores.length}件</span>
          </div>
          {listChores.map((chore) => {
            const ChoreIcon = iconByName(chore.icon);
            return (
              <button key={chore.id} type="button" onClick={() => openManageDetail(chore.id)} className="flex w-full items-center justify-between rounded-[14px] border border-[#E5EAF0] bg-white px-4 py-3 text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: chore.bgColor }}>
                    <ChoreIcon size={15} color={chore.iconColor} />
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-[#202124]">{chore.title}</p>
                    <p className="text-[11.5px] font-medium text-[#9AA0A6]">{chore.intervalDays}日ごと・{chore.defaultAssigneeName ?? "なし"}</p>
                  </div>
                </div>
                <ChevronRight size={16} color="#BDC1C6" />
              </button>
            );
          })}
          <button type="button" onClick={openAddChore} className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#E5EAF0] bg-white px-4 py-3 text-[15px] font-bold text-[#1A9BE8]"><Plus size={16} />家事を追加</button>
        </div>
      );
    }

    if (settingsView === "my-report") {
      const myDiff = myReportPreviousTotal === null ? null : (myReport?.currentMonthTotal ?? 0) - myReportPreviousTotal;
      const myTopChores = myReport?.choreCounts.slice(0, 3) ?? [];
      const staleTasks = householdReport?.staleTasks.slice(0, 3) ?? [];
      return (
        <div className="space-y-3 pb-4">
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => { if (standaloneScreen === "my-report") { returnFromStandaloneScreen(); } else { setSettingsView("menu"); } }} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#202124]">
              <ChevronLeft size={18} />
            </button>
            <p className="text-[22px] font-bold text-[#202124]">私のレポート</p>
          </div>
          <div className="rounded-[16px] bg-white px-5 py-5">
            <p className="text-[18px] font-bold text-[#202124]">今月のわたし 🏠</p>
            {myReportLoading ? (
              <div className="mt-3 flex items-center gap-2 text-[13px] text-[#5F6368]">
                <Loader2 size={14} className="animate-spin" />
                読み込み中...
              </div>
            ) : (
              <>
                <div className="mt-2.5 flex items-end gap-2">
                  <p className="text-[48px] font-bold leading-none text-[#1A9BE8]">{myReport?.currentMonthTotal ?? 0}</p>
                  <p className="text-[18px] font-semibold text-[#5F6368]">回</p>
                  <span className={`mb-1 inline-flex rounded-full px-2.5 py-1 text-[13px] font-bold ${myDiff !== null && myDiff >= 0 ? "bg-[#E6F4EA] text-[#1E8E3E]" : "bg-[#FCE8E6] text-[#C5221F]"}`}>
                    {myDiff === null ? "-" : myDiff > 0 ? `+${myDiff}` : `${myDiff}`} 先月比
                  </span>
                </div>
                <p className="mt-2 text-[13px] font-medium text-[#9AA0A6]">わたしの家事傾向をみてみよう</p>
              </>
            )}
          </div>
          <div className="rounded-[16px] bg-white px-5 py-5">
            <p className="text-[18px] font-bold text-[#202124]">よく回った家事 トップ3</p>
            <div className="mt-3 space-y-2">
              {myTopChores.length === 0 ? (
                <p className="text-[13px] font-medium text-[#9AA0A6]">まだ記録がありません。</p>
              ) : (
                myTopChores.map((item) => {
                  const ItemIcon = iconByName(item.icon);
                  return (
                    <div key={item.choreId} className="flex items-center gap-2 rounded-[10px] bg-[#F8F9FA] px-3 py-2">
                      <ItemIcon size={14} color={item.iconColor} />
                      <p className="flex-1 truncate text-[15px] font-bold text-[#202124]">{item.title}</p>
                      <p className="text-[15px] font-bold text-[#1A9BE8]">{item.count}回</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="rounded-[16px] bg-white px-5 py-5">
            <p className="text-[18px] font-bold text-[#202124]">久しぶりかも？ 🤔</p>
            <div className="mt-3 space-y-2">
              {staleTasks.length === 0 ? (
                <p className="text-[13px] font-medium text-[#9AA0A6]">問題のある家事はありません。</p>
              ) : (
                staleTasks.map((item) => {
                  const ItemIcon = iconByName(item.icon);
                  const lastPerformed = new Date(item.lastPerformedAt);
                  const lastPerformedLabel = `${lastPerformed.getMonth() + 1}/${lastPerformed.getDate()}`;
                  return (
                    <div key={item.choreId} className="flex items-center gap-2 rounded-[10px] bg-[#F8F9FA] px-3 py-2">
                      <ItemIcon size={14} color={item.iconColor} />
                      <p className="flex-1 truncate text-[14px] font-bold text-[#202124]">{item.title}</p>
                      <p className="text-[12px] font-medium text-[#5F6368]">最終: {lastPerformedLabel}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
    }

    if (settingsView === "my-records") {
      return (
        <div className="space-y-3 pb-4">
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => { if (standaloneScreen === "my-records") { returnFromStandaloneScreen(); } else { setSettingsView("menu"); } }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#202124]"
            >
              <ChevronLeft size={18} />
            </button>
            <p className="text-[22px] font-bold text-[#202124]">わたしのきろく</p>
          </div>
          <div className="space-y-4">
            {renderTimelineRecords(myGroupedTimelineRecords, "あなたの記録がここに表示されます。")}
          </div>
        </div>
      );
    }

    if (settingsView === "sleep") {
      return (
        <div className="space-y-4 pb-4">
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => setSettingsView("menu")} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#202124]">
              <ChevronLeft size={18} />
            </button>
            <p className="text-[22px] font-bold text-[#202124]">おやすみモード</p>
          </div>
          <p className="text-[13px] font-medium leading-relaxed text-[#5F6368]">
            おやすみモード中はプッシュ通知が届きません。設定した時間帯は通知をミュートします。
          </p>
          <div className="rounded-[14px] border border-[#E5EAF0] bg-white p-2">
            <SettingToggleRow
              title="おやすみモード"
              checked={sleepModeEnabled}
              onChange={setSleepModeEnabled}
            />
          </div>
          <div className="space-y-2">
            <p className="text-[14px] font-semibold text-[#5F6368]">おやすみ時間</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <select
                value={sleepModeStart}
                onChange={(event) => setSleepModeStart(event.target.value)}
                disabled={!sleepModeEnabled}
                className="h-12 rounded-[12px] border border-[#E5EAF0] bg-white px-3 text-center text-[30px] font-bold leading-none text-[#202124] disabled:opacity-50"
              >
                {REMINDER_HOUR_CHOICES.map((time) => (
                  <option key={`sleep-start-inline-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <span className="text-[22px] font-semibold text-[#5F6368]">〜</span>
              <select
                value={sleepModeEnd}
                onChange={(event) => setSleepModeEnd(event.target.value)}
                disabled={!sleepModeEnabled}
                className="h-12 rounded-[12px] border border-[#E5EAF0] bg-white px-3 text-center text-[30px] font-bold leading-none text-[#202124] disabled:opacity-50"
              >
                {REMINDER_HOUR_CHOICES.map((time) => (
                  <option key={`sleep-end-inline-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] font-medium text-[#9AA0A6]">この時間帯はリマインド通知が届きません</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div className="space-y-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={closeSettings}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: sessionUser.color ?? "#1A9BE8" }}
              aria-label="設定を閉じる"
            >
              <span className="material-symbols-rounded text-[20px]">person</span>
            </button>
            <p className="text-[28px] font-bold leading-none text-[#202124]">{sessionUser.name}</p>
            <p className="text-[13px] font-medium text-[#9AA0A6]">@{sessionUser.name.toLowerCase()} · いえたすく</p>
            <p className="pt-1 text-[13px] font-semibold text-[#5F6368]">{myReport?.currentMonthTotal ?? 0} 今月の記録・ {chores.length} 連続日数</p>
          </div>

          <div className="h-px bg-[#DADCE0]" />

          <div className="space-y-1">
            <button type="button" onClick={() => openStandaloneScreen("my-report")} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"><span className="material-symbols-rounded text-[21px] text-[#5F6368]">trending_up</span><span className="text-[18px] leading-none font-semibold text-[#202124]">私のレポート</span></button>
            <button type="button" onClick={() => openStandaloneScreen("my-records")} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"><span className="material-symbols-rounded text-[21px] text-[#5F6368]">menu_book</span><span className="text-[18px] leading-none font-semibold text-[#202124]">わたしのきろく</span></button>
            <button type="button" onClick={() => openSettingsView("push")} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"><span className="material-symbols-rounded text-[21px] text-[#5F6368]">notifications</span><span className="text-[18px] leading-none font-semibold text-[#202124]">プッシュ通知設定</span></button>
            <button type="button" onClick={() => openSettingsView("family")} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"><span className="material-symbols-rounded text-[21px] text-[#5F6368]">group</span><span className="text-[18px] leading-none font-semibold text-[#202124]">家族招待・家族管理</span></button>
            <button type="button" onClick={() => openStandaloneScreen("manage")} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"><span className="material-symbols-rounded text-[21px] text-[#5F6368]">checklist</span><span className="text-[18px] leading-none font-semibold text-[#202124]">家事を管理</span></button>
            <button type="button" onClick={() => openSettingsView("sleep")} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"><span className="material-symbols-rounded text-[21px] text-[#5F6368]">bedtime</span><span className="text-[18px] leading-none font-semibold text-[#202124]">おやすみモード</span></button>
          </div>
        </div>

        <div className="mt-auto pt-10">
          <div className="h-px bg-[#DADCE0]" />
          <button
            type="button"
            onClick={() => {
              setInfoMessage("設定とサポートは準備中です。");
            }}
            className="mt-2 flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"
          >
            <span className="material-symbols-rounded text-[20px] text-[#5F6368]">settings</span>
            <span className="text-[16px] font-medium text-[#202124]">設定とサポート</span>
            <span className="material-symbols-rounded ml-auto text-[18px] text-[#5F6368]">expand_more</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await apiFetch("/api/logout", { method: "POST", body: "{}" });
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              } catch (err: unknown) {
                setError((err as Error).message ?? "ログアウトに失敗しました。");
              }
            }}
            className="mt-2 flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"
          >
            <span className="material-symbols-rounded text-[20px] text-[#D93025]">logout</span>
            <span className="text-[16px] font-medium text-[#D93025]">ログアウト</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <main className="mx-auto flex h-screen w-full max-w-[430px] flex-col overflow-hidden overscroll-y-none bg-[#F8F9FA]">
      <section
        className="relative flex-1 overflow-hidden overscroll-y-none"
        onTouchStart={(e) => {
          const t = e.touches[0];
          sectionTouchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
          const target = e.target as HTMLElement | null;
          const isCalendarSurface =
            activeTabRef.current === "list" &&
            Boolean(target?.closest("[data-calendar-swipe-surface='true']"));
          sectionSwipeSuppressedRef.current = isCalendarSurface;
          if (isCalendarSurface) {
            swipe.onTouchCancel();
            assignmentEdgeSwipe.onTouchStart(e);
            return;
          }
          swipe.onTouchStart(e);
          assignmentEdgeSwipe.onTouchStart(e);
        }}
        onTouchMove={(e) => {
          if (sectionSwipeSuppressedRef.current) return;
          const start = sectionTouchStartRef.current;
          const t = e.touches[0];
          if (start && t) {
            const dx = Math.abs(t.clientX - start.x);
            const dy = Math.abs(t.clientY - start.y);
            const isDownwardPull = t.clientY > start.y && dy > dx * 1.05;
            if (pullEligibleRef.current && isDownwardPull) {
              sectionSwipeSuppressedRef.current = true;
              swipe.onTouchCancel();
              return;
            }
            // Skip swipe handlers for clearly vertical gestures so they do not
            // interfere with the pull-to-refresh native touchmove listener.
            if (dy > dx * 1.5) return;
          }
          swipe.onTouchMove(e);
          assignmentEdgeSwipe.onTouchMove(e);
        }}
        onTouchEnd={(e) => {
          sectionTouchStartRef.current = null;
          if (sectionSwipeSuppressedRef.current) {
            sectionSwipeSuppressedRef.current = false;
            assignmentEdgeSwipe.onTouchEnd(e);
            return;
          }
          swipe.onTouchEnd(e);
          assignmentEdgeSwipe.onTouchEnd(e);
        }}
        onTouchCancel={() => {
          sectionTouchStartRef.current = null;
          if (!sectionSwipeSuppressedRef.current) {
            swipe.onTouchCancel();
          }
          sectionSwipeSuppressedRef.current = false;
          assignmentEdgeSwipe.onTouchCancel();
        }}
      >
        <div className="relative h-full overflow-hidden">
          <div className="absolute left-0 right-0 top-0 z-30 overflow-hidden" style={isSwipeSheetMoving ? undefined : { height: activeTab === "home" ? homeHeaderHeight : activeTab === "list" ? listHeaderHeight : activeTab === "records" ? recordsHeaderHeight : activeTab === "stats" ? statsHeaderHeight : settingsHeaderHeight }}>
            <div
              className={`flex ${isSwipeSheetMoving ? "will-change-transform" : ""}`}
              style={{
                transform: `translate3d(${swipeTrackTranslatePercent}%, 0, 0)`,
                transition: swipeTrackTransitionStyle,
              }}
            >
              {TAB_ORDER.map((tab) => (
                <div key={tab} className="w-full shrink-0">
                  {renderTabHeader(tab)}
                </div>
              ))}
            </div>
          </div>
          <div
            ref={mainScrollRef}
            className="h-full overflow-auto overscroll-y-contain px-5 pb-28"
            style={{
              overscrollBehaviorY: "contain",
            }}
            onTouchStart={handleMainScrollTouchStart}
            onTouchEnd={handleMainScrollTouchEnd}
            onTouchCancel={handleMainScrollTouchCancel}
          >
            {error ? <div className="mb-4 rounded-xl bg-[#FDECEE] px-3 py-2 text-sm text-[#C5221F]">{error}</div> : null}
            <div className="relative min-h-full overflow-x-hidden">
              <div
                className={`flex ${isSwipeSheetMoving ? "will-change-transform" : ""}`}
                style={{
                  transform: swipeTrackTranslatePercent === 0 ? "none" : `translate3d(${swipeTrackTranslatePercent}%, 0, 0)`,
                  transition: swipeTrackTransitionStyle,
                }}
              >
                {TAB_ORDER.map((tab) => (
                  <div key={tab} className="w-full shrink-0 overflow-x-hidden">
                    {renderMainTabContent(tab)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {assignmentMounted ? (
            <div
              className={`absolute inset-0 z-40 overflow-auto bg-[#F8F9FA] px-5 pb-8 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${assignmentSlideIn ? "translate-x-0" : "translate-x-full"}`}
            >
              {error ? <div className="mb-4 mt-5 rounded-xl bg-[#FDECEE] px-3 py-2 text-sm text-[#C5221F]">{error}</div> : null}
              <div className={`space-y-4 ${error ? "pt-2" : "pt-5"}`}>
                <div className="sticky top-0 z-30 -mx-5 space-y-3 bg-[#F8F9FA]/95 px-5 pb-3 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={closeAssignment}
                      className="flex items-center gap-1 text-[14px] font-bold text-[#1A9BE8]"
                    >
                      <ChevronLeft size={18} /> 戻る
                    </button>
                    <p className="text-[18px] font-bold text-[#202124]">担当設定</p>
                    <div className="w-[50px]" />
                  </div>

                  <div className="flex gap-2">
                    {(boot?.users ?? []).map((u) => {
                      const isSelected = assignmentUser === u.id;
                      const userColor = u.color ?? "#1A9BE8";
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setAssignmentUser(isSelected ? null : u.id)}
                          className={`rounded-2xl px-4 py-2 text-[13px] font-bold transition-colors ${isSelected ? "text-white" : "border text-[#5F6368]"
                            }`}
                          style={
                            isSelected
                              ? { backgroundColor: userColor, borderColor: userColor }
                              : { backgroundColor: "white", borderColor: "#DADCE0" }
                          }
                        >
                          {u.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-1 rounded-xl bg-[#F1F3F4] p-1">
                    <button
                      type="button"
                      onClick={() => setAssignmentTab("daily")}
                      className={`flex-1 rounded-lg py-1.5 text-[13px] font-bold ${assignmentTab === "daily" ? "bg-white text-[#202124] shadow-sm" : "text-[#5F6368]"}`}
                    >
                      日々のタスク
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignmentTab("big")}
                      className={`flex-1 rounded-lg py-1.5 text-[13px] font-bold ${assignmentTab === "big" ? "bg-white text-[#202124] shadow-sm" : "text-[#5F6368]"}`}
                    >
                      大仕事
                    </button>
                  </div>
                </div>

                <div
                  className="relative overflow-x-hidden"
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    const containerLeft = e.currentTarget.getBoundingClientRect().left;
                    const startsFromLeftEdge =
                      touch !== undefined &&
                      touch.clientX - containerLeft <= ASSIGNMENT_BACK_SWIPE_EDGE_PX;
                    const shouldPreferBackSwipe = assignmentTab === "daily" && startsFromLeftEdge;

                    assignmentTabSwipeActiveRef.current = !shouldPreferBackSwipe;
                    assignmentBackSwipeActiveRef.current = shouldPreferBackSwipe;
                    if (shouldPreferBackSwipe) {
                      e.stopPropagation();
                      assignmentEdgeSwipe.onTouchStart(e);
                      return;
                    }

                    e.stopPropagation();
                    assignmentTabSwipe.onTouchStart(e);
                  }}
                  onTouchMove={(e) => {
                    if (assignmentBackSwipeActiveRef.current) {
                      e.stopPropagation();
                      assignmentEdgeSwipe.onTouchMove(e);
                      return;
                    }
                    if (!assignmentTabSwipeActiveRef.current) {
                      return;
                    }
                    e.stopPropagation();
                    assignmentTabSwipe.onTouchMove(e);
                  }}
                  onTouchEnd={(e) => {
                    if (assignmentBackSwipeActiveRef.current) {
                      e.stopPropagation();
                      assignmentEdgeSwipe.onTouchEnd(e);
                      assignmentBackSwipeActiveRef.current = false;
                      return;
                    }
                    if (!assignmentTabSwipeActiveRef.current) {
                      return;
                    }
                    e.stopPropagation();
                    assignmentTabSwipe.onTouchEnd(e);
                    assignmentTabSwipeActiveRef.current = false;
                  }}
                  onTouchCancel={(e) => {
                    if (assignmentBackSwipeActiveRef.current) {
                      e.stopPropagation();
                      assignmentEdgeSwipe.onTouchCancel();
                      assignmentBackSwipeActiveRef.current = false;
                      return;
                    }
                    if (!assignmentTabSwipeActiveRef.current) {
                      return;
                    }
                    e.stopPropagation();
                    assignmentTabSwipe.onTouchCancel();
                    assignmentTabSwipeActiveRef.current = false;
                  }}
                >
                  <div
                    className={`flex ${isAssignmentSwipeSheetMoving ? "will-change-transform" : ""}`}
                    style={{
                      transform: `translate3d(${assignmentSwipeTrackTranslatePercent}%, 0, 0)`,
                      transition: assignmentSwipeTrackTransitionStyle,
                    }}
                  >
                    {ASSIGNMENT_TAB_ORDER.map((tab) => (
                      <div key={tab} className="w-full shrink-0">
                        {renderAssignmentTabContent(tab)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {settingsOpen ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="設定を閉じる"
            onClick={closeSettings}
            className="absolute inset-0 bg-black/30"
          />
          <aside className={`absolute inset-y-0 left-0 w-[320px] max-w-[88%] ${settingsView === "menu" ? "bg-white" : "bg-[#F1F3F4]"} shadow-[12px_0_28px_rgba(0,0,0,0.2)]`}>
            <div className="h-full overflow-y-auto px-4 pb-24 pt-6">
              {renderMainTabContent("settings")}
            </div>
          </aside>
        </div>
      ) : null}

      {standaloneScreen ? (
        <div className="fixed inset-0 z-[75] bg-[#F8F9FA]">
          <div className="mx-auto h-full w-full max-w-[430px] overflow-y-auto px-5 pb-24 pt-5">
            {renderMainTabContent("settings")}
          </div>
        </div>
      ) : null}

      {taskBanner ? (
        <div className="pointer-events-none fixed left-0 right-0 top-3 z-[90] mx-auto max-w-[430px] px-4">
          <div
            className={`rounded-[12px] border px-4 py-2.5 text-center text-[14px] font-bold shadow-[0_8px_18px_rgba(0,0,0,0.18)] ${taskBanner.tone === "green"
              ? "border-[#CDE7D3] bg-[#E8F5E9] text-[#1E6A3A]"
              : "border-[#CFE0FF] bg-[#E8F2FF] text-[#1A5AD8]"
              }`}
          >
            {taskBanner.message}
          </div>
        </div>
      ) : null}

      {!settingsOpen ? (
        <div
          aria-hidden
          className="pointer-events-none fixed bottom-0 left-0 right-0 z-[74] mx-auto h-20 max-w-[430px] bg-gradient-to-t from-white/90 via-white/65 to-transparent"
        />
      ) : null}

      {pendingSwipeDeletes.map((pending, index) => (
        <UndoToast
          key={pending.toastId}
          message={`「${pending.chore.title}」を削除しました`}
          offsetY={index * 82}
          onUndo={() => undoSwipeDeleteChore(pending.toastId)}
          onDismiss={() => dismissSwipeDeleteToast(pending.toastId)}
        />
      ))}

      {infoMessage ? (
        <ConfirmDialog
          open={Boolean(infoMessage)}
          onConfirm={() => setInfoMessage("")}
          title={infoDialogCopy(infoMessage).title}
          description={infoDialogCopy(infoMessage).description}
          confirmLabel={infoDialogCopy(infoMessage).confirmLabel}
          confirmVariant="primary"
          closeOnBackdrop={false}
          zIndexClassName="z-[10000]"
          overlayClassName="bg-black/35 backdrop-blur-[1px]"
          overlayStyle={{
            paddingTop: "max(env(safe-area-inset-top), 16px)",
            paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
          }}
          panelClassName="max-w-[288px] rounded-[18px] border border-[#DADCE0] px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.26)]"
          icon={(
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F3FD]">
              <span className="material-symbols-rounded text-[22px] text-[#1A9BE8]">check_circle</span>
            </div>
          )}
        />
      ) : null}

      <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 z-[10010] bg-[#F8F9FA] transition-opacity duration-200 ${appReloading ? "opacity-100" : "opacity-0"}`}
      />

      {touchDragging && draggingChore ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: touchDragPos.x,
            top: touchDragPos.y,
            transform: "translate(-50%, -50%) scale(1.1)",
            zIndex: 9998,
            pointerEvents: "none",
          }}
          className="inline-flex items-center gap-1 rounded-[10px] border border-[#D2E3FC] bg-[#EEF4FE] px-[10px] py-[6px] text-[12px] font-semibold text-[#202124] shadow-lg opacity-90"
        >
          <span className="material-symbols-rounded text-[13px]" style={{ color: draggingChore.iconColor }}>drag_indicator</span>
          <span>{draggingChore.title}</span>
        </div>
      ) : null}

      <nav className="fixed bottom-4 left-0 right-0 z-[76] mx-auto max-w-[430px] px-4">
        <div className="flex w-full items-center justify-around rounded-full bg-white px-2 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <button
            type="button"
            onClick={() => { closeAssignment(); closeSettings(); closeStandaloneScreen(); setActiveTab("home"); setRefreshAnimationSeed((p) => p + 1); }}
            className="flex w-[62px] flex-col items-center gap-0.5 py-1"
          >
            <span className="material-symbols-rounded text-[22px]" style={{ color: activeTab === "home" ? PRIMARY_COLOR : "#9AA0A6" }}>home</span>
            <span className="text-[10px] font-bold" style={{ color: activeTab === "home" ? PRIMARY_COLOR : "#9AA0A6" }}>ホーム</span>
          </button>
          <button
            type="button"
            onClick={() => { closeAssignment(); closeSettings(); closeStandaloneScreen(); setActiveTab("records"); }}
            className="flex w-[62px] flex-col items-center gap-0.5 py-1"
          >
            <span className="material-symbols-rounded text-[22px]" style={{ color: activeTab === "records" ? PRIMARY_COLOR : "#9AA0A6" }}>menu_book</span>
            <span className="text-[10px] font-bold" style={{ color: activeTab === "records" ? PRIMARY_COLOR : "#9AA0A6" }}>きろく</span>
          </button>
          <button type="button" onClick={() => { closeAssignment(); closeSettings(); closeStandaloneScreen(); openAddChore(); }} className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[#1A9BE8] text-white shadow-md">
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => { closeAssignment(); closeSettings(); closeStandaloneScreen(); setActiveTab("list"); }}
            className="flex w-[62px] flex-col items-center gap-0.5 py-1"
          >
            <span className="material-symbols-rounded text-[22px]" style={{ color: activeTab === "list" ? PRIMARY_COLOR : "#9AA0A6" }}>calendar_month</span>
            <span className="text-[10px] font-bold" style={{ color: activeTab === "list" ? PRIMARY_COLOR : "#9AA0A6" }}>カレンダー</span>
          </button>
          <button
            type="button"
            onClick={() => { closeAssignment(); closeSettings(); closeStandaloneScreen(); setActiveTab("stats"); }}
            className="flex w-[62px] flex-col items-center gap-0.5 py-1"
          >
            <span className="material-symbols-rounded text-[22px]" style={{ color: activeTab === "stats" ? PRIMARY_COLOR : "#9AA0A6" }}>bar_chart</span>
            <span className="text-[10px] font-bold" style={{ color: activeTab === "stats" ? PRIMARY_COLOR : "#9AA0A6" }}>レポート</span>
          </button>
        </div>
      </nav>

      {renderChoreEditorSheets()}
      <BottomSheet
        open={calendarBlankActionOpen}
        onClose={closeCalendarBlankActionSheet}
        title=""
        maxHeightClassName="min-h-[52vh] max-h-[86vh]"
      >
        {calendarBlankActionDateKey ? (() => {
          const selectedDate = startOfJstDay(new Date(`${calendarBlankActionDateKey}T00:00:00+09:00`));
          const selectedDateLabel = Number.isNaN(selectedDate.getTime())
            ? calendarBlankActionDateKey
            : `${WEEKDAY_SHORT[new Date(selectedDate.getTime() + 9 * 60 * 60 * 1000).getUTCDay()]} ${new Date(selectedDate.getTime() + 9 * 60 * 60 * 1000).getUTCDate()}`;
          const todayDateKey = toJstDateKey(startOfJstDay(new Date()));
          const isPastDate = compareDateKey(calendarBlankActionDateKey, todayDateKey) < 0;

          return (
            <div className="space-y-4 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[21px] font-bold text-[#202124]">この日の操作</p>
                  <p className="text-[12px] font-medium text-[#5F6368]">{calendarBlankActionDateKey} ({selectedDateLabel})</p>
                </div>
                {calendarBlankActionMode === "record" ? (
                  <button
                    type="button"
                    onClick={() => setCalendarBlankActionMode("choice")}
                    className="rounded-[10px] border border-[#DADCE0] px-3 py-1.5 text-[12px] font-semibold text-[#5F6368]"
                  >
                    戻る
                  </button>
                ) : null}
              </div>

              {calendarBlankActionMode === "choice" ? (
                <div className="space-y-3">
                  <ActionButton
                    type="button"
                    onClick={() => {
                      closeCalendarBlankActionSheet();
                      openAddChoreForDate(calendarBlankActionDateKey);
                    }}
                    variant="primary"
                    size="lg"
                    fullWidth
                  >
                    家事の新規登録
                  </ActionButton>
                  <ActionButton
                    type="button"
                    onClick={() => setCalendarBlankActionMode("record")}
                    variant="secondary"
                    size="lg"
                    fullWidth
                  >
                    実績/予定を記録する
                  </ActionButton>
                </div>
              ) : (
                <div className="space-y-3">
                  {calendarQuickRecordChores.length === 0 ? (
                    <p className="rounded-[12px] border border-[#E5EAF0] bg-[#F8F9FA] px-3 py-3 text-[13px] font-medium text-[#5F6368]">
                      登録済みの家事がありません。まずは新規登録してください。
                    </p>
                  ) : (
                    calendarQuickRecordChores.map((chore) => {
                      const TaskIcon = iconByName(chore.icon);
                      const updating = recordUpdatingIds.includes(chore.id);
                      return (
                        <div
                          key={`calendar-blank-record-${calendarBlankActionDateKey}-${chore.id}`}
                          className="space-y-2 rounded-[12px] border border-[#E5EAF0] bg-white px-3 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <TaskIcon size={15} color={chore.iconColor} />
                            <p className="truncate text-[14px] font-bold text-[#202124]">{chore.title}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={updating}
                              onClick={() => {
                                handleCalendarBlankComplete(chore, calendarBlankActionDateKey);
                              }}
                              className="rounded-[10px] bg-[#1A9BE8] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-60"
                            >
                              完了にする
                            </button>
                            <button
                              type="button"
                              disabled={updating || isPastDate}
                              onClick={() => {
                                handleCalendarBlankPlanned(chore, calendarBlankActionDateKey);
                              }}
                              className="rounded-[10px] border border-[#DADCE0] bg-white px-3 py-2 text-[13px] font-bold text-[#202124] disabled:opacity-40"
                            >
                              予定を登録
                            </button>
                          </div>
                          {isPastDate ? (
                            <p className="text-[11px] font-medium text-[#9AA0A6]">
                              過去日は「完了にする」のみ選べます。
                            </p>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })() : null}
      </BottomSheet>
      <BottomSheet
        open={memoOpen}
        onClose={() => {
          setMemoOpen(false);
          setMemoBaseDateKey(null);
          setPendingRecordDateChoice(null);
          setMemoFlowMode("default");
          setMemoQuickDateKey(null);
          setSkipCountDialogOpen(false);
          setSkipCountValue(1);
          setSkipCountMax(1);
          setMemoTarget(null);
        }}
        title=""
        maxHeightClassName="min-h-[62vh] max-h-[88vh]"
      >
        <div className="space-y-3 pb-2">
          <p className="text-[14.4px] font-bold text-[#5F6368]">ひとこと（任意）</p>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="排水口もきれいにしたよ、など"
            className="h-[80px] w-full resize-none rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[15.6px] font-medium text-[#202124] outline-none"
          />
          <ActionButton
            type="button"
            onClick={submitRecord}
            variant="primary"
            size="lg"
            fullWidth
          >
            {memoFlowMode === "calendar-quick" ? "この内容で完了にする" : "やったよ！"}
          </ActionButton>
          {memoFlowMode === "default" ? (
            <ActionButton
              type="button"
              onClick={submitSkip}
              variant="secondary"
              size="lg"
              fullWidth
              className="mt-3"
            >
              スキップ
            </ActionButton>
          ) : null}
        </div>
      </BottomSheet>

      {skipCountDialogOpen ? (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm"
          onClick={() => setSkipCountDialogOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="スキップ件数の選択"
            className="w-full max-w-[340px] animate-[scaleIn_0.2s_ease-out] rounded-[20px] bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-center text-[18px] font-bold text-[#202124]">スキップ件数</p>
            <p className="mt-1 text-center text-[13px] font-medium text-[#5F6368]">残り {skipCountMax} 件</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setSkipCountValue((prev) => Math.max(1, prev - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#DADCE0] bg-white text-[#5F6368]"
              >
                <Minus size={16} />
              </button>
              <p className="min-w-[56px] text-center text-[24px] font-bold text-[#202124]">{skipCountValue}</p>
              <button
                type="button"
                onClick={() => setSkipCountValue((prev) => Math.min(skipCountMax, prev + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1A9BE8] text-white"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <ActionButton
                type="button"
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setSkipCountDialogOpen(false)}
              >
                キャンセル
              </ActionButton>
              <ActionButton
                type="button"
                variant="success"
                size="md"
                fullWidth
                onClick={confirmSkipWithCount}
              >
                スキップ
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      <BottomSheet
        open={rescheduleOpen}
        onClose={() => {
          setRescheduleOpen(false);
          setRescheduleTarget(null);
        }}
        title=""
        maxHeightClassName="min-h-[56vh] max-h-[86vh]"
      >
        <div className="space-y-4 pb-2">
          <div className="flex items-center justify-between">
            <p className="text-[22px] font-bold text-[#202124]">日にちを変更</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openRescheduleEditChore}
                disabled={!rescheduleTarget}
                aria-label="家事を編集"
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-bold ${rescheduleTarget
                  ? "border-[#E5EAF0] bg-white text-[#1A9BE8]"
                  : "cursor-not-allowed border-[#E5EAF0] bg-[#F1F3F4] text-[#9AA0A6]"
                  }`}
              >
                <span className="material-symbols-rounded text-[16px]">edit</span>
                家事を編集
              </button>
              <button
                type="button"
                onClick={() => {
                  setRescheduleOpen(false);
                  setRescheduleTarget(null);
                }}
                className="text-[#5F6368]"
                aria-label="閉じる"
              >
                <span className="material-symbols-rounded text-[24px]">close</span>
              </button>
            </div>
          </div>
          {rescheduleTarget ? (
            <div className="flex items-center gap-2 rounded-[12px] bg-[#F1F3F4] px-3 py-2">
              {(() => {
                const TaskIcon = iconByName(rescheduleTarget.icon);
                return <TaskIcon size={16} color={rescheduleTarget.iconColor} />;
              })()}
              <p className="text-[14px] font-semibold text-[#202124]">{rescheduleTarget.title}</p>
            </div>
          ) : null}
          <div className="space-y-2">
            <p className="text-[14px] font-medium text-[#5F6368]">いつに移動しますか？</p>
            <button
              type="button"
              onClick={() => setRescheduleChoice("tomorrow")}
              className={`flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-left ${rescheduleChoice === "tomorrow" ? "border-2 border-[#4CAF50] bg-[#E8F5E9]" : "border border-[#E5EAF0] bg-white"}`}
            >
              <div>
                <span className="text-[14px] font-bold text-[#202124]">次の日に変更</span>
                <p className="text-[11px] font-medium text-[#5F6368]">{shiftDateKey(rescheduleBaseDateKey, 1)}</p>
              </div>
              <span className="material-symbols-rounded text-[18px] text-[#9AA0A6]">
                {rescheduleChoice === "tomorrow" ? "check_circle" : "radio_button_unchecked"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRescheduleChoice("next_same_weekday")}
              className={`flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-left ${rescheduleChoice === "next_same_weekday" ? "border-2 border-[#4CAF50] bg-[#E8F5E9]" : "border border-[#E5EAF0] bg-white"}`}
            >
              <div>
                <span className="text-[14px] font-bold text-[#202124]">来週の同じ曜日</span>
                <p className="text-[11px] font-medium text-[#5F6368]">{shiftDateKey(rescheduleBaseDateKey, 7)}</p>
              </div>
              <span className="material-symbols-rounded text-[18px] text-[#9AA0A6]">
                {rescheduleChoice === "next_same_weekday" ? "check_circle" : "radio_button_unchecked"}
              </span>
            </button>
            <div className={`space-y-2 rounded-[12px] px-3 py-3 ${rescheduleChoice === "custom" ? "border-2 border-[#4CAF50] bg-[#E8F5E9]" : "border border-[#E5EAF0] bg-white"}`}>
              <button
                type="button"
                onClick={() => setRescheduleChoice("custom")}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-[14px] font-bold text-[#202124]">日付を指定</span>
                <span className="material-symbols-rounded text-[18px] text-[#9AA0A6]">
                  {rescheduleChoice === "custom" ? "check_circle" : "radio_button_unchecked"}
                </span>
              </button>
              <input
                type="date"
                value={rescheduleCustomDate}
                onChange={(event) => {
                  setRescheduleCustomDate(event.target.value);
                  setRescheduleChoice("custom");
                }}
                className="h-11 w-full rounded-[10px] border border-[#DADCE0] bg-white px-3 text-[14px] font-semibold text-[#202124] outline-none"
              />
            </div>
          </div>
          <ActionButton
            type="button"
            onClick={() => {
              void applyReschedule();
            }}
            variant="success"
            size="lg"
            fullWidth
          >
            この日に変更
          </ActionButton>
          <ActionButton
            type="button"
            onClick={() => {
              if (!rescheduleTarget) return;
              setRescheduleOpen(false);
              openMemo(rescheduleTarget, rescheduleBaseDateKey);
            }}
            variant="secondary"
            size="lg"
            fullWidth
            className="border-[#4CAF50] text-[#3EA84A]"
          >
            完了にする
          </ActionButton>
        </div>
      </BottomSheet>

      {pendingRecordDateChoice ? (() => {
        const copy = recordDateChoiceDialogCopy({
          choreTitle: pendingRecordDateChoice.choreTitle,
          sourceDateKey: pendingRecordDateChoice.sourceDateKey,
        });
        return (
          <ConfirmDialog
            open={Boolean(pendingRecordDateChoice)}
            onClose={() => setPendingRecordDateChoice(null)}
            onCancel={() => {
              setPendingRecordDateChoice(null);
              void submitMemoAction({ skipped: false, performedAtMode: "today" });
            }}
            onConfirm={() => {
              setPendingRecordDateChoice(null);
              void submitMemoAction({ skipped: false, performedAtMode: "source" });
            }}
            title={copy.title}
            description={copy.description}
            detail={copy.detail}
            cancelLabel={copy.cancelLabel}
            confirmLabel={copy.confirmLabel}
            confirmVariant="success"
          />
        );
      })() : null}

      {pendingCalendarPlanDuplicateConfirm ? (
        <ConfirmDialog
          open={Boolean(pendingCalendarPlanDuplicateConfirm)}
          onClose={() => setPendingCalendarPlanDuplicateConfirm(null)}
          onCancel={() => resolveCalendarPlanDuplicateConfirm(false)}
          onConfirm={() => resolveCalendarPlanDuplicateConfirm(true)}
          title="同じ日に同じ家事があります"
          description={`「${pendingCalendarPlanDuplicateConfirm.choreTitle}」を追加しますか？`}
          detail={`${pendingCalendarPlanDuplicateConfirm.dateKey} に重複登録します`}
          cancelLabel="やめる"
          confirmLabel="追加する"
          confirmVariant="success"
          loading={recordUpdatingIds.includes(pendingCalendarPlanDuplicateConfirm.choreId)}
        />
      ) : null}

      {pendingMergeDuplicateConfirm ? (() => {
        const copy = mergeDuplicateDialogCopy({
          choreTitle: pendingMergeDuplicateConfirm.choreTitle,
          sourceDateKey: pendingMergeDuplicateConfirm.sourceDateKey,
          targetDateKey: pendingMergeDuplicateConfirm.targetDateKey,
        });
        return (
          <ConfirmDialog
            open={Boolean(pendingMergeDuplicateConfirm)}
            onClose={closePendingMergeDuplicateConfirm}
            onCancel={() => resolvePendingMergeDuplicateConfirm(false)}
            onConfirm={() => resolvePendingMergeDuplicateConfirm(true)}
            title={copy.title}
            description={copy.description}
            detail={copy.detail}
            cancelLabel={copy.cancelLabel}
            confirmLabel={copy.confirmLabel}
            confirmVariant="success"
            loading={rescheduleConfirmLoading}
          />
        );
      })() : null}

      {pendingRescheduleConfirm ? (() => {
        const copy = rescheduleConfirmDialogCopy({
          choreTitle: pendingRescheduleConfirm.choreTitle,
          sourceDateKey: pendingRescheduleConfirm.sourceDateKey,
          targetDateKey: pendingRescheduleConfirm.targetDateKey,
        });
        return (
          <ConfirmDialog
            open={Boolean(pendingRescheduleConfirm)}
            onClose={closePendingRescheduleConfirm}
            onCancel={() => {
              void confirmPendingReschedule(false);
            }}
            onConfirm={() => {
              void confirmPendingReschedule(true);
            }}
            title={copy.title}
            description={copy.description}
            detail={copy.detail}
            cancelLabel={copy.cancelLabel}
            confirmLabel={copy.confirmLabel}
            confirmVariant="success"
            loading={rescheduleConfirmLoading}
          />
        );
      })() : null}

      {undoConfirmTarget ? (() => {
        const copy = undoRecordDialogCopy(undoConfirmTarget.title);
        return (
          <ConfirmDialog
            open={Boolean(undoConfirmTarget)}
            onClose={() => setUndoConfirmTarget(null)}
            onCancel={() => setUndoConfirmTarget(null)}
            onConfirm={() => {
              void confirmUndoRecord();
            }}
            title={copy.title}
            description={copy.description}
            cancelLabel={copy.cancelLabel}
            confirmLabel={copy.confirmLabel}
            confirmVariant="destructive"
          />
        );
      })() : null}

      {deleteConfirmOpen ? (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={confirmDeleteChore}
          title={deleteChoreDialogCopy.title}
          description={deleteChoreDialogCopy.description}
          cancelLabel={deleteChoreDialogCopy.cancelLabel}
          confirmLabel={deleteChoreDialogCopy.confirmLabel}
          confirmLoadingLabel={deleteChoreDialogCopy.confirmLoadingLabel}
          confirmVariant="destructive"
          loading={deleteChoreLoading}
          zIndexClassName="z-[9999]"
        />
      ) : null}
    </main >
  );
}
