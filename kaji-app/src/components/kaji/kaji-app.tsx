"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  Home,
  Loader2,
  Plus,
  Settings,
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
import {
  FamilyCodeCard,
  HomeSectionTitle,
  HomeTaskRow,
  JoinHouseholdCard,
  ListChoreRow,
  ScreenTitle,
  SegmentedFilter,
  SettingToggleRow,
} from "@/components/kaji/ui-parts";
import { AnimatedList } from "@/components/ui/animated-list";
import { BlurFade } from "@/components/ui/blur-fade";
import { Dock, DockIcon } from "@/components/ui/dock";
import {
  BootstrapResponse,
  ChoreWithComputed,
  NotificationSettings,
  StatsPeriodKey,
  StatsResponse,
} from "@/lib/types";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

type TabKey = "home" | "list" | "stats" | "settings";
type StatsQueryOptions = { from: string; to: string };
type CustomDateRange = { from: string; to: string };
const CUSTOM_ICONS_STORAGE_KEY = "kaji_custom_icons";

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

export function KajiApp() {
  const [boot, setBoot] = useState<BootstrapResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriodKey>("week");
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>(() =>
    defaultCustomDateRange(),
  );
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

  const [choreEditorOpen, setChoreEditorOpen] = useState(false);
  const [customIconOpen, setCustomIconOpen] = useState(false);
  const [customIcons, setCustomIcons] = useState<CustomIconOption[]>([]);
  const [editingChore, setEditingChore] = useState<ChoreForm | null>(null);
  const [memoTarget, setMemoTarget] = useState<ChoreWithComputed | null>(null);
  const [memo, setMemo] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<ChoreWithComputed | null>(null);
  const [historyFilter, setHistoryFilter] = useState("all");

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(
    null,
  );
  const [newReminderTime, setNewReminderTime] = useState("");
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const sessionUser = boot?.sessionUser ?? null;
  const chores = boot?.chores ?? [];

  const loadBootstrap = useCallback(async () => {
    const data = await apiFetch<BootstrapResponse>("/api/bootstrap", { cache: "no-store" });
    setBoot(data);
    setNotificationSettings(data.notificationSettings);
    return data;
  }, []);

  const loadStats = useCallback(async (period: StatsPeriodKey, options?: StatsQueryOptions) => {
    const params = new URLSearchParams({ period });
    if (period === "custom") {
      const from = options?.from ?? customDateRange.from;
      const to = options?.to ?? customDateRange.to;
      params.set("from", from);
      params.set("to", to);
      setCustomDateRange({ from, to });
    }

    const data = await apiFetch<StatsResponse>(`/api/stats?${params.toString()}`, { cache: "no-store" });
    setStats(data);
    setStatsPeriod(period);
  }, [customDateRange.from, customDateRange.to]);

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

  const registerUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
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
    });
    setChoreEditorOpen(true);
  };

  const saveChore = async () => {
    if (!editingChore) return;
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
    };
    if (editingChore.id) {
      await apiFetch(`/api/chores/${editingChore.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    } else {
      await apiFetch("/api/chores", { method: "POST", body: JSON.stringify(payload) });
    }
    setChoreEditorOpen(false);
    await refreshAll(statsPeriod);
  };

  const deleteChore = async () => {
    if (!editingChore?.id) return;
    await apiFetch(`/api/chores/${editingChore.id}`, { method: "DELETE" });
    setChoreEditorOpen(false);
    await refreshAll(statsPeriod);
  };

  const openMemo = (chore: ChoreWithComputed) => {
    setMemoTarget(chore);
    setMemo("");
    setMemoOpen(true);
  };

  const submitRecord = async () => {
    if (!memoTarget) return;
    await apiFetch(`/api/chores/${memoTarget.id}/record`, {
      method: "POST",
      body: JSON.stringify({ memo }),
    });
    setMemoOpen(false);
    await refreshAll(statsPeriod);
  };

  const undoRecord = async (chore: ChoreWithComputed) => {
    if (!chore.lastRecordId) return;
    await apiFetch(`/api/records/${chore.lastRecordId}`, { method: "DELETE", body: "{}" });
    await refreshAll(statsPeriod);
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
        <form onSubmit={registerUser} className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
            <div className="flex h-[110px] w-[110px] items-center justify-center rounded-[18px] bg-[#E8F0FE]">
              <span className="text-[60px]">✦</span>
            </div>
            <p className="text-[26px] font-bold text-[#202124]">さあ、始めましょう</p>
            <div className="w-full space-y-3 rounded-[20px] border border-[#DADCE0] bg-white px-[18px] py-4">
              <div className="flex items-center gap-2">
                <span className="text-[22px] text-[#1A9BE8]">🪪</span>
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
          </div>
          <div className="space-y-3 px-5 pb-8">
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
              className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#1A9BE8] px-4 py-3 text-[16.8px] font-bold text-white shadow-lg shadow-[#2A1E1730]"
            >
              はじめる
              <span>→</span>
            </button>
            {error ? <p className="mt-3 text-center text-sm text-[#C5221F]">{error}</p> : null}
          </div>
        </form>
      </main>
    );
  }

  const homeSections = [
    { key: "today" as const, title: "今日", chores: boot.todayChores },
    { key: "tomorrow" as const, title: "明日", chores: boot.tomorrowChores },
    { key: "big" as const, title: "大仕事", chores: boot.upcomingBigChores },
  ].filter((section) => section.chores.length > 0);
  const hasAnyUpcomingChores = homeSections.length > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[#F8F9FA]">
      <section className="flex-1 overflow-auto px-5 pb-28 pt-5">
        {error ? <div className="mb-4 rounded-xl bg-[#FDECEE] px-3 py-2 text-sm text-[#C5221F]">{error}</div> : null}

        {activeTab === "home" ? (
          <BlurFade className="space-y-5">
            <p className="text-[24px] font-semibold text-[#5F6368]">{formatTopDate()}</p>

            {hasAnyUpcomingChores ? (
              <>
                {homeSections.map((section) => (
                  <div key={section.key} className="space-y-2">
                    <HomeSectionTitle title={section.title} />
                    <div className="rounded-[20px] border border-[#E5EAF0] bg-white px-0 py-2">
                      <div className="space-y-2 px-2">
                        {section.chores.map((chore) => (
                          <HomeTaskRow
                            key={chore.id}
                            chore={
                              section.key === "tomorrow" && chore.doneToday
                                ? { ...chore, doneToday: false }
                                : chore
                            }
                            onRecord={openMemo}
                            onUndo={section.key === "tomorrow" ? undefined : undoRecord}
                            onOpenHistory={openHistory}
                            meta={
                              section.key === "big"
                                ? `${chore.intervalDays}日ごと / ${dueInDaysLabel(chore)}`
                                : undefined
                            }
                          />
                        ))}
                      </div>
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
          </BlurFade>
        ) : null}

        {activeTab === "list" ? (
          <BlurFade className="space-y-5">
            <ScreenTitle title="家事一覧" />
            <div className="space-y-2">
              {chores.map((chore) => {
                const meta = chore.isBigTask
                  ? `${chore.intervalDays}日ごと / 最終: ${
                      chore.lastPerformedAt ? formatMonthDay(chore.lastPerformedAt) : "未設定"
                    } / ${dueInDaysLabel(chore)}`
                  : `${chore.intervalDays}日ごと / 前回:${relativeLastPerformed(chore.lastPerformedAt)} / ${
                      chore.lastPerformerName ?? "未設定"
                    }`;
                return <ListChoreRow key={chore.id} chore={chore} meta={meta} onEdit={openEditChore} />;
              })}
            </div>
          </BlurFade>
        ) : null}

        {activeTab === "stats" ? (
          <BlurFade className="space-y-5">
            <ScreenTitle title="統計" />
            <StatsView
              stats={stats}
              activePeriod={statsPeriod}
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
          </BlurFade>
        ) : null}

        {activeTab === "settings" ? (
          <BlurFade className="space-y-6">
            <ScreenTitle title="設定" />
            <div className="space-y-4">
              <SettingToggleRow
                title="期限当日通知"
                subtitle="設定時刻に通知"
                checked={notificationSettings?.notifyDueToday ?? true}
                onChange={(next) => {
                  if (!notificationSettings) return;
                  updateNotificationSettings({ ...notificationSettings, notifyDueToday: next });
                }}
              />

              <div className="space-y-2">
                <p className="text-[15px] font-bold text-[#202124]">通知時刻</p>
                <div className="flex flex-wrap gap-2">
                  {(notificationSettings?.reminderTimes ?? []).map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => {
                        if (!notificationSettings) return;
                        if (notificationSettings.reminderTimes.length <= 1) {
                          setError("通知時刻は1件以上必要です。");
                          return;
                        }

                        const next = notificationSettings.reminderTimes.filter((x) => x !== time);
                        updateNotificationSettings({ ...notificationSettings, reminderTimes: next });
                      }}
                      className="rounded-[12px] bg-[#EEF3FF] px-3 py-2 text-[14.4px] font-bold text-[#4D8BFF]"
                    >
                      {time}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowTimePicker((prev) => !prev)}
                    className="rounded-[12px] border border-[#DADCE0] bg-white px-3 py-2 text-[14.4px] font-bold text-[#5F6368]"
                  >
                    ＋ 追加
                  </button>
                </div>
                {showTimePicker ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={newReminderTime}
                      onChange={(e) => setNewReminderTime(e.target.value)}
                      className="rounded-[12px] border border-[#DADCE0] bg-white px-3 py-2 text-[14.4px] font-semibold text-[#202124]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!notificationSettings || !newReminderTime) return;
                        if (notificationSettings.reminderTimes.includes(newReminderTime)) {
                          setNewReminderTime("");
                          setShowTimePicker(false);
                          return;
                        }
                        updateNotificationSettings({
                          ...notificationSettings,
                          reminderTimes: [...notificationSettings.reminderTimes, newReminderTime].sort(),
                        });
                        setNewReminderTime("");
                        setShowTimePicker(false);
                      }}
                      className="rounded-[12px] bg-[#1A9BE8] px-3 py-2 text-[14.4px] font-bold text-white"
                    >
                      追加
                    </button>
                  </div>
                ) : null}
              </div>

              <SettingToggleRow
                title="期限超過通知"
                checked={notificationSettings?.remindDailyIfOverdue ?? true}
                onChange={(next) => {
                  if (!notificationSettings) return;
                  updateNotificationSettings({ ...notificationSettings, remindDailyIfOverdue: next });
                }}
              />
              <SettingToggleRow
                title="完了時通知"
                checked={notificationSettings?.notifyCompletion ?? true}
                onChange={(next) => {
                  if (!notificationSettings) return;
                  updateNotificationSettings({ ...notificationSettings, notifyCompletion: next });
                }}
              />

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
            </div>
          </BlurFade>
        ) : null}
      </section>

      <nav className="fixed bottom-4 left-0 right-0 z-30 mx-auto max-w-[430px] px-4">
        <Dock className="w-full rounded-[26px] border-[#DADCE0] bg-white/95 px-4 py-2">
          <DockIcon onClick={() => setActiveTab("home")} disableMagnification>
            <Home size={22} color={activeTab === "home" ? PRIMARY_COLOR : "#9AA0A6"} />
          </DockIcon>
          <DockIcon onClick={() => setActiveTab("list")} disableMagnification>
            <ClipboardList size={22} color={activeTab === "list" ? PRIMARY_COLOR : "#9AA0A6"} />
          </DockIcon>
          <DockIcon onClick={openAddChore} disableMagnification>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1A9BE8] text-white shadow">
              <Plus size={18} />
            </span>
          </DockIcon>
          <DockIcon onClick={() => setActiveTab("stats")} disableMagnification>
            <BarChart3 size={22} color={activeTab === "stats" ? PRIMARY_COLOR : "#9AA0A6"} />
          </DockIcon>
          <DockIcon onClick={() => setActiveTab("settings")} disableMagnification>
            <Settings size={22} color={activeTab === "settings" ? PRIMARY_COLOR : "#9AA0A6"} />
          </DockIcon>
        </Dock>
      </nav>

      <BottomSheet open={choreEditorOpen && !customIconOpen} onClose={() => setChoreEditorOpen(false)} title="">
        <div className="space-y-3">
          <p className="text-center text-[24px] font-bold text-[#202124]">
            {editingChore?.id ? "編集" : "登録"}
          </p>
          {editingChore ? (
            <ChoreEditor
              mode={editingChore.id ? "edit" : "create"}
              value={editingChore}
              customIcons={customIcons}
              onChange={setEditingChore}
              onSave={saveChore}
              onDelete={deleteChore}
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

      <BottomSheet open={memoOpen} onClose={() => setMemoOpen(false)} title="">
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

      <BottomSheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="" maxHeightClassName="max-h-[88vh]">
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
    </main>
  );
}
