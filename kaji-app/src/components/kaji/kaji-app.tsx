"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
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
import { PRIMARY_COLOR } from "@/components/kaji/constants";
import {
  apiFetch,
  dueInDaysLabel,
  formatJpDate,
  formatMonthDay,
  formatTopDate,
  relativeLastPerformed,
  urlBase64ToUint8Array,
} from "@/components/kaji/helpers";
import { StatsView } from "@/components/kaji/stats-view";
import { useEdgeSwipeBack } from "@/components/kaji/use-edge-swipe-back";
import { useSwipeTab } from "@/components/kaji/use-swipe-tab";
import {
  FamilyCodeCard,
  HomeSectionTitle,
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
type ListSortKey = "kana" | "due";
const LIST_SORT_ITEMS: Array<{ key: ListSortKey; label: string }> = [
  { key: "kana", label: "かな順" },
  { key: "due", label: "期日" },
];

const HOME_SECTION_STICKY_FALLBACK_TOP = 72;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type TabKey = "home" | "list" | "stats" | "settings";
const TAB_ORDER: readonly TabKey[] = ["home", "list", "stats", "settings"] as const;
type StatsQueryOptions = { from: string; to: string };
type CustomDateRange = { from: string; to: string };
const CUSTOM_ICONS_STORAGE_KEY = "kaji_custom_icons";
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
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>(() =>
    defaultCustomDateRange(),
  );
  const customDateRangeRef = useRef<CustomDateRange>(customDateRange);
  const statsRequestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("home");

  const [records, setRecords] = useState<
    Array<{
      id: string;
      performedAt: string;
      memo: string | null;
      chore: { id: string; title: string };
      user: { id: string; name: string };
    }>
  >([]);

  const [registerName, setRegisterName] = useState("");
  const [registerInviteCode, setRegisterInviteCode] = useState("");
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

  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [listDeleteSwipeActive, setListDeleteSwipeActive] = useState(false);
  const swipe = useSwipeTab({
    tabs: TAB_ORDER,
    activeTab,
    onChangeTab: (tab) => { setAssignmentOpen(false); setActiveTab(tab); },
    disabled: assignmentOpen || listDeleteSwipeActive,
    threshold: 78,
    dominanceRatio: 1.4,
    lockDistance: 14,
    minFlickVelocity: 0.95,
    minFlickDistance: 42,
    transitionDurationMs: 220,
    requireDirectionalHalfStart: true,
    centerDeadZoneRatio: 0.24,
  });
  const handleListDeleteSwipeActiveChange = useCallback((active: boolean) => {
    setListDeleteSwipeActive(active);
    if (active) {
      swipe.onTouchCancel();
    }
  }, [swipe]);
  const assignmentEdgeSwipe = useEdgeSwipeBack({
    onBack: () => setAssignmentOpen(false),
    enabled: assignmentOpen,
    edgeWidth: 20,
    threshold: 80,
  });
  const [assignmentUser, setAssignmentUser] = useState<string | null>(null);
  const [assignmentTab, setAssignmentTab] = useState<"daily" | "big">("daily");
  const [assignments, setAssignments] = useState<ChoreAssignmentEntry[]>([]);
  const [visibleAssignDays, setVisibleAssignDays] = useState(14);
  const [, startTransition] = useTransition();
  const assignSentinelRef = useRef<HTMLDivElement | null>(null);
  const [listSortKey, setListSortKey] = useState<ListSortKey>("kana");
  const [listSortOpen, setListSortOpen] = useState(true);
  const [homeHeaderHeight, setHomeHeaderHeight] = useState(HOME_SECTION_STICKY_FALLBACK_TOP);
  const homeHeaderRef = useRef<HTMLDivElement | null>(null);

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
    }
    return arr;
  }, [chores, listSortKey]);
  const priorityHomeChoreIds = useMemo(
    () => new Set([...(boot?.todayChores ?? []), ...(boot?.tomorrowChores ?? [])].map((chore) => chore.id)),
    [boot?.todayChores, boot?.tomorrowChores],
  );

  const assignmentDays = useMemo(() => {
    const allFiltered = (chores ?? []).filter((c) =>
      assignmentTab === "daily"
        ? !c.isBigTask
        : c.isBigTask && !priorityHomeChoreIds.has(c.id),
    );
    const days = Array.from({ length: 365 }, (_, i) => {
      const d = addDays(startOfJstDay(new Date()), i);
      return { date: d, key: toJstDateKey(d) };
    });
    return days
      .map(({ date, key: dateKey }) => {
        const dayChores = allFiltered.filter((c) => isScheduledOnDate(c, date));
        if (dayChores.length === 0) return null;
        return { date, dateKey, dayChores };
      })
      .filter(Boolean) as Array<{ date: Date; dateKey: string; dayChores: typeof chores }>;
  }, [chores, assignmentTab, priorityHomeChoreIds]);

  useEffect(() => {
    customDateRangeRef.current = customDateRange;
  }, [customDateRange]);

  const loadBootstrap = useCallback(async () => {
    const data = await apiFetch<BootstrapResponse>("/api/bootstrap", { cache: "no-store" });
    setBoot(data);
    setAssignments(data.assignments ?? []);
    setNotificationSettings(data.notificationSettings);
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
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(CUSTOM_ICONS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as CustomIconOption[];
      if (Array.isArray(parsed)) {
        setCustomIcons(parsed);
      }
    } catch {
      window.localStorage.removeItem(CUSTOM_ICONS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CUSTOM_ICONS_STORAGE_KEY, JSON.stringify(customIcons));
  }, [customIcons]);

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
      await apiFetch(`/api/chores/${targetId}/record`, {
        method: "POST",
        body: JSON.stringify({ memo }),
      });
      void Promise.all([loadStats(statsPeriod), loadHistory()]);
    } catch (err: unknown) {
      if (previousBoot) {
        setBoot(previousBoot);
      }
      setError((err as Error).message ?? "Failed to save record.");
    } finally {
      setRecordUpdating(targetId, false);
    }
  };

  const undoRecord = async (chore: ChoreWithComputed) => {
    if (!chore.lastRecordId) return;
    const previousBoot = boot;
    setRecordUpdating(chore.id, true);

    updateBootChoreOptimistically(chore.id, (current) => ({
      ...current,
      doneToday: false,
      lastRecordId: null,
      isDueToday: true,
      isDueTomorrow: false,
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

  const homeSections = [
    {
      key: "today" as const,
      title: "今日",
      chores: [...boot.todayChores].sort((a, b) => JA_COLLATOR.compare(a.title, b.title)),
    },
    {
      key: "tomorrow" as const,
      title: "明日",
      chores: [...boot.tomorrowChores].sort((a, b) => JA_COLLATOR.compare(a.title, b.title)),
    },
    {
      key: "big" as const,
      title: "大仕事",
      chores: [...boot.upcomingBigChores],
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
    : swipe.visual.isAnimating
      ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)"
      : "none";

  const renderMainTabContent = (tab: TabKey) => {
    if (tab === "home") {
      return (
        <div className="space-y-[10px]">
          <div ref={homeHeaderRef} className="sticky top-0 z-30 -mx-5 bg-[#F8F9FA]/95 px-5 pb-2 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
            <div className="flex items-center justify-between">
              <p className="text-[48px] font-bold leading-none text-[#5F6368]">{formatTopDate()}</p>
              {boot.users.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setAssignmentOpen(true);
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

          {hasAnyUpcomingChores ? (
            <>
              {homeSections.map((section) => (
                <div key={section.key} className="space-y-[6px]">
                  <div
                    className="sticky z-20 bg-[#F8F9FA]/95 pb-1 pt-1 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85"
                    style={{ top: homeHeaderHeight }}
                  >
                    <HomeSectionTitle title={section.title} />
                  </div>
                  <div className="flex flex-col gap-2">
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
                      const assigneeName = assignedEntry?.userName ?? null;
                      const disableTomorrowDailyCheck =
                        section.key === "tomorrow" && chore.intervalDays === 1;
                      return (
                        <HomeTaskRow
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
                          meta={
                            section.key === "big"
                              ? `${chore.intervalDays}日ごと / ${dueInDaysLabel(chore)}`
                              : undefined
                          }
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
        </div>
      );
    }

    if (tab === "list") {
      return (
        <div className="space-y-4">
          <div className="sticky top-0 z-20 -mx-5 space-y-1.5 bg-[#F8F9FA]/95 px-5 pb-3 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
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
          <div className="space-y-2">
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
      );
    }

    if (tab === "stats") {
      return (
        <div className="space-y-5">
          <div className="sticky top-0 z-20 -mx-5 bg-[#F8F9FA]/95 px-5 pb-2 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
            <ScreenTitle title="統計" />
          </div>
          <StatsView
            stats={stats}
            activePeriod={statsPeriod}
            isLoading={statsLoading}
            customDateRange={customDateRange}
            onChangePeriod={async (period) => {
              try {
                setError("");
                if (period === "custom") {
                  await applyCustomDateRange(customDateRange);
                  return;
                }
                await loadStats(period);
              } catch (err: unknown) {
                setError((err as Error).message ?? "統計の読み込みに失敗しました。");
              }
            }}
            onChangeCustomDateRange={setCustomDateRange}
            onApplyCustomDateRange={applyCustomDateRange}
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="sticky top-0 z-20 -mx-5 bg-[#F8F9FA]/95 px-5 pb-2 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
          <ScreenTitle title="設定" />
        </div>
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
    <main className="mx-auto flex h-screen w-full max-w-[430px] flex-col overflow-hidden bg-[#F8F9FA]">
      <section
        className="flex-1 overflow-auto px-5 pb-28"
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
        {error ? <div className="mb-4 rounded-xl bg-[#FDECEE] px-3 py-2 text-sm text-[#C5221F]">{error}</div> : null}

        {assignmentOpen ? (
          <div className="space-y-4 pt-5">
            <div className="sticky top-0 z-30 -mx-5 space-y-3 bg-[#F8F9FA]/95 px-5 pb-3 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[#F8F9FA]/85">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setAssignmentOpen(false)}
                  className="flex items-center gap-1 text-[14px] font-bold text-[#1A9BE8]"
                >
                  <ChevronLeft size={18} /> 戻る
                </button>
                <p className="text-[18px] font-bold text-[#202124]">担当設定</p>
                <div className="w-[50px]" />
              </div>

              <div className="flex gap-2">
                {(boot?.users ?? []).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setAssignmentUser(assignmentUser === u.id ? null : u.id)}
                    className={`rounded-2xl px-4 py-2 text-[13px] font-bold ${assignmentUser === u.id
                      ? "bg-[#1A9BE8] text-white"
                      : "border border-[#DADCE0] bg-white text-[#5F6368]"
                      }`}
                  >
                    {u.name}
                  </button>
                ))}
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

            <div className="space-y-3">
              {assignmentDays.slice(0, visibleAssignDays).map(({ date, dateKey, dayChores }) => (
                <div key={dateKey} className="space-y-1">
                  <p className="text-[13px] font-bold text-[#5F6368]">
                    {formatMonthDay(date.toISOString())}
                  </p>
                  <div className="rounded-[14px] bg-white">
                    {dayChores.map((chore, idx) => {
                      const entry = assignments.find(
                        (x) => x.choreId === chore.id && x.date === dateKey,
                      );
                      const isAssigned = assignmentUser
                        ? entry?.userId === assignmentUser
                        : false;
                      const currentAssigneeName = entry?.userName ?? null;
                      return (
                        <button
                          key={chore.id}
                          type="button"
                          onClick={() => {
                            if (!assignmentUser) return;
                            const newUserId = isAssigned ? null : assignmentUser;
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
                        >
                          <span className={`material-symbols-rounded text-[20px] ${isAssigned ? "text-[#1A9BE8]" : "text-[#DADCE0]"}`}>
                            {isAssigned ? "check_box" : "check_box_outline_blank"}
                          </span>
                          <span className="flex-1 text-[13.5px] font-medium text-[#202124]">{chore.title}</span>
                          {currentAssigneeName && !isAssigned ? (
                            <span className="text-[11px] font-medium text-[#9AA0A6]">👤 {currentAssigneeName}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {visibleAssignDays < assignmentDays.length && (
                <div
                  ref={assignSentinelRef}
                  className="flex justify-center py-3"
                >
                  <button
                    type="button"
                    onClick={() => setVisibleAssignDays((prev) => Math.min(prev + 30, assignmentDays.length))}
                    className="rounded-xl bg-white px-4 py-2 text-[13px] font-bold text-[#5F6368] shadow-sm"
                  >
                    もっと見る
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative min-h-full overflow-x-hidden">
            <div
              className={`flex ${isSwipeSheetMoving ? "will-change-transform" : ""}`}
              style={{
                transform: `translate3d(${swipeTrackTranslatePercent}%, 0, 0)`,
                transition: swipeTrackTransitionStyle,
              }}
            >
              {TAB_ORDER.map((tab) => (
                <div key={tab} className="w-full shrink-0">
                  {renderMainTabContent(tab)}
                </div>
              ))}
            </div>
          </div>
        )}
      </section >

      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 mx-auto h-20 max-w-[430px] bg-gradient-to-t from-white/90 via-white/65 to-transparent"
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

      <nav className="fixed bottom-4 left-0 right-0 z-30 mx-auto max-w-[430px] px-4">
        <div className="flex w-full items-center justify-around rounded-full bg-white px-2 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <button type="button" onClick={() => { setAssignmentOpen(false); setActiveTab("home"); }} className="flex h-10 w-10 items-center justify-center">
            <span className="material-symbols-rounded text-[24px]" style={{ color: !assignmentOpen && activeTab === "home" ? PRIMARY_COLOR : "#9AA0A6" }}>home</span>
          </button>
          <button type="button" onClick={() => { setAssignmentOpen(false); setActiveTab("list"); }} className="flex h-10 w-10 items-center justify-center">
            <span className="material-symbols-rounded text-[24px]" style={{ color: !assignmentOpen && activeTab === "list" ? PRIMARY_COLOR : "#9AA0A6" }}>checklist</span>
          </button>
          <button type="button" onClick={() => { setAssignmentOpen(false); openAddChore(); }} className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[#1A9BE8] text-white shadow-md">
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <button type="button" onClick={() => { setAssignmentOpen(false); setActiveTab("stats"); }} className="flex h-10 w-10 items-center justify-center">
            <span className="material-symbols-rounded text-[24px]" style={{ color: !assignmentOpen && activeTab === "stats" ? PRIMARY_COLOR : "#9AA0A6" }}>bar_chart</span>
          </button>
          <button type="button" onClick={() => { setAssignmentOpen(false); setActiveTab("settings"); }} className="flex h-10 w-10 items-center justify-center">
            <span className="material-symbols-rounded text-[24px]" style={{ color: !assignmentOpen && activeTab === "settings" ? PRIMARY_COLOR : "#9AA0A6" }}>settings</span>
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
        scrollable={false}
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
              onOpenCustomIcon={() => setCustomIconOpen(true)}
            />
          ) : null}
        </div>
      </BottomSheet>

      <BottomSheet open={customIconOpen} onClose={() => setCustomIconOpen(false)} title="">
        {editingChore ? (
          <CustomIconPicker
            value={editingChore}
            onChange={setEditingChore}
            onApply={(added) => {
              setCustomIcons((prev) => [...prev, added]);
              setEditingChore((prev) =>
                prev
                  ? {
                    ...prev,
                    icon: added.icon,
                    iconColor: added.iconColor,
                    bgColor: added.bgColor,
                  }
                  : prev,
              );
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
                    {formatJpDate(record.performedAt)} {record.user.name}が実施
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

