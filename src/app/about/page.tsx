// src/app/(routes)/about/page.tsx
import type { Metadata } from "next";
import AboutClient from "@/components/AboutClient";

export const metadata: Metadata = {
  title: "私たちの想い｜ユーファースト（高崎市のハウスクリーニング）",
  description:
    "高崎市密着のハウスクリーニング専門店『ユーファースト』の想い。ご夫婦ならではの丁寧さと安心感で、暮らしを心地よく整えるお手伝いをしています。",
  openGraph: {
    title: "私たちの想い｜ユーファースト",
    description:
      "ユーファーストは高崎市のご夫婦経営クリーニング店。水回りからお部屋全体、引越し前後の清掃まで、安心・誠実を大切に対応します。",
    url: "https://you-first.shop/about",
    siteName: "ユーファースト",
    images: [
      {
        url: "/ogpLogo.jpg", // 適切なOGP画像に差し替え可能
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  alternates: { canonical: "https://you-first.shop/about" },
};

export default function AboutPage() {
  return (
    <main className="px-4 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mt-6 mb-6 text-center text-white/80">
        私たちの想い
      </h1>
      <AboutClient />
    </main>
  );
}






