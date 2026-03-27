"use client";

import { useState } from "react";
import type { BootstrapResponse, ChoreWithComputed } from "@/lib/types";
import { PRIMARY_COLOR } from "../constants";
import { SettingsMenuItem } from "./settings/settings-shared";
import { FamilyView } from "./settings/family-view";
import { ManageView } from "./settings/manage-view";
import { ThemeView } from "./settings/theme-view";
import { GridColumnsView } from "./settings/grid-columns-view";
import { PushView } from "./settings/push-view";
import { SleepView } from "./settings/sleep-view";

type Props = {
  boot: BootstrapResponse;
  onLogout: () => void;
  onOpenChoreEditor: (chore?: ChoreWithComputed) => void;
  onRefresh: () => Promise<void>;
  onClose: () => void;
};

type SettingsView = "menu" | "family" | "manage" | "theme" | "grid" | "push" | "sleep";

export function SettingsScreen({
  boot,
  onLogout,
  onOpenChoreEditor,
  onRefresh,
  onClose,
}: Props) {
  const [view, setView] = useState<SettingsView>("menu");
  const sessionUser = boot.sessionUser;

  if (view === "family") {
    return <FamilyView boot={boot} onBack={() => setView("menu")} />;
  }

  if (view === "manage") {
    return (
      <ManageView
        boot={boot}
        onBack={() => setView("menu")}
        onOpenChoreEditor={onOpenChoreEditor}
        onRefresh={onRefresh}
      />
    );
  }

  if (view === "theme") {
    return <ThemeView onBack={() => setView("menu")} />;
  }

  if (view === "grid") {
    return <GridColumnsView onBack={() => setView("menu")} />;
  }

  if (view === "push") {
    return (
      <PushView
        notificationSettings={boot.notificationSettings}
        onBack={() => setView("menu")}
      />
    );
  }

  if (view === "sleep") {
    return <SleepView onBack={() => setView("menu")} />;
  }

  // Main settings menu — matches old kaji-app.tsx sidebar design
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4">
        {/* User profile header */}
        <div className="space-y-1">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white"
            style={{
              backgroundColor: sessionUser?.color ?? PRIMARY_COLOR,
            }}
            aria-label="設定を閉じる"
          >
            <span className="material-symbols-rounded text-[20px]">
              person
            </span>
          </button>
          <p className="text-[28px] font-bold leading-none text-[var(--foreground)]">
            {sessionUser?.name ?? ""}
          </p>
          <p className="text-[13px] font-medium text-[var(--app-text-tertiary)]">
            @{(sessionUser?.name ?? "").toLowerCase()} · いえたすく
          </p>
        </div>

        <div className="h-px bg-[var(--border)]" />

        {/* Menu items — matching old sidebar order */}
        <div className="space-y-1">
          <SettingsMenuItem
            label="テーマカラー"
            materialIcon="palette"
            onClick={() => setView("theme")}
          />
          <SettingsMenuItem
            label="カード表示"
            materialIcon="grid_view"
            onClick={() => setView("grid")}
          />
          <SettingsMenuItem
            label="プッシュ通知設定"
            materialIcon="notifications"
            onClick={() => setView("push")}
          />
          <SettingsMenuItem
            label="家族招待・家族管理"
            materialIcon="group"
            onClick={() => setView("family")}
          />
          <SettingsMenuItem
            label="家事を管理"
            materialIcon="checklist"
            onClick={() => setView("manage")}
          />
          <SettingsMenuItem
            label="おやすみモード"
            materialIcon="bedtime"
            onClick={() => setView("sleep")}
          />
        </div>
      </div>

      {/* Footer — pushed to bottom */}
      <div className="mt-auto pt-10">
        <div className="h-px bg-[var(--border)]" />
        <button
          type="button"
          onClick={onLogout}
          className="mt-2 flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"
        >
          <span className="material-symbols-rounded text-[20px] text-[var(--destructive)]">
            logout
          </span>
          <span className="text-[16px] font-medium text-[var(--destructive)]">
            ログアウト
          </span>
        </button>
      </div>
    </div>
  );
}
