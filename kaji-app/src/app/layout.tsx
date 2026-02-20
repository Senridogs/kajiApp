import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_MODE_STORAGE_KEY } from "@/lib/theme-mode";
import { THEME_COLOR_STORAGE_KEY } from "@/lib/theme-color";

const SVG_ICON_URL = "/app-icon.svg";
const ICON_192_URL = "/icon-192-v2.png";
const ICON_512_URL = "/icon-512-v2.png";
const APPLE_ICON_URL = "/apple-touch-icon-v2.png";
const MANIFEST_URL = "/manifest.webmanifest?v=android-maskable-v3";
const THEME_COLOR_LIGHT = "#f7f7f8";
const THEME_COLOR_DARK = "#0f0f10";

const themeInitScript = `(() => {
  try {
    const raw = window.localStorage.getItem("${THEME_MODE_STORAGE_KEY}");
    const mode = raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
    const colorRaw = window.localStorage.getItem("${THEME_COLOR_STORAGE_KEY}");
    const themeColor = colorRaw === "orange" || colorRaw === "blue" || colorRaw === "emerald" || colorRaw === "rose" ? colorRaw : "orange";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.dataset.themeColor = themeColor;
    root.style.colorScheme = resolved;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta instanceof HTMLMetaElement) {
      themeColorMeta.content = resolved === "dark" ? "${THEME_COLOR_DARK}" : "${THEME_COLOR_LIGHT}";
    }
  } catch {}
})();`;

export const metadata: Metadata = {
  title: "いえたすく",
  description: "家事分担を手軽に管理できるアプリ",
  manifest: MANIFEST_URL,
  icons: {
    icon: [
      { url: ICON_192_URL, sizes: "192x192", type: "image/png" },
      { url: ICON_512_URL, sizes: "512x512", type: "image/png" },
      { url: SVG_ICON_URL, sizes: "any", type: "image/svg+xml" },
    ],
    shortcut: [{ url: ICON_192_URL, type: "image/png" }],
    apple: [{ url: APPLE_ICON_URL, sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR_DARK },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <meta name="theme-color" content={THEME_COLOR_LIGHT} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
