// Validate environment variables at startup
import { validateEnv } from '@/lib/env-validation'
validateEnv()

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FinexFX AI — Live Trading System",
  description: "AI-powered forex scalping dashboard. MT5 • FINEX Indonesia • M5 • EURUSD/USDJPY/GBPUSD/XAUUSD. Live, Demo & Auto trading with ML analysis.",
  keywords: ["forex", "MT5", "FINEX", "scalping", "AI trading", "EURUSD", "XAUUSD"],
  authors: [{ name: "FinexFX AI" }],
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
