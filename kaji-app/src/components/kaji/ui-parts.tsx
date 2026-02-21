"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Flame, KeyRound, Loader2, Minus, Pencil, Ticket, Trash2, Undo2, User, Users } from "lucide-react";

import { iconByName } from "@/components/kaji/helpers";
import { useSwipeDelete } from "@/components/kaji/use-swipe-delete";
import { ChoreWithComputed } from "@/lib/types";

export function IconBadge({
  icon,
  iconColor,
  bgColor,
  size = 38,
  iconSize = 16,
}: {
  icon: string;
  iconColor: string;
  bgColor: string;
  size?: number;
  iconSize?: number;
}) {
  const iconComponent = iconByName(icon);
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: bgColor }}
    >
      {React.createElement(iconComponent, { size: iconSize, color: iconColor })}
    </div>
  );
}

export function ColorDot({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[28px] w-[28px] rounded-full ${selected ? "ring-2 ring-[var(--primary)] ring-offset-1" : ""}`}
      style={{ backgroundColor: color, border: color === "#FFFFFF" ? "1px solid var(--border)" : "none" }}
      aria-label={color}
    />
  );
}

export function ScreenTitle({ title }: { title: string }) {
  return <h1 className="text-[26px] font-bold leading-none text-[var(--foreground)]">{title}</h1>;
}

export function HomeSectionTitle({ title }: { title: string }) {
  return <h2 className="text-[22px] font-bold leading-none text-[var(--foreground)]">{title}</h2>;
}

export function HomeTaskRow({
  chore,
  state,
  onRecord,
  onUndo,
  progressLabel,
  recordDisabled = false,
  isUpdating = false,
}: {
  chore: ChoreWithComputed;
  state?: "pending" | "done" | "skipped";
  onRecord: (chore: ChoreWithComputed) => void;
  onUndo?: (chore: ChoreWithComputed) => void;
  progressLabel?: string;
  recordDisabled?: boolean;
  isUpdating?: boolean;
}) {
  const resolvedState = state ?? (chore.doneToday ? (chore.lastRecordSkipped ? "skipped" : "done") : "pending");
  const done = resolvedState !== "pending";
  const skipped = resolvedState === "skipped";
  const title = chore.title;
  const disableRecordAction = isUpdating || (!done && recordDisabled);

  let containerStyle: React.CSSProperties = { backgroundColor: "var(--card)", borderColor: "var(--border)" };
  let titleColor = chore.isOverdue ? 'var(--destructive)' : 'var(--foreground)';
  let checkboxStyle: React.CSSProperties = {
    borderColor: 'var(--app-text-tertiary)',
    backgroundColor: "var(--card)",
    borderWidth: 2,
  };

  if (done) {
    if (skipped) {
      containerStyle = { backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' };
      titleColor = 'var(--muted-foreground)';
      checkboxStyle = { backgroundColor: 'var(--app-text-tertiary)', borderColor: 'var(--app-text-tertiary)', borderWidth: 2 };
    } else {
      containerStyle = {
        backgroundColor: 'var(--app-surface-soft)',
        borderColor: 'var(--primary)',
      };
      titleColor = "var(--primary)";
      checkboxStyle = { backgroundColor: 'var(--primary)', borderColor: 'var(--primary)', borderWidth: 2 };
    }
  }

  return (
    <div
      className="flex w-full items-center gap-2 rounded-[12px] border px-[10px] py-[9px] text-left"
      style={containerStyle}
    >
      <IconBadge icon={chore.icon} iconColor={chore.iconColor} bgColor={chore.bgColor} size={24} iconSize={13} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p
            className="truncate text-[15px] font-bold leading-tight"
            style={{ color: titleColor }}
          >
            {title}
          </p>
          {progressLabel ? (
            <span className="shrink-0 text-[10px] font-semibold text-[var(--muted-foreground)]">{progressLabel}</span>
          ) : null}
          {chore.isOverdue && !done ? (
            <Flame size={10} className="fill-[var(--destructive)] text-[var(--destructive)]" />
          ) : null}
        </div>
      </div>
      <button
        type="button"
        disabled={disableRecordAction}
        onClick={(e) => {
          e.stopPropagation();
          if (done) {
            onUndo?.(chore);
            return;
          }
          if (disableRecordAction) return;
          onRecord(chore);
        }}
        aria-label={
          isUpdating
            ? `${chore.title}を更新中`
            : done
              ? `${chore.title}の記録を取り消す`
              : disableRecordAction
                ? `${chore.title}は記録できません`
                : `${chore.title}を完了にする`
        }
        aria-pressed={done}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all active:scale-105 motion-safe:active:animate-[checkBounce_260ms_ease-out] ${isUpdating
          ? 'border-[var(--border)] bg-[var(--secondary)]'
          : done
            ? 'text-white'
            : disableRecordAction
              ? 'border-[var(--border)] bg-[var(--secondary)]'
              : 'hover:border-[var(--primary)]'
          }`}
        style={isUpdating ? undefined : checkboxStyle}
      >
        {isUpdating ? (
          <Loader2 size={12} className="animate-spin text-[var(--muted-foreground)]" />
        ) : (
          <span
            className={`flex items-center justify-center transition-opacity ${done
              ? 'opacity-100 motion-safe:animate-[checkPop_220ms_ease-out_both]'
              : 'opacity-100'
              }`}
          >
            {skipped ? (
              <Minus size={12} strokeWidth={4} className="text-white" />
            ) : (
              <Check
                size={12}
                strokeWidth={3}
                className={done ? 'text-white' : 'text-[var(--app-text-tertiary)]'}
              />
            )}
          </span>
        )}
      </button>
    </div>
  );
}

