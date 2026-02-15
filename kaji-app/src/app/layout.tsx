import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaji App",
  description: "夫婦向け家事管理アプリ",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
