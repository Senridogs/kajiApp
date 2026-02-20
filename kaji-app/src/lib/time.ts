const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toJstDateKey(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfJstDay(date: Date): Date {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return new Date(
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) -
      JST_OFFSET_MS,
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function parseDateKey(dateKey: string): Date | null {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS);
  return toJstDateKey(parsed) === dateKey ? parsed : null;
}

export function formatDateKey(date: Date): string {
  return toJstDateKey(startOfJstDay(date));
}

export function addDateKeyDays(dateKey: string, days: number): string | null {
  const baseDate = parseDateKey(dateKey);
  if (!baseDate) return null;
  return formatDateKey(addDays(baseDate, days));
}

export function compareDateKey(left: string, right: string): number {
  return left.localeCompare(right);
}

export function diffDaysFloor(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function formatJst(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function nowJstHourMinute(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") {
        acc[p.type] = p.value;
      }
      return acc;
    }, {});

  return `${parts.hour ?? "00"}:${parts.minute ?? "00"}`;
}
