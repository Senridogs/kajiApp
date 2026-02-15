import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "いえたすく",
  description: "家事分担を手軽に管理できるアプリ",
  themeColor: "#4285F4",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/app-icon.svg",
    apple: "/app-icon.svg",
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
