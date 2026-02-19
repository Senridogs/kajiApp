import assert from "node:assert/strict";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4310";
const cookieJar = new Map<string, string>();
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_IN_MS);
}

function startOfJstDay(date: Date) {
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const jst = new Date(date.getTime() + jstOffsetMs);
  return new Date(
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - jstOffsetMs,
  );
}

function toJstDateKey(date: Date) {
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const jst = new Date(date.getTime() + jstOffsetMs);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function updateCookieJar(response: Response) {
  const headers = (
    response.headers as Headers & { getSetCookie?: () => string[] }
  );
  const cookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];

  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    if (!pair) continue;
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const key = pair.slice(0, index);
    const value = pair.slice(index + 1);
    cookieJar.set(key, value);
  }
}

function cookieHeader() {
  return Array.from(cookieJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function request(pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const cookie = cookieHeader();
  if (cookie) headers.set("cookie", cookie);

  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  updateCookieJar(response);
  return response;
}

async function main() {
  const bootstrapAsGuest = await request("/api/bootstrap");
  assert.equal(bootstrapAsGuest.status, 200);
  const guestBody = await bootstrapAsGuest.json();
  assert.equal(guestBody.needsRegistration, true);

  const uniqueName = `itest-${Date.now()}`;
  const password = "itest-pass-123";
  const registerRes = await request("/api/register", {
    method: "POST",
    body: JSON.stringify({ name: uniqueName, password }),
  });
  assert.equal(registerRes.status, 200);
  const registerBody = await registerRes.json();
  assert.ok(registerBody.user?.id);
  assert.ok(registerBody.householdInviteCode);
  const initialUserId: string = registerBody.user.id;
  const initialInviteCode: string = registerBody.householdInviteCode;
  assert.ok(cookieJar.has("kaji_user_id"));
  assert.ok(cookieJar.has("kaji_household_id"));

  cookieJar.clear();
  const reloginRes = await request("/api/register", {
    method: "POST",
    body: JSON.stringify({ name: uniqueName, password }),
  });
  assert.equal(reloginRes.status, 200);
  const reloginBody = await reloginRes.json();
  assert.equal(reloginBody.user?.id, initialUserId);
  assert.equal(reloginBody.householdInviteCode, initialInviteCode);
  assert.ok(cookieJar.has("kaji_user_id"));
  assert.ok(cookieJar.has("kaji_household_id"));

  const bootstrapAsUser = await request("/api/bootstrap");
  assert.equal(bootstrapAsUser.status, 200);
  const userBody = await bootstrapAsUser.json();
  assert.equal(userBody.needsRegistration, false);
  assert.ok(Array.isArray(userBody.chores));
  assert.ok(Array.isArray(userBody.users));

  const createChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "統合テスト家事",
      intervalDays: 3,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: "2026-02-15T00:00:00.000Z",
    }),
  });
  assert.equal(createChoreRes.status, 200);
  const createChoreBody = await createChoreRes.json();
  assert.equal(createChoreBody.chore.title, "統合テスト家事");
  assert.ok(createChoreBody.chore.lastPerformedAt);
  const choreId: string = createChoreBody.chore.id;

  const createChoreMissingDateRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "前回実施日時なし",
      intervalDays: 7,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
    }),
  });
  assert.equal(createChoreMissingDateRes.status, 400);

  const patchChoreRes = await request(`/api/chores/${choreId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "統合テスト家事(更新)" }),
  });
  assert.equal(patchChoreRes.status, 200);
  const patchChoreBody = await patchChoreRes.json();
  assert.equal(patchChoreBody.chore.title, "統合テスト家事(更新)");

  const recordRes = await request(`/api/chores/${choreId}/record`, {
    method: "POST",
    body: JSON.stringify({ memo: "integration memo" }),
  });
  assert.equal(recordRes.status, 200);
  const recordBody = await recordRes.json();
  assert.ok(recordBody.record?.id);
  const recordId: string = recordBody.record.id;

  const recordsRes = await request("/api/records");
  assert.equal(recordsRes.status, 200);
  const recordsBody = await recordsRes.json();
  assert.ok(recordsBody.records.some((item: { id: string }) => item.id === recordId));

  const deleteRecordRes = await request(`/api/records/${recordId}`, { method: "DELETE" });
  assert.equal(deleteRecordRes.status, 200);
  const deleteRecordBody = await deleteRecordRes.json();
  assert.equal(deleteRecordBody.ok, true);

  const invalidCustomStatsRes = await request("/api/stats?period=custom");
  assert.equal(invalidCustomStatsRes.status, 400);

  const validCustomStatsRes = await request("/api/stats?period=custom&from=2026-01-01&to=2026-02-15");
  assert.equal(validCustomStatsRes.status, 200);
  const validCustomStatsBody = await validCustomStatsRes.json();
  assert.ok(Array.isArray(validCustomStatsBody.choreCounts));
  assert.ok(Array.isArray(validCustomStatsBody.userCounts));

  const invalidSettingsRes = await request("/api/notification-settings", {
    method: "PATCH",
    body: JSON.stringify({ reminderTimes: [] }),
  });
  assert.equal(invalidSettingsRes.status, 400);

  const settingsRes = await request("/api/notification-settings", {
    method: "PATCH",
    body: JSON.stringify({
      notifyReminder: true,
      notifyCompletion: true,
      reminderTimes: ["06:00", "20:00"],
    }),
  });
  assert.equal(settingsRes.status, 200);
  const settingsBody = await settingsRes.json();
  assert.deepEqual(settingsBody.reminderTimes, ["06:00", "20:00"]);
  assert.equal(settingsBody.notifyReminder, true);

  const todayStart = startOfJstDay(new Date());
  const todayDateKey = toJstDateKey(todayStart);
  const sourceDateKey = toJstDateKey(addDays(todayStart, 1));
  const nextIfNoRecalc = toJstDateKey(addDays(todayStart, 3));
  const nextIfRecalc = toJstDateKey(addDays(todayStart, 2));
  const lastPerformedForSource = addDays(todayStart, -1).toISOString();
  const futurePerformedAt = new Date(`${sourceDateKey}T09:00:00+09:00`).toISOString();

  const createFutureNoRecalcChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "future-no-recalc",
      intervalDays: 2,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: lastPerformedForSource,
    }),
  });
  assert.equal(createFutureNoRecalcChoreRes.status, 200);
  const createFutureNoRecalcChoreBody = await createFutureNoRecalcChoreRes.json();
  const futureNoRecalcChoreId: string = createFutureNoRecalcChoreBody.chore.id;

  const futureNoRecalcRecordRes = await request(`/api/chores/${futureNoRecalcChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      memo: "future-no-recalc",
      performedAt: futurePerformedAt,
      sourceDate: sourceDateKey,
      recalculateFuture: false,
    }),
  });
  assert.equal(futureNoRecalcRecordRes.status, 200);
  const futureNoRecalcRecordBody = await futureNoRecalcRecordRes.json();
  assert.equal(
    toJstDateKey(new Date(futureNoRecalcRecordBody.record.performedAt)),
    todayDateKey,
  );

  const noRecalcOverridesRes = await request("/api/schedule-overrides");
  assert.equal(noRecalcOverridesRes.status, 200);
  const noRecalcOverridesBody = await noRecalcOverridesRes.json();
  const noRecalcDates: string[] = noRecalcOverridesBody.overrides
    .filter((item: { choreId: string }) => item.choreId === futureNoRecalcChoreId)
    .map((item: { date: string }) => item.date);
  assert.equal(noRecalcDates.includes(nextIfNoRecalc), true);
  assert.equal(noRecalcDates.includes(nextIfRecalc), false);

  const createFutureRecalcChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "future-recalc",
      intervalDays: 2,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: lastPerformedForSource,
    }),
  });
  assert.equal(createFutureRecalcChoreRes.status, 200);
  const createFutureRecalcChoreBody = await createFutureRecalcChoreRes.json();
  const futureRecalcChoreId: string = createFutureRecalcChoreBody.chore.id;

  const futureRecalcRecordRes = await request(`/api/chores/${futureRecalcChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      memo: "future-recalc",
      performedAt: futurePerformedAt,
      sourceDate: sourceDateKey,
      recalculateFuture: true,
    }),
  });
  assert.equal(futureRecalcRecordRes.status, 200);
  const futureRecalcRecordBody = await futureRecalcRecordRes.json();
  assert.equal(
    toJstDateKey(new Date(futureRecalcRecordBody.record.performedAt)),
    todayDateKey,
  );

  const recalcOverridesRes = await request("/api/schedule-overrides");
  assert.equal(recalcOverridesRes.status, 200);
  const recalcOverridesBody = await recalcOverridesRes.json();
  const recalcDates: string[] = recalcOverridesBody.overrides
    .filter((item: { choreId: string }) => item.choreId === futureRecalcChoreId)
    .map((item: { date: string }) => item.date);
  assert.equal(recalcDates.includes(nextIfRecalc), true);
  assert.equal(recalcDates.includes(nextIfNoRecalc), false);

  const duplicateBaseDate = startOfJstDay(new Date());
  const duplicateTargetDateKey = toJstDateKey(duplicateBaseDate);
  const duplicateSourceDateKey = toJstDateKey(addDays(duplicateBaseDate, 1));
  const duplicateLastPerformedAt = addDays(duplicateBaseDate, -1).toISOString();
  const duplicateRecordPerformedAt = new Date(`${duplicateTargetDateKey}T09:00:00+09:00`).toISOString();

  const createDuplicateNoMergeChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "duplicate-no-merge",
      intervalDays: 1,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: duplicateLastPerformedAt,
    }),
  });
  assert.equal(createDuplicateNoMergeChoreRes.status, 200);
  const createDuplicateNoMergeChoreBody = await createDuplicateNoMergeChoreRes.json();
  const duplicateNoMergeChoreId: string = createDuplicateNoMergeChoreBody.chore.id;

  const moveNoMergeRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: duplicateNoMergeChoreId,
      sourceDate: duplicateSourceDateKey,
      date: duplicateTargetDateKey,
      recalculateFuture: false,
      mergeIfDuplicate: false,
    }),
  });
  assert.equal(moveNoMergeRes.status, 200);

  const noMergeAfterMoveRes = await request("/api/schedule-overrides");
  assert.equal(noMergeAfterMoveRes.status, 200);
  const noMergeAfterMoveBody = await noMergeAfterMoveRes.json();
  const noMergeTargetCountAfterMove = noMergeAfterMoveBody.overrides.filter(
    (item: { choreId: string; date: string }) =>
      item.choreId === duplicateNoMergeChoreId && item.date === duplicateTargetDateKey,
  ).length;
  assert.equal(noMergeTargetCountAfterMove, 2);

  const firstConsumeNoMergeRes = await request(`/api/chores/${duplicateNoMergeChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      memo: "dup-consume-1",
      performedAt: duplicateRecordPerformedAt,
      sourceDate: duplicateTargetDateKey,
      recalculateFuture: false,
      mergeIfDuplicate: false,
    }),
  });
  assert.equal(firstConsumeNoMergeRes.status, 200);

  const noMergeAfterFirstConsumeRes = await request("/api/schedule-overrides");
  assert.equal(noMergeAfterFirstConsumeRes.status, 200);
  const noMergeAfterFirstConsumeBody = await noMergeAfterFirstConsumeRes.json();
  const noMergeTargetCountAfterFirstConsume = noMergeAfterFirstConsumeBody.overrides.filter(
    (item: { choreId: string; date: string }) =>
      item.choreId === duplicateNoMergeChoreId && item.date === duplicateTargetDateKey,
  ).length;
  assert.equal(noMergeTargetCountAfterFirstConsume, 1);

  const secondConsumeNoMergeRes = await request(`/api/chores/${duplicateNoMergeChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      memo: "dup-consume-2",
      performedAt: duplicateRecordPerformedAt,
      sourceDate: duplicateTargetDateKey,
      recalculateFuture: false,
      mergeIfDuplicate: false,
    }),
  });
  assert.equal(secondConsumeNoMergeRes.status, 200);

  const noMergeAfterSecondConsumeRes = await request("/api/schedule-overrides");
  assert.equal(noMergeAfterSecondConsumeRes.status, 200);
  const noMergeAfterSecondConsumeBody = await noMergeAfterSecondConsumeRes.json();
  const noMergeTargetCountAfterSecondConsume = noMergeAfterSecondConsumeBody.overrides.filter(
    (item: { choreId: string; date: string }) =>
      item.choreId === duplicateNoMergeChoreId && item.date === duplicateTargetDateKey,
  ).length;
  assert.equal(noMergeTargetCountAfterSecondConsume, 0);

  const createDuplicateMergeChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "duplicate-merge",
      intervalDays: 1,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: duplicateLastPerformedAt,
    }),
  });
  assert.equal(createDuplicateMergeChoreRes.status, 200);
  const createDuplicateMergeChoreBody = await createDuplicateMergeChoreRes.json();
  const duplicateMergeChoreId: string = createDuplicateMergeChoreBody.chore.id;

  const moveMergeRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: duplicateMergeChoreId,
      sourceDate: duplicateSourceDateKey,
      date: duplicateTargetDateKey,
      recalculateFuture: false,
      mergeIfDuplicate: true,
    }),
  });
  assert.equal(moveMergeRes.status, 200);

  const mergeAfterMoveRes = await request("/api/schedule-overrides");
  assert.equal(mergeAfterMoveRes.status, 200);
  const mergeAfterMoveBody = await mergeAfterMoveRes.json();
  const mergeTargetCountAfterMove = mergeAfterMoveBody.overrides.filter(
    (item: { choreId: string; date: string }) =>
      item.choreId === duplicateMergeChoreId && item.date === duplicateTargetDateKey,
  ).length;
  assert.equal(mergeTargetCountAfterMove, 1);
}

await main();
console.log("Integration API flow passed.");
