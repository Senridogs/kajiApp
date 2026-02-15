import assert from "node:assert/strict";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4310";
const cookieJar = new Map<string, string>();

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
  const registerRes = await request("/api/register", {
    method: "POST",
    body: JSON.stringify({ name: uniqueName }),
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
    body: JSON.stringify({ name: uniqueName }),
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
      notifyDueToday: true,
      remindDailyIfOverdue: true,
      notifyCompletion: true,
      reminderTimes: ["06:00", "20:00"],
    }),
  });
  assert.equal(settingsRes.status, 200);
  const settingsBody = await settingsRes.json();
  assert.deepEqual(settingsBody.reminderTimes, ["06:00", "20:00"]);
}

await main();
console.log("Integration API flow passed.");
