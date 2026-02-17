"use client";

import { FormEvent, TouchEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Loader2,
  Plus,
  User,
  Users,
} from "lucide-react";

import { BottomSheet } from "@/components/kaji/bottom-sheet";
import {
  ChoreEditor,
  CustomIconPicker,
  type ChoreForm,
  type CustomIconOption,
} from "@/components/kaji/chore-editor";
import { PRIMARY_COLOR, QUICK_ICON_PRESETS, USER_COLOR_PALETTE } from "@/components/kaji/constants";
import {
  apiFetch,
  dueInDaysLabel,
  formatJpDate,
  formatMonthDay,
  formatTopDate,
  relativeLastPerformed,
  urlBase64ToUint8Array,
  lightenColor,
} from "@/components/kaji/helpers";
import { StatsView } from "@/components/kaji/stats-view";
import { useEdgeSwipeBack } from "@/components/kaji/use-edge-swipe-back";
import { useSwipeTab } from "@/components/kaji/use-swipe-tab";
import {
  FamilyCodeCard,
  HomeSectionTitle,
  HomeTaskChip,
  HomeTaskRow,
  JoinHouseholdCard,
  ScreenTitle,
  SegmentedFilter,
  SettingToggleRow,
  SwipableListChoreRow,
  UndoToast,
} from "@/components/kaji/ui-parts";
import { AnimatedList } from "@/components/ui/animated-list";
import {
  BootstrapResponse,
  ChoreAssignmentEntry,
  ChoreWithComputed,
  NotificationSettings,
  StatsPeriodKey,
  StatsResponse,
} from "@/lib/types";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

const JA_COLLATOR = new Intl.Collator("ja");
type ListSortKey = "kana" | "due" | "icon";
const LIST_SORT_ITEMS: Array<{ key: ListSortKey; label: string }> = [
  { key: "icon", label: "アイコン" },
  { key: "due", label: "期日" },
  { key: "kana", label: "かな順" },
];

const HOME_SECTION_STICKY_FALLBACK_TOP = 72;
const ASSIGNMENT_SHEET_SLIDE_MS = 240;
const ASSIGNMENT_BACK_SWIPE_EDGE_PX = 72;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PULL_REFRESH_TRIGGER_PX = 74;
const PULL_REFRESH_MAX_PX = 128;
const PULL_REFRESH_HOLD_PX = 28;

type TabKey = "home" | "list" | "stats" | "settings";
const TAB_ORDER: readonly TabKey[] = ["home", "list", "stats", "settings"] as const;
type AssignmentTabKey = "daily" | "big";
const ASSIGNMENT_TAB_ORDER: readonly AssignmentTabKey[] = ["daily", "big"] as const;
type StatsQueryOptions = { from: string; to: string };
type CustomDateRange = { from: string; to: string };
const APP_UPDATE_NOTICE_STORAGE_KEY = "kaji_app_update_notice";
const APP_UPDATE_TARGET_TAB_STORAGE_KEY = "kaji_app_update_target_tab";
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

