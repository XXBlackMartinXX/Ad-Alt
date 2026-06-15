import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ad-Alt — Earn from AI wait-states",
  description:
    "Ad-Alt lets developers optionally earn revenue during AI coding assistant wait-states. Privacy-first, transparent, and opt-in.",
  keywords: ["developer", "ai", "monetization", "vscode", "extension"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
