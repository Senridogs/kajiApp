"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Flame, KeyRound, Loader2, Minus, Pencil, Ticket, Trash2, Undo2, User, Users } from "lucide-react";

import { darkenColor, iconByName } from "@/components/kaji/helpers";
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
      className={`h-[28px] w-[28px] rounded-full ${selected ? "ring-2 ring-[#1A9BE8] ring-offset-1" : ""}`}
      style={{ backgroundColor: color, border: color === "#FFFFFF" ? "1px solid #DADCE0" : "none" }}
      aria-label={color}
    />
  );
}

export function ScreenTitle({ title }: { title: string }) {
  return <h1 className="text-[26px] font-bold leading-none text-[#202124]">{title}</h1>;
}

export function HomeSectionTitle({ title }: { title: string }) {
  return <h2 className="text-[22px] font-bold leading-none text-[#202124]">{title}</h2>;
}

export function HomeTaskRow({
  chore,
  onRecord,
  onUndo,
  meta,
  assigneeName,
  assigneeColor,
  performerColor,
  recordDisabled = false,
  isUpdating = false,
}: {
  chore: ChoreWithComputed;
  onRecord: (chore: ChoreWithComputed) => void;
  onUndo?: (chore: ChoreWithComputed) => void;
  meta?: string;
  assigneeName?: string | null;
  assigneeColor?: string | null;
  performerColor?: string | null;
  recordDisabled?: boolean;
  isUpdating?: boolean;
}) {
  const done = chore.doneToday;
  const skipped = chore.lastRecordSkipped;
  const title = chore.title;
  const disableRecordAction = isUpdating || (!done && recordDisabled);
  const actorName = done ? (chore.lastPerformerName ?? assigneeName ?? null) : assigneeName;
  const actorLabel = done ? (skipped ? null : "実施者") : "担当者";
  const actorColor = done ? (skipped ? "#BDC1C6" : (performerColor ?? "#1A9BE8")) : (assigneeColor ?? "#BDC1C6");

  // Compact chip styles tuned for two-column home layout.
  let containerStyle: React.CSSProperties = { backgroundColor: "#FFFFFF", borderColor: "#E5EAF0" };
  let titleColor = chore.isOverdue ? "#D93025" : "#202124";
  let checkboxStyle: React.CSSProperties = {
    borderColor: "#AAB3BC",
    backgroundColor: "white",
    borderWidth: 2,
  };

  if (done) {
    if (skipped) {
      containerStyle = { backgroundColor: "#F1F3F4", borderColor: "#DADCE0" };
      titleColor = "#5F6368";
      checkboxStyle = { backgroundColor: "#BDC1C6", borderColor: "#BDC1C6", borderWidth: 2 };
    } else {
      containerStyle = {
        backgroundColor: `${actorColor}14`,
        borderColor: `${actorColor}4D`,
      };
      titleColor = darkenColor(actorColor, 20);
      checkboxStyle = { backgroundColor: actorColor, borderColor: actorColor, borderWidth: 2 };
    }
  } else if (assigneeColor) {
    checkboxStyle = { borderColor: assigneeColor, backgroundColor: "white", borderWidth: 2 };
  }

  return (
    <div
      className="flex w-full items-center gap-2 rounded-[12px] border px-[8px] py-[7px] text-left"
      style={containerStyle}
    >
      <IconBadge icon={chore.icon} iconColor={chore.iconColor} bgColor={chore.bgColor} size={24} iconSize={13} />
      <div className="min-w-0 flex-1 space-y-[1px]">
        <div className="flex items-center gap-1">
          <p
            className="truncate text-[12px] font-bold leading-tight"
            style={{ color: titleColor }}
          >
            {title}
          </p>
          {chore.isOverdue && !done && (
            <Flame size={10} className="fill-[#D93025] text-[#D93025]" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {actorLabel && (
            <p className={`truncate text-[9px] font-semibold ${actorName ? "" : "text-[#BDC1C6]"}`} style={actorName ? { color: actorColor } : {}}>
              {actorLabel}:
            </p>
          )}
          {actorName ? (
            <div className="flex items-center gap-0.5" style={{ color: actorColor }}>
              <span className="truncate text-[9px] font-bold">
                {actorName}
              </span>
            </div>
          ) : (
            <span className="text-[9px] font-semibold text-[#BDC1C6]">未設定</span>
          )}
        </div>
        {meta ? <p className="truncate text-[9px] font-medium text-[#5F6368]">{meta}</p> : null}
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
                ? `${chore.title}は明日チェックできません`
                : `${chore.title}を完了にする`
        }
        aria-pressed={done}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all active:scale-105 motion-safe:active:animate-[checkBounce_260ms_ease-out] ${isUpdating
          ? "border-[#DADCE0] bg-[#F1F3F4]"
          : done
            ? "text-white"
            : disableRecordAction
              ? "border-[#DADCE0] bg-[#F1F3F4]"
              : "hover:border-[#1A9BE8]"
          }`}
        style={isUpdating ? undefined : checkboxStyle}
      >
        {isUpdating ? (
          <Loader2 size={12} className="animate-spin text-[#5F6368]" />
        ) : (
          <span
            className={`flex items-center justify-center transition-opacity ${done
              ? "opacity-100 motion-safe:animate-[checkPop_220ms_ease-out_both]"
              : "opacity-100"
              }`}
          >
            {skipped ? (
              <Minus size={12} strokeWidth={4} className="text-white" />
            ) : (
              <Check
                size={12}
                strokeWidth={3}
                className={done ? "text-white" : "text-[#BCC3CA]"}
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
      className="flex w-full items-center gap-[10px] rounded-[14px] bg-white p-3 text-left"
    >
      <IconBadge icon={chore.icon} iconColor={chore.iconColor} bgColor={chore.bgColor} size={26} iconSize={13} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16.8px] font-bold text-[#202124]">{chore.title}</p>
        <p className="truncate text-[13.2px] font-medium text-[#5F6368]">{meta}</p>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(chore);
        }}
        data-delete-swipe-handle="true"
        aria-label={`${chore.title}を編集`}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#A28775] hover:bg-[#F1F3F4]"
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
      className="flex w-full items-center justify-between gap-3 rounded-[14px] bg-white p-3 text-left disabled:opacity-50"
    >
      <div>
        <p className="text-[17px] font-bold text-[#202124]">{title}</p>
        {subtitle ? <p className="text-[13.2px] font-medium text-[#5F6368]">{subtitle}</p> : null}
      </div>
      <div className={`relative h-6 w-[42px] rounded-xl ${checked ? "bg-[#33C28A]" : "bg-[#E8EAED]"}`}>
        <div
          className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${checked ? "left-[21px]" : "left-[3px]"
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
    <div className="flex w-full gap-1 rounded-2xl bg-[#F1F3F4] p-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`w-full rounded-xl px-[10px] py-[9px] text-[14.4px] font-bold ${activeKey === item.key ? "bg-[#1A9BE8] text-white" : "text-[#5F6368]"
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
    <span className="inline-flex items-center gap-1 rounded-lg bg-[#E8F3EC] px-2 py-1 text-xs font-bold text-[#2C6E49]">
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
    <div className={`space-y-2 rounded-[14px] p-3.5 ${isSharing ? "bg-[#E8FBF0]" : "bg-[#EEF3FD]"}`}>
      <p className="text-[17px] font-bold text-[#202124]">
        {isSharing ? "パートナーと共有中" : "あなたの家族コード"}
      </p>
      <p className="text-[12px] font-medium text-[#5F6368]">
        {isSharing
          ? `${partnerName}さんと家事を共有しています`
          : "パートナーに共有して同じ家事を管理しよう"}
      </p>
      {isSharing && partnerName ? (
        <div className="flex items-center gap-2 rounded-[10px] bg-[#33C28A20] px-3 py-2">
          <Users size={16} className="text-[#33C28A]" />
          <span className="text-[14px] font-bold text-[#1B8A56]">{partnerName}</span>
        </div>
      ) : null}
      {inviteCode ? (
        <>
          {isSharing ? (
            <div className="flex items-center gap-1 text-[#5F6368]">
              <KeyRound size={13} />
              <span className="text-[12px] font-medium">家族コード</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <div className="rounded-[12px] border border-[#DADCE0] bg-white px-3.5 py-2.5">
              <span className="text-[22px] font-bold tracking-[4px] text-[#1A9BE8]">{inviteCode}</span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-[12px] bg-[#1A9BE8] px-3.5 py-2.5 text-[14px] font-bold text-white"
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
    <div className="space-y-2.5 rounded-[14px] border border-[#DADCE0] bg-white p-3.5">
      <div className="flex items-center gap-1.5">
        <Ticket size={15} className="text-[#5F6368]" />
        <p className="text-[15px] font-bold text-[#202124]">パートナーの家族コードで参加</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="コードを入力"
          className="w-full rounded-[12px] border border-[#DADCE0] bg-white px-3.5 py-2.5 text-[14px] font-semibold text-[#202124] outline-none placeholder:font-medium placeholder:text-[#9AA0A6]"
        />
        <button
          type="button"
          onClick={handleJoin}
          disabled={!code.trim() || loading}
          className="rounded-[12px] bg-[#1A9BE8] px-3.5 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
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
        className={`absolute inset-0 flex items-center justify-end rounded-[14px] px-5 ${pastThreshold ? "bg-[#D45858]" : "bg-[#E88585]"
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
      <div className="animate-[slideDown_300ms_ease-out] overflow-hidden rounded-2xl bg-[#323232] shadow-lg">
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="flex-1 text-[14px] font-medium text-white">{message}</p>
          <button
            type="button"
            onClick={handleUndo}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[14px] font-bold text-[#4FC3F7] active:bg-white/10"
          >
            <Undo2 size={14} />
            取り消す
          </button>
        </div>
        <div className="h-[3px] w-full bg-white/10">
          <div
            className="h-full bg-[#4FC3F7] transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