function applyPullResistance(distance: number) {
  return Math.min(PULL_REFRESH_MAX_PX, Math.max(0, distance) * 0.5);
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
      (c.isDueTomorrow || (c.intervalDays === 1 && (c.isDueToday || c.isOverdue))) &&
      !(c.isBigTask && c.doneToday),
  );
  const priorityChoreIds = new Set([...todayChores, ...tomorrowChores].map((chore) => chore.id));
  const bigTaskWindowEnd = addDays(startOfJstDay(new Date()), 40).getTime();
  const upcomingBigChores = chores
    .filter((c) => {
      if (!c.isBigTask || priorityChoreIds.has(c.id) || !c.dueAt) return false;
      const dueDayTime = startOfJstDay(new Date(c.dueAt)).getTime();
      return dueDayTime <= bigTaskWindowEnd;
    })
    .sort((a, b) => {
      const aTime = a.dueAt
        ? startOfJstDay(new Date(a.dueAt)).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueAt
        ? startOfJstDay(new Date(b.dueAt)).getTime()
        : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  return { todayChores, tomorrowChores, upcomingBigChores };
}

/** Assignee priority: self=0 > partner=1 > none=2 */
function assigneePriority(assigneeId: string | null, sessionUserId: string | null): number {
  if (!assigneeId) return 2;
  if (sessionUserId && assigneeId === sessionUserId) return 0;
  return 1;
}

function sortHomeSectionChores(
  sectionKey: "today" | "tomorrow" | "big",
  chores: ChoreWithComputed[],
  sessionUserId: string | null,
  resolveAssigneeId: (choreId: string) => string | null,
  customIcons: CustomIconOption[],
) {
  return [...chores].sort((a, b) => {
    const aIsSkipped = !!a.lastRecordSkipped && a.doneToday;
    const bIsSkipped = !!b.lastRecordSkipped && b.doneToday;

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
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "home";
    const storedTab = window.sessionStorage.getItem(APP_UPDATE_TARGET_TAB_STORAGE_KEY);
    if (storedTab && TAB_ORDER.includes(storedTab as TabKey)) {
      window.sessionStorage.removeItem(APP_UPDATE_TARGET_TAB_STORAGE_KEY);
      return storedTab as TabKey;
    }
    return "home";
  });

  const [records, setRecords] = useState<
    Array<{
      id: string;
      performedAt: string;
      memo: string | null;
      chore: { id: string; title: string };
      user: { id: string; name: string };
      isInitial?: boolean;
      isSkipped?: boolean;
    }>
  >([]);

  const [registerName, setRegisterName] = useState("");
  const [registerInviteCode, setRegisterInviteCode] = useState("");
  const [registerColor, setRegisterColor] = useState(USER_COLOR_PALETTE[0]);
  const [registerLoading, setRegisterLoading] = useState(false);

  const [choreEditorOpen, setChoreEditorOpen] = useState(false);
  const [customIconOpen, setCustomIconOpen] = useState(false);
  const [customIcons, setCustomIcons] = useState<CustomIconOption[]>([]);
  const [editingChore, setEditingChore] = useState<ChoreForm | null>(null);
  const [memoTarget, setMemoTarget] = useState<ChoreWithComputed | null>(null);
  const [memo, setMemo] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  const [recordUpdatingIds, setRecordUpdatingIds] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<ChoreWithComputed | null>(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [pendingSwipeDeletes, setPendingSwipeDeletes] = useState<PendingSwipeDelete[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saveChoreLoading, setSaveChoreLoading] = useState(false);
  const [deleteChoreLoading, setDeleteChoreLoading] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(
    null,
  );
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [appUpdateLoading, setAppUpdateLoading] = useState(false);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [appReloading, setAppReloading] = useState(false);
  const startupUpdateCheckedRef = useRef(false);

  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentMounted, setAssignmentMounted] = useState(false);
  const [assignmentSlideIn, setAssignmentSlideIn] = useState(false);
  const assignmentCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const openAssignment = useCallback(() => {
    clearAssignmentCloseTimer();
    setAssignmentOpen(true);
    setAssignmentMounted(true);
    setAssignmentSlideIn(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAssignmentSlideIn(true);
      });
    });
  }, [clearAssignmentCloseTimer]);
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
  const swipe = useSwipeTab({
    tabs: TAB_ORDER,
    activeTab,
    onChangeTab: (tab) => { closeAssignment(); setActiveTab(tab); if (tab === "home") setRefreshAnimationSeed((p) => p + 1); },
    disabled: assignmentOpen || listDeleteSwipeActive || balanceSwipeActive,
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
  const statsHeaderRef = useRef<HTMLDivElement | null>(null);
  const settingsHeaderRef = useRef<HTMLDivElement | null>(null);
  const [listHeaderHeight, setListHeaderHeight] = useState(0);
  const [statsHeaderHeight, setStatsHeaderHeight] = useState(0);
  const [settingsHeaderHeight, setSettingsHeaderHeight] = useState(0);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
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
          const scheduled = filtered.filter((c) => isScheduledOnDate(c, date));
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
  }, [chores, priorityHomeChoreIds]);

  useEffect(() => {
    customDateRangeRef.current = customDateRange;
  }, [customDateRange]);

  const loadBootstrap = useCallback(async () => {
    const data = await apiFetch<BootstrapResponse>("/api/bootstrap", { cache: "no-store" });
    setBoot(data);
    setAssignments(data.assignments ?? []);
    setNotificationSettings(data.notificationSettings);
    setCustomIcons(data.customIcons ?? []);
    return data;
  }, []);

  const loadStats = useCallback(async (period: StatsPeriodKey, options?: StatsQueryOptions) => {
    const requestId = ++statsRequestIdRef.current;
    setStatsPeriod(period);
    setStatsLoading(true);

    const params = new URLSearchParams({ period });
    if (period === "custom") {
      const from = options?.from ?? customDateRangeRef.current.from;
      const to = options?.to ?? customDateRangeRef.current.to;
      params.set("from", from);
      params.set("to", to);
      const nextRange = { from, to };
      customDateRangeRef.current = nextRange;
      setCustomDateRange(nextRange);
    }

    try {
      const data = await apiFetch<StatsResponse>(`/api/stats?${params.toString()}`, { cache: "no-store" });
      if (requestId !== statsRequestIdRef.current) return;
      setStats(data);
      setStatsAnimationSeed((prev) => prev + 1);
    } finally {
      if (requestId === statsRequestIdRef.current) {
        setStatsLoading(false);
      }
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const data = await apiFetch<{
      records: Array<{
        id: string;
        performedAt: string;
        memo: string | null;
        chore: { id: string; title: string };
        user: { id: string; name: string };
        isInitial?: boolean;
        isSkipped?: boolean;
      }>;
    }>("/api/records");
    setRecords(data.records);
  }, []);

  const refreshAll = useCallback(
    async (period: StatsPeriodKey) => {
      const data = await loadBootstrap();
      if (data.needsRegistration || !data.sessionUser) {
        setStats(null);
        setStatsLoading(false);
        setRecords([]);
        return data;
      }
      await Promise.all([loadStats(period), loadHistory()]);
      return data;
    },
    [loadBootstrap, loadHistory, loadStats],
  );

  // ── Real-time sync polling ──────────────────────────────────
  const syncTokenRef = useRef<string | null>(null);
  const syncPollingRef = useRef(false);
  const syncRefreshingRef = useRef(false);
  const statsPeriodRef = useRef(statsPeriod);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { statsPeriodRef.current = statsPeriod; }, [statsPeriod]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const syncCheck = useCallback(async () => {
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
      const refreshPromises: Promise<unknown>[] = [loadBootstrap()];
      // Only refresh stats/history when user is on those tabs
      const tab = activeTabRef.current;
      if (tab === "stats") {
        refreshPromises.push(loadStats(statsPeriodRef.current).catch(() => { }));
      }
      if (tab === "stats" || tab === "home") {
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
  }, [loadBootstrap, loadStats, loadHistory]);

  useEffect(() => {
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
  }, [syncCheck]);
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
        reloadAppForLatestUpdate({ showNotice: true, targetTab: "settings" });
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

  const handleDeleteCustomIcon = useCallback((customIconId: string) => {
    setCustomIcons((prev) => prev.filter((icon) => icon.id !== customIconId));
    apiFetch(`/api/custom-icons/${customIconId}`, { method: "DELETE" }).catch(() => {
      // Reload on failure to restore state
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
      [statsHeaderRef, setStatsHeaderHeight],
      [settingsHeaderRef, setSettingsHeaderHeight],
    ];
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      for (const [ref, setter] of entries) {
        const el = ref.current;
        if (!el) continue;
        const h = Math.ceil(el.getBoundingClientRect().height);
        if (Number.isFinite(h) && h > 0) setter((prev) => (prev === h ? prev : h));
      }
    });
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

  const registerUser = async (e: FormEvent) => {
    e.preventDefault();
    if (registerLoading) return;
    try {
      setRegisterLoading(true);
      setError("");
      await apiFetch("/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: registerName,
          color: registerColor,
          ...(registerInviteCode.trim() ? { inviteCode: registerInviteCode.trim() } : {}),
        }),
      });
      await refreshAll("week");
    } catch (err: unknown) {
      setError((err as Error).message ?? "登録に失敗しました。");
    } finally {
      setRegisterLoading(false);
    }
  };

  const openAddChore = () => {
    setEditingChore({
      title: "",
      intervalDays: 7,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#1A9BE8",
      bgColor: "#EAF5FF",
      lastPerformedAt: defaultLastPerformedAt(),
    });
    setChoreEditorOpen(true);
  };

  const openEditChore = (chore: ChoreWithComputed) => {
    setEditingChore({
      id: chore.id,
      title: chore.title,
      intervalDays: chore.intervalDays,
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
    setError("");
    if (!editingChore.lastPerformedAt) {
      setError("前回実施日時は必須です。");
      return;
    }
    if (Number.isNaN(new Date(editingChore.lastPerformedAt).getTime())) {
      setError("前回実施日時が不正です。");
      return;
    }

    const payload = {
      title: editingChore.title,
      intervalDays: Number(editingChore.intervalDays),
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
      setDeleteConfirmOpen(false);
      setChoreEditorOpen(false);
    } catch (err: unknown) {
      setError((err as Error).message ?? "家事の保存に失敗しました。");
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
    try {
      setDeleteChoreLoading(true);
      await apiFetch(`/api/chores/${editingChore.id}`, { method: "DELETE" });
      await refreshAll(statsPeriod);
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

  const openMemo = (chore: ChoreWithComputed) => {
    setMemoTarget(chore);
    setMemo("");
    setMemoOpen(true);
  };

  const submitRecord = async () => {
    if (!memoTarget) return;
    const targetId = memoTarget.id;
    const previousBoot = boot;
    const now = new Date();
    const nowIso = now.toISOString();

    setMemoOpen(false);
    setRecordUpdating(targetId, true);

    if (sessionUser) {
      updateBootChoreOptimistically(targetId, (chore) => ({
        ...chore,
        doneToday: true,
        lastPerformedAt: nowIso,
        lastPerformerName: sessionUser.name,
        lastPerformerId: sessionUser.id,
        lastRecordSkipped: false,
        lastRecordId: chore.lastRecordId ?? `optimistic-${now.getTime()}`,
        dueAt: addDays(now, chore.intervalDays).toISOString(),
        isDueToday: false,
        isDueTomorrow: chore.intervalDays === 1,
        isOverdue: false,
        overdueDays: 0,
        daysSinceLast: 0,
      }));
    }

    try {
      const result = await apiFetch<{ record: { id: string } }>(`/api/chores/${targetId}/record`, {
        method: "POST",
        body: JSON.stringify({ memo }),
      });
      // Replace the optimistic lastRecordId with the real one from the server
      if (result?.record?.id) {
        updateBootChoreOptimistically(targetId, (chore) => ({
          ...chore,
          lastRecordId: result.record.id,
        }));
      }
      void Promise.all([loadStats(statsPeriod), loadHistory()]);
    } catch (err: unknown) {
      if (previousBoot) {
        setBoot(previousBoot);
      }
      setError((err as Error).message ?? "スキップに失敗しました。");
    } finally {
      setRecordUpdating(targetId, false);
      setMemoTarget(null);
    }
  };

  const submitSkip = async () => {
    if (!memoTarget) return;
    const targetId = memoTarget.id;
    const previousBoot = boot;
    const now = new Date();
    const nowIso = now.toISOString();

    setMemoOpen(false);
    setRecordUpdating(targetId, true);

    if (sessionUser) {
      updateBootChoreOptimistically(targetId, (chore) => ({
        ...chore,
        doneToday: true,
        lastPerformedAt: nowIso,
        lastPerformerName: "スキップ",
        lastPerformerId: sessionUser.id,
        lastRecordSkipped: true,
        lastRecordId: chore.lastRecordId ?? `optimistic-skip-${now.getTime()}`,
        dueAt: addDays(now, chore.intervalDays).toISOString(),
        isDueToday: false,
        isDueTomorrow: chore.intervalDays === 1,
        isOverdue: false,
        overdueDays: 0,
        daysSinceLast: 0,
      }));
    }

    try {
      const result = await apiFetch<{ record: { id: string } }>(`/api/chores/${targetId}/record`, {
        method: "POST",
        body: JSON.stringify({ memo, skipped: true }),
      });
      if (result?.record?.id) {
        updateBootChoreOptimistically(targetId, (chore) => ({
          ...chore,
          lastRecordId: result.record.id,
        }));
      }
      void Promise.all([loadStats(statsPeriod), loadHistory()]);
    } catch (err: unknown) {
      if (previousBoot) {
        setBoot(previousBoot);
      }
      setError((err as Error).message ?? "スキップに失敗しました。");
    } finally {
      setRecordUpdating(targetId, false);
      setMemoTarget(null);
    }
  };

  const undoRecord = async (chore: ChoreWithComputed) => {
    if (!chore.lastRecordId) return;
    const previousBoot = boot;
    setRecordUpdating(chore.id, true);

    // Recalculate due-date flags from the pre-check dueAt.
    // submitRecord shifted dueAt forward by intervalDays, so we reverse it.
    const origDueAt = chore.lastPerformedAt
      ? addDays(new Date(chore.lastPerformedAt), chore.intervalDays).toISOString()
      : chore.dueAt;
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
      void Promise.all([loadStats(statsPeriod), loadHistory()]);
    } catch (err: unknown) {
      if (previousBoot) {
        setBoot(previousBoot);
      }
      setError((err as Error).message ?? "Failed to undo record.");
    } finally {
      setRecordUpdating(chore.id, false);
    }
  };

  const openHistory = (chore: ChoreWithComputed) => {
    setHistoryTarget(chore);
    setHistoryFilter("all");
    setHistoryOpen(true);
  };

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
      setError((err as Error).message ?? "統計の読み込みに失敗しました。");
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
      if (pullRefreshing || assignmentOpen || activeTab === "settings") return;
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
    [activeTab, assignmentOpen, pullRefreshing],
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
    if (!historyTarget) return [];
    return records.filter((record) => {
      if (record.chore.id !== historyTarget.id) return false;
      if (historyFilter === "all") return true;
      return record.user.id === historyFilter;
    });
  }, [historyFilter, historyTarget, records]);

  const historyCountLast30 = useMemo(() => {
    if (!historyTarget) return 0;
    const cutoff = addDays(startOfJstDay(new Date()), -30);
    return records.filter(
      (record) => record.chore.id === historyTarget.id && new Date(record.performedAt) >= cutoff,
    ).length;
  }, [historyTarget, records]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA]">
        <Loader2 className="h-8 w-8 animate-spin text-[#5F6368]" />
      </main>
    );
  }

  if (!boot || boot.needsRegistration || !sessionUser) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#F8F9FA] to-[#EEF3FD]">
        <form onSubmit={registerUser} className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center gap-4 px-5 py-8">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 2L27 17L22 22L17 17L22 2Z" fill="#1A9BE8" />
            <path d="M22 42L27 27L22 22L17 27L22 42Z" fill="#1A9BE8" />
            <path d="M2 22L17 17L22 22L17 27L2 22Z" fill="#1A9BE8" />
            <path d="M42 22L27 17L22 22L27 27L42 22Z" fill="#1A9BE8" />
            <path d="M42 6L44 11L42 13L40 11L42 6Z" fill="#4FC3F7" />
            <path d="M42 13L44 11L46 13L44 15L42 13Z" fill="#4FC3F7" />
            <path d="M38 10L40 11L42 13L40 15L38 10Z" fill="#4FC3F7" />
            <circle cx="48" cy="4" r="2.5" fill="#4FC3F7" />
          </svg>
          <p className="text-[26px] font-bold text-[#202124]">さあ、始めましょう</p>
          <div className="w-full space-y-3 rounded-[20px] border border-[#DADCE0] bg-white px-[18px] py-4">
            <div className="flex items-center gap-2">
              <User size={22} className="text-[#1A9BE8]" aria-hidden="true" />
              <p className="text-[24px] font-bold text-[#202124]">あなたの名前は？</p>
            </div>
            <input
              value={registerName}
              onChange={(e) => setRegisterName(e.target.value)}
              className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[16.8px] font-semibold text-[#202124] outline-none"
            />
            <div className="h-px bg-[#E8EAED]" />
            <div className="space-y-2">
              <p className="text-[15px] font-bold text-[#202124]">マイカラー</p>
              <div className="flex flex-wrap gap-2">
                {USER_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setRegisterColor(c)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform ${registerColor === c ? "scale-110 ring-2 ring-[#202124] ring-offset-2" : ""}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  >
                    {registerColor === c ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-px bg-[#E8EAED]" />
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] text-[#5F6368]">🎟️</span>
                <p className="text-[15px] font-bold text-[#202124]">家族コード</p>
                <p className="text-[13px] font-medium text-[#9AA0A6]">（任意）</p>
              </div>
              <input
                value={registerInviteCode}
                onChange={(e) => setRegisterInviteCode(e.target.value)}
                placeholder="パートナーから届いたコード"
                className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[16.8px] font-semibold text-[#202124] outline-none placeholder:text-[14px] placeholder:font-medium placeholder:text-[#9AA0A6]"
              />
              <p className="text-[11px] font-medium text-[#9AA0A6]">パートナーが先に登録済みの場合のみ入力</p>
            </div>
          </div>
          <div className="w-full space-y-3">
            <div className="space-y-1.5 px-1">
              <div className="flex items-center gap-1.5">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#1A9BE8] text-[11px] font-bold text-white">1</span>
                <p className="text-[12px] font-medium text-[#5F6368]">名前だけで登録 → 家族コードが発行されます</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#33C28A] text-[11px] font-bold text-white">2</span>
                <p className="text-[12px] font-medium text-[#5F6368]">コードをもらった方は入力して参加できます</p>
              </div>
            </div>
            <button
              type="submit"
              disabled={registerLoading}
              className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#1A9BE8] px-4 py-3 text-[16.8px] font-bold text-white shadow-lg shadow-[#2A1E1730] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {registerLoading ? <Loader2 size={18} className="animate-spin" /> : <span>→</span>}
              {registerLoading ? "読み込み中..." : "はじめる"}
            </button>
            {error ? <p className="mt-3 text-center text-sm text-[#C5221F]">{error}</p> : null}
          </div>
        </form>
      </main>
    );
  }

  const resolveAssigneeForSort = (choreId: string, sectionKey: "today" | "tomorrow" | "big", choreRef?: ChoreWithComputed) => {
    const todayKey = toJstDateKey(startOfJstDay(new Date()));
    const tomorrowKey = toJstDateKey(addDays(startOfJstDay(new Date()), 1));
    const sectionDateKey =
      sectionKey === "tomorrow"
        ? tomorrowKey
        : sectionKey === "big" && choreRef?.dueAt
          ? toJstDateKey(startOfJstDay(new Date(choreRef.dueAt)))
          : todayKey;
    const entry = assignments.find((x) => x.choreId === choreId && x.date === sectionDateKey);
    const clearKey = `${choreId}:${sectionDateKey}`;
    const isDefaultCleared = clearedDefaults.has(clearKey);
    const chore = choreRef ?? boot.chores.find((c) => c.id === choreId);
    if (entry) return entry.userId;
    if (!isDefaultCleared && chore?.defaultAssigneeId) return chore.defaultAssigneeId;
    return null;
  };

  // Latest today's record for きょうのきろく section
  const latestTodayRecord = useMemo(() => {
    const todayStart = startOfJstDay(new Date());
    const todayEnd = addDays(todayStart, 1);
    return records.find((r) => {
      if (r.isInitial) return false;
      const at = new Date(r.performedAt);
      return at >= todayStart && at < todayEnd;
    }) ?? null;
  }, [records]);

  const homeSections = [
    {
      key: "today" as const,
      title: "今日",
      chores: sortHomeSectionChores("today", boot.todayChores, sessionUser?.id ?? null, (choreId) => {
        const c = boot.todayChores.find((ch) => ch.id === choreId);
        return resolveAssigneeForSort(choreId, "today", c);
      }, customIcons),
    },
    {
      key: "tomorrow" as const,
      title: "明日",
      chores: sortHomeSectionChores("tomorrow", boot.tomorrowChores, sessionUser?.id ?? null, (choreId) => {
        const c = boot.tomorrowChores.find((ch) => ch.id === choreId);
        return resolveAssigneeForSort(choreId, "tomorrow", c);
      }, customIcons),
    },
    {
      key: "big" as const,
      title: "大仕事",
      chores: sortHomeSectionChores("big", boot.upcomingBigChores, sessionUser?.id ?? null, (choreId) => {
        const c = boot.upcomingBigChores.find((ch) => ch.id === choreId);
        return resolveAssigneeForSort(choreId, "big", c);
      }, customIcons),
    },
  ].filter((section) => section.chores.length > 0);
  const hasAnyUpcomingChores = homeSections.length > 0;
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
    pullRefreshEnabled && tab === activeTab && tab !== "settings"
      ? {
        transform: pullDistance === 0 ? "none" : `translate3d(0, ${pullDistance}px, 0)`,
        transition:
          pullDragging || pullRefreshing ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      }
      : undefined;
  const renderInlinePullRefreshHint = (tab: TabKey) => {
    if (!pullRefreshEnabled) return null;
    if (tab === "settings") return null;
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
      return (
        <div ref={homeHeaderRef} className="bg-[#F8F9FA]/95 px-5 pb-2 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
          <div className="flex items-center justify-between">
            <p className="text-[48px] font-bold leading-none text-[#5F6368]">{formatTopDate()}</p>
            {boot.users.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  openAssignment();
                  if (!assignmentUser && boot.users.length > 0) {
                    setAssignmentUser(boot.users[0].id);
                  }
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF3FF]"
              >
                <Users size={20} color="#1A9BE8" />
              </button>
            ) : null}
          </div>
        </div>
      );
    }
    if (tab === "list") {
      return (
        <div ref={listHeaderRef} className="space-y-1.5 bg-[#F8F9FA]/95 px-5 pb-3 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
          <ScreenTitle title="家事一覧" />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[13.2px] font-bold text-[#5F6368]">並び替え</p>
              <button
                type="button"
                onClick={() => setListSortOpen((prev) => !prev)}
                aria-expanded={listSortOpen}
                aria-controls="list-sort-options"
                className="rounded-lg p-1 text-[#5F6368]"
              >
                {listSortOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {listSortOpen ? (
              <div id="list-sort-options" className="flex flex-wrap gap-1.5">
                {LIST_SORT_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setListSortKey(item.key)}
                    className={`rounded-xl px-3 py-1.5 text-[12.5px] font-bold ${listSortKey === item.key ? "bg-[#1A9BE8] text-white" : "border border-[#DADCE0] bg-white text-[#5F6368]"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      );
    }
    if (tab === "stats") {
      return (
        <div ref={statsHeaderRef} className="space-y-2 bg-[#F8F9FA]/95 px-5 pb-3 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
          <ScreenTitle title="統計" />
          <div className="flex flex-wrap gap-1">
            {([
              { key: "week" as const, label: "1週間" },
              { key: "month" as const, label: "1か月" },
              { key: "half" as const, label: "半年" },
              { key: "year" as const, label: "1年" },
              { key: "all" as const, label: "全期間" },
              { key: "custom" as const, label: "カスタム", accent: true as const },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={async () => {
                  try {
                    setError("");
                    setStatsAnimationSeed((prev) => prev + 1);
                    if (item.key === "custom") {
                      setCustomEditorOpen(true);
                      await applyCustomDateRange(customDateRange);
                      return;
                    }
                    setCustomEditorOpen(false);
                    await loadStats(item.key);
                  } catch (err: unknown) {
                    setError((err as Error).message ?? "統計の読み込みに失敗しました。");
                  }
                }}
                className={`inline-flex items-center gap-1 rounded-[11px] px-2 py-1.5 text-[13.2px] font-bold ${statsPeriod === item.key
                  ? "bg-[#1A9BE8] text-white"
                  : "accent" in item && item.accent
                    ? "bg-[#EEF3FF] text-[#4D8BFF]"
                    : "bg-[#F1F3F4] text-[#5F6368]"
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div ref={settingsHeaderRef} className="bg-[#F8F9FA]/95 px-5 pb-2 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
        <ScreenTitle title="設定" />
      </div>
    );
  };

  const renderMainTabContent = (tab: TabKey) => {
    if (tab === "home") {
      return (
        <div className="space-y-[10px]" style={{ paddingTop: homeHeaderHeight }}>

          <div className="space-y-[10px]" style={getPullAnimatedContentStyle(tab)}>
            {renderInlinePullRefreshHint(tab)}
            {hasAnyUpcomingChores ? (
              <>
                {homeSections.map((section) => (
                  <div key={section.key} className="space-y-[6px]">
                    <div
                      className="sticky z-20 bg-[#F8F9FA]/95 pb-1 pt-1 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85"
                      style={{ top: 0 }}
                    >
                      <HomeSectionTitle title={section.title} count={section.chores.length} />
                    </div>
                    <div className="grid grid-cols-2 gap-[6px]">
                      {section.chores.map((chore) => {
                        const todayKey = toJstDateKey(startOfJstDay(new Date()));
                        const tomorrowKey = toJstDateKey(addDays(startOfJstDay(new Date()), 1));
                        const bigDueDateKey = chore.dueAt
                          ? toJstDateKey(startOfJstDay(new Date(chore.dueAt)))
                          : todayKey;
                        const sectionDateKey =
                          section.key === "tomorrow"
                            ? tomorrowKey
                            : section.key === "big"
                              ? bigDueDateKey
                              : todayKey;
                        const assignedEntry = assignments.find(
                          (x) => x.choreId === chore.id && x.date === sectionDateKey,
                        );
                        const isDefaultCleared = clearedDefaults.has(`${chore.id}:${sectionDateKey}`);
                        const effectiveAssigneeId = assignedEntry?.userId ?? (isDefaultCleared ? null : chore.defaultAssigneeId) ?? null;
                        const assigneeName = assignedEntry?.userName ?? (isDefaultCleared ? null : chore.defaultAssigneeName) ?? null;
                        const assigneeUser = effectiveAssigneeId ? boot.users.find((u) => u.id === effectiveAssigneeId) : null;
                        const assigneeColor = assigneeUser?.color ?? null;
                        const disableTomorrowDailyCheck =
                          section.key === "tomorrow" && chore.intervalDays === 1;
                        const performerUser = chore.lastPerformerId ? boot.users.find((u) => u.id === chore.lastPerformerId) : null;
                        const performerColor = performerUser?.color ?? null;
                        return (
                          <HomeTaskChip
                            key={chore.id}
                            chore={
                              section.key === "tomorrow" && chore.doneToday
                                ? { ...chore, doneToday: false }
                                : chore
                            }
                            onRecord={openMemo}
                            onUndo={undoRecord}
                            isUpdating={recordUpdatingIds.includes(chore.id)}
                            recordDisabled={disableTomorrowDailyCheck}
                            assigneeName={assigneeName}
                            assigneeColor={assigneeColor}
                            performerColor={performerColor}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
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

            {/* きょうのきろく — latest record today */}
            {latestTodayRecord && (
              <div className="space-y-[6px]">
                <div className="flex items-center gap-2">
                  <h2 className="text-[22px] font-bold leading-none text-[#202124]">さいしんのきろく</h2>
                </div>
                <div className="flex items-center gap-2 rounded-[12px] bg-white px-3 py-[10px]">
                  <Check size={14} strokeWidth={3} className="shrink-0 text-[#33C28A]" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-[#202124]">
                    {latestTodayRecord.chore.title}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-[#5F6368]">
                    {latestTodayRecord.user.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-[#9AA0A6]">
                    {new Intl.DateTimeFormat("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                    }).format(new Date(latestTodayRecord.performedAt))}
                  </span>
                </div>
                {latestTodayRecord.memo && (
                  <p className="px-3 text-[12px] font-medium text-[#5F6368]">
                    「{latestTodayRecord.memo}」
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (tab === "list") {
      return (
        <div className="space-y-4" style={{ paddingTop: listHeaderHeight }}>
          <div className="space-y-4" style={getPullAnimatedContentStyle(tab)}>
            {renderInlinePullRefreshHint(tab)}
            <div className="flex flex-col items-stretch gap-2">
              {listChores.map((chore) => {
                const meta = chore.isBigTask
                  ? `${chore.intervalDays}日ごと / 最終: ${chore.lastPerformedAt ? formatMonthDay(chore.lastPerformedAt) : "未設定"
                  } / ${dueInDaysLabel(chore)}`
                  : `${chore.intervalDays}日ごと / 前回:${relativeLastPerformed(chore.lastPerformedAt)} / ${chore.lastPerformerName ?? "未設定"
                  }`;
                return (
                  <SwipableListChoreRow
                    key={chore.id}
                    chore={chore}
                    meta={meta}
                    onOpenHistory={openHistory}
                    onEdit={openEditChore}
                    onSwipeDelete={handleSwipeDeleteChore}
                    onDeleteSwipeActiveChange={handleListDeleteSwipeActiveChange}
                    relaxedSwipeStart={pendingSwipeDeletes.length > 0}
                  />
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    if (tab === "stats") {
      return (
        <div className="space-y-5" style={{ paddingTop: statsHeaderHeight }}>
          <div className="space-y-5" style={getPullAnimatedContentStyle(tab)}>
            {renderInlinePullRefreshHint(tab)}
            <StatsView
              stats={stats}
              activePeriod={statsPeriod}
              isLoading={statsLoading}
              animationSeed={statsAnimationSeed}
              customDateRange={customDateRange}
              userColors={(() => {
                const map = new Map<string, string>();
                for (const u of boot.users) {
                  if (u.color) map.set(u.id, u.color);
                }
                return map;
              })()}
              onChangeCustomDateRange={setCustomDateRange}
              onApplyCustomDateRange={async (range) => {
                await applyCustomDateRange(range);
                setCustomEditorOpen(false);
              }}
              customEditorOpen={customEditorOpen}
              onBalanceSwipeActiveChange={setBalanceSwipeActive}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6" style={{ paddingTop: settingsHeaderHeight }}>
        <div className="space-y-4">
          <SettingToggleRow
            title="期限当日通知"
            subtitle="朝8時・夕方18時に通知"
            checked={notificationSettings?.notifyDueToday ?? false}
            onChange={(next) => {
              if (!notificationSettings) return;
              updateNotificationSettings({ ...notificationSettings, notifyDueToday: next });
            }}
          />

          <SettingToggleRow
            title="期限超過通知"
            checked={notificationSettings?.remindDailyIfOverdue ?? false}
            onChange={(next) => {
              if (!notificationSettings) return;
              updateNotificationSettings({ ...notificationSettings, remindDailyIfOverdue: next });
            }}
          />
          <SettingToggleRow
            title="完了時通知"
            checked={notificationSettings?.notifyCompletion ?? false}
            onChange={(next) => {
              if (!notificationSettings) return;
              updateNotificationSettings({ ...notificationSettings, notifyCompletion: next });
            }}
          />

          <div className="rounded-[14px] bg-white p-4">
            <p className="text-[15px] font-bold text-[#202124]">マイカラー</p>
            <p className="mt-1 text-[12px] font-medium text-[#9AA0A6]">分担バランスのグラフに使う色</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {USER_COLOR_PALETTE.map((c) => {
                const isActive = (sessionUser.color ?? USER_COLOR_PALETTE[0]) === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={async () => {
                      try {
                        setError("");
                        await apiFetch("/api/user", {
                          method: "PATCH",
                          body: JSON.stringify({ color: c }),
                        });
                        setBoot((prev) => {
                          if (!prev || prev.needsRegistration) return prev;
                          return {
                            ...prev,
                            sessionUser: prev.sessionUser ? { ...prev.sessionUser, color: c } : prev.sessionUser,
                            users: prev.users.map((u) => (u.id === sessionUser.id ? { ...u, color: c } : u)),
                          };
                        });
                      } catch (err: unknown) {
                        setError((err as Error).message ?? "カラーの変更に失敗しました。");
                      }
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform ${isActive ? "scale-110 ring-2 ring-[#202124] ring-offset-2" : ""}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  >
                    {isActive ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <FamilyCodeCard
            inviteCode={boot.householdInviteCode}
            partnerName={
              boot.users.length > 1
                ? boot.users.find((u) => u.id !== sessionUser.id)?.name ?? null
                : null
            }
          />

          {boot.users.length <= 1 ? (
            <JoinHouseholdCard
              onJoin={async (code) => {
                try {
                  setError("");
                  await apiFetch("/api/household/join", {
                    method: "POST",
                    body: JSON.stringify({ inviteCode: code }),
                  });
                  await refreshAll(statsPeriod);
                } catch (err: unknown) {
                  setError((err as Error).message ?? "参加に失敗しました。");
                }
              }}
            />
          ) : null}

          <div className="rounded-[14px] bg-[#FFF8E8] p-4">
            <p className="text-[17px] font-bold text-[#202124]">通知テスト</p>
            <button
              type="button"
              onClick={handleTestNotification}
              disabled={pushLoading}
              className="mt-3 w-full rounded-[12px] bg-[#C2A12F] px-3 py-2 text-[14.4px] font-bold text-white disabled:opacity-60"
            >
              いま通知を送信
            </button>
          </div>

          <div className="rounded-[14px] bg-white p-4">
            <p className="text-[17px] font-bold text-[#202124]">アプリ更新</p>
            <button
              type="button"
              onClick={handleManualAppUpdate}
              disabled={appUpdateLoading}
              className="mt-3 w-full rounded-[12px] bg-[#1A9BE8] px-3 py-2 text-[14.4px] font-bold text-white disabled:opacity-60"
            >
              {appUpdateLoading || appReloading
                ? "最新化中..."
                : "最新化"}
            </button>
          </div>

          <div className="rounded-[14px] bg-white p-4">
            <button
              type="button"
              onClick={async () => {
                try {
                  await apiFetch("/api/logout", { method: "POST" });
                  window.location.reload();
                } catch (err: unknown) {
                  setError((err as Error).message ?? "ログアウトに失敗しました。");
                }
              }}
              className="w-full rounded-[12px] bg-[#E8E8E8] px-3 py-2 text-[14.4px] font-bold text-[#5F6368]"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="mx-auto flex h-screen w-full max-w-[430px] flex-col overflow-hidden overscroll-y-none bg-[#F8F9FA]">
      <section
        className="relative flex-1 overflow-hidden overscroll-y-none"
        onTouchStart={(e) => {
          swipe.onTouchStart(e);
          assignmentEdgeSwipe.onTouchStart(e);
        }}
        onTouchMove={(e) => {
          swipe.onTouchMove(e);
          assignmentEdgeSwipe.onTouchMove(e);
        }}
        onTouchEnd={(e) => {
          swipe.onTouchEnd(e);
          assignmentEdgeSwipe.onTouchEnd(e);
        }}
        onTouchCancel={() => {
          swipe.onTouchCancel();
          assignmentEdgeSwipe.onTouchCancel();
        }}
      >
        <div className="relative h-full overflow-hidden">
          <div className="absolute left-0 right-0 top-0 z-30 overflow-hidden" style={isSwipeSheetMoving ? undefined : { height: activeTab === "home" ? homeHeaderHeight : activeTab === "list" ? listHeaderHeight : activeTab === "stats" ? statsHeaderHeight : settingsHeaderHeight }}>
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
            onTouchMove={handleMainScrollTouchMove}
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

      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-[45] mx-auto h-20 max-w-[430px] bg-gradient-to-t from-white/90 via-white/65 to-transparent"
      />

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
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 px-6 backdrop-blur-[1px]"
          style={{
            paddingTop: "max(env(safe-area-inset-top), 16px)",
            paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="更新完了"
            className="w-full max-w-[288px] rounded-[18px] border border-[#DADCE0] bg-white px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.26)]"
          >
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F3FD]">
              <span className="material-symbols-rounded text-[22px] text-[#1A9BE8]">check_circle</span>
            </div>
            <p className="mt-2.5 text-center text-[15px] font-bold text-[#202124]">{infoMessage}</p>
            <button
              type="button"
              onClick={() => setInfoMessage("")}
              className="mt-3.5 w-full rounded-xl border border-[#1A9BE8] bg-[#1A9BE8] px-3 py-2 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(26,155,232,0.35)]"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 z-[10010] bg-[#F8F9FA] transition-opacity duration-200 ${appReloading ? "opacity-100" : "opacity-0"}`}
      />

      <nav className="fixed bottom-4 left-0 right-0 z-50 mx-auto max-w-[430px] px-4">
        <div className="flex w-full items-center justify-around rounded-full bg-white px-2 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <button type="button" onClick={() => { closeAssignment(); setActiveTab("home"); setRefreshAnimationSeed((p) => p + 1); }} className="flex h-10 w-10 items-center justify-center">
            <span className="material-symbols-rounded text-[24px]" style={{ color: activeTab === "home" ? PRIMARY_COLOR : "#9AA0A6" }}>home</span>
          </button>
          <button type="button" onClick={() => { closeAssignment(); setActiveTab("list"); }} className="flex h-10 w-10 items-center justify-center">
            <span className="material-symbols-rounded text-[24px]" style={{ color: activeTab === "list" ? PRIMARY_COLOR : "#9AA0A6" }}>checklist</span>
          </button>
          <button type="button" onClick={() => { closeAssignment(); openAddChore(); }} className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[#1A9BE8] text-white shadow-md">
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <button type="button" onClick={() => { closeAssignment(); setActiveTab("stats"); }} className="flex h-10 w-10 items-center justify-center">
            <span className="material-symbols-rounded text-[24px]" style={{ color: activeTab === "stats" ? PRIMARY_COLOR : "#9AA0A6" }}>bar_chart</span>
          </button>
          <button type="button" onClick={() => { closeAssignment(); setActiveTab("settings"); }} className="flex h-10 w-10 items-center justify-center">
            <span className="material-symbols-rounded text-[24px]" style={{ color: activeTab === "settings" ? PRIMARY_COLOR : "#9AA0A6" }}>settings</span>
          </button>
        </div>
      </nav>

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
      <BottomSheet
        open={memoOpen}
        onClose={() => setMemoOpen(false)}
        title=""
        maxHeightClassName="min-h-[62vh] max-h-[88vh]"
      >
        <div className="space-y-3 pb-2">
          <p className="text-[14.4px] font-bold text-[#5F6368]">メモ（任意）</p>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="通知に添えるメモを入力"
            className="h-[80px] w-full resize-none rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[15.6px] font-medium text-[#202124] outline-none"
          />
          <button
            type="button"
            onClick={submitRecord}
            className="w-full rounded-[14px] bg-[#1A9BE8] px-4 py-3 text-[15.6px] font-bold text-white"
          >
            記録する
          </button>
          <button
            type="button"
            onClick={submitSkip}
            className="mt-3 w-full rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-[15.6px] font-bold text-[#5F6368]"
          >
            スキップ
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title=""
        maxHeightClassName="min-h-[62vh] max-h-[88vh]"
      >
        <div className="space-y-3 pb-2">
          <div className="rounded-[14px] bg-white p-3">
            <p className="text-[16.8px] font-bold text-[#202124]">{historyTarget?.title}</p>
            <p className="text-[13.2px] font-medium text-[#5F6368]">
              {historyTarget ? `${historyTarget.intervalDays}日ごと / 直近30日の実施回数: ${historyCountLast30}回` : ""}
            </p>
          </div>
          <SegmentedFilter items={historyFilters} activeKey={historyFilter} onChange={setHistoryFilter} />
          <AnimatedList delay={70} className="items-stretch gap-2">
            {historyRecords.map((record, index) => (
              <div key={record.id} className="flex items-start gap-3 rounded-[14px] bg-white p-3">
                <span
                  className="mt-1 h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: index % 2 === 0 ? "#33C28A" : "#4285F4" }}
                />
                <div className="space-y-1">
                  <p className="text-[15.6px] font-bold text-[#202124]">
                    {formatJpDate(record.performedAt)} {
                      record.isSkipped
                        ? "スキップ"
                        : record.isInitial || record.user.name === "初期登録"
                          ? "初回登録"
                          : `${record.user.name}が実施`
                    }
                  </p>
                  {record.memo ? (
                    <p className="text-[13.2px] font-medium text-[#5F6368]">メモ: {record.memo}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </AnimatedList>
        </div>
      </BottomSheet>

      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-6 w-full max-w-[320px] animate-[scaleIn_0.2s_ease-out] rounded-[20px] bg-white p-6 shadow-xl">
            <p className="text-center text-[17px] font-bold text-[#202124]">
              この家事を削除しますか？
            </p>
            <p className="mt-2 text-center text-[13px] font-medium text-[#5F6368]">
              削除すると元に戻せません。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteChoreLoading}
                className="rounded-[14px] border border-[#DADCE0] bg-white px-4 py-[11px] text-[15px] font-bold text-[#5F6368] disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDeleteChore}
                disabled={deleteChoreLoading}
                className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[#D45858] px-4 py-[11px] text-[15px] font-bold text-white disabled:opacity-60"
              >
                {deleteChoreLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                {deleteChoreLoading ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main >
  );
}
