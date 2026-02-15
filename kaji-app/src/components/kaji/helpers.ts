import { icons, type LucideIcon } from "lucide-react";

import { startOfJstDay } from "@/lib/time";
import type { ChoreWithComputed } from "@/lib/types";

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "通信に失敗しました。" }));
    throw new Error(err.error ?? "通信に失敗しました。");
  }

  return res.json() as Promise<T>;
}

function toPascalCaseIconName(name: string) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function iconByName(name: string): LucideIcon {
  const key = toPascalCaseIconName(name) as keyof typeof icons;
  return (icons[key] as LucideIcon) ?? (icons.Sparkles as LucideIcon);
}

export function labelForDue(chore: ChoreWithComputed) {
  if (chore.doneToday) return "実施済み";
  if (chore.isOverdue) return `${chore.overdueDays}日遅れ`;
  if (chore.isDueToday) return "今日";
  if (chore.isDueTomorrow) return "明日";
  if (!chore.dueAt) return "未設定";
  const due = new Date(chore.dueAt);
  return `${due.getMonth() + 1}/${due.getDate()} 期限`;
}

export function maxCount(items: Array<{ count: number }>) {
  const max = Math.max(...items.map((x) => x.count), 1);
  return max === 0 ? 1 : max;
}

export function formatJpDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatMonthDay(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateShort(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatTopDate(now = new Date()) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(now);
}

export function relativeLastPerformed(value: string | null, now = new Date()) {
  if (!value) return "未実施";
  const performed = new Date(value);
  const todayStart = startOfJstDay(now);
  const performedStart = startOfJstDay(performed);
  const diff = Math.floor((todayStart.getTime() - performedStart.getTime()) / (24 * 60 * 60 * 1000));

  if (diff <= 0) return "今日";
  if (diff === 1) return "昨日";
  return `${diff}日前`;
}

export function dueInDaysLabel(chore: ChoreWithComputed, now = new Date()) {
  if (!chore.dueAt) return "期限未設定";
  const due = new Date(chore.dueAt);
  const todayStart = startOfJstDay(now);
  const dueStart = startOfJstDay(due);
  const diff = Math.floor((dueStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));

  if (diff > 0) return `期限まで${diff}日`;
  if (diff === 0) return "期限は今日";
  return `${Math.abs(diff)}日超過`;
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
