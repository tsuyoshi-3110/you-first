import type { Metadata } from "next";
import StoresClient from "@/components/StoresClient";
import { PhoneSection } from "@/components/PhoneSection";

export const metadata: Metadata = {
  title: "店舗・営業エリア｜ユーファースト（高崎市 ハウスクリーニング）",
  description:
    "ユーファーストの営業エリア・対応地域をご案内。高崎市内のご自宅や事業所の清掃もご相談ください。安心のご夫婦経営、地域密着型ハウスクリーニングサービスです。",
  openGraph: {
    title: "店舗・営業エリア｜ユーファースト（高崎市 ハウスクリーニング）",
    description:
      "高崎市内を中心に、ユーファーストがご自宅・オフィスのハウスクリーニングを承ります。地域密着、安心・丁寧な清掃サービス。",
    url: "https://you-first.shop/stores",
    siteName: "ユーファースト",
    images: [
      {
        url: "/ogp-stores.jpg",
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
};

export default function StoresPage() {
  return (
    <main className="px-4 py-16">
      {/* 営業エリア・お問い合わせセクション */}
      <section className="max-w-4xl mx-auto text-center mb-12">
        <h1 className="text-2xl lg:text-3xl font-extrabold mb-4 text-black/90">
          ユーファースト ─ 営業エリア・ご案内
        </h1>
        <p className="leading-relaxed text-black/80">
          <strong>ユーファースト</strong> は<strong>高崎市</strong>{" "}
          を中心に、ご自宅・マンション・事務所の ハウスクリーニングを承ります。
          <br className="hidden lg:block" />
          地域密着ならではの安心と、夫婦ならではのきめ細かな対応が強みです。
          <br />
          「こんな場所も頼める？」といったご相談もお気軽にどうぞ！
        </p>
      </section>

      {/* 電話番号や連絡先セクション */}
      <section className="max-w-4xl mx-auto text-center mb-12">
        <PhoneSection />
      </section>

      {/* 店舗カード・営業拠点のクライアントレンダリング（1拠点でもOK） */}
      <StoresClient />
    </main>
  );
}
