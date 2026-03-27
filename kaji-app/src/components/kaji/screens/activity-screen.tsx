"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import type {
  BootstrapResponse,
  ChoreRecordItem,
} from "@/lib/types";
import { startOfJstDay, toJstDateKey, addDays } from "@/lib/time";
import { apiFetch, iconByName } from "../helpers";
import { PRIMARY_COLOR } from "../constants";

type Props = {
  boot: BootstrapResponse;
  onReaction: (recordId: string, emoji: string) => void;
  onRefresh: () => Promise<void>;
};

const REACTION_CHOICES = ["\u{1F44F}", "\u2764\uFE0F", "\u2728", "\u{1F389}"] as const;
const REACTION_ICON_MAP: Record<(typeof REACTION_CHOICES)[number], { icon: string; color: string }> = {
  "\u{1F44F}": { icon: "thumb_up", color: PRIMARY_COLOR },
  "\u2764\uFE0F": { icon: "favorite", color: PRIMARY_COLOR },
  "\u2728": { icon: "celebration", color: PRIMARY_COLOR },
  "\u{1F389}": { icon: "star", color: PRIMARY_COLOR },
};

type TimelineRecordGroup = {
  dateKey: string;
  label: string;
  items: ChoreRecordItem[];
};

function isSameDateKey(a: string, b: string) {
  return a === b;
}

function buildGroupedTimelineRecords(items: ChoreRecordItem[]): TimelineRecordGroup[] {
  const todayKey = toJstDateKey(startOfJstDay(new Date()));
  const yesterdayKey = toJstDateKey(addDays(startOfJstDay(new Date()), -1));
  const filtered = items
    .filter((record) => !record.isInitial && !record.isSkipped)
    .slice(0, 60);
  const groups = new Map<string, ChoreRecordItem[]>();
  for (const record of filtered) {
    const key = toJstDateKey(startOfJstDay(new Date(record.performedAt)));
    const list = groups.get(key) ?? [];
    groups.set(key, [...list, record]);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dateKey, groupedItems]) => ({
      dateKey,
      label: isSameDateKey(dateKey, todayKey)
        ? "今日"
        : isSameDateKey(dateKey, yesterdayKey)
          ? "昨日"
          : (() => {
            const [, m, d] = dateKey.split("-").map(Number);
            return `${m}/${d}`;
          })(),
      items: groupedItems.sort(
        (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime(),
      ),
    }));
}

