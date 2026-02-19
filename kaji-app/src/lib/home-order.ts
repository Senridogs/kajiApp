export type DropPosition = "before" | "after";
export type HomeOrderByDate = Record<string, string[]>;

type SanitizeHomeOrderOptions = {
  allowedDateKeys?: Set<string>;
  todayDateKey?: string;
  rollingWindowDays?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

function parseDateKeyToDayNumber(dateKey: string) {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(utc.getTime() / DAY_MS);
}

export function isDateKey(value: string) {
  return parseDateKeyToDayNumber(value) !== null;
}

export function isDateKeyWithinRollingWindow(
  dateKey: string,
  todayDateKey: string,
  rollingWindowDays: number,
) {
  if (rollingWindowDays < 0) return false;
  const dateDay = parseDateKeyToDayNumber(dateKey);
  const todayDay = parseDateKeyToDayNumber(todayDateKey);
  if (dateDay === null || todayDay === null) return false;
  return Math.abs(dateDay - todayDay) <= rollingWindowDays;
}

export function sanitizeHomeOrderByDate(
  value: unknown,
  options?: SanitizeHomeOrderOptions,
): HomeOrderByDate {
  if (!value || typeof value !== "object") return {};

  const source = value as Record<string, unknown>;
  const next: HomeOrderByDate = {};
  const allowedDateKeys = options?.allowedDateKeys;
  const todayDateKey = options?.todayDateKey;
  const rollingWindowDays = options?.rollingWindowDays;

  for (const [dateKey, ids] of Object.entries(source)) {
    if (!isDateKey(dateKey)) continue;
    if (allowedDateKeys && !allowedDateKeys.has(dateKey)) continue;
    if (
      todayDateKey &&
      typeof rollingWindowDays === "number" &&
      !isDateKeyWithinRollingWindow(dateKey, todayDateKey, rollingWindowDays)
    ) {
      continue;
    }
    if (!Array.isArray(ids)) continue;
    const normalized = uniqueIds(ids.filter((id): id is string => typeof id === "string"));
    if (normalized.length === 0) continue;
    next[dateKey] = normalized;
  }

  return next;
}

export function applyHomeStoredOrder(baseIds: string[], storedIds: string[]) {
  const uniqueBase = uniqueIds(baseIds);
  const baseIndex = new Map(uniqueBase.map((id, index) => [id, index]));
  const orderedStored = uniqueIds(storedIds).filter((id) => baseIndex.has(id));
  const result = [...orderedStored];

  for (const id of uniqueBase) {
    if (result.includes(id)) continue;
    const index = baseIndex.get(id);
    if (index === undefined) continue;
    const insertAt = result.findIndex((currentId) => {
      const currentIndex = baseIndex.get(currentId);
      return currentIndex !== undefined && currentIndex > index;
    });
    if (insertAt === -1) {
      result.push(id);
    } else {
      result.splice(insertAt, 0, id);
    }
  }

  return result;
}

export function reorderWithinDate(
  ids: string[],
  dragId: string,
  targetId: string,
  position: DropPosition,
) {
  const unique = uniqueIds(ids);
  const fromIndex = unique.indexOf(dragId);
  if (fromIndex === -1) return unique;
  if (targetId === dragId) return unique;

  unique.splice(fromIndex, 1);
  const targetIndex = unique.indexOf(targetId);
  if (targetIndex === -1) {
    unique.push(dragId);
    return unique;
  }

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  unique.splice(insertIndex, 0, dragId);
  return unique;
}

export function moveAcrossDates(
  sourceIds: string[],
  targetIds: string[],
  dragId: string,
  targetId: string,
  position: DropPosition,
) {
  const nextSource = uniqueIds(sourceIds).filter((id) => id !== dragId);
  const nextTarget = uniqueIds(targetIds).filter((id) => id !== dragId);
  const targetIndex = nextTarget.indexOf(targetId);

  if (targetIndex === -1 || targetId === dragId) {
    nextTarget.push(dragId);
    return { sourceIds: nextSource, targetIds: nextTarget };
  }

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  nextTarget.splice(insertIndex, 0, dragId);
  return { sourceIds: nextSource, targetIds: nextTarget };
}
