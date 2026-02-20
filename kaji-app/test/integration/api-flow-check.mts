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

async function listOverrides() {
  const res = await request("/api/schedule-overrides");
  assert.equal(res.status, 200);
  const body = await res.json();
  return body.overrides as Array<{ choreId: string; date: string }>;
}

async function countOverridesOnDate(choreId: string, dateKey: string) {
  const overrides = await listOverrides();
  return overrides.filter((item) => item.choreId === choreId && item.date === dateKey).length;
}

async function readBootstrapChore(choreId: string) {
  const res = await request("/api/bootstrap");
  assert.equal(res.status, 200);
  const body = await res.json();
  const chore = (body.chores as Array<{ id: string }>).find((item) => item.id === choreId);
  assert.ok(chore);
  return chore as {
    id: string;
    doneToday: boolean;
    lastRecordSkipped: boolean;
    lastRecordId: string | null;
  };
}

async function readBootstrapHomeProgress(choreId: string, dateKey: string) {
  const res = await request("/api/bootstrap");
  assert.equal(res.status, 200);
  const body = await res.json();
  return body.homeProgressByDate?.[dateKey]?.[choreId] as
    | {
      total: number;
      completed: number;
      skipped: number;
      pending: number;
      latestState: "pending" | "done" | "skipped";
    }
    | undefined;
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
  const sourceDateKey = toJstDateKey(addDays(todayStart, 1));
  const nextIfNoRecalc = toJstDateKey(addDays(todayStart, 3));
  const nextIfRecalc = toJstDateKey(addDays(todayStart, 2));
  const lastPerformedForSource = addDays(todayStart, -1).toISOString();
  const futurePerformedAt = new Date(`${toJstDateKey(todayStart)}T09:00:00+09:00`).toISOString();

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
    toJstDateKey(todayStart),
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
    toJstDateKey(todayStart),
  );

  const recalcOverridesRes = await request("/api/schedule-overrides");
  assert.equal(recalcOverridesRes.status, 200);
  const recalcOverridesBody = await recalcOverridesRes.json();
  const recalcDates: string[] = recalcOverridesBody.overrides
    .filter((item: { choreId: string }) => item.choreId === futureRecalcChoreId)
    .map((item: { date: string }) => item.date);
  assert.equal(recalcDates.includes(nextIfRecalc), true);
  assert.equal(recalcDates.includes(nextIfNoRecalc), false);

  const addModeBaseDate = startOfJstDay(new Date());
  const addModeTodayKey = toJstDateKey(addModeBaseDate);
  const addModeUnsheduledDateKey = toJstDateKey(addDays(addModeBaseDate, 1));
  const addModeLastPerformedAt = addDays(addModeBaseDate, -1).toISOString();

  const createAddModeChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "add-mode-duplicate-guard",
      intervalDays: 3,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: addModeLastPerformedAt,
    }),
  });
  assert.equal(createAddModeChoreRes.status, 200);
  const createAddModeChoreBody = await createAddModeChoreRes.json();
  const addModeChoreId: string = createAddModeChoreBody.chore.id;

  const addModeFirstAddRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: addModeChoreId,
      date: addModeUnsheduledDateKey,
      mode: "add",
      allowDuplicate: false,
    }),
  });
  assert.equal(addModeFirstAddRes.status, 200);
  assert.equal(await countOverridesOnDate(addModeChoreId, addModeUnsheduledDateKey), 1);

  const addModeDuplicateBlockedRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: addModeChoreId,
      date: addModeUnsheduledDateKey,
      mode: "add",
      allowDuplicate: false,
    }),
  });
  assert.equal(addModeDuplicateBlockedRes.status, 409);

  const addModeDuplicateAllowedRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: addModeChoreId,
      date: addModeUnsheduledDateKey,
      mode: "add",
      allowDuplicate: true,
    }),
  });
  assert.equal(addModeDuplicateAllowedRes.status, 200);
  assert.equal(await countOverridesOnDate(addModeChoreId, addModeUnsheduledDateKey), 2);

  const createDailyTargetChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "daily-target-count",
      intervalDays: 1,
      dailyTargetCount: 3,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: addModeLastPerformedAt,
    }),
  });
  assert.equal(createDailyTargetChoreRes.status, 200);
  const createDailyTargetChoreBody = await createDailyTargetChoreRes.json();
  const dailyTargetChoreId: string = createDailyTargetChoreBody.chore.id;
  assert.equal(createDailyTargetChoreBody.chore.dailyTargetCount, 3);

  const patchDailyTargetChoreRes = await request(`/api/chores/${dailyTargetChoreId}`, {
    method: "PATCH",
    body: JSON.stringify({ dailyTargetCount: 5 }),
  });
  assert.equal(patchDailyTargetChoreRes.status, 200);
  const patchDailyTargetChoreBody = await patchDailyTargetChoreRes.json();
  assert.equal(patchDailyTargetChoreBody.chore.dailyTargetCount, 5);

  const createFixedDenominatorChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "fixed-denominator-daily-target",
      intervalDays: 1,
      dailyTargetCount: 4,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: addModeLastPerformedAt,
    }),
  });
  assert.equal(createFixedDenominatorChoreRes.status, 200);
  const createFixedDenominatorChoreBody = await createFixedDenominatorChoreRes.json();
  const fixedDenominatorChoreId: string = createFixedDenominatorChoreBody.chore.id;

  const fixedDenominatorFirstDoneRes = await request(`/api/chores/${fixedDenominatorChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      sourceDate: addModeTodayKey,
      performedAt: new Date(`${addModeTodayKey}T08:35:00+09:00`).toISOString(),
      recalculateFuture: false,
      mergeIfDuplicate: false,
    }),
  });
  assert.equal(fixedDenominatorFirstDoneRes.status, 200);

  const progressAfterFirstDone = await readBootstrapHomeProgress(
    fixedDenominatorChoreId,
    addModeTodayKey,
  );
  assert.ok(progressAfterFirstDone);
  assert.equal(progressAfterFirstDone.total, 4);
  assert.equal(progressAfterFirstDone.completed, 1);
  assert.equal(progressAfterFirstDone.pending, 3);

  const fixedDenominatorSecondDoneRes = await request(`/api/chores/${fixedDenominatorChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      sourceDate: addModeTodayKey,
      performedAt: new Date(`${addModeTodayKey}T08:36:00+09:00`).toISOString(),
      recalculateFuture: false,
      mergeIfDuplicate: false,
    }),
  });
  assert.equal(fixedDenominatorSecondDoneRes.status, 200);

  const progressAfterSecondDone = await readBootstrapHomeProgress(
    fixedDenominatorChoreId,
    addModeTodayKey,
  );
  assert.ok(progressAfterSecondDone);
  assert.equal(progressAfterSecondDone.total, 4);
  assert.equal(progressAfterSecondDone.completed, 2);
  assert.equal(progressAfterSecondDone.pending, 2);

  const skipCountInvalidRes = await request(`/api/chores/${dailyTargetChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      skipped: true,
      skipCount: 0,
      sourceDate: addModeTodayKey,
      performedAt: new Date(`${addModeTodayKey}T08:30:00+09:00`).toISOString(),
      recalculateFuture: false,
      mergeIfDuplicate: false,
    }),
  });
  assert.equal(skipCountInvalidRes.status, 400);

  const skipCountTooManyRes = await request(`/api/chores/${dailyTargetChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      skipped: true,
      skipCount: 6,
      sourceDate: addModeTodayKey,
      performedAt: new Date(`${addModeTodayKey}T08:31:00+09:00`).toISOString(),
      recalculateFuture: false,
      mergeIfDuplicate: false,
    }),
  });
  assert.equal(skipCountTooManyRes.status, 400);

  const skipCountAllRes = await request(`/api/chores/${dailyTargetChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      skipped: true,
      skipCount: 5,
      sourceDate: addModeTodayKey,
      performedAt: new Date(`${addModeTodayKey}T08:32:00+09:00`).toISOString(),
      recalculateFuture: false,
      mergeIfDuplicate: false,
    }),
  });
  assert.equal(skipCountAllRes.status, 200);
  const skipCountAllBody = await skipCountAllRes.json();
  assert.equal(await countOverridesOnDate(dailyTargetChoreId, addModeTodayKey), 0);

  const undoSkipCountRes = await request(`/api/records/${skipCountAllBody.record.id}`, {
    method: "DELETE",
  });
  assert.equal(undoSkipCountRes.status, 200);
  assert.equal(await countOverridesOnDate(dailyTargetChoreId, addModeTodayKey), 1);

  const duplicateSequenceCases: Array<{
    name: string;
    steps: Array<"complete" | "skip" | "undo">;
    expectedOverrides: number;
    expectedDoneToday: boolean;
    expectedSkipped: boolean;
  }> = [
      {
        name: "complete-only",
        steps: ["complete"],
        expectedOverrides: 1,
        expectedDoneToday: true,
        expectedSkipped: false,
      },
      {
        name: "skip-only",
        steps: ["skip"],
        expectedOverrides: 1,
        expectedDoneToday: true,
        expectedSkipped: true,
      },
      {
        name: "complete-undo",
        steps: ["complete", "undo"],
        expectedOverrides: 2,
        expectedDoneToday: false,
        expectedSkipped: false,
      },
      {
        name: "skip-undo",
        steps: ["skip", "undo"],
        expectedOverrides: 2,
        expectedDoneToday: false,
        expectedSkipped: false,
      },
      {
        name: "complete-skip",
        steps: ["complete", "skip"],
        expectedOverrides: 0,
        expectedDoneToday: true,
        expectedSkipped: true,
      },
      {
        name: "skip-complete",
        steps: ["skip", "complete"],
        expectedOverrides: 0,
        expectedDoneToday: true,
        expectedSkipped: false,
      },
      {
        name: "complete-undo-skip",
        steps: ["complete", "undo", "skip"],
        expectedOverrides: 1,
        expectedDoneToday: true,
        expectedSkipped: true,
      },
      {
        name: "skip-undo-complete",
        steps: ["skip", "undo", "complete"],
        expectedOverrides: 1,
        expectedDoneToday: true,
        expectedSkipped: false,
      },
    ];

  for (const sequenceCase of duplicateSequenceCases) {
    const createSequenceChoreRes = await request("/api/chores", {
      method: "POST",
      body: JSON.stringify({
        title: `sequence-${sequenceCase.name}`,
        intervalDays: 1,
        isBigTask: false,
        icon: "sparkles",
        iconColor: "#202124",
        bgColor: "#EAF5FF",
        lastPerformedAt: addModeLastPerformedAt,
      }),
    });
    assert.equal(createSequenceChoreRes.status, 200);
    const createSequenceChoreBody = await createSequenceChoreRes.json();
    const sequenceChoreId: string = createSequenceChoreBody.chore.id;

    const seedDuplicateRes = await request("/api/schedule-override", {
      method: "POST",
      body: JSON.stringify({
        choreId: sequenceChoreId,
        date: addModeTodayKey,
        mode: "add",
        allowDuplicate: true,
      }),
    });
    assert.equal(seedDuplicateRes.status, 200);
    assert.equal(await countOverridesOnDate(sequenceChoreId, addModeTodayKey), 2);

    let latestRecordId: string | null = null;
    for (const [stepIndex, step] of sequenceCase.steps.entries()) {
      if (step === "undo") {
        assert.ok(latestRecordId, `missing undo source record for ${sequenceCase.name}`);
        const undoRes = await request(`/api/records/${latestRecordId}`, {
          method: "DELETE",
        });
        assert.equal(undoRes.status, 200);
        latestRecordId = null;
        continue;
      }

      const recordRes = await request(`/api/chores/${sequenceChoreId}/record`, {
        method: "POST",
        body: JSON.stringify({
          memo: `sequence-${sequenceCase.name}-${step}`,
          skipped: step === "skip",
          performedAt: new Date(
            `${addModeTodayKey}T09:${String(stepIndex).padStart(2, "0")}:00+09:00`,
          ).toISOString(),
          sourceDate: addModeTodayKey,
          recalculateFuture: false,
          mergeIfDuplicate: false,
        }),
      });
      assert.equal(recordRes.status, 200);
      const recordBody = await recordRes.json();
      latestRecordId = recordBody.record.id;
    }

    assert.equal(
      await countOverridesOnDate(sequenceChoreId, addModeTodayKey),
      sequenceCase.expectedOverrides,
    );
    const latestChore = await readBootstrapChore(sequenceChoreId);
    assert.equal(latestChore.doneToday, sequenceCase.expectedDoneToday);
    assert.equal(latestChore.lastRecordSkipped, sequenceCase.expectedSkipped);
  }

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

  const consumeNoSourceRes = await request(`/api/chores/${duplicateNoMergeChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      memo: "dup-consume-no-source",
      performedAt: duplicateRecordPerformedAt,
    }),
  });
  assert.equal(consumeNoSourceRes.status, 200);
  const consumeNoSourceBody = await consumeNoSourceRes.json();
  const consumeNoSourceRecordId: string = consumeNoSourceBody.record.id;

  const noMergeAfterNoSourceConsumeRes = await request("/api/schedule-overrides");
  assert.equal(noMergeAfterNoSourceConsumeRes.status, 200);
  const noMergeAfterNoSourceConsumeBody = await noMergeAfterNoSourceConsumeRes.json();
  const noMergeTargetCountAfterNoSourceConsume = noMergeAfterNoSourceConsumeBody.overrides.filter(
    (item: { choreId: string; date: string }) =>
      item.choreId === duplicateNoMergeChoreId && item.date === duplicateTargetDateKey,
  ).length;
  assert.equal(noMergeTargetCountAfterNoSourceConsume, 1);

  const undoNoSourceConsumeRes = await request(`/api/records/${consumeNoSourceRecordId}`, {
    method: "DELETE",
  });
  assert.equal(undoNoSourceConsumeRes.status, 200);

  const noMergeAfterNoSourceUndoRes = await request("/api/schedule-overrides");
  assert.equal(noMergeAfterNoSourceUndoRes.status, 200);
  const noMergeAfterNoSourceUndoBody = await noMergeAfterNoSourceUndoRes.json();
  const noMergeTargetCountAfterNoSourceUndo = noMergeAfterNoSourceUndoBody.overrides.filter(
    (item: { choreId: string; date: string }) =>
      item.choreId === duplicateNoMergeChoreId && item.date === duplicateTargetDateKey,
  ).length;
  assert.equal(noMergeTargetCountAfterNoSourceUndo, 2);

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

  const recordMoveBaseDate = startOfJstDay(new Date());
  const recordMoveSourceDateKey = toJstDateKey(recordMoveBaseDate);
  const recordMoveTargetDateKey = toJstDateKey(addDays(recordMoveBaseDate, 1));
  const recordMoveNextIfNoRecalc = toJstDateKey(addDays(recordMoveBaseDate, 2));
  const recordMoveNextIfRecalc = toJstDateKey(addDays(recordMoveBaseDate, 3));
  const recordMoveSeedLastPerformedAt = addDays(recordMoveBaseDate, -2).toISOString();
  const recordMoveSourcePerformedAt = new Date(`${recordMoveSourceDateKey}T09:00:00+09:00`).toISOString();

  const createRecordMoveNoRecalcChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "record-move-no-recalc",
      intervalDays: 2,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: recordMoveSeedLastPerformedAt,
    }),
  });
  assert.equal(createRecordMoveNoRecalcChoreRes.status, 200);
  const createRecordMoveNoRecalcChoreBody = await createRecordMoveNoRecalcChoreRes.json();
  const recordMoveNoRecalcChoreId: string = createRecordMoveNoRecalcChoreBody.chore.id;

  const recordMoveNoRecalcRecordRes = await request(`/api/chores/${recordMoveNoRecalcChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      memo: "record-move-source-no-recalc",
      performedAt: recordMoveSourcePerformedAt,
    }),
  });
  assert.equal(recordMoveNoRecalcRecordRes.status, 200);
  const recordMoveNoRecalcRecordBody = await recordMoveNoRecalcRecordRes.json();
  const recordMoveNoRecalcRecordId: string = recordMoveNoRecalcRecordBody.record.id;

  const moveRecordNoRecalcRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: recordMoveNoRecalcChoreId,
      sourceRecordId: recordMoveNoRecalcRecordId,
      date: recordMoveTargetDateKey,
      recalculateFuture: false,
      mergeIfDuplicate: true,
    }),
  });
  assert.equal(moveRecordNoRecalcRes.status, 200);

  const overridesAfterRecordNoRecalcRes = await request("/api/schedule-overrides");
  assert.equal(overridesAfterRecordNoRecalcRes.status, 200);
  const overridesAfterRecordNoRecalcBody = await overridesAfterRecordNoRecalcRes.json();
  const recordNoRecalcDates: string[] = overridesAfterRecordNoRecalcBody.overrides
    .filter((item: { choreId: string }) => item.choreId === recordMoveNoRecalcChoreId)
    .map((item: { date: string }) => item.date);
  assert.equal(recordNoRecalcDates.includes(recordMoveNextIfNoRecalc), true);
  assert.equal(recordNoRecalcDates.includes(recordMoveNextIfRecalc), false);

  const createRecordMoveRecalcChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "record-move-recalc",
      intervalDays: 2,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: recordMoveSeedLastPerformedAt,
    }),
  });
  assert.equal(createRecordMoveRecalcChoreRes.status, 200);
  const createRecordMoveRecalcChoreBody = await createRecordMoveRecalcChoreRes.json();
  const recordMoveRecalcChoreId: string = createRecordMoveRecalcChoreBody.chore.id;

  const recordMoveRecalcRecordRes = await request(`/api/chores/${recordMoveRecalcChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      memo: "record-move-source-recalc",
      performedAt: recordMoveSourcePerformedAt,
    }),
  });
  assert.equal(recordMoveRecalcRecordRes.status, 200);
  const recordMoveRecalcRecordBody = await recordMoveRecalcRecordRes.json();
  const recordMoveRecalcRecordId: string = recordMoveRecalcRecordBody.record.id;

  const moveRecordRecalcRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: recordMoveRecalcChoreId,
      sourceRecordId: recordMoveRecalcRecordId,
      date: recordMoveTargetDateKey,
      recalculateFuture: true,
      mergeIfDuplicate: true,
    }),
  });
  assert.equal(moveRecordRecalcRes.status, 200);

  const overridesAfterRecordRecalcRes = await request("/api/schedule-overrides");
  assert.equal(overridesAfterRecordRecalcRes.status, 200);
  const overridesAfterRecordRecalcBody = await overridesAfterRecordRecalcRes.json();
  const recordRecalcDates: string[] = overridesAfterRecordRecalcBody.overrides
    .filter((item: { choreId: string }) => item.choreId === recordMoveRecalcChoreId)
    .map((item: { date: string }) => item.date);
  assert.equal(recordRecalcDates.includes(recordMoveNextIfRecalc), true);
  assert.equal(recordRecalcDates.includes(recordMoveNextIfNoRecalc), false);

  const duplicateRecordMoveLastPerformedAt = addDays(recordMoveBaseDate, -1).toISOString();
  const createRecordDupNoMergeChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "record-dup-no-merge",
      intervalDays: 1,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: duplicateRecordMoveLastPerformedAt,
    }),
  });
  assert.equal(createRecordDupNoMergeChoreRes.status, 200);
  const createRecordDupNoMergeChoreBody = await createRecordDupNoMergeChoreRes.json();
  const recordDupNoMergeChoreId: string = createRecordDupNoMergeChoreBody.chore.id;

  const recordDupNoMergeSourceRes = await request(`/api/chores/${recordDupNoMergeChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      memo: "record-dup-no-merge-source",
      performedAt: recordMoveSourcePerformedAt,
    }),
  });
  assert.equal(recordDupNoMergeSourceRes.status, 200);
  const recordDupNoMergeSourceBody = await recordDupNoMergeSourceRes.json();
  const recordDupNoMergeRecordId: string = recordDupNoMergeSourceBody.record.id;

  const moveRecordDupNoMergeRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: recordDupNoMergeChoreId,
      sourceRecordId: recordDupNoMergeRecordId,
      date: recordMoveTargetDateKey,
      recalculateFuture: false,
      mergeIfDuplicate: false,
    }),
  });
  assert.equal(moveRecordDupNoMergeRes.status, 200);

  const overridesAfterRecordDupNoMergeRes = await request("/api/schedule-overrides");
  assert.equal(overridesAfterRecordDupNoMergeRes.status, 200);
  const overridesAfterRecordDupNoMergeBody = await overridesAfterRecordDupNoMergeRes.json();
  const recordDupNoMergeTargetCount = overridesAfterRecordDupNoMergeBody.overrides.filter(
    (item: { choreId: string; date: string }) =>
      item.choreId === recordDupNoMergeChoreId && item.date === recordMoveTargetDateKey,
  ).length;
  assert.equal(recordDupNoMergeTargetCount, 1);

  const createRecordDupMergeChoreRes = await request("/api/chores", {
    method: "POST",
    body: JSON.stringify({
      title: "record-dup-merge",
      intervalDays: 1,
      isBigTask: false,
      icon: "sparkles",
      iconColor: "#202124",
      bgColor: "#EAF5FF",
      lastPerformedAt: duplicateRecordMoveLastPerformedAt,
    }),
  });
  assert.equal(createRecordDupMergeChoreRes.status, 200);
  const createRecordDupMergeChoreBody = await createRecordDupMergeChoreRes.json();
  const recordDupMergeChoreId: string = createRecordDupMergeChoreBody.chore.id;

  const recordDupMergeSourceRes = await request(`/api/chores/${recordDupMergeChoreId}/record`, {
    method: "POST",
    body: JSON.stringify({
      memo: "record-dup-merge-source",
      performedAt: recordMoveSourcePerformedAt,
    }),
  });
  assert.equal(recordDupMergeSourceRes.status, 200);
  const recordDupMergeSourceBody = await recordDupMergeSourceRes.json();
  const recordDupMergeRecordId: string = recordDupMergeSourceBody.record.id;

  const moveRecordDupMergeRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: recordDupMergeChoreId,
      sourceRecordId: recordDupMergeRecordId,
      date: recordMoveTargetDateKey,
      recalculateFuture: false,
      mergeIfDuplicate: true,
    }),
  });
  assert.equal(moveRecordDupMergeRes.status, 200);

  const overridesAfterRecordDupMergeRes = await request("/api/schedule-overrides");
  assert.equal(overridesAfterRecordDupMergeRes.status, 200);
  const overridesAfterRecordDupMergeBody = await overridesAfterRecordDupMergeRes.json();
  const recordDupMergeTargetCount = overridesAfterRecordDupMergeBody.overrides.filter(
    (item: { choreId: string; date: string }) =>
      item.choreId === recordDupMergeChoreId && item.date === recordMoveTargetDateKey,
  ).length;
  assert.equal(recordDupMergeTargetCount, 0);

  const mismatchRecordMoveRes = await request("/api/schedule-override", {
    method: "POST",
    body: JSON.stringify({
      choreId: recordMoveNoRecalcChoreId,
      sourceRecordId: recordDupMergeRecordId,
      date: recordMoveTargetDateKey,
      recalculateFuture: true,
    }),
  });
  assert.equal(mismatchRecordMoveRes.status, 404);

  console.log("Checking cron reminders...");
  const cronRes = await request("/api/cron/reminders");
  if (cronRes.status === 200) {
    const cronBody = await cronRes.json();
    assert.equal(cronBody.ok, true);
    if (cronBody.skipped) {
      assert.equal(cronBody.skipped, "push-not-configured");
    } else {
      assert.equal(typeof cronBody.sent, "number");
    }
  } else {
    assert.equal(cronRes.status, 401);
  }
}

await main();
console.log("Integration API flow passed.");