export function ListChoreRow({
  chore,
  meta,
  onOpenHistory,
  onEdit,
}: {
  chore: ChoreWithComputed;
  meta: string;
  onOpenHistory: (chore: ChoreWithComputed) => void;
  onEdit: (chore: ChoreWithComputed) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenHistory(chore)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpenHistory(chore);
      }}
      className="flex w-full items-center gap-[10px] rounded-[14px] bg-[var(--card)] p-3 text-left"
    >
      <IconBadge icon={chore.icon} iconColor={chore.iconColor} bgColor={chore.bgColor} size={26} iconSize={13} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16.8px] font-bold text-[var(--foreground)]">{chore.title}</p>
        <p className="truncate text-[13.2px] font-medium text-[var(--muted-foreground)]">{meta}</p>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(chore);
        }}
        data-delete-swipe-handle="true"
        aria-label={`${chore.title}を編集`}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
      >
        <Pencil size={16} />
      </button>
    </div>
  );
}

export function SettingToggleRow({
  title,
  subtitle,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-3 rounded-[14px] bg-[var(--card)] p-3 text-left disabled:opacity-50"
    >
      <div>
        <p className="text-[17px] font-bold text-[var(--foreground)]">{title}</p>
        {subtitle ? <p className="text-[13.2px] font-medium text-[var(--muted-foreground)]">{subtitle}</p> : null}
      </div>
      <div className={`relative h-6 w-[42px] rounded-xl ${checked ? "bg-[var(--primary)]" : "bg-[var(--secondary)]"}`}>
        <div
          className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-[var(--card)] transition-all ${checked ? "left-[21px]" : "left-[3px]"
            }`}
        />
      </div>
    </button>
  );
}

export function SegmentedFilter({
  items,
  activeKey,
  onChange,
}: {
  items: Array<{ key: string; label: string }>;
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex w-full gap-1 rounded-2xl bg-[var(--secondary)] p-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`w-full rounded-xl px-[10px] py-[9px] text-[14.4px] font-bold ${activeKey === item.key ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"
            }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function DoneBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--app-surface-soft)] px-2 py-1 text-xs font-bold text-[var(--primary)]">
      <Check size={11} />
      実施済み
    </span>
  );
}

