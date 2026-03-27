export function calcHouseholdStreak(
  performedDates: string[],
  todayKey: string
): number {
  if (performedDates.length === 0) return 0;

  const dateSet = new Set(performedDates);

  let streak = 0;
  let current = dateSet.has(todayKey) ? todayKey : subtractDay(todayKey);

  if (!dateSet.has(current)) return 0;

  while (dateSet.has(current)) {
    streak++;
    current = subtractDay(current);
  }

  return streak;
}

function subtractDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
