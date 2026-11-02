import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "NBM Audio Studio — আপনার লেখা, এবার কণ্ঠে",
  description: "বাংলা লেখা থেকে বাংলা অডিও এবং ইংরেজি বা উর্দু থেকে পর্যালোচনাযোগ্য বাংলা অনুবাদের সাহিত্য স্টুডিও।",
  applicationName: "NBM Audio Studio",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#171918", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="bn"><body>{children}</body></html>;
}
