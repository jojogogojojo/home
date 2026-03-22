import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "채널톡 피드백 분석",
  description: "채널톡 팀챗 피드백을 기간별로 수집하고 AI로 분류·시각화합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
