// app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Header";
import Script from "next/script";
import ThemeBackground from "@/components/ThemeBackground";
import WallpaperBackground from "@/components/WallpaperBackground";
import SubscriptionOverlay from "@/components/SubscriptionOverlay";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";
import {
  kosugiMaru,
  notoSansJP,
  shipporiMincho,
  reggaeOne,
  yomogi,
  hachiMaruPop,
} from "@/lib/font";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

// ✅ metadata から themeColor を削除
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
    url: "https://you-first.shop",
    siteName: "ユーファースト",
    type: "website",
    images: [
      {
        url: "/ogpLogo.jpg", // 横1200x630のjpgファイル（JPEG形式に注意！）
        width: 1200,
        height: 630,
        alt: "ユーファースト OGP画像",
      },
    ],
    locale: "ja_JP",
  },
  alternates: {
    canonical: "https://you-first.shop",
  },
  metadataBase: new URL("https://you-first.shop"),
};

// ✅ ここで themeColor を指定（root で一括適用）
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={`
        ${geistSans.variable} ${geistMono.variable}
        ${kosugiMaru.variable} ${notoSansJP.variable}
        ${yomogi.variable} ${hachiMaruPop.variable} ${reggaeOne.variable} ${shipporiMincho.variable}
        antialiased
      `}
    >
      <head>
        {/* OGP画像の事前読み込み */}
        <link rel="preload" as="image" href="/ogpLogo.png" type="image/png" />
        <meta name="google-site-verification" content="uN73if1NMw0L6lYoLXqKJDBt56lxDXlmbZwfurtPFNs" />
      </head>

      <body className="relative min-h-screen bg-[#ffffff]">
        <SubscriptionOverlay siteKey={SITE_KEY} />
        <WallpaperBackground />
        <ThemeBackground />
        <Header />
        {children}

         {/* 構造化データ */}
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
            telephone: "090-8330-1729",
            url: "https://you-first.shop/",
            image: "https://you-first.shop/ogpLogo.jpg",
            areaServed: "高崎市",
            openingHours: "Mo-Su 09:00-18:00",
            priceRange: "¥¥",
          })}
        </Script>
      </body>
    </html>
  );
}
