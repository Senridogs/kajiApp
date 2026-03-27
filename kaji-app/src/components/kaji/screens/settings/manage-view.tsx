"use client";

import { ChevronRight, Plus } from "lucide-react";
import type { BootstrapResponse, ChoreWithComputed } from "@/lib/types";
import { iconByName } from "../../helpers";
import { SettingsPanel } from "./settings-shared";

type Props = {
  boot: BootstrapResponse;
  onBack: () => void;
  onOpenChoreEditor: (chore?: ChoreWithComputed) => void;
  onRefresh: () => Promise<void>;
};

export function ManageView({
  boot,
  onBack,
  onOpenChoreEditor,
  onRefresh,
}: Props) {
  const chores = boot.chores.filter((c) => !c.archived);

  return (
    <SettingsPanel title="家事を管理" onBack={onBack}>
      <span className="text-[14px] font-medium text-[var(--app-text-tertiary)]">
        {chores.length}件
      </span>

      {chores.map((chore) => {
        const ChoreIcon = iconByName(chore.icon);
        return (
          <button
            key={chore.id}
            type="button"
            onClick={() => onOpenChoreEditor(chore)}
            className="flex w-full items-center justify-between rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left"
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: chore.bgColor }}
              >
                <ChoreIcon size={15} color={chore.iconColor} />
              </div>
              <div>
                <p className="text-[14px] font-bold text-[var(--foreground)]">
                  {chore.title}
                </p>
                <p className="text-[11.5px] font-medium text-[var(--app-text-tertiary)]">
                  {chore.intervalDays}日ごと
                </p>
              </div>
            </div>
            <ChevronRight size={16} color="var(--app-text-tertiary)" />
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onOpenChoreEditor()}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[15px] font-bold text-[var(--primary)]"
      >
        <Plus size={16} />
        家事を追加
      </button>
    </SettingsPanel>
  );
}
