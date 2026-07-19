import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 1. UPDATED METADATA FOR YOUR PROJECT
export const metadata: Metadata = {
  title: "Neural Nexus",
  description: "Institutional Trading Terminal",
};

// 2. NEW VIEWPORT EXPORT (Locks mobile scaling)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full", 
        "antialiased", 
        geistSans.variable, 
        geistMono.variable, 
        "font-mono", 
        jetbrainsMono.variable,
        "dark" // Added 'dark' to ensure your dark theme stays consistent across the layout
      )}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}