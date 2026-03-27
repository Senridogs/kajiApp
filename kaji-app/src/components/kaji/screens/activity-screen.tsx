"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import type {
  BootstrapResponse,
  ChoreRecordItem,
  ChoreRecordCommentItem,
} from "@/lib/types";
import { startOfJstDay, toJstDateKey, addDays } from "@/lib/time";
import { apiFetch, iconByName } from "../helpers";
import { PRIMARY_COLOR } from "../constants";

type Props = {
  boot: BootstrapResponse;
  onReaction: (recordId: string, emoji: string) => void;
  onRefresh: () => Promise<void>;
};

const REACTION_CHOICES = ["👏", "❤️", "✨", "🎉"] as const;
const REACTION_ICON_MAP: Record<(typeof REACTION_CHOICES)[number], { icon: string; color: string }> = {
  "👏": { icon: "thumb_up", color: PRIMARY_COLOR },
  "❤️": { icon: "favorite", color: PRIMARY_COLOR },
  "✨": { icon: "celebration", color: PRIMARY_COLOR },
  "🎉": { icon: "star", color: PRIMARY_COLOR },
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
  const [commentOpenRecordId, setCommentOpenRecordId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentPostingId, setCommentPostingId] = useState<string | null>(null);
  const [commentDeletingId, setCommentDeletingId] = useState<string | null>(null);

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

  const toggleCommentInput = useCallback(
    (recordId: string) => {
      setCommentOpenRecordId((prev) => {
        if (prev === recordId) return null;
        setCommentText("");
        return recordId;
      });
    },
    [],
  );

  const postComment = useCallback(
    async (recordId: string) => {
      const trimmed = commentText.trim();
      if (!trimmed || !sessionUser || commentPostingId) return;
      setCommentPostingId(recordId);
      try {
        const result = await apiFetch<{ comment: ChoreRecordCommentItem }>(
          `/api/records/${recordId}/comment`,
          { method: "POST", body: JSON.stringify({ body: trimmed }) },
        );
        const newComment = result.comment;
        const updateRecords = (list: ChoreRecordItem[]) =>
          list.map((r) =>
            r.id === recordId
              ? { ...r, comments: [...(r.comments ?? []), newComment] }
              : r,
          );
        setFullRecords((prev) => (prev ? updateRecords(prev) : prev));
        setCommentText("");
      } catch {
        // エラー時は何もしない（入力はそのまま残す）
      } finally {
        setCommentPostingId(null);
      }
    },
    [commentText, sessionUser, commentPostingId],
  );

  const deleteComment = useCallback(
    async (recordId: string, commentId: string) => {
      if (commentDeletingId) return;
      setCommentDeletingId(commentId);
      try {
        await apiFetch(
          `/api/records/${recordId}/comment`,
          { method: "DELETE", body: JSON.stringify({ commentId }) },
        );
        const updateRecords = (list: ChoreRecordItem[]) =>
          list.map((r) =>
            r.id === recordId
              ? { ...r, comments: (r.comments ?? []).filter((c) => c.id !== commentId) }
              : r,
          );
        setFullRecords((prev) => (prev ? updateRecords(prev) : prev));
      } catch {
        // エラー時は何もしない
      } finally {
        setCommentDeletingId(null);
      }
    },
    [commentDeletingId],
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
                    <div className="mt-2 space-y-1.5">
                      {record.comments.map((comment) => (
                        <div
                          key={comment.id}
                          className="group flex items-start gap-1.5 text-[12px]"
                        >
                          <span className="material-symbols-rounded mt-1 text-[14px] text-[var(--muted-foreground)]">
                            chat_bubble
                          </span>
                          <div className="flex-1 rounded-2xl rounded-tl-md bg-[var(--app-surface-soft)] px-3 py-1.5">
                            <span className="font-semibold text-[var(--muted-foreground)]">
                              {comment.userName ?? "不明"}
                            </span>
                            <span className="ml-1.5 font-medium text-[var(--foreground)]">
                              {comment.body}
                            </span>
                          </div>
                          {comment.userId === sessionUser?.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                void deleteComment(record.id, comment.id);
                              }}
                              disabled={commentDeletingId === comment.id}
                              className="mt-1 flex-shrink-0 rounded-full p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--foreground)] group-hover:opacity-100 disabled:opacity-30 max-[768px]:opacity-60"
                              aria-label="コメントを削除"
                            >
                              <span className="material-symbols-rounded text-[14px]">
                                close
                              </span>
                            </button>
                          ) : null}
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
                      <button
                        type="button"
                        onClick={() => { toggleCommentInput(record.id); }}
                        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[12px] font-bold ${commentOpenRecordId === record.id ? "bg-[var(--app-surface-soft)]" : "bg-transparent"} text-[var(--app-text-tertiary)]`}
                      >
                        <span className="material-symbols-rounded text-[16px]">
                          chat_bubble
                        </span>
                        {(record.comments ?? []).length > 0 ? (
                          <span className="text-[11px]">
                            {(record.comments ?? []).length}
                          </span>
                        ) : null}
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
                    {commentOpenRecordId === record.id ? (
                      <div className="flex items-center gap-1.5 px-1">
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => {
                            if (e.target.value.length <= 500) {
                              setCommentText(e.target.value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                              void postComment(record.id);
                            }
                          }}
                          placeholder="コメントを入力..."
                          maxLength={500}
                          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                        />
                        <button
                          type="button"
                          onClick={() => { void postComment(record.id); }}
                          disabled={!commentText.trim() || commentPostingId === record.id}
                          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--app-surface-soft)] text-[var(--foreground)] disabled:opacity-30"
                          aria-label="コメントを送信"
                        >
                          <span className="material-symbols-rounded text-[18px]">
                            send
                          </span>
                        </button>
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
