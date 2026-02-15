"use client";

import React, { useState } from "react";
import { Check, Copy, KeyRound, Pencil, Ticket, Users } from "lucide-react";

import { iconByName } from "@/components/kaji/helpers";
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
      className={`h-[22px] w-[22px] rounded-full ${selected ? "ring-2 ring-[#1A9BE8] ring-offset-1" : ""}`}
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
  onOpenHistory,
  meta,
}: {
  chore: ChoreWithComputed;
  onRecord: (chore: ChoreWithComputed) => void;
  onUndo?: (chore: ChoreWithComputed) => void;
  onOpenHistory?: (chore: ChoreWithComputed) => void;
  meta?: string;
}) {
  const done = chore.doneToday;
  const title = done ? `${chore.title}（実施済み）` : chore.title;

  return (
    <div
      onClick={() => onOpenHistory?.(chore)}
      className={`flex w-full items-center gap-[15px] rounded-xl border px-[10px] py-[8px] text-left ${done ? "border-[#CFEAD8] bg-[#F2FAF5]" : "border-[#E5EAF0] bg-white"
        }`}
    >
      {done ? (
        <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#33C28A]">
          <Check size={21} className="text-white" />
        </div>
      ) : (
        <IconBadge icon={chore.icon} iconColor={chore.iconColor} bgColor={chore.bgColor} size={42} iconSize={21} />
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15.2px] font-bold ${done ? "text-[#2C6E49]" : "text-[#202124]"}`}>
          {title}
        </p>
        {chore.lastPerformerName ? (
          <p className="truncate text-[11px] font-medium text-[#9AA0A6]">
            前回: {chore.lastPerformerName}
          </p>
        ) : null}
        {meta ? <p className="truncate text-[10.4px] font-medium text-[#5F6368]">{meta}</p> : null}
      </div>
      {done ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUndo?.(chore);
          }}
          className="rounded-[15px] border border-[#A7DCC0] bg-white px-[13px] py-[9px] text-[13.6px] font-bold text-[#2C6E49]"
        >
          取消
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRecord(chore);
          }}
          className="rounded-[15px] bg-[#1A9BE8] px-[13px] py-[9px] text-[13.6px] font-bold text-white"
        >
          記録
        </button>
      )}
    </div>
  );
}

export function ListChoreRow({
  chore,
  meta,
  onEdit,
}: {
  chore: ChoreWithComputed;
  meta: string;
  onEdit: (chore: ChoreWithComputed) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onEdit(chore)}
      className="flex w-full items-center gap-[10px] rounded-[14px] bg-white p-3 text-left"
    >
      <IconBadge icon={chore.icon} iconColor={chore.iconColor} bgColor={chore.bgColor} size={26} iconSize={13} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16.8px] font-bold text-[#202124]">{chore.title}</p>
        <p className="truncate text-[13.2px] font-medium text-[#5F6368]">{meta}</p>
      </div>
      <Pencil size={16} className="text-[#A28775]" />
    </button>
  );
}

export function SettingToggleRow({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-[14px] bg-white p-3 text-left"
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
