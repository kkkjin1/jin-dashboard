import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "인사기획 워크",
  description: "인사기획팀 업무 보드",
  manifest: "/manifest.json",
  icons: {
    icon: { url: '/favicon.ico', type: 'image/x-icon' },
    apple: { url: '/apple-icon', type: 'image/png', sizes: '180x180' },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "인사기획",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#0F1E36",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" style={{ colorScheme: 'light' }} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.css" />
      </head>
      <body className="bg-[#F1F5F9] text-gray-900 antialiased font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
