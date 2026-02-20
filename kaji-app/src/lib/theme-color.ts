export type ThemeColor = "orange" | "blue" | "emerald" | "rose";

export const THEME_COLOR_STORAGE_KEY = "kaji_theme_color";

export function normalizeThemeColor(raw: string | null | undefined): ThemeColor {
  if (raw === "orange" || raw === "blue" || raw === "emerald" || raw === "rose") {
    return raw;
  }
  return "orange";
}