export function ActivityScreen({ boot, onReaction }: Props) {
  const [reactionPickerRecordId, setReactionPickerRecordId] = useState<string | null>(null);
  const [reactionUpdatingId, setReactionUpdatingId] = useState<string | null>(null);
  const [fullRecords, setFullRecords] = useState<ChoreRecordItem[] | null>(null);

  const sessionUser = boot.sessionUser;
  const chores = boot.chores;

  // Fetch full records (200 items) from /api/records on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ records: ChoreRecordItem[] }>("/api/records");
        if (!cancelled) {
          setFullRecords(data.records);
        }
      } catch {
        // Fall back to boot.recentRecords
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Use full records if available, otherwise fall back to bootstrap recentRecords
  const records = fullRecords ?? boot.recentRecords ?? [];

  const groupedTimelineRecords = useMemo(
    () => buildGroupedTimelineRecords(records),
    [records],
  );

  const toggleReaction = useCallback(
    async (record: ChoreRecordItem, emoji: (typeof REACTION_CHOICES)[number]) => {
      if (!sessionUser) return;
      if (reactionUpdatingId === record.id) return;
      setReactionUpdatingId(record.id);
      try {
        onReaction(record.id, emoji);
      } finally {
        setReactionUpdatingId(null);
      }
    },
    [onReaction, reactionUpdatingId, sessionUser],
  );

  const renderTimelineRecords = (
    timelineGroups: TimelineRecordGroup[],
    emptyMessage: string,
    showReactions = false,
  ) => {
    if (timelineGroups.length === 0) {
      return (
        <div className="rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-10 text-center">
          <p className="text-[16px] font-bold text-[var(--foreground)]">
            まだ きろく がありません
          </p>
          <p className="mt-2 text-[13px] font-medium text-[var(--muted-foreground)]">
            {emptyMessage}
          </p>
        </div>
      );
    }

    return timelineGroups.map((group) => (
      <div key={`record-group-${group.dateKey}`} className="space-y-2">
        <p className="text-[16px] font-bold text-[var(--foreground)]">{group.label}</p>
        <div className="space-y-2">
          {group.items.map((record) => {
            const choreForIcon = chores.find((ch) => ch.id === record.chore.id);
            const RecordIcon = iconByName(choreForIcon?.icon ?? "sparkles");
            const myReaction = showReactions
              ? (record.reactions ?? []).find((reaction) => reaction.userId === sessionUser?.id)
              : undefined;
            const reactionCounts = showReactions
              ? (record.reactions ?? []).reduce<Record<string, number>>((acc, reaction) => {
                return { ...acc, [reaction.emoji]: (acc[reaction.emoji] ?? 0) + 1 };
              }, {})
              : {};
            const visibleReactions = showReactions
              ? REACTION_CHOICES.filter((emoji) => (reactionCounts[emoji] ?? 0) > 0)
              : [];

            return (
              <div key={record.id} className="space-y-1">
                <div className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <RecordIcon
                      size={16}
                      color={choreForIcon?.iconColor ?? "var(--muted-foreground)"}
                    />
                    <p className="text-[15px] font-bold text-[var(--foreground)]">
                      {record.chore.title}
                    </p>
                    <span className="text-[12px] text-[var(--app-text-tertiary)]">
                      {"──"}
                    </span>
                    <p className="text-[13px] font-semibold text-[var(--muted-foreground)]">
                      {record.user.name}
                    </p>
                    <p className="ml-auto text-[11px] font-medium text-[var(--app-text-tertiary)]">
                      {new Intl.DateTimeFormat("ja-JP", {
                        timeZone: "Asia/Tokyo",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(record.performedAt))}
                    </p>
                  </div>
                  {record.memo ? (
                    <p className="mt-1 text-[12px] font-medium text-[var(--muted-foreground)]">
                      {"「"}{record.memo}{"」"}
                    </p>
                  ) : null}
                  {record.comments && record.comments.length > 0 ? (
                    <div className="mt-1.5 space-y-1">
                      {record.comments.map((comment) => (
                        <div
                          key={comment.id}
                          className="flex items-start gap-1.5 text-[12px]"
                        >
                          <span className="material-symbols-rounded text-[14px] text-[var(--muted-foreground)]">
                            chat_bubble
                          </span>
                          <span className="font-semibold text-[var(--muted-foreground)]">
                            {comment.userName ?? "不明"}
                          </span>
                          <span className="font-medium text-[var(--foreground)]">
                            {comment.body}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {showReactions ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 px-1">
                      {visibleReactions.map((emoji) => {
                        const mapped = REACTION_ICON_MAP[emoji];
                        const selected = myReaction?.emoji === emoji;
                        const count = reactionCounts[emoji] ?? 0;
                        return (
                          <button
                            key={`${record.id}-${emoji}`}
                            type="button"
                            onClick={() => {
                              void toggleReaction(record, emoji);
                            }}
                            disabled={reactionUpdatingId === record.id}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-bold ${selected ? "bg-[var(--app-surface-soft)]" : "bg-transparent"} disabled:opacity-50`}
                          >
                            <span
                              className="material-symbols-rounded text-[18px]"
                              style={{ color: mapped?.color ?? "var(--muted-foreground)" }}
                            >
                              {mapped?.icon ?? "add_reaction"}
                            </span>
                            {count > 1 ? (
                              <span className="text-[11px] text-[var(--muted-foreground)]">
                                {count}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setReactionPickerRecordId((prev) =>
                            prev === record.id ? null : record.id,
                          );
                        }}
                        disabled={reactionUpdatingId === record.id}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-[var(--app-text-tertiary)] disabled:opacity-50"
                      >
                        <span className="material-symbols-rounded text-[18px]">
                          add_reaction
                        </span>
                      </button>
                    </div>
                    {reactionPickerRecordId === record.id ? (
                      <div className="flex items-center gap-2 px-1">
                        {REACTION_CHOICES.map((emoji) => {
                          const mapped = REACTION_ICON_MAP[emoji];
                          const selected = myReaction?.emoji === emoji;
                          return (
                            <button
                              key={`${record.id}-picker-${emoji}`}
                              type="button"
                              onClick={() => {
                                void toggleReaction(record, emoji);
                                setReactionPickerRecordId(null);
                              }}
                              disabled={reactionUpdatingId === record.id}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${selected ? "bg-[var(--app-surface-soft)]" : "bg-[var(--card)]"} disabled:opacity-50`}
                            >
                              <span
                                className="material-symbols-rounded text-[18px]"
                                style={{ color: mapped.color }}
                              >
                                {mapped.icon}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    ));
  };

  return (
    <div className="space-y-5 pt-2">
      {renderTimelineRecords(
        groupedTimelineRecords,
        "家事を完了するとここにタイムライン表示されます。",
        true,
      )}
    </div>
  );
}
