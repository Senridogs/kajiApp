"use client";

import { ChevronLeft } from "lucide-react";

/**
 * Sub-view panel with back button and title — matches old kaji-app.tsx settings sub-views.
 */
export function SettingsPanel({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] text-[var(--foreground)]"
          aria-label="戻る"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-[22px] font-bold text-[var(--foreground)]">
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

/**
 * Settings menu item — matches old sidebar menu row style.
 */
export function SettingsMenuItem({
  label,
  materialIcon,
  onClick,
}: {
  label: string;
  materialIcon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left"
    >
      <span className="material-symbols-rounded text-[21px] text-[var(--muted-foreground)]">
        {materialIcon}
      </span>
      <span className="text-[18px] font-semibold leading-none text-[var(--foreground)]">
        {label}
      </span>
    </button>
  );
}
