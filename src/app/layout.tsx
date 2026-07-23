import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Jarvis Comps — Instant ARV. Real comps. No guesswork.",
  description:
    "Paste an address, get an ARV opinion backed by real sold comps in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
