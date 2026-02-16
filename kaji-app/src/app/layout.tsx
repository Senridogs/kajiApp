import type { Metadata } from "next";
import "./globals.css";

const SVG_ICON_URL = "/app-icon.svg";
const ICON_192_URL = "/icon-192-v2.png";
const ICON_512_URL = "/icon-512-v2.png";
const APPLE_ICON_URL = "/apple-touch-icon-v2.png";
const MANIFEST_URL = "/manifest.webmanifest?v=android-maskable-v3";

export const metadata: Metadata = {
  title: "いえたすく",
  description: "家事分担を手軽に管理できるアプリ",
  themeColor: "#4285F4",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
