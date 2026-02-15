"use client";

import { useMemo, useRef, useState } from "react";
import { Calendar, Minus, Plus } from "lucide-react";

import {
  BG_COLOR_PALETTE,
  ICON_COLOR_PALETTE,
  ICONS_PER_PAGE,
  QUICK_ICON_PRESETS,
  getIconPages,
} from "@/components/kaji/constants";
import { iconByName } from "@/components/kaji/helpers";
import { ColorDot, IconBadge } from "@/components/kaji/ui-parts";

export type ChoreForm = {
  id?: string;
  title: string;
  intervalDays: number;
  isBigTask: boolean;
  icon: string;
  iconColor: string;
  bgColor: string;
  lastPerformedAt?: string | null;
};

export type CustomIconOption = {
  id: string;
  label: string;
  icon: string;
  iconColor: string;
  bgColor: string;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toDateInputValueInJst(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const year = String(jst.getUTCFullYear());
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoFromJstDateInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00+09:00`).toISOString();
}

export function ChoreEditor({
  mode,
  value,
  customIcons,
  onChange,
  onSave,
  onDelete,
  onOpenCustomIcon,
}: {
  mode: "create" | "edit";
  value: ChoreForm;
  customIcons: CustomIconOption[];
  onChange: (next: ChoreForm) => void;
  onSave: () => void;
  onDelete: () => void;
  onOpenCustomIcon: () => void;
}) {
  const lastPerformedDate = toDateInputValueInJst(value.lastPerformedAt);
  const maxDate = toDateInputValueInJst(new Date().toISOString());

  return (
    <div className="space-y-3 pb-2">
      <div>
        <p className="mb-1.5 text-[14.4px] font-bold text-[#5F6368]">家事名</p>
        <input
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          placeholder={mode === "create" ? "例: 玄関掃除" : ""}
          className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-[14px] py-3 text-[16.8px] font-semibold text-[#202124] outline-none"
        />
      </div>

      <div>
        <p className="mb-1.5 text-[14.4px] font-bold text-[#5F6368]">リマインド間隔</p>
        <div className="flex items-center justify-between rounded-[14px] border border-[#DADCE0] bg-white px-3 py-2.5">
          <button
            type="button"
            onClick={() => onChange({ ...value, intervalDays: Math.max(1, value.intervalDays - 1) })}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#F1F3F4]"
          >
            <Minus size={16} className="text-[#6F5A4B]" />
          </button>
          <p className="text-[16.8px] font-bold text-[#202124]">{value.intervalDays}日ごと</p>
          <button
            type="button"
            onClick={() => onChange({ ...value, intervalDays: Math.min(365, value.intervalDays + 1) })}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#1A9BE8]"
          >
            <Plus size={16} className="text-white" />
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[14.4px] font-bold text-[#5F6368]">
          {mode === "create" ? "前回実施日時（任意）" : "前回実施日時"}
        </p>
        <div className="relative">
          <Calendar
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A28775]"
          />
          <input
            type="date"
            value={lastPerformedDate}
            onChange={(e) => {
              const next = toIsoFromJstDateInput(e.target.value);
              onChange({ ...value, lastPerformedAt: next });
            }}
            onKeyDown={(e) => e.preventDefault()}
            onPaste={(e) => e.preventDefault()}
            inputMode="none"
            max={maxDate}
            aria-label="last-performed-date"
            className="w-full rounded-[14px] border border-[#DADCE0] bg-white py-3 pl-10 pr-3 text-[16.8px] font-semibold text-[#202124] outline-none"
          />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[14.4px] font-bold text-[#5F6368]">アイコン</p>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {QUICK_ICON_PRESETS.map((preset) => {
              const selected = value.icon === preset.icon;
              const Icon = iconByName(preset.icon);
              return (
                <button
                  key={`preset-${preset.icon}`}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      icon: preset.icon,
                      iconColor: preset.iconColor,
                      bgColor: preset.bgColor,
                    })
                  }
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-[10px] py-[9px] ${
                    selected ? "bg-[#FFF6E3]" : "bg-[#F5F5F5]"
                  }`}
                >
                  <Icon size={14} color={preset.iconColor} />
                  <span className="text-[13.2px] font-bold" style={{ color: preset.iconColor }}>
                    {preset.label}
                  </span>
                </button>
              );
            })}

            {customIcons.map((custom) => {
              const selected =
                value.icon === custom.icon &&
                value.iconColor === custom.iconColor &&
                value.bgColor === custom.bgColor;
              const Icon = iconByName(custom.icon);
              return (
                <button
                  key={custom.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      icon: custom.icon,
                      iconColor: custom.iconColor,
                      bgColor: custom.bgColor,
                    })
                  }
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-[10px] py-[9px] ${
                    selected ? "bg-[#EEF3FF]" : "bg-[#F5F5F5]"
                  }`}
                >
                  <Icon size={14} color={custom.iconColor} />
                  <span className="truncate text-[13.2px] font-bold" style={{ color: custom.iconColor }}>
                    {custom.label}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenCustomIcon}
            className="w-full rounded-xl border border-[#DADCE0] bg-white px-3 py-[10px] text-[13.2px] font-bold text-[#5F6368]"
          >
            ＋ カスタムアイコン
          </button>
          {customIcons.length > 0 ? (
            <p className="text-center text-[12px] font-medium text-[#5F6368]">
              追加済み: {customIcons.length} 件
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[14.4px] font-bold text-[#5F6368]">大仕事フラグ</p>
        <button
          type="button"
          onClick={() => onChange({ ...value, isBigTask: !value.isBigTask })}
          className="flex w-full items-center justify-between rounded-[14px] border border-[#DADCE0] bg-white p-3 text-left"
        >
          <div>
            <p className="text-[13px] font-bold text-[#202124]">大仕事として扱う</p>
            {mode === "edit" ? (
              <p className="text-[11.5px] font-medium text-[#5F6368]">ONだとHomeの大仕事に表示</p>
            ) : null}
          </div>
          <div
            className={`relative h-6 w-[42px] rounded-xl ${
              value.isBigTask ? "bg-[#33C28A]" : "bg-[#E8EAED]"
            }`}
          >
            <div
              className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${
                value.isBigTask ? "left-[21px]" : "left-[3px]"
              }`}
            />
          </div>
        </button>
      </div>

      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          className="w-full rounded-[14px] bg-[#1A9BE8] px-4 py-3 text-[15.6px] font-bold text-white"
        >
          {mode === "create" ? "家事を追加" : "変更を保存"}
        </button>
        {mode === "edit" ? (
          <button
            type="button"
            onClick={onDelete}
            className="w-full rounded-[14px] border border-[#F2C9C9] bg-white px-4 py-3 text-[15.6px] font-bold text-[#D45858]"
          >
            家事を削除
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CustomIconPicker({
  value,
  onChange,
  onApply,
}: {
  value: ChoreForm;
  onChange: (next: ChoreForm) => void;
  onApply: (next: CustomIconOption) => void;
}) {
  const iconPages = useMemo(() => getIconPages(), []);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [customName, setCustomName] = useState("");

  return (
    <div className="space-y-[10px] pb-2">
      <div>
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="例: デスクまわり"
          className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-[14px] py-3 text-[15.6px] font-medium text-[#202124] outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <div
          ref={viewportRef}
          onScroll={(e) => {
            const node = e.currentTarget;
            const next = Math.round(node.scrollLeft / node.clientWidth);
            setActivePage(Math.max(0, Math.min(iconPages.length - 1, next)));
          }}
          className="snap-x snap-mandatory overflow-x-auto"
        >
          <div className="flex gap-3">
            {iconPages.map((page, pageIndex) => (
              <div key={pageIndex} className="w-full shrink-0 snap-start">
                <div className="grid grid-cols-6 gap-2">
                  {page.slice(0, ICONS_PER_PAGE).map((iconName) => {
                    const Icon = iconByName(iconName);
                    const selected = value.icon === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => onChange({ ...value, icon: iconName })}
                        className={`flex h-[36px] w-[36px] items-center justify-center rounded-[10px] border ${
                          selected ? "border-[#1A9BE8] bg-[#EEF3FF]" : "border-[#DADCE0] bg-white"
                        }`}
                      >
                        <Icon size={14} color="#202124" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center gap-1.5">
          {iconPages.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 w-1.5 rounded-full ${idx === activePage ? "bg-[#1A9BE8]" : "bg-[#DADCE0]"}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <p className="mb-1 text-xs font-bold text-[#5F6368]">アイコン色</p>
          <div className="flex flex-wrap gap-1">
            {ICON_COLOR_PALETTE.map((color) => (
              <ColorDot
                key={color}
                color={color}
                selected={value.iconColor === color}
                onClick={() => onChange({ ...value, iconColor: color })}
              />
            ))}
            <label className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full border border-[#DADCE0] text-[#5F6368]">
              <Plus size={12} />
              <input
                type="color"
                value={value.iconColor}
                onChange={(e) => onChange({ ...value, iconColor: e.target.value })}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-bold text-[#5F6368]">背景色</p>
          <div className="flex flex-wrap gap-1">
            {BG_COLOR_PALETTE.map((color) => (
              <ColorDot
                key={color}
                color={color}
                selected={value.bgColor === color}
                onClick={() => onChange({ ...value, bgColor: color })}
              />
            ))}
            <label className="flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-full border border-[#DADCE0] text-[#5F6368]">
              <Plus size={12} />
              <input
                type="color"
                value={value.bgColor}
                onChange={(e) => onChange({ ...value, bgColor: e.target.value })}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-[14px] border border-[#DADCE0] bg-white p-[10px]">
        <div className="flex justify-center">
          <IconBadge icon={value.icon} iconColor={value.iconColor} bgColor={value.bgColor} size={56} iconSize={28} />
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onApply({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: customName.trim() || "カスタム",
            icon: value.icon,
            iconColor: value.iconColor,
            bgColor: value.bgColor,
          })
        }
        className="w-full rounded-[14px] bg-[#1A9BE8] px-4 py-3 text-[15.6px] font-bold text-white"
      >
        このアイコンを追加
      </button>
    </div>
  );
}
