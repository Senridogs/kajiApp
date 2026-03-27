"use client";

import { useState } from "react";
import { SettingsPanel } from "./settings-shared";
import { SettingToggleRow } from "../../ui-parts";

const REMINDER_HOUR_CHOICES = Array.from(
  { length: 18 },
  (_, idx) => `${String(6 + idx).padStart(2, "0")}:00`,
);

type Props = {
  onBack: () => void;
};

export function SleepView({ onBack }: Props) {
  const [sleepModeEnabled, setSleepModeEnabled] = useState(false);
  const [sleepModeStart, setSleepModeStart] = useState("22:00");
  const [sleepModeEnd, setSleepModeEnd] = useState("07:00");

  return (
    <SettingsPanel title="おやすみモード" onBack={onBack}>
      <p className="text-[13px] font-medium leading-relaxed text-[var(--muted-foreground)]">
        おやすみモード中はプッシュ通知が届きません。設定した時間帯は通知をミュートします。
      </p>
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-2">
        <SettingToggleRow
          title="おやすみモード"
          checked={sleepModeEnabled}
          onChange={setSleepModeEnabled}
        />
      </div>
      <div className="space-y-2">
        <p className="text-[14px] font-semibold text-[var(--muted-foreground)]">おやすみ時間</p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <select
            value={sleepModeStart}
            onChange={(event) => setSleepModeStart(event.target.value)}
            disabled={!sleepModeEnabled}
            className="h-12 rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-3 text-center text-[30px] font-bold leading-none text-[var(--foreground)] disabled:opacity-50"
          >
            {REMINDER_HOUR_CHOICES.map((time) => (
              <option key={`sleep-start-inline-${time}`} value={time}>
                {time}
              </option>
            ))}
          </select>
          <span className="text-[22px] font-semibold text-[var(--muted-foreground)]">{"〜"}</span>
          <select
            value={sleepModeEnd}
            onChange={(event) => setSleepModeEnd(event.target.value)}
            disabled={!sleepModeEnabled}
            className="h-12 rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-3 text-center text-[30px] font-bold leading-none text-[var(--foreground)] disabled:opacity-50"
          >
            {REMINDER_HOUR_CHOICES.map((time) => (
              <option key={`sleep-end-inline-${time}`} value={time}>
                {time}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] font-medium text-[var(--app-text-tertiary)]">この時間帯はリマインド通知が届きません</p>
      </div>
    </SettingsPanel>
  );
}
