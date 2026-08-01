import type { Metadata, Viewport } from "next";
import { Inter, Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import { QuantProviders } from "@/lib/quant/providers";
import "./globals.css";
import { cn } from "@/lib/utils";

// 1. Font Definitions
const inter = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter" 
});

const jetbrains = JetBrains_Mono({ 
  subsets: ["latin"], 
  variable: "--font-jetbrains-mono" 
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 2. Metadata & Viewport Configurations
export const metadata: Metadata = {
  title: "Neural Nexus | Quant Terminal",
  description: "Institutional Automated Trading Terminal",
};

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
        "h-full antialiased dark", 
        inter.variable,
        jetbrains.variable,
        geistSans.variable, 
        geistMono.variable
      )}
    >
      <body className="min-h-full flex flex-col bg-[var(--qt-bg)] text-[var(--qt-text)]">
        {/* QuantProviders wraps the entire app to supply TanStack Query */}
        <QuantProviders>
          {children}
        </QuantProviders>
      </body>
    </html>
  );
}