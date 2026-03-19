import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notion → Channel Talk 아티클 동기화",
  description: "Notion 페이지를 Channel Talk 도큐먼트 아티클로 내보냅니다",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
