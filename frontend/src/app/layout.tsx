import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { ToastProvider } from "@/components/ui/Toast";

import "./globals.css";

// next/font downloads Inter at build time and serves it from this site, so
// visitors' browsers never contact Google. globals.css uses the variable.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "HuddleFlow",
    template: "%s | HuddleFlow",
  },
  description:
    "HuddleFlow: video meetings with an agenda, shared notes and a recap, so every meeting ends with a plan.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1b3d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
