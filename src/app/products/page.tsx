import type { Metadata } from "next";
import ProductsClient from "@/components/ProductsClient";

export const metadata: Metadata = {
  title: "施工実績・ビフォーアフター｜ユーファースト（高崎市 ハウスクリーニング）",
  description:
    "高崎市ハウスクリーニング『ユーファースト』の施工実績・ビフォーアフター写真一覧。実際の清掃事例やお客様からの感想も掲載。安心してご依頼いただけるプロの仕事をご覧ください。",
  openGraph: {
    title: "施工実績・ビフォーアフター｜ユーファースト（高崎市 ハウスクリーニング）",
    description:
      "ユーファーストが手掛けた高崎市内のハウスクリーニング施工実績・ビフォーアフター事例。写真付きでプロの仕上がりを紹介。地域密着・ご夫婦で丁寧対応！",
    url: "https://youfirst-cleaning-services.com/products",
    siteName: "ユーファースト",
    images: [
      {
        url: "/logo.jpg", // 施工実績用OGP画像
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
};

export default function ProductsPage() {
  return <ProductsClient />;
}
