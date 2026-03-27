"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useBootstrap } from "./hooks/use-bootstrap";
import { useChoreRecord } from "./hooks/use-chore-record";
import { useSyncPolling } from "./hooks/use-sync-polling";
import { apiFetch } from "./helpers";
import { BottomNav, type TabKey } from "./nav/bottom-nav";
import { HomeScreen } from "./screens/home-screen";
import { ActivityScreen } from "./screens/activity-screen";
import { StatsScreen } from "./screens/stats-screen";
import { ManageScreen } from "./screens/manage-screen";
import { SettingsScreen } from "./screens/settings-screen";
import { LoginScreen } from "./screens/login-screen";
import { BottomSheet } from "./bottom-sheet";
import {
  ChoreEditor,
  CustomIconPicker,
  type ChoreForm,
  type CustomIconOption,
} from "./chore-editor";
import { ConfirmDialog } from "./confirm-dialog";
import { deleteChoreDialogCopy } from "./dialog-copy";
import { PRIMARY_COLOR } from "./constants";
import { startOfJstDay } from "@/lib/time";
import type { ChoreWithComputed } from "@/lib/types";
import { normalizeGridColumns, GRID_COLUMNS_STORAGE_KEY } from "@/lib/grid-columns";
import type { GridColumns } from "@/lib/grid-columns";

function defaultLastPerformedAt(now = new Date()) {
  return startOfJstDay(now).toISOString();
}

function choreToForm(chore: ChoreWithComputed): ChoreForm {
  return {
    id: chore.id,
    title: chore.title,
    intervalDays: chore.intervalDays,
    icon: chore.icon,
    iconColor: chore.iconColor,
    bgColor: chore.bgColor,
    lastPerformedAt: chore.lastPerformedAt,
  };
}

function newChoreForm(): ChoreForm {
  return {
    title: "",
    intervalDays: 7,
    icon: "sparkles",
    iconColor: PRIMARY_COLOR,
    bgColor: "#FFF1E8",
    lastPerformedAt: defaultLastPerformedAt(),
  };
}

