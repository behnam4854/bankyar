import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "بانک‌یار | دستیار هوشمند بانکی",
  description: "دستیار هوشمند پاسخ‌گویی به مشتریان بانک",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
