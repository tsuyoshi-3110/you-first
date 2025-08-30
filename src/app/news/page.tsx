// src/app/(routes)/news/page.tsx
import type { Metadata } from "next";
import NewsClient from "@/components/NewsClient";

export const metadata: Metadata = {
  title: "お知らせ｜おそうじ処 たよって屋",
  description:
    "おそうじ処 たよって屋の最新情報・キャンペーン・営業時間や対応エリアに関するお知らせを掲載しています（大阪・兵庫エリア対応）。",
  openGraph: {
    title: "お知らせ｜おそうじ処 たよって屋",
    description:
      "最新のお知らせやキャンペーン情報、営業時間・対応エリアの変更などを随時ご案内します。",
    url: "https://tayotteya.shop/news",
    siteName: "おそうじ処 たよって屋",
    images: [{ url: "/ogpLogo.png", width: 1200, height: 630 }],
    locale: "ja_JP",
    type: "website",
  },
  alternates: { canonical: "https://tayotteya.shop/news" },
};

export default function NewsPage() {
  return (
    <main className="px-4 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mt-6 mb-6 text-center text-white/80">
        お知らせ
      </h1>
      <NewsClient />
    </main>
  );
}
