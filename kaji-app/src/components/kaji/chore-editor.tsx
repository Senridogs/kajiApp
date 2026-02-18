"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";

import {
  BG_COLOR_PALETTE,
  ICON_COLOR_PALETTE,
  ICONS_PER_PAGE,
  QUICK_ICON_PRESETS,
  getIconPages,
} from "@/components/kaji/constants";
import { darkenColor, iconByName } from "@/components/kaji/helpers";
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
  defaultAssigneeId?: string | null;
};

export type CustomIconOption = {
  id: string;
  label: string;
  icon: string;
  iconColor: string;
  bgColor: string;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 365;
const ICON_PRESETS_PER_PAGE = 6;
const CUSTOM_ICON_TAP_WINDOW_MS = 420;

type SelectableIconOption = {
  id: string;
  label: string;
  icon: string;
  iconColor: string;
  bgColor: string;
  source: "custom" | "preset";
};

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
  users,
  isSaving = false,
  isDeleting = false,
  onChange,
  onSave,
  onDelete,
  onDeleteCustomIcon,
  onOpenCustomIcon,
}: {
  mode: "create" | "edit";
  value: ChoreForm;
  customIcons: CustomIconOption[];
  users: Array<{ id: string; name: string; color: string | null }>;
  isSaving?: boolean;
  isDeleting?: boolean;
  onChange: (next: ChoreForm) => void;
  onSave: () => void;
  onDelete: () => void;
  onDeleteCustomIcon: (id: string) => void;
  onOpenCustomIcon: () => void;
}) {
  const lastPerformedDate = toDateInputValueInJst(value.lastPerformedAt);
  const maxDate = toDateInputValueInJst(new Date().toISOString());
  const isCustomIconSelected = customIcons.some(
    (custom) =>
      value.icon === custom.icon &&
      value.iconColor === custom.iconColor &&
      value.bgColor === custom.bgColor,
  );
  const iconViewportRef = useRef<HTMLDivElement | null>(null);
  const lastCustomIconTapRef = useRef<{ id: string; at: number; count: number } | null>(null);
  const iconTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const iconSwipeLockRef = useRef(false);
  const [activeIconPage, setActiveIconPage] = useState(0);
  const [deleteArmedCustomIconId, setDeleteArmedCustomIconId] = useState<string | null>(null);
  const selectableIcons = useMemo<SelectableIconOption[]>(
    () => [
      ...customIcons.slice().reverse().map((custom) => ({
        id: custom.id,
        label: custom.label,
        icon: custom.icon,
        iconColor: custom.iconColor,
        bgColor: custom.bgColor,
        source: "custom" as const,
      })),
      ...QUICK_ICON_PRESETS.map((preset, idx) => ({
        id: `preset-${preset.icon}-${idx}`,
        label: preset.label,
        icon: preset.icon,
        iconColor: preset.iconColor,
        bgColor: preset.bgColor,
        source: "preset" as const,
      })),
    ],
    [customIcons],
  );
  const iconPages = useMemo(() => {
    const pages: SelectableIconOption[][] = [];
    for (let i = 0; i < selectableIcons.length; i += ICON_PRESETS_PER_PAGE) {
      pages.push(selectableIcons.slice(i, i + ICON_PRESETS_PER_PAGE));
    }
    return pages;
  }, [selectableIcons]);
  const displayActiveIconPage = Math.max(0, Math.min(activeIconPage, iconPages.length - 1));
  const canSave = value.title.trim().length > 0 && Boolean(lastPerformedDate) && !isSaving && !isDeleting;

  const handleSelectIcon = (option: SelectableIconOption, tappedAt: number) => {
    onChange({
      ...value,
      icon: option.icon,
      iconColor: option.iconColor,
      bgColor: option.bgColor,
    });

    if (option.source !== "custom") {
      lastCustomIconTapRef.current = null;
      setDeleteArmedCustomIconId(null);
      return;
    }

    const lastTap = lastCustomIconTapRef.current;
    const nextTapCount =
      lastTap?.id === option.id && tappedAt - lastTap.at <= CUSTOM_ICON_TAP_WINDOW_MS
        ? lastTap.count + 1
        : 1;

    if (nextTapCount >= 3) {
      lastCustomIconTapRef.current = null;
      setDeleteArmedCustomIconId(null);
      onDeleteCustomIcon(option.id);
      return;
    }

    lastCustomIconTapRef.current = { id: option.id, at: tappedAt, count: nextTapCount };
    setDeleteArmedCustomIconId(nextTapCount >= 2 ? option.id : null);
  };

  const updateIntervalDays = (delta: number) => {
    const next = Math.min(
      MAX_INTERVAL_DAYS,
      Math.max(MIN_INTERVAL_DAYS, value.intervalDays + delta),
    );
    onChange({ ...value, intervalDays: next });
  };

  const setIntervalDays = (rawValue: string) => {
    const trimmed = rawValue.replace(/[^\d]/g, "");
    if (!trimmed) {
      onChange({ ...value, intervalDays: MIN_INTERVAL_DAYS });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const next = Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, parsed));
    onChange({ ...value, intervalDays: next });
  };

  return (
    <div className="space-y-[10px] pb-0">
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateIntervalDays(-7)}
              className="rounded-full bg-[#F1F3F4] px-3 py-[5px] text-[12px] font-bold text-[#5F6368]"
            >
              -7
            </button>
            <button
              type="button"
              onClick={() => updateIntervalDays(-1)}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#F1F3F4]"
            >
              <Minus size={16} className="text-[#6F5A4B]" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={String(value.intervalDays)}
              inputMode="numeric"
              onChange={(e) => setIntervalDays(e.target.value)}
              className="w-[58px] rounded-lg border border-[#DADCE0] bg-white px-2 py-1.5 text-center text-[16.8px] font-bold text-[#202124] outline-none"
              aria-label="interval-days"
            />
            <span className="text-[15px] font-bold text-[#202124]">日ごと</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateIntervalDays(1)}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#1A9BE8]"
            >
              <Plus size={16} className="text-white" />
            </button>
            <button
              type="button"
              onClick={() => updateIntervalDays(7)}
              className="rounded-full bg-[#1A9BE8] px-3 py-[5px] text-[12px] font-bold text-white"
            >
              +7
            </button>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[14.4px] font-bold text-[#5F6368]">開始日 *</p>
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
          disabled={mode === "edit"}
          required
          aria-label="start-date"
          className={`w-full rounded-[14px] border border-[#DADCE0] py-3 pl-3 pr-3 text-[16.8px] font-semibold text-[#202124] outline-none ${mode === "edit" ? "bg-[#F1F3F4] text-[#5F6368]" : "bg-white"}`}
        />
      </div>

      <div>
        <p className="mb-1.5 text-[14.4px] font-bold text-[#5F6368]">アイコン</p>
        <div className="space-y-2">
          <div
            ref={iconViewportRef}
            onScroll={(e) => {
              if (iconSwipeLockRef.current) return;
              const node = e.currentTarget;
              const next = Math.round(node.scrollLeft / node.clientWidth);
              setActiveIconPage(Math.max(0, Math.min(iconPages.length - 1, next)));
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              if (!touch) return;
              iconTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={() => {
              iconTouchStartRef.current = null;
            }}
            onTouchMove={(e) => {
              const start = iconTouchStartRef.current;
              const touch = e.touches[0];
              if (!start || !touch) return;
              const dx = touch.clientX - start.x;
              const dy = touch.clientY - start.y;
              if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
                iconTouchStartRef.current = null;
                const node = iconViewportRef.current;
                if (!node) return;
                const direction = dx < 0 ? 1 : -1;
                const nextPage = Math.max(0, Math.min(iconPages.length - 1, displayActiveIconPage + direction));
                iconSwipeLockRef.current = true;
                setActiveIconPage(nextPage);
                node.scrollTo({ left: nextPage * node.clientWidth, behavior: "smooth" });
                setTimeout(() => { iconSwipeLockRef.current = false; }, 350);
              }
            }}
            className="overflow-x-hidden touch-pan-y"
          >
            <div className="flex">
              {iconPages.map((page, pageIndex) => (
                <div key={`icon-page-${pageIndex}`} className="w-full shrink-0">
                  <div className="grid grid-cols-3 gap-2">
                    {page.map((option) => {
                      const Icon = iconByName(option.icon);
                      const selected =
                        value.icon === option.icon &&
                        value.iconColor === option.iconColor &&
                        value.bgColor === option.bgColor;
                      const showDeleteMark =
                        option.source === "custom" && deleteArmedCustomIconId === option.id;
                      const displayColor = darkenColor(option.iconColor, 0.4);
                      return (
                        <div key={option.id} className="relative">
                          <button
                            type="button"
                            onClick={(event) => handleSelectIcon(option, event.timeStamp)}
                            className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-[10px] py-[9px] ${selected
                              ? "border-[#BFD6FF] bg-[#EEF3FF]"
                              : "border-[#DADCE0] bg-[#F8F9FA]"
                              }`}
                          >
                            <Icon size={14} color={displayColor} />
                            <span className="truncate text-[13.2px] font-bold" style={{ color: displayColor }}>
                              {option.label}
                            </span>
                          </button>
                          {showDeleteMark ? (
                            <button
                              type="button"
                              aria-label="delete-custom-icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                lastCustomIconTapRef.current = null;
                                setDeleteArmedCustomIconId(null);
                                onDeleteCustomIcon(option.id);
                              }}
                              className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/62 backdrop-blur-[1px]"
                            >
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#D45858] text-white shadow-[0_2px_6px_rgba(0,0,0,0.24)]">
                                <Trash2 size={14} />
                              </span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    {Array.from({ length: Math.max(0, ICON_PRESETS_PER_PAGE - page.length) }).map((_, idx) => (
                      <div key={`icon-empty-${pageIndex}-${idx}`} className="h-[40px]" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {iconPages.length > 1 ? (
            <div className="flex justify-center gap-1.5">
              {iconPages.map((_, idx) => (
                <div
                  key={`icon-page-dot-${idx}`}
                  className={`h-1.5 w-1.5 rounded-full ${idx === displayActiveIconPage ? "bg-[#1A9BE8]" : "bg-[#DADCE0]"}`}
                />
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onOpenCustomIcon}
            className={`w-full rounded-xl border px-3 py-[10px] text-[13.2px] font-bold ${isCustomIconSelected
              ? "border-[#BFD6FF] bg-[#EEF3FF] text-[#1A9BE8]"
              : "border-[#DADCE0] bg-white text-[#5F6368]"
              }`}
          >
            ＋ カスタムアイコン
          </button>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => onChange({ ...value, isBigTask: !value.isBigTask })}
          className="flex w-full items-center justify-between rounded-[14px] border border-[#DADCE0] bg-white p-3 text-left"
        >
          <div>
            <p className="text-[13px] font-bold text-[#202124]">大仕事として扱う</p>
          </div>
          <div
            className={`relative h-6 w-[42px] rounded-xl ${value.isBigTask ? "bg-[#33C28A]" : "bg-[#E8EAED]"
              }`}
          >
            <div
              className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${value.isBigTask ? "left-[21px]" : "left-[3px]"
                }`}
            />
          </div>
        </button>
      </div>

      {users.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[14px] font-bold text-[#202124]">デフォルト担当者</p>
          <div className="flex gap-2">
            {users.map((u) => {
              const isSelected = value.defaultAssigneeId === u.id;
              const userColor = u.color ?? "#1A9BE8";
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      defaultAssigneeId: isSelected ? null : u.id,
                    })
                  }
                  className={`rounded-2xl px-4 py-2 text-[13px] font-bold transition-colors ${isSelected ? "text-white" : "border text-[#5F6368]"
                    }`}
                  style={
                    isSelected
                      ? { backgroundColor: userColor, borderColor: userColor }
                      : { backgroundColor: "white", borderColor: "#DADCE0" }
                  }
                >
                  {u.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onChange({ ...value, defaultAssigneeId: null })}
              className={`rounded-2xl px-4 py-2 text-[13px] font-bold ${!value.defaultAssigneeId
                ? "bg-[#F1F3F4] text-[#202124]"
                : "border border-[#DADCE0] bg-white text-[#5F6368]"
                }`}
            >
              なし
            </button>
          </div>
        </div>
      ) : null}

      <div className={mode === "edit" ? "grid grid-cols-2 gap-2" : ""}>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={`w-full rounded-[14px] px-[14px] py-[12px] text-[15.6px] font-bold text-white ${canSave ? "bg-[#1A9BE8]" : "cursor-not-allowed bg-[#B6C8D6]"
            }`}
        >
          {isSaving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              保存中...
            </span>
          ) : mode === "create" ? (
            "家事を追加"
          ) : (
            "変更を保存"
          )}
        </button>
        {mode === "edit" ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={isSaving || isDeleting}
            className="w-full rounded-[14px] border border-[#F2C9C9] bg-white px-[14px] py-[12px] text-[15.6px] font-bold text-[#D45858] disabled:opacity-60"
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
  onApply: (next: Omit<CustomIconOption, "id">) => void | Promise<void>;
}) {
  const iconPages = useMemo(() => getIconPages(), []);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeLockRef = useRef(false);
  const [activePage, setActivePage] = useState(0);
  const [customName, setCustomName] = useState("");

  const scrollToPage = useCallback((page: number) => {
    const node = viewportRef.current;
    if (!node) return;
    const clamped = Math.max(0, Math.min(iconPages.length - 1, page));
    swipeLockRef.current = true;
    setActivePage(clamped);
    node.scrollTo({ left: clamped * node.clientWidth, behavior: "smooth" });
    setTimeout(() => { swipeLockRef.current = false; }, 350);
  }, [iconPages.length]);

  return (
    <div className="space-y-[8px] pb-2">
      <div>
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="例: デスクまわり"
          className="w-full rounded-[14px] border border-[#DADCE0] bg-white px-[14px] py-3 text-[15.6px] font-medium text-[#202124] outline-none"
        />
      </div>

      <div className="space-y-1">
        <div
          ref={viewportRef}
          onScroll={(e) => {
            if (swipeLockRef.current) return;
            const node = e.currentTarget;
            const next = Math.round(node.scrollLeft / node.clientWidth);
            setActivePage(Math.max(0, Math.min(iconPages.length - 1, next)));
          }}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (!touch) return;
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={() => {
            touchStartRef.current = null;
          }}
          onTouchMove={(e) => {
            const start = touchStartRef.current;
            const touch = e.touches[0];
            if (!start || !touch) return;
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
              touchStartRef.current = null;
              const direction = dx < 0 ? 1 : -1;
              scrollToPage(activePage + direction);
            }
          }}
          className="overflow-x-hidden touch-pan-y"
        >
          <div className="flex">
            {iconPages.map((page, pageIndex) => (
              <div key={pageIndex} className="w-full shrink-0">
                <div className="grid grid-cols-5 gap-1">
                  {page.slice(0, ICONS_PER_PAGE).map((iconName) => {
                    const Icon = iconByName(iconName);
                    const selected = value.icon === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => onChange({ ...value, icon: iconName })}
                        className={`flex aspect-square w-full items-center justify-center rounded-[8px] border ${selected ? "border-[#1A9BE8] bg-[#EEF3FF]" : "border-[#DADCE0] bg-white"
                          }`}
                      >
                        <Icon size={24} color="#202124" />
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

      <div className="space-y-1.5">
        <div>
          <p className="mb-1 text-xs font-bold text-[#5F6368]">アイコン色</p>
          <div className="flex flex-wrap gap-1.5">
            {ICON_COLOR_PALETTE.map((color) => (
              <ColorDot
                key={color}
                color={color}
                selected={value.iconColor === color}
                onClick={() => onChange({ ...value, iconColor: color })}
              />
            ))}
            <label className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-full border border-[#DADCE0] text-[#5F6368]">
              <Plus size={14} />
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
          <div className="flex flex-wrap gap-1.5">
            {BG_COLOR_PALETTE.map((color) => (
              <ColorDot
                key={color}
                color={color}
                selected={value.bgColor === color}
                onClick={() => onChange({ ...value, bgColor: color })}
              />
            ))}
            <label className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-full border border-[#DADCE0] text-[#5F6368]">
              <Plus size={14} />
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

      <div className="rounded-[14px] border border-[#DADCE0] bg-white p-[8px]">
        <div className="flex justify-center">
          <IconBadge icon={value.icon} iconColor={value.iconColor} bgColor={value.bgColor} size={56} iconSize={28} />
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onApply({
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
