import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Script from "next/script";
import ThemeBackground from "@/components/ThemeBackground";
import WallpaperBackground from "@/components/WallpaperBackground";
import SubscriptionOverlay from "@/components/SubscriptionOverlay";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "高崎市のハウスクリーニング｜ユーファースト（You-First）",
  description:
    "高崎市・地域密着型のハウスクリーニング専門店『ユーファースト』。ご夫婦で営む安心の清掃サービス。お部屋や水回り、引越し前後のお掃除はプロにお任せください！忙しいあなたの代わりにピカピカに仕上げます。",
  openGraph: {
    title: "高崎市のハウスクリーニング｜ユーファースト",
    description:
      "高崎市密着のハウスクリーニング専門店『ユーファースト』。安心のご夫婦経営で、丁寧・誠実な清掃サービスをご提供。お部屋や水回り、引越し前後の掃除も対応！",
    url: "https://youfirst-cleaning-services.com/",
    siteName: "ユーファースト",
    images: [
      {
        url: "/ogp.jpg", // サイト用のOGP画像（なければ適宜変更）
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const siteKey = "youFirst";

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <link
          rel="preload"
          as="image"
          href="/logo.png" // 清掃イメージ画像があればここを変更
          type="image/webp"
        />
        <meta name="theme-color" content="#ffffff" />
        <link rel="icon" href="/favicon.ico?v=2" />
      </head>

      <body className="relative min-h-screen bg-[#ffffff]">
        <SubscriptionOverlay siteKey={siteKey} />
        <WallpaperBackground />
        <ThemeBackground />
        <Header />
        {children}

        <Script
          id="ld-json"
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: "ユーファースト",
            description:
              "高崎市密着のご夫婦経営ハウスクリーニング専門店。お部屋・水回り・引越し前後清掃も対応。",
            address: {
              "@type": "PostalAddress",
              addressLocality: "群馬県高崎市",
              streetAddress: "（※具体的な住所があれば記載）",
            },
            telephone: "（※電話番号）",
            url: "https://youfirst-cleaning-services.com/",
            image: "https://youfirst-cleaning-services.com/ogp.jpg",
            areaServed: "高崎市",
            openingHours: "Mo-Su 09:00-18:00", // 営業時間例
            priceRange: "¥¥",
          })}
        </Script>
      </body>
    </html>
  );
}
