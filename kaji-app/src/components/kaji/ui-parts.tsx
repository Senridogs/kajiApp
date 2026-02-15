"use client";

import React from "react";
import { Check, Pencil } from "lucide-react";

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
  return <h1 className="text-[34px] font-bold leading-none text-[#202124]">{title}</h1>;
}

export function HomeSectionTitle({ title }: { title: string }) {
  return <h2 className="text-[32px] font-bold leading-none text-[#202124]">{title}</h2>;
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
      className={`flex w-full items-center gap-[15px] rounded-xl border px-[10px] py-[8px] text-left ${
        done ? "border-[#CFEAD8] bg-[#F2FAF5]" : "border-[#E5EAF0] bg-white"
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
          className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${
            checked ? "left-[21px]" : "left-[3px]"
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
          className={`w-full rounded-xl px-[10px] py-[9px] text-[14.4px] font-bold ${
            activeKey === item.key ? "bg-[#1A9BE8] text-white" : "text-[#5F6368]"
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
