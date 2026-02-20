const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

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

export function buildHomeDateKeys(now = new Date()) {
  const todayStart = startOfJstDay(now);
  const yesterdayStart = addDays(todayStart, -1);
  const tomorrowStart = addDays(todayStart, 1);
  return {
    today: toJstDateKey(todayStart),
    yesterday: toJstDateKey(yesterdayStart),
    tomorrow: toJstDateKey(tomorrowStart),
  };
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
