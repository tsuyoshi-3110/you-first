// src/app/(routes)/home/page.tsx

import type { Metadata } from "next";
import BackgroundVideo from "@/components/backgroundVideo/BackgroundVideo";
import TopFixedText from "@/components/TopFixedText";

export const metadata: Metadata = {
  title: "高崎市 ハウスクリーニング｜ユーファースト",
  description:
    "高崎市密着のハウスクリーニング専門店『ユーファースト』。ご夫婦で営む安心・丁寧な清掃サービス。お部屋・水回り・引越し前後の掃除もお任せください。",
  openGraph: {
    title: "高崎市 ハウスクリーニング｜ユーファースト",
    description:
      "高崎市でハウスクリーニングなら『ユーファースト』。ご夫婦で丁寧にお掃除します。地域密着・見積もり無料！",
    url: "https://you-first.shop/",
    siteName: "ユーファースト",
    images: [
      {
        url: "/ogp-home.jpg", // 適切なOGP画像に差し替え
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  alternates: { canonical: "https://you-first.shop/" },
};

export default function HomePage() {
  return (
    <main className="w-full overflow-x-hidden">
      {/* ① ファーストビュー：背景動画または画像 */}
      <section className="relative h-screen overflow-hidden">
        <BackgroundVideo />
      </section>

      {/* ② テキスト紹介セクション */}
      <section className="relative z-10 text-white px-4 py-20">
        {/* 編集可能な固定テキストコンポーネント */}
        <TopFixedText />

        {/* ページタイトルとリード文 */}
        <h1 className="text-3xl lg:text-4xl font-extrabold text-center leading-tight mb-6 text-outline">
          高崎市 ハウスクリーニング ユーファースト
        </h1>

        <p className="max-w-3xl mx-auto text-center leading-relaxed text-outline">
          ユーファーストは、高崎市密着・夫婦で営む安心のハウスクリーニング専門店です。
          お部屋、水回り、引越し前後の清掃もプロにお任せください。
          忙しいあなたの代わりに、心を込めてキレイに仕上げます♪ 。
        </p>
      </section>

      {/* ③ JSON-LD（構造化データ） */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: "ユーファースト",
            description:
              "高崎市のご夫婦経営ハウスクリーニング専門店。お部屋・水回り・引越し前後の清掃も対応。安心・丁寧なサービス。",
            address: {
              "@type": "PostalAddress",
              addressLocality: "群馬県高崎市",
              // streetAddress, postalCodeなど必要に応じて追加
            },
            telephone: "（電話番号を記載）",
            url: "https://you-first.shop/",
            image: "https://you-first.shop/ogp-home.jpg",
            areaServed: "高崎市",
            openingHours: "Mo-Su 09:00-18:00", // 実際の営業時間に合わせて編集
            priceRange: "¥¥",
          }),
        }}
      />
    </main>
  );
}
