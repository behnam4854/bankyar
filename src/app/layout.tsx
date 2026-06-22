import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "بانک‌یار | دستیار هوشمند بانکی",
  description: "دستیار هوشمند پاسخ‌گویی به مشتریان بانک",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0f1a",
  // Render native iOS chrome (keyboard accessory/AutoFill bar, form controls) in
  // dark mode so the bar above the keyboard matches the app instead of white.
  colorScheme: "dark",
  // On-screen keyboard shrinks the layout viewport (so 100dvh = space above the
  // keyboard) instead of overlaying it — keeps the composer visible and the
  // chat scrollable on mobile.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