export default function KajiAppV2() {
  const { boot, setBoot, loading, error, refresh } = useBootstrap();
  const { recordChore } = useChoreRecord(setBoot);
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [gridColumns, setGridColumns] = useState<GridColumns>(() => {
    if (typeof window === "undefined") return 3;
    return normalizeGridColumns(localStorage.getItem(GRID_COLUMNS_STORAGE_KEY));
  });

  // Settings sidebar state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Chore editor state
  const [choreEditorOpen, setChoreEditorOpen] = useState(false);
  const [editingChore, setEditingChore] = useState<ChoreForm | null>(null);
  const [customIconOpen, setCustomIconOpen] = useState(false);
  const [customIcons, setCustomIcons] = useState<CustomIconOption[]>([]);
  const [saveChoreLoading, setSaveChoreLoading] = useState(false);
  const [deleteChoreLoading, setDeleteChoreLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [choreEditorError, setChoreEditorError] = useState("");

  // Sync custom icons from bootstrap
  useEffect(() => {
    if (!boot || boot.needsRegistration) return;
    setCustomIcons(
      boot.customIcons.map((ci) => ({
        id: ci.id,
        label: ci.label,
        icon: ci.icon,
        iconColor: ci.iconColor,
        bgColor: ci.bgColor,
      })),
    );
  }, [boot]);

  // Grid columns: cross-tab sync via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === GRID_COLUMNS_STORAGE_KEY) {
        setGridColumns(normalizeGridColumns(e.newValue));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Grid columns: re-read when switching back to home tab (same-tab localStorage changes)
  useEffect(() => {
    if (activeTab === "home") {
      setGridColumns(normalizeGridColumns(localStorage.getItem(GRID_COLUMNS_STORAGE_KEY)));
    }
  }, [activeTab]);

  // Grid columns: re-read when settings sidebar closes (same-tab, storage event won't fire)
  useEffect(() => {
    if (!settingsOpen) {
      setGridColumns(normalizeGridColumns(localStorage.getItem(GRID_COLUMNS_STORAGE_KEY)));
    }
  }, [settingsOpen]);

  // 多端末同期（サイレントリフレッシュで画面フラッシュ回避）
  const silentRefresh = useCallback(() => {
    void refresh({ silent: true });
  }, [refresh]);
  useSyncPolling(boot?.householdInviteCode ?? null, silentRefresh);

  // Settings sidebar open/close
  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  // 家事記録（recordChore が楽観的更新するので refresh 不要）
  const handleRecord = useCallback(
    async (choreId: string) => {
      try {
        await recordChore(choreId);
      } catch {
        // TODO: エラートースト
      }
    },
    [recordChore],
  );

  // リアクション送信（サイレントリフレッシュで画面フラッシュ回避）
  const handleReaction = useCallback(
    async (recordId: string, emoji: string) => {
      try {
        await apiFetch(`/api/records/${recordId}/reaction`, {
          method: "POST",
          body: JSON.stringify({ emoji }),
        });
        await refresh({ silent: true });
      } catch {
        // ignore
      }
    },
    [refresh],
  );

  // 家事エディタを開く
  const openChoreEditor = useCallback((chore?: ChoreWithComputed) => {
    setChoreEditorError("");
    setEditingChore(chore ? choreToForm(chore) : newChoreForm());
    setChoreEditorOpen(true);
  }, []);

  // 家事保存
  const saveChore = useCallback(async () => {
    if (!editingChore || saveChoreLoading || deleteChoreLoading) return;
    setChoreEditorError("");

    if (!editingChore.lastPerformedAt) {
      setChoreEditorError("開始日は必須です。");
      return;
    }
    if (Number.isNaN(new Date(editingChore.lastPerformedAt).getTime())) {
      setChoreEditorError("開始日が不正です。");
      return;
    }

    const commonPayload = {
      title: editingChore.title,
      intervalDays: Number(editingChore.intervalDays),
      icon: editingChore.icon,
      iconColor: editingChore.iconColor,
      bgColor: editingChore.bgColor,
    };

    try {
      setSaveChoreLoading(true);
      if (editingChore.id) {
        const updatePayload = {
          ...commonPayload,
          lastPerformedAt: editingChore.lastPerformedAt ?? undefined,
          scheduleAnchorDate: editingChore.scheduleAnchorDateKey ?? undefined,
        };
        const { chore: updated } = await apiFetch<{ chore: ChoreWithComputed }>(
          `/api/chores/${editingChore.id}`,
          { method: "PATCH", body: JSON.stringify(updatePayload) },
        );
        setBoot((prev) =>
          prev
            ? { ...prev, chores: prev.chores.map((c) => (c.id === updated.id ? updated : c)) }
            : prev,
        );
      } else {
        const createPayload = {
          ...commonPayload,
          startDate: editingChore.lastPerformedAt ?? undefined,
        };
        const { chore: created } = await apiFetch<{ chore: ChoreWithComputed }>(
          "/api/chores",
          { method: "POST", body: JSON.stringify(createPayload) },
        );
        setBoot((prev) =>
          prev ? { ...prev, chores: [...prev.chores, created] } : prev,
        );
      }
      setDeleteConfirmOpen(false);
      setChoreEditorOpen(false);
    } catch (err: unknown) {
      const rawMessage =
        err instanceof Error ? err.message : "家事の保存に失敗しました。";
      setChoreEditorError(rawMessage);
    } finally {
      setSaveChoreLoading(false);
    }
  }, [deleteChoreLoading, editingChore, setBoot, saveChoreLoading]);

  // 削除リクエスト
  const requestDeleteChore = useCallback(() => {
    if (!editingChore?.id || saveChoreLoading || deleteChoreLoading) return;
    setDeleteConfirmOpen(true);
  }, [deleteChoreLoading, editingChore?.id, saveChoreLoading]);

  // 削除確定（ローカルステート更新で画面フラッシュ回避）
  const confirmDeleteChore = useCallback(async () => {
    if (!editingChore?.id || deleteChoreLoading || saveChoreLoading) return;
    const deletedId = editingChore.id;
    try {
      setDeleteChoreLoading(true);
      await apiFetch(`/api/chores/${deletedId}`, { method: "DELETE" });
      setBoot((prev) =>
        prev
          ? { ...prev, chores: prev.chores.filter((c) => c.id !== deletedId) }
          : prev,
      );
      setDeleteConfirmOpen(false);
      setChoreEditorOpen(false);
    } catch (err: unknown) {
      setChoreEditorError(
        err instanceof Error ? err.message : "家事の削除に失敗しました。",
      );
    } finally {
      setDeleteChoreLoading(false);
    }
  }, [deleteChoreLoading, editingChore?.id, saveChoreLoading, setBoot]);

  // カスタムアイコン追加
  const handleAddCustomIcon = useCallback(
    async (icon: Omit<CustomIconOption, "id">) => {
      try {
        const result = await apiFetch<{ icon: CustomIconOption }>(
          "/api/custom-icons",
          { method: "POST", body: JSON.stringify(icon) },
        );
        setCustomIcons((prev) => [...prev, result.icon]);
        return result.icon;
      } catch {
        return null;
      }
    },
    [],
  );

  // カスタムアイコン削除
  const handleDeleteCustomIcon = useCallback(
    (customIconId: string) => {
      setCustomIcons((prev) => prev.filter((ic) => ic.id !== customIconId));
      apiFetch(`/api/custom-icons/${customIconId}`, {
        method: "DELETE",
      }).catch(() => {
        void refresh({ silent: true });
      });
    },
    [refresh],
  );

  // ログアウト
  const handleLogout = useCallback(async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" });
      window.location.reload();
    } catch {
      alert("ログアウトに失敗しました。もう一度お試しください。");
    }
  }, []);

  // ログイン成功時
  const handleLoginSuccess = useCallback(() => {
    void refresh();
  }, [refresh]);

  // dueCount（そろそろ以上の家事数）
  const dueCount = useMemo(() => {
    if (!boot) return 0;
    return boot.chores.filter(
      (c) => !c.archived && c.freshnessRatio >= 0.85,
    ).length;
  }, [boot]);

  // PWA Badge
  useEffect(() => {
    if (!boot) return;
    const badgeCount = boot.chores.filter(
      (c) =>
        !c.archived &&
        (c.freshnessLevel === "due" || c.freshnessLevel === "stale"),
    ).length;

    try {
      if ("setAppBadge" in navigator) {
        if (badgeCount > 0) {
          void (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> }).setAppBadge(badgeCount);
        } else if ("clearAppBadge" in navigator) {
          void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
        }
      }
    } catch {
      // Badge API not available or failed silently
    }
  }, [boot]);

  // Tab header titles
  const tabHeaders: Record<TabKey, string> = {
    home: "",
    activity: "みんなのきろく",
    manage: "いえたすく",
    stats: "レポート",
  };

  // Loading — matches old kaji-app.tsx spinner
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--app-canvas)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
      </main>
    );
  }

  // Error
  if (error || !boot) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--app-canvas)] px-5">
        <p className="text-center text-sm text-[var(--destructive)]">
          {error ?? "データの読み込みに失敗しました"}
        </p>
        <button
          type="button"
          onClick={() => refresh()}
          className="rounded-[12px] bg-[var(--primary)] px-4 py-2 text-[14px] font-bold text-white"
        >
          再読み込み
        </button>
      </main>
    );
  }

  // 未登録 / 登録が必要
  if (boot.needsRegistration || !boot.sessionUser) {
    return <LoginScreen onSuccess={handleLoginSuccess} />;
  }

  const sessionUser = boot.sessionUser;

  return (
    <main className="mx-auto flex h-screen w-full max-w-[430px] flex-col overflow-hidden overscroll-y-none bg-[var(--app-canvas)]">
      {/* Tab Header — avatar + title, matching old kaji-app.tsx */}
      {activeTab === "home" ? (
        <div className="pointer-events-none border-b border-[var(--border)] bg-[var(--app-header-bg)] px-4 pb-2.5 pt-2.5 backdrop-blur supports-[backdrop-filter]:bg-[var(--app-header-bg)]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={openSettings}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)]"
              aria-label="設定を開く"
            >
              <span className="material-symbols-rounded text-[26px]" style={{ color: sessionUser.color ?? PRIMARY_COLOR }}>
                account_circle
              </span>
            </button>
            <div className="flex h-8 w-8 items-center justify-center" aria-hidden>
              <img src="/app-icon.svg" alt="いえたすく" className="h-8 w-8" />
            </div>
            <div className="h-8 w-8" />
          </div>
        </div>
      ) : (
        <div className="bg-[var(--app-header-bg)] px-5 pb-3 pt-5 backdrop-blur supports-[backdrop-filter]:bg-[var(--app-header-bg)]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={openSettings}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--card)]"
              aria-label="設定を開く"
            >
              <span className="material-symbols-rounded text-[32px]" style={{ color: sessionUser.color ?? PRIMARY_COLOR }}>
                account_circle
              </span>
            </button>
            {tabHeaders[activeTab] ? (
              <p className="text-[28px] font-bold leading-none text-[var(--foreground)]">{tabHeaders[activeTab]}</p>
            ) : null}
            <div className="h-9 w-9" />
          </div>
        </div>
      )}

      {/* Main content area — scrollable, with bottom padding for floating nav */}
      <section className="relative flex-1 overflow-y-auto overscroll-y-contain pb-24 px-5">
        {activeTab === "home" && (
          <HomeScreen
            boot={boot}
            gridColumns={gridColumns}
            onRecord={handleRecord}
            onOpenChoreEditor={openChoreEditor}
          />
        )}
        {activeTab === "activity" && (
          <ActivityScreen
            boot={boot}
            onReaction={handleReaction}
            onRefresh={() => refresh({ silent: true })}
          />
        )}
        {activeTab === "manage" && (
          <ManageScreen
            boot={boot}
            onEditChore={openChoreEditor}
            onAddChore={() => openChoreEditor()}
          />
        )}
        {activeTab === "stats" && <StatsScreen boot={boot} />}
      </section>

      {/* Settings Sidebar Overlay — slides in from left, matching old kaji-app.tsx */}
      {settingsOpen ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="設定を閉じる"
            onClick={closeSettings}
            className="absolute inset-0 bg-black/30"
          />
          <aside className="absolute inset-y-0 left-0 w-[320px] max-w-[88%] bg-[var(--card)] shadow-[12px_0_28px_rgba(0,0,0,0.2)]">
            <div className="h-full overflow-y-auto px-4 pb-24 pt-6">
              <SettingsScreen
                boot={boot}
                onLogout={handleLogout}
                onOpenChoreEditor={openChoreEditor}
                onRefresh={() => refresh({ silent: true })}
                onClose={closeSettings}
              />
            </div>
          </aside>
        </div>
      ) : null}

      {/* Bottom Navigation — floating pill style, 3 tabs + center add button */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dueCount={dueCount}
        onAddChore={() => openChoreEditor()}
      />

      {/* Chore Editor Bottom Sheet */}
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
          <p className="text-center text-[24px] font-bold text-[var(--foreground)]">
            {editingChore?.id ? "編集" : "登録"}
          </p>
          {choreEditorError ? (
            <p className="text-center text-sm text-[var(--destructive)]">
              {choreEditorError}
            </p>
          ) : null}
          {editingChore ? (
            <ChoreEditor
              mode={editingChore.id ? "edit" : "create"}
              value={editingChore}
              customIcons={customIcons}
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

      {/* Custom Icon Picker Bottom Sheet */}
      <BottomSheet
        open={customIconOpen}
        onClose={() => setCustomIconOpen(false)}
        title=""
        maxHeightClassName="max-h-[92vh]"
      >
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

      {/* Delete Chore Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={deleteChoreDialogCopy.title}
        description={deleteChoreDialogCopy.description}
        confirmLabel={deleteChoreDialogCopy.confirmLabel}
        confirmLoadingLabel={deleteChoreDialogCopy.confirmLoadingLabel}
        cancelLabel={deleteChoreDialogCopy.cancelLabel}
        confirmVariant="destructive"
        loading={deleteChoreLoading}
        onConfirm={() => {
          void confirmDeleteChore();
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </main>
  );
}
