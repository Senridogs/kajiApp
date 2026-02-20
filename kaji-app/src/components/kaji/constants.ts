import { icons } from "lucide-react";

export const PRIMARY_COLOR = "#F97316";

export const ICON_COLOR_PALETTE = [
  "#FFFFFF",
  "#F1F3F4",
  "#DADCE0",
  "#9AA0A6",
  "#202124",
  "#EA4335",
  "#FBBC05",
  "#34A853",
  "#F97316",
  "#5C6BC0",
  "#8E24AA",
];

export const BG_COLOR_PALETTE = [
  "#FFFFFF",
  "#F8F9FA",
  "#E8EAED",
  "#9AA0A6",
  "#5F6368",
  "#202124",
  "#FFF1E8",
  "#E8F3EC",
  "#FFF4E5",
  "#FDECEE",
  "#EEE8FF",
];

export const USER_COLOR_PALETTE = [
  "#7CB9E8",
  "#F4A6A0",
  "#82D9A5",
  "#F6D57E",
  "#B8A9E8",
  "#7ED4D8",
  "#F9B97A",
  "#F2A5C4",
  "#A8C4D6",
];

export const ICONS_PER_PAGE = 20;
export const ICON_PAGE_COUNT = 8;

export const QUICK_ICON_PRESETS = [
  { icon: "recycle", label: "ごみ捨て", iconColor: "#B97700", bgColor: "#FFF6E3" },
  { icon: "droplets", label: "水まわり", iconColor: "#4D8BFF", bgColor: "#EEF3FF" },
  { icon: "cooking-pot", label: "キッチン", iconColor: "#33C28A", bgColor: "#EAF7EF" },
  { icon: "shirt", label: "洗濯", iconColor: "#7A6FF0", bgColor: "#EFEAFE" },
  { icon: "sofa", label: "リビング", iconColor: "#D17C3F", bgColor: "#FFF4E8" },
  { icon: "bed", label: "布団", iconColor: "#26A0A8", bgColor: "#E8F5F6" },
] as const;

function normalizeIconName(name: string) {
  return name
    .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    .replace(/^[-]+/, "");
}

const PRIORITY_ICON_ORDER = [
  "sparkles",
  "flame",
  "droplets",
  "wind",
  "washing-machine",
  "cooking-pot",
  "shirt",
  "bed",
  "home",
  "house",
  "sofa",
  "lamp",
  "leaf",
  "flower",
  "bath",
  "shower-head",
  "toilet",
  "utensils",
  "utensils-crossed",
  "refrigerator",
  "microwave",
  "soup",
  "dishwasher",
  "trash-2",
  "recycle",
  "spray-can",
  "brush-cleaning",
  "broom",
  "mop",
  "baby",
  "dog",
  "cat",
  "tree-pine",
  "sun",
  "cloud",
  "umbrella",
  "car",
  "bus",
  "train",
  "bicycle",
  "calendar",
  "calendar-check-2",
  "clock-3",
  "alarm-clock",
  "bell",
  "check",
  "check-check",
  "circle-plus",
  "plus",
  "circle-minus",
  "minus",
  "clipboard-list",
  "list-checks",
  "bar-chart-3",
  "pie-chart",
  "settings",
  "user",
  "users",
  "heart",
  "star",
  "moon-star",
  "palette",
  "paintbrush",
  "pen-line",
  "pencil",
  "book-open",
  "music-3",
  "camera",
  "gamepad-2",
  "tv",
  "monitor",
  "smartphone",
  "tablet",
  "plug",
  "battery",
  "wifi",
  "rocket",
  "party-popper",
  "gift",
  "cake",
  "coffee",
  "sandwich",
  "apple",
  "cherry",
  "fish",
  "egg",
  "beef",
  "pizza",
  "salad",
  "milk",
  "cookie",
  "ice-cream-cone",
  "key-round",
  "lock",
  "shield",
  "siren",
  "stethoscope",
  "pill",
  "scissors",
  "wrench",
  "hammer",
  "ruler",
  "lightbulb",
  "inbox",
  "folder",
  "files",
  "archive",
  "mail",
  "send",
  "message-square",
  "phone",
  "map-pin",
  "navigation",
  "compass",
  "earth",
  "globe",
  "flag",
  "mountain",
  "waves",
  "snowflake",
  "zap",
  "bot",
  "smile",
  "frown",
  "hand",
  "thumbs-up",
  "trophy",
  "medal",
  "target",
  "gauge",
  "timer",
  "hourglass",
  "circle-help",
  "circle-alert",
  "badge-check",
  "bookmark",
  "notebook-pen",
  "backpack",
  "shopping-cart",
  "store",
  "wallet",
  "piggy-bank",
  "credit-card",
];

export function getIconPages(): string[][] {
  const all = Object.keys(icons)
    .map(normalizeIconName)
    .filter((name) => /^[a-z0-9-]+$/.test(name));
  const allSet = new Set(all);

  const priority = PRIORITY_ICON_ORDER.filter((name) => allSet.has(name));
  const rest = all
    .filter((name) => !priority.includes(name))
    .sort((a, b) => a.localeCompare(b));

  const ordered = [...priority, ...rest].slice(0, ICONS_PER_PAGE * ICON_PAGE_COUNT);

  const pages: string[][] = [];
  for (let i = 0; i < ICON_PAGE_COUNT; i += 1) {
    pages.push(ordered.slice(i * ICONS_PER_PAGE, (i + 1) * ICONS_PER_PAGE));
  }
  return pages;
}
