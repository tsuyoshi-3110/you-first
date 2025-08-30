"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Image from "next/image";
import Link from "next/link";
import { useSetAtom } from "jotai";
import { partnerSiteKeyAtom } from "@/lib/atoms/siteKeyAtom";
import { Inbox } from "lucide-react";
import clsx from "clsx";
import { useThemeGradient } from "@/lib/useThemeGradient";
import { ThemeKey, THEMES } from "@/lib/themes";
import { SITE_KEY } from "@/lib/atoms/siteKeyAtom";

/* ---------- 型 ---------- */
type SiteOwner = {
  id: string; // siteKey
  siteName: string;
  ownerName: string;
  ownerAddress: string;
  iconUrl: string;
  ownerId: string;
};

/* ---------- 定数 ---------- */
const DARK_KEYS: ThemeKey[] = ["brandG", "brandH", "brandI"];
const collatorJa = new Intl.Collator("ja", { sensitivity: "base" });

/* ----------  Component ---------- */
export default function CommunityPage() {
  const [owners, setOwners] = useState<SiteOwner[]>([]);
  const [query, setQuery] = useState("");
  const gradient = useThemeGradient();
  const setPartnerSiteKey = useSetAtom(partnerSiteKeyAtom);

  const isDark = useMemo(
    () => !!gradient && DARK_KEYS.some((k) => gradient === THEMES[k]),
    [gradient]
  );

  useEffect(() => {
    const fetchOwners = async () => {
      const snap = await getDocs(collection(db, "siteSettings"));
      const rows = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data();
          const siteKey = d.id;
          const editableSnap = await getDoc(
            doc(db, "siteSettingsEditable", siteKey)
          );
          const editableData = editableSnap.exists() ? editableSnap.data() : {};
          return {
            id: siteKey,
            siteName: data.siteName ?? "(無名の店舗)",
            ownerName: data.ownerName ?? "(名前未設定)",
            ownerAddress: data.ownerAddress ?? "(住所不明)",
            ownerId: data.ownerId ?? "",
            iconUrl: editableData.headerLogoUrl ?? "/noImage.png",
          } as SiteOwner;
        })
      );

      const sorted = rows
        .filter((r) => r.id !== SITE_KEY)
        .sort((a, b) => collatorJa.compare(a.siteName, b.siteName));

      setOwners(sorted);
    };

    fetchOwners();
  }, []);

  const filteredOwners = useMemo(() => {
    if (!query.trim()) return owners;
    const q = query.trim().toLowerCase();
    return owners.filter((o) => o.siteName.toLowerCase().includes(q));
  }, [owners, query]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    []
  );

 return (
  <main className="mx-auto max-w-3xl p-4 pt-20">
    {/* 🔍 検索ボックス */}
    <input
      type="text"
      placeholder="店舗名で検索…"
      value={query}
      onChange={handleChange}
      className={clsx(
        "mb-4 w-full bg-white/50 rounded border px-3 py-2 text-sm focus:outline-none",
        isDark
          ? "text-white placeholder-gray-300 border-gray-600"
          : "text-black"
      )}
    />

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {filteredOwners.map((o) => (
        <div
          key={o.id}
          className={clsx(
            // アイコン | テキスト
            "relative grid grid-cols-[auto_1fr] items-start gap-4",
            "bg-white/50 rounded-lg border p-4 shadow transition hover:shadow-md",
            "h-48"
          )}
        >
          {/* 左: アイコン */}
          <div className="relative h-16 w-16 shrink-0">
            <Image
              src={o.iconUrl}
              alt={o.ownerName}
              fill
              className="object-contain"
              unoptimized
              sizes="64px"
            />
          </div>

          {/* 中: テキスト（右下ボタンと被らないように下余白を確保） */}
          <div className="min-w-0 flex flex-col justify-start pb-12">
            <p
              className={clsx(
                "font-bold truncate",
                isDark ? "text-white" : "text-black"
              )}
              title={o.siteName}
            >
              {o.siteName}
            </p>
            <p
              className={clsx(
                "text-sm truncate",
                isDark ? "text-gray-300" : "text-black"
              )}
              title={o.ownerName}
            >
              by&nbsp;{o.ownerName}
            </p>
          </div>

          {/* 右下固定ボタン（カードの右下に絶対配置） */}
          <Link
            href={`/community/message/${o.id}`}
            onClick={() => setPartnerSiteKey(o.id)}
            className={clsx(
              "absolute bottom-4 right-4 inline-flex h-9 items-center justify-center rounded px-3 text-sm font-medium",
              "text-white",
              isDark ? "bg-blue-500 hover:bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
            )}
            aria-label={`${o.siteName} へメッセージ`}
          >
            メッセージ
          </Link>
        </div>
      ))}
    </div>

    {/* 受信箱ボタン（ページ固定） */}
    <Link
      href="/community/message/inbox"
      aria-label="受信箱"
      className="fixed bottom-4 left-10 z-40 flex h-12 w-12 items-center justify-center rounded-full
                 bg-blue-600 text-white shadow-lg transition hover:bg-blue-700 focus:outline-none"
    >
      <Inbox className="h-6 w-6" />
    </Link>
  </main>
);

}
