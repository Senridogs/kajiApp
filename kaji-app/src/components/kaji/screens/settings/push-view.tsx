"use client";

import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { NotificationSettings } from "@/lib/types";
import { apiFetch, urlBase64ToUint8Array } from "../../helpers";
import { SettingToggleRow } from "../../ui-parts";

const REMINDER_HOUR_CHOICES = Array.from(
  { length: 18 },
  (_, idx) => `${String(6 + idx).padStart(2, "0")}:00`,
);

type PushGuidePlatform = "android" | "iphone";
type PushGuideContent = {
  setupTitle: string;
  setupSteps: string[];
  troubleTitle: string;
  troubleSteps: string[];
};

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

type Props = {
  notificationSettings: NotificationSettings | null;
  onBack: () => void;
};

export function PushView({ notificationSettings: initialSettings, onBack }: Props) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(initialSettings);
  const [reminderTimePickerOpen, setReminderTimePickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [view, setView] = useState<"push" | "push-guide">("push");
  const [pushGuidePlatform, setPushGuidePlatform] = useState<PushGuidePlatform>("android");

  // Check push subscription on mount
  useState(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) setPushEnabled(true);
      } catch {
        // ignore
      }
    })();
  });

  const subscribePush = useCallback(async () => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      setErrorMessage("VAPID公開鍵が未設定です。");
      return false;
    }
    if (!("serviceWorker" in navigator)) return false;
    setPushLoading(true);
    setErrorMessage("");
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
      setErrorMessage((err as Error).message ?? "通知を有効にできませんでした。");
      return false;
    } finally {
      setPushLoading(false);
    }
  }, []);

  const handleTogglePush = useCallback(async (next: boolean) => {
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
      setErrorMessage((err as Error).message ?? "通知設定の変更に失敗しました。");
    } finally {
      setPushLoading(false);
    }
  }, [pushLoading, subscribePush]);

  const updateNotificationSettings = useCallback(async (next: NotificationSettings) => {
    const previous = notificationSettings;
    if (!previous) return;
    setErrorMessage("");
    setNotificationSettings(next);
    try {
      const updated = await apiFetch<NotificationSettings>("/api/notification-settings", {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setNotificationSettings(updated);
    } catch (err: unknown) {
      setNotificationSettings(previous);
      setErrorMessage((err as Error).message ?? "通知設定の保存に失敗しました。");
    }
  }, [notificationSettings]);

  const removeReminderTime = useCallback((time: string) => {
    if (!notificationSettings) return;
    if (notificationSettings.reminderTimes.length <= 1) {
      setErrorMessage("通知時刻は1件以上必要です。");
      return;
    }
    const nextTimes = notificationSettings.reminderTimes.filter((value) => value !== time);
    void updateNotificationSettings({ ...notificationSettings, reminderTimes: nextTimes });
  }, [notificationSettings, updateNotificationSettings]);

  const addReminderTime = useCallback((time: string) => {
    if (!notificationSettings) return;
    if (notificationSettings.reminderTimes.includes(time)) return;
    if (notificationSettings.reminderTimes.length >= 4) {
      setErrorMessage("通知時刻は最大4件までです。");
      return;
    }
    const nextTimes = [...notificationSettings.reminderTimes, time].sort((a, b) => a.localeCompare(b));
    void updateNotificationSettings({ ...notificationSettings, reminderTimes: nextTimes });
    setReminderTimePickerOpen(false);
  }, [notificationSettings, updateNotificationSettings]);

  const handleTestNotification = useCallback(async () => {
    const ready = pushEnabled || (await subscribePush());
    if (!ready) return;
    try {
      setErrorMessage("");
      await apiFetch("/api/notifications/test", { method: "POST", body: "{}" });
    } catch (err: unknown) {
      setErrorMessage((err as Error).message ?? "テスト通知の送信に失敗しました。");
    }
  }, [pushEnabled, subscribePush]);

  if (view === "push-guide") {
    const guide = PUSH_GUIDE_CONTENT[pushGuidePlatform];
    return (
      <div className="space-y-4 pb-4">
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={() => setView("push")} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] text-[var(--foreground)]">
            <ChevronLeft size={18} />
          </button>
          <p className="text-[22px] font-bold text-[var(--foreground)]">通知の設定方法</p>
        </div>

        <div className="flex gap-1 rounded-[12px] bg-[var(--secondary)] p-1">
          <button
            type="button"
            onClick={() => setPushGuidePlatform("android")}
            className={`flex-1 rounded-[10px] px-2 py-2 text-[13px] font-bold ${pushGuidePlatform === "android" ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]"}`}
          >
            Android
          </button>
          <button
            type="button"
            onClick={() => setPushGuidePlatform("iphone")}
            className={`flex-1 rounded-[10px] px-2 py-2 text-[13px] font-bold ${pushGuidePlatform === "iphone" ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]"}`}
          >
            iPhone
          </button>
        </div>

        <div className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-[15px] font-bold text-[var(--foreground)]">{guide.setupTitle}</p>
          <div className="space-y-1.5 text-[12px] font-medium leading-relaxed text-[var(--muted-foreground)]">
            {guide.setupSteps.map((step) => (
              <p key={step}>{step}</p>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[var(--app-surface-soft)] p-4">
          <p className="text-[13px] font-bold text-[var(--primary)]">確認（テスト）</p>
          <div className="space-y-1 text-[11.5px] font-medium leading-relaxed text-[var(--muted-foreground)]">
            {PUSH_GUIDE_CONFIRM_STEPS.map((step) => (
              <p key={step}>{step}</p>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-[14px] border border-[var(--primary)] bg-[var(--app-surface-soft)] p-4">
          <p className="text-[13px] font-bold text-[var(--primary)]">{guide.troubleTitle}</p>
          <div className="space-y-1 text-[11px] font-medium leading-relaxed text-[var(--muted-foreground)]">
            {guide.troubleSteps.map((step) => (
              <p key={step}>{step}</p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={onBack} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] text-[var(--foreground)]">
          <ChevronLeft size={18} />
        </button>
        <p className="text-[22px] font-bold text-[var(--foreground)]">プッシュ通知設定</p>
      </div>
      {errorMessage ? (
        <p className="text-[13px] font-medium text-[var(--destructive)]">{errorMessage}</p>
      ) : null}
      <SettingToggleRow title="プッシュ通知" subtitle="すべての通知をまとめてオン/オフ" checked={pushEnabled} disabled={pushLoading} onChange={(next) => { void handleTogglePush(next); }} />
      {pushEnabled && notificationSettings ? (
        <div className="space-y-3 rounded-[14px] bg-[var(--card)] p-3">
          <div className="space-y-2 rounded-[12px] border border-[var(--border)] bg-[var(--app-canvas)] p-3">
            <p className="text-[13px] font-bold text-[var(--foreground)]">通知時刻</p>
            <div className="flex flex-wrap gap-2">
              {notificationSettings.reminderTimes.map((time) => (
                <button key={time} type="button" onClick={() => removeReminderTime(time)} className="inline-flex items-center gap-1 rounded-full bg-[var(--card)] px-3 py-1.5 text-[12px] font-bold text-[var(--primary)]">
                  {time}
                  {notificationSettings.reminderTimes.length > 1 ? <span className="text-[var(--app-text-tertiary)]">{"×"}</span> : null}
                </button>
              ))}
              <button type="button" onClick={() => setReminderTimePickerOpen((prev) => !prev)} className="inline-flex h-[30px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--muted-foreground)]">+ 追加</button>
            </div>
            {reminderTimePickerOpen ? (
              <div className="grid grid-cols-4 gap-2 pt-1">
                {REMINDER_HOUR_CHOICES.filter((time) => !notificationSettings.reminderTimes.includes(time)).map((time) => (
                  <button key={time} type="button" onClick={() => addReminderTime(time)} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[12px] font-bold text-[var(--muted-foreground)]">{time}</button>
                ))}
              </div>
            ) : null}
          </div>
          <SettingToggleRow title="リマインド通知" checked={notificationSettings.notifyReminder} onChange={(next) => { void updateNotificationSettings({ ...notificationSettings, notifyReminder: next }); }} />
          <SettingToggleRow title="パートナーの完了通知" checked={notificationSettings.notifyCompletion} onChange={(next) => { void updateNotificationSettings({ ...notificationSettings, notifyCompletion: next }); }} />
          <button type="button" onClick={() => { void handleTestNotification(); }} disabled={pushLoading} className="w-full rounded-[10px] bg-[var(--primary)] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-60">いま通知を送信</button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setPushGuidePlatform("android");
          setView("push-guide");
        }}
        className="flex w-full items-center justify-between rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left"
      >
        <div>
          <p className="text-[14px] font-bold text-[var(--foreground)]">スマホ通知の設定方法</p>
          <p className="text-[12px] font-medium text-[var(--muted-foreground)]">Android・iPhone向けの手順を案内</p>
        </div>
        <ChevronRight size={16} color="var(--app-text-tertiary)" />
      </button>
    </div>
  );
}
