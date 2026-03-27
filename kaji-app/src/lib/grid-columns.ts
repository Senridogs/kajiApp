export type GridColumns = 3 | 4 | 5;
export const GRID_COLUMNS_STORAGE_KEY = "kaji_grid_columns";

export function normalizeGridColumns(raw: string | null | undefined): GridColumns {
  if (raw === "3" || raw === "4" || raw === "5") {
    return Number(raw) as GridColumns;
  }
  return 3;
}
