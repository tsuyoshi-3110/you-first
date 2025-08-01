import "./globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

// --- ここを修正 ---
export const metadata: Metadata = {
  title: "高崎市のハウスクリーニング｜ユーファースト（You-First）",
  description:
    "高崎市・地域密着型のハウスクリーニング専門店『ユーファースト』。ご夫婦で営む安心の清掃サービス。お部屋や水回り、引越し前後のお掃除はプロにお任せください！忙しいあなたの代わりにピカピカに仕上げます。",
  keywords: [
    "ユーファースト",
    "ハウスクリーニング",
    "高崎市",
    "清掃サービス",
    "地域密着",
    "引越し清掃",
    "水回り掃除",
    "夫婦経営",
  ],
  authors: [{ name: "ユーファースト運営チーム" }],
  openGraph: {
    title: "高崎市のハウスクリーニング｜ユーファースト",
    description:
      "高崎市密着のハウスクリーニング専門店『ユーファースト』。安心のご夫婦経営で、丁寧・誠実な清掃サービスをご提供。お部屋や水回り、引越し前後の掃除も対応！",
    url: "https://www.you-first.shop",
    siteName: "ユーファースト",
    type: "website",
    images: [
      {
        url: "https://www.you-first.shop/ogp.jpg", // 横1200x630のjpgファイル（JPEG形式に注意！）
        width: 1200,
        height: 630,
        alt: "ユーファースト OGP画像",
      },
    ],
    locale: "ja_JP",
  },
  alternates: {
    canonical: "https://www.you-first.shop",
  },
  metadataBase: new URL("https://www.you-first.shop"),
};
// --- ここまで ---

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
        {/* ファビコン */}
        <link rel="icon" href="/favicon.ico?v=2" />
        {/* OGP画像事前読み込み */}
        <link rel="preload" as="image" href="/ogp.jpg" type="image/jpeg" />
        <meta name="theme-color" content="#ffffff" />

        {/* OGP & Twitterカード */}
        <meta property="og:title" content="高崎市のハウスクリーニング｜ユーファースト" />
        <meta property="og:description" content="高崎市密着のハウスクリーニング専門店『ユーファースト』。安心のご夫婦経営で、丁寧・誠実な清掃サービスをご提供。お部屋や水回り、引越し前後の掃除も対応！" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.you-first.shop/" />
        <meta property="og:site_name" content="ユーファースト" />
        <meta property="og:locale" content="ja_JP" />
        <meta property="og:image" content="https://www.you-first.shop/ogp.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="高崎市のハウスクリーニング｜ユーファースト" />
        <meta name="twitter:description" content="高崎市密着のハウスクリーニング専門店『ユーファースト』。" />
        <meta name="twitter:image" content="https://www.you-first.shop/ogp.jpg" />
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
            url: "https://www.you-first.shop/",
            image: "https://www.you-first.shop/ogp.jpg",
            areaServed: "高崎市",
            openingHours: "Mo-Su 09:00-18:00",
            priceRange: "¥¥",
          })}
        </Script>
      </body>
    </html>
  );
}