export function FamilyCodeCard({
  inviteCode,
  partnerName,
}: {
  inviteCode: string | null;
  partnerName: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const isSharing = Boolean(partnerName);

  const handleCopy = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className={`space-y-2 rounded-[14px] p-3.5 ${isSharing ? "bg-[var(--app-surface-soft)]" : "bg-[var(--secondary)]"}`}>
      <p className="text-[17px] font-bold text-[var(--foreground)]">
        {isSharing ? "パートナーと共有中" : "あなたの家族コード"}
      </p>
      <p className="text-[12px] font-medium text-[var(--muted-foreground)]">
        {isSharing
          ? `${partnerName}さんと家事を共有しています`
          : "パートナーに共有して同じ家事を管理しよう"}
      </p>
      {isSharing && partnerName ? (
        <div className="flex items-center gap-2 rounded-[10px] bg-[var(--app-surface-soft)] px-3 py-2">
          <Users size={16} className="text-[var(--primary)]" />
          <span className="text-[14px] font-bold text-[var(--primary)]">{partnerName}</span>
        </div>
      ) : null}
      {inviteCode ? (
        <>
          {isSharing ? (
            <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
              <KeyRound size={13} />
              <span className="text-[12px] font-medium">家族コード</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5">
              <span className="text-[22px] font-bold tracking-[4px] text-[var(--primary)]">{inviteCode}</span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-[12px] bg-[var(--primary)] px-3.5 py-2.5 text-[14px] font-bold text-white"
            >
              <Copy size={16} />
              {copied ? "コピー済み" : "コピー"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function JoinHouseholdCard({
  onJoin,
}: {
  onJoin: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!code.trim() || loading) return;
    setLoading(true);
    try {
      await onJoin(code.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2.5 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-3.5">
      <div className="flex items-center gap-1.5">
        <Ticket size={15} className="text-[var(--muted-foreground)]" />
        <p className="text-[15px] font-bold text-[var(--foreground)]">パートナーの家族コードで参加</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="コードを入力"
          className="w-full rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-[14px] font-semibold text-[var(--foreground)] outline-none placeholder:font-medium placeholder:text-[var(--app-text-tertiary)]"
        />
        <button
          type="button"
          onClick={handleJoin}
          disabled={!code.trim() || loading}
          className="rounded-[12px] bg-[var(--primary)] px-3.5 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
        >
          参加
        </button>
      </div>
    </div>
  );
}

export function SwipableListChoreRow({
  chore,
  meta,
  onOpenHistory,
  onEdit,
  onSwipeDelete,
  onDeleteSwipeActiveChange,
  relaxedSwipeStart = false,
}: {
  chore: ChoreWithComputed;
  meta: string;
  onOpenHistory: (chore: ChoreWithComputed) => void;
  onEdit: (chore: ChoreWithComputed) => void;
  onSwipeDelete: (chore: ChoreWithComputed) => void;
  onDeleteSwipeActiveChange?: (active: boolean) => void;
  relaxedSwipeStart?: boolean;
}) {
  const handleDelete = useCallback(() => {
    onSwipeDelete(chore);
  }, [chore, onSwipeDelete]);

  const deleteSwipeActiveRef = useRef(false);
  const updateDeleteSwipeActive = useCallback((active: boolean) => {
    if (deleteSwipeActiveRef.current === active) return;
    deleteSwipeActiveRef.current = active;
    onDeleteSwipeActiveChange?.(active);
  }, [onDeleteSwipeActiveChange]);

  const canStartDeleteSwipe = useCallback((event: React.TouchEvent) => {
    if (relaxedSwipeStart) {
      const touch = event.touches[0];
      const rect = event.currentTarget.getBoundingClientRect();
      return touch.clientX >= rect.left + rect.width / 2;
    }
    const target = event.target as Element | null;
    return Boolean(target?.closest("[data-delete-swipe-handle='true']"));
  }, [relaxedSwipeStart]);

  useEffect(() => () => updateDeleteSwipeActive(false), [updateDeleteSwipeActive]);

  const { offsetX, swiping, handlers } = useSwipeDelete({
    threshold: 100,
    startPredicate: canStartDeleteSwipe,
    onDelete: handleDelete,
  });

  const showDeleteHint = offsetX < -40;
  const pastThreshold = offsetX < -100;

  return (
    <div className="relative mx-auto w-[95%] overflow-hidden rounded-[14px]">
      <div
        className={`absolute inset-0 flex items-center justify-end rounded-[14px] px-5 ${pastThreshold ? "bg-[var(--destructive)]" : "bg-[var(--destructive)]"
          }`}
      >
        <div
          className={`flex items-center gap-1.5 text-white transition-opacity ${showDeleteHint ? "opacity-100" : "opacity-0"
            }`}
        >
          <Trash2 size={18} />
          <span className="text-[13px] font-bold">削除</span>
        </div>
      </div>
      <div
        onTouchStart={(event) => {
          updateDeleteSwipeActive(false);
          handlers.onTouchStart(event);
        }}
        onTouchMove={(event) => {
          const consumed = handlers.onTouchMove(event);
          if (!consumed) {
            updateDeleteSwipeActive(false);
            return;
          }
          updateDeleteSwipeActive(true);
          event.stopPropagation();
        }}
        onTouchEnd={(event) => {
          const consumed = handlers.onTouchEnd();
          updateDeleteSwipeActive(false);
          if (consumed) {
            event.stopPropagation();
          }
        }}
        onTouchCancel={(event) => {
          const consumed = handlers.onTouchCancel();
          updateDeleteSwipeActive(false);
          if (consumed) {
            event.stopPropagation();
          }
        }}
        onClickCapture={handlers.onClickCapture}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 300ms ease-out",
        }}
      >
        <ListChoreRow
          chore={chore}
          meta={meta}
          onOpenHistory={onOpenHistory}
          onEdit={onEdit}
        />
      </div>
    </div>
  );
}

const UNDO_TOAST_DURATION = 5000;

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  offsetY = 0,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  offsetY?: number;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / UNDO_TOAST_DURATION) * 100);
      setProgress(remaining);
    }, 50);

    timerRef.current = setTimeout(() => {
      clearInterval(interval);
      onDismissRef.current();
    }, UNDO_TOAST_DURATION);

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleUndo = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onUndo();
  };

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[9999] mx-auto max-w-[430px] px-4 pt-[env(safe-area-inset-top,12px)]"
      style={{ transform: `translateY(${offsetY}px)` }}
    >
      <div className="animate-[slideDown_300ms_ease-out] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="flex-1 text-[14px] font-medium text-[var(--foreground)]">{message}</p>
          <button
            type="button"
            onClick={handleUndo}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[14px] font-bold text-[var(--primary)] active:bg-[var(--secondary)]"
          >
            <Undo2 size={14} />
            取り消す
          </button>
        </div>
        <div className="h-[3px] w-full bg-[var(--secondary)]">
          <div
            className="h-full bg-[var(--primary)] transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}




