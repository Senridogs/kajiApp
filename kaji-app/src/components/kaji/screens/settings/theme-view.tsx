"use client";

import { useState, useCallback } from "react";
import {
  type ThemeMode,
  THEME_MODE_STORAGE_KEY,
  normalizeThemeMode,
  resolveTheme,
} from "@/lib/theme-mode";
import {
  type ThemeColor,
  THEME_COLOR_STORAGE_KEY,
  normalizeThemeColor,
} from "@/lib/theme-color";
import { SettingsPanel } from "./settings-shared";

const THEME_MODE_ITEMS: ReadonlyArray<{ key: ThemeMode; label: string }> = [
  { key: "system", label: "システム" },
  { key: "light", label: "ライト" },
  { key: "dark", label: "ダーク" },
];

const THEME_COLOR_ITEMS: ReadonlyArray<{
  key: ThemeColor;
  label: string;
  preview: string;
}> = [
  { key: "orange", label: "オレンジ", preview: "#f97316" },
  { key: "blue", label: "ブルー", preview: "#2563eb" },
  { key: "emerald", label: "エメラルド", preview: "#059669" },
  { key: "rose", label: "ローズ", preview: "#e11d48" },
];

type Props = {
  onBack: () => void;
};

export function ThemeView({ onBack }: Props) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    return normalizeThemeMode(localStorage.getItem(THEME_MODE_STORAGE_KEY));
  });

  const [themeColor, setThemeColor] = useState<ThemeColor>(() => {
    if (typeof window === "undefined") return "orange";
    return normalizeThemeColor(localStorage.getItem(THEME_COLOR_STORAGE_KEY));
  });

  const resolvedTheme =
    typeof window === "undefined"
      ? "light"
      : resolveTheme(
          themeMode,
          window.matchMedia("(prefers-color-scheme: dark)").matches,
        );

  const handleThemeModeChange = useCallback((next: ThemeMode) => {
    setThemeMode(next);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, next);
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const resolved = resolveTheme(next, prefersDark);
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, []);

  const handleThemeColorChange = useCallback((next: ThemeColor) => {
    setThemeColor(next);
    localStorage.setItem(THEME_COLOR_STORAGE_KEY, next);
    document.documentElement.dataset.theme = next;
  }, []);

  return (
    <SettingsPanel title="テーマカラー" onBack={onBack}>
      <p className="text-[13px] font-medium leading-relaxed text-[var(--muted-foreground)]">
        ライト/ダーク表示とアクセントカラーを切り替えられます。白黒ベースのUIに差し色が適用されます。
      </p>

      {/* 表示テーマ */}
      <div className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-3">
        <p className="text-[13px] font-semibold text-[var(--muted-foreground)]">
          表示テーマ
        </p>
        <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-[var(--secondary)] p-1">
          {THEME_MODE_ITEMS.map((item) => {
            const selected = themeMode === item.key;
            return (
              <button
                key={`theme-mode-${item.key}`}
                type="button"
                onClick={() => handleThemeModeChange(item.key)}
                className={`rounded-[8px] px-2 py-1.5 text-[12px] font-bold transition-colors ${
                  selected
                    ? "bg-[var(--card)] text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] font-medium text-[var(--app-text-tertiary)]">
          現在の表示: {resolvedTheme === "dark" ? "ダーク" : "ライト"}
        </p>
      </div>

      {/* アクセントカラー */}
      <div className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-3">
        <p className="text-[13px] font-semibold text-[var(--muted-foreground)]">
          アクセントカラー
        </p>
        <div className="grid grid-cols-2 gap-2">
          {THEME_COLOR_ITEMS.map((item) => {
            const selected = themeColor === item.key;
            return (
              <button
                key={`theme-color-${item.key}`}
                type="button"
                onClick={() => handleThemeColorChange(item.key)}
                className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-left ${
                  selected
                    ? "border-[var(--primary)] bg-[var(--app-surface-soft)]"
                    : "border-[var(--border)] bg-[var(--card)]"
                }`}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: item.preview }}
                />
                <span className="flex-1 text-[13px] font-semibold text-[var(--foreground)]">
                  {item.label}
                </span>
                <span
                  className={`material-symbols-rounded text-[18px] ${
                    selected
                      ? "text-[var(--primary)]"
                      : "text-[var(--app-text-tertiary)]"
                  }`}
                >
                  {selected ? "check_circle" : "radio_button_unchecked"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </SettingsPanel>
  );
}
